# PO Tracker — Schema Reference

**Version:** 1.0
**Database:** PostgreSQL 16
**ORM:** Django 5 (models mirror this SQL exactly)

---

## 0. Design Rules (non-negotiable)

These follow directly from the measured findings in [PRD.md §6](PRD.md). Violating any of them reintroduces a problem we already proved exists in the legacy data.

| # | Rule | Why |
|---|---|---|
| **D1** | **No line item ever stores its status.** Status is derived from quantity ledgers via a view. | 94 lines billed under-qty, 16 over-qty, 71 delivered under-qty. A status enum cannot express "45 of 50 billed". |
| **D2** | **Bills and challans are peers of the PO, not children.** They link to line items through allocation tables. | `UP/000009/25-26` spans two POs. Challan `194/23.2.25` spans two POs. |
| **D3** | **Every allocation carries a quantity.** | One PO had 13 bills; a line can be billed across several. |
| **D4** | **Rate lives on the allocation, not only on the line.** | 24 lines were billed at a rate different from the PO rate. |
| **D5** | **GST rate is per line item**, with a per-client default. Never a global constant. | 948 lines at 0%, 502 at 18%, 1 at 28%. |
| **D6** | **PO revision is a first-class relationship**, never free text. | 14 free-text revision markers scattered across three different columns. |
| **D7** | **Money is `numeric(14,2)`. Quantity is `numeric(14,3)`. Never float.** | Financial data. Postgres `numeric` is exact decimal. |
| **D8** | **Soft delete only.** `is_deleted` + `audit_log`. Nothing is ever physically removed. | Once Excel retires, this is the only copy. |
| **D9** | **`po_number` is unique per client, not globally.** | Formats differ per client: `8100013678`, `SO/12202429335`, `93026-0000001623`, `HCL CO./2025-26/03`. |
| **D10** | **All timestamps are `timestamptz`; all business dates are `date`.** | 889 legacy dates are unsortable text. This never recurs. |

---

## 1. Master Tables

### `legal_entity`
Our own billing entities. Two invoice series exist in the legacy data (`UP/…`, `HR/…`), implying two GST registrations.

```sql
CREATE TABLE legal_entity (
    id              bigserial    PRIMARY KEY,
    name            varchar(200) NOT NULL,
    gstin           varchar(15)  NULL,            -- 15-char GSTIN
    state_code      varchar(2)   NULL,            -- '09' = UP, '06' = HR
    state_name      varchar(100) NULL,
    invoice_prefix  varchar(10)  NOT NULL UNIQUE, -- 'UP', 'HR'
    is_active       boolean      NOT NULL DEFAULT true,
    created_at      timestamptz  NOT NULL DEFAULT now(),
    updated_at      timestamptz  NOT NULL DEFAULT now()
);
```

**Business rules:**
- `invoice_prefix` is the first segment of a bill number and must be unique.
- Seed with `UP` and `HR` pending confirmation of PRD open question 10.1.

---

### `client`
HCL, DLF, Metlife, Satya Prakash.

```sql
CREATE TABLE client (
    id                 bigserial    PRIMARY KEY,
    name               varchar(200) NOT NULL,
    code               varchar(30)  NOT NULL UNIQUE,  -- 'HCL', 'DLF', 'METLIFE'
    default_gst_rate   numeric(5,4) NOT NULL DEFAULT 0.0000,  -- 0% is the majority case
    po_number_hint     varchar(200) NULL,   -- human hint only, NEVER a validation regex
    payment_terms_days smallint     NULL,   -- for receivables ageing
    is_active          boolean      NOT NULL DEFAULT true,
    created_at         timestamptz  NOT NULL DEFAULT now(),
    updated_at         timestamptz  NOT NULL DEFAULT now()
);
```

**Business rules:**
- `default_gst_rate` pre-fills new line items. **0% is the default because 948 of 1,453 GST-bearing lines are 0%** — defaulting to 18% would be wrong more often than right.
- `po_number_hint` is displayed to the user as guidance. It is **never** enforced (PRD risk R11).

---

