# PO Tracker — Application Flow

**Version:** 1.0
**Companion to:** [SITE_STRUCTURE.md](SITE_STRUCTURE.md) (routes) · [DESIGN.md](DESIGN.md) (visuals)

Every flow below traces a real task from the owner interview or the workbook. Where a flow exists because of something measured in the legacy data, that is stated.

---

## 1. Authentication

### 1.1 First login
```
Admin creates user (force_password_change = true)
        ↓ credentials passed out-of-band
User → /login → correct credentials
        ↓ force_password_change is set
     /force-password-change   (every other route blocked)
        ↓ old + new + confirm
     flag cleared → / dashboard for their role
```

### 1.2 Normal login
`/login` → `/` dashboard. Session cookie; CSRF token read by the SPA.

### 1.3 Admin password reset
Admin → `/settings/users` → kebab → Reset password → sets a new one directly → `force_password_change` set again. **No email-based reset exists** — communication is out-of-band, matching the existing in-house pattern.

### 1.4 Permission denial
Every endpoint re-checks the role. A denied request returns 403 with the required role named, rendered in an `Alert`. **Never a blank screen, never a silent no-op.**

---

## 2. The Owner's Flow — the reason this product exists

> *"Pata chal jaaye ki kaun sa kaam hamara reh gaya hai abhi."*
> *"PO pe click karein aur uska saara aa jaaye."*

### 2.1 "What's pending and what's owed?"
```
Owner opens app on phone → / dashboard
        ↓ first thing visible: OUTSTANDING ₹78,02,463
        ↓ below it: by client — HCL, DLF, Metlife
        ↓ tap a client → that client's outstanding bills, aged
        ↓ tap a bill → the lines it covers, the PO they belong to
```
**Target: under 30 seconds, unaided.** This is the PRD success metric.

### 2.2 "What about this PO?"
```
Owner → ⌘K or tap Search → types "8100013678"
        ↓ or types "AN22", or "Philips", or a bill number
     Result → /po/:id
        ↓ Money strip answers immediately:
          ordered / delivered / billed / uploaded / paid / OUTSTANDING
        ↓ Lines tab shows which lines are incomplete, with status badges
        ↓ Expand a line → allocation bars: 45 of 50 delivered, 20 of 50 billed
```
Search never validates the format, because PO numbers differ per client (`8100013678`, `SO/12202429335`, `93026-0000001623`, `HCL CO./2025-26/03`).

---

## 3. Purchase Order Flows

### 3.1 Enter a new PO — the flow that decides adoption
```
Staff → /po → "Add PO"
        ↓ header: client → site and GST default auto-fill from the client
        ↓ PO number, PO date, category
        ↓ LINE ITEM GRID:
             type description → item type guessed (Supply→Material,
                                Installation/Providing→Service), dotted underline
             Tab → qty → Tab → unit → Tab → rate
             amount computes itself
             Enter → next row.  Ctrl+D → copy cell above.  Ctrl+V → paste 20 rows
        ↓ live totals in the footer
        ↓ Save (Ctrl+S) → transaction → /po/:id
```
**No mouse required.** [Phase 4.3](IMPLEMENTATION_PLAN.md) times this against Excel; if Excel wins, the grid is not finished.

**Failure paths:** duplicate PO number for the same client → inline error on that field, nothing lost. Network failure on save → the form retains everything, with a retry button in a toast.

### 3.2 Import instead of typing *(Phase 4)*
```
Staff → /po/import
   ├─ Paste from Excel → paste range → map columns once (remembered per client)
   │                  → preview grid → correct inline → Save
   └─ Upload PO PDF   → extraction runs → SIDE-BY-SIDE REVIEW against the source
                      → per-field confidence; low-confidence fields highlighted
                      → correct inline → Save
```
**Neither path ever auto-saves.** Silent mis-extraction is worse than no extraction — four clients, four PO formats.

