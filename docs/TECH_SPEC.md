# PO Tracker — Technical Specification

**Version:** 1.0
**Stack:** React 18 (Vite + TypeScript) · Django 5 + DRF · PostgreSQL 16

---

## 1. Stack Decision & Rationale

| Layer | Choice | Why this and not the alternative |
|---|---|---|
| **Database** | PostgreSQL 16 | The model is relational to its core: many-to-many allocations, derived-status views, exact decimal money, partial indexes, `FILTER` aggregates, JSONB audit. Nothing else considered does this as well. |
| **Backend** | Django 5 + Django REST Framework | Migrations, ORM, transactions, and a permission layer that maps 1:1 onto the PRD permission matrix. **Django admin gives master-data CRUD for free.** |
| **Migration tooling** | Python + `openpyxl` | The 2,134-row import is the single highest-risk task. `openpyxl` is already how the workbook was analysed — that analysis code becomes the migration script. A JS stack would need a separate Python script anyway. |
| **Frontend** | React 18 + Vite + TypeScript | The PO entry grid is the make-or-break screen (PRD risk R1) and must feel like a spreadsheet. Server-rendered HTMX would fight that. |
| **Styling** | Tailwind CSS | Fast, consistent, no CSS architecture to invent. |
| **Money** | `numeric(14,2)` / Python `Decimal` | Exact decimal. **Never `float`.** |
| **Auth** | Django session auth + CSRF | Proven in-house pattern. No token lifecycle to get wrong for an internal tool. |
| **Hosting** | Managed Postgres with PITR + a single app host | PRD risk R8 requires point-in-time restore; managed Postgres provides it without operational work. |

**Rejected:** no-code platforms (Airtable / NocoDB / Zoho Creator) — the many-to-many allocation model with derived status is precisely where they break, per-user pricing bites at 15 users, and the data model cannot be owned.

---

## 2. Architecture Overview

```
┌──────────────────────────────────────────────┐
│  React SPA (Vite + TS + Tailwind)            │
│  · PO entry grid (keyboard-first)            │
│  · PO detail + money strip                   │
│  · Search · Dashboards · Import review       │
└───────────────┬──────────────────────────────┘
                │ /api/v1/  (session cookie + CSRF)
┌───────────────▼──────────────────────────────┐
│  Django + DRF                                │
│  · Permission classes  (PRD §5.2 matrix)     │
│  · Serializers        (validation boundary)  │
│  · Services           (multi-table txns)     │
│  · Audit middleware                          │
│  · Management commands (import, seed)        │
└───────────────┬──────────────────────────────┘
┌───────────────▼──────────────────────────────┐
│  PostgreSQL 16                               │
│  · Tables + partial unique indexes           │
│  · Views: status is DERIVED, never stored    │
│  · Triggers: bill totals, audit, updated_at  │
└──────────────────────────────────────────────┘
```

**Layering rule:** any operation touching more than one table goes through a **service function** wrapped in `transaction.atomic()`. Views and serializers never orchestrate multi-table writes directly. Non-negotiable for PO revision, bill allocation and payment allocation.

---

## 3. Backend — Django

### 3.1 Project structure

```
backend/
├── config/
│   ├── settings/{base,dev,prod}.py
│   └── urls.py
├── tracker/
│   ├── models/
│   │   ├── masters.py         # LegalEntity, Client, Site
│   │   ├── purchase_order.py  # PurchaseOrder, POLineItem
│   │   ├── delivery.py        # Challan, ChallanAllocation
│   │   ├── billing.py         # Bill, BillAllocation
│   │   ├── money.py           # Payment, PaymentAllocation
│   │   └── ops.py             # AppUserRole, AuditLog, ImportBatch, ImportReviewItem
│   ├── services/
│   │   ├── po_service.py      # create, revise, cancel, short_close
│   │   ├── challan_service.py
│   │   ├── bill_service.py
│   │   ├── payment_service.py
│   │   └── import_service.py
│   ├── selectors/             # read paths — query the VIEWS, not the tables
│   │   ├── po_selectors.py
│   │   ├── search.py
│   │   └── dashboard.py
│   ├── permissions.py
│   ├── serializers/
│   ├── views/
│   ├── management/commands/
│   │   ├── seed_masters.py
│   │   ├── bootstrap_admin.py
│   │   └── import_workbook.py
│   ├── migrations/
│   └── tests/
└── manage.py
```

