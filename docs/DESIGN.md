# PO Tracker — Design Specification

**Version:** 2.0
**Component library:** shadcn/ui (Radix primitives + Tailwind)
**Theme:** "Twitter" from shadcnthemer.com, with three documented overrides
**Visual reference:** VANTUS ERP dashboard screenshots (`docs/reference/`)

> **v2.0 supersedes v1.0.** v1.0 specified a hand-rolled design system. This version adopts shadcn/ui components and a published theme instead. **Do not build a component that shadcn already ships.**

---

## 1. Design Direction

Two inputs decide everything below.

**Input 1 — the VANTUS ERP reference.** Clean white cards on a light grey page, generous corner radius, a collapsible sidebar with expandable module sections, breadcrumb + title page headers, stat cards with trend pills, status pills, and tabbed data tables. It is structurally the same product as PO Tracker — an ERP with Inventory, Purchasing, Sales and POS — so the patterns transfer directly rather than by analogy.

**Input 2 — this is an internal financial tool used all day by people who are fast at Excel.**

**Principles, in priority order:**

1. **Use the library.** shadcn/ui ships Table, Tabs, Badge, Dialog, Select, Command, Sheet, Sidebar, Progress, Switch, Breadcrumb and more. Building any of these by hand is a defect, not craftsmanship.
2. **Density over whitespace where the data is dense.** The reference uses roomy rows for a 19-row admin list. A 79-line PO needs tighter. Our line tables run at 36px; everything else follows the reference.
3. **Colour carries one meaning only: status.** The workbook failed because colour was the *only* status carrier. Here colour is **redundant** — every badge has a text label. Colour never encodes anything else.
4. **Keyboard first.** If a common action needs the mouse, that is a design defect.
5. **The owner's view is a different product.** He is on a phone, wants two numbers, and never types.

**What this is not:** a dashboard-aesthetic product. No gradients, no glass, no decorative charts. Every pixel earns its place by making a number easier to read or an action faster.

---

## 2. Component Library — shadcn/ui

### 2.1 Install

```bash
npx shadcn@latest init

# Theme (see §3 — themes 1 and 3 from the brief are byte-identical; this is that theme)
npx shadcn@latest add https://shadcnthemer.com/r/themes/abb2128e-7392-4ec7-880c-ef68a0051da3.json

# Components
npx shadcn@latest add sidebar breadcrumb button card table tabs badge input \
  select dropdown-menu dialog sheet command popover tooltip switch checkbox \
  progress separator avatar skeleton sonner form label textarea alert \
  scroll-area collapsible pagination
```

### 2.2 The rule

| Need | Use | Never |
|---|---|---|
| Navigation rail | `Sidebar` + `SidebarMenu` + `Collapsible` | A custom nav |
| Page path | `Breadcrumb` | Hand-built spans |
| Any table | `Table` + TanStack Table | A `div` grid |
| Tab row | `Tabs` | Custom buttons |
| Status pill | `Badge` | A styled `span` |
| Modal | `Dialog` / `Sheet` | Custom overlay |
| Dropdown | `DropdownMenu` / `Select` | Custom popover |
| Global search | `Command` (⌘K palette) | Custom autocomplete |
| Row kebab | `DropdownMenu` | Custom menu |
| Toast | `sonner` | Custom toast |
| Loading | `Skeleton` | Spinners |
| Toggle | `Switch` | Custom checkbox styling |
| Allocation bars | `Progress`, or the segmented bar in §9 | A chart library |

**Only one component in this product is custom: the line item grid (§10).** It is custom because no library does spreadsheet-grade keyboard entry, and that capability is the difference between adoption and abandonment (PRD risk R1). Everything else comes from the library.

---

## 3. Theme

### 3.1 Which theme

Three theme URLs were supplied. **The first and third are byte-identical** — I diffed every light and dark token and found zero differences (`abb2128e…` is "Twitter", `1ce61ea7…` is "Fork of Twitter" with no edits). So there are two real choices:

| Theme | Primary | Verdict |
|---|---|---|
| **Twitter** (`abb2128e` ≡ `1ce61ea7`) | `oklch(0.6723 0.1606 244.9955)` sky blue | **Selected.** Its primary is the exact blue of the reference's "Add Member" button and active sidebar pill; `chart-2` is the green of the `Enabled` pills. |
| Midnight Bloom (`1652f2ec`) | `oklch(0.5676 0.2021 283.08)` violet | Rejected — wrong hue family for the reference. |

