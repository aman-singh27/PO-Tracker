# Plan: PO Tracker — Release 1 Foundation

**Source PRD**: `.claude/prds/po-tracker.prd.md`
**Selected Milestones**: 1 (Foundation & data model) + 2 (PO entry & PO-first search)
**Complexity**: **Large** — greenfield, and the schema must be right the first time
**Status**: DRAFT — awaiting confirmation. No code written.

---

## Summary

Stand up a multi-user web application and, critically, a **data model that already accounts for everything we confirmed in the legacy data**: partial delivery and partial billing, many-to-many bills and challans, and first-class PO revisions. Milestones 1–2 deliver login, master data, PO + line-item entry, and PO-first search. Milestones 3–4 (migration, paste-block and PDF import) complete Release 1 under separate plans.

The schema is built **in full** now, even though Release 1 only exposes part of it in the UI. This is deliberate: the P0 findings prove the cheap model is the wrong model, and retrofitting quantity ledgers onto live financial data is the most expensive mistake available here.

---

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Naming | — | **No existing code.** Conventions established by this plan. |
| Errors | — | **No existing code.** |
| Logging | — | **No existing code.** |
| Data access | — | **No existing code.** |
| Tests | — | **No existing code.** |

**Greenfield.** The only prior art is `PO TRACKER.xlsx`, which supplies the *domain* vocabulary (PO No., Delivery Challan No, Billing Qty, Uploaded in Ariba) — mirror that vocabulary in table and field names so the office staff recognise their own terms. Do not mirror its structure.

---

## Decision needed before Task 1: the stack

One choice, cheap to change now and expensive later. Recommendation first.

**Option A — Next.js + TypeScript + PostgreSQL (recommended).**
One language front-to-back, excellent mobile rendering for the owner's dashboards, trivial deployment, and the largest ecosystem for AI assistance. Managed Postgres (Neon or Supabase) gives point-in-time restore out of the box, which R10 requires.
*Trade-off:* you build the master-data CRUD screens yourself.

**Option B — Django + PostgreSQL + HTMX.**
Django admin gives working CRUD for masters on day one, and Python is already how we read the Excel file — the Milestone 3 migration script would be materially simpler and would reuse the `openpyxl` work already done in this analysis.
*Trade-off:* owner-facing mobile dashboards need more effort.

**Option C — Off-the-shelf (Zoho Creator, Baserow, NocoDB, Airtable).**
Fastest to something usable, no code to maintain. **But** the confirmed many-to-many allocation model with derived stages is exactly where no-code tools break down, per-user pricing bites at 15 users, and you cannot own the data model. Listed for completeness; not recommended given what we found.

**Recommendation: Option A**, unless you want the Django admin head-start on masters and migration, in which case B is genuinely defensible. **The schema below is identical either way** — nothing in this plan is wasted by deciding later.

---

## The data model (the load-bearing part of this plan)

Every constraint below traces to a measured finding in the PRD's Evidence section.

### Core

| Table | Purpose | Why it looks like this |
|---|---|---|
| `legal_entity` | Our own billing entities | Two invoice series found (`UP/…`, `HR/…`) ⇒ likely two GST registrations. Holds GSTIN, state, invoice prefix. |
| `client` | HCL, DLF, Metlife, Satya Prakash | PO number formats differ per client — format is a client attribute, never a global rule. |
| `site` | AN04, AN08, AN22, AP08, Mall of India… | The owner asks questions per site. Site belongs to a client. |
| `purchase_order` | PO header | `po_number` unique **per client**, not globally. |
| `po_line_item` | The unit of everything | `qty_ordered`, `unit`, `rate`, `gst_rate` (**per line** — 948 lines at 0%, 502 at 18%), `item_type` ∈ {material, service}. |

### PO revisions — first class, not free text

`purchase_order` carries `revision_of_po_id`, `revision_reason`, `status` ∈ {active, superseded, cancelled}. Confirmed necessary: the legacy file contains `PO Changed`, `PO Amended`, `PO revised with Tax`, `PO Changed with Tax @18%`, and a cancellation naming its replacement (`…new po. No-9200160448`). The dominant reason is visible in the wording — **a tax-less PO reissued with 18% GST** — so a revision must be able to **carry forward work already done** against superseded lines.

### Quantity ledgers — the finding that rules out the simple model

Line items do **not** store a stage. Stage is **derived** from allocations:

| Table | Shape | Why |
|---|---|---|
| `challan` | number, date, site, delivery source, bill-to, ship-to | Bill-to ≠ ship-to observed (Metlife → "K C Infra"). |
| `challan_allocation` | `(challan_id, line_item_id, qty)` | **Many-to-many with a quantity.** 4 challans span multiple POs; 71 lines delivered under-qty, 35 over. |
| `bill` | entity, number, date, totals, `ariba_uploaded_at`, `ariba_status` | Ariba can plausibly reject — a status, not just a date. |
| `bill_allocation` | `(bill_id, line_item_id, qty, rate, amount, gst_rate, gst_amount)` | **Many-to-many.** 52 POs have >1 bill (max **13**); at least 2 bills span multiple POs; 24 lines billed at a rate ≠ PO rate, so rate lives on the allocation. |
| `payment` | `(client_id, received_on, amount, mode, reference)` | Attaches to the **client**, not a bill — advances arrive before any bill exists. |
| `payment_allocation` | `(payment_id, bill_id, amount, kind)`, kind ∈ {payment, tds, retention, discount, write_off} | TDS is a *deduction*, not an outstanding. Without this, receivables never reconcile (R7). |

