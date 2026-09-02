import csv, io
from datetime import date
from django.contrib.auth import authenticate, login, logout, get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from .models import PurchaseOrder,POLineItem,ImportReviewItem,Challan,Bill,Payment
from django.views.decorators.csrf import csrf_exempt
from .permissions import IsTrackerUser,CanEditPO,CanShortClose,CanRecordMoney,IsAdmin,get_role
from .serializers import POSerializer,SimplePOSerializer,LineSerializer,ChallanSerializer,BillSerializer,PaymentSerializer
from .services import create_po,revise_po,short_close_line,create_challan,create_bill,create_payment
from .selectors import search, line_status, po_totals, pending_lines

def _validation(exc): return Response(getattr(exc,'message_dict',{'detail':exc.messages if hasattr(exc,'messages') else str(exc)}),status=400)
@api_view(['POST'])
@permission_classes([AllowAny])
@csrf_exempt
def login_view(request):
    user=authenticate(request,username=request.data.get('email',''),password=request.data.get('password',''))
    if not user: return Response({'detail':'Invalid email or password.'},status=401)
    if not get_role(user): return Response({'detail':'This account has no tracker role.'},status=403)
    login(request,user); return Response({'user':{'id':user.id,'email':user.email,'name':user.get_full_name()},'role':get_role(user),'force_password_change':user.tracker_role.force_password_change})
@api_view(['POST'])
def logout_view(request): logout(request); return Response(status=204)
@api_view(['GET'])
@permission_classes([IsTrackerUser])
def me_view(request):
    u=request.user; return Response({'user':{'id':u.id,'email':u.email,'name':u.get_full_name()},'role':get_role(u),'force_password_change':u.tracker_role.force_password_change})
@api_view(['POST'])
@permission_classes([IsTrackerUser])
def change_password(request):
    password=request.data.get('password','')
    if len(password)<8:return Response({'password':['Must be at least 8 characters.']},status=400)
    request.user.set_password(password); request.user.save(); request.user.tracker_role.force_password_change=False; request.user.tracker_role.save(update_fields=['force_password_change']); return Response(status=204)
@api_view(['POST'])
@permission_classes([IsAdmin])
def reset_password(request,user_id):
    password=request.data.get('password','')
    if len(password)<8:return Response({'password':['Must be at least 8 characters.']},status=400)
    user=get_object_or_404(get_user_model(),pk=user_id); user.set_password(password); user.save(); user.tracker_role.force_password_change=True; user.tracker_role.save(); return Response(status=204)
@api_view(['GET','POST'])
@permission_classes([IsTrackerUser])
def po_list(request):
    if request.method=='GET':
        qs=PurchaseOrder.objects.filter(is_deleted=False).select_related('client','site').order_by('-updated_at')
        for field in ('client','site','status','needs_review'):
            if request.query_params.get(field) is not None: qs=qs.filter(**{field:request.query_params[field]})
        return Response(SimplePOSerializer(qs,many=True).data)
    if get_role(request.user) not in ('staff','admin'): return Response({'detail':'Staff or Admin role required.'},status=403)
    serializer=POSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    try: po=create_po(data=dict(serializer.validated_data),actor=request.user)
    except DjangoValidationError as exc: return _validation(exc)
    return Response(POSerializer(po).data,status=201)
@api_view(['GET','PATCH','DELETE'])
@permission_classes([IsTrackerUser])
def po_detail(request,pk):
    po=get_object_or_404(PurchaseOrder.objects.prefetch_related('lines__challan_allocations','lines__bill_allocations'),pk=pk,is_deleted=False)
    if request.method=='GET':
        data=POSerializer(po).data; data['totals']=po_totals(po); return Response(data)
    if get_role(request.user) not in ('staff','admin'):return Response({'detail':'Staff or Admin role required.'},status=403)
    if request.method=='DELETE': po.is_deleted=True; po.updated_by=request.user; po.save(); return Response(status=204)
    if request.data.get('updated_at') and request.data['updated_at'] != po.updated_at.isoformat().replace('+00:00','Z'): return Response({'detail':'This PO was updated by another user. Reload and retry.'},status=409)
    serializer=POSerializer(po,data=request.data,partial=True); serializer.is_valid(raise_exception=True); serializer.save(updated_by=request.user); return Response(serializer.data)
