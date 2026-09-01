# PO Tracker — Site Structure

**Version:** 1.0
**Routing:** React Router · SPA served same-origin with the API
**Components:** shadcn/ui — see [DESIGN.md](DESIGN.md)

---

## Site Map

```
/login                              Public
/force-password-change              Authenticated, first login only

/                                   Dashboard (role-dependent)
/search?q=                          Global search results

/po                                 Purchase Orders list
/po/new                             Create PO
/po/:id                             PO detail  ← the core screen
/po/:id/edit                        Edit PO
/po/:id/revise                      Revise PO (creates successor)
/po/import                          Paste-block / PDF import          [Phase 4]

/challans                           Challan list                       [Phase 5]
/challans/new                       Record challan                     [Phase 5]
/challans/:id                       Challan detail                     [Phase 5]

/bills                              Bill list                          [Phase 6]
/bills/new                          Record bill + allocations          [Phase 6]
/bills/:id                          Bill detail                        [Phase 6]
/bills/ariba                        Ariba upload queue                 [Phase 6]

/payments                           Payment list                       [Phase 7]
/payments/new                       Record payment + allocation        [Phase 7]
/payments/:id                       Payment detail                     [Phase 7]

/reports/pending                    Pending work                       [Phase 8]
/reports/receivables                Receivables ageing                 [Phase 8]
/reports/unbilled                   Work done but unbilled             [Phase 8]

/review                             Import review queue          Admin only
/review/:batchId                    Batch detail                 Admin only

/settings/clients                   Clients & sites              Admin only
/settings/entities                  Legal entities               Admin only
/settings/users                     User management              Admin only
/settings/audit                     Audit log                    Owner + Admin
/profile                            Own profile / password
```

**Release 1 ships:** login, force-password-change, dashboard, search, `/po/*`, `/review/*`, `/settings/*`, `/profile`. Everything marked `[Phase N]` comes later.

---

## Page-by-Page

### 1. Login — `/login`

Centred `Card` on `--background`. Logo, email `Input`, password `Input`, submit `Button`. Errors in `Alert variant="destructive"` with the real reason. No signup link — Admin creates all accounts.

**On success:** redirect to `/force-password-change` if `force_password_change` is set, otherwise to `/`.

---

### 2. Force Password Change — `/force-password-change`

Same shell as login. Old password, new password, confirm. Blocks every other route until cleared. Admin-issued passwords always land here first.

---

### 3. Dashboard — `/`

**Role-dependent, and deliberately so.**

**Owner** — the mobile-first layout from [DESIGN.md §15](DESIGN.md):
- Outstanding total, largest element on screen
- Outstanding by client (`Table`, 4 rows)
- Pending work: line count + value
- Ariba backlog: value + count
- Search entry point

**Staff** — work queues, not metrics:
- POs with nothing delivered
- Work done but unbilled, ageing
- Recently edited by me
- Quick action: Add PO

**Accounts** — money queues:
- Bills pending Ariba upload
- Bills overdue by client
- Unallocated payments and advances

**Admin** — the above, plus the open review-queue count.

---

### 4. Purchase Orders — `/po`

Table card per [DESIGN.md §12](DESIGN.md).

| Element | Detail |
|---|---|
| Tabs | All · Pending · Part Billed · Billed · Needs Review |
| Toolbar | Search `Input`, Client `Select`, Site `Select`, Status `Select`, Sort `DropdownMenu`, Export `Button` |
| Columns | PO Number · Client · Site · PO Date · Lines · Status · Amount · ⋮ |
| Row | 52px. Status is the derived PO roll-up. `needs_review` rows carry the review left-border. Superseded rows at 60% opacity with a `SUPERSEDED` badge. |
| Kebab | View · Edit · Revise · Cancel & replace · Export |
| Primary action | **Add PO** |

Amount column right-aligned with `.num`. Default sort: PO date descending.

---

### 5. PO Detail — `/po/:id` ← **the core screen**

The direct answer to *"PO pe click karein aur uska saara aa jaaye."*

