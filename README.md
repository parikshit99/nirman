# Nirman

An Android app for tracking construction materials on site. You photograph bills or handwritten notes, dictate (English or Hindi) or type what was bought. Google Gemini reads it and turns it into clean line items: Hindi/Hinglish terms become standard English names and units. The app keeps:

- a **purchase log** with rates, totals and vendors;
- **Bills of Quantities** for vendor quotes, with each vendor's reply matched back to the BOQ and compared;
- **saved sessions** per site;
- a **material price database** built from everything you record.

Everything is stored **only on your phone**. There is no server or account. The app keeps a small diagnostic log (errors, AI reading results, steps taken, slow screens; never bill contents, prices, addresses or keys), which leaves the phone only when you send it from *Settings → Report a problem* or *Share log*.

**[⬇ Download the latest APK](https://github.com/parikshit99/nirman/releases/download/latest/nirman.apk)**: rebuilt automatically every time a change is merged into `main`. While this repository is private, you need to be signed in to GitHub for the link to work.

## How it works

- **Reads bills on the phone.** Printed bills and typed lists are read on the phone (Google ML Kit text recognition, bundled) and checked (quantity × rate = amount, the bill's total); unclear ones, like most handwritten bills, go to Gemini. *Settings → How bills are read* picks phone first, phone only or Gemini always. Opt-in: keep bill photos with their corrected lines to train an on-phone model later.
- **Five tabs** along the bottom of the screen: *Purchases*, *BOQ*, *Labour*, *Rates* (every price recorded, per material) and *Saved* (saved purchase lists and BOQs). On Purchases and BOQ the list comes first; the orange *Add* button opens the entry form. Settings → Appearance switches to dark mode.
- **Local database.** All records live in SQLite inside the app, and every screen works without internet. *Add → Add item manually* adds a line to a purchase list or BOQ without the AI, so lists can be made with no internet or API key.
- **AI reading.** Entries go straight from the phone to Google Gemini using your own API key. An entry made offline is queued and read automatically once the phone is online. Photos and notes leave the phone only for that Gemini request.
- **Learns your corrections.** If you fix an item's name or unit, the correction is remembered and used for future readings.
- **Vendor quotes.** When a vendor replies to a BOQ with their own list, tap *Add → Vendor quote received* on the BOQ tab, or *Quotes* on a saved BOQ in the *Saved* tab, and photograph it. The AI matches each line to the BOQ, and you review the matches, see which items are missing, and confirm. Confirmed prices are saved under the BOQ's item names, so vendors line up side by side with the lowest rate marked, and every rate is compared with the last price you recorded for that item.
- **Share in any format.** *Share* on a purchase list, BOQ or quote comparison offers a PDF, an Excel sheet (.xlsx) or a picture (JPG) of each page, then opens the phone's share sheet. *Preview* shows the PDF first. A BOQ can also go out as an **order slip**: items and quantities without rates, with delivery address, date and receiver.
- **Share into the app.** In WhatsApp (or any app), share a bill photo or a text message to *Nirman* and choose Purchases, BOQ or a vendor quote for a saved BOQ; the photos are put into that entry, ready to read.
- **Labour contracts.** The *Labour* tab keeps each contractor's job, site and terms (rate per unit or lump sum, optional retention), with work measured, payments and deductions. It shows the balance due and shares a statement (PDF, Excel or JPG); site reports include labour.
- **Deliveries and site reports.** Tick each purchase or BOQ line when it reaches the site, on the open list or later with *Delivered* on a saved list. *Saved → Site report* lists everything bought for one address, for all time or any dates, for some or all work types, and optionally only what was delivered, as a PDF, Excel sheet or JPG.
- **Bill photos.** Photographed bills are kept with the lines read from them: *Bill* on a line or *Bills* on a saved list shows them, to check the reading.
- **Backup.** *Settings → Save backup* shares one `.json` file with everything; save it to Google Drive, WhatsApp or email. *Restore* on any phone brings it all back. Queued, unread entries and bill photos are not included.

## Using the app

1. [Download the latest APK](https://github.com/parikshit99/nirman/releases/download/latest/nirman.apk) on the phone and open it. Android asks once to allow installs from your browser or Files app.
   - Builds are signed with a fixed release key, so each new APK installs as an update and keeps your data. Phones with an older build signed with the debug key also update in place: the release key carries a record that it replaces the debug key (needs Android 9 or later; on older phones the debug key still signs).
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
packages/shared  types/validation, Gemini prompt + parsing, price-database and labour-contract logic
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

Versions are `MAJOR.MINOR.PATCH` (e.g. `2.2.3`):
- **MAJOR.MINOR** changes by hand for a new feature (2.2 → 2.3) or a major release (2.x → 3.0), set in `apps/mobile/package.json` with a matching section at the top of [CHANGELOG.md](CHANGELOG.md). That section becomes the release notes and the app's *What's new* screen, shown once after the update.
- **PATCH** counts up by itself: CI sets it to the number of changes merged since MAJOR.MINOR was last set, so fixes go 2.2.0 → 2.2.1 → 2.2.2 and the count starts again at .0 with the next feature release.

[CLAUDE.md](CLAUDE.md) has the rules for deciding which kind a change is. Android's internal version code is the CI build number, so every APK still installs over the previous one as an update. The version shows in *Settings → On this phone*, in Android's App info, in the release title, and as a `v2.2.3` tag on the commit it was built from. Local builds show `dev`.

CI (`.github/workflows/ci.yml`) type-checks, runs the tests and builds a release APK on every push, signed with the key in the repo secrets `RELEASE_KEYSTORE_BASE64` (the PKCS12 keystore, base64) and `RELEASE_KEYSTORE_PASSWORD` (key alias `nirman`). Keep a copy of that keystore somewhere safe: without it, the next update needs an uninstall. Builds of `main` are published to the [`latest` release](https://github.com/parikshit99/nirman/releases/tag/latest), which is where the download link above points; builds of a pull request are under that workflow run's *Artifacts*. Local builds (`./gradlew assembleDebug`) use the debug key in `android/app/debug.keystore`.
