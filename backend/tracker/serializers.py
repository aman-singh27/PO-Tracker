from decimal import Decimal
from rest_framework import serializers
from .models import Client,Site,PurchaseOrder,POLineItem,Challan,ChallanAllocation,Bill,BillAllocation,Payment,PaymentAllocation,LegalEntity
from .selectors import line_status
class LineSerializer(serializers.ModelSerializer):
    id=serializers.IntegerField(required=False)
    derived_status=serializers.SerializerMethodField()
    class Meta: model=POLineItem; fields='__all__'; read_only_fields=('amount','po','created_at','updated_at','is_deleted')
    def get_derived_status(self,obj): return line_status(obj)
class POSerializer(serializers.ModelSerializer):
    lines=LineSerializer(many=True)
    client_name=serializers.CharField(source='client.name',read_only=True)
    site_name=serializers.CharField(source='site.name',read_only=True, allow_null=True)
    total_amount=serializers.SerializerMethodField()
    amount_billed=serializers.SerializerMethodField()
    class Meta:
        model=PurchaseOrder; fields='__all__'; read_only_fields=('created_by','updated_by','is_deleted')
        # The model's conditional uniqueness includes is_deleted, a server-owned
        # field. The service/database remains the authoritative constraint.
        validators=[]
    def get_total_amount(self, obj):
        total = sum((line.amount or 0) for line in obj.lines.all())
        return str(total)
    def get_amount_billed(self, obj):
        from django.db.models import Sum
        from tracker.models import BillAllocation
        billed = BillAllocation.objects.filter(line_item__po=obj).aggregate(total=Sum('amount'))['total'] or 0
        return str(billed)
    def validate(self, attrs):
        po_date=attrs.get('po_date')
        if po_date and isinstance(po_date,str): raise serializers.ValidationError({'po_date':'Use ISO-8601 dates.'})
        return attrs
    def update(self, instance, validated_data):
        lines=validated_data.pop('lines', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if lines is not None:
            existing={line.id: line for line in instance.lines.filter(is_deleted=False)}
            next_line_no=max((line.line_no for line in existing.values()), default=0)+1
            for line_data in lines:
                line_id=line_data.pop('id', None)
                if line_id:
                    line=existing.get(line_id)
                    if not line:
                        raise serializers.ValidationError({'lines': f'Line {line_id} does not belong to this PO.'})
                    for attr, value in line_data.items():
                        if attr not in ('po', 'line_no'):
                            setattr(line, attr, value)
                    line.save()
                else:
                    POLineItem.objects.create(po=instance, line_no=line_data.pop('line_no', next_line_no), **line_data)
                    next_line_no += 1
        return instance
class SimplePOSerializer(serializers.ModelSerializer):
    client_name=serializers.CharField(source='client.name',read_only=True)
    site_name=serializers.CharField(source='site.name',read_only=True, allow_null=True)
    total_amount=serializers.SerializerMethodField()
    amount_billed=serializers.SerializerMethodField()
    class Meta: model=PurchaseOrder; fields=('id','po_number','po_date','status','lifecycle_stage','needs_review','client','client_name','site','site_name','total_amount','amount_billed','updated_at')
    def get_total_amount(self, obj):
        total = sum((line.amount or 0) for line in obj.lines.all())
        return str(total)
    def get_amount_billed(self, obj):
        from django.db.models import Sum
        from tracker.models import BillAllocation
        billed = BillAllocation.objects.filter(line_item__po=obj).aggregate(total=Sum('amount'))['total'] or 0
        return str(billed)
class ClientSerializer(serializers.ModelSerializer):
    class Meta: model=Client; fields='__all__'
class SiteSerializer(serializers.ModelSerializer):
    class Meta: model=Site; fields='__all__'

class AllocationSerializer(serializers.ModelSerializer):
    line_item_description = serializers.CharField(source='line_item.description', read_only=True)
    po_number = serializers.CharField(source='line_item.po.po_number', read_only=True)
    po_id = serializers.IntegerField(source='line_item.po.id', read_only=True)
    class Meta:
        model=ChallanAllocation; fields=('line_item','qty','line_item_description','po_number','po_id')

class ChallanSerializer(serializers.ModelSerializer):
    allocations=AllocationSerializer(many=True, required=False)
    site_name = serializers.CharField(source='site.name', read_only=True, allow_null=True)
    client_name = serializers.SerializerMethodField()
    class Meta: model=Challan; fields='__all__'; read_only_fields=('is_deleted',)
    def get_client_name(self, obj):
        first = obj.allocations.first()
        return first.line_item.po.client.name if first else ''

class BillAllocationSerializer(serializers.ModelSerializer):
    line_item_description = serializers.CharField(source='line_item.description', read_only=True)
    po_number = serializers.CharField(source='line_item.po.po_number', read_only=True)
    po_id = serializers.IntegerField(source='line_item.po.id', read_only=True)
    class Meta:
        model=BillAllocation
        fields=('line_item','qty','rate','gst_rate','amount','gst_amount','total_amount','line_item_description','po_number','po_id')
        read_only_fields=('amount','gst_amount','total_amount')

class BillSerializer(serializers.ModelSerializer):
    allocations=BillAllocationSerializer(many=True,required=False)
    legal_entity=serializers.PrimaryKeyRelatedField(queryset=LegalEntity.objects.all(), required=False)
    legal_entity_name=serializers.CharField(source='legal_entity.name', read_only=True)
    client_name=serializers.SerializerMethodField()
    po_numbers=serializers.SerializerMethodField()
    amount_paid=serializers.SerializerMethodField()
    outstanding_amount=serializers.SerializerMethodField()
    class Meta: model=Bill; fields='__all__'; read_only_fields=('basic_amount','gst_amount','total_amount','is_deleted')

    def validate(self, attrs):
        if not attrs.get('legal_entity'):
            bill_no = attrs.get('bill_number', '')
            prefix = bill_no.split('/')[0].upper()[:10] if '/' in bill_no else (bill_no[:4].upper() or 'UP')
            entity, _ = LegalEntity.objects.get_or_create(invoice_prefix=prefix, defaults={'name': f'{prefix} billing entity'})
            attrs['legal_entity'] = entity
        return attrs

    def get_client_name(self, obj):
        first = obj.allocations.first()
        return first.line_item.po.client.name if first else ''

    def get_po_numbers(self, obj):
        return list({a.line_item.po.po_number for a in obj.allocations.all() if a.line_item and a.line_item.po})

    def get_amount_paid(self, obj):
        from django.db.models import Sum
        from tracker.models import PaymentAllocation
        paid = PaymentAllocation.objects.filter(bill=obj, kind__in=['payment','tds','discount','write_off']).aggregate(total=Sum('amount'))['total'] or Decimal('0')
        return str(paid)

    def get_outstanding_amount(self, obj):
        paid = Decimal(self.get_amount_paid(obj))
        return str(max(obj.total_amount - paid, Decimal('0')))

class PaymentAllocationSerializer(serializers.ModelSerializer):
    bill_number = serializers.CharField(source='bill.bill_number', read_only=True)
    class Meta: model=PaymentAllocation; fields=('bill','amount','kind','note','bill_number')

class PaymentSerializer(serializers.ModelSerializer):
    allocations=PaymentAllocationSerializer(many=True,required=False,source='paymentallocation_set')
    client_name=serializers.CharField(source='client.name', read_only=True)
    class Meta: model=Payment; fields='__all__'; read_only_fields=('is_deleted',)
