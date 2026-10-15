# Nirman

> **A personal side project.** Nirman was vibe coded (built mostly with AI coding tools) for my own use on my construction sites. You are welcome to use it, copy it and change it, but **not to sell it**, or sell a product or service built mainly on it. See [LICENSE](LICENSE) (MIT with the Commons Clause). It comes with no warranty or support: back up your data.

An Android app for tracking construction materials on site. You photograph bills or handwritten notes, dictate (English or Hindi) or type what was bought. Google Gemini reads it and turns it into clean line items: Hindi/Hinglish terms become standard English names and units. The app keeps:

- a **purchase log** with rates, totals and vendors;
- **Bills of Quantities** for vendor quotes, with each vendor's reply matched back to the BOQ and compared;
- **projects**, each with its own purchase lists, BOQs and labour contracts;
- a **material price database** built from everything you record.

Everything is stored **only on your phone**. There is no server or account. The app keeps a small diagnostic log (errors, AI reading results, steps taken, slow screens; never bill contents, prices, addresses or keys), which leaves the phone only when you send it from *Settings → Report a problem* or *Share log*.

**[⬇ Download the latest APK](https://github.com/parikshit99/nirman/releases/download/latest/nirman.apk)**: rebuilt automatically every time a change is merged into `main`.

## How it works

- **Reads bills on the phone.** Printed bills and typed lists are read on the phone (Google ML Kit text recognition, bundled) and checked (quantity × rate = amount, the bill's total); unclear ones, like most handwritten bills, go to Gemini. *Settings → How bills are read* picks phone first, phone only or Gemini always. Opt-in: keep bill photos with their corrected lines to train an on-phone model later.
- **Projects first.** Everything you record belongs to a project (a building job or site), picked at the top of the screen. Each project has its own open purchase list and BOQ, saved lists, labour contracts and site report; Rates covers all projects, and *Saved → All projects* shows every project's saved lists together.
- **Every change is saved as you make it.** Each line is written to the phone's database the moment you add or change it. *Save list* moves the open list into *Saved* and leaves an empty list for the next bill; *Open* on a saved list edits that list itself, with nothing copied.
- **Five tabs** along the bottom of the screen: *Purchases*, *BOQ*, *Labour*, *Rates* (every price recorded, per material) and *Saved* (saved purchase lists and BOQs). On Purchases and BOQ the list comes first; the round *+* at the bottom right opens the entry form, and the small button above it saves, shares or previews the list. Saved, Labour and Rates have the same buttons for their own actions (a new BOQ or contract, Site report, Export CSV). Swipe a line right to mark it delivered; the bin on a line, saved list, contract or material deletes it (with Undo); long press to pick several. Each saved list has its own *Share*. Settings → Appearance switches to dark mode, picks the app's colour (or the wallpaper's) and turns on pure black.
- **Local database.** All records live in SQLite inside the app, and every screen works without internet. *Add → Add item manually* adds a line to a purchase list or BOQ without the AI, so lists can be made with no internet or API key.
- **AI reading.** Entries go straight from the phone to Google Gemini using your own API key. An entry made offline is queued and read automatically once the phone is online. Photos and notes leave the phone only for that Gemini request. *Settings → Gemini use* shows how many requests this phone sent to Gemini and the tokens they used, per day or per month (counted on the phone only).
- **Learns your corrections.** If you fix an item's name or unit, the correction is remembered and used for future readings.
- **One name per material.** A bill line (read or typed) that is a material already in Rates under a slightly different name ("Mount air" for "Mountair") gets the Rates name as it is read; common materials and brand short forms ("Cement - UT", "Ultratech PPC 50kg") get a standard name (Cement, brand UltraTech, PPC). Units are converted when they can be (MT to kg, brass to cft), and the line shows *Matched to Rates* with *Undo*. Merging two materials in Rates converts their prices the same way.
- **Vendor quotes.** When a vendor replies to a BOQ with their own list, tap *Add → Vendor quote received* on the BOQ tab, or *Quotes* on a saved BOQ in the *Saved* tab, and photograph it. The phone reads it and matches each line to the BOQ, offline (Gemini helps when the phone is unsure and you are online), and you review the matches, see which items are missing, and confirm. Confirmed prices are saved under the BOQ's item names, so vendors line up side by side with the lowest rate marked, and every rate is compared with the last price you recorded for that item.
- **Share in any format.** *Share* on a purchase list, BOQ or quote comparison offers a PDF, an Excel sheet (.xlsx) or a picture (JPG) of each page, then opens the phone's share sheet. *Preview* shows the PDF first. A BOQ can also go out as an **order slip**: items and quantities without rates, with delivery address, date and receiver.
- **Share into the app.** In WhatsApp (or any app), share a bill photo or a text message to *Nirman* and choose Purchases, BOQ or a vendor quote for a saved BOQ; the photos are put into that entry, ready to read.
- **Labour contracts.** The *Labour* tab keeps each contractor's job, site and terms (rate per unit or lump sum, optional retention), with work measured, payments and deductions. It shows the balance due and shares a statement (PDF, Excel or JPG); site reports include labour.
- **Deliveries and site reports.** Tick each purchase or BOQ line when it reaches the site, on the open list or later with *Delivered* on a saved list. *Saved → Site report* lists everything bought for the open project, for all time or any dates, for some or all work types, and optionally only what was delivered, as a PDF, Excel sheet or JPG.
- **Bill photos.** Photographed bills are kept with the lines read from them: *Bill* on a line, or the small pictures of the bills on a saved list, shows them, to check the reading.
- **Backup.** *Settings → Save backup* shares one `.zip` file with everything, bill photos included; save it to Google Drive, WhatsApp or email. The app reminds you after a week without one. *Restore* on any phone brings it all back (older `.json` backups still restore, without photos). Queued, unread entries are not included.

## Using the app

1. [Download the latest APK](https://github.com/parikshit99/nirman/releases/download/latest/nirman.apk) on the phone and open it. Android asks once to allow installs from your browser or Files app.
   - Builds are signed with a fixed release key, so each new APK installs as an update and keeps your data. Phones with an older build signed with the debug key also update in place: the release key carries a record that it replaces the debug key (needs Android 9 or later; on older phones the debug key still signs).
   - If an update fails with "App not installed", your phone has an older copy signed with a different key. Do this once: *Settings → Save backup*, uninstall the app, install the new APK, then *Settings → Restore*.
2. On first launch, paste your Gemini API key. Get one free at [aistudio.google.com](https://aistudio.google.com) → *Get API key*. It is stored encrypted on the phone and can be changed later in Settings; *Test key* checks it works. You can skip this and type items in by hand.
3. Back up from Settings now and then.

## Development

Requirements: Node 22. Android builds also need JDK 17 and the Android SDK (or Android Studio).

```bash
npm install
npm run dev        # Expo's dev server, for a development build of the app on a phone or emulator
npm run lint       # type-check
npm test           # unit tests
npm run build      # bundle the app for Android (no SDK needed): catches import and bundling errors
```

Code layout:

```
apps/native      the app: React Native (Expo), with Android's own controls
packages/core    no screens, so sync and the web version can share it:
  src/data       SQLite schema, repository and backup
  src/jobs       queue worker that reads queued entries (on the phone or with Gemini)
  src/lib        Gemini, settings, PDF and Excel, the problem log
packages/shared  types/validation, Gemini prompt + parsing, price-database and labour-contract logic
```

### Data format

All records are in a standard SQLite database, and backups are a zip of plain JSON and the bill photos as JPEGs. [docs/data-format.md](docs/data-format.md) describes every table and the backup file. It is written so the data can be carried over if the app is ever rebuilt with other tools (e.g. Kotlin or Swift). The rules that work on the data (price history, quote comparison, unit checks) are in `packages/shared`, with tests.

### Building the Android app

```bash
cd apps/native
npm run prebuild                # generates android/ (not committed)
npm run android                 # build and run on a phone or emulator, or:
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
```

### Versions

Versions are `MAJOR.MINOR.PATCH` (e.g. `2.2.3`):
- **MAJOR.MINOR** changes by hand for a new feature (2.2 → 2.3) or a major release (2.x → 3.0), set in `apps/native/package.json` with a matching section at the top of [CHANGELOG.md](CHANGELOG.md). That section becomes the release notes and the app's *What's new* screen, shown once after the update.
- **PATCH** counts up by itself: CI sets it to the number of changes merged since MAJOR.MINOR was last set, so fixes go 2.2.0 → 2.2.1 → 2.2.2 and the count starts again at .0 with the next feature release.

[docs/Code guideline.md](docs/Code%20guideline.md) has the rules for deciding which kind a change is. Android's internal version code is the CI build number, so every APK still installs over the previous one as an update. The version shows in *Settings → On this phone*, in Android's App info, in the release title, and as a `v2.2.3` tag on the commit it was built from. Local builds show `dev`.

CI (`.github/workflows/ci.yml`) type-checks, runs the tests and builds a release APK on every push, signed with the key in the repo secrets `RELEASE_KEYSTORE_BASE64` (the PKCS12 keystore, base64) and `RELEASE_KEYSTORE_PASSWORD` (key alias `nirman`). Keep a copy of that keystore somewhere safe: without it, the next update needs an uninstall. Builds of `main` are published to the [`latest` release](https://github.com/parikshit99/nirman/releases/tag/latest), which is where the download link above points. The [last 5 builds](https://github.com/parikshit99/nirman/releases) are also kept as `v4.3.2`-style releases, to go back to in an emergency: Android won't install an older version over a newer one, so *Settings → Save backup*, uninstall, install the older APK and *Restore* (a backup made by a newer version may not restore in an older one if the data format changed in between). Builds of a pull request are under that workflow run's *Artifacts*. CI signs every APK with the release key and the rotation record from the old debug key (`.github/keys/debug.keystore`), which phones that once had a debug-signed build need; keep that file too.

## License

MIT with the [Commons Clause](https://commonsclause.com): free to use, copy, change and share, but not to sell, or to sell a product or service (hosting, support, a paid app) whose value comes mainly from Nirman. Full text in [LICENSE](LICENSE).

## Security

Your Gemini API key stays on your phone (Android Keystore) and is never put in the app or this repository; CI fails a build that contains anything that looks like one. If you find a security problem, please report it privately through GitHub's *Security → Report a vulnerability* on this repository rather than in an issue.
