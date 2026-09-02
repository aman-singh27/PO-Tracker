from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies=[('tracker','0005_poattachment')]
    operations=[migrations.CreateModel(name='TrackerSettings',fields=[('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),('created_at',models.DateTimeField(auto_now_add=True)),('updated_at',models.DateTimeField(auto_now=True)),('stuck_after_days',models.PositiveSmallIntegerField(blank=True,null=True)),('overdue_after_days',models.PositiveSmallIntegerField(blank=True,null=True))])]
