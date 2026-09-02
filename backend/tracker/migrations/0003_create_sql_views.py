from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('tracker', '0002_bill_created_by_bill_source_challan_created_by_and_more'),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
            CREATE OR REPLACE VIEW v_line_item_ledger AS
            SELECT
                li.id                                        AS line_item_id,
                li.po_id,
                li.qty_ordered,
                li.amount                                    AS amount_ordered,
                COALESCE(ca.qty_delivered, 0)                AS qty_delivered,
                COALESCE(ba.qty_billed,    0)                AS qty_billed,
                COALESCE(ba.amount_billed, 0)                AS amount_billed,
                COALESCE(ba.total_billed,  0)                AS total_billed,
                GREATEST(li.qty_ordered - COALESCE(ba.qty_billed, 0), 0) AS qty_pending_bill
            FROM tracker_polineitem li
            LEFT JOIN (
                SELECT line_item_id, SUM(qty) AS qty_delivered
                FROM tracker_challanallocation GROUP BY line_item_id
            ) ca ON ca.line_item_id = li.id
            LEFT JOIN (
                SELECT line_item_id,
                       SUM(qty)          AS qty_billed,
                       SUM(amount)       AS amount_billed,
                       SUM(total_amount) AS total_billed
                FROM tracker_billallocation GROUP BY line_item_id
            ) ba ON ba.line_item_id = li.id
            WHERE li.is_deleted = false;
            """,
            reverse_sql="DROP VIEW IF EXISTS v_line_item_ledger;"
        ),
        migrations.RunSQL(
            sql="""
            CREATE OR REPLACE VIEW v_line_item_status AS
            SELECT
                l.line_item_id,
                l.po_id,
                l.qty_ordered,
                l.qty_delivered,
                l.qty_billed,
                CASE
                    WHEN li.short_closed_on IS NOT NULL      THEN 'CLOSED_SHORT'
                    WHEN l.qty_billed >= l.qty_ordered       THEN 'BILLED'
                    WHEN l.qty_billed > 0                    THEN 'PART_BILLED'
                    WHEN li.client_approved_on IS NOT NULL   THEN 'APPROVED'
                    WHEN li.work_done_on IS NOT NULL         THEN 'WORK_DONE'
                    WHEN l.qty_delivered >= l.qty_ordered    THEN 'DELIVERED'
                    WHEN l.qty_delivered > 0                 THEN 'PART_DELIVERED'
                    WHEN li.interim_status IS NOT NULL
                         AND l.qty_delivered = 0
                         AND l.qty_billed = 0                THEN li.interim_status
                    ELSE 'ORDERED'
                END AS status,
                (l.qty_billed    > l.qty_ordered) AS is_over_billed,
                (l.qty_delivered > l.qty_ordered) AS is_over_delivered
            FROM v_line_item_ledger l
            JOIN tracker_polineitem li ON li.id = l.line_item_id;
            """,
            reverse_sql="DROP VIEW IF EXISTS v_line_item_status;"
        ),
        migrations.RunSQL(
            sql="""
            CREATE OR REPLACE VIEW v_bill_settlement AS
            SELECT
                b.id AS bill_id,
                b.total_amount,
                COALESCE(SUM(pa.amount) FILTER (
                    WHERE pa.kind IN ('payment','tds','discount','write_off')), 0) AS settled_amount,
                COALESCE(SUM(pa.amount) FILTER (WHERE pa.kind = 'tds'), 0)         AS tds_amount,
                COALESCE(SUM(pa.amount) FILTER (WHERE pa.kind = 'retention'), 0)   AS retention_amount,
                b.total_amount - COALESCE(SUM(pa.amount) FILTER (
                    WHERE pa.kind IN ('payment','tds','discount','write_off')), 0) AS outstanding_amount,
                (CURRENT_DATE - b.bill_date)                                        AS age_days
            FROM tracker_bill b
            LEFT JOIN tracker_paymentallocation pa ON pa.bill_id = b.id
            WHERE b.is_deleted = false
            GROUP BY b.id;
            """,
            reverse_sql="DROP VIEW IF EXISTS v_bill_settlement;"
        ),
        migrations.RunSQL(
            sql="""
            CREATE OR REPLACE VIEW v_po_summary AS
            SELECT
                po.id AS po_id,
                po.po_number,
                po.client_id,
                po.site_id,
                COUNT(l.line_item_id)                                         AS line_count,
                SUM(l.amount_ordered)                                         AS amount_ordered,
                SUM(l.total_billed)                                           AS amount_billed,
                COUNT(*) FILTER (WHERE s.status = 'ORDERED')                  AS lines_not_started,
                COUNT(*) FILTER (WHERE s.status IN ('PART_BILLED','BILLED'))  AS lines_billed,
                COUNT(*) FILTER (WHERE s.status = 'CLOSED_SHORT')             AS lines_closed_short,
                BOOL_OR(s.is_over_billed)                                     AS has_over_billing
            FROM tracker_purchaseorder po
            JOIN v_line_item_ledger l ON l.po_id = po.id
            JOIN v_line_item_status s ON s.line_item_id = l.line_item_id
            WHERE po.is_deleted = false AND po.status <> 'superseded'
            GROUP BY po.id;
            """,
            reverse_sql="DROP VIEW IF EXISTS v_po_summary;"
        )
    ]
