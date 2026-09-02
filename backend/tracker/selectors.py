from datetime import date
from decimal import Decimal
from django.db.models import Q, Sum
from .models import PurchaseOrder,POLineItem, Bill, PaymentAllocation, TrackerSettings
def line_status(line):
    delivered=line.challan_allocations.aggregate(s=Sum('qty'))['s'] or Decimal('0')
    billed=line.bill_allocations.aggregate(s=Sum('qty'))['s'] or Decimal('0')
    if line.short_closed_on: status='CLOSED_SHORT'
    elif billed >= line.qty_ordered: status='BILLED'
    elif billed > 0: status='PART_BILLED'
    elif line.client_approved_on: status='APPROVED'
    elif line.work_done_on: status='WORK_DONE'
    elif delivered >= line.qty_ordered: status='DELIVERED'
    elif delivered > 0: status='PART_DELIVERED'
    elif line.interim_status: status=line.interim_status
    else: status='ORDERED'
    return {'status':status,'qty_ordered':line.qty_ordered,'qty_delivered':delivered,'qty_billed':billed,'is_over_billed':billed>line.qty_ordered,'is_over_delivered':delivered>line.qty_ordered}
def search(term,limit=50):
    term=(term or '').strip()
    if not term:return PurchaseOrder.objects.none()
    return PurchaseOrder.objects.filter(Q(po_number__icontains=term)|Q(client__name__icontains=term)|Q(site__code__iexact=term)|Q(site__name__icontains=term)|Q(lines__description__icontains=term)|Q(lines__bill_allocations__bill__bill_number__icontains=term)|Q(lines__challan_allocations__challan__challan_number__icontains=term),is_deleted=False).distinct()[:limit]

def po_totals(po):
    lines=po.lines.filter(is_deleted=False)
    ordered=sum((line.amount for line in lines), Decimal('0'))
    billed=sum((allocation.total_amount for line in lines for allocation in line.bill_allocations.all()), Decimal('0'))
    paid=sum((allocation.amount for allocation in PaymentAllocation.objects.filter(bill__allocations__line_item__po=po, kind__in=['payment','tds','discount','write_off']).distinct()), Decimal('0'))
    return {'amount_ordered':ordered,'amount_billed':billed,'amount_paid':paid,'outstanding_amount':billed-paid}

def pending_lines():
    return [line for line in POLineItem.objects.select_related('po','po__client','po__site').filter(is_deleted=False,po__is_deleted=False,po__status='active',po__needs_review=False) if line_status(line)['status'] not in ('BILLED','CLOSED_SHORT')]


def dashboard_snapshot():
    """Return actionable operational data, without inventing an ageing threshold."""
    today = date.today()
    settings=TrackerSettings.objects.first()
    lines = pending_lines()
    stuck_items = []
    for line in lines:
        facts = line_status(line)
        days_waiting=max((today - line.po.po_date).days, 0) if line.po.po_date else None
        if settings and settings.stuck_after_days is not None and (days_waiting is None or days_waiting < settings.stuck_after_days):
            continue
        stuck_items.append({
            'line_id': line.id, 'po_id': line.po_id, 'po_number': line.po.po_number,
            'client': line.po.client.name, 'site': line.po.site.name if line.po.site else '',
            'description': line.description, 'status': facts['status'],
            'amount': str(line.amount), 'days_waiting': days_waiting,
        })
    bills = Bill.objects.filter(is_deleted=False, needs_review=False).select_related('legal_entity').prefetch_related('allocations__line_item__po__client')
    overdue_bills, ariba_backlog = [], []
    billed_total = Decimal('0')
    gst_total = Decimal('0')
    outstanding_total = Decimal('0')
    for bill in bills:
        settled = PaymentAllocation.objects.filter(bill=bill, kind__in=['payment', 'tds', 'discount', 'write_off']).aggregate(total=Sum('amount'))['total'] or Decimal('0')
        outstanding = bill.total_amount - settled
        client = next((a.line_item.po.client for a in bill.allocations.all()), None)
        record = {'bill_id': bill.id, 'bill_number': bill.bill_number, 'bill_date': bill.bill_date, 'client': client.name if client else '', 'total_amount': str(bill.total_amount), 'outstanding_amount': str(outstanding), 'age_days': max((today - bill.bill_date).days, 0)}
        billed_total += bill.basic_amount
        gst_total += bill.gst_amount
        outstanding_total += outstanding
        threshold=(client.payment_terms_days if client and client.payment_terms_days is not None else (settings.overdue_after_days if settings else None))
        if outstanding > 0 and threshold is not None and record['age_days'] > threshold:
            overdue_bills.append(record)
        if bill.ariba_state in (Bill.Ariba.PENDING, Bill.Ariba.REJECTED):
            ariba_backlog.append({**record, 'ariba_state': bill.ariba_state, 'ariba_uploaded_on': bill.ariba_uploaded_on})
    return {
        'metrics': {'pending_items': len(stuck_items), 'outstanding_amount': str(outstanding_total), 'overdue_bill_count': len(overdue_bills), 'ariba_backlog_count': len(ariba_backlog)},
        'stuck_items': sorted(stuck_items, key=lambda row: row['days_waiting'] or -1, reverse=True),
        'overdue_bills': sorted(overdue_bills, key=lambda row: row['age_days'], reverse=True),
        'ariba_backlog': sorted(ariba_backlog, key=lambda row: row['age_days'], reverse=True),
        'gst': {'basic_billed': str(billed_total), 'gst_billed': str(gst_total), 'gross_billed': str(billed_total + gst_total)},
    }
