from django.conf import settings
from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies=[('tracker','0004_purchaseorder_lifecycle_stage')]
    operations=[migrations.CreateModel(name='POAttachment',fields=[('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),('created_at',models.DateTimeField(auto_now_add=True)),('updated_at',models.DateTimeField(auto_now=True)),('file',models.FileField(upload_to='po-attachments/%Y/%m/')),('label',models.CharField(blank=True,max_length=200)),('po',models.ForeignKey(on_delete=models.deletion.CASCADE,related_name='attachments',to='tracker.purchaseorder')),('uploaded_by',models.ForeignKey(blank=True,null=True,on_delete=models.deletion.SET_NULL,to=settings.AUTH_USER_MODEL))])]
