# PO Tracker — Product Requirements Document

**Version:** 1.0
**Stack:** React (Vite + TypeScript) + Django REST Framework + PostgreSQL
**Prepared by:** Engineering
**Date:** September 2026
**Status:** APPROVED FOR BUILD

---

## 1. Background & Problem Statement

The business is an electrical/MEP contractor supplying and installing fittings — Philips LED, Havells fans, cabling, panel work, HVAC — for corporate clients. Primary client is **HCL Technologies** across multiple site codes (AN04, AN08, AN22, AP08), plus **DLF Mall of India**, **Metlife** and **Satya Prakash**.

Every order is tracked in a single Excel workbook, `PO TRACKER.xlsx`. It has grown to **8 sheets, 259 purchase orders and 2,134 line items worth ~₹12.08 crore**, and it has stopped being able to answer the two questions the owner actually asks:

> *"Pata chal jaaye ki kaun sa kaam hamara reh gaya hai abhi, kis PO ka kaam nahi hua hai."*
>
> *"PO pe click karein aur uska saara aa jaaye — kitne ka bill ho gaya, kitna kiska reh gaya."*

**Why the spreadsheet fails:**

- **Status lives in cell fill colour.** Green = done, white = nothing done. The fill is *theme-indexed*, not stable RGB — it cannot be filtered, summed, sorted or reliably copied between machines.
- **Payment is not tracked at all.** No column exists. The owner explicitly asked for one.
- **824 line items carry no bill reference** (~₹7.8 cr of PO value) with **no way to distinguish "genuinely unbilled" from "row never filled in"**. That ambiguity is the core problem.
- **A PO is a header over many line items**, but a flat grid can only fake that with blank continuation rows. One PO in the file has **79 line items**; another was given **its own 259-row sheet**.
- **Dates are half text.** PO date: 141 text / 109 real. Bill date: 748 text / 562 real. Formats include `29/07/2024`, `16.01.2026` and a typo `26/09/204`. Nothing can be aged or sorted.
- **48 PO numbers appear on more than one sheet** — e.g. `9200146935` appears on three. Multiple versions of the truth with no precedence rule.
- **The quotation number — the identifier present on every document — is not recorded anywhere.**

**Cost of leaving this unsolved:** completed work that is never invoiced, invoices never uploaded to the client's Ariba portal (~₹1.05 cr currently), and receivables nobody is chasing — all invisible until someone notices by accident.

---

## 2. The Business Process

Established from an interview with the business owner. The Excel covers only stages 4–7.

| # | Stage | Notes |
|---|---|---|
| 1 | **Quotation** | Quotation number is the only identifier present on every downstream document. **Not currently recorded.** |
| 2 | **Bidding** | Client-run; rate discovery. |
| 3 | **Final quotation** | Submitted after winning the bid. |
| 4 | **PO issued** | Client issues PO number + PO date. |
| 5a | **Material line** | Bill is raised **with** the delivery. No challan. |
| 5b | **Service line** | Goods go out on a **delivery challan**, work is performed, **client inspects and approves**, and only then is the bill raised. |
| 6 | **Tax invoice** | Bill number (e.g. `UP/000038/24-25`), date, billing qty/rate, GST. |
| 7 | **Ariba upload** | Invoice uploaded to the client's SAP Ariba portal on a date. |
| 8 | **Payment** | Full, partial, advance, or net of TDS. **Not currently tracked.** |

**The material/service split runs through the entire system.** It is not a cosmetic label — it determines which stages a line item must pass through.

---

## 3. Goals

| Goal | Success Criterion |
|---|---|
| Replace colour-coded status with explicit state | Zero line items whose status can only be inferred from formatting |
| Make "what is pending" answerable | Owner answers it unaided, in under 30 seconds |
| Make "what is owed" answerable | Receivables per client/PO visible without asking anyone |
| Make data entry faster than Excel | A real 7-line PO entered faster than the same PO into the sheet — **timed** |
| One source of truth | 8 sheets → 1 system; no duplicated POs |
| Never lose work | Zero cases of work completed but never billed |
| Preserve history | All 259 POs migrated, ambiguity surfaced not guessed |

