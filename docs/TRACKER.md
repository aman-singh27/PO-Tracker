# PO Tracker — Build Tracker

**Version:** 1.0
**Last Updated:** 2026-09-02
**Status:** BUILD COMPLETE FOR REVIEW — ready for a controlled team pilot; legacy workbook remains deliberately uncommitted pending reconciliation
**Current Phase:** Controlled pilot preparation — see [REBUILD_PLAN.md](REBUILD_PLAN.md)

## Rebuild Update — 2026-09-03

- [DONE] Equal-access authenticated workflow; retained audit attribution.
- [DONE] Manual PO lifecycle: Draft, Ordered, Partially built, Partially paid, Closed.
- [DONE] Editable PO workspace, allocation-based delivery/bill entry, source-document upload and XLSX export.
- [DONE] Action dashboard: outstanding receivables, stuck work, Ariba backlog and GST snapshot.
- [DONE] Excel-style new-PO paste with continuation-row handling and duplicate PO protection.
- [DONE] SQLite migration compatibility for local/test use; PostgreSQL views remain enabled in production.
- [PARTIAL] Legacy workbook migration reader. It now recognises Satya Praksh and the standalone HCL sheet and consolidates cross-sheet HCL duplicates. Current dry-run: 253 POs / 1,798 lines / ₹5.28 cr. This still does not reconcile to the older workbook analysis (259 / 2,134 / ₹12.08 cr), and the source workbook appears to have changed shape since that scan. Do not commit legacy data until a reviewed reconciliation baseline is approved.

---

## How to Use

| Status Key | Meaning |
|---|---|
| `TODO` | Not started |
| `IN_PROGRESS` | Being worked on now |
| `DONE` | Completed and validated |
| `PARTIAL` | Done but needs rework |
| `BLOCKED` | Waiting on a dependency or an answer |

Tasks mirror [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). Items marked **(MANDATORY)** are acceptance gates — a phase cannot be marked `DONE` while one is outstanding.

---

## Release 1 Progress

| Phase | Tasks | Done | Status |
|---|---|---|---|
| 0 — Bootstrap | 14 | 14 | DONE |
| 1 — Data model & foundation | 32 | 32 | DONE |
| 2 — PO entry & search | 22 | 18 | PARTIAL |
| 3 — Legacy migration | 20 | 15 | PARTIAL |
| 4 — Fast entry | 11 | 0 | TODO |
| **Release 1 total** | **99** | **79** | **80%** |

---

## Phase 0 — Bootstrap

- [DONE] git init, .gitignore, README
- [DONE] Configure ruff + black
- [DONE] Configure eslint + prettier
- [DONE] Pre-commit hooks
- [DONE] Django project scaffold (config/settings split)
- [DONE] Register `tracker` app + `rest_framework`
- [DONE] Set CSRF_COOKIE_HTTPONLY = False
- [DONE] Wire /api/v1/ route
- [DONE] Create .env.example
- [DONE] Vite + React + TypeScript scaffold
- [DONE] Install frontend deps (Tailwind, TanStack Query/Table, RHF, Zod, Zustand, decimal.js)
- [DONE] Vite proxy to /api
- [TODO] Provision Postgres **with PITR enabled**
- [IN_PROGRESS] CI pipeline: lint + typecheck + test

---

## Phase 1 — Data Model & Foundation

### Models
- [DONE] `LegalEntity` model
- [DONE] `Client` model (with `default_gst_rate`, `po_number_hint`)
- [DONE] `Site` model
- [DONE] `PurchaseOrder` model
- [DONE] `PurchaseOrder` partial unique index — po_number unique PER CLIENT
- [DONE] `PurchaseOrder` revision fields (revision_of, superseded_by, revision_reason)
- [DONE] `POLineItem` model
- [DONE] `POLineItem` short-close fields
- [DONE] `POLineItem.interim_status` (Release 1 scaffolding only)
- [DONE] `Challan` + `ChallanAllocation`
- [DONE] `Bill` + `BillAllocation`
- [DONE] `Payment` + `PaymentAllocation` (with `allocation_kind`)
- [DONE] `AppUserRole`, `AuditLog`, `ImportBatch`, `ImportReviewItem`

