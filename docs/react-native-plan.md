# Moving Nirman to React Native

Status: plan, agreed October 2026. Nothing here has been built yet.

Goal: replace the Capacitor WebView app with a React Native (Expo) app that uses Android's own controls, **without anyone losing data, their Gemini key or a working app at any point**, and set up the code so iOS, a web version and sync to a Raspberry Pi can follow.

## Rules for the whole move

1. **Same app, updated in place.** The React Native app keeps the app id `com.nirmaan.auditor`, the release signing key and the key-rotation lineage (CI's `apksigner` step), and its `versionCode` keeps counting from the CI run number. Users install it over the current app like any other update.
2. **Same database file, opened where it is.** The new app opens the SQLite file the Capacitor app writes, in place, with the same schema and migrations. No export/import step for users.
3. **One copy of the rules and the data code.** Schema, migrations, repository, backup, Gemini and the queue worker move to a shared package used by **both** apps until the old app is retired. A database change made during the move therefore reaches both apps, and the old app can always be rebuilt against the latest data.
4. **The old app stays buildable until the new one has been out for 6 weeks without a serious bug.** It is the fallback (see *Rolling back*).
5. **Never start empty silently.** If the new app cannot open or check the existing data on first launch, it says so and offers *Restore from backup*. It never creates a fresh database over a problem.
6. **Same backup file.** Backups made by either app restore in the other. CI checks this both ways.
7. **Each step ships on its own and is checked on a real phone** before the next one starts.

## What has to carry over

Everything an installed copy keeps, and where it is today:

| What | Where it is now | How it carries over |
|---|---|---|
| Projects, lists, items, rates, quotes, contracts, queued readings, bill photos, learned names | SQLite via `@capacitor-community/sqlite`, file `databases/nirmaanSQLite.db` (confirm the exact name on a phone, see step 1) | Opened in place by the new app (rule 2) |
| Gemini key, model, how bills are read, training opt-in | `@aparajita/capacitor-secure-storage` (Android Keystore), key `nirmaan_settings` | Copied to the new secure storage on first launch by a small native reader for the old format; if that fails, the user is asked to paste the key again (it is in their AI Studio account) |
| Small preferences: open project, sort, work types, onboarded, What's new seen, backup reminder, editing state, etc. | WebView `localStorage` (`lib/prefs.ts`) | **Can't be read from outside the WebView.** The 6.1 release (step 1) copies them into the database |
| Report-a-problem log | WebView `localStorage` (`lib/diagnostics.ts`) | Copied into the database by 6.1 as well |
| Things shared into the app that haven't been handled yet | In memory only | Nothing to carry over |

Someone who jumps straight from a version older than 6.1 to the new app loses only the small preferences. The new app must cope with that: if the database has projects, don't show onboarding; open the most recent project.

## Phases

Version sizes follow CLAUDE.md. Each phase ends with `npm run lint`, `npm test`, `npm run build`, the e2e checks, and the release installed over the previous one on a real phone.

### Phase 0: split out the shared core (patch releases; users see no change)

Make the data and logic code independent of Capacitor and the browser, inside the current app.

- New package `packages/core`, moved over from `apps/mobile/src` with tests:
  - `data/` (schema, migrations, `repo.ts`, `backup.ts`, the `Db` interface from `sql.ts`; the drivers stay in each app)
  - `jobs/worker.ts`, `lib/gemini.ts`
  - the non-UI parts of `lib/exports.ts`, `lib/pdf.ts`, `lib/diagnostics.ts`, `lib/settings.ts`, `lib/conversionSettings.ts`, `lib/backupReminder.ts`, `lib/whatsNew.ts`, `lib/materialSort.ts`, `lib/workType.ts`
  - the state logic in `state/AppState.tsx`, as plain functions or a hook with no DOM.
- Everything platform-specific goes behind small interfaces the app provides:
  - `Platform.db` (open the database)
  - `secureStore` (get/set)
  - `prefsStore`
  - `files` (read, write, share, pick)
  - `network` (online/offline)
  - `textReader` (on-phone reading)
  - `speech`
  - `camera`
  - `haptics`
  - `randomUUID` (Hermes has no `crypto.randomUUID`)
  - `now()`, for IST and tests.
- Remove DOM use from the core: `localStorage`, `document`, `window`, `Blob`/`URL.createObjectURL`, `FileReader`. A lint rule (`no-restricted-globals`) in `packages/core` keeps them out.
- Check that `@google/genai`, `fflate`, `jspdf`/`jspdf-autotable` and `write-excel-file` run without a browser. Run the core tests in plain Node (no jsdom) to prove it. Anything that needs a browser API gets an adapter.
- **Done when:** `apps/mobile` imports everything from `@nirman/core`, behaves exactly as before, all tests pass, and the core suite runs in Node with no DOM.

### Phase 1: release 6.1, getting ready for the move (MINOR, a database migration)

The last feature release of the Capacitor app. It moves everything the new app will need into places it can read.

- Migration: an `app_prefs` table (`key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL`).
  - On start, copy every `prefs` key and the diagnostics log from `localStorage` into it once.
  - From then on, `prefs` writes go to both places. Reads come from an in-memory copy loaded from the table at start, so `prefs.get` stays synchronous.
  - Not in backups (same as today).
  - Bump the backup `VERSION` only if the backup format changes (it shouldn't).
  - Update docs/data-format.md.
- Record the facts the new app relies on, in diagnostics and in `app_prefs`:
  - the database file's full path and size
  - the SQLite and schema versions
  - the journal mode
  - whether the secure-storage read works.

  Check the path on a real phone (`adb shell run-as` on a debug build) and write it down here.
- Backup nudge: if there's no backup in the last 3 days, show the existing backup reminder. Wording: "A big update is coming. Save a backup first."
- CHANGELOG `## 6.1 — Getting ready for the new app`.
- **Done when:** 6.1 has been the `latest` release for at least 2 weeks, and the owner's phone shows `app_prefs` filled and the recorded path as expected.

### Phase 2: the React Native app, side by side (not released to users)

`apps/native`, an Expo app with development builds (prebuild), **not** Expo Go, because it has its own native modules.

- **App id for now:** `com.nirmaan.auditor.next`, named "Nirman Next", so it installs **beside** the real app with its own data. Data comes in through *Restore from backup*.
- **Engine:** React Native's New Architecture with Hermes; TypeScript; the same Prettier settings.
- **Navigation:** React Navigation's native stack (real Android screen transitions, predictive back) plus native bottom tabs (see *Native controls*).
- **Database:** `expo-sqlite`, which also runs on the web later, behind the existing `Db` interface.
  - Open the file by its full path in the app's `databases/` folder, so the cutover build opens the old file in place.
  - Fall back to `op-sqlite` only if it turns out too slow (check `rates.perf.test.ts`-sized data on a low-end phone).
- **Native modules:**
  - Move `TextReaderPlugin.java` (ML Kit) into an Expo module (Kotlin), returning the same `TextBox[]`.
  - `SharedFilesPlugin.java` becomes `expo-share-intent` or a ported module, with the same intent filters as `AndroidManifest.xml` (images, several images, plain text).
  - Haptics use Android's `performHapticFeedback` like `HapticsPlugin.java`.
- **Theme:** the colours and dark-mode values from `index.css` become one theme object (light and dark). The colour rules in CLAUDE.md still apply (orange = main action, red = delete, higher price and errors, green = delivered, saved and lower price).
- **Shared pieces rebuilt first**, with the same names and the same props where possible, so the screens port one to one: `Sheet`, `SheetHeader`, `SheetLabel`, `SheetOption`, `Button`, `Tabs`, `EmptyState`, `SuggestInput`, `LineEditor`, `DocumentPreview`, `useDialogs()` (`confirm`, `alert`, `prompt`, `toast`).
- **CI:** a new `native` job builds a debug APK of "Nirman Next" on every PR and runs the Maestro checks (Phase 3) on an Android emulator. It doesn't publish anything yet.
- **Done when:** the Next app opens a restored backup and shows Purchases, BOQ, Saved, Rates and Labour as read-only lists, with a matching item count and total for every list.

### Phase 3: screens, in order (still not released to users)

Port one screen at a time, in the order it is used on site. Each gets a Maestro flow (tap through, enter, save, check totals) that runs at 320, 360 and 412 dp wide and at font scale 1.3. These replace `narrow.e2e.ts` and `sheets.e2e.ts`: nothing may run past the edge, and no amount may be cut off.

1. **Purchases:** the list, the Add sheet (photo, gallery, voice, typed text, add manually), queued readings, `LineEditor`, delivered, Save list, Clear, Undo.
2. **BOQ:** the same, plus the order slip.
3. **Saved:** open, edit, delivered, bill photos, Delete (from the Edit sheet).
4. **Vendor quotes:** quote received, review matches, compare, confirm.
5. **Rates:** search, filters, price history chart, bulk edit, Leave out of Rates, learned names.
6. **Labour:** contracts, entries, advances, retention, statement.
7. **Site report** and every share option: PDF, Excel and JPG, previewed first, then the share sheet.
8. **Settings:**
   - Gemini key (Test key) and how bills are read
   - Appearance
   - Save backup / Restore
   - Report a problem / Share log
   - What's new, On this phone.
9. **Projects sheet**, onboarding, the backup reminder, sharing photos and text into the app from WhatsApp.

**Parity checklist:** every bullet of *How it works* in the README gets a row in this file's *Parity checklist* (below), ticked only when it works on a phone, in light and dark mode.

**Exports must match.** For the same data, the PDF and Excel files from the Next app must contain the same rows and totals as the old app's. A core test compares the generated table data. The PDFs themselves are compared by eye once per document type.

### Phase 4: beta on real data (side by side, 3 weeks)

- Publish "Nirman Next" APKs to a separate `next` GitHub release, never to `latest`.
- The owner (and anyone chosen) uses Next for real daily work. Each week, the old app's backup is restored into Next and the totals are compared.
- **Backup round trip in CI:**
  - `packages/core` has golden backup files made by 6.x.
  - The test restores each one, makes a new backup and restores that again.
  - It checks every table, row and photo survives, with no difference.
  - The Next app's own backup must also restore in the old app (same core, so this is a check, not new code).
- **Upgrade test in CI** (the most important test of the whole move), on an emulator:
  1. Install the last published 6.x build (a debug-signed pair, so data can be put in).
  2. Enter or load data, set a key and preferences.
  3. Install the new app built **with the real app id** over it.
  4. Check every count, the key, the preferences and a queued reading.

  Run it for Android 8, 10, 13 and 16. It runs on every PR to `apps/native` from now until the old app is removed.
- **Done when:** 3 weeks of daily use with no data problem, the parity checklist is complete, and the upgrade test passes on all four Android versions.

### Phase 5: the switch (MAJOR: 7.0)

- **Build:** the React Native app with app id `com.nirmaan.auditor`, the same signing and lineage step in CI, and `versionCode` = run number, so it is higher than every 6.x build.
- **First launch** runs in this order, with a progress screen. Each step is logged in diagnostics.
  1. Find the database file at the recorded path. Not found and there are no other app files: a genuinely new install, so start fresh. Not found but there are other app files: stop and show *Restore from backup*.
  2. If there's room (free space at least 2× the file), copy the file to `nirmaan-before-7.db`. Otherwise ask the user to save a backup before continuing.
  3. Open it and run `PRAGMA integrity_check`. Run any pending migrations from `packages/core` (the same list the old app uses).
  4. Copy the Gemini settings from the old secure storage into the new one. Verify by reading them back. Delete the old entry only after a later launch has read the new one successfully.
  5. Load `app_prefs` into the new preferences.
  6. Check the counts against the 6.1 record. If something is missing, stop and show *Restore from backup*.
- **Release:**
  - CHANGELOG `## 7.0 — A real Android app`, listing what changed for users (the native controls below).
  - Publish to `latest`. Keep the last 6.x APK as a version release.
- Delete `nirmaan-before-7.db` two releases later, or once 7.x has had 4 weeks with no data problem.

### Phase 6: after the switch

1. **Remove** `apps/mobile` once 7.x has run 6 weeks without a serious bug. Update CLAUDE.md (the UI rules become React Native rules; e2e becomes Maestro), the README and CI.
2. **Sync groundwork** (MINOR): `deleted_at`, `device_id` and a `sync_log` table on every table; the latest edit wins, per row; photos stored by hash.
3. **Raspberry Pi server:**
   - Node, using `packages/core`, behind Tailscale or a Cloudflare Tunnel.
   - A token per device; `POST /sync/push` and `GET /sync/pull?since=`.
   - A nightly backup of the Pi's database.
   - The Gemini key never goes on the Pi.
4. **Web version:** React Native Web (via Expo), served from the Pi, with logins. It talks to the Pi's data rather than keeping its own.
5. **iOS:** Expo's cloud builds; Apple Vision or ML Kit for reading.

## Rolling back

Android won't install a lower `versionCode` over a higher one. So rolling back means building the old app again **with a new run number**:

- CI keeps a manual workflow, *Build 6.x fallback*. It builds `apps/mobile` from the current `main`, against the same `packages/core`, and can publish it to `latest`.
- Because both apps share the core (rule 3), the fallback knows every migration the new app may have run, and opens the same file in place.
- The secure-storage copy keeps the old entry until the new one is confirmed (Phase 5, step 4), so the key is still there after a rollback.
- Preferences changed in 7.x and the diagnostics log since the switch may be lost in a rollback. The data is not.

Roll back if any user loses data, the app won't start, or reading bills stops working and can't be fixed within a day.

## Native controls in the new app

What changes for users, screen by screen. These are improvements, not new features, unless marked **new**. Every item still follows the UI rules in CLAUDE.md: fits 320 px, touch targets at least 40 dp, sentence case, the words list, delete never silent.

| Today (web) | In the new app (Android's own) | Why it's better on site |
|---|---|---|
| Hand-drawn bottom tab bar | Native bottom navigation bar (`react-native-bottom-tabs`: Material 3 on Android, `UITabBar` on iOS) | Proper ripple and press feedback, correct gesture-bar spacing, no layout jumps |
| `Sheet` drawn in HTML with JS animation | Native bottom sheets (`react-native-true-sheet`: Android's `BottomSheetDialog`) for choices and short forms; native full screens (native stack) for `kind="screen"`; Material `AlertDialog` for `kind="dialog"` | Drag to expand or close, real Back and predictive Back, the keyboard pushes the sheet up correctly |
| JS back handling (`useBackHandler`) | System back and **predictive back** (Android 14+), from the native stack | Swipe-back previews the screen behind, as in every other Android app |
| `confirm` / `alert` drawn in HTML | Material `AlertDialog` (React Native `Alert`); `prompt` stays a small sheet because Android has no native prompt | Looks and sounds like the phone, large buttons |
| Toasts and Undo buttons | Material **Snackbar** with an *Undo* action for every `…Later` delete | The standard Android undo pattern, above the tab bar |
| Web date fields and dropdowns (`<input type="date">`, `<select>`) | Material date picker (`@react-native-community/datetimepicker`); native menus (`@react-native-menu/menu`: `PopupMenu`/`UIMenu`) for pick-one lists that don't fit `Tabs` | Big calendar, no tiny web dropdowns |
| Header Save / Preview / Share / Clear icons | Native top app bar: one main action plus an **overflow menu** (⋮) for the rest | Fits 320 px without shrinking to icon-only buttons |
| Search fields | Native search bar in the header (native stack's `headerSearchBarOptions`) | Familiar, keeps the search when going back |
| Number fields | Native `TextInput` with `keyboardType="decimal-pad"` for quantity, rate and amount; `returnKeyType="next"` moving between fields; `react-native-keyboard-controller` so fields are never hidden | Number keyboard straight away, no typing in letters, quicker entry with gloves |
| Long lists with JS scrolling | `FlashList` (only visible rows drawn) with Android's own scroll and overscroll stretch | Smooth on cheap phones with thousands of rates |
| Photo with camera plugin | **ML Kit Document Scanner** (`react-native-document-scanner-plugin`: Android's Google document scanner, VisionKit on iOS): finds the bill's edges, straightens and crops it | Bills read better, cleaner photos in Saved |
| Gallery picker | Android **Photo Picker** (`expo-image-picker`), no storage permission | No permission prompt, the system's own picker |
| Voice input | Android `SpeechRecognizer` (`expo-speech-recognition`), Hindi and English, on-device where the phone supports it | Works offline on many phones |
| PDF preview with pdf.js | Android `PdfRenderer` (`react-native-pdf`) in `DocumentPreview` | Quicker, sharp zoom, less memory |
| Sharing | Native share sheet (`expo-sharing`), with the file named as today | Same as now, without the WebView file hops |
| Offline queue only runs with the app open | **WorkManager** (`expo-background-task`) reads queued entries when the phone is back online, even with the app closed; a notification says "3 bills read" (**new**, needs the notification permission, asked the first time something is queued) | Bills are ready when you open the app |
| Haptics through a Capacitor plugin | `performHapticFeedback` called directly (as `HapticsPlugin.java` does now) on every button, tab and Snackbar | Same feel, no bridge delay |
| Inter everywhere | System font (Roboto on Android) for text; JetBrains Mono kept for amounts, rates and quantities | Matches the rest of the phone, reads better in sunlight |
| Splash screen | Android 12+ splash API (`expo-splash-screen`) | No white flash on start |
| Edge to edge with `--inset-*` CSS variables | `react-native-safe-area-context` insets, which are always correct (no old-WebView `env()` issue) | One less source of layout bugs |
| Dark mode setting | Kept: *Light / Dark / Same as phone*, using native `Appearance` | Follows the phone at night |
| — | **App shortcuts** (**new**): long-press the icon for *Photograph a bill*, *Add purchase*, *Open BOQ* | One tap from the home screen to the camera |

Not planned: swipe-to-delete on rows (CLAUDE.md: deleting from the edit view only, because bins on rows were tapped by mistake), and Material You wallpaper colours (orange stays the brand).

Charts (price history in Rates): `recharts` becomes `victory-native` (drawn natively with Skia), keeping the same colours.

## Risks and checks

| Risk | Check |
|---|---|
| The database file name or location differs from what we think | 6.1 records the path on real installs; the upgrade test uses a real 6.x build |
| The old secure-storage format can't be read | Native reader tested in the upgrade test; fallback: ask for the key, with a clear message, data untouched |
| A library assumes a browser (`Blob`, `TextDecoder`, `crypto`) | Phase 0 runs the core in plain Node; add polyfills only where a test proves a need |
| Gemini streaming in React Native | `gemini.ts` uses plain requests (no streaming); keep it that way or use `expo/fetch` |
| Large databases (photos stored as base64 in SQLite) | Free-space check before the safety copy; Phase 4 tests with the owner's real backup |
| PDFs look different | Same jsPDF code in the core; checked by eye per document type in Phase 3 |
| Users install the new APK without 6.1 | The new app copes without `app_prefs` (see *What has to carry over*); 7.0 is published only after 6.1 has been `latest` for 2 weeks |
| Something unknown after release | Fallback build ready (see *Rolling back*); diagnostics log each first-launch step, and users can send it with *Report a problem* |

## Parity checklist

Tick each item when it works on a real phone, in light and dark mode, at 360 dp.

- [ ] Projects: pick, add, rename, close, move a list
- [ ] Purchases: photo, gallery, voice, typed text, add manually; queued offline and read later
- [ ] Phone-first reading, *How bills are read* setting, Gemini fallback
- [ ] Learned names and units applied to new readings
- [ ] Edit a line (`LineEditor`), delete with Undo, delivered tick
- [ ] Save list, Clear, open a saved list and edit it in place
- [ ] BOQ, order slip
- [ ] Vendor quote received: read, match, review, confirm; compare with lowest marked; compared with last price
- [ ] Rates: search, filters, history, bulk edit, Leave out of Rates, hidden materials
- [ ] Labour: contracts, entries, payments, advances, retention, statement
- [ ] Site report: dates, work types, delivered only
- [ ] Share as PDF, Excel and JPG, with preview, for every document
- [ ] Share into the app from WhatsApp: photos and text, to Purchases, BOQ or a quote
- [ ] Bill photos on lines and saved lists
- [ ] Save backup (zip with photos), Restore (zip and old json), backup reminder
- [ ] Gemini key: paste, Test key, change
- [ ] Appearance: light, dark, same as phone
- [ ] Report a problem, Share log, What's new, On this phone (version)
- [ ] Training data opt-in and export
