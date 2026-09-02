"""
Phase 1.6 — MANDATORY status-derivation tests.
One test per branch in v_line_item_status. This suite IS the specification.
"""
from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model

from tracker.models import (
    AppUserRole, Bill, BillAllocation, Challan, ChallanAllocation,
    Client, LegalEntity, POLineItem, PurchaseOrder, Site,
)
from tracker.selectors import line_status
from tracker.services import create_po, short_close_line

User = get_user_model()


@pytest.fixture
def actor(db):
    user = User.objects.create_user(username="tester@test.local", password="safe-password")
    AppUserRole.objects.create(user=user, role="admin")
    return user


@pytest.fixture
def client_obj(db):
    return Client.objects.create(name="HCL Technologies", code="HCL", default_gst_rate=Decimal("0"))


@pytest.fixture
def site(client_obj):
    return Site.objects.create(client=client_obj, code="AN22", name="HCL AN22")


@pytest.fixture
def entity(db):
    return LegalEntity.objects.create(name="Test Entity", invoice_prefix="UP")


@pytest.fixture
def po(client_obj, site, actor):
    return create_po(
        data={
            "client": client_obj,
            "site": site,
            "po_number": "TEST-PO-001",
            "lines": [
                {
                    "description": "LED Downlighter 18W",
                    "item_type": "material",
                    "qty_ordered": "50",
                    "unit": "Nos",
                    "rate": "100",
                    "gst_rate": "0.1800",
                }
            ],
        },
        actor=actor,
    )


@pytest.fixture
def line(po):
    return po.lines.get()


# ---------------------------------------------------------------------------
# MANDATORY: POLineItem has NO status column (Rule D1 / AGENT.md Rule 1)
# ---------------------------------------------------------------------------
class TestNoStatusColumn:
    def test_po_line_item_has_no_status_column(self, db):
        """POLineItem must NEVER have a stored status field. Status is derived."""
        field_names = [f.name for f in POLineItem._meta.get_fields()]
        assert "status" not in field_names, (
            "POLineItem must not have a 'status' column. "
            "Status is derived from quantity ledgers."
        )


