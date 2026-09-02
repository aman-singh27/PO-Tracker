# AGENT.md — PO Tracker Build Orchestrator

**Read this first.** It tells you what this project is, which document answers which question, and the rules that must not be broken.

> **Current-direction override (2026-09-02):** Before using this v1 build guide, read [OWNER_DECISIONS.md](OWNER_DECISIONS.md), [PRODUCT_BLUEPRINT.md](PRODUCT_BLUEPRINT.md), [EXCEL_COMPATIBILITY.md](EXCEL_COMPATIBILITY.md) and [REBUILD_PLAN.md](REBUILD_PLAN.md). Those documents supersede the earlier role matrix, mandatory import-preview rule and any conflicting product assumptions. The allocation, decimal-money, audit and no-line-item-status design rules remain valid.

---

## Project Context

Replacing `PO TRACKER.xlsx` — 8 sheets, 259 purchase orders, 2,134 line items, ~₹12.08 crore — with a multi-user web application for an electrical/MEP contracting business serving HCL, DLF, Metlife and Satya Prakash.

**Stack:** React 18 (Vite + TypeScript) + shadcn/ui · Django 5 + DRF · PostgreSQL 16

**The two questions the product exists to answer:**
> *"Kaun sa kaam reh gaya hai?"* — which work is still pending
> *"Kiska paisa aana baaki hai?"* — whose money is still outstanding

Neither is answerable today, because status lives in spreadsheet cell colours and payment is not tracked at all.

---

## Document Map

| Question | Document |
|---|---|
| What are we building and why? | [PRD.md](PRD.md) |
| What does the data look like? | [SCHEMA.md](SCHEMA.md) — **authoritative** |
| How is it architected? | [TECH_SPEC.md](TECH_SPEC.md) |
| What does it look like? | [DESIGN.md](DESIGN.md) |
| What are the routes and endpoints? | [SITE_STRUCTURE.md](SITE_STRUCTURE.md) |
| How does a user move through it? | [APP_FLOW.md](APP_FLOW.md) |
| What must be tested? | [TEST_PLAN.md](TEST_PLAN.md) |
| What is the build order? | [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) |
| Where are we right now? | [TRACKER.md](TRACKER.md) — **update every session** |

**Conflict resolution:** tests beat documents; `SCHEMA.md` beats other documents on data; `PRD.md` beats everything on scope.

---

## The Ten Rules

Break any of these and the build is wrong, not merely different.

1. **A line item never stores its status.** Status is derived in `v_line_item_status` from quantity ledgers. A test asserts the column does not exist. *(94 lines are partly billed; an enum cannot express "45 of 50".)*
2. **Bills and challans are peers of the PO, not children.** They reach line items through allocation tables. *(A real bill spans two POs; so does a real challan.)*
3. **Every allocation carries a quantity.** *(One PO carries 13 bills.)*
4. **Rate lives on the allocation, not only on the line.** *(24 lines were billed at a divergent rate.)*
5. **GST is per line, defaulting per client, defaulting to 0%.** *(948 lines are 0%, 502 are 18%.)*
6. **Money is `numeric(14,2)` / `Decimal`, and crosses the API as a string.** Never float, never a JSON number.
7. **PO revision is a first-class relationship that carries allocations forward.** *(14 real revision markers, mostly "PO Changed with Tax".)*
8. **Over-billing and over-delivery are flagged, never blocked.** *(16 and 35 real rows. Blocking makes migration impossible.)*
9. **The migration never guesses.** Ambiguity goes to `import_review_item` and is excluded from headline totals until a human resolves it.
10. **Do not build a component shadcn/ui already ships.** Only three are custom: the line item grid, the paste-block importer, and the PDF review screen.

---

## Working Method

### Before starting any task
1. Read the task in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — it names the validation.
2. Check [TRACKER.md](TRACKER.md) for status and blockers.
3. Check [SCHEMA.md](SCHEMA.md) if the task touches data.