```
Breadcrumb: Purchasing › Purchase Orders › 8100013678
┌──────────────────────────────────────────────────────────────┐
│ PO Header — metadata grid (DESIGN §11)                    ⋮  │
│ 🗎 8100013678 │ 🏢 HCL │ 📍 AN22 │ 📅 07/12/2024 │ Service   │
├──────────────────────────────────────────────────────────────┤
│ Money Strip (DESIGN §8)                                      │
│ ORDERED  DELIVERED  BILLED  UPLOADED  PAID                   │
│ OUTSTANDING ₹16,164        TDS ₹4,484 · Retention ₹0         │
├──────────────────────────────────────────────────────────────┤
│ Tabs: Lines (7) │ Challans │ Bills │ Payments │ History      │
├──────────────────────────────────────────────────────────────┤
│ #  DESCRIPTION           TYPE     QTY  RATE  AMOUNT  STATUS  │
│ 1  SUPPLY OF PHILIPS…    Material  50  760  38,000  [BILLED] │
│    └ expand → allocation bars (DESIGN §9)                    │
└──────────────────────────────────────────────────────────────┘
```

- **Lines tab** — every line with derived status. Expanding a row reveals the allocation bars and the challans/bills that touch it.
- **Challans / Bills / Payments tabs** — everything allocated to this PO's lines. Because allocations are many-to-many, a bill listed here may also cover another PO; that is labelled inline, not hidden.
- **History tab** — audit log for this PO plus the revision chain.
- Clicking a money-strip column filters the Lines tab to that stage.
- Kebab: Edit · Revise · Cancel & replace · Short-close a line (owner/admin) · Export.

---

### 6. Create / Edit PO — `/po/new`, `/po/:id/edit`

Full page, not a dialog — a 79-line PO does not belong in a modal.

1. **Header form** — client, site, PO number, PO date, category, quotation number *(Phase 9)*
2. **Line item grid** — the custom keyboard-first component ([DESIGN.md §10](DESIGN.md))
3. **Footer** — live totals, Save, Cancel

PO number is validated for **uniqueness per client**, never for format. Unsaved-changes guard on navigation.

---

### 7. Revise PO — `/po/:id/revise`

Pre-filled with the current lines. Requires a `revision_reason`. Shows which lines already carry delivered or billed quantity and warns that those carry forward. On save: successor created, predecessor marked `superseded`, allocations re-pointed, redirect to the successor.

---

### 8. Import — `/po/import` *(Phase 4)*

Three tabs: **Paste from Excel** · **Upload PO PDF** · **Manual entry**.

Both automated paths land on a review screen before anything is written. PDF review is side-by-side against the source with per-field confidence. **Nothing auto-saves.**

---

### 9. Review Queue — `/review` *(Admin only)*

| Element | Detail |
|---|---|
| Tabs | Open · Resolved · By batch |
| Filters | Reason code, severity, source sheet |
| Columns | Severity · Reason · Source ref (`HCL PO!A471`) · Payload summary · ⋮ |
| Actions | Accept as-is · Correct and accept · Reject |

Everything unresolved is excluded from headline totals everywhere. The sidebar badge shows the open count and vanishes at zero.

---

### 10. Search — `/search?q=`

The `Command` palette (⌘K, `/`) gives inline results; this page is the full listing. Results grouped by type: Purchase Orders · Line Items · Bills · Challans · Clients. Never validates the query format.

---

### 11. Settings

- **`/settings/clients`** — clients and their sites; `default_gst_rate`, `po_number_hint`, payment terms
- **`/settings/entities`** — legal entities, GSTIN, state, invoice prefix (`UP`, `HR`)
- **`/settings/users`** — user list, role assignment, enable/disable, password reset
- **`/settings/audit`** — audit log with actor/table/date filters and a before/after diff

---

## API Endpoint Summary

All under `/api/v1/`. Session cookie + `X-CSRFToken`. Money as strings, dates ISO-8601.

### Auth
```
POST   /auth/login                     {email, password}
POST   /auth/logout
GET    /auth/me                        → {user, role, permissions[]}
POST   /auth/change-password
POST   /auth/reset-password/:userId    Admin only
```

