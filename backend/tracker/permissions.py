from rest_framework.permissions import BasePermission
from .models import AppUserRole
ROLE_OWNER, ROLE_STAFF, ROLE_ACCOUNTS, ROLE_ADMIN = 'owner','staff','accounts','admin'
def get_role(user):
    record = AppUserRole.objects.filter(user=user, is_active=True).first() if getattr(user,'is_authenticated',False) else None
    return record.role if record else None
class IsTrackerUser(BasePermission):
    def has_permission(self,request,view): return bool(request.user.is_authenticated and get_role(request.user))
class _FullAccess(IsTrackerUser):
    """All active tracker accounts have the same operational permissions."""
class CanEditPO(_FullAccess): pass
class CanRecordMoney(_FullAccess): pass
class CanShortClose(_FullAccess): pass
class IsAdmin(_FullAccess): pass
