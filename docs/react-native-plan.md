# Moving Nirman to React Native

Status: agreed October 2026. 7.0 (Phase 7) done; Phase 8 done early, on the owner's call (October 2026), a day after 7.0. Next: the sync phases.

The Capacitor app is replaced by a React Native (Expo) app using Android's own controls. There is no beta app beside the old one: the new app is built over the next few sessions, and the update that switches is a normal update to the same app. Phases are sized so that each one fits in **one Claude session and one PR**.

## Rules

1. **Same app, updated in place.** App id `com.nirmaan.auditor`, the same release key and rotation lineage (CI's `apksigner` step), `versionCode` = CI run number.
2. **Same database file, opened where it is.** Same schema and migrations, from `packages/core`. Nothing to export or import.
3. **Never start empty silently.** If the existing data can't be opened or checked on first launch, say so and offer *Restore from backup*.
4. **Same backup file.** Backups from either app restore in the other.
5. **Feature freeze on `apps/mobile`** from Phase 2 until the switch: fixes only, so nothing is built twice.
6. **Keep `apps/mobile` buildable** until 7.x has run 6 weeks. It is the fallback (see *Rolling back*). (Ended early: Phase 8 removed it.)

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
   | `Sheet` | `react-native-true-sheet` (Android's own bottom sheet); `kind="screen"` and `"dialog"` are native modals (props-driven like the old app, so no routes to pass data through) |
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
- Rates: search in the header, filters, the price chart with `react-native-svg` (no Skia or Reanimated), bulk edit, Leave out of Rates, learned names.
- Read: `features/Quote*.tsx`, `features/QuotesView.tsx`, `features/DatabaseView.tsx`, `features/ItemLog.tsx`, `components/MaterialFilters.tsx`, `components/PriceBadges.tsx`.

### Phase 6: Labour, site report, sharing

- Labour (contracts, entries, advances, retention, statement), the site report.
- `DocumentPreview` shows the PDF's pages drawn by Android's own `PdfRenderer` (the same pages as the JPG share), sharing PDF, Excel and JPG through Android's share sheet (the native module `shareFiles`; `expo-sharing` was removed in the audit fixes, see [Audit fixes plan.md](Audit%20fixes%20plan.md)).
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
   1. Install the last 6.x APK on an emulator and restore a sample backup into it. (Done as: the `android` job's apps/mobile build of the same commit; `e2e/sample-backup.json` restored by core into its database file.)
   2. Install 7.0 over it.
   3. Check the list counts and totals (Maestro, one flow).
5. **Before publishing**, the owner installs the CI artifact over 6.x on their own phone and checks their data. This is the only manual step.
6. **Release:**
   - CHANGELOG `## 7.0 — A real Android app`.
   - `apps/native/package.json` becomes the version source: update CI and `whatsNew.test.ts`.
   - Publish to `latest`.
   - Add a manual CI workflow *Build 6.x fallback* (see *Rolling back*).
7. Read: `components/SettingsModal.tsx`, `components/ShareTargetSheet.tsx`, `components/WhatsNewModal.tsx`, `.github/workflows/ci.yml`.

### Phase 8: clean up (planned after 7.x had run 6 weeks; done early)

- Deleted `apps/mobile`, the fallback workflow, the upgrade test (`upgrade` job, `apps/native/e2e`) and the old app's CI build.
- `nirmaan-before-7.db` is deleted by the app itself 6 weeks after it was made (`forgetOldCopy` in `startup.ts`), so phones still get the 6 weeks, and one updating from 6.x later too. The first-launch code for 6.x stays.
- The old debug key (first in the signing lineage) moved to `.github/keys/debug.keystore`; the version check test to `packages/core/test/changelog.test.ts`.
- Removed the old-app notes from the guidelines and updated the README.

### Later (separate releases, each a MINOR)

- Reading queued bills in the background, with a notification (WorkManager).
- Google's document scanner for bill photos.
- App shortcuts on the launcher icon.
- Sync between phones and the web version (Supabase and GitHub Pages): see below.
- iOS.

## Sync and the web version (after 7.0, three sessions)

Several people edit the same projects: on site from their phones, in the office from a browser. Supabase holds the shared copy (a Postgres database, sign-in and photo storage); the web version is a static site on GitHub Pages that talks to Supabase directly. There is no server of our own to run or back up.

- **Phones stay offline-first.** Each phone keeps its own SQLite file, as now, and syncs with Supabase when it has a connection. A site with no signal loses nothing; changes go up later.
- **The web version is online-only.** It needs a connection, and it keeps nothing important in the browser.
- **The Gemini key stays on each phone.** It never goes into Supabase, the web version or the repo. Reading bill photos stays on the phones.
- **Free and open.** Nirman is free to use and open source, so sync must cost nothing to run and use only open-source pieces: Supabase (open source, and its free tier is enough) and our own sync code. No paid service, and nothing a user would have to pay for to keep their data in step.

**Why our own sync, not a sync service** (checked October 2026; look again before starting):
- *PowerSync* would save writing the sync code, but its hosted free plan is limited and pauses with no use, its paid plans cost money every month, and running it yourself means keeping a server going (and its server is source-available, not open source).
- *ElectricSQL* also needs its own sync server running somewhere.
- *RxDB* has Supabase sync, but its SQLite storage for React Native is a paid plugin.
- *WatermelonDB* is open source and free, but it replaces the whole data layer (`repo.ts`, the backups, the tests), which costs more than the sync code it saves.

Our own sync stays small because the app was built for it: every row has a text id made on the phone, every change goes through `repo.ts`, and `Db.onWrite` already says when something changed.

### What it costs

- **Supabase free tier** is enough to start: a 500 MB database and 1 GB of file storage. A free project is paused after a week with no use and must be resumed from the dashboard; the Pro plan (about $25 a month) removes the pause, adds daily backups and much more storage. Check the current limits before starting. Bill photos fill storage first, so they are resized before upload.
- **Supabase can also be run on your own computer or server** (it is open source), so the data never depends on Supabase's hosted service staying free; the app only needs the address and public key changed.
- **GitHub Pages** is free, as the repository is public. The site holds no data; everything behind it needs a sign-in.

### Sync 1: groundwork in the app (MINOR)

Database and core changes, plus what the app needs to use them.

- Migration (follow docs/Code guideline.md):
  - `deleted_at` on every table, so deletions sync instead of rows disappearing.
  - `updated_at` on the tables that don't have it yet, set on every change.
  - `project_id` on every row that belongs to a project (lists, items, quotes, contracts, entries, photos), so access can be checked per project.
  - A `sync_state` table: the last time each table was pulled, and which rows changed since the last push.
- Ids stay random text ids made on the phone, so two phones never make the same id.
- Bill photos are stored under a hash of their contents, so the same photo is never uploaded or stored twice.
- The repository marks rows as deleted instead of deleting them; every list query skips deleted rows. *Clear deleted* removes them for good only once they have synced.
- Bump the backup `VERSION`, keeping older backups readable.

### Sync 2: Supabase and sync on the phones (MINOR)

- **Supabase project** set up from files in the repo (`supabase/migrations/`, applied with the Supabase CLI), never by hand in the dashboard, so it can be rebuilt. The Postgres tables mirror the SQLite schema plus:
  - `server_updated_at`, set by a trigger on every write. Pulls use it rather than the phone's clock, which may be wrong.
  - `teams`, `team_members` (role: owner, editor or viewer) and `project_members`.
- **Row Level Security on every table**: a person sees and changes only rows of projects they belong to; viewers only read. This is what keeps data private, because the Supabase URL and its public (anon) key are in the app and the web version and anyone can see them. The `service_role` key bypasses these rules: it never goes in the app, the web version or the repo (only, if ever needed, in a GitHub secret).
- **Bill photos** go to a private Supabase Storage bucket under `<project>/<hash>.jpg`, with the same per-project rules.
- **Sign-in:** Supabase Auth with Google sign-in or an email link (no passwords to forget). The owner invites people by email from *Settings → Team*.
- **Sync** in `packages/core` (`sync.ts`, tested without a phone), using `@supabase/supabase-js`:
  - Push: send the rows changed since the last push (upsert), then the photos Supabase hasn't got.
  - Pull: fetch rows with `server_updated_at` after the last pull, per table, and write them into SQLite in one transaction.
  - When two people change the same row, the later save wins. Lists are made of many small rows (each line, each entry is its own row), so two people adding lines to the same list don't overwrite each other; only editing the very same line at the same time does.
  - Runs on start, after each save, when the phone comes back online, and from a *Sync now* button.
- **First sync** on a phone that already has data: upload everything once, with a progress bar. If two phones already hold different copies of the same lists (from restoring one backup on both), show it and ask which to keep; never merge silently.
- **In the app:** *Settings → Sync* to sign in, see the last sync time and anything waiting to go up. A small status in the header when changes are waiting or sync fails, in plain words ("3 changes waiting for signal").
- **Backups:** *Save backup* keeps working. Supabase Pro has daily backups; on the free tier, a weekly GitHub Actions job exports the database to a private place.

### Sync 3: web version on GitHub Pages (MINOR)

- React Native Web through Expo: `npx expo export --platform web` in `apps/native`, built and published by a CI job (`actions/deploy-pages`) on every merge to `main`.
- The site is served from `https://parikshit99.github.io/nirman/`, so Expo's `baseUrl` is `/nirman/`; `index.html` is copied to `404.html` so links to a screen open after a refresh.
- Data: the web version reads and writes Supabase directly (no SQLite copy), through the same repository functions behind a Supabase-backed `Db`-like layer, or a separate read/write module in `packages/core` if the SQL doesn't map cleanly. Decide in this session after trying one screen. (`expo-sqlite` on the web needs response headers GitHub Pages can't send, so a full local copy in the browser is not the plan.)
- Android-only pieces get a web version or are hidden: reading bill photos (hidden; use the phone), `renderPdf` (show the PDF in the browser instead), `shareFiles` (download the file), haptics (nothing).
- Live updates: the web version subscribes to Supabase Realtime for the open project, so a purchase saved on site appears in the office without a refresh.
- Layout: the wide-screen layout (tabs in the header, form on the left); it must still work on a phone browser.
- For the office: reviewing lists, comparing quotes, site reports, statements, printing.
- No secrets in the build: only the Supabase URL and anon key, which are public by design. CI checks the built site for anything that looks like a Google API key or a `service_role` key, as it does for the APK.

## Rolling back

Since Phase 8 there is no 6.x fallback. To go back to an older 7.x: *Save backup*, uninstall, install the older APK from the releases (the last 5 are kept), *Restore*. A phone that still has `nirmaan-before-7.db` (its first 6 weeks on 7.x) also has its data as it was before 7.0.

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

Still not planned: swipe-to-delete (UX guideline: delete from the edit view only) and wallpaper colours (orange stays).

## Progress

- [x] Phase 1: shared core
- [x] Phase 2: skeleton
- [x] Phase 3: UI pieces and Purchases
- [x] Phase 4: BOQ, Saved, Projects
- [x] Phase 5: quotes and Rates
- [x] Phase 6: Labour, site report, sharing
- [x] Phase 7: Settings, first launch, 7.0
- [x] Phase 8: clean up (early)
- [ ] Sync 1: groundwork
- [ ] Sync 2: Supabase and sync on the phones
- [ ] Sync 3: web version on GitHub Pages