### `site`
HCL site codes AN04, AN08, AN22, AP08; DLF Mall of India; etc.

```sql
CREATE TABLE site (
    id          bigserial    PRIMARY KEY,
    client_id   bigint       NOT NULL REFERENCES client(id),
    code        varchar(30)  NULL,           -- 'AN04', 'AN08', 'AP08'
    name        varchar(200) NOT NULL,
    address     text         NULL,
    is_active   boolean      NOT NULL DEFAULT true,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT uq_site_client_code UNIQUE (client_id, code)
);
```

The legacy `Site Address` column mixes code and name: `( AN22 ) HCL TECHNOLOGIES LIMITED`. Migration splits these.

---

## 2. Purchase Orders

### `purchase_order`

```sql
CREATE TYPE po_status     AS ENUM ('active', 'superseded', 'cancelled');
CREATE TYPE record_source AS ENUM ('manual', 'paste', 'pdf', 'migration');

CREATE TABLE purchase_order (
    id                bigserial     PRIMARY KEY,
    client_id         bigint        NOT NULL REFERENCES client(id),
    site_id           bigint        NULL REFERENCES site(id),
    po_number         varchar(100)  NOT NULL,
    po_date           date          NULL,          -- real date, never text
    po_category       varchar(100)  NULL,          -- 'Service' | 'Material' | free text
    quotation_number  varchar(100)  NULL,          -- Milestone 9; the true business key

    status            po_status     NOT NULL DEFAULT 'active',
    revision_of_id    bigint        NULL REFERENCES purchase_order(id),
    superseded_by_id  bigint        NULL REFERENCES purchase_order(id),
    revision_reason   text          NULL,          -- 'PO Changed with Tax @18%'

    source            record_source NOT NULL DEFAULT 'manual',
    needs_review      boolean       NOT NULL DEFAULT false,
    notes             text          NULL,

    created_by_id     bigint        NULL REFERENCES auth_user(id),
    updated_by_id     bigint        NULL REFERENCES auth_user(id),
    created_at        timestamptz   NOT NULL DEFAULT now(),
    updated_at        timestamptz   NOT NULL DEFAULT now(),
    is_deleted        boolean       NOT NULL DEFAULT false
);

-- D9: unique PER CLIENT, and only among live rows
CREATE UNIQUE INDEX uq_po_client_number
    ON purchase_order (client_id, po_number)
    WHERE is_deleted = false;

CREATE INDEX idx_po_client_status ON purchase_order (client_id, status);
CREATE INDEX idx_po_date          ON purchase_order (po_date);
CREATE INDEX idx_po_needs_review  ON purchase_order (needs_review) WHERE needs_review = true;
```

**Business rules:**
- A PO with `status = 'superseded'` **must** have `superseded_by_id` set.
- A PO with `revision_of_id` set describes what changed in `revision_reason`.
- Superseded POs are excluded from every "pending" view but remain fully readable.
- **Revision carries allocations forward** — existing challan and bill allocations are re-pointed to the successor's matching lines, in one transaction. Never a manual re-entry.
- `needs_review = true` excludes the PO from headline dashboard totals (PRD risk R2).

---

### `po_line_item`
**The unit of everything.**

