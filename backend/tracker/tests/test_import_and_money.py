"""Regression tests for the workbook importer, money hygiene and lifecycle.

These cover the defects found on 2026-09-03: the importer never created
challans or review items, money leaked float precision through aggregates,
two-digit challan dates were rejected as impossible, and a bill could not be
created without naming a legal entity explicitly.
"""
from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.test import Client as TestClient
from openpyxl import Workbook

from tracker.models import (
    AppUserRole, Bill, Challan, ChallanAllocation, Client, ImportReviewItem,
    POLineItem, PurchaseOrder,
)
from tracker.money import money_str, to_money, to_qty
from tracker.normalizers import normalize_date, parse_challan_number
from tracker.services import create_po

User = get_user_model()


# ------------------------------------------------------------------ money

def test_money_is_two_places_and_never_float():
    assert money_str(Decimal("300")) == "300.00"
    assert money_str(None) == "0.00"
    # 25843.1538461538 is the kind of value openpyxl hands back for a formula
    # cell; it must not reach the API with a float's full expansion.
    assert money_str(25843.1538461538) == "25843.15"
    assert to_money("1234.567") == Decimal("1234.57")


def test_qty_is_three_places():
    assert to_qty("12.3456") == Decimal("12.346")
    assert to_qty(None) == Decimal("0.000")


# ------------------------------------------------------------- normalizers

@pytest.mark.parametrize("raw,expected", [
    ("059/06.08.24", ("059", date(2024, 8, 6))),
    ("056/27.07.24", ("056", date(2024, 7, 27))),
    ("113/09.08.2024", ("113", date(2024, 8, 9))),
    ("70", ("70", None)),
])
def test_challan_numbers_with_two_digit_years_parse(raw, expected):
    assert parse_challan_number(raw) == expected


def test_a_three_digit_year_is_still_impossible():
    """Two-digit year support must not swallow genuinely broken dates."""
    assert normalize_date("26/09/204")[1] == "IMPOSSIBLE_DATE"
    assert normalize_date("not a date")[1] == "UNPARSEABLE_DATE"


# ---------------------------------------------------------------- importer

HEADER = [
    "S.No", "PO No.", "PO Date", "Site Address", "Type", "Material Description",
    "Qty", "Unit", "Rate", "Amount", "Delivery Qty", "Delivery UOM",
    "Delivery Source", "Delivery Challan No", "Billing Qty", "Billing Rate",
    "Billing Amount", "GST", "GST Amount", "Total Billing", "Bill No", "Bill Date",
    "Ariba",
]

FIELD_INDEX = {
    "sno": 0, "po_number": 1, "po_date": 2, "site": 3, "description": 5,
    "qty": 6, "unit": 7, "rate": 8, "amount": 9, "delivery_qty": 10,
    "delivery_source": 12, "challan_no": 13, "billing_qty": 14,
    "billing_rate": 15, "gst": 17, "bill_no": 20, "bill_date": 21,
}


def _workbook(tmp_path, rows):
    book = Workbook()
    sheet = book.active
    sheet.title = "HCL PO"
    sheet.append(HEADER)
    for row in rows:
        sheet.append(row)
    path = tmp_path / "sample.xlsx"
    book.save(path)
    return str(path)


def _row(**kw):
    row = [""] * len(HEADER)
    for name, value in kw.items():
        row[FIELD_INDEX[name]] = value
    return row


@pytest.mark.django_db
def test_import_creates_challans_and_is_idempotent(tmp_path):
    """Delivery columns must become Challan records -- they were dropped entirely."""
    from django.core.management import call_command

    path = _workbook(tmp_path, [
        _row(sno=1, po_number="8100013678", po_date="29/07/2024", site="(AN04) Noida",
             description="Supply of lights", qty="10", unit="Nos", rate="100",
             amount="1000", delivery_qty="4", delivery_source="Challan",
             challan_no="059/06.08.24"),
        _row(sno=2, description="Laying of cable", qty="5", unit="Mtr", rate="50",
             amount="250", delivery_qty="5", delivery_source="Challan",
             challan_no="059/06.08.24"),
    ])
    call_command("import_workbook", path, commit=True)

    assert PurchaseOrder.objects.count() == 1
    assert POLineItem.objects.count() == 2
    challan = Challan.objects.get()
    assert challan.challan_number == "059"
    assert challan.challan_date == date(2024, 8, 6)
    assert ChallanAllocation.objects.count() == 2
    assert ChallanAllocation.objects.get(line_item__line_no=1).qty == Decimal("4.000")

    # Re-running must not duplicate anything.
    call_command("import_workbook", path, commit=True)
    assert PurchaseOrder.objects.count() == 1
    assert POLineItem.objects.count() == 2
    assert ChallanAllocation.objects.count() == 2


