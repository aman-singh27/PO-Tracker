# PO Tracker — Rebuild Plan Based on Current Repository

## What is already usable

The repository has Django models for PO items, challans, bills, allocations, payments, audit entries and import review. It also has a React PO list/editor/detail/import shell. The allocation model is the correct base for Excel's partial delivery/billing pattern and should be retained.

## What must change before team rollout

| Priority | Work | Current evidence | Acceptance result |
|---|---|---|---|
| P0 | Replace four business roles with a single authenticated full-access user type | `AppUserRole`, permission classes and frontend permission hook currently restrict actions | Any logged-in active user can complete every normal action; audit actor is retained. |
| P0 | Add a manual PO lifecycle field and UI | Current `PurchaseOrder.status` only means active/superseded/cancelled; the UI shows derived/fallback status | Users set the five agreed stages independently of factual quantities. |
| P0 | Make PO detail the editable working screen | `PoDetailPage.tsx` is read-only and falls back to fake data on API errors | Search -> open -> edit header/items/lifecycle or add transactions, with optimistic-lock conflict handling. |
| P0 | Finish real Excel-compatible new-PO paste | `ImportPage.tsx` only parses description/qty/unit/rate locally; `/paste-preview` merely echoes rows | Paste full workbook-shaped PO blocks, carry headers forward, parse delivery/bill fields, validate and create. |
| P0 | Correct/import the legacy workbook end-to-end | Import commands contain incomplete/duplicate logic; delivery, revisions, special markers and Ariba are not reliably imported | Dry-run reconciliation report, review queue for ambiguity and idempotent commit. |
| P1 | Build operational dashboard and exports | Current dashboard is absent/basic; export is CSV despite the internal hand-off need | Overdue/stuck/Ariba/GST views plus filtered XLSX export. |
| P1 | Implement bill payment workflow | Models/endpoints exist but no user workflow or receivable dashboard | Record a payment against bill(s), show paid/outstanding/ageing precisely. |
| P1 | Attach source documents | PDF preview reads text only and nothing stores files | Original PO/challan/bill documents are attachable and readable from the PO. |

## Delivery order

1. **Stabilise the model and permissions.** Add manual lifecycle separate from record validity/revision state; simplify permissions; add regression tests.
2. **Make the PO detail page real.** Remove fake fallback data, add edit forms, factual quantity strip and quick add actions.
3. **Deliver fast intake.** Build full-format paste with parser, duplicate detection and direct clean-save. Keep PDF as a reviewed draft.
4. **Migrate safely.** Replace the current importer with one reader and one tested service. Reconcile counts/amounts and surface uncertain rows.
5. **Close the loop.** Add challan/bill/payment working screens, dashboard alerts, XLSX export and attachments.
6. **Pilot with the team.** Use actual POs for two weeks, collect failures, then set initial threshold defaults and confirm cancel/hold policy.

## Required implementation decisions

- Use the existing many-to-many challan/bill allocation model. Do not collapse it to fields on a line item.
- Add `lifecycle_stage` to `PurchaseOrder`; leave `status` for record state such as active/superseded/cancelled.
- Add a configuration table or settings record for `stuck_after_days` and `payment_overdue_after_days`; defaults remain unset until chosen.
- Treat payment as an event allocated to bills. A simple “paid” checkbox loses partial-payment information and cannot answer “where is money stuck?” reliably.
- Store uploads outside the database (object storage/local media depending deployment) with metadata in the database.
- Export with `openpyxl` or `xlsxwriter`, with real Excel dates and decimal-safe values.

## Measurement and rollout

The workbook supports roughly 250 tracked HCL PO blocks in its main sheet and more activity across seven other sheets. Date quality and revision markers make a precise monthly rate unreliable; observed dated starts commonly fall around 3–8 per month, with higher peaks. The workbook cannot tell us how many people will use the system.

Pilot success means a team member can create a new PO from an Excel-style paste, find it by number, update an item, record a bill/payment, and export the filtered result without returning to Excel as the operating record.

