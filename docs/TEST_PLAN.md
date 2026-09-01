# PO Tracker — Test Plan

**Version:** 1.0
**Backend:** pytest-django + Hypothesis · **Frontend:** Vitest + Testing Library · **E2E:** Playwright
**Coverage targets:** 85% on `tracker/`, **100% on `services/` and `permissions.py`**

---

## Test Philosophy

Three rules, in priority order.

1. **The status-derivation suite is the specification.** Every branch of `v_line_item_status` has a test, and those tests are the authoritative statement of how this business works. If a test and a document disagree, the test wins.
2. **Test the API, not the UI, for permissions.** A hidden button is not a permission. Every permission test issues a real authenticated request and asserts the status code.
3. **Test against the real data shape.** Every awkward case here came from `PO TRACKER.xlsx`, not from imagination: 13 bills on one PO, a bill spanning two POs, 16 over-billed lines, 33 malformed bill numbers.

---

## Test Infrastructure

### Users fixture

```python
# tracker/tests/conftest.py
@pytest.fixture
def users(db):
    return {
        'owner':    make_user('owner@test.local',    role='owner'),
        'staff':    make_user('staff@test.local',    role='staff'),
        'accounts': make_user('accounts@test.local', role='accounts'),
        'admin':    make_user('admin@test.local',    role='admin'),
        'norole':   make_user('norole@test.local',   role=None),
    }
```

### Domain fixture — the awkward cases, all real

```python
@pytest.fixture
def workbook_shapes(db):
    """Every shape that exists in PO TRACKER.xlsx and breaks naive models."""
    return {
        'simple':         po_with_lines(7),                  # 8100013678
        'huge':           po_with_lines(79),                 # HCL CO./2025-26/03
        'many_bills':     po_billed_across(13),              # 8600048367
        'cross_po_bill':  bill_spanning_pos(2),              # UP/000117/25-26
        'cross_po_chal':  challan_spanning_pos(2),           # 194/23.2.25
        'over_billed':    line(ordered=50, billed=55),       # 16 real rows
        'over_delivered': line(ordered=50, delivered=60),    # 35 real rows
        'part_billed':    line(ordered=50, billed=20),       # 94 real rows
        'short_closed':   line(ordered=50, billed=45, closed=True),
        'zero_gst':       line(gst_rate=Decimal('0.0000')),  # 948 real rows
        'rate_diverged':  line(rate=760, billed_at=740),     # 24 real rows
        'revised':        po_revised_with_tax(),             # 14 real markers
        'material':       line(item_type='material'),        # skips challan
    }
```

### Workbook fixture
A copy of `PO TRACKER.xlsx` in `tracker/tests/fixtures/`. Migration tests run against the real file — nothing else proves the reader works.

---

## Phase 1 — Data Model (MANDATORY)

### `test_schema_invariants.py`

| Test | Asserts |
|---|---|
| `test_line_item_has_no_status_column` | **`po_line_item` has no `status` column.** The load-bearing test of the entire system. |
| `test_po_number_unique_per_client` | Same number, two clients → OK. Same number, same client → `IntegrityError`. |
| `test_po_number_reusable_after_soft_delete` | Partial index excludes `is_deleted` rows. |
| `test_gst_rate_range_constraint` | `gst_rate = 18` rejected; `0.18` accepted. Catches the legacy defect. |
| `test_bill_totals_maintained_by_trigger` | Insert an allocation → header totals update with no app code. |
| `test_all_views_exist` | The four `v_*` views are present after migrate. |
| `test_migrations_reverse` | Every migration reverses cleanly. |

### `test_status_derivation.py` — **the specification**

