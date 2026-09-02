from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model

from tracker.models import AppUserRole, Client, PurchaseOrder
from tracker.normalizers import normalize_date, normalize_gst, split_site
from tracker.selectors import line_status
from tracker.services import create_po, revise_po, short_close_line


@pytest.fixture
def actor(db):
    user = get_user_model().objects.create_user(username='admin@test.local', password='safe-password')
    AppUserRole.objects.create(user=user, role='admin')
    return user


@pytest.fixture
def line(actor):
    client = Client.objects.create(name='Client', code='TEST')
    po = create_po(data={'client': client, 'po_number': 'PO-1', 'lines': [{'description':'LED','item_type':'material','qty_ordered':'50','unit':'Nos','rate':'100','gst_rate':'0.18'}]}, actor=actor)
    return po.lines.get()


def test_status_branches(line):
    assert line_status(line)['status'] == 'ORDERED'
    line.interim_status = 'BILLED'; line.save()
    assert line_status(line)['status'] == 'BILLED'
    line.short_closed_on = date.today(); line.save()
    assert line_status(line)['status'] == 'CLOSED_SHORT'


def test_short_close_requires_reason(line, actor):
    with pytest.raises(Exception): short_close_line(line=line, reason='', actor=actor)
    assert short_close_line(line=line, reason='Client accepted less', actor=actor).short_closed_on


def test_revision_requires_reason_and_preserves_allocations(line, actor):
    with pytest.raises(Exception): revise_po(po=line.po, new_lines=[], reason='', actor=actor)
    successor = revise_po(po=line.po, reason='Tax amendment', actor=actor, new_lines=[{'carries_from_line_id':line.id,'description':'LED','item_type':'material','qty_ordered':'50','unit':'Nos','rate':'100','gst_rate':'0.18'}])
    line.po.refresh_from_db()
    assert line.po.status == PurchaseOrder.Status.SUPERSEDED
    assert successor.revision_of_id == line.po_id


def test_normalizers_are_conservative():
    assert normalize_date('29/07/2024')[0] == date(2024, 7, 29)
    assert normalize_date('26/09/204')[1] == 'IMPOSSIBLE_DATE'
    assert normalize_gst('18') == (Decimal('0.1800'), 'GST_RATE_OUT_OF_RANGE')
    assert split_site('( AN22 ) HCL TECHNOLOGIES LIMITED') == ('AN22', 'HCL TECHNOLOGIES LIMITED')


@pytest.mark.django_db
def test_any_active_tracker_user_has_the_same_workflow_access(client, actor, line):
    client.force_login(actor)
    response = client.post(f'/api/v1/lines/{line.id}/short-close', {'reason':'approved'}, content_type='application/json')
    assert response.status_code == 200
    actor.tracker_role.role = 'staff'; actor.tracker_role.save()
    response = client.post(f'/api/v1/lines/{line.id}/short-close', {'reason':'again'}, content_type='application/json')
    assert response.status_code == 200
