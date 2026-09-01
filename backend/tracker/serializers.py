from rest_framework import serializers
from .models import Client,Site,PurchaseOrder,POLineItem,Challan,ChallanAllocation,Bill,BillAllocation,Payment,PaymentAllocation
from .selectors import line_status
class LineSerializer(serializers.ModelSerializer):
    derived_status=serializers.SerializerMethodField()
    class Meta: model=POLineItem; fields='__all__'; read_only_fields=('amount','po','created_at','updated_at','is_deleted')
    def get_derived_status(self,obj): return line_status(obj)
class POSerializer(serializers.ModelSerializer):
    lines=LineSerializer(many=True)
    class Meta: model=PurchaseOrder; fields='__all__'; read_only_fields=('created_by','updated_by','is_deleted')
    def validate(self, attrs):
        po_date=attrs.get('po_date')
        if po_date and isinstance(po_date,str): raise serializers.ValidationError({'po_date':'Use ISO-8601 dates.'})
        return attrs
class SimplePOSerializer(serializers.ModelSerializer):
    client_name=serializers.CharField(source='client.name',read_only=True)
    class Meta: model=PurchaseOrder; fields=('id','po_number','po_date','status','needs_review','client','client_name','site','updated_at')
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