@pytest.mark.django_db
def test_import_routes_uncertainty_to_the_review_queue(tmp_path):
    """needs_review was hardcoded False and no ImportReviewItem was ever written."""
    from django.core.management import call_command

    path = _workbook(tmp_path, [
        # No rate, and a GST rate entered as 18 rather than 0.18.
        _row(sno=1, po_number="PO201/24-25/00051", po_date="29/07/2024",
             description="Install AC unit", qty="2", unit="Nos", gst="18",
             billing_qty="2", billing_rate="500", bill_no="UP/000038/24-25",
             bill_date="30/07/2024"),
    ])
    call_command("import_workbook", path, commit=True)

    reasons = set(ImportReviewItem.objects.values_list("reason_code", flat=True))
    assert "MISSING_RATE" in reasons
    assert "GST_RATE_OUT_OF_RANGE" in reasons
    purchase_order = PurchaseOrder.objects.get()
    assert purchase_order.needs_review is True
    # A text-coded PO number must still be recognised as its own PO.
    assert purchase_order.po_number == "PO201/24-25/00051"


@pytest.mark.django_db
def test_import_skips_tax_summary_rows(tmp_path):
    """A "GST 18%" block footer was being imported as a zero-value line item."""
    from django.core.management import call_command

    path = _workbook(tmp_path, [
        _row(sno=1, po_number="8100099999", po_date="29/07/2024",
             description="Supply of lights", qty="10", unit="Nos", rate="100", amount="1000"),
        _row(description="GST 18%"),
        _row(description="Grand Total", amount="1180"),
    ])
    call_command("import_workbook", path, commit=True)
    assert POLineItem.objects.count() == 1


@pytest.mark.django_db
def test_dry_run_total_matches_committed_total(tmp_path, capsys):
    """The stored amount is qty x rate, so the rehearsal must report the same."""
    from django.core.management import call_command
    from django.db.models import Sum

    path = _workbook(tmp_path, [
        _row(sno=1, po_number="8100088888", po_date="29/07/2024",
             description="Supply of lights", qty="3", unit="Nos", rate="33.33",
             amount="99.99"),
    ])
    call_command("import_workbook", path, dry_run=True)
    reported = capsys.readouterr().out

    call_command("import_workbook", path, commit=True)
    stored = POLineItem.objects.aggregate(s=Sum("amount"))["s"]
    assert money_str(stored) == "99.99"
    assert "'total_value_inr': '99.99'" in reported


# --------------------------------------------------------------- lifecycle

@pytest.fixture
def office_user(db):
    user = User.objects.create_user(username="stage@example.com", password="password-123")
    AppUserRole.objects.create(user=user, role=AppUserRole.Role.STAFF)
    return user


@pytest.fixture
def po(db, office_user):
    client = Client.objects.create(name="HCL", code="HCL-STAGE")
    return create_po(
        data={
            "client": client, "po_number": "HCL-PO-STAGE", "po_date": date(2026, 9, 2),
            "lines": [{"description": "Supply of lights", "item_type": "material",
                       "qty_ordered": "5", "unit": "Nos", "rate": "100", "gst_rate": "0"}],
        },
        actor=office_user,
    )


@pytest.mark.parametrize("stage", [
    "draft", "ordered", "partially_built", "partially_billed",
    "partially_paid", "closed", "on_hold", "cancelled",
])
@pytest.mark.django_db
def test_every_lifecycle_stage_can_be_set(office_user, po, stage):
    client = TestClient()
    client.force_login(office_user)
    response = client.patch(
        f"/api/v1/pos/{po.id}", {"lifecycle_stage": stage}, content_type="application/json",
    )
    assert response.status_code == 200
    po.refresh_from_db()
    assert po.lifecycle_stage == stage


@pytest.mark.django_db
def test_a_bill_derives_its_legal_entity_from_the_bill_number(office_user, po):
    """DRF's generated unique-together validator used to force legal_entity."""
    client = TestClient()
    client.force_login(office_user)
    line = po.lines.first()
    response = client.post(
        "/api/v1/bills",
        {"bill_number": "HR/000038/24-25", "bill_date": "2026-09-03",
         "allocations": [{"line_item": line.id, "qty": "2", "rate": "100", "gst_rate": "0.18"}]},
        content_type="application/json",
    )
    assert response.status_code == 201
    assert Bill.objects.get().legal_entity.invoice_prefix == "HR"
    assert response.json()["outstanding_amount"] == "236.00"


@pytest.mark.django_db
def test_a_duplicate_bill_number_is_rejected_cleanly(office_user, po):
    client = TestClient()
    client.force_login(office_user)
    line = po.lines.first()
    payload = {
        "bill_number": "HR/000039/24-25", "bill_date": "2026-09-03",
        "allocations": [{"line_item": line.id, "qty": "1", "rate": "100", "gst_rate": "0"}],
    }
    assert client.post("/api/v1/bills", payload, content_type="application/json").status_code == 201
    second = client.post("/api/v1/bills", payload, content_type="application/json")
    assert second.status_code == 400
    assert "bill_number" in second.json()
