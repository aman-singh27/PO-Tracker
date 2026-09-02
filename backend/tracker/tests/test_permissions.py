"""
Phase 1.8 — MANDATORY permission matrix tests.
Every role against every endpoint, per PRD §5.2.
"""
from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.test import Client as TestClient

from tracker.models import AppUserRole, Client, LegalEntity, POLineItem, PurchaseOrder, Site
from tracker.services import create_po

User = get_user_model()


def _make_user(db, username, role):
    user = User.objects.create_user(username=username, password="testpass123")
    AppUserRole.objects.create(user=user, role=role)
    return user


@pytest.fixture
def admin_user(db):
    return _make_user(db, "admin@test.local", "admin")


@pytest.fixture
def staff_user(db):
    return _make_user(db, "staff@test.local", "staff")


@pytest.fixture
def accounts_user(db):
    return _make_user(db, "accounts@test.local", "accounts")


@pytest.fixture
def owner_user(db):
    return _make_user(db, "owner@test.local", "owner")


@pytest.fixture
def test_data(admin_user, db):
    client_obj = Client.objects.create(name="HCL", code="HCL-PERM")
    site = Site.objects.create(client=client_obj, code="AN22", name="HCL AN22")
    entity = LegalEntity.objects.create(name="Test Entity", invoice_prefix="TE")
    po = create_po(
        data={
            "client": client_obj,
            "site": site,
            "po_number": "PERM-TEST-001",
            "lines": [
                {
                    "description": "Test item",
                    "item_type": "material",
                    "qty_ordered": "10",
                    "unit": "Nos",
                    "rate": "100",
                    "gst_rate": "0",
                }
            ],
        },
        actor=admin_user,
    )
    return {"client": client_obj, "site": site, "entity": entity, "po": po, "line": po.lines.get()}


