# Nirman workflows

How changes get from a branch to people's phones, and the routine jobs around that. **Update this file in the same PR whenever a workflow changes**: anything in `.github/` (workflows, `actions/`, `scripts/`), the release or version steps, signing, or how bugs come in.

## Overview

1. **Branch → PR.** CI runs on every pull request: tests, both app builds, the upgrade test.
2. **Merge to `main`.** CI runs again and, if everything passes, publishes the APK as the `latest` release.
3. **Users download** the APK from the stable link (README). It installs over the previous version and keeps their data.
4. **Problems come back** through *Settings → Report a problem* (a GitHub issue labelled `bug`, with the on-phone log).

## CI (`.github/workflows/ci.yml`)

Runs on every push to `main`, every pull request, and by hand (*Run workflow*).

| Job | What it does | Needs |
|---|---|---|
| `test` | `npm ci`, `npm run lint`, `npm test`, then builds the old app and runs its layout checks at 320–412 px (Playwright) | — |
| `android` | Builds and signs the old Capacitor app (`apps/mobile`, 6.x). Not published: it keeps the fallback buildable and is installed first in the upgrade test | — |
| `native` | Builds and signs the app that ships (`apps/native`) for arm64 (64-bit phones). This is the published APK. To support older 32-bit phones, add `armeabi-v7a` to `architectures` | — |
| `native-test` | The same app built for x86_64, to run on CI's emulator | — |
| `upgrade` | On an Android 14 emulator: installs 6.x with sample data (`apps/native/e2e/sample-backup.json`, turned into a 6.x database by `make-6x-db.ts`), installs 7.x over it, and checks lists and totals with Maestro (`apps/native/e2e/upgrade.yaml`). On failure it uploads a screenshot, the phone's log and Maestro's output as `upgrade-failure` | `android`, `native-test` |
| `publish` | Only on `main`: publishes the `native` APK (see *Releases*) | `test`, `native`, `upgrade` |

Nothing is published unless the tests, the build and the upgrade test all pass.

**Shared pieces:**
- `.github/actions/build-native`: prebuild (`expo prebuild`), Gradle release build, signing and upload for `apps/native`.
  - It is used by `native` and `native-test`.
  - It caches Gradle and the compiled C++ (`ccache`, one cache per CPU type), so a run only recompiles what changed.
- `.github/scripts/app-version.sh` sets the version (see *Versions*).
- `.github/scripts/sign-apk.sh`:
  - Signs with the release key and the rotation lineage from the old debug key, so every build installs as an update.
  - Without the key secrets, it falls back to the debug key with a warning.
  - **Fails the build if the APK contains anything that looks like a Google API key.**
- `.github/scripts/upgrade-test.sh` is the emulator script of the `upgrade` job.
- `.github/scripts/publish.sh` publishes the releases.

## Versions

- **MAJOR.MINOR** is set by hand in `apps/native/package.json`. Deciding the size is covered in [Code guideline](Code%20guideline.md#versions).
- **PATCH** is counted by `app-version.sh`: the number of commits since MAJOR.MINOR last changed.
- **Android's `versionCode`** is the CI run number, so every build is newer than the last.

## Releases

`publish.sh`, run by the `publish` job:
1. Moves the `latest` tag and adds `v<version>`.
2. Writes the release notes: the newest CHANGELOG section (the same text as the in-app *What's new*), the version, the commit, the date in IST and the latest change's title.
3. Uploads the APK as `nirman.apk` to the `latest` release. The README's download link points there and never changes.
4. Uploads the same APK as `nirman-<version>.apk` to a `v<version>` release, and keeps the 5 newest version releases. Older releases are deleted; their tags stay.

**Making a feature release:**
1. Bump the minor number in `apps/native/package.json`.
2. Add `## 7.1 — <title>` at the top of `CHANGELOG.md`, written for site supervisors.
3. Merge. The CHANGELOG test fails if the version and the newest section don't match.

**A fix** needs nothing extra: merging publishes it as the next patch.

## Rolling back (`.github/workflows/fallback.yml`)

*Build 6.x fallback*, run by hand only (*Actions → Build 6.x fallback → Run workflow*). Use it if 7.x loses data, won't start, or reading bills breaks and can't be fixed within a day.

What it does:
- Builds the old Capacitor app from current `main`.
- Gives it a `versionCode` one above CI's newest run, so phones accept it as an update.
- Publishes it as `latest`, with the version `<version>-fallback.<run>` and a note at the top of the release.
- It uses the same `packages/core`, so it opens the same database with every migration.
- Users keep their data but paste the Gemini key again.

Once 7.x is fixed, merging the fix publishes a newer 7.x as usual. Delete this workflow in Phase 8 of [react-native-plan.md](react-native-plan.md).

**For one user,** an older APK can be installed by hand from a `v<version>` release: *Save backup*, uninstall, install, *Restore*.

## Secrets

| Secret | Used by | What |
|---|---|---|
| `RELEASE_KEYSTORE_BASE64` | `sign-apk.sh` (all builds) | The release signing key (p12, base64). It must stay the same forever: a different key means phones refuse the update |
| `RELEASE_KEYSTORE_PASSWORD` | `sign-apk.sh` | Its password |

The Gemini API key is never a secret here; each user enters their own on the phone.

## Bugs from users

1. The user taps *Settings → Report a problem*. This opens a pre-filled GitHub issue labelled `bug`, with the on-phone log.
2. Read the log in the issue: the steps carry what was done, without photos or the key.
3. Fix on a branch, with a test that reproduces it where possible, then follow the overview above.

## Working on a change (developers and Claude)

1. Branch from the latest `main`.
2. Read the guideline for what you're changing ([Code](Code%20guideline.md), [UI](UI%20guideline.md), [UX](UX%20guideline.md)).
3. Before pushing:
   - `npm run lint`, `npm test`, `npm run build`
   - after changing `apps/native`: `npx expo export --platform android` in `apps/native`.
4. Open a PR and wait for CI. If the `upgrade` job fails, download `upgrade-failure` from the run.
5. Merge to `main`. The release follows automatically.