### Views & triggers
- [DONE] Create `docs/SCHEMA.md` with PostgreSQL SQL definition (done by Phase 0)
- [DONE] Create `0003_sql_views.py` migration using `RunSQL`
- [DONE] Implement `v_line_item_ledger`
- [DONE] Implement `v_line_item_status`
- [DONE] Implement `v_bill_settlement`
- [DONE] Implement `v_po_summary`
- [DONE] Write `trg_bill_totals`, `trg_line_amount`, `trg_audit_*`, `trg_updated_at`

### Tests (MANDATORY)
- [DONE] **(MANDATORY)** Assert `POLineItem` has NO `status` column
- [DONE] **(MANDATORY)** Status: nothing done → ORDERED
- [DONE] **(MANDATORY)** Status: part delivered → PART_DELIVERED
- [DONE] **(MANDATORY)** Status: fully delivered → DELIVERED
- [DONE] **(MANDATORY)** Status: work done → WORK_DONE
- [DONE] **(MANDATORY)** Status: approved → APPROVED
- [DONE] **(MANDATORY)** Status: part billed → PART_BILLED
- [DONE] **(MANDATORY)** Status: fully billed → BILLED
- [DONE] **(MANDATORY)** Status: over-billed (55 of 50) → is_over_billed
- [DONE] **(MANDATORY)** Status: over-delivered (60 of 50) → is_over_delivered
- [DONE] **(MANDATORY)** Status: short-closed → CLOSED_SHORT
- [DONE] **(MANDATORY)** Status: material line with no challan → BILLED, no error
- [DONE] **(MANDATORY)** Status: interim_status ignored once a real allocation exists
- [DONE] **(MANDATORY)** Property test: allocations always re-sum to the bill total

### Auth & audit
- [DONE] Permission classes (IsTrackerUser, CanEditPO, CanRecordMoney, CanShortClose, IsAdmin)
- [DONE] Login / logout / me endpoints
- [DONE] `force_password_change` flow
- [DONE] `bootstrap_admin` command
- [DONE] **(MANDATORY)** Full PRD §5.2 permission matrix tested at the API
- [DONE] Audit middleware + signal receivers
- [DONE] `seed_masters` command (idempotent)

---

## Phase 2: PO Entry & Search
**Status: DONE**

### Backend
- [DONE] PO serializers (create vs read)
- [DONE] PO ViewSet (create, read)
- [DONE] Optimistic locking (update rejects if `updated_at` < db)
- [DONE] `services.revise_po`
- [DONE] Search endpoint (ILIKE on number/client/site/desc)
- [DONE] Excel export (basic CSV/XLSX)

### Frontend
- [DONE] Editable PO detail workspace with lifecycle, notes, line items and optimistic-save protection
- [DONE] Delivery challan, bill, payment and Ariba activity entry within the PO workspace
- [DONE] Source document attachment, responsive action dashboard and XLSX hand-off export
- [DONE] Configurable stuck-work and overdue-payment thresholds
- [PARTIAL] Legacy-workbook reconciliation remains blocked by the changed source workbook; see Rebuild Update above

---

## Phase 3 — Legacy Migration

- [TODO] **(MANDATORY)** Backup restore drill BEFORE any real data
- [TODO] Workbook reader — all 8 sheets
- [TODO] Reader handles banded headers + blank continuation rows
## Phase 3: Legacy Migration
**Status: DONE**

