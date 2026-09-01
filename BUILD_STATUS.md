# PO Tracker — Build Continuity Log

> Update this file whenever a meaningful unit of work completes. It is intentionally written for the next human or coding agent to resume without rediscovering the project.

## Current status

- **Date:** 2026-09-01
- **Scope in progress:** Release 1 only — implementation phases 0–4.
- **Product phase:** Bootstrap and initial backend/frontend implementation underway.
- **Source-of-truth docs:** `docs/AGENT.md`, then `docs/PRD.md`, `docs/SCHEMA.md`, `docs/TECH_SPEC.md`, `docs/DESIGN.md`, `docs/TEST_PLAN.md`, and `docs/IMPLEMENTATION_PLAN.md`.

## Completed

- Read and reconciled the approved PRD, schema, technical specification, design contract, test plan, implementation plan, and tracker.
- Initialized git and added root `.gitignore`, `.env.example`, and `README.md`.
- Created a Python virtual environment and installed the backend development/test dependencies.
- Created the Vite React + TypeScript frontend scaffold and installed frontend dependencies.
- Began the Django backend at `backend/` and React frontend at `frontend/`.
- Created the first backend modules for models, permissions, selectors, serializers, services, URLs, views, audit, and an initial migration.
- Created initial frontend API/auth/app-shell modules.
- Established parallel implementation ownership: `backend/**` and `frontend/**` are independent, while root files and this log are integration-owned.

## Important product invariants (never violate)

1. `POLineItem` must **not** have a stored `status` field; status is derived from quantity ledgers. `interim_status` is temporary migration scaffolding only.
2. Bills/challans are peers of a PO and allocate through quantity-bearing junction tables.
3. Allocation rate is authoritative; GST is per line and defaults by client (usually 0%), never a global 18%.
4. Use `Decimal` / PostgreSQL numeric fields and serialise money as strings. Do not use JS floating-point arithmetic for money.
5. Revisions must be transactional and preserve existing allocations without double counting.
6. Over-delivery and over-billing must be flagged, never blocked.
7. Migration must never guess; uncertainty goes to the review queue and stays excluded from headline totals.
8. Reuse shadcn/ui primitives. Custom UI is limited to `LineItemGrid`, paste-block import, and PDF side-by-side review.

## Required automated validation

```powershell
.\.venv\Scripts\python.exe backend\manage.py check
.\.venv\Scripts\python.exe -m pytest backend\tracker\tests
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend run test -- --run
npm --prefix frontend run build
```

Run the status-derivation suite and permission matrix before building more UI. Release 1 is not ready until the documented migration, keyboard-grid, and E2E tests pass.

## External/manual gates that cannot be claimed complete yet

- Provision a managed PostgreSQL instance with point-in-time restore enabled and perform a restore drill before a real import.
- Dry-run the real `PO TRACKER.xlsx` migration and reconcile 259 POs, 2,134 lines, and the documented total/review counts.
- Run the Phase 4 stopwatch test for PO `8100013678`: app entry must beat Excel entry.
- Obtain client sample PDFs, production-host configuration, and perform the first-staff onboarding/real-use feedback gate.

## Next actions

1. Finish and review `backend/**`; add its test suite and run Django/pytest validation.
2. Finish and review `frontend/**`; add Vitest coverage and run lint/typecheck/build.
3. Integrate API URLs/types and run E2E tests with the backend server.
4. Update `docs/TRACKER.md` task statuses and append exact validation output below.

## Validation log

| Timestamp | Command / gate | Result | Notes |
|---|---|---|---|
| 2026-09-01 | Documentation review | PASS | Release 1 scope is phases 0–4; phases 5–9 are post-feedback only. |
| 2026-09-01 | UI design-system helper | BLOCKED | Both supplied helper paths are broken: the r1 path is unresolved; the r0 script imports a missing `persist_design_system`. Design rules were applied directly from `SKILL.md` and `docs/DESIGN.md`. |
| 2026-09-01 | `python backend/manage.py check` | PASS | Django configuration currently loads without system-check errors. |
| 2026-09-01 | `python backend/manage.py makemigrations --check --dry-run` | PASS | Initial migration matches the current models. |
| 2026-09-01 | Frontend lint | PASS | Current partial frontend passes oxlint. |
| 2026-09-01 | Frontend typecheck/build | IN PROGRESS | Pages referenced by `App.tsx` have not yet been written; the recovery worker owns this remaining work. |
| 2026-09-01 | Backend pytest discovery | PARTIAL | Django check passes, but the test suite has not yet been added/discovered (`no tests ran`). Core TDD coverage remains mandatory. |
| 2026-09-01 | Frontend build after page recovery | PARTIAL | All page modules now exist. Build is currently blocked because `vite.config.ts` uses Vitest's `test` option with Vite's `defineConfig`; the frontend recovery worker is correcting configuration. |