```sql
CREATE TYPE item_type AS ENUM ('material', 'service');

CREATE TABLE po_line_item (
    id                  bigserial     PRIMARY KEY,
    po_id               bigint        NOT NULL REFERENCES purchase_order(id),
    line_no             integer       NOT NULL,
    description         text          NOT NULL,
    item_type           item_type     NOT NULL,     -- drives which stages apply

    qty_ordered         numeric(14,3) NOT NULL,
    unit                varchar(20)   NOT NULL,     -- 'Nos', 'Mtr', 'Job', 'Lot'
    rate                numeric(14,2) NOT NULL,
    amount              numeric(14,2) NOT NULL,     -- qty_ordered * rate
    gst_rate            numeric(5,4)  NOT NULL,     -- 0.0000 | 0.1800 | 0.2800

    -- Service-line progress (Milestone 5)
    work_done_on        date          NULL,
    client_approved_on  date          NULL,

    -- Short-close (confirmed real by the owner)
    short_closed_on     date          NULL,
    short_closed_by_id  bigint        NULL REFERENCES auth_user(id),
    short_close_reason  text          NULL,

    -- Release 1 only. Removed at Milestone 5. See PRD risk R6.
    interim_status      varchar(30)   NULL,

    -- Migration provenance
    source_sheet        varchar(50)   NULL,
    source_row          integer       NULL,
    needs_review        boolean       NOT NULL DEFAULT false,

    created_at          timestamptz   NOT NULL DEFAULT now(),
    updated_at          timestamptz   NOT NULL DEFAULT now(),
    is_deleted          boolean       NOT NULL DEFAULT false,

    CONSTRAINT uq_line_po_no   UNIQUE (po_id, line_no),
    CONSTRAINT ck_qty_positive CHECK (qty_ordered > 0),
    CONSTRAINT ck_gst_range    CHECK (gst_rate >= 0 AND gst_rate <= 1)
);

CREATE INDEX idx_line_po      ON po_line_item (po_id);
CREATE INDEX idx_line_type    ON po_line_item (item_type);
CREATE INDEX idx_line_desc_ft ON po_line_item USING gin (to_tsvector('simple', description));
```

**Business rules:**
- `ck_gst_range` catches the legacy defect where `18` was entered instead of `0.18`.
- **`interim_status` is temporary scaffolding.** Release 1 has no bills or challans, so staff mark progress by hand. The status view **ignores it the moment real allocations exist**. It is dropped at Milestone 5.
- `short_closed_on` set ⇒ the line is finished regardless of quantities, and disappears from all pending views.
- A `material` line legitimately has no challan. This is data, not an exception.

---

## 3. Delivery

### `challan`

```sql
CREATE TABLE challan (
    id               bigserial     PRIMARY KEY,
    challan_number   varchar(100)  NOT NULL,
    challan_date     date          NOT NULL,
    site_id          bigint        NULL REFERENCES site(id),
    delivery_source  varchar(200)  NULL,   -- 'Challan', 'K C Infra'
    bill_to_name     varchar(200)  NULL,   -- bill-to CAN differ from ship-to
    ship_to_name     varchar(200)  NULL,
    notes            text          NULL,
    source           record_source NOT NULL DEFAULT 'manual',
    needs_review     boolean       NOT NULL DEFAULT false,
    created_by_id    bigint        NULL REFERENCES auth_user(id),
    created_at       timestamptz   NOT NULL DEFAULT now(),
    updated_at       timestamptz   NOT NULL DEFAULT now(),
    is_deleted       boolean       NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX uq_challan_number_date
    ON challan (challan_number, challan_date) WHERE is_deleted = false;
```

Legacy challan numbers embed the date (`151/30.11.24`, `194/23.2.25`, `188/12/2/26`). Migration parses both parts; unparseable ones go to the review queue.

### `challan_allocation`

```sql
CREATE TABLE challan_allocation (
    id            bigserial     PRIMARY KEY,
    challan_id    bigint        NOT NULL REFERENCES challan(id),
    line_item_id  bigint        NOT NULL REFERENCES po_line_item(id),
    qty           numeric(14,3) NOT NULL,
    created_at    timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT uq_challan_line UNIQUE (challan_id, line_item_id),
    CONSTRAINT ck_challan_qty  CHECK (qty > 0)
);

CREATE INDEX idx_chal_alloc_line ON challan_allocation (line_item_id);
```

**This table is why one challan can span multiple POs (D2).**

---

## 4. Billing

### `bill`

