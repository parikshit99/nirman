# Data format

What Nirman stores and how, written so the data can be read by any future version of the app, whatever it is built with. The code is the source of truth: the tables are in `packages/core/src/data/schema.ts`, the row types in `packages/shared/src/schemas.ts` and the backup in `packages/core/src/data/backup.ts`. Update this note when they change.

## Where it lives

- **Phone:** one SQLite database named `nirmaan` (via `@capacitor-community/sqlite`).
- **Browser (development):** the same SQLite database, run by sql.js and saved in IndexedDB as `nirmaan.db`.
- **Diagnostic log:** not in the database or backups; the last 400 entries (errors, AI reading results, steps, timings, with no bill contents) are kept in the app's small key-value store (`expo-sqlite/kv-store`, set up in `apps/native/src/lib/coreSetup.ts`) under `nirmaan_diagnostics`.
- **Gemini API key:** not in the database. It is kept in the phone's secure storage and is never included in backups.

The `nirmaan` names are the original internal ids. They stay unchanged so existing installs keep their data.

## Conventions

- Ids are text (random UUIDs), except where noted below.
- Dates are text: `YYYY-MM-DD` for calendar dates and ISO 8601 UTC (`2026-10-03T19:13:38.586Z`) for timestamps.
- **Variant fields** `brand`, `model` (model number or item code), `spec` (size, thickness, grade or rating, e.g. "2.5 sq mm") and `color` are optional text on items, indexed rates and quote lines; blank means not recorded. Rows saved before they existed read as blank.
- Money is a plain number in rupees, with no currency symbol or commas. Quantities are plain numbers.
- A **material** is identified by its name plus unit, compared lower-cased and trimmed (`materialKey` in `packages/shared/src/domain.ts`). "OPC Cement / Bag" and "opc cement / bag" are the same material.

## Tables

