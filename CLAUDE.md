# Nirman: notes for contributors (and Claude)

Android app (Capacitor + React) for tracking construction purchases, BOQs and vendor quotes. See README.md for the layout and docs/data-format.md for the data. Run `npm run lint`, `npm test` and `npm run build` before every push; after a UI change also `npm run test:e2e -w apps/mobile` (checks 320–412 px). UI rules are under *UI and UX* below.

## Versions: deciding the size of a change

Versions are `MAJOR.MINOR.PATCH`. MAJOR.MINOR is set by hand in `apps/mobile/package.json`; CI counts PATCH automatically as the number of commits on `main` since that was last changed (2.2.0, 2.2.1, 2.2.2 … back to .0 at the next bump). Pick the size of every change before merging it:

| Change | Examples | What to do |
|---|---|---|
| **Fix / small update** → PATCH, automatic | bug fix, wording, layout or colour tweak, faster code, a small improvement to an existing screen, CI or docs | Nothing: don't touch the version or CHANGELOG.md. |
| **New feature** → MINOR (2.2 → 2.3) | a new button, screen, report, calculator, share option or setting; a new kind of data saved (a database migration) | Bump the minor number in `apps/mobile/package.json` (patch stays 0) and add a `## 2.3 — <title>` section at the top of CHANGELOG.md. It becomes the release notes and the in-app *What's new* screen. |
| **Major release** → MAJOR (2.x → 3.0) | a redesign or new main tab; several features released together; a change in how the app is used every day; anything that needs a reinstall or makes old backups unreadable | Bump the major number (3.0.0) and add a `## 3.0 — <title>` section, listing everything since the previous major. |

When unsure between two sizes, pick the smaller one. A test (`apps/mobile/test/whatsNew.test.ts`) fails if the version and the newest CHANGELOG section don't match.

## Conventions

- Never put the Gemini API key in the app or the repo.
- Database changes: append a migration to `MIGRATIONS` in `apps/mobile/src/data/schema.ts` (never edit a shipped one), bump the backup `VERSION` in `backup.ts` keeping older versions readable, and update docs/data-format.md.
- Keep internal ids unchanged (app id, `nirmaan` database names, backup `APP_ID`), so existing installs keep their data.
- Times shown to the user are in IST.
- The app must work at 320–360 px wide without sideways scrolling (see *UI and UX*).

## UI and UX (since 4.0)

Users are on site, on a phone, often in sunlight, sometimes with gloves. Keep every screen consistent with these rules; when a rule doesn't fit, change the shared component rather than working around it in one screen.

**Use the shared pieces in `apps/mobile/src/components/ui/`.** Don't hand-build these again:
- `Sheet` for anything shown over the app (never a new `fixed inset-0` overlay). `kind="sheet"` (default: slides up on a phone, centred on a tablet) for choices and short forms; `"dialog"` for a centred box; `"screen"` for full views with their own lists (`tall` + `scroll={false}` when the content scrolls inside). It handles Back (`useBackHandler`), the backdrop, animation, the status and gesture bars, and draws through a portal. Pass `busy` while saving or sharing (Back and outside taps do nothing). `closeOnBackdrop` only for sheets without typed input. `open={false}` keeps it loaded but hidden (the Add sheet keeps a half-typed entry). Use `SheetHeader` for the title and close button, `SheetLabel` + `SheetOption` for lists of choices.
- `Button`: `primary` (orange) is the **one** main action on a screen or sheet; `secondary` (white, grey outline) for everything else; `danger` (solid red) only to confirm a delete or clear; `dangerOutline` for a Delete beside other actions; `ghost` for Cancel. Sizes `sm` (36 px) and `md` (44 px). Don't use blue, black or dark grey for actions.
- `EmptyState` for every empty list, with two texts: nothing yet (say where things come from, offer the action) and nothing matches (say to check the filters or search). Hide filters, Select and Export when there is nothing to act on.
- `Tabs` for any pick-one row (sub-tabs, status filters, settings choices).
- `LineEditor` (`components/LineEditor.tsx`) to edit a material line anywhere: purchase and BOQ lines and prices in Rates. Don't add another line form; extend this one.
- `DocumentPreview` before sharing any PDF (list, site report, quote comparison, order slip, statement): show the file as it will be shared, then Share.
- Confirmations and errors: `useDialogs()` (`confirm`, `alert`, `prompt`; never `window.*`). Something that just worked and needs no choice: `dialogs.toast('Backup restored')`, not an alert.

