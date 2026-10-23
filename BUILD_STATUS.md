# PO Tracker — Build Continuity Log

> Update this file whenever a meaningful unit of work completes. It is intentionally written for the next human or coding agent to resume without rediscovering the project.
>
> **Record only what you have actually run.** An earlier version of this log recorded PASS for gates that were failing at the time; that cost a later session a full re-audit. Paste real command output, and if a gate fails, log the failure.

## Current status

- **Date:** 2026-09-03
- **Scope in progress:** Release 1 — implementation phases 0–4, plus the `docs/REBUILD_PLAN.md` corrections.
- **Product phase:** Feature-complete for Release 1 and passing every automated gate. Not yet piloted with real users, and the legacy migration has been rehearsed but not committed to the production database.
- **Source-of-truth docs:** `docs/AGENT.md`, then `docs/PRD.md`, `docs/SCHEMA.md`, `docs/TECH_SPEC.md`, `docs/DESIGN.md`, `docs/TEST_PLAN.md`, `docs/IMPLEMENTATION_PLAN.md`, and `docs/REBUILD_PLAN.md`.
- **Audit history:** `docs/claude/01_CURRENT_STATE_AUDIT.md` describes the state *before* the 2026-09-02/03 work. Most of its findings are now fixed — see `docs/claude/06_REBUILD_EXECUTION.md` for which, and what replaced them.

## Completed (Phases 0-4)

- **Phase 0:** Project bootstrap, Vite/React/TS, Django/DRF/SQLite, basic routing.
- **Phase 1 (Models & Status):** 17 models migrated. SQL views install on PostgreSQL only (`0003`); the Python selectors in `selectors.py` are what the API actually serves. Auth, audit logging and permissions complete.
- **Phase 2 (PO Entry & Search):** PO serializers, views, services (`create_po`, `revise_po`, `short_close_line`), search, AppShell, login/password-change, PO list/detail/editor, `LineItemGrid` with keyboard navigation, Zustand auth store. Revision and cancel dialogs; work-done/approve quick actions.
- **Phase 3 (Legacy Migration):** `import_workbook` rewritten. Dry-run and commit now agree exactly, commit is idempotent, and ambiguity lands in the review queue surfaced by `ReviewPage.tsx`.
- **Phase 4 (Fast Entry):** Paste-block importer in `lib/po.ts` / `ImportPage.tsx` and a real `paste_preview` endpoint that creates POs, challans and bills. PDF entry remains a stub by design (roadmap Phase 4).

## Access model

All active tracker accounts have identical operational permissions — any logged-in user can perform any normal action. `permissions.py` keeps the role-named classes as aliases of a single full-access check so existing imports keep working; `AppUserRole` is retained for `force_password_change` and for audit attribution, not for gating. Do not reintroduce role gates without a product decision.

## Important product invariants (never violate)

1. `POLineItem` must **not** have a stored `status` field; status is derived from quantity ledgers. `interim_status` is temporary migration scaffolding only.
2. Bills/challans are peers of a PO and allocate through quantity-bearing junction tables.
3. Allocation rate is authoritative; GST is per line and defaults by client (usually 0%), never a global 18%.
4. Use `Decimal` and serialise money as strings via `tracker/money.py`. Never `str()` a raw aggregate — `Sum()` does not preserve scale on SQLite — and never use JS floating-point arithmetic for money.
5. Revisions must be transactional and preserve existing allocations without double counting.
6. Over-delivery and over-billing must be flagged, never blocked.
7. Migration must never guess; uncertainty goes to the review queue and stays excluded from headline totals.
8. Reuse shadcn/ui primitives. Custom UI is limited to `LineItemGrid`, paste-block import, and PDF side-by-side review.
9. `POLineItem.save()` recomputes `amount = qty × rate`. Any code that reports a projected total must derive it the same way, or the projection will not match what gets stored.

## Legacy workbook reconciliation (`PO TRACKER.xlsx`)

Rehearsed 2026-09-03 against the real file. Dry-run and commit agree on every count.

| Measure | Value |
|---|---|
| Purchase orders | 255 (from 319 raw blocks; 69 duplicates across sheets flagged, first occurrence kept) |
| Line items | 1,620 |
| Challans | 186 dry-run / 184 committed (two challans are shared across POs and deduplicate on write) |
| Bills | 298 dry-run / 296 committed (same reason) |
| Review items | 179 |
| Total PO value | ₹5,06,82,189.06 |

**Independent cross-check** (read straight from the workbook, not through the importer): 2,132 genuine item rows totalling ₹6,90,25,123.66, with `qty × rate` matching the sheet's own amount column on every single row. The importer reads 2,220 raw lines before deduplication — the difference from 2,132 is the two specially-shaped sheets (`Satya Praksh`, `8100014714`), which the independent pass does not parse. After deduplication 1,620 lines / ₹5.07 cr remain, because 69 duplicated PO blocks (600 lines, ₹1.86 cr) are deliberately not imported twice.

Earlier figures in this log (259 POs / 2,134 lines / ₹12.08 cr) were never reproducible and should be disregarded. The 2,134 line figure was close to the true raw row count; the ₹12.08 cr total appears to have double-counted per-PO subtotal rows.

