# PO Tracker — Product Blueprint

**Read with:** [OWNER_DECISIONS.md](OWNER_DECISIONS.md) and [EXCEL_COMPATIBILITY.md](EXCEL_COMPATIBILITY.md).

## The daily workflow

```text
Create PO (manual grid, Excel paste, or PO PDF)
    -> add one or more items
    -> record delivery / challan against the applicable items
    -> record bill against the applicable items
    -> record payment against a bill
    -> find exceptions from the dashboard
    -> search PO number, open it, and correct or update it
```

A PO can have many items. A single challan or bill can cover one or more items, and items in the same PO can be at different points in the workflow. This is why delivery, billing and payment remain allocation-based rather than a single PO checkbox.

## Screens that make the app better than Excel

### 1. Dashboard: action first

The default dashboard answers the two operational questions:

- **Where is money stuck?** Bills that are unpaid or only partly paid, sorted by due date and outstanding amount.
- **Where is work stuck?** Ordered items with no delivery, delivered/service-complete items with no bill, and bills not uploaded in Ariba.

Recommended cards and tables:

| Area | Shows | Action |
|---|---|---|
| Overdue receivables | bill, client, bill date, due date, amount outstanding, days overdue | Open bill or PO |
| Stuck work | PO/item, current factual status, days in state, value at risk | Open PO |
| Unbilled delivered work | delivered quantity/value with no corresponding bill | Add bill |
| Ariba backlog | billed records not uploaded / rejected | Update Ariba state |
| GST snapshot | billed basic, GST amount and gross billed in chosen period | Export XLSX |
| Data quality | missing dates/numbers or imported legacy rows that need correction | Open record |

Empty states should say plainly that there is nothing to chase. Do not add vanity totals just because a dashboard has space.

### 2. Purchase-order list and search

One prominent search accepts PO number, bill number, challan number, client, site or item description. The list has compact filters for lifecycle, factual item status, client, site and attention-needed. Selecting a result always opens the PO detail page.

### 3. PO detail: the team's working screen

The page contains editable PO header details, the manual lifecycle selector, items, related challans, bills, payments, attachments and activity history. It is the sole normal place to update an existing PO.

Each item row displays ordered, delivered, billed and paid values plus the factual derived state. Quick actions add delivery/challan, bill or payment with the selected line pre-filled. This keeps the usual single-PO case fast.

### 4. Fast new-PO intake

Offer three equally safe ways to start a PO:

1. **Paste from Excel:** paste the workbook-style block into a keyboard-first grid; the parser carries forward PO header cells across blank continuation rows.
2. **Manual grid:** type or paste item rows in the PO editor.
3. **PO PDF upload:** extract a draft for review; never make a silent write from a PDF.

For paste, minimise friction: validate inline, offer a clear `Create PO` action, and retain the original pasted data in the import audit. A preview screen is not required for clean pastes; rows with parsing errors must be highlighted and cannot be committed until corrected.

### 5. Dedicated delivery and bill entry

Keep full forms for cases where a challan or bill spans more than one PO/item. These pages use search-and-add allocations and retain the Excel values: challan number/date/source; bill number/date, quantity/rate/GST/total; and Ariba status.

## Lifecycle rules

`Draft -> Ordered -> Partially built -> Partially paid -> Closed` is user-settable at the PO level. A later state does not force completion data, because actual events can be backfilled and individual items can differ.

Factual item statuses are computed from the data: ordered, partly/fully delivered, service work done/approved (when used), partly/fully billed, partly/fully paid, and closed without work. They are display values, not manually stored item statuses.

An item marked closed without work needs a reason. It leaves “work pending” alerts but remains part of the original PO history and totals.

## Authentication and audit

Require login. Every active user receives the same full access; no approvals or role-based restrictions. The audit log still records who made every change and when, so shared access does not mean lost accountability.

## Future scope, deliberately not in this release

- Client/site performance dashboards beyond filtering and export.
- Client-facing portal, inventory and invoice generation.
- Field/mobile-first workflows.
- Configured cancellation/on-hold transition policy.
- Complex payment deductions after accounts confirms their real process.