---

## 4. Non-Goals

- **Not an accounting system.** No ledgers, GST returns or books. Existing online GST software keeps that job.
- **The app does not generate tax invoices.** Bills are raised in the existing billing software; the app **records** them. Generating them risks divergence from the books and adds GST-compliance liability.
- **No Ariba API integration.** The portal is client-controlled. The app records *that* an upload happened and its outcome.
- **No client-facing portal.**
- **No inventory or stock management.**
- **No site-technician mobile app in v1** — though the data model must not preclude it.
- **No self-serve signup.** All users are created by an Admin.

---

## 5. Users & Permissions

### 5.1 Who uses the system

| Role | Who | What they do |
|---|---|---|
| **Owner** | Business owner | Reads everything, especially money. Does not enter data. Often on a phone. |
| **Staff** | Office executive(s) | Enter POs, challans, work-done status. The primary daily user. |
| **Accounts** | Accounts person | Records bills, Ariba uploads, payments and TDS. |
| **Admin** | Whoever runs the system | Master data, users, import review queue. |

Multiple staff work concurrently — this is why it is a web app rather than a desktop tool.

### 5.2 Permission Matrix (source of truth)

| Action | Owner | Staff | Accounts | Admin |
|---|:---:|:---:|:---:|:---:|
| View POs and line items | ✅ | ✅ | ✅ | ✅ |
| View money totals and receivables | ✅ | ✅ | ✅ | ✅ |
| Create / edit PO + line items | ❌ | ✅ | ❌ | ✅ |
| Revise / cancel a PO | ❌ | ✅ | ❌ | ✅ |
| Short-close a line item | ✅ | ❌ | ❌ | ✅ |
| Record delivery challan | ❌ | ✅ | ❌ | ✅ |
| Mark work done / client-approved | ❌ | ✅ | ❌ | ✅ |
| Record bill + allocations | ❌ | ❌ | ✅ | ✅ |
| Record Ariba upload / rejection | ❌ | ❌ | ✅ | ✅ |
| Record payment, TDS, advance | ❌ | ❌ | ✅ | ✅ |
| Import from Excel / PDF | ❌ | ✅ | ❌ | ✅ |
| Clear import review queue | ❌ | ❌ | ❌ | ✅ |
| Manage clients, sites, entities | ❌ | ❌ | ❌ | ✅ |
| Manage users | ❌ | ❌ | ❌ | ✅ |
| View audit log | ✅ | ❌ | ❌ | ✅ |
| Export to Excel | ✅ | ✅ | ✅ | ✅ |

**Enforcement rule:** every mutation is permission-checked **server-side**. No action may be gated by UI visibility alone.

---

## 6. Findings That Constrain the Design

These were measured from `PO TRACKER.xlsx` on 2026-08-31, not assumed. **They are binding.**

### 6.1 Partial delivery and partial billing are real

| Observation | Count |
|---|---|
| Lines billed **less** than ordered | 94 |
| Lines billed **more** than ordered | 16 |
| Lines delivered **less** than ordered | 71 |
| Lines delivered **more** than ordered | 35 |
| POs carrying more than one bill | 52 of 225 |
| Maximum bills against one PO (`8600048367`) | **13** |

**Consequence:** a line item **cannot** store a simple status. It requires **quantity ledgers** — ordered / delivered / billed / paid — with status **derived** from them. This rules out the obvious model.

### 6.2 Bills and challans are many-to-many with line items

- `UP/000009/25-26` covers POs `9200131247` **and** `9200132370`
- `UP/000117/25-26` covers POs `8600063926` **and** `9200159411`
- Challan `194/23.2.25` covers `8600063926` **and** `9200159411`
- Challan `188/12/2/26` covers `8600063901` **and** `9200160448`

**Consequence:** a bill is **not** a child of a PO. Bill↔line-item and challan↔line-item are both many-to-many, each carrying a quantity.

### 6.3 PO revisions are routine and must be first-class

Fourteen free-text markers found, scattered across whichever column happened to be free (PO No., PO date and Site Address columns all contain them):

