from decimal import Decimal, ROUND_HALF_UP
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q

MONEY = dict(max_digits=14, decimal_places=2)
QTY = dict(max_digits=14, decimal_places=3)
GST = dict(max_digits=5, decimal_places=4)

class Stamp(models.Model):
    created_at=models.DateTimeField(auto_now_add=True); updated_at=models.DateTimeField(auto_now=True)
    class Meta: abstract=True
class SoftDelete(models.Model):
    is_deleted=models.BooleanField(default=False)
    class Meta: abstract=True
class LegalEntity(Stamp):
    name=models.CharField(max_length=200); gstin=models.CharField(max_length=15,blank=True); state_code=models.CharField(max_length=2,blank=True); state_name=models.CharField(max_length=100,blank=True); invoice_prefix=models.CharField(max_length=10,unique=True); is_active=models.BooleanField(default=True)
class Client(Stamp):
    name=models.CharField(max_length=200); code=models.CharField(max_length=30,unique=True); default_gst_rate=models.DecimalField(default=Decimal('0'),**GST); po_number_hint=models.CharField(max_length=200,blank=True); payment_terms_days=models.SmallIntegerField(null=True,blank=True); is_active=models.BooleanField(default=True)
class Site(Stamp):
    client=models.ForeignKey(Client,on_delete=models.PROTECT,related_name='sites'); code=models.CharField(max_length=30,null=True,blank=True); name=models.CharField(max_length=200); address=models.TextField(blank=True); is_active=models.BooleanField(default=True)
    class Meta: constraints=[models.UniqueConstraint(fields=['client','code'],name='uq_site_client_code')]
class PurchaseOrder(Stamp,SoftDelete):
    class Status(models.TextChoices): ACTIVE='active'; SUPERSEDED='superseded'; CANCELLED='cancelled'
    class LifecycleStage(models.TextChoices): DRAFT='draft','Draft'; ORDERED='ordered','Ordered'; PARTIALLY_BUILT='partially_built','Partially built'; PARTIALLY_PAID='partially_paid','Partially paid'; CLOSED='closed','Closed'
    class Source(models.TextChoices): MANUAL='manual'; PASTE='paste'; PDF='pdf'; MIGRATION='migration'
    client=models.ForeignKey(Client,on_delete=models.PROTECT); site=models.ForeignKey(Site,on_delete=models.PROTECT,null=True,blank=True); po_number=models.CharField(max_length=100); po_date=models.DateField(null=True,blank=True); po_category=models.CharField(max_length=100,blank=True); quotation_number=models.CharField(max_length=100,blank=True)
    status=models.CharField(max_length=20,choices=Status.choices,default=Status.ACTIVE); lifecycle_stage=models.CharField(max_length=20,choices=LifecycleStage.choices,default=LifecycleStage.DRAFT); revision_of=models.ForeignKey('self',null=True,blank=True,related_name='revisions',on_delete=models.PROTECT); superseded_by=models.ForeignKey('self',null=True,blank=True,related_name='+',on_delete=models.PROTECT); revision_reason=models.TextField(blank=True); source=models.CharField(max_length=12,choices=Source.choices,default=Source.MANUAL); needs_review=models.BooleanField(default=False); notes=models.TextField(blank=True); created_by=models.ForeignKey(settings.AUTH_USER_MODEL,null=True,blank=True,related_name='+',on_delete=models.PROTECT); updated_by=models.ForeignKey(settings.AUTH_USER_MODEL,null=True,blank=True,related_name='+',on_delete=models.PROTECT)
    class Meta: constraints=[models.UniqueConstraint(fields=['client','po_number'],condition=Q(is_deleted=False),name='uq_po_client_number')]
