# Nirman

An Android app for tracking construction materials on site. You photograph bills or handwritten notes, dictate (English or Hindi) or type what was bought. Google Gemini reads it and turns it into clean line items: Hindi/Hinglish terms become standard English names and units. The app keeps:

- a **purchase log** with rates, totals and vendors;
- **Bills of Quantities** for vendor quotes, with each vendor's reply matched back to the BOQ and compared;
- **saved sessions** per site;
- a **material price database** built from everything you record.

Everything is stored **only on your phone**. There is no server or account.

**[⬇ Download the latest APK](https://github.com/parikshit99/nirman/releases/download/latest-debug/nirmaan-auditor-debug.apk)**: rebuilt automatically every time a change is merged into `main`. While this repository is private, you need to be signed in to GitHub for the link to work.

## How it works

- **Local database.** All records live in SQLite inside the app, and every screen works without internet.
- **AI reading.** Entries go straight from the phone to Google Gemini using your own API key. An entry made offline is queued and read automatically once the phone is online. Photos and notes leave the phone only for that Gemini request.
- **Learns your corrections.** If you fix an item's name or unit, the correction is remembered and used for future readings.
- **Vendor quotes.** When a vendor replies to a BOQ with their own list, tap *Vendor quote received* on the BOQ tab, or *Quotes* on a saved BOQ in History, and photograph it. The AI matches each line to the BOQ, and you review the matches, see which items are missing, and confirm. Confirmed prices are saved under the BOQ's item names, so vendors line up side by side with the lowest rate marked, and every rate is compared with the last price you recorded for that item.
- **Backup.** *Settings → Save backup* shares one `.json` file with everything; save it to Google Drive, WhatsApp or email. *Restore* on any phone brings it all back. Queued, unread entries are not included.

## Using the app

1. [Download the latest APK](https://github.com/parikshit99/nirman/releases/download/latest-debug/nirmaan-auditor-debug.apk) on the phone and open it. Android asks once to allow installs from your browser or Files app.
   - Builds are signed with a fixed key, so each new APK installs as an update and keeps your data.
   - If an update fails with "App not installed", your phone has an older copy signed with a different key. Do this once: *Settings → Save backup*, uninstall the app, install the new APK, then *Settings → Restore*.
2. On first launch, paste your Gemini API key. Get one free at [aistudio.google.com](https://aistudio.google.com) → *Get API key*. It is stored encrypted on the phone and can be changed later in Settings; *Test key* checks it works. You can skip this and type items in by hand.
3. Back up from Settings now and then.

## Development

Requirements: Node 22. Android builds also need JDK 21 and the Android SDK (or Android Studio).

```bash
npm install
npm run dev        # the app in a browser at http://localhost:3000 (data kept in IndexedDB)
npm run lint       # type-check
npm test           # unit tests
```

Code layout:

```
apps/mobile      React + Vite UI, packaged as an Android app with Capacitor
  src/data       SQLite schema, repository and backup
  src/jobs       queue worker that sends offline entries to Gemini
packages/shared  types/validation, Gemini prompt + parsing, price-database logic
```

### Data format

All records are in a standard SQLite database, and backups are plain JSON. [docs/data-format.md](docs/data-format.md) describes every table and the backup file. It is written so the data can be carried over if the app is ever rebuilt with other tools (e.g. Kotlin or Swift). The rules that work on the data (price history, quote comparison, unit checks) are in `packages/shared`, with tests.

### Building the Android app

```bash
npm run build
cd apps/mobile
npx cap sync android
npx cap open android            # build/run from Android Studio, or:
cd android && ./gradlew assembleDebug
```

### Versions

Every build is numbered `1.1.<build>` (e.g. `1.1.20`). The build number comes from CI and goes up with every build, so each APK installs over the previous one as an update. To start a new series (e.g. `1.2`), change `version` in `apps/mobile/package.json`; only the first two numbers are used. The version shows in *Settings → On this phone*, in Android's App info, in the release title, and as a `v1.1.<build>` tag on the commit it was built from. Local builds show `dev`.

CI (`.github/workflows/ci.yml`) type-checks, runs the tests and builds a debug APK on every push. Builds of `main` are published to the [`latest-debug` release](https://github.com/parikshit99/nirman/releases/tag/latest-debug), which is where the download link above points; builds of a pull request are under that workflow run's *Artifacts*. For a Play Store release, add a signing config and run `./gradlew bundleRelease`.