```sql
CREATE TYPE ariba_status AS ENUM
    ('not_required', 'pending', 'uploaded', 'rejected', 'resubmitted');

CREATE TABLE bill (
    id                    bigserial     PRIMARY KEY,
    legal_entity_id       bigint        NOT NULL REFERENCES legal_entity(id),
    bill_number           varchar(100)  NOT NULL,   -- 'UP/000038/24-25'
    bill_date             date          NOT NULL,

    basic_amount          numeric(14,2) NOT NULL DEFAULT 0,
    gst_amount            numeric(14,2) NOT NULL DEFAULT 0,
    total_amount          numeric(14,2) NOT NULL DEFAULT 0,

    ariba_state           ariba_status  NOT NULL DEFAULT 'pending',
    ariba_uploaded_on     date          NULL,
    ariba_reference       varchar(100)  NULL,
    ariba_rejection_note  text          NULL,

    source                record_source NOT NULL DEFAULT 'manual',
    needs_review          boolean       NOT NULL DEFAULT false,
    created_by_id         bigint        NULL REFERENCES auth_user(id),
    created_at            timestamptz   NOT NULL DEFAULT now(),
    updated_at            timestamptz   NOT NULL DEFAULT now(),
    is_deleted            boolean       NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX uq_bill_entity_number
    ON bill (legal_entity_id, bill_number) WHERE is_deleted = false;

CREATE INDEX idx_bill_date  ON bill (bill_date);
CREATE INDEX idx_bill_ariba ON bill (ariba_state) WHERE ariba_state IN ('pending','rejected');
```

**Business rules:**
- Bill number format is validated on entry as `PREFIX/serial/YY-YY` where `YY2 = YY1 + 1`. **33 legacy bill numbers fail this** (`UP/000037/24-26` … `/24-37`, `HR/000143/24-37`) and are imported with `needs_review = true`.
- `basic_amount`, `gst_amount` and `total_amount` are **maintained by trigger** from `bill_allocation`, never entered by hand.
- `ariba_state = 'pending'` on a bill older than 7 days is a dashboard alert. ~₹1.05 cr currently sits here.

### `bill_allocation`

```sql
CREATE TABLE bill_allocation (
    id            bigserial     PRIMARY KEY,
    bill_id       bigint        NOT NULL REFERENCES bill(id),
    line_item_id  bigint        NOT NULL REFERENCES po_line_item(id),
    qty           numeric(14,3) NOT NULL,
    rate          numeric(14,2) NOT NULL,   -- D4: MAY differ from po_line_item.rate
    amount        numeric(14,2) NOT NULL,   -- qty * rate
    gst_rate      numeric(5,4)  NOT NULL,
    gst_amount    numeric(14,2) NOT NULL,
    total_amount  numeric(14,2) NOT NULL,   -- amount + gst_amount
    created_at    timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT uq_bill_line UNIQUE (bill_id, line_item_id),
    CONSTRAINT ck_bill_qty  CHECK (qty > 0)
);

CREATE INDEX idx_bill_alloc_line ON bill_allocation (line_item_id);
```

**This table is why a PO can have 13 bills and a bill can span two POs (D2, D3, D4).**

---

## 5. Money In

### `payment`
Attaches to the **client**, not to a bill — advances arrive before any bill exists.

```sql
CREATE TABLE payment (
    id            bigserial     PRIMARY KEY,
    client_id     bigint        NOT NULL REFERENCES client(id),
    received_on   date          NOT NULL,
    amount        numeric(14,2) NOT NULL,
    mode          varchar(50)   NULL,   -- 'NEFT', 'RTGS', 'Cheque'
    reference     varchar(200)  NULL,   -- UTR / cheque no.
    is_advance    boolean       NOT NULL DEFAULT false,
    notes         text          NULL,
    created_by_id bigint        NULL REFERENCES auth_user(id),
    created_at    timestamptz   NOT NULL DEFAULT now(),
    updated_at    timestamptz   NOT NULL DEFAULT now(),
    is_deleted    boolean       NOT NULL DEFAULT false,
    CONSTRAINT ck_payment_amount CHECK (amount > 0)
);
```

### `payment_allocation`

```sql
CREATE TYPE allocation_kind AS ENUM
    ('payment', 'tds', 'retention', 'discount', 'write_off');

CREATE TABLE payment_allocation (
    id          bigserial       PRIMARY KEY,
    payment_id  bigint          NULL REFERENCES payment(id),  -- NULL for TDS with no cash movement
    bill_id     bigint          NOT NULL REFERENCES bill(id),
    amount      numeric(14,2)   NOT NULL,
    kind        allocation_kind NOT NULL DEFAULT 'payment',
    note        text            NULL,
    created_at  timestamptz     NOT NULL DEFAULT now(),
    CONSTRAINT ck_alloc_amount CHECK (amount > 0)
);

CREATE INDEX idx_pay_alloc_bill ON payment_allocation (bill_id);
```