### While working
- **Write the test first** where the plan marks it MANDATORY. Those tests are the specification.
- Multi-table writes go through a **service function** in `transaction.atomic()`. Never orchestrate them in a view or serializer.
- Reads go through **selectors** that query the views. Never recompute status in Python.
- Reuse the workbook's vocabulary in names: `challan`, `bill`, `ariba_state`, `qty_ordered`. Staff must recognise their own terms.

### After finishing
1. Run the validation named in the plan.
2. Update [TRACKER.md](TRACKER.md) — `TODO` → `DONE`, and log anything learned.
3. Record any decision that diverges from these docs, with the reason.

---

## Phase Gates — stop, do not proceed

| Gate | Condition | If it fails |
|---|---|---|
| **After Phase 1** | All 14 status-derivation tests pass | **STOP.** The model is wrong. Do not build UI on it. |
| **Before Phase 3** | Backup restore drill completed | **STOP.** Never load real data without a proven restore. |
| **After Phase 3.7** | Dry-run reconciles to ₹12,07,77,682 exactly | **STOP.** Fix the reader before importing. |
| **After Phase 4.3** | App PO entry beats Excel, on a stopwatch | **STOP.** Fix the grid. A slower tool guarantees abandonment. |
| **Feedback gate** | Release 1 used in anger for 2 weeks | Re-plan Phases 5–9 from what was learned, not from these outlines. |

---

## Specialist Focus Areas

Whether these are separate agents or one developer switching hats, the concerns are distinct.

**Schema** — `SCHEMA.md` is authoritative. Owns migrations, views, triggers, constraints. **Must reject any request to add a status column.**

**Backend** — Django models, services, selectors, permissions, DRF. Owns the transaction boundaries: PO revision, bill allocation, payment allocation. 100% coverage on `services/` and `permissions.py`.

**Frontend** — React + shadcn/ui. Owns the app shell, tables, forms and the three custom components. **Checks whether shadcn already ships it before building anything.**

**Migration** — the highest-risk area. Owns the workbook reader, normalisers, review classifier and reconciliation. **Never guesses; classifies.**

**QA** — owns `TEST_PLAN.md`. The status-derivation and permission-matrix suites are non-negotiable.

**Security** — permission matrix enforced at the API, audit log completeness, no money in floats, no secrets committed.

---

## Blocked Work

These need human answers, not engineering decisions. Do not guess; check [TRACKER.md](TRACKER.md) for current status.

| Question | Blocks | Ask |
|---|---|---|
| Two GST registrations (`UP/`, `HR/`)? | Phase 6 | Accounts |
| **Is 0% GST correct on 847 billed lines?** | Phase 3 sign-off | Accounts |
| Is retention held back? | Phase 7 | Accounts |
| Does Ariba reject invoices? | Phase 6 | Office staff |
| Who marks work done, and how do they learn of it? | Phase 5 rollout | Owner |
| Is the rate divergence on 24 lines legitimate? | Phase 6 | Owner |

---

## Common Mistakes

Every one of these is a plausible-looking choice that this data has already disproved.

| Mistake | Why it is wrong |
|---|---|
| Adding `status` to `po_line_item` | Breaks rule 1. A test catches it — but understand *why*. |
| Making `bill` a child of `purchase_order` | Real bills span two POs. |
| Hardcoding 18% GST | Most lines are 0%. |
| Blocking over-billing | 16 real rows. Migration would fail. |
| Validating PO number format | Four clients, four formats. |
| Attaching payments to bills | Advances arrive before any bill exists. |
| Treating TDS as a shortfall | Receivables would never reconcile. |
| Auto-saving PDF extraction | Silent mis-extraction is worse than none. |
| Hand-building a table or dialog | shadcn ships both. |
| Doing money arithmetic in JavaScript | Doubles drift at crore scale. |
| Guessing during migration | Trust is the product. One wrong number ends it. |

---

## Definition of Done

A task is done when:

- [ ] Its validation from `IMPLEMENTATION_PLAN.md` passes
- [ ] Tests are written, including every MANDATORY one
- [ ] Coverage gates hold
- [ ] `TRACKER.md` is updated
- [ ] No rule from the Ten Rules was broken
- [ ] Any divergence is recorded with its reason

---

*Start at [TRACKER.md](TRACKER.md) to see what is next.*