`PO Changed` · `PO Amended` · `PO revised with Tax` · `PO Changed with Tax` · `PO Changed with Tax @18%` · `PO Cancelled due to Material categery new po. No-9200160448`

The dominant reason is visible in the wording: **a PO issued without tax is reissued with 18% GST.** A revision must carry forward work already recorded against superseded lines.

### 6.4 GST is per line and mostly zero

| GST rate | Line items |
|---|---|
| 0% | **948** (847 of which were actually billed) |
| 18% | 502 |
| 18 entered as `18` not `0.18` | 3 — *amounts are correct; formatting inconsistency only* |
| 28% | 1 |

**Consequence:** GST rate is a per-line field with a per-client default. It is never a global 18%. **Open question 10.2 must confirm whether 0% is correct.**

### 6.5 Two invoice series exist

Bill numbers carry two prefixes: **`UP/…`** and **`HR/…`**, implying **two GST registrations** (Uttar Pradesh and Haryana). Issuing entity is therefore a first-class field, not an afterthought.

### 6.6 Legacy bill numbers are unreliable

**33 bill numbers carry an impossible financial year** — `UP/000037/24-26`, `…/24-28` through `…/24-37`, `HR/000082/24-37`, `HR/000143/24-37`. The serial and financial-year parts were transposed during entry. The "13 bills" on PO `8600048367` is very likely far fewer. Legacy bill numbers must never be treated as unique keys.

### 6.7 Other confirmed facts

- **Billing rate differs from PO rate on 24 line items** — the rate belongs on the bill allocation, not only on the line.
- **Bill-to can differ from ship-to** — the Metlife row records delivery source *"K C Infra (Bill to ship to)"*.
- **Line items can be short-closed** — confirmed by the owner. Ordered 50, client accepts 45, line is finished.

---

## 7. Feature Specifications

### 7.1 Authentication
Email + password, Django session auth with CSRF. Admin creates all users. First login forces a password change. Admin can reset any password out-of-band; no email-based reset.

### 7.2 Purchase Orders
Create a PO with N line items on one keyboard-driven screen. Fields: client, site, PO number, PO date, PO category; per line: description, item type (material/service), qty, unit, rate, GST rate, amount. `po_number` is unique **per client**, never globally — formats differ by client (`8100013678`, `SO/12202429335`, `93026-0000001623`, `HCL CO./2025-26/03`).

**Revision:** "Revise PO" creates a linked successor, marks the predecessor `superseded`, captures a reason, and carries allocations forward. "Cancel and replace" links to the replacement PO.

**Short-close:** an Owner or Admin can close a line at less than ordered quantity, with a reason. The line leaves every "pending" view.

### 7.3 Delivery Challans
A challan header (number, date, site, delivery source, bill-to, ship-to) with allocations to line items, each carrying a quantity. One challan may span multiple POs.

### 7.4 Work Done and Client Approval
For service lines: mark work complete, then mark client-approved. The gap between these two is where the transcript says delays actually live — the app makes it visible.

### 7.5 Bills
Recorded, **never generated**. A bill header (issuing entity, bill number, bill date, totals) with allocations to line items carrying qty, rate, amount, GST rate and GST amount. Bill number format validated as `PREFIX/serial/YY-YY` with `YY2 = YY1 + 1`, so the legacy defect cannot recur.

### 7.6 Ariba Upload
Per bill: upload date and outcome (`pending`, `uploaded`, `rejected`, `resubmitted`) with a rejection reason. A bill that is not uploaded cannot be paid — this is a headline dashboard metric.

### 7.7 Payments
Payments attach to the **client**, not the bill, because advances arrive before any bill exists. A payment is then *allocated* across bills, each allocation typed: `payment`, `tds`, `retention`, `discount`, `write_off`. TDS is a deduction, not an outstanding — without this distinction receivables never reconcile.

### 7.8 Search
One box. Matches PO number, bill number, challan number, client, site and description. Partial and case-insensitive. Never enforces a PO number format.