class POLineItem(Stamp,SoftDelete):
    class ItemType(models.TextChoices): MATERIAL='material'; SERVICE='service'
    po=models.ForeignKey(PurchaseOrder,related_name='lines',on_delete=models.CASCADE); line_no=models.IntegerField(); description=models.TextField(); item_type=models.CharField(max_length=10,choices=ItemType.choices); qty_ordered=models.DecimalField(**QTY); unit=models.CharField(max_length=20); rate=models.DecimalField(**MONEY); amount=models.DecimalField(default=Decimal('0'),**MONEY); gst_rate=models.DecimalField(**GST); work_done_on=models.DateField(null=True,blank=True); client_approved_on=models.DateField(null=True,blank=True); short_closed_on=models.DateField(null=True,blank=True); short_closed_by=models.ForeignKey(settings.AUTH_USER_MODEL,null=True,blank=True,related_name='+',on_delete=models.PROTECT); short_close_reason=models.TextField(blank=True); interim_status=models.CharField(max_length=30,blank=True); source_sheet=models.CharField(max_length=50,blank=True); source_row=models.IntegerField(null=True,blank=True); needs_review=models.BooleanField(default=False)
    class Meta: constraints=[models.UniqueConstraint(fields=['po','line_no'],name='uq_line_po_no'),models.CheckConstraint(condition=Q(qty_ordered__gt=0),name='ck_qty_positive'),models.CheckConstraint(condition=Q(gst_rate__gte=0)&Q(gst_rate__lte=1),name='ck_gst_range')]
    def save(self,*args,**kwargs):
        self.qty_ordered=Decimal(str(self.qty_ordered)); self.rate=Decimal(str(self.rate)); self.gst_rate=Decimal(str(self.gst_rate))
        self.amount=(self.qty_ordered*self.rate).quantize(Decimal('.01'),rounding=ROUND_HALF_UP); super().save(*args,**kwargs)
class Challan(Stamp,SoftDelete):
    challan_number=models.CharField(max_length=100); challan_date=models.DateField(); site=models.ForeignKey(Site,on_delete=models.PROTECT,null=True,blank=True); delivery_source=models.CharField(max_length=200,blank=True); bill_to_name=models.CharField(max_length=200,blank=True); ship_to_name=models.CharField(max_length=200,blank=True); notes=models.TextField(blank=True); source=models.CharField(max_length=12,choices=PurchaseOrder.Source.choices,default=PurchaseOrder.Source.MANUAL); needs_review=models.BooleanField(default=False); created_by=models.ForeignKey(settings.AUTH_USER_MODEL,null=True,blank=True,related_name='+',on_delete=models.PROTECT)
    class Meta: constraints=[models.UniqueConstraint(fields=['challan_number','challan_date'],condition=Q(is_deleted=False),name='uq_challan_number_date')]
class ChallanAllocation(models.Model):
    challan=models.ForeignKey(Challan,related_name='allocations',on_delete=models.CASCADE); line_item=models.ForeignKey(POLineItem,related_name='challan_allocations',on_delete=models.PROTECT); qty=models.DecimalField(**QTY); created_at=models.DateTimeField(auto_now_add=True)
    class Meta: constraints=[models.UniqueConstraint(fields=['challan','line_item'],name='uq_challan_line'),models.CheckConstraint(condition=Q(qty__gt=0),name='ck_challan_qty')]
class Bill(Stamp,SoftDelete):
    class Ariba(models.TextChoices): NOT_REQUIRED='not_required'; PENDING='pending'; UPLOADED='uploaded'; REJECTED='rejected'; RESUBMITTED='resubmitted'
    legal_entity=models.ForeignKey(LegalEntity,on_delete=models.PROTECT); bill_number=models.CharField(max_length=100); bill_date=models.DateField(); basic_amount=models.DecimalField(default=Decimal('0'),**MONEY); gst_amount=models.DecimalField(default=Decimal('0'),**MONEY); total_amount=models.DecimalField(default=Decimal('0'),**MONEY); ariba_state=models.CharField(max_length=20,choices=Ariba.choices,default=Ariba.PENDING); ariba_uploaded_on=models.DateField(null=True,blank=True); ariba_reference=models.CharField(max_length=100,blank=True); ariba_rejection_note=models.TextField(blank=True); source=models.CharField(max_length=12,choices=PurchaseOrder.Source.choices,default=PurchaseOrder.Source.MANUAL); needs_review=models.BooleanField(default=False); created_by=models.ForeignKey(settings.AUTH_USER_MODEL,null=True,blank=True,related_name='+',on_delete=models.PROTECT)
    class Meta: constraints=[models.UniqueConstraint(fields=['legal_entity','bill_number'],condition=Q(is_deleted=False),name='uq_bill_entity_number')]
