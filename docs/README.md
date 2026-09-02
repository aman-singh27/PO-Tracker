# PO Tracker — Documentation

Replacing `PO TRACKER.xlsx` with a multi-user web application for an electrical/MEP contracting business.

**Stack:** React 18 (Vite + TypeScript) + shadcn/ui · Django 5 + DRF · PostgreSQL 16
**Status:** Documentation complete · Build not started

---

## Read in this order

| # | Document | What it answers | Status |
|---|---|---|---|
| 0 | [AGENT.md](AGENT.md) | **Start here.** The Ten Rules, document map, phase gates, common mistakes | ✅ Complete |
| 1 | [PRD.md](PRD.md) | What we're building, for whom, why, and what success looks like | ✅ Complete |
| 2 | [SCHEMA.md](SCHEMA.md) | The data model — tables, views, business rules | ✅ Complete |
| 3 | [TECH_SPEC.md](TECH_SPEC.md) | Architecture, stack rationale, Django/React contracts | ✅ Complete |
| 4 | [DESIGN.md](DESIGN.md) | shadcn/ui component contract, theme, visual specs | ✅ Complete |
| 5 | [SITE_STRUCTURE.md](SITE_STRUCTURE.md) | Routes, API endpoints, role-based UI matrix | ✅ Complete |
| 6 | [APP_FLOW.md](APP_FLOW.md) | User journeys through each module | ✅ Complete |
| 7 | [TEST_PLAN.md](TEST_PLAN.md) | Full test case list by phase | ✅ Complete |
| 8 | [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | Phase-by-phase build sequence with validation gates | ✅ Complete |
| 9 | [TRACKER.md](TRACKER.md) | Live progress — **update at the end of every session** | ✅ Complete |

**Conflict resolution:** tests beat documents; `SCHEMA.md` beats other documents on data; `PRD.md` beats everything on scope.

---

## UI

Components come from **shadcn/ui** — do not hand-build anything the library ships. Only three components are custom: the line item entry grid, the paste-block importer, and the PDF review screen.

```bash
npx shadcn@latest init
npx shadcn@latest add https://shadcnthemer.com/r/themes/abb2128e-7392-4ec7-880c-ef68a0051da3.json
```

Two of the three supplied theme URLs are byte-identical; the one above is that theme ("Twitter"). It ships with **three defects that must be overridden** in `app.css` — `muted-foreground` equals `foreground`, `secondary` is near-black, and `background`/`card` are inverted relative to the reference design. Details and exact values in [DESIGN.md §3.3](DESIGN.md).

---

## The five facts that shaped every decision

Measured from `PO TRACKER.xlsx` on 2026-08-31, not assumed. If you change the design, check it against these first.

1. **Partial billing and delivery are real.** 94 lines billed under-quantity, 71 delivered under-quantity, one PO with 13 separate bills. ⇒ **Line status must be derived from quantity ledgers, never stored.**
2. **Bills and challans span multiple POs.** `UP/000009/25-26` covers two POs; challan `194/23.2.25` covers two. ⇒ **Bills are peers of the PO, joined through allocation tables.**
3. **POs get revised routinely**, usually because a tax-less PO is reissued with 18% GST. ⇒ **Revision is a first-class relationship, with carry-forward of existing allocations.**
4. **GST is per line and mostly zero** — 948 lines at 0%, 502 at 18%. ⇒ **Never a global 18% constant.**
5. **The legacy data is dirty in known, countable ways** — 48 duplicate POs, 889 text dates, 33 malformed bill numbers. ⇒ **Migration classifies into a review queue; it never guesses.**

---

## Current scope

**Release 1 = Implementation Phases 0–4:** data model, PO entry, PO-first search, legacy migration of all 259 POs, and fast entry (paste-block + PDF extraction).

Then a **feedback gate** — Release 1 runs in real use before Phases 5–9 (challans, bills, payments, dashboards, quotations) are scoped.

---

## The two gates that matter most

**Phase 1 — status derivation tests.** If any branch fails, the model is wrong. Do not build UI on top of it.

**Phase 4.3 — the stopwatch gate.** Enter PO `8100013678` into the app and into Excel. **The app must be faster.** If it isn't, Phase 4 is not done. This is the difference between a system that gets used and one that gets quietly abandoned.

---

## Open questions blocking later phases

| Question | Blocks | Owner |
|---|---|---|
| Two GST registrations (`UP/` and `HR/` prefixes)? | Phase 6 | Accounts |
| **Is 0% GST correct on 847 billed lines?** | Phase 3 sign-off | Accounts |
| Is retention / security deposit held? | Phase 7 | Accounts |
| Does Ariba reject invoices? | Phase 6 | Office staff |
| Who marks work as done, and how do they find out? | Phase 5 rollout | Owner |
| Is the billing-rate divergence on 24 lines legitimate? | Phase 6 | Owner |

Full detail in [PRD.md §10](PRD.md).
# Current Direction

The original v1 documents were written before the owner clarified the required workflow. Start with these current documents:

1. [OWNER_DECISIONS.md](OWNER_DECISIONS.md) — binding owner decisions.
2. [PRODUCT_BLUEPRINT.md](PRODUCT_BLUEPRINT.md) — product and UX behaviour.
3. [EXCEL_COMPATIBILITY.md](EXCEL_COMPATIBILITY.md) — familiar Excel-format entry and migration contract.
4. [REBUILD_PLAN.md](REBUILD_PLAN.md) — current repository gap analysis and delivery order.

The v1 documents remain useful technical background, but where they conflict with `OWNER_DECISIONS.md`, the owner decisions win.