@api_view(['POST'])
@permission_classes([CanEditPO])
def po_revise(request,pk):
    po=get_object_or_404(PurchaseOrder,pk=pk,is_deleted=False)
    try: successor=revise_po(po=po,new_lines=request.data.get('lines',[]),reason=request.data.get('reason',''),actor=request.user)
    except DjangoValidationError as exc:return _validation(exc)
    return Response(POSerializer(successor).data,status=201)
@api_view(['POST'])
@permission_classes([CanEditPO])
def po_cancel(request,pk):
    po=get_object_or_404(PurchaseOrder,pk=pk,is_deleted=False); po.status=PurchaseOrder.Status.CANCELLED; po.notes=request.data.get('reason',''); po.updated_by=request.user; po.save(); return Response(POSerializer(po).data)
@api_view(['POST'])
@permission_classes([CanShortClose])
def short_close(request,pk):
    try: line=short_close_line(line=get_object_or_404(POLineItem,pk=pk,is_deleted=False),reason=request.data.get('reason',''),actor=request.user)
    except DjangoValidationError as exc:return _validation(exc)
    return Response({'id':line.id,'short_closed_on':line.short_closed_on,'short_close_reason':line.short_close_reason})
@api_view(['GET'])
@permission_classes([IsTrackerUser])
def search_view(request): return Response(SimplePOSerializer(search(request.query_params.get('q','')),many=True).data)
@api_view(['GET'])
@permission_classes([IsTrackerUser])
def pending_view(request):
    return Response([{'id':line.id,'po_id':line.po_id,'po_number':line.po.po_number,'client':line.po.client.name,'description':line.description,**line_status(line)} for line in pending_lines()])
@api_view(['GET'])
@permission_classes([IsTrackerUser])
def po_export(request):
    response=HttpResponse(content_type='text/csv'); response['Content-Disposition']='attachment; filename="purchase-orders.csv"'
    writer=csv.writer(response); writer.writerow(['PO number','PO date','Client','Site','Line','Description','Item type','Qty ordered','Rate','Amount','GST rate','Status','Qty delivered','Qty billed'])
    for po in PurchaseOrder.objects.filter(is_deleted=False).select_related('client','site').prefetch_related('lines__challan_allocations','lines__bill_allocations'):
        for line in po.lines.filter(is_deleted=False):
            derived=line_status(line); writer.writerow([po.po_number,po.po_date,po.client.name,po.site.code if po.site else '',line.line_no,line.description,line.item_type,line.qty_ordered,line.rate,line.amount,line.gst_rate,derived['status'],derived['qty_delivered'],derived['qty_billed']])
    return response
@api_view(['POST'])
@permission_classes([CanEditPO])
def mark_work_done(request,pk):
    line=get_object_or_404(POLineItem,pk=pk,is_deleted=False); line.work_done_on=request.data.get('work_done_on') or date.today(); line.save(update_fields=['work_done_on','updated_at']); return Response(LineSerializer(line).data)
@api_view(['POST'])
@permission_classes([CanEditPO])
def mark_approved(request,pk):
    line=get_object_or_404(POLineItem,pk=pk,is_deleted=False)
    if not line.work_done_on:return Response({'detail':'Work must be marked done before approval.'},status=400)
    line.client_approved_on=request.data.get('client_approved_on') or date.today(); line.save(update_fields=['client_approved_on','updated_at']); return Response(LineSerializer(line).data)