### 3.2 Base tokens (light) — as shipped

```css
:root {
  --radius:               0.625rem;
  --background:           oklch(1.0000 0 0);
  --foreground:           oklch(0.1884 0.0128 248.5103);
  --card:                 oklch(0.9784 0.0011 197.1387);
  --card-foreground:      oklch(0.1884 0.0128 248.5103);
  --popover:              oklch(1.0000 0 0);
  --primary:              oklch(0.6723 0.1606 244.9955);   /* the VANTUS blue */
  --primary-foreground:   oklch(1.0000 0 0);
  --secondary:            oklch(0.1884 0.0128 248.5103);
  --muted:                oklch(0.9222 0.0013 286.3737);
  --muted-foreground:     oklch(0.1884 0.0128 248.5103);
  --accent:               oklch(0.9392 0.0166 250.8453);
  --accent-foreground:    oklch(0.6723 0.1606 244.9955);
  --destructive:          oklch(0.6188 0.2376 25.7658);
  --border:               oklch(0.9317 0.0118 231.6594);
  --input:                oklch(0.9809 0.0025 228.7836);
  --ring:                 oklch(0.6818 0.1584 243.3540);
  --chart-1:              oklch(0.6723 0.1606 244.9955);   /* blue   */
  --chart-2:              oklch(0.6907 0.1554 160.3454);   /* green  */
  --chart-3:              oklch(0.8214 0.1600 82.5337);    /* amber  */
  --chart-4:              oklch(0.7064 0.1822 151.7125);   /* green2 */
  --chart-5:              oklch(0.5919 0.2186 10.5826);    /* red    */
  --sidebar:              oklch(0.9784 0.0011 197.1387);
  --sidebar-primary:      oklch(0.6723 0.1606 244.9955);
  --sidebar-accent:       oklch(0.9392 0.0166 250.8453);
  --sidebar-border:       oklch(0.9271 0.0101 238.5177);
}
```

Dark mode ships with the theme and is used as-is. Chart tokens are identical across modes.

### 3.3 Required overrides — three defects

Put these in `app.css` **after** the theme import, each with its comment intact.

```css
:root {
  /* OVERRIDE 1 — the theme ships muted-foreground identical to foreground
     (both oklch(0.1884 0.0128 248.5103)), so every piece of secondary text
     renders full black: emails under names, "vs last month", breadcrumb
     ancestors, column headers. The reference clearly greys these. */
  --muted-foreground: oklch(0.5540 0.0180 248.5103);

  /* OVERRIDE 2 — the theme ships `secondary` as near-black, so
     <Button variant="secondary"> renders dark. The reference's "See All",
     "Manage" and "Sort by" buttons are light neutral on white. */
  --secondary:            oklch(0.9650 0.0030 240.0000);
  --secondary-foreground: oklch(0.1884 0.0128 248.5103);

  /* OVERRIDE 3 — the theme has background pure white and card light grey,
     which is inverted from the reference (grey page, white cards floating
     on it). Swap them so cards read as raised surfaces. */
  --background: oklch(0.9784 0.0011 197.1387);
  --card:       oklch(1.0000 0 0);
}
```

**Do not "fix" these silently in component code.** They are theme-level and documented here so the next person understands why the app diverges from the vendored theme file.

### 3.4 Semantic status tokens

The theme has no status scale. These are additions, built from its chart hues so they stay in family.

```css
:root {
  --status-neutral-bg:  oklch(0.9550 0.0030 240);   --status-neutral-fg:  oklch(0.4400 0.0150 248);
  --status-info-bg:     oklch(0.9560 0.0300 245);   --status-info-fg:     oklch(0.5100 0.1300 245);
  --status-progress-bg: oklch(0.9500 0.0400 285);   --status-progress-fg: oklch(0.4900 0.1500 285);
  --status-success-bg:  oklch(0.9450 0.0550 160);   --status-success-fg:  oklch(0.4800 0.1300 160);
  --status-warning-bg:  oklch(0.9600 0.0600 85);    --status-warning-fg:  oklch(0.5200 0.1200 70);
  --status-danger-bg:   oklch(0.9500 0.0400 25);    --status-danger-fg:   oklch(0.5100 0.1900 26);
  --status-review-bg:   oklch(0.9600 0.0550 60);    --status-review-fg:   oklch(0.5300 0.1500 45);

  --money-received:    oklch(0.4800 0.1300 160);
  --money-outstanding: oklch(0.5200 0.1200 70);
  --money-neutral:     var(--foreground);
}
```