**Business rules — this is where receivables reconcile or don't:**
- `kind = 'payment'` — actual cash received.
- `kind = 'tds'` — deducted at source by the client. **Extinguishes the receivable without cash.** Owner confirmed: material bills are paid in full; service work has TDS deducted.
- `kind = 'retention'` — held back until defect liability ends. **Still owed**, reported separately, not counted as settled.
- `kind = 'discount'` / `'write_off'` — deliberate reductions, require Admin.
- **Settled** = sum of `payment | tds | discount | write_off`.
- **Outstanding** = `bill.total_amount − settled`. Retention sits inside outstanding but is flagged separately.
- An unallocated `payment` with `is_advance = true` is client credit awaiting a bill.

---

## 6. Operational Tables

```sql
CREATE TABLE app_user_role (
    id         bigserial   PRIMARY KEY,
    user_id    bigint      NOT NULL UNIQUE REFERENCES auth_user(id),
    role       varchar(20) NOT NULL,  -- 'owner' | 'staff' | 'accounts' | 'admin'
    is_active  boolean     NOT NULL DEFAULT true,
    force_password_change boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
    id          bigserial    PRIMARY KEY,
    table_name  varchar(60)  NOT NULL,
    row_id      bigint       NOT NULL,
    action      varchar(10)  NOT NULL,   -- 'create' | 'update' | 'delete'
    actor_id    bigint       NULL REFERENCES auth_user(id),
    before_json jsonb        NULL,
    after_json  jsonb        NULL,
    at          timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_row ON audit_log (table_name, row_id);
CREATE INDEX idx_audit_at  ON audit_log (at DESC);

CREATE TABLE import_batch (
    id            bigserial    PRIMARY KEY,
    kind          varchar(20)  NOT NULL,   -- 'excel' | 'paste' | 'pdf'
    filename      varchar(300) NULL,
    actor_id      bigint       NULL REFERENCES auth_user(id),
    started_at    timestamptz  NOT NULL DEFAULT now(),
    finished_at   timestamptz  NULL,
    rows_total    integer      NOT NULL DEFAULT 0,
    rows_imported integer      NOT NULL DEFAULT 0,
    rows_flagged  integer      NOT NULL DEFAULT 0,
    report_json   jsonb        NULL        -- reconciliation diff vs source
);

CREATE TABLE import_review_item (
    id             bigserial    PRIMARY KEY,
    batch_id       bigint       NOT NULL REFERENCES import_batch(id),
    severity       varchar(10)  NOT NULL,   -- 'error' | 'warning'
    reason_code    varchar(50)  NOT NULL,   -- see table below
    source_ref     varchar(200) NULL,       -- 'HCL PO!A471'
    payload_json   jsonb        NOT NULL,
    resolved_at    timestamptz  NULL,
    resolved_by_id bigint       NULL REFERENCES auth_user(id),
    resolution     text         NULL
);
CREATE INDEX idx_review_open ON import_review_item (batch_id) WHERE resolved_at IS NULL;
```

### Import review reason codes

Every one of these was found in the real workbook. The migration must classify, never guess.

