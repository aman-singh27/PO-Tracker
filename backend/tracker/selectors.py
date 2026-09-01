from decimal import Decimal
from django.db.models import Q, Sum
from .models import PurchaseOrder,POLineItem, Bill, PaymentAllocation
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
