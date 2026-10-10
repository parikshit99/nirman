# ERP plan: what Nirman takes from ERPNext

Status: proposed October 2026. Nothing started.

[ERPNext](https://github.com/frappe/erpnext) is a mature open-source ERP. This plan takes the parts of it that help a site owner with a phone: knowing **who you owe**, **what was ordered, delivered and billed**, **plan against actual spend** and **what is left on site at the end**. It does not copy ERPNext's accounting, approval workflows or roles: they suit an office, not a site.

Every phase works offline on the phone and needs no server. Each phase is sized to fit **one Claude session and one PR**, like [react-native-plan.md](react-native-plan.md).

## Rules

1. **One phase, one session, one PR.** Start each phase in a fresh session: "Do Phase E*n* of docs/ERP plan.md".
2. **Each phase is a MINOR release** (a new kind of data saved). Bump `apps/native/package.json` and add a CHANGELOG section ([Code guideline](Code%20guideline.md), *Versions*).
3. **Database changes follow the Code guideline** (*Keeping users' data safe*): append to `MIGRATIONS`, never edit a shipped migration, bump the backup `VERSION` keeping older backups readable, add a sample backup to the tests, update [data-format.md](data-format.md).
4. **Rules go in `packages/shared`, with tests** (balances, statuses, unit factors, plan vs actual), as `labour.ts` does for contracts. Screens only show them.
5. **Statuses are worked out from the data, never set by hand** (*Unpaid*, *Part delivered*, *Billed above the agreed rate*). ERPNext does the same, so a status can never disagree with the records behind it.
6. **Ready for sync.** Every new table has text UUID ids, `created_at` and `updated_at`, and `project_id` where the row belongs to a project, so [Sync 1](react-native-plan.md#sync-1-groundwork-in-the-app-minor) has less to add.
7. **Old data keeps working.** A phase that adds a column decides, in its migration, what existing rows mean (e.g. a line ticked *Delivered* before E3 counts as delivered in full).
8. **Update [Nirman workflows](Nirman%20workflows.md)** in the same PR: the section and diagram for each flow a phase changes or adds.
9. **Words** follow the [UX guideline](UX%20guideline.md): *vendor*, *bill*, *paid*, *owed*, *order*, *delivered*; no accounting terms (debit, credit note, ledger account) on screens.

## Order

```
E1 Vendors ─┬─ E2 Payments and what you owe ──────────────┐
            ├─ E3 Quantity delivered ─┐                    ├─ E8 Vendor ratings and reports
            │                         ├─ E5 Orders ────────┤
            └─ E4 Units per material ─┤                    │
                                      ├─ E6 Plan vs actual │
                                      └─ E7 Closing stock ─┘
E9 Change history: any time, but before Sync 2
```

Suggested sequence: E1 → E2 → E3 → E4 → E5 → E6 → E7 → E8, with E9 slotted before Sync 2. E2 (who you owe) is the most useful on its own and could ship right after E1.

**With the sync phases:** nothing here blocks Sync 1–3, and they don't block this. The owner decides the order. E9 must land before Sync 2, when a second person starts editing; if the sync phases go first, do E9 inside Sync 1, since both touch every write in `repo.ts`.

## Phases

### E1: Vendors (MINOR)

Today `vendor` is free text on `items`, `indexed_rates` and `quotes`, so "Sharma Traders", "sharma trdrs" and "Sharma" count as three vendors.

- **Data:**
  - New table `vendors`: `name`, `phone`, `address`, `gstin` (optional text, kept for the record only; no tax calculation), `notes`.
  - New table `vendor_aliases`: lower-cased name as written → `vendor_id`, like `learned_terms` for materials.
  - `vendor_id` on `items`, `indexed_rates` and `quotes`. The text `vendor` column stays, holding the name as read.
- **Migration:** make one vendor for each distinct name (compared lower-cased and trimmed) and set `vendor_id`. Names that are only close are not merged automatically: the app suggests them.
- **Matching** (`matchVendor` in `packages/shared`): an alias first, then the closest vendor by `nameSimilarity` (as for materials), else a new vendor. Gemini is given the vendor names to reuse, like the material names.
- **Screens:**
  - *Vendors*: a list (reached from Rates, beside materials) with a vendor page showing contact, Call and WhatsApp, their bills, quotes and the prices they charged.
  - *Merge* two vendors, with *Undo*; "Did you mean Sharma Traders?" suggestions for close names.
  - Tapping a vendor name on a line or quote opens the vendor page.

**Done when:** existing vendor names are vendors after updating, new bills and quotes link to a vendor, merging moves every line, rate and quote, and backups carry vendors.

### E2: Payments and what you owe (MINOR)

Most material on site is bought on credit (udhaar). Labour contracts already track paid vs due; materials don't.

- **Data:**
  - New table `vendor_payments`: `vendor_id`, `project_id`, `date`, `amount`, `mode` (cash / upi / bank / cheque, as labour), `list_id` (optional: paid against one bill), `note`.
  - On `lists`: `bill_no` (the vendor's bill number, optional; Gemini reads it when printed).
  - On `vendors`: `opening_balance` and `balance_from` (date).
- **Existing data:** on updating, every vendor's `balance_from` is the update day and `opening_balance` 0, so old bills don't all appear as unpaid. The vendor page offers *Set what I owe today*.
- **Rules** (`vendorBalance` in `packages/shared`, tested): owed = opening balance + saved purchase lines from `balance_from` − payments. Payments against a bill settle that bill; other payments settle the oldest bills first. Each bill's status is computed: *Unpaid*, *Part paid*, *Paid*.
- **Screens:**
  - *Save list* asks *Paid now* / *On credit* / *Part paid* (amount) for each vendor on the list; *Paid now* records the payment.
  - The vendor page shows the balance owed, bills with status, payments, *Add payment*, and *Share statement* (PDF, Excel, JPG, like a labour statement).
  - The Vendors list sorts by most owed and shows the total owed across vendors.
- **Workflows:** a new section *Vendor bills and payments*.

**Done when:** a vendor's balance matches bills minus payments, cash purchases need one tap, and the statement shares in all three formats.

### E3: Quantity delivered (MINOR)

Today `delivered_at` is a yes/no tick. Short deliveries (45 bags billed, 42 arrived) go unnoticed.

- **Data:** new table `deliveries`: `item_id`, `date`, `quantity`, `photo_id` (optional: a photo of the challan or the load, stored like bill photos), `note`. One line can be delivered in several loads (sand by the truck). `delivered_at` stays, set when the line is delivered in full.
- **Migration:** every line with `delivered_at` gets one delivery for its full quantity on that date.
- **Screens:** swiping right still means *delivered in full today*. *Delivered…* on a line takes a quantity, date and optional photo. The line shows *Short 3 Bag* or *2 of 5 loads*. Saved lists can be filtered to *Not fully delivered*.
- **Site report:** uses delivered quantities when *only delivered* is picked.
- **Rules:** short and pending quantities per line and per vendor, in `packages/shared`.

**Done when:** a partial delivery shows what is short, the tick works as before, and site reports add up the delivered quantities.

### E4: Units per material (MINOR)

`unitFactor` converts only within one kind of unit (MT ↔ kg, brass ↔ cft). A BOQ in kg, a bill in Bag and a quote in MT for the same cement can't be compared, and later phases need to (E5 orders, E6 plan vs actual, E7 closing stock).

- **Data:** new table `material_units`: material key (as in Conventions), `unit`, `factor` to the material's main unit. "Cement: 1 Bag = 50 kg"; "TMT 12 mm: 1 bundle = 10 bars ≈ 106.6 kg".
- **Built in:** common factors in `CATALOG` (cement bags, TMT bar weights from `conversions.ts`, brick counts), which the user can change.
- **Rules:** `unitFactor(from, to, material)` looks in `material_units` first, then the general factors. Used by merging materials, quote comparison, and the phases after this one.
- **Screens:** *Units* on a material in Rates: add or change a factor. When a line's unit can't be converted to the BOQ's, ask once "How many kg in 1 Bag of Cement?".

**Done when:** a quote in MT, a BOQ in kg and a bill in Bag compare side by side for a material with a factor.

### E5: Orders, from an accepted quote to the bill (MINOR)

ERPNext follows Request for Quotation → Supplier Quotation → Purchase Order → Receipt → Invoice and shows what is still pending at each step. Nirman stops after comparing quotes.

- **Accepting quotes:** on the quote comparison, *Accept* a whole quote, or pick a vendor per line. This makes one **order** per vendor: the BOQ lines and quantities at that vendor's quoted rates.
- **Data** (decide in the session after reading `repo.ts`):
  - Preferred: `lists.kind = 'order'` with `vendor_id`, `boq_id` and `quote_id`. Order lines are `items` with `boq_item_id`. This reuses sharing, PDF, Excel and the order slip.
  - On purchase `items`: `order_item_id`, the order line this bill line is billed against.
- **Matching bills to orders:** when a bill is read for a vendor with an open order, its lines are matched to the order lines with the same matcher as quotes (`quoteMatch.ts`), offline, for review.
- **Rules** (computed per order line and per order): ordered, delivered (E3), billed, pending; *Billed above the agreed rate*; status *Ordered*, *Part delivered*, *Delivered*, *Billed*, or *Closed* (closed by hand when the rest won't come).
- **Document numbers** (ERPNext's naming series): `lists.number`, given on save, per project and kind, never reused. Shown on screens and on shared PDFs and slips as "Order 3", "BOQ 7", "Bill 112", so the owner and the vendor can refer to the same paper on WhatsApp. Existing saved lists are numbered by `created_at`. Ids stay UUIDs. *With sync:* two phones can give the same number offline; Sync 2 decides how to resolve it (e.g. the server renumbers the later one, and the app shows the new number).
- **Screens:** *Orders* in Saved, with status; the order page shows each line's ordered / delivered / billed; *Share order* replaces the plain order slip when a vendor is chosen.
- **Workflows:** extend *A-04 BOQ and vendor quotes* through order and bill.

**Done when:** accepting a quote makes an order, a bill read later fills in its billed quantities, and a rate above the agreed one is flagged.

### E6: Plan vs actual for each project (MINOR)

ERPNext compares a project's budget with its costs. Nirman already has both halves.

- **Plan** for each project, by work type and by material:
  - materials: each BOQ line's quantity × its rate, from the first of: the accepted order (E5), the lowest confirmed quote, the last price paid (`lastPaidFor`), or the BOQ's own rate;
  - labour: each contract's rate × estimated quantity, or its lump sum;
  - optional budget per work type (new table `project_budgets`: `project_id`, `category`, `amount`), which replaces the computed figure when entered.
- **Actual:** saved and open purchase lines in the project (in the BOQ's units, through E4), and labour: work measured and amounts paid.
- **Rules:** `planVsActual` in `packages/shared`, tested, including materials bought that aren't in any BOQ (shown as *Not in BOQ*).
- **Screen:** *Plan vs actual* (in Saved, beside *Site report*): per work type, planned, spent, % and remaining; open a work type to see each material's planned and bought quantity and amount. Over plan is shown in the warning colour. Shares as PDF, Excel and JPG.

**Done when:** a project with a BOQ, purchases and contracts shows correct totals per work type, and materials with units in kg and Bag line up.

### E7: Closing stock at the end of a site (MINOR)

There is no day-to-day consumption log: recording every bag used is too much work on site. Instead, material left is **counted once, when the site is finished** (or at any time, if wanted), and usage is worked out from it.

- **When:** *Close project* offers *Count material left on site first*. It can also be started from the project at any time.
- **The count:** the app lists every material bought for the project (delivered quantity from E3, else billed quantity), with what the BOQ needed. The owner enters what is left; blank means none left.
- **Worked out** for each material (`closingStock` in `packages/shared`, tested):
  - used = received − left;
  - used vs BOQ: *More than planned* (wastage or loss) or less;
  - value of what is left, at the last price paid.
- **What happens to what is left**, per material:
  - *Move to another project*: the quantity and value leave this project and join the other one, at the price paid, with `rates_excluded = 1` so Rates doesn't count the price twice;
  - *Returned to vendor*: the value is taken off what you owe that vendor (E2);
  - *Keep / write off*: noted only.
- **Data:** new tables `stock_counts` (`project_id`, `date`, `notes`) and `stock_count_lines` (material key, unit, variant fields, `counted`, `action`, `to_project_id`, `vendor_id`). How a move appears in the receiving project (a line in a saved list titled "Moved from <project>", or a separate table) is decided in the session, so Plan vs actual and the site report count it once.
- **Share:** *Closing stock report* (PDF, Excel, JPG): received, used, BOQ, left, value left, and where it went.

**Done when:** closing a project with a count shows usage and over-use per material, and moving leftovers changes both projects' figures once each.

### E8: Vendor ratings and reports (MINOR)

ERPNext rates suppliers on price, delivery and quality (Supplier Scorecard). Once E1–E5 exist, Nirman has the same facts.

- **Per vendor** (`vendorScore` in `packages/shared`): price against the lowest quote and the last prices paid elsewhere; days from order to delivery; how often deliveries were short; how often a bill was above the agreed rate. Shown on the vendor page and, in short, in the quote comparison ("Short on 3 of 10 deliveries").
- No single score out of 10: the facts are shown as they are.
- **Reports** (ERPNext's value is largely its reports), each shared as PDF, Excel or JPG:
  - *Purchase register*: every bill in a date range, by vendor or work type, with bill number, amount and paid status;
  - *Owed to vendors*: every vendor's balance on a date;
  - *Material history*: one material's prices, vendors and quantities over time (most already in Rates).

**Done when:** each vendor shows its delivery and price record, and the three reports share in all formats.

### E9: Change history (MINOR)

ERPNext records every change to a document: who, when, old → new. Nirman edits saved lists in place with no trace. This guards against mistakes now, and with sync (several people) it is how a change is explained.

- **Data:** new table `changes`: `table_name`, `row_id`, `field`, `old`, `new`, `at`, `by` (blank until Sync 2 sign-in; then the person). Written in one place in `repo.ts`, on updates and deletes.
- **Scope:** saved lists and their lines, quotes, contracts and entries, vendors and payments, and stock counts. Not the open drafts while typing (too many rows, little value).
- **Screens:** *History* on a saved list, a line, a contract or a vendor: "Rate 380 → 390, 4 Oct 2026, 6:12 pm". Times in IST.
- **Backups:** included, so the history survives a restore.

**Done when:** editing a saved line shows the change in its history, and the history restores from a backup.

## Not now

- **Lock / cancel instead of editing** (ERPNext's submit, cancel, amend): skipped for now (owner, October 2026). Revisit after E2 if edits to paid bills cause confusion; E9 shows such edits meanwhile.
- **GST** (taxable value, CGST/SGST/IGST, HSN codes, input credit export): skipped for now (owner, October 2026). E1 keeps the vendor's GSTIN as text so this can be added later.
- **Not planned:** double-entry accounting, a chart of accounts, several companies, approval workflows, fixed roles. Roles come with Sync 2 (owner, editor, viewer) and stay at that.

## Progress

| Phase | Status | PR |
|---|---|---|
| E1 Vendors | not started | |
| E2 Payments and what you owe | not started | |
| E3 Quantity delivered | not started | |
| E4 Units per material | not started | |
| E5 Orders | not started | |
| E6 Plan vs actual | not started | |
| E7 Closing stock | not started | |
| E8 Vendor ratings and reports | not started | |
| E9 Change history | not started | |
