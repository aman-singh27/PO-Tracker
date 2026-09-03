"""Regression tests for the equal-access office workflow agreed on 2026-09-02."""
from datetime import date

import pytest
from django.contrib.auth import get_user_model
from django.test import Client as TestClient
from django.core.files.uploadedfile import SimpleUploadedFile

from tracker.models import AppUserRole, Bill, Challan, Client, PurchaseOrder
from tracker.services import create_po


User = get_user_model()


@pytest.fixture
def office_user(db):
    user = User.objects.create_user(username="office@example.com", password="password-123")
    # Existing accounts retain their historical role value, but all active accounts
    # now have the same tracker permissions.
    AppUserRole.objects.create(user=user, role=AppUserRole.Role.STAFF)
    return user


@pytest.fixture
def po(db, office_user):
    client = Client.objects.create(name="HCL", code="HCL-WORKFLOW")
    return create_po(
        data={
            "client": client,
            "po_number": "HCL-PO-100",
            "po_date": date(2026, 9, 2),
            "lines": [{"description": "Supply of lights", "item_type": "material", "qty_ordered": "5", "unit": "Nos", "rate": "100", "gst_rate": "0"}],
        },
        actor=office_user,
    )


@pytest.mark.django_db
def test_any_active_user_can_edit_a_po_and_set_manual_lifecycle(office_user, po):
    client = TestClient()
    client.force_login(office_user)
    response = client.patch(
        f"/api/v1/pos/{po.id}",
        {"lifecycle_stage": "partially_built", "notes": "Material is being fitted."},
        content_type="application/json",
    )
    assert response.status_code == 200
    po.refresh_from_db()
    assert po.lifecycle_stage == PurchaseOrder.LifecycleStage.PARTIALLY_BUILT
    assert po.notes == "Material is being fitted."


@pytest.mark.django_db
def test_any_active_user_can_record_a_challan(office_user, po):
    client = TestClient()
    client.force_login(office_user)
    response = client.post(
        "/api/v1/challans",
        {"challan_number": "CH-100", "challan_date": "2026-09-02", "allocations": [{"line_item": po.lines.get().id, "qty": "2"}]},
        content_type="application/json",
    )
    assert response.status_code == 201


@pytest.mark.django_db
def test_dashboard_returns_operational_action_lists(office_user, po):
    client = TestClient()
    client.force_login(office_user)
    response = client.get("/api/v1/dashboard")
    assert response.status_code == 200
    body = response.json()
    assert set(body) >= {"metrics", "stuck_items", "overdue_bills", "ariba_backlog", "gst"}
    assert body["stuck_items"][0]["po_number"] == po.po_number


