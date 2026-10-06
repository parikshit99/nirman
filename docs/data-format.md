# Data format

What Nirman stores and how, written so the data can be read by any future version of the app, whatever it is built with. The code is the source of truth: the tables are in `apps/mobile/src/data/schema.ts`, the row types in `packages/shared/src/schemas.ts` and the backup in `apps/mobile/src/data/backup.ts`. Update this note when they change.

## Where it lives

- **Phone:** one SQLite database named `nirmaan` (via `@capacitor-community/sqlite`).
- **Browser (development):** the same SQLite database, run by sql.js and saved in IndexedDB as `nirmaan.db`.
- **Diagnostic log:** not in the database or backups; the last 400 entries (errors, AI reading results, steps, timings, with no bill contents) are kept in the WebView's localStorage under `nirmaan_diagnostics`.
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
| `lists` | purchase list or BOQ | `kind`: `audit` (Purchases) or `boq`; `status`: `draft` or `saved`; `title`, `address`, `category`, `site_date`, `notes` |
| `items` | line in a list | `list_id`; `item_name` (standard English name); `original_term` (word as written or spoken, e.g. "bori"); `quantity`, `unit`, `unit_price`, `total_amount`, `vendor`, `date`; `delivered_at`, the date a purchase line reached the site (blank = not marked); `ordered_as`, how it was ordered when billed in another unit (e.g. "3 bundles of 12 mm" for a line in kg); `photo_id`, the `bill_photos` row it was read from (blank for typed or spoken lines) |
| `indexed_rates` | single price added on its own (a confirmed vendor quote; versions up to 3.0.0 also stored "Index rate" here, which now saves the purchase list to History instead) | `item_name`, `unit`, `date`, `price`, `vendor`, `indexed_at`; `category` and `address`: the BOQ's for a confirmed quote; for "Index rate", the site picked when indexing, or the purchase list's once it is saved with the same line |
| `learned_terms` | correction the app remembers | `id` is the original word, lower-cased; it maps to the `item_name` and `unit` to use instead |
| `categories` | type of work (Civil, Electrical, …) | `name`; the built-in ones use the lower-cased name as `id` |
| `quotes` | vendor's reply to a saved BOQ | `boq_id` (a `lists` id); `vendor`, `quote_date`; `status`: `review` or `confirmed` |
| `quote_lines` | line in a vendor quote | `quote_id`, `position`; `boq_item_id`, the BOQ `items` row it was matched to (empty = not in the BOQ); plus `original_term`, `item_name`, `quantity`, `unit`, `unit_price`, `total_amount`, `note` |
| `hidden_materials` | material deleted from the Rates tab and price checks | `id` is the material's key (see Conventions); `name`, `unit`, `hidden_at`. Prices recorded up to `hidden_at` are left out; later ones show again. Saved lists are not changed; removing the row restores it. The app removes a row once no saved line or rate recorded up to `hidden_at` is left for it (`unusedHiddenMaterials`). |
| `contracts` | labour contract | `contractor`, `phone`, `address`, `category`, `work`; `kind`: `rate` (paid `rate` per `unit`, optional `est_quantity`) or `lump_sum` (`amount`); `retention_pct`; `start_date`; `status`: `active` or `closed`; `retention_released_at` (blank while held); `notes` |
| `contract_entries` | something recorded on a contract | `contract_id`, `date`; `kind`: `work` (`quantity` in the contract's unit, or % of a lump sum), `payment` (`amount`, `mode`: cash / upi / bank / cheque) or `deduction` (`amount`); `note` |
| `jobs`, `job_images` | entry waiting to be read by Gemini (with its photos as base64) | temporary; deleted once read |
| `training_samples` | opt-in (*Keep bill photos for training*): a photographed bill kept for training an on-phone model | `engine` (`phone` or `gemini`, what read it), `ocr_text` (text the phone read), `images` (JSON array of base64 JPEGs), `item_ids` (JSON array of the `items` it became), `category`. Not in backups; exported from Settings as JSON Lines with each bill's current lines |
| `bill_photos` | photographed bill whose lines were read | `images` (JSON array of base64 JPEGs), `created_at`. Lines point to it with `items.photo_id` (a saved copy of a line keeps it); deleted once no line does. Not in backups |
| `schema_version` | — | number of migrations applied |

Every list and item row also has `created_at` and `updated_at`.

The two working drafts always exist, with fixed ids: `draft-audit` (the open Purchases list) and `draft-boq` (the open BOQ). Saving copies the draft's items into a `saved` list: a new one, or the history record being updated, whose items are replaced. The draft itself is left as it is.

### How the material price database is built

There is no separate price table. The Data tab is computed on the fly (`buildItemDatabase`) from:
- every item with a price in a `saved` list (dated by the item's `date`, or else the list's creation date);
- every row in `indexed_rates`.

Each material's work categories and sites come from its saved lists and from its rates' `category` and `address`; a material with none gets a category guessed from its name. Names and units are first passed through `learned_terms`, and for materials listed in `hidden_materials`, rows recorded up to `hidden_at` are left out (saved-list items by the list's `created_at`, rates by `indexed_at`). Within a material, prices are also grouped by variant (the four variant fields, compared lower-cased). A price check for a line that names a brand, model, spec or colour only uses past prices with the same values for the fields it names; blank fields match anything.

Renaming a material in the app rewrites `item_name` and `unit` on all of its items and rates, and records each original word in `learned_terms`. Renaming to the name and unit of another material therefore merges the two.

### Site report

*History → Site report* is also computed on the fly (`buildSiteReport`): the `audit` lists saved for one `address`, optionally limited to some categories, to a date range, and to lines with a `delivered_at`. A line's date is its `delivered_at`, else its `date`, else the list's `site_date`, else the day the list was created. Names and units go through `learned_terms` as above.

## Changing the schema

Add a new migration to the end of `MIGRATIONS` in `schema.ts`. Never edit one that has already shipped: phones apply only the migrations they haven't run yet.

## Backup file

*Settings → Save backup* writes one JSON file, `nirman-backup-YYYY-MM-DD.json`:

```json
{
  "app": "nirmaan-auditor",
  "version": 9,
  "exported_at": "2026-10-03T19:13:38.586Z",
  "lists": [], "items": [], "indexed_rates": [], "learned_terms": [],
  "categories": [], "quotes": [], "quote_lines": [], "hidden_materials": [],
  "contracts": [], "contract_entries": []
}
```

- Each array holds that table's rows exactly as stored, with the same column names.
- `jobs`, `job_images`, `bill_photos` and `training_samples` are left out, so are quotes still waiting to be read. Restoring on the same phone keeps the bill photos of restored lines.
- Older files still restore:
  - version 1 (before vendor quotes) has no `quotes` or `quote_lines`;
  - version 2 (before hidden materials) has no `hidden_materials`;
  - version 3 (before variant fields) has rows without `brand`, `model`, `spec`, `color`;
  - version 4 (before rate categories) has `indexed_rates` rows without `category` and `address`;
  - version 5 (before delivery tracking) has `items` rows without `delivered_at`;
  - version 6 (before order units) has `items` rows without `ordered_as`;
  - version 7 (before labour contracts) has no `contracts` or `contract_entries`;
  - version 8 (before bill photos) has `items` rows without `photo_id`.
- Restoring replaces everything on the phone.
- Any reimplementation should read this format, so old backups keep working.