**Derived stage** (a database view, never a stored column):

```
qty_delivered = Σ challan_allocation.qty
qty_billed    = Σ bill_allocation.qty

short_closed                → CLOSED_SHORT
qty_billed ≥ qty_ordered    → BILLED (+ ARIBA_PENDING if not uploaded; PAID when settled)
qty_billed > 0              → PART_BILLED
qty_delivered ≥ qty_ordered → DELIVERED
qty_delivered > 0           → PART_DELIVERED
otherwise                   → ORDERED
```

Material lines legitimately skip the challan stages — that is data, not a special case.

### Supporting

`app_user`, `role`, `audit_log` (every financial mutation, R10), `import_batch`, `import_review_item` (the needs-review queue, R3).

---

## Files to Change

Illustrative for Option A; the shape holds for B. Nothing here exists yet.

| File | Action | Why |
|---|---|---|
| `package.json`, `tsconfig.json`, `.env.example` | CREATE | Project skeleton |
| `db/schema.sql` (or ORM schema) | CREATE | The model above, in full |
| `db/migrations/0001_init.sql` | CREATE | Versioned from commit one |
| `db/views/line_item_status.sql` | CREATE | The derived-stage view |
| `src/lib/db.ts` | CREATE | Single data-access entry point |
| `src/lib/auth.ts` | CREATE | Sessions, roles |
| `src/lib/money.ts` | CREATE | **Integer paise arithmetic** — never floats for money |
| `src/lib/po-number.ts` | CREATE | Per-client format validation, permissive by default (R13) |
| `src/app/(auth)/login` | CREATE | Login |
| `src/app/po/new` | CREATE | PO + line-item entry form |
| `src/app/po/[id]` | CREATE | PO detail — the "click a PO, see everything" page |
| `src/app/search` | CREATE | Single search box across PO/bill/challan/client/site/description |
| `src/app/api/export` | CREATE | One-click Excel export (R1 mitigation) |
| `tests/` | CREATE | Test conventions established here |
| `README.md`, `docs/DECISIONS.md` | CREATE | Bus-factor mitigation (R9) |

---

## Tasks

### Task 1 — Stack decision and repo skeleton
- **Action**: Confirm Option A/B. `git init`, scaffold, linter, formatter, `.env.example`, CI running lint + tests on push.
- **Mirror**: Nothing to mirror. Establish and document conventions in `docs/DECISIONS.md`.
- **Validate**: CI green on an empty test suite. App boots locally.

### Task 2 — Database and the full schema
- **Action**: Provision managed Postgres with **point-in-time restore enabled**. Write migration `0001_init` covering every table above — including challans, bills and payments, which Release 1 does not yet expose.
- **Mirror**: Domain vocabulary from the workbook headers.
- **Validate**: Migration applies to an empty database and rolls back cleanly. Foreign keys and unique constraints present. `po_number` unique per client, not globally.

### Task 3 — Money and quantity primitives
- **Action**: All monetary values as **integer paise**. Quantities as decimal with explicit scale. No floating-point money anywhere.
- **Mirror**: —
- **Validate**: Property test — allocating a bill across N lines always re-sums to the bill total exactly, with no drift.

### Task 4 — The derived-stage view
- **Action**: Implement `line_item_status` per the rules above. Read-only. No stored stage column anywhere.
- **Mirror**: —
- **Validate**: Fixture tests covering every branch: nothing done; part-delivered; fully delivered; part-billed; **over-billed** (16 such rows exist); short-closed; material line skipping challan entirely.

### Task 5 — Auth and roles
- **Action**: Email + password login. Roles: `owner` (read-all, sees money), `staff` (create/edit POs), `admin` (masters + users). Sessions, password reset.
- **Mirror**: —
- **Validate**: A `staff` session cannot reach owner-only money endpoints. Assert at the API, not just the UI.

### Task 6 — Audit log
- **Action**: Every insert/update/delete on financial tables writes actor, timestamp, before/after. Soft delete only.
- **Mirror**: —
- **Validate**: Editing a line item's rate produces a retrievable audit row showing both values.

### Task 7 — Master data: entities, clients, sites
- **Action**: CRUD for `legal_entity`, `client`, `site`. Seed from the workbook: HCL (AN04, AN08, AN22, AP08), DLF (Mall of India), Metlife, Satya Prakash; entities for the `UP/` and `HR/` invoice series.
- **Mirror**: Site codes exactly as they appear in the file.
- **Validate**: Seed script is idempotent — running twice changes nothing.

