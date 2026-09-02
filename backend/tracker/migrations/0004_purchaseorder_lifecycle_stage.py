from django.db import migrations, models


def remove_legacy_sqlite_views(apps, schema_editor):
    if schema_editor.connection.vendor == 'sqlite':
        for name in ('v_po_summary', 'v_bill_settlement', 'v_line_item_status', 'v_line_item_ledger'):
            schema_editor.execute(f'DROP VIEW IF EXISTS {name}')


class Migration(migrations.Migration):
    dependencies = [("tracker", "0003_create_sql_views")]
    operations = [
        migrations.RunPython(remove_legacy_sqlite_views, migrations.RunPython.noop),
        migrations.AddField(
            model_name="purchaseorder",
            name="lifecycle_stage",
            field=models.CharField(
                choices=[("draft", "Draft"), ("ordered", "Ordered"), ("partially_built", "Partially built"), ("partially_paid", "Partially paid"), ("closed", "Closed")],
                default="draft",
                max_length=20,
            ),
        )
    ]
