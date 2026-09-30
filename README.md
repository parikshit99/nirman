# Nirmāṇ Auditor

An Android app for tracking construction materials on site. You photograph bills or handwritten notes, dictate (English or Hindi) or type what was bought. Google Gemini reads it and turns it into clean line items: Hindi/Hinglish terms become standard English names and units. The app keeps:

- an **audit log** with rates, totals and vendors;
- **Bills of Quantities** for vendor quotes;
- **saved sessions** per site;
- a **material price database** built from everything you record.

Everything is stored **only on your phone**. There is no server or account.

## How it works

- **Local database.** All records live in SQLite inside the app, and every screen works without internet.
- **AI reading.** Entries go straight from the phone to Google Gemini using your own API key. An entry made offline is queued and read automatically once the phone is online. Photos and notes leave the phone only for that Gemini request.
- **Learns your corrections.** If you fix an item's name or unit, the correction is remembered and used for future readings.
- **Backup.** *Settings → Save backup* shares one `.json` file with everything; save it to Google Drive, WhatsApp or email. *Restore* on any phone brings it all back. Queued, unread entries are not included.

## Using the app

1. Install the APK (see below).
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

### Building the Android app

```bash
npm run build
cd apps/mobile
npx cap sync android
npx cap open android            # build/run from Android Studio, or:
cd android && ./gradlew assembleDebug
```

CI (`.github/workflows/ci.yml`) type-checks, runs the tests and builds a debug APK on every push. Download the APK from the workflow run's artifacts. For a Play Store release, add a signing config and run `./gradlew bundleRelease`.