| `reason_code` | Meaning | Legacy count |
|---|---|---|
| `DUPLICATE_PO_ACROSS_SHEETS` | Same PO number on more than one sheet | **48** |
| `UNPARSEABLE_DATE` | Date stored as text in an unknown format | up to **889** |
| `IMPOSSIBLE_DATE` | e.g. `26/09/204` | 1+ |
| `MALFORMED_BILL_NUMBER` | FY segment invalid (`UP/000037/24-37`) | **33** |
| `PO_NUMBER_IS_REVISION_MARKER` | PO column contains `PO Changed`, `PO Amended`, etc. | ~14 |
| `GST_RATE_OUT_OF_RANGE` | `18` entered instead of `0.18` | 3 |
| `BILLED_EXCEEDS_ORDERED` | Billing qty > ordered qty | **16** |
| `DELIVERED_EXCEEDS_ORDERED` | Delivery qty > ordered qty | **35** |
| `RATE_DIVERGENCE` | Billing rate ≠ PO rate | **24** |
| `NO_BILL_REFERENCE` | Line has no bill — genuinely pending, or never recorded? | **824** |
| `ZERO_GST_ON_BILLED_LINE` | 0% GST on a billed line — see PRD Q10.2 | **847** |
| `MISSING_CHALLAN_ON_SERVICE` | Service line billed with no challan recorded | ~816 |

---

## 7. Derived Views — the heart of the model

**No status is ever stored (D1).** These views compute it.

### `v_line_item_ledger`

```sql
CREATE VIEW v_line_item_ledger AS
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
FROM po_line_item li
LEFT JOIN (
    SELECT line_item_id, SUM(qty) AS qty_delivered
    FROM challan_allocation GROUP BY line_item_id
) ca ON ca.line_item_id = li.id
LEFT JOIN (
    SELECT line_item_id,
           SUM(qty)          AS qty_billed,
           SUM(amount)       AS amount_billed,
           SUM(total_amount) AS total_billed
    FROM bill_allocation GROUP BY line_item_id
) ba ON ba.line_item_id = li.id
WHERE li.is_deleted = false;
```

### `v_line_item_status`

```sql
CREATE VIEW v_line_item_status AS
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
        -- Release 1 scaffolding only; ignored once any allocation exists
        WHEN li.interim_status IS NOT NULL
             AND l.qty_delivered = 0
             AND l.qty_billed = 0                THEN li.interim_status
        ELSE 'ORDERED'
    END AS status,
    (l.qty_billed    > l.qty_ordered) AS is_over_billed,
    (l.qty_delivered > l.qty_ordered) AS is_over_delivered
FROM v_line_item_ledger l
JOIN po_line_item li ON li.id = l.line_item_id;
```

**Status values:** `ORDERED` → `PART_DELIVERED` → `DELIVERED` → `WORK_DONE` → `APPROVED` → `PART_BILLED` → `BILLED`, plus terminal `CLOSED_SHORT`. Material lines jump `ORDERED` → `PART_BILLED`/`BILLED` directly.

### `v_bill_settlement`

```sql
CREATE VIEW v_bill_settlement AS
SELECT
    b.id AS bill_id,
    b.total_amount,
    COALESCE(SUM(pa.amount) FILTER (
        WHERE pa.kind IN ('payment','tds','discount','write_off')), 0) AS settled_amount,
    COALESCE(SUM(pa.amount) FILTER (WHERE pa.kind = 'tds'), 0)         AS tds_amount,
    COALESCE(SUM(pa.amount) FILTER (WHERE pa.kind = 'retention'), 0)   AS retention_amount,
    b.total_amount - COALESCE(SUM(pa.amount) FILTER (
        WHERE pa.kind IN ('payment','tds','discount','write_off')), 0) AS outstanding_amount,
    (CURRENT_DATE - b.bill_date)                                       AS age_days
FROM bill b
LEFT JOIN payment_allocation pa ON pa.bill_id = b.id
WHERE b.is_deleted = false
GROUP BY b.id;
```

### `v_po_summary`
The PO detail page's money strip — *"kitne ka bill ho gaya, kitna kiska reh gaya."*

```sql
CREATE VIEW v_po_summary AS
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
FROM purchase_order po
JOIN v_line_item_ledger l ON l.po_id = po.id
JOIN v_line_item_status s ON s.line_item_id = l.line_item_id
WHERE po.is_deleted = false AND po.status <> 'superseded'
GROUP BY po.id;
```

---

## 8. Triggers

