# PO Tracker

*Order-lifecycle tracking for an electrical/MEP contracting business.*

---

## Problem

The business tracks every purchase order — from client quotation through delivery, work completion, invoicing and payment — in a single Excel workbook (`PO TRACKER.xlsx`). That workbook has grown to 8 sheets, 259 POs and 2,134 line items worth ~₹12.08 crore, and it has stopped being able to answer the two questions the owner actually asks: **"which work is still pending?"** and **"whose money is still outstanding?"**

Status is encoded in cell fill colour. Payment is not tracked at all. 824 line items carry no bill reference, with no way to distinguish *genuinely unbilled* from *never filled in*. The cost of leaving this unsolved is completed work that is never invoiced, invoices that are never uploaded to the client portal, and receivables nobody is chasing — all of it invisible until someone notices by accident.

---

## Evidence

**Validated.** Measured directly from `PO TRACKER.xlsx` on 2026-08-31 (openpyxl), plus a recorded conversation with the business owner.

| Observation | Evidence |
|---|---|
| Status is colour-coded, not recorded | Owner: *"abhi to hum rang birange karke wo kar rahe hain… jo green hai wo wale ka kaam ho gaya hai"*. Confirmed in file: fill is **theme-indexed**, not stable RGB. |
| Payment is not tracked | Owner: *"ek wo bhi karna hai ki payment kab aa gayi hai, wo bhi column ek ban jaaye."* No such column exists. |
| The core question is unanswerable today | Owner: *"pata chal jaaye ki kaun sa kaam hamara reh gaya hai abhi, kis PO ka kaam nahi hua hai."* |
| Desired interaction is PO-first lookup | Owner: *"PO pe click karein aur uska saara aa jaaye, kitne ka bill ho gaya, kitna kiska reh gaya."* |
| Data entry is manual copy-paste | Owner: *"ek ek copy paste karte hain"*, sourced from the quotation. |
| The real primary key is the quotation number | Owner, when asked for an identifier present on every document: *"wo quotation number hota hai."* **It is absent from the tracker.** |
| A PO is a header over many line items | Owner: *"row number 3 se lekar row number 9 tak ye ek PO ka item hai."* Largest PO in file: **79 line items**. |
| Material and service follow different paths | Owner: *"agar khali material supply karna hai to uska saath ke saath bill chala jata hai. Agar kaam karna hai to challan pe saman jata hai pehle, phir baad mein… check karte hain, okay karte hain, phir hum bill dete hain."* |
| 824 line items have no bill reference | ~₹7.8 cr of PO value, status indeterminate. |
| ~₹1.05 cr billed but never uploaded to Ariba | Un-uploaded invoices cannot be paid. |
| Delivery stage is barely recorded | 1,310 rows have a Bill No; only **494** have a Challan No. |
| Dates are unusable as dates | PO date: 141 text / 109 real. Bill date: 748 text / 562 real. Formats include `29/07/2024`, `16.01.2026`, and a typo `26/09/204`. |
| Truth is duplicated | **48 PO numbers appear on more than one sheet** (e.g. `9200146935` on three). |
| The spreadsheet is visibly failing | One PO (`8100014714`) has been given **its own 259-row sheet**. |
| POs get revised mid-flight | The literal text **`PO Changed`** appears in the S.No column of the `HCL Sec-60` sheet. |
| Bill-to can differ from ship-to | Metlife row records delivery source *"K C Infra (Bill to ship to)"*. |

---

## Users

**Primary — Office executive (data entry).** Currently maintains the workbook by copy-pasting from quotations and POs. Triggered by: a new PO arriving, goods dispatched, a challan signed, a bill raised, a payment received. Needs entry to be *faster* than Excel or they will quietly go back to Excel.

**Primary — Business owner (read-only).** Does not enter data. Asks "what's pending" and "what's outstanding", today by scrolling a coloured spreadsheet with someone else driving. Needs answers in seconds, on a phone as often as a desktop.

**Secondary (post-MVP) — Accounts.** Records bills, Ariba uploads and payments.

**Not for:** clients (no external portal), site technicians (no field app in v1), accountants (this is not a book of accounts).

---

## Hypothesis

We believe a **multi-user web application that tracks status and money at the individual line-item level, with an explicit stage for every line** will let this business **see exactly which work is incomplete and which money is uncollected** for the **office executive and the owner**.

We'll know we're right when the owner can answer "what's pending and what's owed" **without opening Excel or asking anyone**, and the count of line items in an indeterminate state falls from **824 to effectively zero and stays there**.

---

## Success Metrics