**Green means billed-and-done, exactly as it did in the spreadsheet.** Staff already read green that way, which lowers the cost of switching. But every green cell also carries the word `BILLED`.

---

## 4. Typography & Numbers

The theme's `--font-sans` is the system stack. Keep it — it renders Devanagari correctly and costs nothing to load.

| Tailwind class | Use |
|---|---|
| `text-xl font-semibold` | Page title |
| `text-base font-semibold` | Card header |
| `text-sm` | Body default |
| `text-[13px]` | Table cells — deliberately tighter |
| `text-xs font-medium uppercase tracking-wide` | Column headers, form labels |
| `text-xs text-muted-foreground` | Helper text, timestamps, sub-labels |

### The one non-negotiable rule

```css
.num { font-variant-numeric: tabular-nums; text-align: right; }
```

**Every money and quantity cell gets `.num`.** Without tabular figures a column of rupee values jitters and becomes unscannable — the single highest-value typographic decision in this document.

**Money format:** Indian grouping throughout — `₹12,07,77,682.00`, never `₹120,777,682.00`. Deductions in parentheses: `(₹4,484.00)`. Formatting happens in `lib/money.ts` from the API's **string** values (TECH_SPEC §3.9); the UI never does arithmetic on money.

---

## 5. App Shell

Built with shadcn `Sidebar`. Follows the reference layout directly.

```
┌────────────┬──────────────────────────────────────────────────┐
│ ⬥ PO TRACK │  Purchase Orders                        [⌕] [🔔] │
│   ERP      ├──────────────────────────────────────────────────┤
│      «     │  Purchasing › Purchase Orders › 8100013678        │
│ ────────── │                                                  │
│ MAIN       │   ┌────────────────────────────────────────────┐ │
│  Dashboard │   │  Card                                      │ │
│  POs     › │   └────────────────────────────────────────────┘ │
│  Challans  │                                                  │
│  Bills   › │                                                  │
│  Payments  │                                                  │
│  Reports › │                                                  │
│ ────────── │                                                  │
│ OTHERS     │                                                  │
│  Review ⁴⁸ │                                                  │
│  Settings  │                                                  │
│ ────────── │                                                  │
│ 👤 Emma J. │                                                  │
└────────────┴──────────────────────────────────────────────────┘
```

**Spec, from the reference:**
- Sidebar 228px, `bg-sidebar`, collapsible to a 64px icon rail via `SidebarTrigger`. State persists per user.
- Section labels (`MAIN`, `OTHERS`) use `SidebarGroupLabel` — `text-xs uppercase text-muted-foreground`.
- Expandable modules use `Collapsible` inside `SidebarMenuItem`, with the child tree indented and connected by a 1px guide line — exactly as VANTUS renders `Inventory → Products / Stock Movements / Warehouses`.
- **Active item:** `bg-sidebar-primary text-sidebar-primary-foreground`, full-width rounded pill. Active *child*: `text-sidebar-primary` with no fill.
- `Review` shows a `Badge` count when the import queue is non-empty and **disappears entirely when clear**.
- Footer: `Avatar` + name + email + chevron, opening a `DropdownMenu`.
- Nav is filtered by role. Owner sees Dashboard, POs, Reports. Staff see everything but Settings.

**Topbar:** two icon buttons (`Button variant="outline" size="icon"`, `rounded-lg`) for search and notifications, matching the reference. Search opens the shadcn `Command` palette, bound to `⌘K` and `/`.

**Mobile (< 768px):** `Sheet` drawer for nav, plus a bottom tab bar — Search, POs, Reports, More. This is the owner's layout.

---

## 6. Page Header

```tsx
<div className="flex items-start justify-between">
  <div>
    <h1 className="text-xl font-semibold">Purchase Orders</h1>
    <Breadcrumb>Purchasing › Purchase Orders › 8100013678</Breadcrumb>
  </div>
  <div className="flex gap-2">
    <Button variant="outline" size="icon"><Search /></Button>
    <Button variant="outline" size="icon"><Bell /></Button>
  </div>
</div>
```

Every page has one. Breadcrumb ancestors are `text-muted-foreground`; the current page is `text-foreground`.

---

## 7. Status Badges

