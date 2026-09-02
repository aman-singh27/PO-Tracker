import re
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from django.core.exceptions import ValidationError
from django.db import transaction
from .models import PurchaseOrder,POLineItem,ChallanAllocation,BillAllocation,Bill,Challan,Payment,PaymentAllocation
BILL_NUMBER_RE=re.compile(r'^(?P<prefix>[A-Z]+)/(?P<serial>\d+)/(?P<y1>\d{2})-(?P<y2>\d{2})$')
def validate_bill_number(value):
    m=BILL_NUMBER_RE.match(value.strip())
    if not m: raise ValidationError('Format must be PREFIX/serial/YY-YY, e.g. UP/000038/24-25')
    if int(m['y2']) != int(m['y1'])+1: raise ValidationError('Financial year is impossible')
@transaction.atomic
def create_po(*, data, actor):
    data = data.copy(); lines=[line.copy() for line in data.pop('lines',[])]
    if not lines: raise ValidationError({'lines':'At least one line item is required.'})
    po=PurchaseOrder.objects.create(**data,created_by=actor,updated_by=actor)
    for no,line in enumerate(lines,1): POLineItem.objects.create(po=po,line_no=line.pop('line_no',no),**line)
    return po
@transaction.atomic
def revise_po(*,po,new_lines,reason,actor):
    if not reason or not reason.strip(): raise ValidationError({'reason':'Revision reason is required.'})
    if po.status != PurchaseOrder.Status.ACTIVE: raise ValidationError({'status':'Only active POs can be revised.'})
    if not new_lines: raise ValidationError({'lines':'A revision needs at least one line.'})
    successor=PurchaseOrder.objects.create(client=po.client,site=po.site,po_number=f'{po.po_number} (REV {po.revisions.count()+1})',po_date=po.po_date,po_category=po.po_category,quotation_number=po.quotation_number,revision_of=po,revision_reason=reason,created_by=actor,updated_by=actor)
    line_map={}
    for no,spec in enumerate(new_lines,1):
        spec=spec.copy(); old=spec.pop('carries_from_line_id',None); line=POLineItem.objects.create(po=successor,line_no=spec.pop('line_no',no),**spec)
        if old: line_map[int(old)]=line
    for old,new in line_map.items():
        ChallanAllocation.objects.filter(line_item_id=old).update(line_item=new)
        BillAllocation.objects.filter(line_item_id=old).update(line_item=new)
    po.status=PurchaseOrder.Status.SUPERSEDED; po.superseded_by=successor; po.updated_by=actor; po.save()
    return successor
@transaction.atomic
def short_close_line(*,line,reason,actor):
    if not reason or not reason.strip(): raise ValidationError({'reason':'Short-close reason is required.'})
    line.short_closed_on=date.today(); line.short_closed_by=actor; line.short_close_reason=reason; line.save()
    return line
def update_bill_totals(bill):
    totals=bill.allocations.aggregate(a=__import__('django').db.models.Sum('amount'),g=__import__('django').db.models.Sum('gst_amount'),t=__import__('django').db.models.Sum('total_amount'))
    bill.basic_amount=totals['a'] or Decimal('0'); bill.gst_amount=totals['g'] or Decimal('0'); bill.total_amount=totals['t'] or Decimal('0'); bill.save(update_fields=['basic_amount','gst_amount','total_amount','updated_at'])
@transaction.atomic
def allocate_bill(*,bill,allocations):
    total=Decimal('0.00')
    for spec in allocations:
        qty=Decimal(str(spec['qty'])); rate=Decimal(str(spec['rate'])); gst_rate=Decimal(str(spec['gst_rate']))
        amount=(qty*rate).quantize(Decimal('.01'),rounding=ROUND_HALF_UP); gst=(amount*gst_rate).quantize(Decimal('.01'),rounding=ROUND_HALF_UP)
        BillAllocation.objects.create(bill=bill,line_item_id=spec['line_item_id'],qty=qty,rate=rate,amount=amount,gst_rate=gst_rate,gst_amount=gst,total_amount=amount+gst); total+=amount+gst
    update_bill_totals(bill); bill.refresh_from_db()
    if bill.total_amount != total: raise ValidationError('Bill totals diverged from allocations')

@transaction.atomic
def create_challan(*, data, allocations):
    if not allocations: raise ValidationError({'allocations':'At least one allocation is required.'})
    challan=Challan.objects.create(**data)
    for allocation in allocations: ChallanAllocation.objects.create(challan=challan, line_item_id=allocation['line_item_id'], qty=allocation['qty'])
    return challan

@transaction.atomic
def create_bill(*, data, allocations, validate_number=True):
    if validate_number:
        validate_bill_number(data['bill_number'])
    if not allocations: raise ValidationError({'allocations':'At least one allocation is required.'})
    bill=Bill.objects.create(**data); allocate_bill(bill=bill, allocations=allocations)
    return bill

@transaction.atomic
def create_payment(*, data, allocations):
    payment=Payment.objects.create(**data)
    allocated=Decimal('0')
    for allocation in allocations:
        amount=Decimal(str(allocation['amount'])); allocated += amount
        PaymentAllocation.objects.create(payment=payment,bill_id=allocation['bill_id'],amount=amount,kind=allocation.get('kind','payment'),note=allocation.get('note',''))
    if allocated > payment.amount: raise ValidationError({'allocations':'Allocated amount cannot exceed payment amount.'})
    return payment