| Metric | Target | How measured |
|---|---|---|
| **Line items in indeterminate state** | 824 → **< 20**, sustained | Count of live line items with no explicit stage |
| **Time to answer "what is outstanding?"** | minutes/unanswerable → **< 30 seconds**, unaided | Owner performs the lookup himself |
| **Data entry time per PO** | **≥ 50% reduction** | Timed: 10 POs entered the old way vs. the new way |
| **Work completed but unbilled > 30 days** | Visible and **trending down** | Dashboard metric; baseline set at go-live |
| **Billed but not uploaded to Ariba** | ~₹1.05 cr → **near zero** | Dashboard metric |
| **Sheets in active use** | 8 → **0** | Excel opened for export, not entry |
| **Adoption** | **100%** of new POs entered in the app within 30 days of go-live | New POs in app vs. new POs in Excel |

---

## Scope

### MVP — Release 1 (the smallest thing they would actually start using)

Confirmed by the user: ship this, gather feedback, then build outward.

- Record a **PO** with its **line items** (client, site, PO no., PO date, description, qty, unit, rate, amount, material-vs-service type)
- An **explicit stage per line item**, replacing colour
- **Search by PO number** → one page showing the PO, every line, and every line's stage
- **Import the existing workbook** (all 259 POs / 2,134 line items), with anything ambiguous routed to a *needs-review* queue rather than blocking go-live
- **Three entry paths**: manual form, paste-a-block from Excel, upload PO PDF and auto-extract (all three land in a review screen before saving)
- **Multi-user login** with owner (read) and staff (write) roles
- **Export to Excel**, always available

### Later releases (order to be confirmed by feedback from R1)

- Delivery challans, work-done and client-approval stages
- Bills (recorded, not generated), Ariba upload tracking
- Payments: advances, part-payments, TDS deduction
- Owner dashboards: pending work, receivables ageing, Ariba backlog
- Quotation and bidding — closing the loop so line items are typed **once**
- Alerts: work done but unbilled, billed but unpaid, PO with nothing delivered

### Out of scope

| Item | Why deferred |
|---|---|
| **Generating tax invoices** | Bills are raised in existing online GST software. Generating them risks divergence from the books and adds GST-compliance liability. App **records** bills. |
| **Ariba API integration** | Client-controlled portal. App records *that* an upload happened. |
| **Accounting / ledgers / GST returns** | This is a tracker. Books stay where they are. |
| **Client-facing portal** | No client asked for it. |
| **Inventory / stock** | Not a stated pain. |
| **Site technician mobile app** | Real future value (delivery data is the thinnest), but the data model only needs to *allow* it in v1. |

---

## Delivery Milestones

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | **Foundation & data model** | Clients, sites, POs, line items and line stages exist; multi-user login works | **in-progress** | `.claude/plans/po-tracker.plan.md` |
| 2 | **PO entry & PO-first search** | Office staff can enter a PO and find it instantly; owner can view it | **in-progress** | `.claude/plans/po-tracker.plan.md` |
| 3 | **Legacy migration** | All 259 POs live in the app; ambiguous rows sit in a review queue | pending | — |
| 4 | **Fast entry: paste-block + PDF extract** | Entry time per PO measurably halved | pending | — |
| 5 | *(feedback gate — R1 in real use before scoping R2)* | Scope of milestone 6+ confirmed by actual usage | pending | — |
| 6 | **Delivery, work-done & approval stages** | The invisible middle of the process becomes visible | pending | — |
| 7 | **Bills & Ariba tracking** | Every bill linked to the lines it covers; upload backlog visible | pending | — |
| 8 | **Payments: advance, partial, TDS** | Owner can see true outstanding per client | pending | — |
| 9 | **Owner dashboards & alerts** | Pending-work and receivables answerable in < 30s | pending | — |
| 10 | **Quotations & bidding** | Line items typed once, inherited downstream | pending | — |

---

## Open Questions

Grouped by whether they can block. **P0 questions must be answered before the data model is frozen** — getting them wrong means a rewrite, not a patch.

### P0 — RESOLVED from the existing data (2026-08-31)

These were answered by querying `PO TRACKER.xlsx` directly rather than by asking. **They are
now binding constraints on the data model.**

- [x] **Can one line item be delivered or billed in parts? → YES. Confirmed.**
      94 line items billed *less* than ordered; 16 billed *more*. 71 delivered less than
      ordered; 35 delivered more. **A line item's state CANNOT be a simple stage enum.**
      It requires quantity ledgers: `ordered / delivered / billed / paid`, with stage
      *derived* from those quantities. This single finding rules out the simplest model.
