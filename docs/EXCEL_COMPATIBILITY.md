# PO Tracker — Excel Compatibility and Import Contract

The workbook is the initial source of truth for vocabulary and fields. This contract keeps data entry familiar while fixing the workbook's blank continuation rows, free-text markers and non-searchable colours.

## Column mapping

| Excel | App destination | Handling |
|---|---|---|
| A `S.No` | line number | Display/order only; regenerate when items are reordered. |
| B `PO No.` | PO number | Create a new PO only when it is a real number/reference, not a marker. |
| C `PO date` | PO date | Normalise to a real date; flag unparseable values. |
| D `Site Address` | client site | Parse code/name where present. `Work not done` is an item-close outcome, not a site. |
| E type | item type | Preserve `Material`/`Service`; infer only when blank and mark inference as editable. |
| F–J description/qty/unit/rate/amount | PO item | Amount is recomputed and compared with the pasted value. |
| K–N delivery qty/UOM/source/challan | challan + allocation | Create a delivery allocation when values are present. |
| O–T billing qty/rate/amount/GST/GST amount/total | bill allocation | Create a bill allocation when bill values are present. |
| U–V bill number/date | bill | Match repeated bill numbers during the same import, preserving their multiple item allocations. |
| W Ariba upload | bill Ariba state | Preserve raw text plus structured state/date where parsable. |

## Paste semantics

Paste is a **new PO intake** tool. The team copies a block in the familiar format, including blank PO-number cells for continuation items. The parser carries the last PO header forward to those rows.

If the pasted block contains the same client + PO number as an existing live PO, do not replace or merge it. Return an `existing PO` result with a link to open and update that PO. This prevents accidental duplication and protects history.

## Parser policy

The parser must recognise, preserve and classify—not silently guess—the following workbook shapes:

- totals/GST/grand-total rows: validate against calculated totals but never create line items;
- `PO Changed` / `PO Amended`: create a linked revision draft, never a new bogus PO;
- `PO Cancelled` / `Order cancelled by client`: retain as an unresolved event until cancellation rules are confirmed;
- `Work not done by client` / `Closed (work not done)`: create a line close-without-work reason;
- partial delivery and partial billing: use quantity allocations, not text status;
- inconsistent dates, GST values, bill numbers and divergent rates: flag for correction without discarding the source row.

For clean new data, saving must feel immediate. For ambiguous legacy data, commit it as `needs review` and exclude it from KPI totals until resolved. The original worksheet/sheet/row reference is retained for every imported line.

## Attachments

Users may attach the original PO PDF and supporting challan/bill documents to the PO or relevant transaction. Attachments are evidence; extracted values remain editable and must be confirmed before saving.

## Export contract

Primary export is XLSX. It must include PO header, line items, derived quantities/status, challan, bill, GST, Ariba and payment/outstanding fields in a flat, hand-off friendly layout. Filters applied by the user must also apply to the export. PDF exports wait until there is a named external report that needs print formatting.

