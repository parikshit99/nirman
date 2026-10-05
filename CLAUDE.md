# Nirman: notes for contributors (and Claude)

Android app (Capacitor + React) for tracking construction purchases, BOQs and vendor quotes. See README.md for the layout and docs/data-format.md for the data. Run `npm run lint`, `npm test` and `npm run build` before every push.

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
- The app must work at 320–360 px wide without sideways scrolling.

## Diagnostics

- `apps/mobile/src/lib/diagnostics.ts` keeps the on-phone log. Steps carry what they worked on (action arguments, AI input text and output lines, so item names, rates, vendors and addresses may appear) to help reproduce bugs; the owner allowed this, and the repo is private. Never log photos (`describe()` replaces encoded data with a size) or the API key (`scrub()` removes it).
- Users send it with *Settings → Report a problem* (a pre-filled GitHub issue labelled `bug`) or *Share log*. Read those issues' logs when debugging.
- Automatic crash reports go to Sentry when the `SENTRY_DSN` repository variable is set (Settings → Secrets and variables → Actions → Variables); without it they are off.
