# Moving Nirman to React Native

Status: agreed October 2026. Phase 3 next.

The Capacitor app is replaced by a React Native (Expo) app using Android's own controls. There is no beta app beside the old one: the new app is built over the next few sessions, and the update that switches is a normal update to the same app. Phases are sized so that each one fits in **one Claude session and one PR**.

## Rules

1. **Same app, updated in place.** App id `com.nirmaan.auditor`, the same release key and rotation lineage (CI's `apksigner` step), `versionCode` = CI run number.
2. **Same database file, opened where it is.** Same schema and migrations, from `packages/core`. Nothing to export or import.
3. **Never start empty silently.** If the existing data can't be opened or checked on first launch, say so and offer *Restore from backup*.
4. **Same backup file.** Backups from either app restore in the other.
5. **Feature freeze on `apps/mobile`** from Phase 2 until the switch: fixes only, so nothing is built twice.
6. **Keep `apps/mobile` buildable** until 7.x has run 6 weeks. It is the fallback (see *Rolling back*).

## What carries over, and what doesn't

| What | Today | In 7.0 |
|---|---|---|
| All data, including queued readings and bill photos | SQLite `/data/data/com.nirmaan.auditor/databases/nirmaanSQLite.db` (`@capacitor-community/sqlite` adds `SQLite.db` to the name and uses `getDatabasePath`; no encryption) | Opened in place |
| Gemini key and reading settings | Capacitor secure storage | **Pasted again once.** A first-launch screen says "Paste your Gemini key again (needed once after this update)". Data works without it |
| Small preferences (open project, sort, work types, What's new seen, backup snooze) and the problem log | WebView `localStorage`, which the new app can't read | **Not carried over.** Defaults: open the most recently changed project; skip onboarding if there is any data |

Losing the preferences and asking for the key once saves a whole preparation release. No data is lost.

## How to keep each phase cheap (for Claude sessions)

- **Start each phase in a fresh session** (`/clear`). Give it only: "Do Phase N of docs/react-native-plan.md".
- **Read only the files the phase lists.** Read each old screen **once** and write the new one from it. Don't re-read to check; tests and the type checker do that.
- **Mechanical work goes through the shell:** `git mv` plus `sed` for moves and import paths, never reading and rewriting by hand.
- **Run lint, tests and type checks locally once at the end, push once.** CI round trips are the most expensive part.
- **No new features during the move.** Extras (marked *later*) are separate small releases after the switch.
- **Keep this file and CLAUDE.md short:** they are read every session. Tick phases off here; don't add history.
- **Screen ports (Phases 3–6) are translation work** and can run on a cheaper model (Sonnet).

## Phases

### Phase 1: shared core (patch release; users see no change)

1. `git mv` into `packages/core/src`:
   - `apps/mobile/src/data/*`, `jobs/worker.ts`
   - from `lib/`: `gemini.ts`, `diagnostics.ts`, `settings.ts`, `conversionSettings.ts`, `backupReminder.ts`, `whatsNew.ts`, `materialSort.ts`, `workType.ts`, `exports.ts`, `pdf.ts`
   - their tests.
2. Fix imports with `sed`. Export everything from `packages/core/src/index.ts`.
3. Only the files that touch the browser or Capacitor get an injected adapter:
   - `sql.ts`: keep the `Db` interface; the drivers move back to the app.
   - `settings.ts`, `diagnostics.ts`, `prefs.ts`: a `KeyValueStore`.
   - `newId`: `randomUUID`.
   - Find the rest with `grep -n "localStorage\|document\.\|window\.\|Capacitor\|@capacitor"` on the moved files.
4. Update the paths in CLAUDE.md (`schema.ts`, `backup.ts`, `diagnostics.ts`).

**Done when:** all tests pass, and `packages/core` has no `@capacitor` import and no DOM use.

### Phase 2: React Native app skeleton (not released; the feature freeze starts)

1. Create `apps/native`: Expo (development build, prebuild), New Architecture, Hermes, TypeScript, app id `com.nirmaan.auditor`.
2. **Database driver:** `expo-sqlite` behind `Db`, opening the Capacitor file by full path.
   - Confirm the file name from `@capacitor-community/sqlite`'s Android source in `node_modules` (grep `getDatabasePath`), not on a phone.
   - Write the result into the table above.
3. **Native modules:** copy `TextReaderPlugin.java`, `SharedFilesPlugin.java` and `HapticsPlugin.java` into one local Expo module (Kotlin or Java). Same logic, only the plugin wrapper changes. Copy the intent filters from `AndroidManifest.xml` with a config plugin.
4. **Theme:** light and dark colours copied from `index.css` into `theme.ts`.
5. **Navigation:** React Navigation native stack plus native bottom tabs (`react-native-bottom-tabs`), with the five tabs.
6. **CI:** a `native` job builds and signs the APK (same signing step) and uploads it as an artifact. It does not publish yet.
7. **CLAUDE.md:** add a short *React Native UI* section listing the components below and which rules still apply. Keep it under 20 lines.

**Done when:** the APK installs, and each tab opens with the shared UI pieces and an empty list.

### Phase 3: shared UI pieces and Purchases

1. **Shared UI pieces**, with the same names and props as `components/ui`:

   | Piece | Built on |
   |---|---|
   | `Sheet` | `react-native-true-sheet` (Android's own bottom sheet); `kind="screen"` uses the native stack |
   | `Button`, `Tabs`, `EmptyState`, `SuggestInput` | React Native |
   | `useDialogs()` | `confirm`/`alert` use Android's own dialog (`Alert`); `prompt` is a small sheet; `toast` and Undo are a Snackbar |

2. **Purchases:**
   - The list, using `FlashList`.
   - The header with the total and an overflow (⋮) menu.
   - The Add sheet (camera, gallery via the Photo Picker, voice with `expo-speech-recognition`, typed text, add manually).
   - Queued readings, `LineEditor` (number keyboard, Android's own date picker), delivered, Save list, Clear, Undo.
3. Read: `App.tsx`, `features/CapturePanel.tsx`, `features/ManualEntry.tsx`, `components/LineEditor.tsx`, `components/SaveModal.tsx`, `components/ui/*`.

### Phase 4: BOQ, Saved, Projects

- BOQ (the Purchases screen with `kind="boq"`), the order slip, Saved (open, edit, delivered, bill photos, delete from Edit), the Projects sheet.
- Read: `features/HistoryView.tsx`, `features/ProjectsSheet.tsx`, `features/DeliveriesSheet.tsx`, `components/OrderSlipSheet.tsx`, `components/BillPhotos.tsx`.

### Phase 5: vendor quotes and Rates

- Quotes (read, review, compare, confirm).
- Rates: search in the header, filters, the price chart with `victory-native`, bulk edit, Leave out of Rates, learned names.
- Read: `features/Quote*.tsx`, `features/QuotesView.tsx`, `features/DatabaseView.tsx`, `features/ItemLog.tsx`, `components/MaterialFilters.tsx`, `components/PriceBadges.tsx`.

### Phase 6: Labour, site report, sharing

- Labour (contracts, entries, advances, retention, statement), the site report.
- `DocumentPreview` with `react-native-pdf`, sharing PDF, Excel and JPG with `expo-sharing`.
- PDF and Excel are made by the same core code as today.
- Read: `features/LabourView.tsx`, `features/ContractSheet.tsx`, `components/ContractForm.tsx`, `features/StatementSheet.tsx`, `features/SiteReport.tsx`, `components/ShareSheet.tsx`, `components/DocumentPreview.tsx`.

### Phase 7: Settings, first launch, the switch (MAJOR: 7.0)

1. **Settings:** Gemini key and Test key, how bills are read, Appearance (light, dark, same as phone), Save backup / Restore, Report a problem / Share log, What's new, On this phone, training data.
2. **Share into the app** from WhatsApp.
3. **First launch:**
   1. Find the database at the path from Phase 2. Not found but other app files exist: stop and offer *Restore from backup*.
   2. Copy it to `nirmaan-before-7.db` if free space is at least 2× its size; otherwise ask for a backup first.
   3. `PRAGMA integrity_check`, then the migrations.
   4. Show the key screen.
4. **One upgrade test in CI:**
   1. Install the last 6.x APK on an emulator and restore a sample backup into it.
   2. Install 7.0 over it.
   3. Check the list counts and totals (Maestro, one flow).
5. **Before publishing**, the owner installs the CI artifact over 6.x on their own phone and checks their data. This is the only manual step.
6. **Release:**
   - CHANGELOG `## 7.0 — A real Android app`.
   - `apps/native/package.json` becomes the version source: update CI and `whatsNew.test.ts`.
   - Publish to `latest`.
   - Add a manual CI workflow *Build 6.x fallback* (see *Rolling back*).
7. Read: `components/SettingsModal.tsx`, `components/ShareTargetSheet.tsx`, `components/WhatsNewModal.tsx`, `.github/workflows/ci.yml`.

### Phase 8: clean up (after 7.x has run 6 weeks)

- Delete `apps/mobile`, the fallback workflow and `nirmaan-before-7.db`.
- Replace the web UI rules in CLAUDE.md with the React Native ones.
- Update the README.

### Later (separate releases, each a MINOR)

- Reading queued bills in the background, with a notification (WorkManager).
- Google's document scanner for bill photos.
- App shortcuts on the launcher icon.
- Sync groundwork and the Raspberry Pi server.
- Web version (React Native Web, served from the Pi).
- iOS.

## Rolling back

Android won't install an older `versionCode`, so the fallback workflow builds `apps/mobile` from current `main` with a new run number and publishes it to `latest`. It uses the same `packages/core`, so it knows every migration and opens the same file. The Gemini key would have to be pasted again.

Roll back if anyone loses data, the app won't start, or reading bills breaks and can't be fixed within a day.

## Native controls this brings

None of these cost extra work: they come with the libraries the new screens are built on.

- Native bottom bar and screen transitions.
- System back, including the predictive back preview on Android 14+.
- Draggable bottom sheets.
- Android's own confirm dialogs.
- A Snackbar with Undo.
- Android's date picker and pop-up menus.
- An overflow (⋮) menu in the header, so it fits at 320 px.
- A number keyboard for quantities and rates.
- A search bar in the header.
- Smooth long lists.
- The Photo Picker, with no permission prompt.
- Android's own PDF preview.
- System font for text, JetBrains Mono for amounts.

Still not planned: swipe-to-delete (CLAUDE.md: delete from the edit view only) and wallpaper colours (orange stays).

## Progress

- [x] Phase 1: shared core
- [x] Phase 2: skeleton
- [x] Phase 3: UI pieces and Purchases
- [x] Phase 4: BOQ, Saved, Projects
- [x] Phase 5: quotes and Rates
- [ ] Phase 6: Labour, site report, sharing
- [ ] Phase 7: Settings, first launch, 7.0
- [ ] Phase 8: clean up
