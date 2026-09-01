# PO Tracker — Implementation Plan

**Version:** 1.0
**Source:** [PRD.md](PRD.md) · [TECH_SPEC.md](TECH_SPEC.md) · [SCHEMA.md](SCHEMA.md)
**Release 1 = Phases 0–4.** Everything after is gated on real usage feedback.

---

## How to Use This Document

Each phase lists tasks with the **file to create**, **what it does**, and **how it is validated**. A phase is not done until its validation passes. Progress is tracked in [TRACKER.md](TRACKER.md), which mirrors these tasks as checkboxes.

**Three rules that override convenience:**

1. **The full schema ships in Phase 1**, including bill and payment tables that Release 1 never displays. Unused tables are cheap; re-migrating live financial data is not.
2. **No task is complete without its test.** Tests marked MANDATORY are acceptance gates.
3. **Phase 4 has a stopwatch gate.** If PO entry is slower than Excel, Phase 4 is not done, regardless of what the code looks like.

---

## Phase 0 — Bootstrap (Day 0)

### 0.1 Repository & tooling
- `git init`, `.gitignore`, `README.md`, `docs/` (already present)
- `ruff` + `black` for Python; `eslint` + `prettier` for TypeScript
- Pre-commit hooks running both
- **Validate:** `ruff check .` and `npm run lint` exit 0 on an empty project

### 0.2 Django project
- `backend/config/settings/{base,dev,prod}.py`
- `tracker` app registered; `rest_framework` installed
- `CSRF_COOKIE_HTTPONLY = False`; `/api/v1/` routed
- `.env.example` committed with every variable named
- **Validate:** `python manage.py check` passes; server boots

### 0.3 React frontend
- Vite + React 18 + TypeScript (`strict: true`)
- Tailwind, TanStack Query, TanStack Table, React Hook Form, Zod, Zustand, `decimal.js`
- Vite proxy to `/api`
- **Validate:** `npm run build` succeeds; `npm run typecheck` clean

### 0.4 Database
- Provision managed Postgres **with point-in-time restore enabled**
- Confirm connection from Django
- **Validate:** `python manage.py dbshell` connects; PITR visible in the provider console

### 0.5 CI
- Lint + typecheck + test on every push
- **Validate:** CI green on an empty test suite

---

## Phase 1 — Data Model & Foundation (Days 1–2)

**The highest-stakes phase.** Everything downstream assumes this is right.

### 1.1 Master models
- `LegalEntity`, `Client`, `Site` per [SCHEMA.md §1](SCHEMA.md)
- **Validate:** migration applies and reverses cleanly

### 1.2 Purchase order models
- `PurchaseOrder` with `status`, `revision_of`, `superseded_by`, `revision_reason`
- `POLineItem` with quantity, rate, `gst_rate`, short-close fields, `interim_status`
- Partial unique index: `po_number` unique **per client**, live rows only
- **Validate:** the same `po_number` for two different clients succeeds; for the same client, fails

### 1.3 Allocation models
- `Challan` + `ChallanAllocation`
- `Bill` + `BillAllocation`
- `Payment` + `PaymentAllocation` with `allocation_kind`
- **Validate:** one bill can allocate to line items belonging to two different POs

### 1.4 Derived views — the core of the system
- `v_line_item_ledger`, `v_line_item_status`, `v_bill_settlement`, `v_po_summary`
- Shipped as a raw-SQL Django migration
- **Validate (MANDATORY):** a test asserting `POLineItem` has **no** `status` column

### 1.5 Triggers
- `trg_bill_totals`, `trg_line_amount`, `trg_audit_*`, `trg_updated_at`
- **Validate:** inserting a `BillAllocation` updates `bill.total_amount` without any application code

### 1.6 Status derivation tests (MANDATORY)
One test per branch. **This suite is the specification.**

| Case | Setup | Expect |
|---|---|---|
| Nothing done | line, no allocations | `ORDERED` |
| Part delivered | challan qty 30 of 50 | `PART_DELIVERED` |
| Fully delivered | challan qty 50 of 50 | `DELIVERED` |
| Work done | + `work_done_on` | `WORK_DONE` |
| Approved | + `client_approved_on` | `APPROVED` |
| Part billed | bill qty 20 of 50 | `PART_BILLED` |
| Fully billed | bill qty 50 of 50 | `BILLED` |
| **Over-billed** | bill qty 55 of 50 | `BILLED`, `is_over_billed = true` |
| **Over-delivered** | challan qty 60 of 50 | `is_over_delivered = true` |
| Short-closed | `short_closed_on` set, 45 of 50 billed | `CLOSED_SHORT` |
| Material skips challan | material line, billed, no challan | `BILLED`, no error |
| Interim ignored | `interim_status='BILLED'` plus a real allocation | derived value wins |

