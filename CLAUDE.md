# Nirman: notes for contributors (and Claude)

Android app (React Native, Expo) for tracking construction purchases, BOQs, vendor quotes and labour contracts. See README.md for what it does and docs/data-format.md for the data.

**Read the guideline for what you are changing, before changing it:**
- [docs/Code guideline.md](docs/Code%20guideline.md): layout, checks before every push, versions and the CHANGELOG, keeping users' data safe (migrations, ids, backups), diagnostics, conventions.
- [docs/UI guideline.md](docs/UI%20guideline.md): the shared pieces, colour, text, layout, checking a screen.
- [docs/UX guideline.md](docs/UX%20guideline.md): the words to use, feedback, deleting, empty lists, offline behaviour.
- [docs/Nirman workflows.md](docs/Nirman%20workflows.md): CI, releases, versions, rolling back, signing, bug reports. **When a workflow changes** (anything in `.github/`, the release or version steps, signing, how bugs come in), **update this file in the same PR.**

**The move to React Native:** since 7.0 the app that ships is `apps/native`; see [docs/react-native-plan.md](docs/react-native-plan.md) (next: Phase 8, then the Raspberry Pi phases). Until Phase 8, the Capacitor app (`apps/mobile`) gets fixes only, database changes must work for both apps (they share the schema in `packages/core`), and it must stay buildable as the fallback (*Build 6.x fallback* workflow).

Rules that always apply:
- Run `npm run lint`, `npm test` and `npm run build` before every push (plus `npx expo export --platform android` in `apps/native` after changing it).
- Decide the version size of every change (Code guideline, *Versions*). Fixes need nothing; a feature bumps the minor number in `apps/native/package.json` and adds a CHANGELOG section.
- Never put the Gemini API key in the app or the repo. Never log photos or the key.
- Keep internal ids unchanged (app id, `nirmaan` database names, backup `APP_ID`, signing key), so existing installs keep their data.
- Times shown to the user are in IST. Claude: give every time in IST (UTC+5:30) when talking to the owner too (CI runs, check-ins, schedules), never only UTC.