### 3.3 Revise a PO
Driven by 14 real markers in the workbook, most saying *PO Changed with Tax* — a tax-less PO reissued at 18% GST.

```
Staff → /po/:id → kebab → "Revise"
        ↓ /po/:id/revise, pre-filled with current lines
        ↓ WARNING shown on lines that already carry delivered or billed qty
        ↓ edit qty / rate / GST; add or remove lines
        ↓ revision_reason required
        ↓ Save → ONE TRANSACTION:
             successor PO created
             predecessor → status = superseded, superseded_by set
             challan + bill allocations RE-POINTED to matching successor lines
        ↓ redirect to successor
```
**If allocations were not carried forward, delivered and billed work would silently vanish.** `test_revision_preserves_delivered_quantities` guards this.

### 3.4 Cancel and replace
Same as revise, but the predecessor becomes `cancelled` and links to a *different* PO number — the workbook contains exactly this: *"PO Cancelled due to Material categery new po. No-9200160448"*.

### 3.5 Short-close a line
```
Owner/Admin → /po/:id → line kebab → "Close short"
        ↓ shows ordered 50, billed 45, shortfall 5
        ↓ reason required
        ↓ Save → short_closed_on set
        ↓ status becomes CLOSED_SHORT; line leaves every pending view
```
**Staff cannot do this.** It is a commercial decision, not data entry. Without it, 94 partially-billed lines would sit "pending" forever and poison every dashboard number.

---

## 4. Delivery Flow *(Phase 5)*

```
Goods dispatched → Staff → /challans/new
        ↓ challan number + date, site, delivery source
        ↓ bill-to and ship-to (they CAN differ — Metlife → "K C Infra")
        ↓ ADD LINES: search across POs, pick lines, enter qty per line
             → one challan may span multiple POs (4 real cases)
             → qty may be less than ordered (71 cases) or more (35 cases)
        ↓ Save → challan_allocation rows
        ↓ affected lines recompute to PART_DELIVERED or DELIVERED
```

### 4.1 Work done → client approval
```
Site work completes → Staff marks line "Work done" (date)
        ↓ status → WORK_DONE
Client inspects and approves → Staff marks "Client approved" (date)
        ↓ status → APPROVED  →  now billable
```
**The gap between these two is where delay actually lives**, per the owner: *"check-vaak karte hain saara, phir okay karte hain, phir hum bill dete hain."* The app makes the gap visible; it cannot close it. Ageing alerts create the pressure.

Material lines skip this entire section — that is data, not an exception.

---

## 5. Billing Flow *(Phase 6)*

```
Accounts raises the bill in the existing GST software (unchanged)
        ↓ then records it here
Accounts → /bills/new
        ↓ issuing entity (UP or HR — two invoice series exist)
        ↓ bill number → VALIDATED as PREFIX/serial/YY-YY with YY2 = YY1+1
             (33 legacy numbers fail this; new entry cannot repeat the defect)
        ↓ bill date
        ↓ ALLOCATE LINES: search across POs, pick lines, enter qty + rate
             → rate may differ from the PO rate (24 real cases) — allowed, flagged
             → over-billing allowed but flagged (16 real cases), never blocked
             → one bill may span multiple POs (2 real cases)
        ↓ Save → trigger recomputes bill totals from allocations
        ↓ affected lines recompute to PART_BILLED or BILLED
```

### 5.1 Ariba upload
```
Accounts uploads the invoice on the client's Ariba portal (outside the app)
        ↓ records here: /bills/:id → "Ariba" → state + date + reference
        ↓ states: pending → uploaded | rejected → resubmitted
        ↓ rejection requires a note
```
A bill sitting `pending` past 7 days is a dashboard alert. **~₹1.05 cr is in this state at baseline — un-uploaded means unpayable.**

---

## 6. Payment Flow *(Phase 7)*

The flow most likely to be modelled wrongly, so it is spelled out.