# ---------------------------------------------------------------------------
# MANDATORY: Status derivation — one test per branch
# ---------------------------------------------------------------------------
class TestStatusDerivation:
    def test_nothing_done_is_ordered(self, line):
        """Line with no allocations → ORDERED."""
        result = line_status(line)
        assert result["status"] == "ORDERED"

    def test_part_delivered(self, line, db):
        """Challan qty 30 of 50 → PART_DELIVERED."""
        challan = Challan.objects.create(challan_number="CH-001", challan_date=date.today())
        ChallanAllocation.objects.create(challan=challan, line_item=line, qty=Decimal("30"))
        result = line_status(line)
        assert result["status"] == "PART_DELIVERED"

    def test_fully_delivered(self, line, db):
        """Challan qty 50 of 50 → DELIVERED."""
        challan = Challan.objects.create(challan_number="CH-002", challan_date=date.today())
        ChallanAllocation.objects.create(challan=challan, line_item=line, qty=Decimal("50"))
        result = line_status(line)
        assert result["status"] == "DELIVERED"

    def test_work_done(self, line, db):
        """work_done_on set + delivered → WORK_DONE."""
        challan = Challan.objects.create(challan_number="CH-003", challan_date=date.today())
        ChallanAllocation.objects.create(challan=challan, line_item=line, qty=Decimal("50"))
        line.work_done_on = date.today()
        line.save()
        result = line_status(line)
        assert result["status"] == "WORK_DONE"

    def test_approved(self, line, db):
        """client_approved_on set + work done + delivered → APPROVED."""
        challan = Challan.objects.create(challan_number="CH-004", challan_date=date.today())
        ChallanAllocation.objects.create(challan=challan, line_item=line, qty=Decimal("50"))
        line.work_done_on = date.today()
        line.client_approved_on = date.today()
        line.save()
        result = line_status(line)
        assert result["status"] == "APPROVED"

    def test_part_billed(self, line, entity, db):
        """Bill qty 20 of 50 → PART_BILLED."""
        bill = Bill.objects.create(legal_entity=entity, bill_number="UP/000001/24-25", bill_date=date.today())
        BillAllocation.objects.create(
            bill=bill, line_item=line,
            qty=Decimal("20"), rate=Decimal("100"),
            amount=Decimal("2000"), gst_rate=Decimal("0.1800"),
            gst_amount=Decimal("360"), total_amount=Decimal("2360"),
        )
        result = line_status(line)
        assert result["status"] == "PART_BILLED"

    def test_fully_billed(self, line, entity, db):
        """Bill qty 50 of 50 → BILLED."""
        bill = Bill.objects.create(legal_entity=entity, bill_number="UP/000002/24-25", bill_date=date.today())
        BillAllocation.objects.create(
            bill=bill, line_item=line,
            qty=Decimal("50"), rate=Decimal("100"),
            amount=Decimal("5000"), gst_rate=Decimal("0.1800"),
            gst_amount=Decimal("900"), total_amount=Decimal("5900"),
        )
        result = line_status(line)
        assert result["status"] == "BILLED"

    def test_over_billed(self, line, entity, db):
        """Bill qty 55 of 50 → BILLED + is_over_billed = True."""
        bill = Bill.objects.create(legal_entity=entity, bill_number="UP/000003/24-25", bill_date=date.today())
        BillAllocation.objects.create(
            bill=bill, line_item=line,
            qty=Decimal("55"), rate=Decimal("100"),
            amount=Decimal("5500"), gst_rate=Decimal("0.1800"),
            gst_amount=Decimal("990"), total_amount=Decimal("6490"),
        )
        result = line_status(line)
        assert result["status"] == "BILLED"
        assert result["is_over_billed"] is True

    def test_over_delivered(self, line, db):
        """Challan qty 60 of 50 → is_over_delivered = True."""
        challan = Challan.objects.create(challan_number="CH-005", challan_date=date.today())
        ChallanAllocation.objects.create(challan=challan, line_item=line, qty=Decimal("60"))
        result = line_status(line)
        assert result["is_over_delivered"] is True

    def test_short_closed(self, line, actor, entity, db):
        """short_closed_on set, 45 of 50 billed → CLOSED_SHORT."""
        bill = Bill.objects.create(legal_entity=entity, bill_number="UP/000004/24-25", bill_date=date.today())
        BillAllocation.objects.create(
            bill=bill, line_item=line,
            qty=Decimal("45"), rate=Decimal("100"),
            amount=Decimal("4500"), gst_rate=Decimal("0.1800"),
            gst_amount=Decimal("810"), total_amount=Decimal("5310"),
        )
        short_close_line(line=line, reason="Client accepted less", actor=actor)
        line.refresh_from_db()
        result = line_status(line)
        assert result["status"] == "CLOSED_SHORT"

    def test_material_line_no_challan_billed(self, line, entity, db):
        """Material line, billed, no challan → BILLED, no error."""
        assert line.item_type == "material"
        bill = Bill.objects.create(legal_entity=entity, bill_number="UP/000005/24-25", bill_date=date.today())
        BillAllocation.objects.create(
            bill=bill, line_item=line,
            qty=Decimal("50"), rate=Decimal("100"),
            amount=Decimal("5000"), gst_rate=Decimal("0.1800"),
            gst_amount=Decimal("900"), total_amount=Decimal("5900"),
        )
        result = line_status(line)
        assert result["status"] == "BILLED"
        # No challan allocations — this is legitimate for material
        assert line.challan_allocations.count() == 0

    def test_interim_status_ignored_once_real_allocation_exists(self, line, entity, db):
        """interim_status='BILLED' plus a real allocation → derived value wins."""
        line.interim_status = "BILLED"
        line.save()
        # With no allocations, interim_status is used
        assert line_status(line)["status"] == "BILLED"
        # Add a partial bill allocation — derived value should win
        bill = Bill.objects.create(legal_entity=entity, bill_number="UP/000006/24-25", bill_date=date.today())
        BillAllocation.objects.create(
            bill=bill, line_item=line,
            qty=Decimal("20"), rate=Decimal("100"),
            amount=Decimal("2000"), gst_rate=Decimal("0.1800"),
            gst_amount=Decimal("360"), total_amount=Decimal("2360"),
        )
        result = line_status(line)
        # Derived status: 20 of 50 billed → PART_BILLED, not the interim "BILLED"
        assert result["status"] == "PART_BILLED"


# ---------------------------------------------------------------------------
# MANDATORY: Money property test — allocations always re-sum to bill total
# ---------------------------------------------------------------------------
class TestMoneyProperty:
    def test_allocations_resum_to_bill_total(self, line, entity, actor, db):
        """For any set of allocations, sum(allocation.total_amount) == bill.total_amount exactly."""
        from tracker.services import allocate_bill

        bill = Bill.objects.create(legal_entity=entity, bill_number="UP/000007/24-25", bill_date=date.today())

        # Create a second PO + line to test cross-PO billing
        po2 = create_po(
            data={
                "client": line.po.client,
                "po_number": "TEST-PO-002",
                "lines": [
                    {
                        "description": "Cable tray 200mm",
                        "item_type": "material",
                        "qty_ordered": "100",
                        "unit": "Mtr",
                        "rate": "50",
                        "gst_rate": "0.1800",
                    }
                ],
            },
            actor=actor,
        )
        line2 = po2.lines.get()

        allocate_bill(
            bill=bill,
            allocations=[
                {"line_item_id": line.id, "qty": "25", "rate": "100", "gst_rate": "0.1800"},
                {"line_item_id": line2.id, "qty": "40", "rate": "50", "gst_rate": "0.1800"},
            ],
        )
        bill.refresh_from_db()

        alloc_sum = sum(
            a.total_amount for a in bill.allocations.all()
        )
        assert alloc_sum == bill.total_amount, (
            f"Allocation sum {alloc_sum} != bill total {bill.total_amount}"
        )
        # Verify no drift — exact decimal match
        assert bill.basic_amount == Decimal("4500.00")  # 25*100 + 40*50
        assert bill.total_amount == Decimal("5310.00")  # 4500 + 810 GST
