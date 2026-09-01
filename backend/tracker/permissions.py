from rest_framework.permissions import BasePermission
from .models import AppUserRole
ROLE_OWNER, ROLE_STAFF, ROLE_ACCOUNTS, ROLE_ADMIN = 'owner','staff','accounts','admin'
def get_role(user):
    record = AppUserRole.objects.filter(user=user, is_active=True).first() if getattr(user,'is_authenticated',False) else None
    return record.role if record else None
class IsTrackerUser(BasePermission):
    def has_permission(self,request,view): return bool(request.user.is_authenticated and get_role(request.user))
class _Roles(IsTrackerUser):
    roles=()
    def has_permission(self,request,view): return super().has_permission(request,view) and get_role(request.user) in self.roles
class CanEditPO(_Roles): roles=(ROLE_STAFF,ROLE_ADMIN)
class CanRecordMoney(_Roles): roles=(ROLE_ACCOUNTS,ROLE_ADMIN)
class CanShortClose(_Roles): roles=(ROLE_OWNER,ROLE_ADMIN)
class IsAdmin(_Roles): roles=(ROLE_ADMIN,)