### 7.9 Import
Three paths, all landing in a review screen before saving:
1. **Manual form** — always available as fallback.
2. **Paste-block** — paste a range from Excel, map columns once, remember the mapping.
3. **PDF extraction** — upload the client's PO PDF, extract line items. **Never auto-saves.** Per-field confidence shown side-by-side with the source.

### 7.10 Legacy Migration
All 259 POs / 2,134 line items. Anything ambiguous goes to an `import_review_item` queue — visibly flagged, excluded from headline totals until an Admin clears it. The migration is a repeatable, re-runnable script that reconciles totals against the workbook and reports the diff.

### 7.11 Dashboards
Pending work, receivables ageing, Ariba upload backlog, work-done-but-unbilled ageing. Per client and per site. Mobile-first for the owner.

### 7.12 Audit Log
Every create/update/delete on financial tables records actor, timestamp, before and after. Soft deletes only; nothing is ever hard-deleted.

---

## 8. Success Metrics

| Metric | Baseline | Target | How measured |
|---|---|---|---|
| Line items in indeterminate state | 824 | **< 20**, sustained | Count of live lines with no derivable stage |
| Time to answer "what is outstanding?" | Unanswerable | **< 30 seconds**, unaided | Owner performs the lookup himself |
| Data entry time per PO | Baseline at go-live | **≥ 50% reduction** | 10 POs timed old way vs new |
| Work completed but unbilled > 30 days | Unknown | Visible and trending down | Dashboard metric |
| Billed but not uploaded to Ariba | ~₹1.05 cr | Near zero | Dashboard metric |
| Sheets in active use | 8 | **0** | Excel opened for export only |
| Adoption | — | 100% of new POs in-app within 30 days | New POs in app vs in Excel |

---

## 9. Delivery Milestones

| # | Milestone | Outcome | Status |
|---|---|---|---|
| 1 | Foundation and data model | Schema, auth, masters, audit log | TODO |
| 2 | PO entry and PO-first search | Enter a PO, find it, view it | TODO |
| 3 | Legacy migration | All 259 POs in, ambiguity queued | TODO |
| 4 | Fast entry: paste-block + PDF | Entry time measurably halved | TODO |
| — | **Feedback gate — Release 1 in real use** | Scope of R2 confirmed by usage | — |
| 5 | Challans, work-done, approval | The invisible middle becomes visible | TODO |
| 6 | Bills and Ariba tracking | Bills linked to lines; backlog visible | TODO |
| 7 | Payments: advance, partial, TDS | True outstanding per client | TODO |
| 8 | Dashboards and alerts | Pending + receivables in under 30s | TODO |
| 9 | Quotations and bidding | Line items typed once, inherited | TODO |

**Release 1 = Milestones 1–4.** Confirmed by the user: ship it, gather feedback, then build outward.

---

## 10. Open Questions

### 10.1 Two GST registrations — confirm
Bill prefixes `UP/` and `HR/` imply registrations in Uttar Pradesh and Haryana. Confirm with accounts. If true, place-of-supply rules apply per entity.
**Blocks:** Milestone 6. **Owner:** Accounts.

### 10.2 Is 0% GST correct? — highest-value question
948 lines at 0%, 847 of them billed. Either correct (reverse charge, or pre-revision tax-less POs) or a large amount of GST is unrecorded. If the latter, `Total Billing Amount` cannot be trusted anywhere in the legacy data.
**Blocks:** Milestone 3 reconciliation. **Owner:** Accounts.

### 10.3 Retention / security deposit
Not reported by the owner, but standard in contracting. `payment_allocation.kind` already includes `retention`, so this is confirmation, not redesign.
**Blocks:** Milestone 7. **Owner:** Accounts.

### 10.4 Does Ariba reject invoices?
Modelled defensively with `ariba_status`. Confirm the real workflow.
**Blocks:** Milestone 6. **Owner:** Office staff.

### 10.5 Who marks work as done, and how do they learn of it?
The office executive is not on site. This is a **process** gap the software surfaces but cannot close. Ageing alerts create the pressure; a site-capture path is the real fix.
**Blocks:** Milestone 5 rollout, not its build. **Owner:** Business owner.