| Test | Setup | Expected |
|---|---|---|
| `test_nothing_done` | line, no allocations | `ORDERED` |
| `test_part_delivered` | challan 30 of 50 | `PART_DELIVERED` |
| `test_fully_delivered` | challan 50 of 50 | `DELIVERED` |
| `test_work_done` | + `work_done_on` | `WORK_DONE` |
| `test_client_approved` | + `client_approved_on` | `APPROVED` |
| `test_part_billed` | bill 20 of 50 | `PART_BILLED` |
| `test_fully_billed` | bill 50 of 50 | `BILLED` |
| `test_over_billed` | bill 55 of 50 | `BILLED` + `is_over_billed` |
| `test_over_delivered` | challan 60 of 50 | `is_over_delivered` |
| `test_short_closed_wins` | closed, 45 of 50 billed | `CLOSED_SHORT` — beats every other rule |
| `test_material_skips_challan` | material, billed, no challan | `BILLED`, no error |
| `test_billed_across_many_bills` | 3 bills of 20, 15, 15 against 50 | `BILLED` |
| `test_interim_ignored_when_allocation_exists` | `interim_status='BILLED'` + real challan | derived wins |
| `test_interim_used_when_no_allocation` | `interim_status='BILLED'`, nothing else | `BILLED` |

**All fourteen must pass before any UI work begins.**

### `test_money.py`

| Test | Asserts |
|---|---|
| `test_allocation_sum_property` | **Hypothesis:** for any allocation set, `sum(total_amount) == bill.total_amount` exactly |
| `test_no_float_in_money_fields` | Every money field is `DecimalField(max_digits=14, decimal_places=2)` |
| `test_gst_rounding_half_up` | `47,999.99 × 0.18` rounds consistently |
| `test_crore_scale_precision` | ₹12,07,77,682.00 survives a save/load round trip with no drift |

### `test_permissions.py` — the full matrix

Parametrised across every role × every endpoint from [PRD §5.2](PRD.md).

```python
@pytest.mark.parametrize('role,endpoint,method,expected', PERMISSION_MATRIX)
def test_permission_matrix(client, users, role, endpoint, method, expected):
    login(client, users[role])
    assert getattr(client, method)(endpoint).status_code == expected
```

Explicit cases that must not regress:

| Test | Asserts |
|---|---|
| `test_staff_cannot_short_close` | Staff → 403. It is a commercial decision. |
| `test_owner_can_short_close` | Owner → 200 |
| `test_owner_cannot_create_po` | Owner is read-only on entry |
| `test_staff_cannot_record_bill` | Bills are Accounts/Admin |
| `test_accounts_cannot_edit_po` | 403 |
| `test_only_admin_resolves_review` | Staff, owner, accounts → 403 |
| `test_no_role_user_gets_403_everywhere` | A Django user with no `AppUserRole` reaches nothing |
| `test_unauthenticated_401_on_every_endpoint` | Sweeps the whole URL conf |

### `test_audit.py`

| Test | Asserts |
|---|---|
| `test_rate_change_logged` | `before_json` and `after_json` both present and correct |
| `test_actor_recorded` | The acting user is attributed |
| `test_soft_delete_only` | `DELETE` sets `is_deleted`; the row survives |
| `test_audit_immutable` | No API path updates or deletes an audit row |

---

## Phase 2 — PO Entry & Search

### `test_po_service.py`

| Test | Asserts |
|---|---|
| **`test_revision_preserves_delivered_quantities`** | **MANDATORY.** Revise a PO with 30 of 50 delivered → successor shows 30 delivered, original shows 0, no double-count anywhere |
| `test_revision_preserves_billed_quantities` | Same for bill allocations |
| `test_revision_supersedes_predecessor` | `status='superseded'`, `superseded_by` set |
| `test_revision_requires_reason` | Empty reason → `ValidationError` |
| `test_revision_is_atomic` | Failure mid-revision leaves the original untouched |
| `test_cancel_and_replace_links_new_po` | Mirrors the real `…new po. No-9200160448` case |
| `test_superseded_excluded_from_pending` | Never appears in pending views |
| `test_short_close_removes_from_pending` | Line leaves every pending query |
| `test_short_close_requires_reason` | Rejected without one |

### `test_po_api.py`

