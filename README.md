# PO Tracker

PO Tracker replaces the legacy Excel workbook with a multi-user purchase-order workflow for the electrical/MEP business.

The current product scope is Release 1: foundation, PO entry and search, workbook migration/review, and fast manual/paste/PDF-assisted entry. Delivery, billing, payments, dashboards, and quotations are intentionally deferred until the documented real-use feedback gate.

## Structure

- `backend/` — Django + Django REST Framework API
- `frontend/` — React + Vite + TypeScript application using shadcn/ui
- `docs/` — approved product, schema, design, build, and test contracts

See [docs/README.md](docs/README.md) for the authoritative documentation map and [docs/TRACKER.md](docs/TRACKER.md) for build progress.