- [x] **Can one PO have many bills? → YES, routinely.**
      52 of 225 billed POs carry more than one bill. **Maximum observed: 13 bills against a
      single PO** (`8600048367`).
- [x] **Can one bill cover more than one PO? → YES.**
      e.g. `UP/000009/25-26` covers POs `9200131247` + `9200132370`;
      `UP/000117/25-26` covers `8600063926` + `9200159411`.
      **A bill therefore cannot be a child of a PO** — bill↔line-item is many-to-many.
- [x] **Can one challan cover more than one PO? → YES.**
      e.g. `194/23.2.25` covers `8600063926` + `9200159411`;
      `188/12/2/26` covers `8600063901` + `9200160448`.
      Challan↔line-item is likewise many-to-many.
- [x] **Do POs get revised? → YES, and it is common and consequential.**
      ~14 free-text markers found: `PO Changed`, `PO Amended`, `PO revised with Tax`,
      `PO Changed with Tax @18%`, and one cancellation-with-replacement:
      *"PO Cancelled due to Material categery new po. No-9200160448"*.
      The dominant reason is visible in the wording — **a PO issued without tax is reissued
      with 18% GST.** These markers are scattered across whatever column was free
      (PO No., PO date, and Site Address columns all contain them), so revision must become
      a **first-class field with a reason and a link to the superseding PO.**

Still open at P0:

- [ ] **Is quotation → PO strictly one-to-one?** Can one quotation produce several POs, or
      one PO draw on several quotations? Not answerable from the file — quotation numbers
      aren't recorded. Needed before Milestone 10, not before Milestone 1.
- [ ] **Can a line item be short-closed?** 94 lines are billed below ordered qty — but the
      file cannot say whether those are *closed short* or *still partly pending*. Without an
      explicit short-close action they sit "pending" forever and pollute every metric.
      **This is the one P0 that still needs a human answer.**

### P1 — needed before the relevant release

- [ ] **Two invoice series exist: `UP/…` and `HR/…`.** This implies **two state GST
      registrations (Uttar Pradesh and Haryana)**, each with its own invoice series and
      place-of-supply rules. Confirm — if true, "which entity/state is this bill from" is a
      first-class field, not an afterthought.
- [ ] **GST is per-line and mostly zero.** Measured: **948 lines at 0%**, 502 at 18%, 3 at
      18 entered as `18` rather than `0.18` (amounts are correct — a format inconsistency,
      not a financial error), 1 at 28%. 847 of the zero-GST lines were actually billed, so
      0% is not just an unfilled cell. **Is 0% correct (reverse charge / the client pays tax
      / pre-GST-revision PO), or is a large slice of GST simply unrecorded?** This changes
      whether "Total Billing Amount" can be trusted at all.
- [ ] Does any client hold **retention / security deposit**? (Not selected earlier, but standard in contracting — worth double-checking with accounts.)
- [ ] **Can Ariba reject an invoice?** If so, upload needs an outcome, not just a date.
- [ ] **Who marks work as done, and how do they find out?** The office executive isn't on site. This is a process gap the software surfaces but cannot close on its own.
- [ ] **Billing rate differs from PO rate on 24 line items.** Legitimate renegotiation, or entry errors? Should a divergence be flagged for approval?
- [ ] **Bill-to vs ship-to**: the Metlife row shows a third party. How common, and does it need to be a first-class field?
- [ ] How should **site codes** (AN04, AN08, AN22, AP08) be structured — a site master under each client — and does the owner want reporting by site?
- [ ] Are TDS certificates reconciled quarterly, and should the app track that?

### P2 — nice to resolve

- [ ] Should closed POs older than N years be archived out of search?
- [ ] Does the online GST billing software offer an export or API for pulling bills in later?

---

## Risks

