from django.core.management.base import BaseCommand
from tracker.models import Client, LegalEntity, Site


class Command(BaseCommand):
    help = "Create the initial master data; safe to run repeatedly."

    def handle(self, *args, **options):
        entities = [("Uttar Pradesh Entity", "UP", "09", "Uttar Pradesh"), ("Haryana Entity", "HR", "06", "Haryana")]
        for name, prefix, code, state in entities:
            LegalEntity.objects.update_or_create(invoice_prefix=prefix, defaults={"name": name, "state_code": code, "state_name": state})
        masters = [("HCL Technologies", "HCL", ["AN04", "AN08", "AN22", "AP08"]), ("DLF Mall of India", "DLF", ["MALL-OF-INDIA"]), ("Metlife", "METLIFE", []), ("Satya Prakash", "SATYA-PRAKASH", [])]
        for name, code, sites in masters:
            client, _ = Client.objects.update_or_create(code=code, defaults={"name": name})
            for site_code in sites:
                Site.objects.update_or_create(client=client, code=site_code, defaults={"name": name})
        self.stdout.write(self.style.SUCCESS("Master data is ready."))