| Test | Asserts |
|---|---|
| `test_create_po_with_79_lines` | The largest real PO saves in one transaction |
| `test_create_po_is_atomic` | An invalid line rolls the whole PO back |
| `test_stale_update_returns_409` | Optimistic lock fires; no silent overwrite |
| `test_money_serialised_as_strings` | JSON money values are strings, not numbers |
| `test_dates_iso_only` | `dd/mm/yyyy` in the payload is rejected |

### `test_search.py`

| Test | Asserts |
|---|---|
| `test_search_by_po_number` | `9200146935` → exactly one result (it was on 3 sheets) |
| `test_search_by_bill_number` | `UP/000038/24-25` finds the PO |
| `test_search_by_challan_number` | `151/30.11.24` finds the PO |
| `test_search_by_site_code` | `AN22` |
| `test_search_by_description` | `Philips` |
| `test_search_never_validates_format` | Junk input returns empty, never a 400 |
| `test_search_performance` | Sub-second on 2,134 seeded lines |

### `test_po_totals.py`

| Test | Asserts |
|---|---|
| **`test_po_detail_reconciles_to_workbook`** | **MANDATORY.** PO `8100013678` money strip equals the workbook Grand Total **to the rupee** |
| `test_money_strip_stages_sum_correctly` | ordered ≥ delivered, billed ≥ paid, outstanding = billed − settled |

---

## Phase 3 — Migration (highest risk)

### `test_workbook_reader.py`

| Test | Asserts |
|---|---|
| **`test_reads_259_pos_2134_lines`** | **MANDATORY.** Exact counts from the real file |
| `test_skips_total_rows` | `Total`, `GST @ 18%`, `Grand Total` never become line items |
| `test_handles_blank_continuation_rows` | Lines attach to the PO above |
| `test_reads_all_eight_sheets` | Including the single-PO sheet `8100014714` |

### `test_normalisers.py`

| Test | Input | Expected |
|---|---|---|
| `test_date_slash` | `29/07/2024` | `date(2024,7,29)` |
| `test_date_dot` | `16.01.2026` | `date(2026,1,16)` |
| `test_date_native` | datetime | unchanged |
| `test_date_impossible` | `26/09/204` | `None` + `IMPOSSIBLE_DATE` |
| `test_site_split` | `( AN22 ) HCL TECHNOLOGIES LIMITED` | `('AN22', 'HCL TECHNOLOGIES LIMITED')` |
| `test_gst_decimal` | `0.18` | `0.1800` |
| `test_gst_whole` | `18` | `0.1800` + `GST_RATE_OUT_OF_RANGE` |
| `test_bill_number_valid` | `UP/000038/24-25` | valid |
| `test_bill_number_bad_fy` | `UP/000037/24-37` | invalid + `MALFORMED_BILL_NUMBER` |
| `test_challan_number_parse` | `151/30.11.24` | `('151', date(2024,11,30))` |
| `test_item_type_supply` | `SUPPLY OF PHILIPS LED` | `material` |
| `test_item_type_install` | `Installation of LED` | `service` |
| `test_revision_marker` | `PO Changed with Tax @18%` | detected, not treated as a PO number |

### `test_migration_classifier.py`

Each reason code gets a test asserting it fires on the real workbook **and** produces the expected count:

| Reason code | Expected count |
|---|---|
| `DUPLICATE_PO_ACROSS_SHEETS` | 48 |
| `MALFORMED_BILL_NUMBER` | 33 |
| `BILLED_EXCEEDS_ORDERED` | 16 |
| `DELIVERED_EXCEEDS_ORDERED` | 35 |
| `RATE_DIVERGENCE` | 24 |
| `GST_RATE_OUT_OF_RANGE` | 3 |
| `NO_BILL_REFERENCE` | 824 |
| `ZERO_GST_ON_BILLED_LINE` | 847 |
| `PO_NUMBER_IS_REVISION_MARKER` | ~14 |

### `test_migration_integration.py`

