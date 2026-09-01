# PO Tracker — Build Tracker

**Version:** 1.0
**Last Updated:** 2026-09-01
**Status:** NOT STARTED — Phase 0 pending
**Current Phase:** Phase 0 — Bootstrap

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
| 0 — Bootstrap | 14 | 0 | TODO |
| 1 — Data model & foundation | 32 | 0 | TODO |
| 2 — PO entry & search | 22 | 0 | TODO |
| 3 — Legacy migration | 20 | 0 | TODO |
| 4 — Fast entry | 11 | 0 | TODO |
| **Release 1 total** | **99** | **0** | **0%** |

---

## Phase 0 — Bootstrap

- [TODO] git init, .gitignore, README
- [TODO] Configure ruff + black
- [TODO] Configure eslint + prettier
- [TODO] Pre-commit hooks
- [TODO] Django project scaffold (config/settings split)
- [TODO] Register `tracker` app + `rest_framework`
- [TODO] Set CSRF_COOKIE_HTTPONLY = False
- [TODO] Wire /api/v1/ route
- [TODO] Create .env.example
- [TODO] Vite + React + TypeScript scaffold
- [TODO] Install frontend deps (Tailwind, TanStack Query/Table, RHF, Zod, Zustand, decimal.js)
- [TODO] Vite proxy to /api
- [TODO] Provision Postgres **with PITR enabled**
- [TODO] CI pipeline: lint + typecheck + test

---

## Phase 1 — Data Model & Foundation

### Models
- [TODO] `LegalEntity` model
- [TODO] `Client` model (with `default_gst_rate`, `po_number_hint`)
- [TODO] `Site` model
- [TODO] `PurchaseOrder` model
- [TODO] `PurchaseOrder` partial unique index — po_number unique PER CLIENT
- [TODO] `PurchaseOrder` revision fields (revision_of, superseded_by, revision_reason)
- [TODO] `POLineItem` model
- [TODO] `POLineItem` short-close fields
- [TODO] `POLineItem.interim_status` (Release 1 scaffolding only)
- [TODO] `Challan` + `ChallanAllocation`
- [TODO] `Bill` + `BillAllocation`
- [TODO] `Payment` + `PaymentAllocation` (with `allocation_kind`)
- [TODO] `AppUserRole`, `AuditLog`, `ImportBatch`, `ImportReviewItem`

### Views & triggers
- [TODO] `v_line_item_ledger`
- [TODO] `v_line_item_status`
- [TODO] `v_bill_settlement`
- [TODO] `v_po_summary`
- [TODO] `trg_bill_totals`
- [TODO] `trg_line_amount`
- [TODO] `trg_audit_*`
- [TODO] `trg_updated_at`

### Tests (MANDATORY)
- [TODO] **(MANDATORY)** Assert `POLineItem` has NO `status` column
- [TODO] **(MANDATORY)** Status: nothing done → ORDERED
- [TODO] **(MANDATORY)** Status: part delivered → PART_DELIVERED
- [TODO] **(MANDATORY)** Status: fully delivered → DELIVERED
- [TODO] **(MANDATORY)** Status: work done → WORK_DONE
- [TODO] **(MANDATORY)** Status: approved → APPROVED
- [TODO] **(MANDATORY)** Status: part billed → PART_BILLED
- [TODO] **(MANDATORY)** Status: fully billed → BILLED
- [TODO] **(MANDATORY)** Status: over-billed (55 of 50) → is_over_billed
- [TODO] **(MANDATORY)** Status: over-delivered (60 of 50) → is_over_delivered
- [TODO] **(MANDATORY)** Status: short-closed → CLOSED_SHORT
- [TODO] **(MANDATORY)** Status: material line with no challan → BILLED, no error
- [TODO] **(MANDATORY)** Status: interim_status ignored once a real allocation exists
- [TODO] **(MANDATORY)** Property test: allocations always re-sum to the bill total