### 1.7 Money property test (MANDATORY)
Hypothesis: for any set of allocations, `sum(allocation.total_amount) == bill.total_amount` exactly. No drift.

### 1.8 Auth & roles
- `AppUserRole`, permission classes, login/logout/me, `force_password_change`
- `bootstrap_admin` management command
- **Validate (MANDATORY):** the full [PRD §5.2](PRD.md) matrix tested at the **API**, not the UI. Every role against every endpoint.

### 1.9 Audit log
- Middleware + signal receivers writing `before_json` / `after_json`
- **Validate:** editing a line's rate produces a retrievable audit row showing both values

### 1.10 Master data seed
- HCL (AN04, AN08, AN22, AP08), DLF (Mall of India), Metlife, Satya Prakash; `UP` and `HR` entities
- **Validate:** `seed_masters` is idempotent — running it twice changes nothing

---

## Phase 2 — PO Entry & Search (Days 3–5)

### 2.1 PO serializers & viewset
- Nested line items; create/update in one request inside a transaction
- Optimistic locking on `updated_at`, returning `409` on conflict
- **Validate:** a stale update returns 409, not a silent overwrite

### 2.2 PO revision service
- `revise_po` per [TECH_SPEC §3.4](TECH_SPEC.md)
- **Validate (MANDATORY):** `test_revision_preserves_delivered_quantities` — revising a PO with 30 of 50 delivered leaves 30 delivered on the successor and double-counts nothing

### 2.3 Short-close
- `CanShortClose` permission (owner/admin only)
- **Validate:** a staff session gets 403; the line leaves every pending view afterwards

### 2.4 Search endpoint
- Single-term search per [TECH_SPEC §3.7](TECH_SPEC.md)
- Trigram + GIN indexes
- **Validate:** sub-second on 2,134 seeded rows; finds a PO by PO number, bill number and site code

### 2.5 App shell
- Sidebar, topbar, routing, auth guard, login page, force-password-change page

### 2.6 Line item grid (the critical component)
- Keyboard-first per [TECH_SPEC §4.3](TECH_SPEC.md)
- Auto-computed amount, per-client GST default, item-type guessing from description
- **Validate:** Vitest covers Tab / Enter / Ctrl+D / paste; the manual stopwatch test is the Phase 4 gate

### 2.7 PO detail page
- Header, line table with derived status, money strip
- Mobile layout verified — the owner uses a phone
- **Validate (MANDATORY):** for a known fully-billed workbook PO, totals match the workbook Grand Total **to the rupee**

### 2.8 Excel export
- Real dates, real status column, workbook column order
- **Validate:** opens in Excel; dates sort; totals reconcile with the app

---

## Phase 3 — Legacy Migration (Days 6–8)

**The trust-critical phase (PRD risk R2).** One wrong number on the owner's dashboard and confidence is gone.

### 3.1 Backup restore drill (MANDATORY, before any real data)
Take a backup, restore it to a scratch database, confirm integrity. **An untested backup is not a backup.**

### 3.2 Workbook reader
- Parse all 8 sheets, handling banded headers, blank continuation rows and interleaved `Total` / `GST @ 18%` / `Grand Total` rows
- **Validate:** the reader returns exactly **259 POs and 2,134 line items**

### 3.3 Normalisers, each with its own tests

| Normaliser | Handles |
|---|---|
| Date | `29/07/2024`, `16.01.2026`, native datetimes; flags `26/09/204` |
| Site | Splits `( AN22 ) HCL TECHNOLOGIES LIMITED` into code + name |
| GST | `0.18` and `18` both become `0.1800`; flags out-of-range |
| Bill number | Validates `PREFIX/serial/YY-YY`; flags the 33 malformed |
| Challan number | Parses `151/30.11.24`, `194/23.2.25`, `188/12/2/26` |
| Item type | Infers material vs service from description keywords |
| PO number | Detects revision markers (`PO Changed`, `PO Amended`) sitting in the PO column |