shadcn `Badge` with a `status` variant added via `cva`. **Text label always present; colour is redundant reinforcement.**

| Status (from `v_line_item_status`) | Label | Token pair |
|---|---|---|
| `ORDERED` | ORDERED | `neutral` |
| `PART_DELIVERED` | PART DELIVERED | `warning` |
| `DELIVERED` | DELIVERED | `info` |
| `WORK_DONE` | WORK DONE | `progress` |
| `APPROVED` | APPROVED | `progress` |
| `PART_BILLED` | PART BILLED | `warning` |
| `BILLED` | BILLED | `success` |
| `CLOSED_SHORT` | CLOSED SHORT | `neutral` |

**Modifier chips**, rendered alongside when true:
`OVER-BILLED` (danger) · `OVER-DELIVERED` (warning) · `NEEDS REVIEW` (review) · `ARIBA PENDING` (warning) · `SUPERSEDED` (neutral)

**Partial states always show quantity inline:** `PART BILLED · 20/50`. The number is the point; the badge is the frame.

Spec: 22px tall, `px-2`, `rounded-md`, `text-xs font-medium uppercase` — matching the reference's `Enabled` / `Disabled` pills.

---

## 8. Stat Cards & The Money Strip

The reference's stat card — big figure, "vs last month" sub-label, green trend pill — is reused verbatim for PO and client metrics.

```
┌─────────────────────────┐
│ Total Ordered        ⋮  │
│ ₹1,05,964               │
│ vs last month 89,000    │   [↑ 19.1%]
└─────────────────────────┘
```

`Card` + `CardHeader` (title + `DropdownMenu` kebab) + big `.num` figure + `text-xs text-muted-foreground` comparison + `Badge` trend pill in `--status-success-fg`.

**The Money Strip** — the owner's screen, and the direct answer to *"kitne ka bill ho gaya, kitna kiska reh gaya."*

```
┌──────────────────────────────────────────────────────────────────────┐
│  ORDERED      DELIVERED     BILLED        UPLOADED     PAID          │
│  ₹1,05,964    ₹1,05,964     ₹1,05,964     ₹1,05,964    ₹89,800       │
│  7 lines      7 lines       7 lines       2 bills      2 payments    │
│  ────────────────────────────────────────────────────────────────    │
│  OUTSTANDING  ₹16,164            TDS ₹4,484  ·  Retention ₹0         │
└──────────────────────────────────────────────────────────────────────┘
```

- Five equal columns separated by `Separator orientation="vertical"`, exactly like the reference's Product Details metadata row.
- **Outstanding is the largest number on the page** — `text-xl`, `--money-outstanding`.
- TDS and retention sit beside outstanding as secondary text, **never folded into it**. If a user cannot see why cash received ≠ billed, they stop trusting the number.
- Each column is clickable and filters the line table below to that stage.
- Mobile: 2-column grid, outstanding spanning both.

---

## 9. Allocation Bars

The reference's **Stock Overview** segmented bars (Available Stock / Reserved Stock — dashed cyan segments against a grey remainder, value on the left, maximum on the right) map onto our quantity ledger almost perfectly. This is the best pattern reuse in the whole reference.

```
Delivered                              45 of 50 Nos
▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▯▯▯
45.00                                            50.00

Billed                                 20 of 50 Nos
▮▮▮▮▮▮▮▮▮▮▮▮▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯
20.00                                            50.00
```

- Rendered as ~30 fixed segments; filled segments use `--chart-1` (delivered) and `--chart-2` (billed).
- **Over-allocation** (`qty > ordered`) renders the overflow in `--status-danger-fg` and pushes the `OVER-BILLED` chip — 16 real rows need this.
- Appears on the PO detail line-expansion row and on the line item drawer.
- Built from `Progress` primitives or plain divs. **Do not pull in a charting library for this.**

---

## 10. The Line Item Grid — the one custom component

**The single most important component in the product.** PRD risk R1 says the project dies if this is slower than Excel. No shadcn component does spreadsheet-grade entry, so this one is built — on top of TanStack Table with shadcn `Input` and `Select` as the cell editors.

```
  #  DESCRIPTION                          TYPE      QTY  UNIT     RATE      AMOUNT  GST
  1  SUPPLY OF PHILIPS LED DOWNLIGHTER    Material   50  Nos     760.00  38,000.00  0%
  2  SUPPLY OF DN296B LED20S RING         Material   50  Nos     208.00  10,400.00  0%
  3  Installation of LED DOWNLIGHTER      Service    50  Nos      80.00   4,000.00  18%
  +  Add line  (or press Enter on the last cell)
```