class BillAllocation(models.Model):
    bill=models.ForeignKey(Bill,related_name='allocations',on_delete=models.CASCADE); line_item=models.ForeignKey(POLineItem,related_name='bill_allocations',on_delete=models.PROTECT); qty=models.DecimalField(**QTY); rate=models.DecimalField(**MONEY); amount=models.DecimalField(**MONEY); gst_rate=models.DecimalField(**GST); gst_amount=models.DecimalField(**MONEY); total_amount=models.DecimalField(**MONEY); created_at=models.DateTimeField(auto_now_add=True)
    class Meta: constraints=[models.UniqueConstraint(fields=['bill','line_item'],name='uq_bill_line'),models.CheckConstraint(condition=Q(qty__gt=0),name='ck_bill_qty')]
class Payment(Stamp,SoftDelete):
    client=models.ForeignKey(Client,on_delete=models.PROTECT); received_on=models.DateField(); amount=models.DecimalField(**MONEY); mode=models.CharField(max_length=50,blank=True); reference=models.CharField(max_length=200,blank=True); is_advance=models.BooleanField(default=False); notes=models.TextField(blank=True); created_by=models.ForeignKey(settings.AUTH_USER_MODEL,null=True,blank=True,related_name='+',on_delete=models.PROTECT)
    class Meta: constraints=[models.CheckConstraint(condition=Q(amount__gt=0),name='ck_payment_positive')]
class PaymentAllocation(models.Model):
    class Kind(models.TextChoices): PAYMENT='payment'; TDS='tds'; RETENTION='retention'; DISCOUNT='discount'; WRITE_OFF='write_off'
    payment=models.ForeignKey(Payment,null=True,blank=True,on_delete=models.PROTECT); bill=models.ForeignKey(Bill,on_delete=models.PROTECT); amount=models.DecimalField(**MONEY); kind=models.CharField(max_length=12,choices=Kind.choices,default=Kind.PAYMENT); note=models.TextField(blank=True); created_at=models.DateTimeField(auto_now_add=True)
    class Meta: constraints=[models.CheckConstraint(condition=Q(amount__gt=0),name='ck_payment_allocation_positive')]
class AppUserRole(models.Model):
    class Role(models.TextChoices): OWNER='owner'; STAFF='staff'; ACCOUNTS='accounts'; ADMIN='admin'
    user=models.OneToOneField(settings.AUTH_USER_MODEL,on_delete=models.CASCADE,related_name='tracker_role'); role=models.CharField(max_length=20,choices=Role.choices); is_active=models.BooleanField(default=True); force_password_change=models.BooleanField(default=True); created_at=models.DateTimeField(auto_now_add=True)
class AuditLog(models.Model):
    table_name=models.CharField(max_length=60); row_id=models.BigIntegerField(); action=models.CharField(max_length=10); actor=models.ForeignKey(settings.AUTH_USER_MODEL,null=True,blank=True,on_delete=models.SET_NULL); before_json=models.JSONField(null=True,blank=True); after_json=models.JSONField(null=True,blank=True); at=models.DateTimeField(auto_now_add=True)
class ImportBatch(models.Model):
    kind=models.CharField(max_length=20); filename=models.CharField(max_length=300,blank=True); actor=models.ForeignKey(settings.AUTH_USER_MODEL,null=True,blank=True,on_delete=models.SET_NULL); started_at=models.DateTimeField(auto_now_add=True); finished_at=models.DateTimeField(null=True,blank=True); rows_total=models.IntegerField(default=0); rows_imported=models.IntegerField(default=0); rows_flagged=models.IntegerField(default=0); report_json=models.JSONField(null=True,blank=True)
class ImportReviewItem(models.Model):
    batch=models.ForeignKey(ImportBatch,related_name='review_items',on_delete=models.CASCADE); severity=models.CharField(max_length=10); reason_code=models.CharField(max_length=50); source_ref=models.CharField(max_length=200,blank=True); payload_json=models.JSONField(); resolved_at=models.DateTimeField(null=True,blank=True); resolved_by=models.ForeignKey(settings.AUTH_USER_MODEL,null=True,blank=True,on_delete=models.SET_NULL); resolution=models.TextField(blank=True)
class POAttachment(Stamp):
    po=models.ForeignKey(PurchaseOrder,related_name='attachments',on_delete=models.CASCADE); file=models.FileField(upload_to='po-attachments/%Y/%m/'); label=models.CharField(max_length=200,blank=True); uploaded_by=models.ForeignKey(settings.AUTH_USER_MODEL,null=True,blank=True,on_delete=models.SET_NULL)
class TrackerSettings(Stamp):
    stuck_after_days=models.PositiveSmallIntegerField(null=True,blank=True); overdue_after_days=models.PositiveSmallIntegerField(null=True,blank=True)
