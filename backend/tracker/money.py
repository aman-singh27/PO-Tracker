"""Money helpers.

Invariant: every rupee value that crosses the API is a string with exactly two
decimal places, and is never routed through a float on the way there.

Aggregates are the reason this exists. ``Sum()`` over a DecimalField does not
preserve scale on every backend -- SQLite in particular hands back ``300``
where PostgreSQL hands back ``300.00`` -- so a bare ``str()`` on an aggregate
leaks the backend's formatting into the API contract.
"""
from decimal import Decimal, ROUND_HALF_UP

TWO_PLACES = Decimal("0.01")
ZERO = Decimal("0.00")


def to_money(value):
    """Coerce a numeric-ish value to a 2dp Decimal, via str() rather than float()."""
    if value is None or value == "":
        return ZERO
    if not isinstance(value, Decimal):
        value = Decimal(str(value))
    return value.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def money_str(value):
    """Render a money value for the API."""
    return str(to_money(value))


THREE_PLACES = Decimal("0.001")


def to_qty(value):
    """Quantity counterpart of to_money -- 3dp, matching the QTY field spec.

    Lives here because it guards the same hazard: openpyxl returns numeric cells
    as floats, so anything read from a workbook must be quantized before it
    reaches a DecimalField.
    """
    if value is None or value == "":
        return Decimal("0.000")
    if not isinstance(value, Decimal):
        value = Decimal(str(value))
    return value.quantize(THREE_PLACES, rounding=ROUND_HALF_UP)
