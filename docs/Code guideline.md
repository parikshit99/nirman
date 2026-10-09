# Code guideline

How to change Nirman's code without breaking anyone's data. For screens, also read [UI guideline](UI%20guideline.md) and [UX guideline](UX%20guideline.md).

## Layout

| Folder | What | Status |
|---|---|---|
| `apps/native` | The app (React Native, Expo) | Since 7.0; the Capacitor app (`apps/mobile`) was removed in 7.x |
| `packages/core` | Database schema, migrations, repository, backup, Gemini, the queue worker, PDF and Excel, diagnostics | Shared with sync and the web version later |
| `packages/shared` | Types, validation, the Gemini prompt and parsing, price, quote and labour rules | Shared with sync and the web version later |

Where new code goes:
- **Rules and data** (anything a test can check without a screen) go in `packages/core` or `packages/shared`, never in an app. Sync and the web version will use them too.
- **Screens** go in `apps/native/src/features/`, parts used by several screens in `src/components/`, and the shared UI pieces in `src/components/ui/`.
- **Android code** goes in the local Expo module `apps/native/modules/nirman-native` (Kotlin). Never edit `apps/native/android/`: prebuild generates it and it isn't committed. The module has `readText` (ML Kit), `haptic`, `takeShared` and the `shared` event (WhatsApp shares), `databasePath` and the first-launch file helpers (`databaseInfo`, `copyDatabase`, `setDatabaseAside`, `deleteDatabase`), `renderPdf` (PDF pages as JPG) and `shareFiles`.
- **Data** in `apps/native` opens the database through `src/data/db.ts` (the 6.x file, in place); everything else comes from `@nirman/core`.

## Before every push

1. `npm run lint`: type-checks every package, including `apps/native`.
2. `npm test`: unit tests for core and shared (including that the version and the newest CHANGELOG section match).
3. `npm run build`: bundles the app (`expo export --platform android`) without the Android SDK; catches import and Metro errors.

Push once everything passes. CI then builds and signs the APK (the `native` job) and publishes it from `main`. There is no test on a device since the 6.x upgrade test went with `apps/mobile`: check screens on a phone or emulator (UI guideline).

## Versions

Versions are `MAJOR.MINOR.PATCH`. MAJOR.MINOR is set by hand in `apps/native/package.json`. CI counts PATCH as the number of commits on `main` since that was last changed (7.0.0, 7.0.1 … back to .0 at the next bump). Decide the size of every change before merging it:

| Change | Examples | What to do |
|---|---|---|
| **Fix / small update** → PATCH, automatic | bug fix, wording, layout or colour tweak, faster code, a small improvement to an existing screen, CI or docs | Nothing: don't touch the version or CHANGELOG.md. |
| **New feature** → MINOR (7.0 → 7.1) | a new button, screen, report, calculator, share option or setting; a new kind of data saved (a database migration) | Bump the minor number in `apps/native/package.json` (patch stays 0) and add a `## 7.1 — <title>` section at the top of CHANGELOG.md. It becomes the release notes and the in-app *What's new* screen. |
| **Major release** → MAJOR (7.x → 8.0) | a redesign or new main tab; several features released together; a change in how the app is used every day; anything that needs a reinstall or makes old backups unreadable | Bump the major number (8.0.0) and add a `## 8.0 — <title>` section listing everything since the previous major. |

When unsure between two sizes, pick the smaller one. A test (`packages/core/test/changelog.test.ts`) fails if the version and the newest CHANGELOG section don't match.

## Keeping users' data safe

These rules protect installed phones. Breaking one can lose someone's work.

- **Keep the internal ids unchanged:** app id `com.nirmaan.auditor`, the `nirmaan` database names, the database file `databases/nirmaanSQLite.db`, backup `APP_ID`, the release signing key and its rotation lineage in CI. Changing any of them makes the update a separate app, or leaves the data behind.
- **Database changes:**
  - Append a migration to `MIGRATIONS` in `packages/core/src/data/schema.ts`. Never edit a shipped one.
  - Bump the backup `VERSION` in `backup.ts`, keeping older versions readable.
  - Update [data-format.md](data-format.md).
  - A migration is a MINOR release.
- **Never start empty silently.** If data can't be opened or checked, show *Restore from backup* (`features/StartProblem.tsx`). Never create a new database over a problem.
- **Backups** from any version must keep restoring. Add a sample file to the tests when the format changes.
- **Going back to an older version** needs a backup, uninstall, install of the older APK and restore (README). The 6.x fallback build was removed with `apps/mobile`.
- **First launch over 6.x** (`apps/native/src/data/startup.ts`) stays for phones that update late: it opens 6.x's database in place and keeps a copy (`nirmaan-before-7.db`) for 6 weeks.

## Security and privacy

- Never put the Gemini API key in the app, the repo, logs, Supabase or the web version. The Supabase `service_role` key never goes in the app, the web version or the repo either. CI fails the build if the APK contains anything that looks like a Google API key (`.github/scripts/sign-apk.sh`).
- The key is kept in the phone's secure storage and sent only to Google.
- Photos and notes leave the phone only for the Gemini request, a backup the user shares, or (later) sync to the team's Supabase project.

## Diagnostics

- `packages/core/src/lib/diagnostics.ts` keeps the on-phone log.
- **What a step may carry:** what it worked on (action arguments, AI input text and output lines, so item names, rates, vendors and addresses may appear), to help reproduce bugs. The owner allowed this, and the repo is private.
- **What it must never carry:**
  - Photos. `describe()` replaces encoded data with a size.
  - The API key. `scrub()` removes it.
- **How it reaches us:** users send it with *Settings → Report a problem* (a pre-filled GitHub issue labelled `bug`) or *Share log*. Read those issues' logs when debugging. There are no automatic crash reports.

## Coding conventions

- **TypeScript, strict.** Format new code like the existing code: Prettier, `--print-width 180 --single-quote`. Don't reformat lines you didn't change.
- **Match the surrounding code:** naming, comment density, idioms. Comments say *why*, in plain sentences.
- **`packages/core` has no browser, Capacitor or React Native code.** Its type check has no DOM. The app hands it storage and device details with `configureCore` (`apps/native/src/lib/coreSetup.ts`).
- **React in `apps/native`** is pinned to the version Expo asks for. `metro.config.js` makes every package use that copy. Upgrade Expo with `npx expo install --fix`, never by hand-editing versions.
- **Times shown to the user are in IST.** When talking to the owner (CI runs, schedules), Claude also gives times in IST.
- **Tests:** a new rule or repository function gets a unit test in its package. A new screen or flow that could lose data is checked by hand on a phone before merging (there is no device test in CI).
- **Dependencies:** prefer one that already exists in the repo. For Android features, prefer an Expo or well-kept React Native library to native code; when native code is needed, add it to `modules/nirman-native`.

## Working with Claude sessions (keeping token use low)

- One task per session. Start the next with `/clear`.
- Read only the files the task needs. Don't re-read a file to check an edit: the type checker and tests do that.
- Move and rename files with `git mv` and fix imports with `sed`, rather than reading and rewriting them.
- Run lint, tests and the bundle check locally once, then push once. CI round trips cost the most.
- Keep CLAUDE.md and these guidelines short: they are read every session. Record decisions here, not their history.
- Translation-like work (porting a screen, renaming) can run on a cheaper model.

## Git and pull requests

- One topic per PR, titled like the existing ones ("Nirman 7.1: …" for a release, "CI: …" or "Fix: …" otherwise).
- **Features:** the CHANGELOG section is written for site supervisors (see the words list in the UX guideline), not for developers.
- **The README** describes the app as it is. Update it in the same PR as the change.