Review queue breakdown: `DUPLICATE_PO` 69, `UNPARSEABLE_CHALLAN_DATE` 56, `MALFORMED_BILL_NUMBER` 40, `REVISION_MARKER` 13, `GST_RATE_OUT_OF_RANGE` 4, `UNPARSEABLE_DATE` 2, `MISSING_QUANTITY` 1, `MISSING_RATE` 1.

## Required automated validation

```powershell
.\.venv\Scripts\python.exe backend\manage.py check
.\.venv\Scripts\python.exe backend\manage.py makemigrations --check --dry-run
.\.venv\Scripts\python.exe -m pytest backend\tracker\tests
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend run test -- --run
npm --prefix frontend run build
```

To rehearse the migration without touching the working database, point `SQLITE_NAME` at a scratch file:

```powershell
$env:SQLITE_NAME="$env:TEMP\po-import-test.sqlite3"
.\.venv\Scripts\python.exe backend\manage.py migrate
.\.venv\Scripts\python.exe backend\manage.py import_workbook "PO TRACKER.xlsx" --dry-run
.\.venv\Scripts\python.exe backend\manage.py import_workbook "PO TRACKER.xlsx" --commit
```

## External/manual gates that cannot be claimed complete yet

- Provision a managed PostgreSQL instance with point-in-time restore enabled and perform a restore drill before a real import. **The reconciliation above was rehearsed on SQLite; repeat it on PostgreSQL before committing to production**, because the SQL views in `0003` only install there.
- Commit the migration to the production database and have the owner confirm the 255 / 1,620 / ₹5.07 cr figures against their own expectations.
- Work the 179 review items — particularly the 56 challans whose number carries no parseable date.
- Run the Phase 4 stopwatch test for PO `8100013678`: app entry must beat Excel entry.
- Obtain client sample PDFs, production-host configuration, and complete first-staff onboarding.

## Next actions

1. Repeat the migration rehearsal on PostgreSQL and diff the counts against the SQLite run.
2. Have the owner triage the review queue in `ReviewPage.tsx`, starting with `DUPLICATE_PO` and `UNPARSEABLE_CHALLAN_DATE`.
3. Set `TrackerSettings.stuck_after_days` and `overdue_after_days`, and `Client.payment_terms_days` — the overdue KPIs stay empty until a threshold exists, by design.
4. Pilot with real POs for two weeks, then revisit `CANCELLED` / `ON_HOLD` behaviour and the PDF import.

## Validation log

| Timestamp | Command / gate | Result | Notes |
|---|---|---|---|
| 2026-09-01 | Documentation review | PASS | Release 1 scope is phases 0–4; phases 5–9 are post-feedback only. |
| 2026-09-01 | UI design-system helper | BLOCKED | Both supplied helper paths are broken. Design rules applied directly from `SKILL.md` and `docs/DESIGN.md`. |
| 2026-09-03 | *(superseded)* backend tests / frontend typecheck logged as PASS | **RETRACTED** | Both were failing when logged. See the re-audit rows below. |
| 2026-09-03 | `manage.py check` | PASS | No issues (0 silenced). |
| 2026-09-03 | `makemigrations --check --dry-run` | PASS | No changes detected. |
| 2026-09-03 | Backend re-audit: `pytest` | **FAIL → FIXED** | Started at 2 failed / 54 passed. `POST /api/v1/bills` returned 400 for any payload omitting `legal_entity`. Now 77 passed. |
| 2026-09-03 | Frontend re-audit: `tsc -b` | **FAIL → FIXED** | 3 errors in `PoDetailPage.tsx` (`po.lines`, `line.id` possibly undefined). Now clean. |
| 2026-09-03 | Frontend re-audit: `vitest run` | **FAIL → FIXED** | `LineItemGrid.test.tsx` never ran — pool worker timeout, jsdom taking ~33 s to boot. Scoped jsdom to that one file; suite went 97 s-with-error → 6 s, 8/8 passing. |
| 2026-09-03 | `import_workbook --dry-run` | PASS | 255 POs, 1,620 lines, 186 challans, 298 bills, 179 review items, ₹5,06,82,189.06. |
| 2026-09-03 | `import_workbook --commit` (scratch DB) | PASS | 255 POs, 1,620 lines, 184 challans, 296 bills, 179 review items. First successful commit; the command previously could not complete. |
| 2026-09-03 | `import_workbook --commit` re-run | PASS | 0 POs created, 255 already present — idempotent. |
| 2026-09-03 | Workbook independent cross-check | PASS | 2,132 item rows, ₹6,90,25,123.66; `qty × rate` matches the sheet on every row. |
| 2026-09-03 | Backend `pytest` (final) | PASS | 77 passed, incl. 21 new importer/money/lifecycle regressions. |
| 2026-09-03 | Frontend `lint` | PASS | 4 warnings, all pre-existing shadcn fast-refresh / exhaustive-deps notes. |
| 2026-09-03 | Frontend `typecheck` (final) | PASS | `tsc -b` clean. |
| 2026-09-03 | Frontend `test` (final) | PASS | 3 files, 8 tests. |
| 2026-09-03 | Frontend `build` (final) | PASS | 1,913 modules, 458.91 kB (141.37 kB gzip). |
| 2026-09-03 | E2E Playwright | PENDING | Still no Playwright scripts in `package.json`. |
