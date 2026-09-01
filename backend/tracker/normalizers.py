"""Pure, deliberately conservative helpers used by workbook and fast-entry imports."""
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
import re

from .services import validate_bill_number


def normalize_date(value):
    """Return (date-or-None, reason-code-or-None); never guesses an invalid date."""
    if value in (None, ""):
        return None, None
    if isinstance(value, datetime):
        return value.date(), None
    if isinstance(value, date):
        return value, None
    text = str(value).strip()
    for fmt in ("%d/%m/%Y", "%d.%m.%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(text, fmt).date(), None
        except ValueError:
            pass
    if re.fullmatch(r"\d{1,2}[/.]\d{1,2}[/.]\d{1,3}", text):
        return None, "IMPOSSIBLE_DATE"
    return None, "UNPARSEABLE_DATE"


def normalize_gst(value):
    try:
        rate = Decimal(str(value).strip())
    except (InvalidOperation, AttributeError):
        return None, "GST_RATE_OUT_OF_RANGE"
    if rate > 1:
        # Preserve the importable intended rate, but always surface the legacy defect.
        return (rate / Decimal("100")).quantize(Decimal(".0001")), "GST_RATE_OUT_OF_RANGE"
    if rate < 0:
        return None, "GST_RATE_OUT_OF_RANGE"
    return rate.quantize(Decimal(".0001")), None


def split_site(value):
    text = str(value or "").strip()
    match = re.match(r"^\(\s*([A-Za-z0-9-]+)\s*\)\s*(.*)$", text)
    return (match.group(1).upper(), match.group(2).strip()) if match else (None, text)


def parse_challan_number(value):
    text = str(value or "").strip()
    match = re.match(r"^(.*?)/(\d{1,2}\.\d{1,2}\.\d{2,4})$", text)
    if not match:
        return text, None
    parsed, reason = normalize_date(match.group(2))
    return match.group(1).strip(), parsed if not reason else None


def classify_item_type(description):
    text = str(description or "").lower()
    return "service" if any(word in text for word in ("install", "labour", "labor", "work", "commission")) else "material"


def is_revision_marker(value):
    return bool(re.search(r"\b(po\s+)?(changed|amended|revised|cancelled)\b", str(value or ""), re.I))


def bill_number_reason(value):
    try:
        validate_bill_number(str(value))
    except Exception:
        return "MALFORMED_BILL_NUMBER"
    return None
