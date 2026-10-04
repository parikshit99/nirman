# Data format

What Nirman stores and how, written so the data can be read by any future version of the app, whatever it is built with. The code is the source of truth: the tables are in `apps/mobile/src/data/schema.ts`, the row types in `packages/shared/src/schemas.ts` and the backup in `apps/mobile/src/data/backup.ts`. Update this note when they change.

## Where it lives

- **Phone:** one SQLite database named `nirmaan` (via `@capacitor-community/sqlite`).
- **Browser (development):** the same SQLite database, run by sql.js and saved in IndexedDB as `nirmaan.db`.
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
| `items` | line in a list | `list_id`; `item_name` (standard English name); `original_term` (word as written or spoken, e.g. "bori"); `quantity`, `unit`, `unit_price`, `total_amount`, `vendor`, `date` |
| `indexed_rates` | single price added on its own ("Index rate", or a confirmed vendor quote) | `item_name`, `unit`, `date`, `price`, `vendor`, `indexed_at` |
| `learned_terms` | correction the app remembers | `id` is the original word, lower-cased; it maps to the `item_name` and `unit` to use instead |
| `categories` | type of work (Civil, Electrical, …) | `name`; the built-in ones use the lower-cased name as `id` |
| `quotes` | vendor's reply to a saved BOQ | `boq_id` (a `lists` id); `vendor`, `quote_date`; `status`: `review` or `confirmed` |
| `quote_lines` | line in a vendor quote | `quote_id`, `position`; `boq_item_id`, the BOQ `items` row it was matched to (empty = not in the BOQ); plus `original_term`, `item_name`, `quantity`, `unit`, `unit_price`, `total_amount`, `note` |
| `hidden_materials` | material hidden from the Data tab and price checks | `id` is the material's key (see Conventions); `name`, `unit`, `hidden_at`. Saved lists are not changed. |
| `jobs`, `job_images` | entry waiting to be read by Gemini (with its photos as base64) | temporary; deleted once read |
| `schema_version` | — | number of migrations applied |

Every list and item row also has `created_at` and `updated_at`.

The two working drafts always exist, with fixed ids: `draft-audit` (the open Purchases list) and `draft-boq` (the open BOQ). Saving copies the draft's items into a `saved` list: a new one, or the history record being updated, whose items are replaced. The draft itself is left as it is.

### How the material price database is built

There is no separate price table. The Data tab is computed on the fly (`buildItemDatabase`) from:
- every item with a price in a `saved` list (dated by the item's `date`, or else the list's creation date);
- every row in `indexed_rates`.

Names and units are first passed through `learned_terms`, and materials listed in `hidden_materials` are left out. Within a material, prices are also grouped by variant (the four variant fields, compared lower-cased). A price check for a line that names a brand, model, spec or colour only uses past prices with the same values for the fields it names; blank fields match anything.

Renaming a material in the app rewrites `item_name` and `unit` on all of its items and rates, and records each original word in `learned_terms`. Renaming to the name and unit of another material therefore merges the two.

## Changing the schema

Add a new migration to the end of `MIGRATIONS` in `schema.ts`. Never edit one that has already shipped: phones apply only the migrations they haven't run yet.

## Backup file

*Settings → Save backup* writes one JSON file, `nirman-backup-YYYY-MM-DD.json`:

```json
{
  "app": "nirmaan-auditor",
  "version": 4,
  "exported_at": "2026-10-03T19:13:38.586Z",
  "lists": [], "items": [], "indexed_rates": [], "learned_terms": [],
  "categories": [], "quotes": [], "quote_lines": [], "hidden_materials": []
}
```

- Each array holds that table's rows exactly as stored, with the same column names.
- `jobs` and `job_images` are left out, so are quotes still waiting to be read.
- Older files still restore:
  - version 1 (before vendor quotes) has no `quotes` or `quote_lines`;
  - version 2 (before hidden materials) has no `hidden_materials`;
  - version 3 (before variant fields) has rows without `brand`, `model`, `spec`, `color`.
- Restoring replaces everything on the phone.
- Any reimplementation should read this format, so old backups keep working.