**Services vs selectors:** writes go through `services/`, reads through `selectors/`. Selectors query the derived views (`v_line_item_status`, `v_po_summary`, `v_bill_settlement`) — **never** recompute status in Python. One definition of status, in SQL.

### 3.2 Key models (abridged — [SCHEMA.md](SCHEMA.md) is authoritative)

```python
# tracker/models/purchase_order.py
class PurchaseOrder(TimeStampedModel, SoftDeleteModel):
    class Status(models.TextChoices):
        ACTIVE     = 'active'
        SUPERSEDED = 'superseded'
        CANCELLED  = 'cancelled'

    client      = models.ForeignKey(Client, on_delete=models.PROTECT)
    site        = models.ForeignKey(Site, null=True, on_delete=models.PROTECT)
    po_number   = models.CharField(max_length=100)
    po_date     = models.DateField(null=True)
    po_category = models.CharField(max_length=100, blank=True)
    quotation_number = models.CharField(max_length=100, blank=True)  # Milestone 9

    status          = models.CharField(max_length=20, choices=Status.choices,
                                       default=Status.ACTIVE)
    revision_of     = models.ForeignKey('self', null=True, related_name='revisions',
                                        on_delete=models.PROTECT)
    superseded_by   = models.ForeignKey('self', null=True, related_name='+',
                                        on_delete=models.PROTECT)
    revision_reason = models.TextField(blank=True)
    needs_review    = models.BooleanField(default=False)

    class Meta:
        constraints = [
            # D9 — unique PER CLIENT, live rows only
            models.UniqueConstraint(
                fields=['client', 'po_number'],
                condition=Q(is_deleted=False),
                name='uq_po_client_number',
            )
        ]


class POLineItem(TimeStampedModel, SoftDeleteModel):
    class ItemType(models.TextChoices):
        MATERIAL = 'material'
        SERVICE  = 'service'

    po          = models.ForeignKey(PurchaseOrder, related_name='lines',
                                    on_delete=models.CASCADE)
    line_no     = models.IntegerField()
    description = models.TextField()
    item_type   = models.CharField(max_length=10, choices=ItemType.choices)

    qty_ordered = models.DecimalField(max_digits=14, decimal_places=3)
    unit        = models.CharField(max_length=20)
    rate        = models.DecimalField(max_digits=14, decimal_places=2)
    amount      = models.DecimalField(max_digits=14, decimal_places=2)
    gst_rate    = models.DecimalField(max_digits=5,  decimal_places=4)

    work_done_on       = models.DateField(null=True)
    client_approved_on = models.DateField(null=True)
    short_closed_on    = models.DateField(null=True)
    short_close_reason = models.TextField(blank=True)

    # Release 1 scaffolding only — dropped at Milestone 5 (PRD risk R6)
    interim_status = models.CharField(max_length=30, blank=True)

    # NOTE: there is deliberately NO `status` field. See SCHEMA.md rule D1.
```

**The most important line in this document is that last comment.** Any future contributor who adds a `status` column to `POLineItem` breaks the model. The test suite asserts the column does not exist.

### 3.3 Permission classes

Mirrors [PRD §5.2](PRD.md) exactly. Enforced server-side; UI visibility is never the gate.

```python
# tracker/permissions.py
ROLE_OWNER, ROLE_STAFF, ROLE_ACCOUNTS, ROLE_ADMIN = 'owner', 'staff', 'accounts', 'admin'

def get_role(user):
    role = AppUserRole.objects.filter(user=user, is_active=True).first()
    return role.role if role else None

class IsTrackerUser(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and get_role(request.user) is not None

class CanEditPO(IsTrackerUser):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and \
               get_role(request.user) in (ROLE_STAFF, ROLE_ADMIN)

class CanRecordMoney(IsTrackerUser):        # bills, Ariba, payments
    def has_permission(self, request, view):
        return super().has_permission(request, view) and \
               get_role(request.user) in (ROLE_ACCOUNTS, ROLE_ADMIN)

class CanShortClose(IsTrackerUser):         # deliberately NOT staff
    def has_permission(self, request, view):
        return super().has_permission(request, view) and \
               get_role(request.user) in (ROLE_OWNER, ROLE_ADMIN)

class IsAdmin(IsTrackerUser): ...
```

**Why `CanShortClose` excludes staff:** short-closing removes work from the pending list permanently. That is a commercial decision, not a data-entry one.