| Test | Asserts |
|---|---|
| **`test_dry_run_reconciles_to_workbook`** | **MANDATORY.** Total PO value = ₹12,07,77,682 exactly |
| `test_dry_run_writes_nothing` | Row counts unchanged after `--dry-run` |
| `test_commit_is_idempotent` | Running twice produces no duplicates |
| `test_needs_review_excluded_from_totals` | Flagged rows absent from headline figures |
| `test_colour_status_goes_to_interim_only` | Never written to a real allocation |
| `test_import_is_atomic` | A failure mid-import leaves the database empty |

---

## Phase 4 — Fast Entry

### `test_paste_import.py`

| Test | Asserts |
|---|---|
| `test_20_row_paste` | 20 rows → 20 correct line items |
| `test_column_mapping_remembered` | Second paste for the same client reuses the mapping |
| `test_paste_never_autosaves` | Response is a preview; nothing written |
| `test_malformed_paste_reports_row_numbers` | Errors identify the offending rows |

### `test_pdf_extraction.py`

One case per client format:

| Test | Asserts |
|---|---|
| `test_extract_hcl_po` | Header + lines from a 10-digit HCL PO |
| `test_extract_dlf_po` | `SO/…` format |
| `test_extract_metlife_po` | `93026-…` format |
| `test_extract_confidence_reported` | Every field carries a confidence score |
| `test_extraction_never_autosaves` | Always a preview |
| `test_unreadable_pdf_fails_cleanly` | Clear error, never partial silent data |

### Frontend — `LineItemGrid.test.tsx`

| Test | Asserts |
|---|---|
| `test_tab_moves_between_cells` | Forward and backward |
| `test_enter_on_last_cell_adds_row` | |
| `test_ctrl_d_copies_above` | |
| `test_paste_multirow` | Clipboard TSV fills many rows |
| `test_amount_computed_not_typed` | Read-only; recalculates on qty/rate change |
| `test_gst_defaults_from_client` | 0% for HCL |
| `test_item_type_guessed` | `Supply of…` → Material |
| `test_full_po_entry_without_mouse` | Seven lines entered keyboard-only |

---

## E2E — Playwright

| Journey | Steps |
|---|---|
| `test_login_to_po_detail` | login → search → open PO → verify money strip |
| `test_create_po_end_to_end` | login → Add PO → 7 lines → save → verify totals |
| `test_revise_po_preserves_work` | create → deliver 30 → revise → verify 30 survives |
| `test_permission_boundary_ui` | staff login → short-close absent; owner login → present |
| `test_export_downloads` | export → file opens, dates are real dates |
| `test_owner_mobile_journey` | mobile viewport → outstanding visible → 2 taps to a client |

---

## The Non-Automatable Gate

### Phase 4.3 — the stopwatch test

**Not a code test. It is still an acceptance gate.**

```
Setup   : PO 8100013678 (7 lines, LED downlighters), timed twice
Method  : Enter into the app; enter into Excel. Same person, same day.
Pass    : the app is faster
Fail    : Phase 4 is NOT complete. Fix the grid and retest.
Record  : both times in TRACKER.md
```

This is PRD risk R1 — the single most likely cause of failure, and no unit test can catch it.

---

## Commands

```bash
pytest                                            # everything
pytest --cov=tracker --cov-report=term-missing
pytest tracker/tests/test_status_derivation.py    # the specification
pytest tracker/tests/test_permissions.py          # the matrix
pytest -m migration                               # against the real workbook
npm test                                          # Vitest
npm run test:e2e                                  # Playwright
```

---

## Coverage Gates

| Module | Minimum |
|---|---|
| `tracker/services/` | **100%** |
| `tracker/permissions.py` | **100%** |
| `tracker/selectors/` | 90% |
| `tracker/models/` | 85% |
| `tracker/management/commands/` | 90% |
| Overall `tracker/` | 85% |
| `LineItemGrid` | 90% |

**CI fails below these numbers.** Services and permissions sit at 100% because a gap in either is lost money or an unauthorised write.

---

*Test cases trace to [APP_FLOW.md](APP_FLOW.md) for behaviour and [SCHEMA.md](SCHEMA.md) for the rules being enforced.*