| Key | Behaviour |
|---|---|
| `Tab` / `Shift+Tab` | Move cell to cell, wrapping across rows |
| `Enter` on last cell | Commit the row and create a new one |
| `Ctrl+D` | Copy the cell directly above |
| `Ctrl+V` | A multi-row clipboard payload fills many rows at once |
| `Ctrl+Backspace` | Delete the current row, with an undo `sonner` toast |
| `Esc` | Revert the current cell |

**Behaviour rules:**
- **Amount is computed, never typed.** Rendered in `text-muted-foreground` to signal it is derived.
- GST defaults from `client.default_gst_rate` — usually 0%.
- Item type is guessed from the description: `Supply of…` → Material; `Installation of…` / `Providing and fixing…` / `Dismantling…` → Service. Guessed values carry a dotted underline so the user knows to check them.
- Validation is inline and non-blocking — a `--destructive` underline, never a `Dialog` that steals focus mid-typing.

**A modal during data entry is a design failure.** Everything is inline.

---

## 11. Metadata Grid

The reference's Product Details header — icon + label + value, in a row separated by vertical rules — is reused for the PO header.

```
🗎 PO Number   │ 🏢 Client      │ 📍 Site   │ 📅 PO Date   │ 🧾 Category │ % GST Default
8100013678     │ HCL Tech       │ AN22      │ 07/12/2024   │ Service     │ 0%
```

`Separator orientation="vertical"` between cells; label `text-xs text-muted-foreground` with a 14px lucide icon; value `text-sm font-medium`. Wraps to a 2-column grid on mobile.

The reference's **toggle cluster** (Active / Sell / Track Quantity / POS) maps to PO-level flags where relevant, using shadcn `Switch` — green when on, exactly as shown.

---

## 12. Table Card

`Card` wrapping `Tabs` + a toolbar + `Table`, following the reference's Administrator Accounts panel.

```
┌────────────────────────────────────────────────────────────┐
│  ⬥ Purchase Orders          [ ⌕ Search ] [Sort by ▾] [⚙]  │
├────────────────────────────────────────────────────────────┤
│  All (259) │ Pending (94) │ Billed │ Review (48)           │
├────────────────────────────────────────────────────────────┤
│  PO NUMBER   CLIENT      SITE    STATUS       AMOUNT    ⋮  │
│  8100013678  HCL Tech    AN22    [BILLED]  ₹1,05,964    ⋮  │
├────────────────────────────────────────────────────────────┤
│  1–50 of 259                       ‹ 1 2 3 … 6 ›           │
└────────────────────────────────────────────────────────────┘
```

- Active tab carries a 2px `--primary` underline, as in the reference.
- Row height **36px** in line tables, 52px in entity lists (POs, bills, clients) to match the reference's breathing room.
- Zebra striping with `--muted` at low opacity; hover `--accent`.
- **`needs_review` rows carry a 3px left border in `--status-review-fg`** — distinct without being alarming.
- Superseded POs render at 60% opacity with a `SUPERSEDED` badge.
- Text left, **all numerics right with `.num`**.
- Row kebab is a `DropdownMenu`.

---

## 13. Buttons

Straight shadcn variants — no new ones.