### Task 8 — PO entry form
- **Action**: Create/edit a PO with N line items in one screen. Keyboard-first: tab through, add a row without reaching for the mouse. Per-line `item_type` and `gst_rate` (defaulting **per client**, since 0% is the majority), live totals.
- **Mirror**: Column order from the workbook, so the form reads like the sheet staff already know.
- **Validate**: **Timed test — enter a real 7-line PO faster than the same PO into Excel.** If it is slower, Task 8 is not done (R1).

### Task 9 — PO revision handling
- **Action**: "Revise this PO" creates a linked successor, marks the predecessor `superseded`, captures a reason, and carries forward existing allocations. "Cancel and replace" links to the replacement PO.
- **Mirror**: The reasons already in the data — *changed with tax*, *amended*, *cancelled, new PO no.*
- **Validate**: Revising a PO with delivered quantities preserves them and does not double-count in any total.

### Task 10 — PO detail page
- **Action**: The owner's screen. Header, every line with derived stage, ordered/delivered/billed/paid quantities, and a money strip: ordered ₹ / delivered ₹ / billed ₹ / uploaded ₹ / paid ₹ / **outstanding ₹**. Reads correctly on a phone.
- **Mirror**: The owner's own framing — *"kitne ka bill ho gaya, kitna kiska reh gaya."*
- **Validate**: For a fully-billed legacy PO, the page's totals match the workbook's Grand Total to the rupee.

### Task 11 — Search
- **Action**: One box. Matches PO number, bill number, challan number, client, site and description. Partial and case-insensitive; never enforces a PO number format.
- **Mirror**: —
- **Validate**: Searching `9200146935` (the PO duplicated across three sheets) returns exactly one result. Sub-second on 2,134 seeded rows.

### Task 12 — Excel export
- **Action**: Export the current view to `.xlsx` with real dates and a real status column.
- **Mirror**: Workbook column order, so the output is familiar.
- **Validate**: Export opens in Excel; dates sort correctly; totals reconcile with the app.

### Task 13 — Seed and smoke
- **Action**: Seed ~20 representative POs covering every awkward case found: the 79-line PO, the 13-bill PO, a cross-PO bill, a cross-PO challan, an over-delivery, a 0% GST line, a revised PO.
- **Mirror**: Real rows from the workbook.
- **Validate**: Full smoke test passes against seeded data.

---

## Validation

To be created by Task 1 — these do not exist yet:

```bash
npm run lint          # or: ruff check .
npm run typecheck     # or: mypy .
npm test              # unit + integration; must cover every stage-derivation branch
npm run db:migrate    # applies cleanly to an empty database
npm run db:seed       # idempotent
npm run test:e2e      # login -> create PO -> search -> open detail -> export
```

**Additional gate, not automatable:** the Task 8 timed entry test against Excel.

---

## Risks

Inherited from the PRD; these are the ones that bite *this* plan.

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Interim stage marking creates a bad habit.** Release 1 has no challans or bills, so staff must set stage by hand — and may keep doing so after real stages ship. | **High** | Store hand-set stage in a clearly separate `interim_stage` column that the derived view **overrides** the moment allocations exist. Never let it write to the same field. Plan its removal in Milestone 6. |
| **Over-building the schema for Release 1.** Tables nobody touches for months. | Medium | Accepted deliberately. Migrating live financial data later costs far more than unused tables now. Tables are cheap; re-migrations are not. |
| **Entry is slower than Excel** (PRD R1 — the top adoption risk) | **High** | Task 8's timed test is a hard gate, not a nice-to-have. Ship paste-block (Milestone 4) close behind. |
| **Stack chosen by inertia rather than fit** | Medium | Decide explicitly at Task 1, record it in `docs/DECISIONS.md`. Nothing here is stack-specific except file paths. |
| **Money drift from floating point** | Medium | Integer paise everywhere (Task 3), enforced by a property test. |
| **Backups untested** | Low / Critical | Restore drill before Milestone 3 loads real data. An untested backup is not a backup. |

---

## Acceptance

- [ ] Stack decided and recorded in `docs/DECISIONS.md`
- [ ] Full schema migrated, including tables Release 1 does not yet use
- [ ] Derived-stage view implemented; **no stored stage column exists**
- [ ] Every stage-derivation branch covered by a test, including over-billing and short-close
- [ ] Money is integer paise throughout, proven by property test
- [ ] Login and roles enforced at the API layer, not only the UI
- [ ] Audit log captures before/after on financial mutations
- [ ] A real 7-line PO can be entered **faster than into Excel** (timed)
- [ ] PO detail totals reconcile to the rupee against a known workbook PO
- [ ] Search finds a PO by number, bill number and site
- [ ] Excel export produces real dates and a real status column
- [ ] Backup restore drill completed successfully

---

## Not in this plan

Milestone 3 (legacy migration of 259 POs) and Milestone 4 (paste-block and PDF import) complete Release 1 and get their own plans. Milestone 3 in particular deserves a dedicated plan — it carries R3, the trust-eroding risk, and must handle 48 duplicate POs, 889 text dates, 33 malformed bill numbers, and status recoverable only from theme-indexed cell colours.

---

*WAITING FOR CONFIRMATION — no code will be written until this plan is approved.*
