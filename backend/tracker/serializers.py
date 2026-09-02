from rest_framework import serializers
from .models import Client,Site,PurchaseOrder,POLineItem,Challan,ChallanAllocation,Bill,BillAllocation,Payment,PaymentAllocation
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
    class Meta:
        model=ChallanAllocation; fields=('line_item','qty')
class ChallanSerializer(serializers.ModelSerializer):
    allocations=AllocationSerializer(many=True, required=False)
    class Meta: model=Challan; fields='__all__'; read_only_fields=('is_deleted',)
class BillAllocationSerializer(serializers.ModelSerializer):
    class Meta: model=BillAllocation; fields=('line_item','qty','rate','gst_rate','amount','gst_amount','total_amount'); read_only_fields=('amount','gst_amount','total_amount')
class BillSerializer(serializers.ModelSerializer):
    allocations=BillAllocationSerializer(many=True,required=False)
    class Meta: model=Bill; fields='__all__'; read_only_fields=('basic_amount','gst_amount','total_amount','is_deleted')
class PaymentAllocationSerializer(serializers.ModelSerializer):
    class Meta: model=PaymentAllocation; fields=('bill','amount','kind','note')
class PaymentSerializer(serializers.ModelSerializer):
    allocations=PaymentAllocationSerializer(many=True,required=False,source='paymentallocation_set')
    class Meta: model=Payment; fields='__all__'; read_only_fields=('is_deleted',)