| Trigger | On | Does |
|---|---|---|
| `trg_bill_totals` | `bill_allocation` INSERT/UPDATE/DELETE | Recomputes `bill.basic_amount`, `gst_amount`, `total_amount`. **Bill totals are never hand-entered.** |
| `trg_line_amount` | `po_line_item` INSERT/UPDATE | Recomputes `amount = qty_ordered * rate`. |
| `trg_audit_*` | All financial tables | Writes `audit_log` with before/after JSON. |
| `trg_updated_at` | All tables with `updated_at` | Sets `now()`. |

---

## 9. Migration Commands

```bash
python manage.py makemigrations tracker
python manage.py migrate
python manage.py seed_masters                                    # clients, sites, legal entities
python manage.py bootstrap_admin --email <admin@example.com>
python manage.py import_workbook "PO TRACKER.xlsx" --dry-run     # reconcile first
python manage.py import_workbook "PO TRACKER.xlsx" --commit
```

`--dry-run` is mandatory before `--commit`. It prints the reconciliation diff against the workbook and the review-queue breakdown by `reason_code`, and writes nothing.

---

## 10. Relationship Diagram

```
legal_entity ──< bill ──< bill_allocation >── po_line_item >── purchase_order >── client
                  │                              │                   │              │
                  │                              │                   │              └──< site
                  │                              │                   │
                  └──< payment_allocation        └──< challan_allocation >── challan
                            │
                          payment >── client

purchase_order ──self──> purchase_order      (revision_of_id / superseded_by_id)

audit_log, import_batch ──< import_review_item, app_user_role   (cross-cutting)
```

Read `>──` as "many to one". **`bill_allocation` and `challan_allocation` are the two junctions that make the whole model work** — they are why a bill can span POs and a line can be billed thirteen times.

---

## 11. Key Query Patterns

```sql
-- "Kaun sa kaam reh gaya hai" — pending work, most valuable first
SELECT po.po_number, c.name, si.code, li.description,
       s.qty_ordered - s.qty_billed AS qty_pending, l.amount_ordered
FROM v_line_item_status s
JOIN po_line_item li      ON li.id = s.line_item_id
JOIN v_line_item_ledger l ON l.line_item_id = s.line_item_id
JOIN purchase_order po    ON po.id = s.po_id
JOIN client c             ON c.id = po.client_id
LEFT JOIN site si         ON si.id = po.site_id
WHERE s.status NOT IN ('BILLED','CLOSED_SHORT')
  AND po.status = 'active' AND po.needs_review = false
ORDER BY l.amount_ordered DESC;

-- "Kiska paisa aana baaki hai" — receivables ageing by client
SELECT c.name,
       SUM(v.outstanding_amount)                                 AS outstanding,
       SUM(v.outstanding_amount) FILTER (WHERE v.age_days > 90)  AS over_90_days,
       SUM(v.retention_amount)                                   AS retention_held
FROM v_bill_settlement v
JOIN bill b            ON b.id = v.bill_id
JOIN bill_allocation ba ON ba.bill_id = b.id
JOIN po_line_item li   ON li.id = ba.line_item_id
JOIN purchase_order po ON po.id = li.po_id
JOIN client c          ON c.id = po.client_id
WHERE v.outstanding_amount > 0
GROUP BY c.name ORDER BY outstanding DESC;

-- Ariba backlog — billed but not uploaded, therefore not payable
SELECT b.bill_number, b.bill_date, b.total_amount,
       CURRENT_DATE - b.bill_date AS age_days
FROM bill b
WHERE b.ariba_state IN ('pending','rejected') AND b.is_deleted = false
ORDER BY b.bill_date;

-- Work done but still unbilled — the metric the owner actually needs
SELECT po.po_number, li.description, li.work_done_on,
       CURRENT_DATE - li.work_done_on AS days_since_work
FROM po_line_item li
JOIN v_line_item_status s ON s.line_item_id = li.id
JOIN purchase_order po    ON po.id = li.po_id
WHERE li.work_done_on IS NOT NULL
  AND s.status NOT IN ('BILLED','CLOSED_SHORT')
ORDER BY li.work_done_on;
```

---

*See [TECH_SPEC.md](TECH_SPEC.md) for the Django models that mirror this, and [TEST_PLAN.md](TEST_PLAN.md) for the tests that prove the derivation rules.*