### 3.4 The PO revision transaction

The trickiest write path in the system. It must carry forward existing allocations.

```python
# tracker/services/po_service.py
@transaction.atomic
def revise_po(*, po: PurchaseOrder, new_lines: list[dict], reason: str, actor) -> PurchaseOrder:
    """Create a successor PO, supersede the original, carry allocations forward.

    Confirmed necessary: 14 revision markers in the legacy workbook, mostly
    'PO Changed with Tax' — a tax-less PO reissued with 18% GST.
    """
    successor = PurchaseOrder.objects.create(
        client=po.client, site=po.site, po_number=po.po_number,
        po_date=po.po_date, po_category=po.po_category,
        revision_of=po, revision_reason=reason, created_by=actor,
    )
    line_map = {}
    for spec in new_lines:
        new_line = POLineItem.objects.create(po=successor, **spec)
        if spec.get('carries_from_line_id'):
            line_map[spec['carries_from_line_id']] = new_line

    # Re-point existing delivery and billing allocations onto the successor's lines.
    # Without this, work already delivered or billed would silently vanish.
    remap_allocations(ChallanAllocation, line_map)
    remap_allocations(BillAllocation,    line_map)

    po.status = PurchaseOrder.Status.SUPERSEDED
    po.superseded_by = successor
    po.save(update_fields=['status', 'superseded_by', 'updated_at'])
    return successor
```

`test_revision_preserves_delivered_quantities` is a mandatory test.

### 3.5 Bill allocation invariant

```python
@transaction.atomic
def allocate_bill(*, bill: Bill, allocations: list[dict], actor):
    total = Decimal('0.00')
    for a in allocations:
        amount = (a['qty'] * a['rate']).quantize(Decimal('0.01'))
        gst    = (amount * a['gst_rate']).quantize(Decimal('0.01'))
        BillAllocation.objects.create(
            bill=bill, line_item_id=a['line_item_id'],
            qty=a['qty'], rate=a['rate'], amount=amount,
            gst_rate=a['gst_rate'], gst_amount=gst, total_amount=amount + gst,
        )
        total += amount + gst
    bill.refresh_from_db()          # the trigger has recomputed the header
    if bill.total_amount != total:
        raise IntegrityError('Bill totals diverged from allocations')
```

Over-billing (`qty_billed > qty_ordered`) is **permitted but flagged**, never blocked — 16 such rows exist in the real data, and blocking would make migration impossible.

### 3.6 Bill number validation

```python
BILL_NUMBER_RE = re.compile(r'^(?P<prefix>[A-Z]+)/(?P<serial>\d+)/(?P<y1>\d{2})-(?P<y2>\d{2})$')

def validate_bill_number(value: str) -> None:
    m = BILL_NUMBER_RE.match(value.strip())
    if not m:
        raise ValidationError('Format must be PREFIX/serial/YY-YY, e.g. UP/000038/24-25')
    if int(m['y2']) != int(m['y1']) + 1:
        raise ValidationError(f"Financial year {m['y1']}-{m['y2']} is impossible")
```

This exists because **33 legacy bill numbers fail it** — `UP/000037/24-26` through `/24-37`, and `HR/000143/24-37`. Enforced on new entry; legacy rows import with `needs_review=True` rather than being rejected.

### 3.7 Search

One query across everything, because people search by whatever they have to hand (PRD risk R11).

```python
def search(term: str, limit: int = 50):
    return PurchaseOrder.objects.filter(
        Q(po_number__icontains=term) |
        Q(client__name__icontains=term) |
        Q(site__code__iexact=term) |
        Q(site__name__icontains=term) |
        Q(lines__description__icontains=term) |
        Q(lines__billallocation__bill__bill_number__icontains=term) |
        Q(lines__challanallocation__challan__challan_number__icontains=term)
    ).filter(is_deleted=False).distinct()[:limit]
```

Backed by `idx_line_desc_ft` (GIN) and trigram indexes on the number columns. **Never validates the format of the search term.**

### 3.8 Audit

Middleware captures `request.user` into a thread-local; `post_save` / `post_delete` receivers on every financial model write `AuditLog` with `before_json` / `after_json`. Soft delete sets `is_deleted=True`; nothing is ever physically removed.

### 3.9 API conventions