**Colour.** Only Tailwind palette classes (`gray`, `orange`, `red`, `green`, `blue`, `white`) and the `--color-brand-*` variables; no hex or `rgb()` in components (charts: `var(--color-…)`). Orange = main action and the brand; red = delete, errors, prices higher than last time; green = delivered, saved, prices lower. Dark mode works by redefining the palette variables under `:root.dark` in `index.css`: when you use a shade that isn't listed there yet (e.g. a new `text-blue-800`), add its dark value, and check the screen with *Settings → Appearance → Dark*. Text on a coloured background uses `text-white` (it turns dark in dark mode, which is intended). The only literal colour is `[#fff]`, for what must stay white in both modes: text on red buttons and the page images in `DocumentPreview`. The PDF preview has the `paper` class and stays light.

**Text.** Smallest size `text-xs` (12 px); no `text-[10px]`/`text-[11px]` (only the PDF preview, which mirrors the PDF). Labels and headings are plain sentence case (`text-xs font-bold text-gray-600`), not `uppercase` + `tracking-widest` + `font-mono`. `font-mono` only for numbers: amounts, rates, quantities. Buttons may be uppercase with `tracking-wide`. Hint and secondary text is `text-gray-500` at the lightest (`gray-300/400` only for icons and borders). Write sentences a site supervisor understands; no internal words (record, session, index, metadata, extraction).

**Words.** Use these everywhere, including toasts, dialogs, Excel/PDF columns and the README:

| Use | Not |
|---|---|
| Purchases (tab), purchase list | Spend, audit, purchase log |
| BOQ, BOQ draft | |
| Labour, contract | |
| Rates (tab), rates by material | Data, material database |
| Saved (tab), saved list | History, session, record |
| Work type | Category, work category |
| Site address | Address / location |
| Save list | Site metadata, confirm save |
| Save rate / Save all rates | Index rate, indexed |
| Read items, being read | AI extraction, extraction queue |

Plurals must agree ("1 item", "2 items").

**Layout.**
- Phones and small tablets (below `lg`, 1024 px): tabs in the bottom bar, slim header with the total and Save / Preview / Share / Clear, list first, the orange **Add** button opens the entry form in a sheet. Wide screens: tabs in the header, entry form in the left column. Use `useMediaQuery('(min-width: 1024px)')` for behaviour that differs; plain Tailwind breakpoints for looks. Content on phones needs bottom padding for the tab bar (and the Add button on Purchases/BOQ).
- Must fit 320 px without sideways scrolling: below 480 px secondary header buttons show only their icon (keep `aria-label`), below 360 px Save too. Never cut off a money amount; make room instead.
- Keep clear of the status bar and gesture bar with `var(--inset-top)` / `var(--inset-bottom)` from `index.css` (Capacitor's real window insets, `env()` as the fallback), never `env(safe-area-inset-*)` directly: older Android WebViews report `env()` as 0. The app targets SDK 36, edge to edge. `Sheet`, the header, the tab bar and the Add button already do.
- Touch targets at least 40 px: icon-only buttons are `p-2.5` around a 16–20 px icon (add `-m-1.5` if the layout must not move), each with an `aria-label`.
- Deleting: never silent. Either use the `…Later` actions so Undo appears, or ask first with a `danger` confirm (a saved list, a contract, clearing a draft, delete all). Lines, prices and saved lists are deleted from their edit view (`LineEditor`'s Delete, the saved list's Edit sheet), not with a bin on every row or card, which was being tapped by mistake. "Delete all" is a labelled button at the end of its list, not a bare icon. Small rows that undo (contract entries, queued readings, photos in an entry) may keep an icon button.
- Forms in sheets don't close on an outside tap, so typed input is never lost.

**Checking a UI change.** Run `npm run test:e2e -w apps/mobile` (it doesn't build the app: run `npm run build` first). `e2e/narrow.e2e.ts` fails if a button or field runs past the edge at 320, 360 or 412 px or the header total is cut off; `e2e/sheets.e2e.ts` checks sheets fit and sit on top, and dark mode. Add a case there for a new screen or sheet. Look at screenshots at 360 px in light and dark before pushing.

**Code style.** Format new code like the existing code (Prettier, `--print-width 180 --single-quote`), but don't reformat lines you didn't change.

## Diagnostics

- `apps/mobile/src/lib/diagnostics.ts` keeps the on-phone log. Steps carry what they worked on (action arguments, AI input text and output lines, so item names, rates, vendors and addresses may appear) to help reproduce bugs; the owner allowed this, and the repo is private. Never log photos (`describe()` replaces encoded data with a size) or the API key (`scrub()` removes it).
- Users send it with *Settings → Report a problem* (a pre-filled GitHub issue labelled `bug`) or *Share log*. Read those issues' logs when debugging.
- There are no automatic crash reports: the log leaves the phone only when the user sends it.