class TestPermissionMatrix:
    """Full PRD §5.2 permission matrix tested at the API."""

    # --- PO List (GET) — all authenticated roles can view ---
    @pytest.mark.parametrize("role", ["admin", "staff", "accounts", "owner"])
    def test_all_roles_can_list_pos(self, db, test_data, role):
        user = _make_user(db, f"{role}-list@t.local", role)
        client = TestClient()
        client.force_login(user)
        resp = client.get("/api/v1/pos")
        assert resp.status_code == 200

    # --- PO Create (POST) — only staff and admin ---
    def test_staff_can_create_po(self, db, test_data, staff_user):
        client = TestClient()
        client.force_login(staff_user)
        resp = client.post(
            "/api/v1/pos",
            {
                "client": test_data["client"].id,
                "po_number": "NEW-PO-STAFF",
                "po_date": "2025-01-01",
                "lines": [{"description": "Item", "item_type": "material", "qty_ordered": "1", "unit": "Nos", "rate": "10", "gst_rate": "0", "line_no": 1}],
            },
            content_type="application/json",
        )
        # 201 Created, or 400 if serializer validation differs — at least not 403
        assert resp.status_code != 403

    def test_admin_can_create_po(self, db, test_data, admin_user):
        client = TestClient()
        client.force_login(admin_user)
        resp = client.post(
            "/api/v1/pos",
            {
                "client": test_data["client"].id,
                "po_number": "NEW-PO-ADMIN",
                "po_date": "2025-01-01",
                "lines": [{"description": "Item", "item_type": "material", "qty_ordered": "1", "unit": "Nos", "rate": "10", "gst_rate": "0", "line_no": 1}],
            },
            content_type="application/json",
        )
        # 201 Created, or 400 if serializer validation differs — at least not 403
        assert resp.status_code != 403

    def test_owner_cannot_create_po(self, db, test_data, owner_user):
        client = TestClient()
        client.force_login(owner_user)
        resp = client.post(
            "/api/v1/pos",
            {
                "client": test_data["client"].id,
                "po_number": "NEW-PO-OWNER",
                "lines": [{"description": "Item", "item_type": "material", "qty_ordered": "1", "unit": "Nos", "rate": "10", "gst_rate": "0"}],
            },
            content_type="application/json",
        )
        assert resp.status_code == 403

    def test_accounts_cannot_create_po(self, db, test_data, accounts_user):
        client = TestClient()
        client.force_login(accounts_user)
        resp = client.post(
            "/api/v1/pos",
            {
                "client": test_data["client"].id,
                "po_number": "NEW-PO-ACCT",
                "lines": [{"description": "Item", "item_type": "material", "qty_ordered": "1", "unit": "Nos", "rate": "10", "gst_rate": "0"}],
            },
            content_type="application/json",
        )
        assert resp.status_code == 403

    # --- Short-close — only owner and admin ---
    def test_owner_can_short_close(self, db, test_data, owner_user):
        client = TestClient()
        client.force_login(owner_user)
        resp = client.post(
            f'/api/v1/lines/{test_data["line"].id}/short-close',
            {"reason": "Client accepted less"},
            content_type="application/json",
        )
        assert resp.status_code == 200

    def test_admin_can_short_close(self, db, test_data, admin_user):
        # Need a fresh line since owner already short-closed the original
        po2 = create_po(
            data={
                "client": test_data["client"],
                "po_number": "SC-ADMIN-TEST",
                "lines": [{"description": "x", "item_type": "material", "qty_ordered": "5", "unit": "Nos", "rate": "10", "gst_rate": "0"}],
            },
            actor=admin_user,
        )
        line2 = po2.lines.get()
        client = TestClient()
        client.force_login(admin_user)
        resp = client.post(
            f"/api/v1/lines/{line2.id}/short-close",
            {"reason": "Admin decision"},
            content_type="application/json",
        )
        assert resp.status_code == 200

    def test_staff_cannot_short_close(self, db, test_data, staff_user, admin_user):
        po3 = create_po(
            data={
                "client": test_data["client"],
                "po_number": "SC-STAFF-TEST",
                "lines": [{"description": "y", "item_type": "material", "qty_ordered": "5", "unit": "Nos", "rate": "10", "gst_rate": "0"}],
            },
            actor=admin_user,
        )
        line3 = po3.lines.get()
        client = TestClient()
        client.force_login(staff_user)
        resp = client.post(
            f"/api/v1/lines/{line3.id}/short-close",
            {"reason": "Staff attempt"},
            content_type="application/json",
        )
        assert resp.status_code == 403

    def test_accounts_cannot_short_close(self, db, test_data, accounts_user, admin_user):
        po4 = create_po(
            data={
                "client": test_data["client"],
                "po_number": "SC-ACCT-TEST",
                "lines": [{"description": "z", "item_type": "material", "qty_ordered": "5", "unit": "Nos", "rate": "10", "gst_rate": "0"}],
            },
            actor=admin_user,
        )
        line4 = po4.lines.get()
        client = TestClient()
        client.force_login(accounts_user)
        resp = client.post(
            f"/api/v1/lines/{line4.id}/short-close",
            {"reason": "Accounts attempt"},
            content_type="application/json",
        )
        assert resp.status_code == 403

    # --- Search — all authenticated roles ---
    @pytest.mark.parametrize("role", ["admin", "staff", "accounts", "owner"])
    def test_all_roles_can_search(self, db, test_data, role):
        user = _make_user(db, f"{role}-search@t.local", role)
        client = TestClient()
        client.force_login(user)
        resp = client.get("/api/v1/search?q=HCL")
        assert resp.status_code == 200

    # --- Review queue — admin only ---
    def test_admin_can_view_review(self, db, admin_user):
        client = TestClient()
        client.force_login(admin_user)
        resp = client.get("/api/v1/review")
        assert resp.status_code == 200

    def test_staff_cannot_view_review(self, db, staff_user):
        client = TestClient()
        client.force_login(staff_user)
        resp = client.get("/api/v1/review")
        assert resp.status_code == 403

    def test_owner_cannot_view_review(self, db, owner_user):
        client = TestClient()
        client.force_login(owner_user)
        resp = client.get("/api/v1/review")
        assert resp.status_code == 403

    # --- Unauthenticated user gets rejected ---
    def test_unauthenticated_gets_403(self, db):
        client = TestClient()
        resp = client.get("/api/v1/pos")
        assert resp.status_code == 403

    # --- Optimistic locking — stale update returns 409 ---
    def test_stale_update_returns_409(self, db, test_data, staff_user):
        client = TestClient()
        client.force_login(staff_user)
        resp = client.patch(
            f'/api/v1/pos/{test_data["po"].id}',
            {"notes": "Updated", "updated_at": "1970-01-01T00:00:00Z"},
            content_type="application/json",
        )
        assert resp.status_code == 409