| Concern | Convention |
|---|---|
| Base path | `/api/v1/` |
| Auth | Session cookie + `X-CSRFToken` header |
| Pagination | `{count, next, previous, results[]}`, default page size 50 |
| Errors | `{detail}` for 4xx; `{field: [messages]}` for validation |
| Money in JSON | **Strings**, never JSON numbers — `"44840.00"` |
| Concurrency | Optimistic locking via `updated_at`; mismatch returns `409` |
| Dates | ISO-8601 `YYYY-MM-DD` only, in both directions |

**Money as strings is not a stylistic choice.** JavaScript numbers are IEEE-754 doubles; ₹12,07,77,682 with paise will drift. The frontend formats from the string and never does arithmetic on it.

---

## 4. Frontend — React + shadcn/ui

**Governing rule: do not build a component that shadcn/ui already ships.** Radix primitives give correct accessibility, focus management and keyboard behaviour for free. Hand-rolling them is a defect, not craftsmanship. The full component inventory and the theme contract live in [DESIGN.md](DESIGN.md).

### 4.1 Structure

```
frontend/src/
├── api/            # axios client + CSRF interceptor, typed endpoints
├── components/
│   ├── ui/              # shadcn/ui — GENERATED, edit only to add cva variants
│   ├── LineItemGrid/    # CUSTOM — the critical keyboard-first entry grid
│   ├── AllocationBar/   # thin wrapper over shadcn Progress
│   ├── MoneyStrip/      # composed from Card + Separator
│   ├── StatusBadge/     # shadcn Badge + a `status` cva variant
│   ├── PasteBlockImport/  # CUSTOM — Phase 4
│   └── PdfReview/         # CUSTOM — Phase 4
├── features/
│   ├── auth/ po/ search/ challan/ bill/ payment/ import/ dashboard/
├── hooks/          # usePermission, useOptimisticLock
├── lib/            # money.ts (decimal.js), dates.ts, poNumber.ts, utils.ts (cn)
└── types/          # generated from DRF serializers
```

`components/ui/` is generated by the shadcn CLI. Treat it as vendored: regenerate rather than refactor, and confine changes to added `cva` variants (e.g. the `status` variant on `Badge`).

### 4.2 Stack

| Concern | Library |
|---|---|
| Build | Vite |
| Language | TypeScript, `strict: true` |
| **Component library** | **shadcn/ui (Radix + Tailwind)** |
| **Theme** | **"Twitter" from shadcnthemer.com + 3 documented overrides — [DESIGN.md §3](DESIGN.md)** |
| Icons | lucide-react (shadcn default) |
| Server state | TanStack Query |
| Client state | Zustand (auth/session only) |
| Forms | React Hook Form + Zod, via shadcn `Form` |
| Tables | TanStack Table rendered through shadcn `Table` |
| Toasts | `sonner` |
| Money | `decimal.js` — **never native `number`** |
| Styling | Tailwind CSS |

### 4.2.1 Setup

```bash
npx shadcn@latest init
npx shadcn@latest add https://shadcnthemer.com/r/themes/abb2128e-7392-4ec7-880c-ef68a0051da3.json
npx shadcn@latest add sidebar breadcrumb button card table tabs badge input \
  select dropdown-menu dialog sheet command popover tooltip switch checkbox \
  progress separator avatar skeleton sonner form label textarea alert \
  scroll-area collapsible pagination
```

Two of the three theme URLs supplied are byte-identical (verified by diffing every light and dark token); the one above is that theme. The three required overrides — `muted-foreground`, `secondary`, and the `background`/`card` swap — are specified in [DESIGN.md §3.3](DESIGN.md) and belong in `app.css`, **never** in the vendored theme file.

### 4.3 The line item grid — the highest-risk component

PRD risk R1 says the project dies if entry is slower than Excel. This component is where that is won or lost.

**Requirements:**
- `Tab` / `Shift+Tab` moves cell to cell; `Enter` on the last cell adds a new row.
- `Ctrl+D` copies the cell above. `Ctrl+V` on a multi-row clipboard payload fills many rows at once.
- Amount auto-computes from qty × rate and is never typed.
- GST rate defaults from `client.default_gst_rate` (usually 0%).
- Item type is guessed from the description — `Supply of…` → material; `Installation of…` / `Providing and fixing…` / `Dismantling…` → service — always overridable.
- **No mouse required** to enter a complete 7-line PO.

**Acceptance is a stopwatch, not a code review.**