| Table | One row per | Key columns |
|---|---|---|
| `projects` | project (one building job or site) | `name`, `address` (its site address, offered when saving lists and adding contracts); `status`: `active` or `closed` |
| `lists` | purchase list or BOQ | `project_id` (a `projects` id); `kind`: `audit` (Purchases) or `boq`; `status`: `draft` or `saved`; `title`, `address`, `category`, `site_date`, `notes` |
| `items` | line in a list | `list_id`; `item_name` (standard English name); `original_term` (word as written or spoken, e.g. "bori"); `quantity`, `unit`, `unit_price`, `total_amount`, `vendor`, `date`; `delivered_at`, the date a purchase line reached the site (blank = not marked); `ordered_as`, how it was ordered when billed in another unit (e.g. "3 bundles of 12 mm" for a line in kg); `photo_id`, the `bill_photos` row it was read from (blank for typed or spoken lines); `rates_excluded`, 1 when its price is kept out of Rates and price checks: ticked *Leave out of Rates* on the line (e.g. transport included in the rate), or cleared from Rates for good in Settings (the line stays in its list, its totals and site reports); `read_as`, set when reading matched the line to a material (see *One name per material*): JSON of the line as read (`item_name`, `unit`, `quantity`, `unit_price`, `brand`, `spec`, `ordered_as`), so *Undo* can put it back; blank otherwise (since 7.1) |
| `indexed_rates` | single price added on its own (a confirmed vendor quote; versions up to 3.0.0 also stored "Index rate" here, which now saves the purchase list to History instead) | `item_name`, `unit`, `date`, `price`, `vendor`, `indexed_at`; `category` and `address`: the BOQ's for a confirmed quote; for "Index rate", the site picked when indexing, or the purchase list's once it is saved with the same line; `project_id`: the BOQ's project for a confirmed quote, else blank (Rates covers all projects) |
| `learned_terms` | correction the app remembers | `id` is the original word, lower-cased; it maps to the `item_name` and `unit` to use instead |
| `categories` | type of work (Civil, Electrical, …) | `name`; the built-in ones use the lower-cased name as `id` |
| `quotes` | vendor's reply to a saved BOQ | `boq_id` (a `lists` id); `vendor`, `quote_date`; `status`: `review` or `confirmed` |
| `quote_lines` | line in a vendor quote | `quote_id`, `position`; `boq_item_id`, the BOQ `items` row it was matched to (empty = not in the BOQ); plus `original_term`, `item_name`, `quantity`, `unit`, `unit_price`, `total_amount`, `note` |
| `hidden_materials` | material deleted from the Rates tab and price checks | `id` is the material's key (see Conventions); `name`, `unit`, `hidden_at`. Prices recorded up to `hidden_at` are left out; later ones show again. Saved lists are not changed; removing the row restores it. The app removes a row once no saved line or rate recorded up to `hidden_at` is left for it (`unusedHiddenMaterials`). *Clear* in Settings makes them final: the `indexed_rates` they hid are deleted, the saved lines they hid get `rates_excluded = 1`, and the rows go. |
| `contracts` | labour contract | `project_id`; `contractor`, `phone`, `address`, `category`, `work`; `kind`: `rate` (paid `rate` per `unit`, optional `est_quantity`) or `lump_sum` (`amount`); `retention_pct`; `start_date`; `status`: `active` or `closed`; `retention_released_at` (blank while held); `notes` |
| `contract_entries` | something recorded on a contract | `contract_id`, `date`; `kind`: `work` (`quantity` in the contract's unit, or % of a lump sum), `payment` against measured work (`amount`, `mode`: cash / upi / bank / cheque), `advance` (kharcha: cash given before the work is measured; `amount`, `mode`), or `deduction` (`amount`); `note`. Payments and advances both count as paid; a negative balance (paid more than the work measured, less retention and deductions) is shown as *Paid ahead of work* |
| `jobs`, `job_images` | entry waiting to be read by Gemini (with its photos as base64) | temporary; deleted once read |
| `training_samples` | opt-in (*Keep bill photos for training*): a photographed bill kept for training an on-phone model | `engine` (`phone` or `gemini`, what read it), `ocr_text` (text the phone read), `images` (JSON array of base64 JPEGs), `item_ids` (JSON array of the `items` it became), `category`. Not in backups; exported from Settings as JSON Lines with each bill's current lines |
| `bill_photos` | photographed bill whose lines were read | `images` (JSON array of base64 JPEGs, each at most 1200 px, JPEG quality 0.8), `created_at`. Lines point to it with `items.photo_id` (a saved copy of a line keeps it); deleted once no line does. In backups as JPEG files in the zip |
| `schema_version` | — | number of migrations applied |

Every list and item row also has `created_at` and `updated_at`.

There is always at least one project, and every project has its two working drafts: the open Purchases list (`kind = 'audit'`) and the open BOQ (`kind = 'boq'`), both `status = 'draft'` with the project's `project_id`. A new project's drafts have the ids `draft-audit-<project id>` and `draft-boq-<project id>`; drafts from before projects keep their old ids `draft-audit` and `draft-boq`, so look a draft up by project and kind, not by id. Saving moves the draft's items into a new `saved` list in the same project (`items.list_id` changes; ids, delivery ticks and bill photos stay), along with queued entries for it and a BOQ's notes, and leaves the draft empty: each line exists once. A saved list is edited in place afterwards (the app shows it on its tab instead of the draft). Before 6.0 saving copied the items and left the draft as it was; a draft still holding such a copy replaces its saved list's items when saved once more. Quotes, quote lines, items and contract entries belong to a project through their list or contract.

**Rows without a project** (from before projects, version 5.0, or restored from an older backup) are given one when the app starts (`ensureProjects` in `repo.ts`): saved lists and contracts with a site address go into a project for that address (compared lower-cased and trimmed, named after it), the rest into a project named "My site". Drafts without a project go to the project whose saved lists or contracts changed most recently. Rates from confirmed quotes get the project with their site address, if there is one.

### How the material price database is built

There is no separate price table. The Rates tab is computed on the fly (`buildItemDatabase`) from:
- every item with a price in a `saved` list, except those with `rates_excluded = 1` (dated by the item's `date`, or else the list's creation date);
- every item with a price in each project's open purchase list (`kind = 'audit'`, `status = 'draft'`), the same way, so a price counts as soon as it is entered (dated by its `date`, or else its own `created_at`). A draft line with the same material, variant, date, rate and vendor as a saved line is its saved copy and is not counted again. Open BOQs are not used;
- every row in `indexed_rates`.

Each material's work categories and sites come from its saved lists and from its rates' `category` and `address`; a material with none gets a category guessed from its name. Names and units are first passed through `learned_terms`, and for materials listed in `hidden_materials`, rows recorded up to `hidden_at` are left out (saved-list items by the list's `created_at`, open purchase list items by their own `created_at`, rates by `indexed_at`). Within a material, prices are also grouped by variant (the four variant fields, compared lower-cased). A price check for a line that names a brand, model, spec or colour only uses past prices with the same values for the fields it names; blank fields match anything. Price checks are site first (`lastPaidFor`, and `compareQuotes` with the BOQ's project): the last price paid for the same project is used, and only when that project has none, the latest price from any project, shown with its site address.

Renaming a material in the app rewrites `item_name` and `unit` on all of its items and rates, and records each original word in `learned_terms`. Renaming to the name and unit of another material therefore merges the two. A merge in the Rates tab (since 7.1) also converts between units of one kind: quantities are multiplied and rates divided by the factor (`unitFactor` in `packages/shared/src/catalog.ts`; e.g. 1 MT = 1000 kg, 1 brass = 100 cft, 1 cum = 35.3147 cft, 1 sqm = 10.7639 sqft), totals are kept, and `ordered_as` notes the unit billed ("2 MT"). Correcting only the unit keeps the numbers.

### One name per material (since 7.1)

When an entry is read, or a line is typed with *Add item manually* (`standardizeLine` in `packages/shared/src/catalog.ts`, through `matchMaterials` in `repo.ts`, before the lines are stored), each line gets one name:
1. A word already in `learned_terms` is left to it.
2. Otherwise the closest material in Rates (`knownMaterials`: names after `learned_terms`, without deleted materials and BOQ-only lines) is used when the names are the same apart from case, spacing, punctuation or one letter (`nameSimilarity` ≥ 0.8; numbers and codes must agree), and the units are the same kind.
3. Otherwise the built-in starter catalog (`CATALOG`: cement, TMT bar, sand, aggregate, bricks, pipes…) by the words on the bill, including brand short forms ("UT" → UltraTech cement).

Brands and grades found in the name fill `brand` and `spec` when blank. A unit of the same kind is converted as for merges. The word as read goes to `original_term` (if blank) and the whole line as read to `read_as`. Units as written are tidied ("Bags" → Bag, "KGS" → kg, `cleanUnit`). Gemini is also given the names in Rates (most used first, then the catalog's; at most 150) to reuse.

### Site report

*Saved → Site report* is also computed on the fly (`buildSiteReport`): the `audit` lists saved in the open project (versions before 5.0: for one `address`), optionally limited to some categories, to a date range, and to lines with a `delivered_at`. A line's date is its `delivered_at`, else its `date`, else the list's `site_date`, else the day the list was created. Names and units go through `learned_terms` as above.

## Changing the schema

Add a new migration to the end of `MIGRATIONS` in `schema.ts`. Never edit one that has already shipped: phones apply only the migrations they haven't run yet.

## Backup file

*Settings → Save backup* writes one zip file, `nirman-backup-YYYY-MM-DD.zip`, holding `backup.json` and every bill photo as `photos/<bill_photos id>-<page>.jpg` (stored uncompressed: they are JPEGs already). `backup.json`:

```json
{
  "app": "nirmaan-auditor",
  "version": 14,
  "exported_at": "2026-10-03T19:13:38.586Z",
  "projects": [], "lists": [], "items": [], "indexed_rates": [], "learned_terms": [],
  "categories": [], "quotes": [], "quote_lines": [], "hidden_materials": [],
  "contracts": [], "contract_entries": [],
  "bill_photos": [{ "id": "…", "created_at": "…", "files": ["photos/…-1.jpg"] }]
}
```

- Each array holds that table's rows exactly as stored, with the same column names.
- `bill_photos` lists each photo's pages by their file in the zip, instead of the base64 `images` column.
- `jobs`, `job_images` and `training_samples` are left out, so are quotes still waiting to be read.
- Restore reads the zip, or a plain `.json` from version 11 and earlier (which has no photos; restoring one on the same phone keeps the bill photos of restored lines).
- Older files still restore:
  - version 1 (before vendor quotes) has no `quotes` or `quote_lines`;
  - version 2 (before hidden materials) has no `hidden_materials`;
  - version 3 (before variant fields) has rows without `brand`, `model`, `spec`, `color`;
  - version 4 (before rate categories) has `indexed_rates` rows without `category` and `address`;
  - version 5 (before delivery tracking) has `items` rows without `delivered_at`;
  - version 6 (before order units) has `items` rows without `ordered_as`;
  - version 7 (before labour contracts) has no `contracts` or `contract_entries`;
  - version 8 (before bill photos) has `items` rows without `photo_id`;
  - version 9 (before clearing deleted rates) has `items` rows without `rates_excluded`;
  - version 10 (before projects) has no `projects`, and `lists`, `contracts` and `indexed_rates` rows without `project_id`; they are sorted into projects as described above;
  - version 11 (before bill photos in backups) is a plain `.json` file with no `bill_photos`;
  - version 12 (before advances) has no `contract_entries` of kind `advance`;
  - version 13 (before matching on reading) has `items` rows without `read_as`.
- Restoring replaces everything on the phone.
- Any reimplementation should read this format, so old backups keep working.