```
Money arrives → Accounts → /payments/new
        ↓ CLIENT (not a bill — advances arrive before any bill exists)
        ↓ amount, date, mode, reference
        ↓ ALLOCATE across bills, each allocation typed:
             payment    → cash received
             tds        → deducted at source; extinguishes the receivable
                          WITHOUT cash. Service work has TDS; material
                          bills are paid in full.
             retention  → held back; STILL OWED, reported separately
             discount / write_off → deliberate reduction, Admin only
        ↓ leftover → unallocated advance, held as client credit
```

**Worked example — a ₹1,00,000 service bill:**
```
Bill total                      ₹1,00,000
Payment received                  ₹90,000   kind = payment
TDS deducted by client            ₹10,000   kind = tds
                                ──────────
Settled                         ₹1,00,000
OUTSTANDING                             ₹0   ✓ reconciles
```
Model TDS as a shortfall instead and this bill shows ₹10,000 outstanding forever. **Receivables would never reconcile and the owner would stop trusting the number.**

---

## 7. Import Review Flow *(Phase 3)*

```
Admin → import_workbook --dry-run
        ↓ reconciliation report: 259 POs, 2,134 lines, ₹12.08 cr
        ↓ review breakdown by reason code
        ↓ if totals do not match → STOP, fix the reader, re-run
Admin → import_workbook --commit
        ↓ one transaction; ambiguous rows flagged needs_review
Admin → /review
        ↓ per item: severity, reason, source cell (HCL PO!A471), payload
        ↓ Accept as-is | Correct and accept | Reject
        ↓ resolved rows re-enter headline totals
```

**Everything unresolved is excluded from every headline total.** Trust is the point: one wrong number on the owner's dashboard and the system is finished.

The 12 reason codes and their legacy counts are in [SCHEMA.md §6](SCHEMA.md). The largest is `NO_BILL_REFERENCE` — **824 lines** where the workbook genuinely cannot say whether the work is unbilled or the row was never filled in. **The app does not guess. It asks.**

---

## 8. Search Flow

```
Anywhere → ⌘K or / → Command palette
        ↓ type anything: PO number, bill number, challan number,
          client, site code, or part of a description
        ↓ grouped inline results
        ↓ Enter → the record;  or → /search?q= for the full list
```
No format validation, ever. Staff search by whatever is in front of them — which is why `9200146935`, `AN22`, `UP/000038/24-25` and `Philips` must all work.

---

## 9. Concurrency

```
Two staff open PO 8100013678
User A saves  → succeeds, updated_at moves
User B saves  → 409 Conflict
        ↓ non-dismissable banner:
          "Someone else changed this PO. Reload to see their version."
        ↓ B's input is preserved on screen until they choose
```
**Never silently overwrite.** No real-time collaboration — this is a small team, and a clear conflict message is correct and cheap.

---

## 10. Error & Edge States

| Situation | Behaviour |
|---|---|
| Network failure mid-save | Form state preserved; retry in a toast |
| Session expired | Redirect to `/login` with a return path |
| PO not found | Empty state with a search box, not a 404 wall |
| Line already fully billed | Allocation form warns; over-billing permitted, flagged |
| Bill number already used for that entity | Inline error naming the existing bill, with a link |
| Deleting a PO with allocations | Blocked; explains which bills and challans reference it |
| Import file is not the expected workbook | Rejected before parsing, listing the sheet names found |
| Zero results in search | "No match for X" plus the searchable field list |

---

## 11. Feedback Conventions

| Event | Feedback |
|---|---|
| Saved | `sonner` success toast, 3s |
| Reversible action (delete row, short-close) | Toast with **Undo**, 8s |
| Validation error | Inline on the field; **never a dialog mid-entry** |
| Permission denied | `Alert` naming the required role |
| Long operation (import, export) | Progress with a real row count, never an indeterminate spinner |
| Conflict | Persistent banner until resolved |

---

*See [TEST_PLAN.md](TEST_PLAN.md) for the tests that hold these flows in place.*