| Variant | Use |
|---|---|
| `default` | The one primary action per page ("Add PO", matching the reference's "Add Member") |
| `outline` | Icon buttons, "See All", secondary actions |
| `secondary` | Full-width panel actions ("Manage" in the reference) — **needs Override 2** |
| `ghost` | Table row actions |
| `destructive` | Delete, cancel PO, short-close |

Disabled buttons wrap in a `Tooltip` explaining **why** — usually a permission. Never a silently dead button.

---

## 14. Forms

shadcn `Form` (React Hook Form + Zod) throughout.

- `Label` above `Input`, `text-xs font-medium`.
- `Input` at default height, `--input` background, focus ring `--ring`.
- `FormMessage` for errors in `--destructive`.
- **Required fields marked, optional unmarked** — most fields here are required, so marking the minority is quieter.
- Date inputs accept typed `dd/mm/yyyy` and normalise to ISO on blur. Staff have typed dates that way for years; forcing a `Calendar` picker would slow them down. The picker is available but never mandatory.

---

## 15. Owner's Mobile View

A genuinely separate layout, not a squeezed desktop.

```
┌──────────────────────┐
│  Outstanding         │
│  ₹78,02,463          │   ← largest element on screen
│  across 4 clients    │
├──────────────────────┤
│  HCL      ₹62,10,000 │
│  DLF       ₹9,40,000 │
│  Metlife   ₹6,52,463 │
├──────────────────────┤
│  Pending work        │
│  94 lines · ₹78.0L   │
├──────────────────────┤
│  Ariba backlog       │
│  ₹10,53,456 · 12 ⚠   │
├──────────────────────┤
│  [ Search a PO ]     │
└──────────────────────┘
```

- Two taps maximum to any answer. No data entry anywhere in this view.
- Search opens the `Command` palette, then the PO detail page stacked vertically.
- Target: **the owner answers "what's pending and what's owed" in under 30 seconds** — the PRD success metric, and the reason this layout exists.

---

## 16. Empty, Loading & Error States

| State | Component | Treatment |
|---|---|---|
| Empty table | `Card` | Icon + one line of plain text + the primary action. Never a bare "No data". |
| Loading | `Skeleton` | Rows matching final height — no layout shift, **no spinners in tables**. |
| Error | `Alert variant="destructive"` | The actual reason plus a Retry button. Never "Something went wrong". |
| Permission denied | `Alert` | Name the role required, not just "Forbidden". |
| Save conflict (409) | `Alert`, non-dismissable | "Someone else changed this PO. Reload to see their version." Never silently overwrite. |
| Action feedback | `sonner` toast | Undo affordance where the action is reversible. |

---

## 17. Accessibility

- Radix primitives give correct roles, focus traps and keyboard behaviour for free — a second reason not to hand-roll.
- All text meets WCAG AA (4.5:1). **Override 1 exists partly for this reason**: the shipped `muted-foreground` was pure black, which passes contrast but destroys hierarchy; the replacement is checked at 4.6:1 on `--card`.
- **Status is never conveyed by colour alone** — both an a11y requirement and the core product fix.
- Tables use `<th scope>`; sort state announced via `aria-sort`.
- Toasts `aria-live="polite"`; errors `aria-live="assertive"`.

---

## 18. Anti-patterns — explicitly forbidden

1. **Building a component shadcn already ships.** The first thing to check, every time.
2. **Colour as the only status signal.** The exact failure being replaced.
3. **Modals during data entry.** They break flow and lose keystrokes.
4. **Spinners inside tables.** Use `Skeleton`.
5. **Money in a proportional font.** Always `.num` / `tabular-nums`.
6. **Western digit grouping.** Indian grouping only.
7. **Arithmetic on money in JavaScript.** The API sends strings; `decimal.js` or nothing.
8. **Hiding a disabled reason.** Always `Tooltip` the why.
9. **Charts where a number will do.** The owner wants figures, not visualisations.
10. **Editing the vendored theme file.** Overrides go in `app.css` with a comment (§3.3).

---

## 19. Component Inventory

Build order for Phase 2. Anything not listed as CUSTOM comes from shadcn untouched.

| Screen element | Source |
|---|---|
| App shell, sidebar, collapsible modules | `sidebar`, `collapsible` |
| Breadcrumb page header | `breadcrumb` |
| Global search palette | `command` |
| PO list, line tables | `table` + TanStack Table |
| Tab filters | `tabs` |
| Status badges | `badge` + `cva` status variant |
| Stat cards, money strip | `card` + `separator` |
| Allocation bars | `progress` (thin wrapper) |
| PO metadata grid | `card` + `separator` |
| Filters, sort | `select`, `dropdown-menu` |
| Row actions | `dropdown-menu` |
| Create/edit PO | `dialog` or full page + `form` |
| Line item detail | `sheet` |
| Confirmations | `alert-dialog` |
| Toasts | `sonner` |
| Loading | `skeleton` |
| Toggles | `switch` |
| **Line item entry grid** | **CUSTOM** — §10 |
| **Paste-block importer** | **CUSTOM** — Phase 4 |
| **PDF review side-by-side** | **CUSTOM** — Phase 4 |

---

*See [SITE_STRUCTURE.md](SITE_STRUCTURE.md) for page-by-page routes and [TECH_SPEC.md §4](TECH_SPEC.md) for the frontend implementation contract.*
