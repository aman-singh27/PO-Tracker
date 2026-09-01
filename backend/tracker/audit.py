import threading
from django.forms.models import model_to_dict
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from .models import AuditLog, PurchaseOrder, POLineItem, Challan, Bill, Payment
_state=threading.local()
class CurrentUserMiddleware:
    def __init__(self,get_response): self.get_response=get_response
    def __call__(self,request):
        _state.user=request.user
        try: return self.get_response(request)
        finally: _state.user=None
def _json(obj):
    return {k: str(v) if v is not None else None for k,v in model_to_dict(obj).items()}
@receiver(pre_save, sender=PurchaseOrder)
@receiver(pre_save, sender=POLineItem)
@receiver(pre_save, sender=Challan)
@receiver(pre_save, sender=Bill)
@receiver(pre_save, sender=Payment)
def audit_before(sender, instance, **kwargs):
    if instance.pk:
        try: instance._audit_before = _json(sender.objects.get(pk=instance.pk))
        except sender.DoesNotExist: instance._audit_before = None
@receiver(post_save, sender=PurchaseOrder)
@receiver(post_save, sender=POLineItem)
@receiver(post_save, sender=Challan)
@receiver(post_save, sender=Bill)
@receiver(post_save, sender=Payment)
def audit_save(sender,instance,created,**kwargs):
    AuditLog.objects.create(table_name=sender._meta.db_table,row_id=instance.pk,action='create' if created else 'update',actor=getattr(_state,'user',None) if getattr(getattr(_state,'user',None),'is_authenticated',False) else None,before_json=None if created else getattr(instance,'_audit_before',None),after_json=_json(instance))