### Purchase Orders
```
GET    /pos                    ?client&site&status&needs_review&page&sort
POST   /pos                    Staff/Admin — nested lines, one transaction
GET    /pos/:id                → header + lines + derived status + money strip
PATCH  /pos/:id                Optimistic lock on updated_at → 409 on conflict
DELETE /pos/:id                Soft delete
POST   /pos/:id/revise         {reason, lines[]} → successor
POST   /pos/:id/cancel         {reason, replacement_po_id?}
GET    /pos/:id/history        Audit + revision chain
POST   /lines/:id/short-close  {reason} — Owner/Admin ONLY
PATCH  /lines/:id/work-done    Phase 5
PATCH  /lines/:id/approved     Phase 5
```

### Delivery, Billing, Money — Phases 5–7
```
GET|POST /challans             POST body carries allocations[]
GET      /challans/:id
GET|POST /bills                POST body carries allocations[]
GET      /bills/:id
PATCH    /bills/:id/ariba      {state, uploaded_on, reference, rejection_note}
GET      /bills/ariba-queue
GET|POST /payments             POST body carries allocations[] with kind
GET      /payments/:id
```

### Search, Reports, Import, Admin
```
GET    /search                 ?q=  — PO/bill/challan/client/site/description
GET    /reports/pending
GET    /reports/receivables
GET    /reports/unbilled
GET    /export/pos.xlsx
POST   /import/paste           {rows[], mapping} → preview, no write
POST   /import/pdf             multipart → extraction + confidence, no write
POST   /import/commit          {batch_id} → writes
GET    /review                 ?status&reason_code&batch
PATCH  /review/:id/resolve     {resolution, corrected_payload?}
GET|POST|PATCH /clients, /sites, /entities, /users     Admin only
GET    /audit                  ?table&row_id&actor&from&to
```

---

## Role-Based UI Matrix

Mirrors [PRD §5.2](PRD.md). **UI visibility is a courtesy; every route and endpoint re-checks server-side.**

| Route | Owner | Staff | Accounts | Admin |
|---|:---:|:---:|:---:|:---:|
| `/` dashboard | ✅ own view | ✅ own view | ✅ own view | ✅ |
| `/search` | ✅ | ✅ | ✅ | ✅ |
| `/po` list, `/po/:id` | ✅ | ✅ | ✅ | ✅ |
| `/po/new`, `/po/:id/edit` | ❌ | ✅ | ❌ | ✅ |
| `/po/:id/revise` | ❌ | ✅ | ❌ | ✅ |
| Short-close a line | ✅ | ❌ | ❌ | ✅ |
| `/po/import` | ❌ | ✅ | ❌ | ✅ |
| `/challans/*` write | ❌ | ✅ | ❌ | ✅ |
| `/bills/*`, `/payments/*` write | ❌ | ❌ | ✅ | ✅ |
| `/reports/*` | ✅ | ✅ | ✅ | ✅ |
| `/review/*` | ❌ | ❌ | ❌ | ✅ |
| `/settings/*` | ❌ | ❌ | ❌ | ✅ |
| `/settings/audit` | ✅ | ❌ | ❌ | ✅ |
| Export | ✅ | ✅ | ✅ | ✅ |

**Note the asymmetry on short-close:** staff who enter data cannot close work short; the owner who bears the commercial consequence can. This is deliberate — see [TECH_SPEC §3.3](TECH_SPEC.md).

---

## Global Components

| Component | Behaviour |
|---|---|
| **Sidebar** | Collapsible, role-filtered, review-count badge, persisted state |
| **Command palette** | ⌘K / `/` anywhere; searches every identifier |
| **Breadcrumb** | Every page; ancestors muted, current in foreground |
| **Notification bell** | Ariba backlog, unbilled ageing, open review items |
| **User menu** | Profile, change password, sign out |
| **Toast** (`sonner`) | Success/error, with undo where reversible |
| **Conflict banner** | Non-dismissable on 409; never silently overwrite |

---

*See [APP_FLOW.md](APP_FLOW.md) for the journeys through these pages and [DESIGN.md](DESIGN.md) for their visual specification.*
