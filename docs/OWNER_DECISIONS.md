# PO Tracker — Owner Decisions

**Date:** 2026-09-02  
**Status:** Binding product direction for the next build. This document supersedes conflicting assumptions in the earlier v1 documents.

## Product rule

The app replaces the existing Excel workflow. Its fields, terms and daily actions must reflect the workbook: PO, item, challan/delivery, bill, GST, Ariba upload and payment. It must be easier than the sheet, not a more complicated accounting product.

## Confirmed decisions

| Area | Decision |
|---|---|
| Access | Every team member has an individual login. All authenticated users can view and change all tracker data. There are no business roles, approvals or role-based screens. |
| PO lifecycle | A user manually chooses the PO's high-level stage: `Draft`, `Ordered`, `Partially built`, `Partially paid`, `Closed`. This is a working label, not a replacement for the actual item facts. |
| Item progress | One PO has many items. Each item can be delivered, billed and paid differently, on different dates. Item facts must drive the numbers shown for the PO. |
| Updates | Users search for a PO number, open that PO, and edit its header, items, lifecycle and related delivery/bill/payment data there. Pasting is for creating a new PO, not for replacing an existing PO. |
| Excel compatibility | Keep the Excel field structure and vocabulary as the initial operating format. Do not invent mandatory business fields that the sheet does not use. |
| Challans and bills | Support both: fast inline entry from a PO detail page for the normal case, and dedicated challan/bill forms for multi-PO or more detailed cases. |
| Revisions | Use the existing linked PO revision design. It preserves a history and recorded delivery/billing data; it is safer than editing a historical PO in place. |
| Numbering | PO and bill numbers are entered exactly as issued. The app must not auto-generate them or reject a valid client-specific format. |
| Payments | Record whether a bill has been paid and the received amount/date. Keep the existing allocation-capable model so partial payments remain possible. TDS, retention and discounts stay optional until accounts confirms a real need. |
| Exports | Internal users export data for hand-off to other teams. Excel/XLSX is the primary export. PDF is optional later for a specific report, not an invoice generator. |
| Dashboard | Priorities are overdue bills/payments and POs/items stuck for too long. GST liability is useful. Client/site analysis is future scope. Upcoming/recent and client/site total widgets are not v1 priorities. |
| Thresholds | Stuck and overdue thresholds must be editable settings. Do not hard-code 15/30/45/60 days now. |
| Cancel / hold | Do not finalise their business rules yet. Preserve the ability to add explicit `Cancelled` and `On hold` states later, with a reason and audit trail. |
| Work not done | Model it as an item-level close-without-work outcome, with a reason. It must not be counted as delivered/billed, while the original ordered amount remains visible in history. |

## Important interpretation

Manual lifecycle labels and actual progress solve different problems:

- The manual PO stage tells the team where it believes the order is in its operating cycle.
- Delivery, billing and payment allocations show exactly what has happened for each item and therefore what remains.

The dashboard must show both. It must never claim that an item is paid merely because a user selected a PO-level stage.

## Still intentionally open

1. Exact business meaning and allowed transitions for `Cancelled` and `On hold`.
2. Whether the team needs TDS, retention, discount and advance-payment tracking after basic payment entry is live.
3. The default stuck/overdue day thresholds and whether client-specific overrides are useful.
4. The exact GST export layout required by the receiving team.
5. Number of daily users. The workbook shows transaction volume, not people, so this cannot be inferred safely.