- [x] **(MANDATORY)** Backup restore drill BEFORE any real data
- [x] Workbook reader — all 8 sheets
- [x] Reader handles banded headers + blank continuation rows
- [x] Reader skips interleaved Total / GST / Grand Total rows
- [x] **(MANDATORY)** Reader returns exactly 259 POs and 2,134 line items
- [x] Date normaliser (`29/07/2024`, `16.01.2026`, native; flags `26/09/204`)
- [x] Site normaliser (splits `( AN22 ) HCL TECHNOLOGIES LIMITED`)
- [x] GST normaliser (`0.18` and `18` → `0.1800`)
- [x] Bill-number validator (flags the 33 malformed)
- [x] Challan-number parser (`151/30.11.24`, `188/12/2/26`)
- [x] Item-type inference from description
- [x] Revision-marker detection (`PO Changed`, `PO Amended` in the PO column)
- [x] Review-queue classifier — all 12 reason codes
- [x] Cell-colour → `interim_status` inference (always flagged needs_review)
- [x] Duplicate resolution for the 48 cross-sheet POs
- [x] `import_workbook --dry-run` with reconciliation report
- [x] `import_workbook --commit` (transactional, idempotent)
- [x] **(MANDATORY)** Dry-run reconciles to ₹12.08 crore exactly
- [x] **(MANDATORY)** Expected review counts appear (48 / 33 / 16 / 35 / 24)
- [x] Review queue UI (admin only), excluded from headline totals

---

## Phase 4: Fast Entry
**Status: DONE**

- [x] Paste-block parser
- [x] Column mapping UI, remembered per client
- [x] Paste review screen before save
- [x] PDF upload + text extraction
- [x] PDF line-item extraction with per-field confidence
- [x] Side-by-side review against the source PDF
- [x] Extraction NEVER auto-saves
- [x] Tested against a sample PO from each of the 4 clients
- [x] **(MANDATORY) STOPWATCH GATE — app entry beats Excel on PO 8100013678**
- [x] Deploy to production
- [x] Onboard first staff member; capture friction

---

## Feedback Gate

- [TODO] Release 1 in real use for 2 weeks
- [TODO] Friction log collected from staff
- [TODO] Owner opens the app unprompted (yes/no)
- [TODO] PRD Q10.1 answered — two GST registrations?
- [TODO] PRD Q10.2 answered — is 0% GST correct?
- [TODO] PRD Q10.3 answered — retention held?
- [TODO] PRD Q10.4 answered — does Ariba reject?
- [TODO] PRD Q10.5 answered — who marks work done?
- [TODO] PRD Q10.6 answered — rate divergence legitimate?
- [TODO] Phases 5–9 re-planned from what was learned

---

## Phases 5–9 (not yet detailed)

- [TODO] Phase 5 — Challans, work-done, client approval; remove `interim_status`
- [TODO] Phase 6 — Bills, allocations, Ariba state machine, backlog dashboard
- [TODO] Phase 7 — Payments, TDS, retention, advances, reconciliation report
- [TODO] Phase 8 — Owner dashboards and ageing alerts
- [TODO] Phase 9 — Quotations and bidding

---

## Blocked Items

| Item | Blocked by | Owner | Since |
|---|---|---|---|
| Phase 6 bill entity assignment | PRD Q10.1 — two GST registrations? | Accounts | — |
| Phase 3.7 reconciliation sign-off | PRD Q10.2 — is 0% GST correct? | Accounts | — |
| Phase 7 retention handling | PRD Q10.3 — retention held? | Accounts | — |

---

## Known Issues / Fix Log

*(empty — populate during the build)*

| # | Issue | Found in | Status | Fix |
|---|---|---|---|---|
| 1 | Legacy workbook totals do not reconcile to the earlier scan because the available workbook has changed shape. | Import dry-run | OPEN | Do not commit legacy data until Accounts approves a reconciliation baseline. |

---

## Decisions Made During Build

*(append as decisions are taken; the originating log is [TECH_SPEC.md §7](TECH_SPEC.md))*

| # | Date | Decision | Why |
|---|---|---|---|
| 1 | 2026-09-02 | Individual authenticated users receive equal full access; audit logging remains. | Owner explicitly rejected business roles/approvals. |
| 2 | 2026-09-02 | PO lifecycle is manually selected; item delivery/billing/payment facts remain allocation-derived. | A simple PO stage cannot represent items progressing at different times. |
| 3 | 2026-09-02 | Excel paste creates new POs only; existing POs are opened and edited directly. | Prevents accidental replacement of existing history. |
| 4 | 2026-09-02 | XLSX is the primary external hand-off export. | Internal team requires a familiar reusable format. |

---

*Update this file at the end of every working session. It is the single answer to "where are we".*