### 10.6 Billing rate vs PO rate divergence
24 line items differ. Legitimate renegotiation, or entry error? Should a divergence require approval?
**Blocks:** Milestone 6. **Owner:** Business owner.

### 10.7 Quotation → PO cardinality
Can one quotation produce several POs, or one PO draw on several quotations? Not answerable from the file.
**Blocks:** Milestone 9 only. **Owner:** Business owner.

### 10.8 Bill-to vs ship-to frequency
Observed once (Metlife → K C Infra). Modelled as first-class; confirm how common.
**Blocks:** Nothing. **Owner:** Office staff.

---

## 11. Acceptance Criteria — Release 1

- [ ] Full schema migrated, including tables Release 1 does not yet expose
- [ ] Line item status is **derived**; no stored status column exists anywhere
- [ ] Every status-derivation branch has a test, including over-billing and short-close
- [ ] Money is `numeric(14,2)` throughout; a property test proves allocations re-sum exactly
- [ ] Permissions enforced at the API layer, verified by tests that bypass the UI
- [ ] Audit log captures before/after on every financial mutation
- [ ] **A real 7-line PO is entered faster than into Excel (timed)**
- [ ] PO detail totals reconcile to the rupee against a known workbook PO
- [ ] Search finds a PO by PO number, bill number and site
- [ ] All 259 POs imported; ambiguous rows visible in the review queue and excluded from headline totals
- [ ] Excel export produces real dates and a real status column
- [ ] Backup restore drill completed successfully

---

## 12. Risks

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R1 | **Staff quietly revert to Excel.** The commonest death of an internal tool. | High | Critical | Entry speed is a P0 feature. Timed test is a hard acceptance gate. One-click Excel export so nobody feels trapped. Roll out to one person, fix friction, then widen. |
| R2 | **Migration produces garbage and erodes trust.** One wrong number on the owner's dashboard ends confidence. | High | High | Never guess silently. Ambiguity goes to the review queue, excluded from totals. Migration is repeatable and reconciles against the workbook. |
| R3 | **Information latency, not software, is the real bottleneck.** Nobody in the office knows the moment site work finished. | High | Medium | Be honest: v1 makes the gap visible, not closed. Ageing alerts create pressure. Keep the model ready for site capture. |
| R4 | **Money model too simple, so receivables never reconcile.** | Medium | High | Payments attach to client and are allocated; TDS is a typed deduction. Designed in from Milestone 1. |
| R5 | **PDF extraction unreliable across four client formats.** Silent mis-extraction is worse than none. | High | Medium | Never auto-save. Side-by-side review with confidence. Paste-block ships first. |
| R6 | **Interim status marking becomes a habit.** R1 has no bills, so staff set status by hand. | High | Medium | Store as a separate `interim_status` that the derived view **overrides** once allocations exist. Removal planned in Milestone 5. |
| R7 | **Dual-running period.** Truth split between app and Excel. | High | Medium | Hard cutover date for new POs. Migrate history *before* go-live. One announced week of dual entry, maximum. |
| R8 | **Data loss.** Financial data with no other home once Excel retires. | Low | Critical | Daily backups with PITR. **Restore drill before Milestone 3 loads real data** — an untested backup is not a backup. Soft deletes only. |
| R9 | **Scope creep into an ERP.** | High | Medium | The milestone table is the contract. Feedback gate after R1. Non-goals binding until explicitly re-scoped. |
| R10 | **Single-developer bus factor.** | Medium | High | Proven stack. These documents. Plain-SQL-shaped schema, no clever abstractions. |
| R11 | **Search doesn't match how people look things up.** | Medium | Medium | One box across all identifiers. Never enforce a PO number format. |
| R12 | **Concurrent edits.** | Medium | Low | Optimistic locking with a clear "someone else changed this". No real-time collaboration. |

---

*Sources: `PO TRACKER.xlsx` measured 2026-08-31 via openpyxl; owner interview transcript.*
*See [SCHEMA.md](SCHEMA.md) for the data model, [TECH_SPEC.md](TECH_SPEC.md) for architecture, [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for the build sequence.*