### 3.4 Review-queue classifier
Emit `import_review_item` rows for every reason code in [SCHEMA.md §6](SCHEMA.md). **Never guess silently.**

### 3.5 Status inference from cell colour
Read theme-indexed fills; map green → billed, white → not started. **Every inferred status is written to `interim_status` and flagged `needs_review`** — never treated as fact.

### 3.6 Duplicate resolution
48 POs appear on multiple sheets. Import the richest version; queue the rest with `DUPLICATE_PO_ACROSS_SHEETS`.

### 3.7 `import_workbook` command
- `--dry-run` prints the reconciliation diff and the review breakdown, and writes nothing
- `--commit` imports inside one transaction
- Re-runnable and idempotent
- **Validate (MANDATORY):** `--dry-run` reconciles total PO value to **₹12.08 crore exactly**, and the expected review counts appear (48 duplicates, 33 malformed bill numbers, 16 over-billed, 35 over-delivered, 24 rate divergences)

### 3.8 Review queue UI
Admin-only. Shows reason code, source cell reference (`HCL PO!A471`), payload, and a resolve action.
**Validate:** rows with `needs_review` are excluded from every headline total until resolved

---

## Phase 4 — Fast Entry (Days 9–11)

### 4.1 Paste-block importer
- Paste a range from Excel, map columns once, remember the mapping per client
- Review screen before save
- **Validate:** a 20-line paste produces 20 correct line items

### 4.2 PDF extraction
- Upload the client's PO PDF, extract header + line items
- Per-field confidence, shown side-by-side with the source
- **Never auto-saves.** Degrades to manual without complaint.
- **Validate:** on a sample PO from each of the four clients, extraction either succeeds or fails cleanly — never silently wrong

### 4.3 THE STOPWATCH GATE (MANDATORY)
Enter a real 7-line PO — use `8100013678`, the LED downlighter PO — into the app and into Excel. Time both.

**Pass condition: the app is faster.** If it is not, Phase 4 is not complete. Fix the grid and retest. This is PRD risk R1, and it is the difference between a used system and an abandoned one.

### 4.4 Release 1 rollout
- Deploy to production
- Onboard **one** staff member first; gather friction; fix; then widen
- Announce a hard cutover date for new POs
- One week of dual entry, maximum

---

## Feedback Gate

**Stop.** Release 1 runs in real use before Phase 5 is scoped. Collect:

- What staff actually complain about
- Which searches they actually run
- Whether the owner opens the app unprompted
- Answers to PRD open questions 10.1–10.6, which become urgent here

Phases 5–9 below are outlines. **They are re-planned after this gate**, not executed blindly.

---

## Phase 5 — Delivery, Work Done & Approval (outline)
Challan entry with allocations; work-done and client-approval marking; remove `interim_status` and migrate remaining values into real allocations; ageing view for approved-but-unbilled.

## Phase 6 — Bills & Ariba (outline)
Bill entry with allocations; bill-number validation live; Ariba state machine including rejection and resubmission; Ariba backlog dashboard (~₹1.05 cr at baseline).

## Phase 7 — Payments (outline)
Payment entry against client; allocation across bills; `tds` / `retention` / advance handling; a receivables reconciliation report proving `ordered − billed − settled` balances per client.

## Phase 8 — Dashboards & Alerts (outline)
Pending work by value; receivables ageing; Ariba backlog; work-done-but-unbilled over 30 days. Mobile-first. The owner answers both his questions in under 30 seconds — the PRD success metric.

## Phase 9 — Quotations (outline)
Quotation and bid entry; quotation number as the business key; line items inherited into the PO so they are typed exactly once.

---

## Risk Checkpoints

| After | Check | If it fails |
|---|---|---|
| Phase 1 | Status derivation tests all pass | **Stop.** The model is wrong. Do not build UI on it. |
| Phase 3.1 | Restore drill succeeded | **Stop.** Do not load real data without a proven restore. |
| Phase 3.7 | Reconciliation matches the workbook exactly | **Stop.** Fix the reader before importing. |
| Phase 4.3 | App entry beats Excel | **Stop.** Fix the grid. Rolling out a slower tool guarantees abandonment. |
| Feedback gate | Owner opens the app unprompted | Re-examine what he actually needs before building more. |

---

*Progress is tracked in [TRACKER.md](TRACKER.md).*