### Auth & audit
- [TODO] Permission classes (IsTrackerUser, CanEditPO, CanRecordMoney, CanShortClose, IsAdmin)
- [TODO] Login / logout / me endpoints
- [TODO] `force_password_change` flow
- [TODO] `bootstrap_admin` command
- [TODO] **(MANDATORY)** Full PRD §5.2 permission matrix tested at the API
- [TODO] Audit middleware + signal receivers
- [TODO] `seed_masters` command (idempotent)

---

## Phase 2 — PO Entry & Search

### Backend
- [TODO] PO serializers with nested line items
- [TODO] PO viewset (create/update in one transaction)
- [TODO] Optimistic locking → 409 on stale update
- [TODO] `revise_po` service
- [TODO] **(MANDATORY)** test_revision_preserves_delivered_quantities
- [TODO] `cancel_and_replace_po` service
- [TODO] `short_close_line` service + permission
- [TODO] Search endpoint (PO no / bill no / challan no / client / site / description)
- [TODO] Trigram + GIN indexes
- [TODO] Excel export endpoint

### Frontend
- [TODO] Axios client + CSRF interceptor
- [TODO] Zustand auth store
- [TODO] `usePermission` hook
- [TODO] App shell: sidebar + topbar + routing
- [TODO] Login page
- [TODO] Force-password-change page
- [TODO] **LineItemGrid** — keyboard navigation (Tab/Shift+Tab/Enter)
- [TODO] **LineItemGrid** — Ctrl+D copy-down
- [TODO] **LineItemGrid** — multi-row paste
- [TODO] **LineItemGrid** — auto-amount, GST default, item-type guess
- [TODO] PO detail page + MoneyStrip
- [TODO] **(MANDATORY)** PO detail totals reconcile to the rupee vs the workbook

---

## Phase 3 — Legacy Migration

- [TODO] **(MANDATORY)** Backup restore drill BEFORE any real data
- [TODO] Workbook reader — all 8 sheets
- [TODO] Reader handles banded headers + blank continuation rows
- [TODO] Reader skips interleaved Total / GST / Grand Total rows
- [TODO] **(MANDATORY)** Reader returns exactly 259 POs and 2,134 line items
- [TODO] Date normaliser (`29/07/2024`, `16.01.2026`, native; flags `26/09/204`)
- [TODO] Site normaliser (splits `( AN22 ) HCL TECHNOLOGIES LIMITED`)
- [TODO] GST normaliser (`0.18` and `18` → `0.1800`)
- [TODO] Bill-number validator (flags the 33 malformed)
- [TODO] Challan-number parser (`151/30.11.24`, `188/12/2/26`)
- [TODO] Item-type inference from description
- [TODO] Revision-marker detection (`PO Changed`, `PO Amended` in the PO column)
- [TODO] Review-queue classifier — all 12 reason codes
- [TODO] Cell-colour → `interim_status` inference (always flagged needs_review)
- [TODO] Duplicate resolution for the 48 cross-sheet POs
- [TODO] `import_workbook --dry-run` with reconciliation report
- [TODO] `import_workbook --commit` (transactional, idempotent)
- [TODO] **(MANDATORY)** Dry-run reconciles to ₹12.08 crore exactly
- [TODO] **(MANDATORY)** Expected review counts appear (48 / 33 / 16 / 35 / 24)
- [TODO] Review queue UI (admin only), excluded from headline totals

---

## Phase 4 — Fast Entry

- [TODO] Paste-block parser
- [TODO] Column mapping UI, remembered per client
- [TODO] Paste review screen before save
- [TODO] PDF upload + text extraction
- [TODO] PDF line-item extraction with per-field confidence
- [TODO] Side-by-side review against the source PDF
- [TODO] Extraction NEVER auto-saves
- [TODO] Tested against a sample PO from each of the 4 clients
- [TODO] **(MANDATORY) STOPWATCH GATE — app entry beats Excel on PO 8100013678**
- [TODO] Deploy to production
- [TODO] Onboard first staff member; capture friction

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

---

## Decisions Made During Build

*(append as decisions are taken; the originating log is [TECH_SPEC.md §7](TECH_SPEC.md))*

| # | Date | Decision | Why |
|---|---|---|---|

---

*Update this file at the end of every working session. It is the single answer to "where are we".*