@pytest.mark.django_db
def test_export_is_an_excel_workbook_with_operational_columns(office_user, po):
    client = TestClient()
    client.force_login(office_user)
    response = client.get("/api/v1/pos/export")
    assert response.status_code == 200
    assert response["Content-Type"].startswith("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    assert response.content[:2] == b"PK"


@pytest.mark.django_db
def test_excel_style_paste_creates_a_new_po_and_carries_forward_the_header(office_user, db):
    client = TestClient()
    client.force_login(office_user)
    rows = "1\tPASTE-100\t02/09/2026\t(AN22) HCL\tMaterial\tLight fitting\t2\tNos\t100\t200\n\t\t\t\tService\tInstallation\t1\tJob\t500\t500"
    response = client.post("/api/v1/import/paste", {"client_name": "HCL", "site_name": "AN22", "tsv": rows}, content_type="application/json")
    assert response.status_code == 201
    created = PurchaseOrder.objects.get(po_number="PASTE-100")
    assert created.source == "paste"
    assert created.lines.count() == 2


@pytest.mark.django_db
def test_excel_style_paste_keeps_inline_challan_bill_and_ariba_data(office_user, db):
    client = TestClient(); client.force_login(office_user)
    cells = ["1", "PASTE-FULL-100", "02/09/2026", "(AN22) HCL", "Material", "Light fitting", "5", "Nos", "100", "500", "3", "Nos", "", "CH-17/03.09.2026", "3", "100", "300", "18", "54", "354", "INV 17 / SEPT", "04/09/2026", "Uploaded"]
    response = client.post("/api/v1/import/paste", {"client_name": "HCL", "site_name": "AN22", "tsv": "\t".join(cells)}, content_type="application/json")
    assert response.status_code == 201
    po = PurchaseOrder.objects.get(po_number="PASTE-FULL-100")
    assert Challan.objects.get(challan_number="CH-17").allocations.get().line_item.po == po
    bill = Bill.objects.get(bill_number="INV 17 / SEPT")
    assert bill.ariba_state == "uploaded"
    assert bill.allocations.get().line_item.po == po


@pytest.mark.django_db
def test_user_can_attach_source_document_to_a_po(office_user, po):
    client = TestClient(); client.force_login(office_user)
    response = client.post(f"/api/v1/pos/{po.id}/attachments", {"file": SimpleUploadedFile("po.pdf", b"%PDF-test", content_type="application/pdf")})
    assert response.status_code == 201
    assert response.json()["label"] == "po.pdf"


@pytest.mark.django_db
def test_user_can_record_delivery_from_the_po_workspace(office_user, po):
    client = TestClient(); client.force_login(office_user)
    response = client.post(f"/api/v1/pos/{po.id}/activity", {"kind":"delivery","line_item_id":po.lines.get().id,"number":"CH-11","date":"2026-09-03","qty":"2"}, content_type="application/json")
    assert response.status_code == 201


@pytest.mark.django_db
def test_user_can_record_the_bill_number_as_written_on_the_document(office_user, po):
    client = TestClient(); client.force_login(office_user)
    payload = {"kind":"bill", "line_item_id":po.lines.get().id, "number":"INV 67 / Sept", "date":"2026-09-03", "qty":"2", "rate":"100"}
    first = client.post(f"/api/v1/pos/{po.id}/activity", payload, content_type="application/json")
    assert first.status_code == 201
    bill = Bill.objects.get(bill_number="INV 67 / Sept")
    assert bill.needs_review is True
    assert bill.allocations.count() == 1

    duplicate = client.post(f"/api/v1/pos/{po.id}/activity", payload, content_type="application/json")
    assert duplicate.status_code == 400


@pytest.mark.django_db
def test_user_can_set_alert_thresholds(office_user):
    client = TestClient(); client.force_login(office_user)
    response = client.patch('/api/v1/settings', {'stuck_after_days': 21, 'overdue_after_days': 45}, content_type='application/json')
    assert response.status_code == 200
    assert response.json() == {'stuck_after_days': 21, 'overdue_after_days': 45}


@pytest.mark.django_db
def test_po_activity_lists_its_bills(office_user, po):
    client = TestClient(); client.force_login(office_user)
    response = client.get(f'/api/v1/pos/{po.id}/activity')
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.django_db
def test_ariba_state_requires_bill_from_same_po(office_user, po):
    client = TestClient(); client.force_login(office_user)
    response = client.post(f'/api/v1/pos/{po.id}/activity', {'kind':'ariba','ariba_state':'uploaded'}, content_type='application/json')
    assert response.status_code == 400


@pytest.mark.django_db
def test_dedicated_challan_workflow(office_user, po):
    client = TestClient(); client.force_login(office_user)
    line = po.lines.first()
    payload = {
        'challan_number': 'CH-DED-01',
        'challan_date': '2026-09-03',
        'delivery_source': 'Main Warehouse',
        'notes': 'Dispatched via transporter',
        'allocations': [{'line_item': line.id, 'qty': '3'}],
    }
    response = client.post('/api/v1/challans', payload, content_type='application/json')
    assert response.status_code == 201
    data = response.json()
    assert data['challan_number'] == 'CH-DED-01'
    assert len(data['allocations']) == 1
    assert data['allocations'][0]['qty'] == '3.000'
    assert data['allocations'][0]['line_item_description'] == line.description

    list_resp = client.get('/api/v1/challans')
    assert list_resp.status_code == 200
    assert any(c['challan_number'] == 'CH-DED-01' for c in list_resp.json())


@pytest.mark.django_db
def test_dedicated_bill_workflow_and_ariba_update(office_user, po):
    client = TestClient(); client.force_login(office_user)
    line = po.lines.first()
    payload = {
        'bill_number': 'INV-FLEXIBLE-99',
        'bill_date': '2026-09-03',
        'ariba_state': 'pending',
        'allocations': [{'line_item': line.id, 'qty': '2', 'rate': '100', 'gst_rate': '0.18'}],
    }
    create_resp = client.post('/api/v1/bills', payload, content_type='application/json')
    assert create_resp.status_code == 201
    bill_data = create_resp.json()
    assert bill_data['bill_number'] == 'INV-FLEXIBLE-99'
    assert bill_data['needs_review'] is True
    assert bill_data['ariba_state'] == 'pending'
    assert bill_data['client_name'] == 'HCL'

    bill_id = bill_data['id']
    patch_resp = client.patch(f'/api/v1/bills/{bill_id}', {'ariba_state': 'uploaded'}, content_type='application/json')
    assert patch_resp.status_code == 200
    assert patch_resp.json()['ariba_state'] == 'uploaded'


@pytest.mark.django_db
def test_dedicated_payment_workflow(office_user, po):
    client = TestClient(); client.force_login(office_user)
    line = po.lines.first()
    bill_payload = {
        'bill_number': 'INV-PAY-TEST',
        'bill_date': '2026-09-03',
        'allocations': [{'line_item': line.id, 'qty': '4', 'rate': '100', 'gst_rate': '0'}],
    }
    bill_resp = client.post('/api/v1/bills', bill_payload, content_type='application/json')
    assert bill_resp.status_code == 201
    bill_id = bill_resp.json()['id']
    assert bill_resp.json()['outstanding_amount'] == '400.00'

    pay_payload = {
        'client': po.client.id,
        'received_on': '2026-09-03',
        'amount': '300.00',
        'mode': 'NEFT',
        'reference': 'UTR123456',
        'allocations': [{'bill': bill_id, 'amount': '300.00', 'kind': 'payment'}],
    }
    pay_resp = client.post('/api/v1/payments', pay_payload, content_type='application/json')
    assert pay_resp.status_code == 201

    bill_detail = client.get(f'/api/v1/bills/{bill_id}').json()
    assert bill_detail['amount_paid'] == '300.00'
    assert bill_detail['outstanding_amount'] == '100.00'


@pytest.mark.django_db
def test_client_list_endpoint(office_user, po):
    client = TestClient(); client.force_login(office_user)
    resp = client.get('/api/v1/clients')
    assert resp.status_code == 200
    names = [c['name'] for c in resp.json()]
    assert 'HCL' in names
