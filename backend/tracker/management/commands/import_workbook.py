"""Conservative workbook importer.

The command intentionally treats dry runs as read-only and creates review items for
ambiguous legacy values instead of inventing financial facts.
"""
from collections import Counter
from decimal import Decimal, InvalidOperation
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from openpyxl import load_workbook

from tracker.models import Client, ImportBatch, ImportReviewItem, POLineItem, PurchaseOrder
from tracker.normalizers import classify_item_type, is_revision_marker, normalize_date, normalize_gst


class Command(BaseCommand):
    help = "Import a legacy workbook. --dry-run is read-only; --commit is atomic and idempotent."

    def add_arguments(self, parser):
        parser.add_argument("workbook")
        mode = parser.add_mutually_exclusive_group(required=True)
        mode.add_argument("--dry-run", action="store_true")
        mode.add_argument("--commit", action="store_true")

    def handle(self, *args, **options):
        path = Path(options["workbook"])
        if not path.is_file():
            raise CommandError(f"Workbook not found: {path}")
        records, flags = self._read(path)
        report = {"purchase_orders": len(records), "line_items": sum(len(r["lines"]) for r in records), "review_counts": dict(flags)}
        if options["dry_run"]:
            self.stdout.write(str(report))
            return
        with transaction.atomic():
            batch = ImportBatch.objects.create(kind="excel", filename=path.name, rows_total=report["line_items"], report_json=report)
            imported = 0
            for record in records:
                client, _ = Client.objects.get_or_create(code=record["client_code"], defaults={"name": record["client_name"]})
                po, created = PurchaseOrder.objects.get_or_create(client=client, po_number=record["po_number"], is_deleted=False, defaults={"po_date": record["po_date"], "source": "migration", "needs_review": bool(record["flags"])})
                if not created:
                    continue
                for number, line in enumerate(record["lines"], 1):
                    POLineItem.objects.create(po=po, line_no=number, **line)
                    imported += 1
                for reason, payload in record["flags"]:
                    ImportReviewItem.objects.create(batch=batch, severity="warning", reason_code=reason, source_ref=payload.get("source_ref", ""), payload_json=payload)
            batch.rows_imported = imported; batch.rows_flagged = ImportReviewItem.objects.filter(batch=batch).count(); batch.finished_at = timezone.now(); batch.save()
        self.stdout.write(self.style.SUCCESS(str(report)))

    def _read(self, path):
        workbook = load_workbook(path, read_only=True, data_only=True)
        records, flags, seen = [], Counter(), set()
        for sheet in workbook.worksheets:
            headers = None; current = None
            for row_no, raw in enumerate(sheet.iter_rows(values_only=True), 1):
                values = ["" if value is None else str(value).strip() for value in raw]
                normalized = [value.lower().replace(" ", "") for value in values]
                if not headers and any("po" in value and ("no" in value or "number" in value) for value in normalized):
                    headers = normalized; continue
                if not headers or not any(values):
                    continue
                def val(*terms):
                    for index, header in enumerate(headers):
                        if all(term in header for term in terms): return values[index] if index < len(values) else ""
                    return ""
                po_number = val("po", "no") or val("po", "number")
                description = val("description") or val("particular") or val("item")
                if any(token in " ".join(values).lower() for token in ("grand total", "gst @", "sub total")):
                    continue
                if po_number:
                    if is_revision_marker(po_number):
                        flags["PO_NUMBER_IS_REVISION_MARKER"] += 1; continue
                    key = (sheet.title, po_number)
                    if key in seen: continue
                    seen.add(key)
                    client_code = sheet.title.upper()[:30].replace(" ", "-")
                    parsed_date, reason = normalize_date(val("po", "date"))
                    record_flags = []
                    if reason: record_flags.append((reason, {"source_ref": f"{sheet.title}!A{row_no}", "value": val("po", "date")})); flags[reason] += 1
                    current = {"po_number": po_number, "po_date": parsed_date, "client_code": client_code, "client_name": sheet.title, "lines": [], "flags": record_flags}
                    records.append(current)
                if not current or not description:
                    continue
                try: qty = Decimal(val("qty") or "1"); rate = Decimal((val("rate") or val("amount") or "0").replace(",", ""))
                except InvalidOperation: continue
                gst, reason = normalize_gst(val("gst") or "0")
                line = {"description": description, "item_type": classify_item_type(description), "qty_ordered": qty, "unit": val("unit") or "Nos", "rate": rate, "gst_rate": gst or Decimal("0"), "needs_review": bool(reason), "source_sheet": sheet.title, "source_row": row_no}
                current["lines"].append(line)
                if reason: current["flags"].append((reason, {"source_ref": f"{sheet.title}!A{row_no}"})); flags[reason] += 1
        return records, flags