### 4.4 CSRF interceptor

```ts
axios.interceptors.request.use((config) => {
  if (!['get', 'head', 'options'].includes(config.method ?? '')) {
    config.headers['X-CSRFToken'] = getCookie('csrftoken');
  }
  return config;
});
```

`CSRF_COOKIE_HTTPONLY = False` so the SPA can read the token.

### 4.5 Permission hook

```ts
const { can } = usePermission();
{can('po.edit')         && <Button>Edit</Button>}
{can('line.shortClose') && <Button>Close short</Button>}
```

**Hiding a button is a courtesy, not security.** Every action is re-checked server-side.

---

## 5. Testing Strategy

| Layer | Tool | Must cover |
|---|---|---|
| Model / view | pytest-django | Every branch of `v_line_item_status`, including over-billing and short-close |
| Property | Hypothesis | Bill allocations always re-sum to the header exactly |
| Permission | pytest-django | Full PRD §5.2 matrix, asserted at the **API**, bypassing the UI |
| Service | pytest-django | Revision preserves delivered quantities; payment allocation with TDS reconciles |
| Migration | pytest-django | Real workbook fixture → expected row counts and review-queue classification |
| Frontend | Vitest + Testing Library | Grid keyboard navigation, paste-block parsing |
| E2E | Playwright | login → create PO → search → detail → export |

**Coverage target: 85% on `tracker/`, 100% on `services/` and `permissions.py`.**

See [TEST_PLAN.md](TEST_PLAN.md) for the full case list.

---

## 6. Deployment & Operations

| Concern | Decision |
|---|---|
| Environments | `dev` (local), `prod`. No staging until Milestone 5. |
| Database | Managed Postgres with **point-in-time restore** |
| Backups | Daily automated + **a restore drill before Milestone 3 loads real data** |
| Secrets | Environment variables; `.env.example` committed, `.env` never |
| Static / SPA | Vite build served by the app host; API same-origin (no CORS) |
| Migrations | `migrate` runs on deploy; every migration must be reversible |
| Logging | JSON to stdout; every financial mutation logs actor + entity id |
| Monitoring | Uptime ping + error tracking. No APM at this scale. |

**An untested backup is not a backup.** The restore drill is a checklist item, not an intention.

---

## 7. Decision Log

| # | Decision | Alternatives | Why |
|---|---|---|---|
| 1 | Django + DRF + React + Postgres | Next.js; Django + HTMX; no-code | Relational core, Python migration path, proven in-house, free admin |
| 2 | Status derived in a SQL view | Stored status column | 94 partially-billed lines prove an enum cannot express reality |
| 3 | Allocation tables for bills and challans | FK from bill to PO | Bills and challans provably span multiple POs |
| 4 | Rate on the allocation | Rate only on the line | 24 lines billed at a divergent rate |
| 5 | `numeric(14,2)` + `Decimal` | Integer paise | Postgres `numeric` is exact and idiomatic in Django; supersedes the earlier integer-paise note |
| 6 | Money as strings over the API | JSON numbers | JS doubles drift on crore-scale values with paise |
| 7 | Session auth | JWT | Internal tool; no token lifecycle to get wrong |
| 8 | Over-billing flagged, not blocked | Hard constraint | 16 real rows would otherwise make migration impossible |
| 9 | Payments attach to client | Payments attach to bill | Advances arrive before any bill exists |
| 10 | `interim_status` as separate scaffolding | Reuse a status field | Guarantees Release 1's hand-set values can never contaminate derived status |
| 11 | shadcn/ui as the component layer | Hand-rolled design system (v1 of DESIGN.md); MUI; Ant Design | Radix accessibility for free, code is owned not vendored, and it removes ~40 components from the build. Supersedes the custom system in DESIGN.md v1.0. |
| 12 | "Twitter" theme, with 3 overrides | Midnight Bloom; theme as-shipped | Its primary is the exact blue of the VANTUS reference. Overrides fix `muted-foreground` (shipped identical to `foreground`), `secondary` (shipped near-black), and the inverted `background`/`card` pair. See [DESIGN.md §3.3](DESIGN.md). |
| 13 | Only 3 custom components | Custom everything; library everything | Line item grid, paste-block importer and PDF review have no library equivalent. Everything else is shadcn. |

---

*See [SCHEMA.md](SCHEMA.md) for the authoritative data model and [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for the build sequence.*