@api_view(['GET','POST'])
@permission_classes([CanEditPO])
def challan_list(request):
    if request.method=='GET':return Response(ChallanSerializer(Challan.objects.filter(is_deleted=False).prefetch_related('allocations'),many=True).data)
    serializer=ChallanSerializer(data=request.data); serializer.is_valid(raise_exception=True); data=serializer.validated_data; allocations=data.pop('allocations',[])
    data['created_by']=request.user
    try: challan=create_challan(data=data,allocations=[{'line_item_id':a['line_item'].id,'qty':a['qty']} for a in allocations])
    except DjangoValidationError as exc:return _validation(exc)
    return Response(ChallanSerializer(challan).data,status=201)
@api_view(['GET','POST'])
@permission_classes([CanRecordMoney])
def bill_list(request):
    if request.method=='GET':return Response(BillSerializer(Bill.objects.filter(is_deleted=False).prefetch_related('allocations'),many=True).data)
    serializer=BillSerializer(data=request.data); serializer.is_valid(raise_exception=True); data=serializer.validated_data; allocations=data.pop('allocations',[])
    data['created_by']=request.user
    try: bill=create_bill(data=data,allocations=[{'line_item_id':a['line_item'].id,'qty':a['qty'],'rate':a['rate'],'gst_rate':a['gst_rate']} for a in allocations])
    except DjangoValidationError as exc:return _validation(exc)
    return Response(BillSerializer(bill).data,status=201)
@api_view(['GET','POST'])
@permission_classes([CanRecordMoney])
def payment_list(request):
    if request.method=='GET':return Response(PaymentSerializer(Payment.objects.filter(is_deleted=False).prefetch_related('paymentallocation_set'),many=True).data)
    serializer=PaymentSerializer(data=request.data); serializer.is_valid(raise_exception=True); data=serializer.validated_data; allocations=data.pop('paymentallocation_set',[])
    data['created_by']=request.user
    try: payment=create_payment(data=data,allocations=[{'bill_id':a['bill'].id,'amount':a['amount'],'kind':a.get('kind','payment'),'note':a.get('note','')} for a in allocations])
    except DjangoValidationError as exc:return _validation(exc)
    return Response(PaymentSerializer(payment).data,status=201)
@api_view(['POST'])
@permission_classes([CanEditPO])
def paste_preview(request):
    rows=request.data.get('rows',[]); mapping=request.data.get('mapping',{}); errors=[]; preview=[]
    for index,row in enumerate(rows,1):
        if not row.get(mapping.get('description','description')): errors.append({'row':index,'field':'description','message':'Description is required.'})
        preview.append({'row':index,'data':row})
    return Response({'preview':preview,'errors':errors,'saved':False})
@api_view(['POST'])
@permission_classes([CanEditPO])
def pdf_preview(request):
    upload=request.FILES.get('file')
    if not upload:return Response({'detail':'A PDF file is required.'},status=400)
    if not upload.name.lower().endswith('.pdf'):return Response({'detail':'Only PDF files are supported.'},status=400)
    try:
        from pypdf import PdfReader
        text='\n'.join(page.extract_text() or '' for page in PdfReader(upload).pages)
    except Exception:return Response({'detail':'The PDF could not be read. Nothing was saved.'},status=400)
    if not text.strip(): return Response({'detail':'No extractable text found. Nothing was saved.'},status=400)
    return Response({'saved':False,'source_text':text[:20000],'fields':{'po_number':{'value':'','confidence':0.0},'po_date':{'value':'','confidence':0.0}},'lines':[]})
@api_view(['GET'])
@permission_classes([IsAdmin])
def review_list(request):
    qs=ImportReviewItem.objects.all().order_by('-id')
    if request.query_params.get('status')=='open':qs=qs.filter(resolved_at__isnull=True)
    return Response(list(qs.values()))
@api_view(['PATCH'])
@permission_classes([IsAdmin])
def resolve_review(request,pk):
    item=get_object_or_404(ImportReviewItem,pk=pk); item.resolved_at=timezone.now(); item.resolved_by=request.user; item.resolution=request.data.get('resolution',''); item.save(); return Response({'id':item.id,'resolved_at':item.resolved_at})
