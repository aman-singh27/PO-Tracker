from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from tracker.models import AppUserRole


class Command(BaseCommand):
    help = "Create or promote the tracker administrator."
    def add_arguments(self, parser):
        parser.add_argument("--email", required=True)
        parser.add_argument("--password", required=True)
    def handle(self, *args, **options):
        User = get_user_model(); email = options["email"].strip().lower()
        user, created = User.objects.get_or_create(username=email, defaults={"email": email, "is_staff": True, "is_superuser": True})
        if not created and user.email and user.email.lower() != email:
            raise CommandError("Username already belongs to another account")
        user.email = email; user.is_staff = True; user.is_superuser = True; user.set_password(options["password"]); user.save()
        AppUserRole.objects.update_or_create(user=user, defaults={"role": AppUserRole.Role.ADMIN, "is_active": True, "force_password_change": True})
        self.stdout.write(self.style.SUCCESS(f"Administrator ready: {email}"))