Ordered by expected damage. "Where it breaks" is the point of this section.

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | **Adoption failure — staff quietly revert to Excel.** The commonest death of an internal tool. If entering a PO is slower than pasting into a grid, Excel wins and you end up with two divergent systems. | **High** | **Critical** | Treat entry speed as a P0 feature, not polish. Ship paste-block early. Time it against Excel and publish the number. Make Excel export one click so nobody feels trapped. Run R1 with one person, fix friction, then widen. |
| R2 | ~~**The quantity model is wrong.**~~ **RESOLVED — partial delivery and partial billing are confirmed real** (94 lines billed under-qty, 71 delivered under-qty, up to 13 bills on one PO, bills and challans spanning multiple POs). A simple stage enum is now known to be wrong. | — | — | **Mandatory: quantity-ledger model.** Line item holds ordered qty; delivered/billed/paid quantities accumulate from many-to-many allocations. Stage is **derived**, never stored. Bill and challan are peers of the PO, not children. This is now a design constraint, not a risk. |
| R2b | **Bill numbers in the legacy data are unreliable.** 33 bill numbers carry an impossible financial year (`UP/000037/24-26`, `…/24-37`, `HR/000143/24-37`) — the serial and FY parts appear to have been confused during entry. One PO shows 13 "distinct" bills that are probably far fewer. | **Confirmed** | **High** | Do not treat legacy bill numbers as unique keys. Validate format on import (`PREFIX/serial/YY-YY` with `YY2 = YY1+1`); anything failing goes to the review queue. In the new app, validate on entry so this cannot recur. |
| R3 | **Migration produces garbage that erodes trust.** 48 duplicated POs, 889 text dates in mixed formats, status recoverable only from theme-indexed colours. One wrong number on the owner's dashboard and confidence is gone. | **High** | **High** | Never silently guess. Anything ambiguous goes to a *needs-review* queue, visibly marked, excluded from headline totals until cleared. Migration is a reviewed, repeatable, re-runnable script — not a one-off paste. Reconcile totals against the workbook and show the diff. |
| R4 | **PO revisions break the model.** `PO Changed` is already in the data. Qty and rates change after work has started. | **Medium-High** | **High** | Resolve the P0 question. Design for immutable line versions with an audit trail from the start; retrofitting versioning is very expensive. |
| R5 | **PDF extraction is unreliable across clients.** HCL, DLF, Metlife and Satya Prakash all use different formats and PO numbering (`8100013678`, `SO/12202429335`, `93026-0000001623`, `HCL CO./2025-26/03`). Silent mis-extraction is worse than no extraction. | **High** | **Medium** | Extraction **never** auto-saves. Always a side-by-side review screen against the source. Show per-field confidence. Ship paste-block first (reliable), PDF second. Degrade to manual without complaint. |
| R6 | **The real bottleneck is information latency, not software.** Nobody in the office knows the moment site work finished, so the "work done" stage will lag no matter how good the app is. | **High** | **Medium** | Be honest that v1 makes the gap *visible* rather than closing it. Ageing alerts ("done 30 days ago, still unbilled") create the pressure. A site-capture path is the real fix — keep the model ready for it. |
| R7 | **Money model too simple → receivables never reconcile.** TDS, advances and part-payments mean cash received rarely equals the bill. Model payments as bill-children and outstanding will be permanently wrong, and the owner will stop trusting the number. | **Medium** | **High** | Payments attach to the **client/PO** and are *allocated* to bills. Deductions (TDS) are a distinct type from shortfalls. An advance is a payment with no bill yet. Design this before Release 8. |
| R8 | **Dual-running period.** Between go-live and full migration, some truth is in the app and some in Excel. | **High** | **Medium** | Set a hard cutover date for new POs. Migrate history *before* go-live, not after. One announced week of dual entry, maximum. |
| R9 | **Single-developer bus factor.** One person builds and holds all context. | **Medium** | **High** | Boring, mainstream stack. Written decisions (this PRD + plan). Plain-SQL-shaped schema, no clever abstractions. Nightly backup the owner can independently download. |
| R10 | **Data loss.** This is financial data with no other home once Excel is retired. | **Low** | **Critical** | Daily automated backups with point-in-time restore. Scheduled restore drill before go-live — an untested backup is not a backup. Soft deletes only; full audit trail. |
| R11 | **Scope creep into an ERP.** "Wo bhi ho jayega" is easy to say. Quotations, inventory, purchase-side and accounting all beckon. | **High** | **Medium** | The milestone table is the contract. Feedback gate after R1. The out-of-scope table is binding until the owner explicitly re-scopes. |
| R12 | **Concurrent edits.** Two office staff open the same PO. | **Medium** | **Low** | Optimistic locking with a clear "someone else changed this" message. Do not build real-time collaboration. |
| R13 | **Search doesn't match how people actually look things up.** The owner says "PO number daalein", but PO numbers aren't uniform and staff may search by site, client or bill number. | **Medium** | **Medium** | Single search box matching PO no., bill no., challan no., client, site and description. Do not force an exact-format PO field. |
| R14 | **Timeline pressure vs. correctness on the P0 questions.** The temptation is to start coding before the quantity model is settled. | **Medium** | **High** | The P0 list is a hard gate. Answer it from the existing data — the answers are already in the file. |

---

*Status: DRAFT — requirements only. Implementation planning pending via /plan.*
*Sources: `PO TRACKER.xlsx` (measured 2026-08-31) and owner interview transcript.*
