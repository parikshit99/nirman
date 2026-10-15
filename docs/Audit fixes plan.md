# Audit fixes plan

From the architecture audit of October 2026 (after #107). Each phase is one commit on the same branch. The checks (`npm run lint`, `npm test`, `npm run build`) pass before every push. These are all fixes, so the version and the CHANGELOG don't change (Code guideline, *Versions*). Status: ⏳ to do, ✅ done, ⏸ left on purpose (reason given). The second audit (14 October 2026) is at the end.

## Phase 1: Readings that land in a deleted list ✅

**Problem.** `deleteList` and `deleteAllHistory` delete a list's lines and quotes, but not the entries still queued for it. Entries are queued on the list a tab shows, which is a saved list while one is being edited. When such a list is deleted before its entry is read, the worker still stores the lines under the deleted list (`completeJob` never checks that the list exists, and the tables have no foreign keys). Those lines show nowhere, never count in Rates, go into every backup and keep their bill photos. The entry itself also stays queued, unseen, and keeps being sent to Gemini.

**Fix.**
- `deleteList` and `deleteAllHistory` also delete the list's queued entries and their photos.
- `completeJob` and `completeQuoteJob` drop an entry whose list (or quote) is gone instead of storing lines.
- No training sample when nothing was stored (the entry was deleted while being read).
- At start, `removeOrphans` cleans what earlier versions left: entries and lines of lists that no longer exist, then the photos only they used.

## Phase 2: Deletes waiting for Undo ✅

**Problem.** A swiped-away row is deleted 10 seconds later by a timer that holds `deleteX(id)`. A restore inside those seconds is followed by the timer deleting the restored row with the same id. A backup inside them still contains the row. If the app is closed inside them, the delete never happens.

**Fix.**
- Restoring a backup cancels the waiting deletes. The restore replaces everything, so they no longer apply.
- Saving a backup carries them out first.
- When the app goes to the background, they are carried out (Android may close it there).

## Phase 3: Backups that don't fit in memory ✅

**Problem.** *Save backup* reads every bill photo, builds the whole `.zip` in memory and only then writes it. Restore unzips the whole file and turns every page into text at once. With many kept bill photos this can run the phone out of memory, so the safety net can fail exactly when there is most to lose.

**Fix.**
- `writeBackupZip` streams the `.zip` (fflate `Zip`): one bill at a time is read from the database and handed to the app, which writes it straight to the file.
- Restore keeps the unzipped pages as bytes and turns one bill at a time into text while inserting it.

## Phase 4: Robustness ✅

- **Migrations** run each script with `exec` inside their transaction instead of splitting it on `;`, which would break the first time a statement holds a `;` (a trigger or a text value).
- **Settings** are saved as the changes the user made, merged into the current settings. Before this, a Settings page opened earlier could put back a Gemini model the worker had just replaced.
- **Layers:** the `Services` type moves from `state/AppState.tsx` to `data/services.ts` (the data layer no longer imports from the state layer). Gemini gets the unit conversions in the request instead of reading the phone's preferences itself.

## Phase 5: The backup reminder that went missing ✅

**Problem.** The CHANGELOG and *Nirman workflows* promise a reminder when there has been no backup for a week. It was shown by the 6.x app's `App.tsx` and was lost when that app was removed (#97). `backupOverdue` and `snoozeBackupReminder` have been unused since.

**Fix.** A reminder row under the header of every tab: *Last backup: …*, *Back up* (opens Settings), and ✕ to remind again in 3 days. It shows only when there is data and no backup for 7 days.

## Phase 6: Duplicates and dead code ✅

- **Money and quantities:** one `formatRupees` and one `formatQty` in `packages/shared` replace 9 rupee formatters and 3 quantity formatters. PDFs keep "Rs." (their font has no ₹).
- **Export headers:** one `madeByLine()` replaces the 10 copies of "Nirman by Akohsa - <date>" in PDFs and spreadsheets.
- **Backup versions:** `READABLE_VERSIONS` and the version check come from `VERSION`; no hand-written list of 1–14 to keep in step.
- **One way to share:** backups go through the app's own share (`Nirman.shareFiles`) like every other file, and `expo-sharing` is removed. `expo-clipboard` (never imported) is removed too.
- **Removed:** the unused `Actions` type, `webview: 'n/a'` in problem reports, and a comment about base64 pieces in `shareBytes`, which writes bytes.

## Check on a phone

The checks can't reach these; try them on a phone before release:
- *Save backup* with many bill photos: the file shares, and restores on another phone (Phase 3).
- *Save backup* from the start-up problem screen (Phase 3).
- The backup reminder: shows with data and no backup for 7 days; ✕ hides it; it goes after a backup (Phase 5).
- Swipe a line away, then switch to another app: the line stays deleted after the app is reopened (Phase 2).

## Left on purpose ⏸

- **Every write reloads all the data.** Correct but O(all rows) per write. A real fix is reloading only the tables a write touched. That belongs with the sync phases (Supabase), which change how changes arrive anyway. Reloads are already ordered and coalesced (#107).
- **Screens read raw rows** (`snapshot.items` and so on, about 24 places). They read and never write, so nothing is at risk. Moving them behind selectors is churn with no user-visible gain.
- **Exports used only in their own file** (about 70, mostly the zod row schemas). They are the shared package's public API for sync and the web version. Not dead.

## Second audit: 14 October 2026

From the second audit, done on 14 October 2026 (IST) after #110. Finding numbers are the ones reported to the owner. Each open item gives its severity, status, owner (a team role, or the owner for what only they can do) and the pull request it is planned for.

**Order of work** (owner, 14 October 2026): one pull request at a time, each merged when CI is green.

| PR | What | Version |
|---|---|---|
| 1 (this one) | A, B, C and the docs (finding 11) | fixes |
| 2 | Findings 6, 9, 10 | fixes |
| 3 | Findings 8, 13 | fixes |
| 4 | Finding 7 (Hindi in PDFs) | fix |
| 5 | The site report: findings 12, 14 and *Materials or labour* | 7.6 |
| 6 | Duplicate-bill warning | 7.7 |
| 7 | Text summaries for WhatsApp (owner request) | 7.8 |

Finding 1 is the owner's, the sooner the better. Finding 15 waits for the next Expo upgrade.

### This pull request

#### A. Backups that always restore (finding 2, high) ✅ in this PR

**Problem.** Restore checks text limits that saving never enforced (`packages/shared/src/schemas.ts`): contractor phone 40 characters, vendor 200, note 500, learned name 200. A backup with a longer value (two phone numbers in one field, a long dictated note) is refused whole as "The backup file is damaged", though nothing is wrong with it.

**Fix.**
- The row schemas stay the limits, and saving now keeps to them: text longer than its column's limit is shortened when it is saved (keys and ids are never shortened; their limits cover what the app makes). The contractor phone limit goes from 40 to 100 characters.
- Restore shortens over-long text from older backups instead of refusing the file, and says how many values it shortened. No row is left out.
- *Save backup* checks its own file before finishing, and stops with an error rather than writing one that wouldn't restore.
- Restore still refuses a file that isn't a Nirman backup, comes from a newer version, or is really damaged (not JSON, a table missing, a wrong type).
- Done when: a test saves a 43-character contractor phone, a 300-character vendor, an 800-character note and a 300-character learned word, makes a backup, restores it and gets every row back (the phone exactly, the rest shortened to their limits); and an older backup with over-long values restores, reporting what it shortened.

#### B. Problem reports that stay private (finding 3, high) ✅ in this PR

**Problem.** The repository is public. *Report a problem* opened a GitHub issue filled in with the recent steps and readings and what they worked on: items, rates, vendors, site addresses, contractor phone numbers. Anyone could read it.

**Fix.**
- The issue carries only the phone details and app version, recent errors and where in the code they happened, and the names, times and counts of recent steps, readings and slow screens. Nothing the user typed, photographed or saved.
- The full log leaves the phone only with *Share log*, to the app and person the user picks.
- The note the user types still goes in the issue, so the screen says the issue is public.
- New words:
  - Hint under the buttons: "Report a problem opens a public GitHub issue with the phone details and recent errors. Your items, rates, vendors, addresses and phone numbers are left out. To send the full log privately, use Share log."
  - Note field placeholder: "What happened? (optional; the report is public)"
  - Last line of the issue: "_Sent from Nirman → Settings → Report a problem. This issue is public: items, rates, vendors, addresses, phone numbers, photos and the API key are left out. The full log stays on the phone (Settings → Share log)._"
- Done when: a test fills the log with steps, readings and errors that carry an item name, a rate, a vendor, a site address and a 10-digit phone number (in what they worked on, in their labels and in an error message), and none of them is in the issue link, while the phone details and the places of the errors are.
- The tech writer updates *Diagnostics* in the Code guideline and the *Report a problem* row of *What leaves the phone* (Nirman workflows).

#### C. Totals that match the bill (findings 4 and 5, medium) ✅ in this PR

**Problem.**
- Deleting a project deleted its purchase lines, and Rates is worked out from the lines, so its purchase prices left Rates too, though the dialog says "Prices in Rates stay".
- Editing a purchase line set its total to qty × rate whatever was changed. A ₹22,420 bill line (50 × ₹380 with 18% GST) became ₹19,000 after a typo in the vendor was fixed.

**Fix.**
- Deleting a project keeps the prices the dialog promises. Before the lines go, each purchase line with a rate (open or saved list, not left out of Rates) is kept as an added rate in Rates: name, unit, rate, vendor, date, brand, model, size, colour, work type and site address.
- Editing a line keeps its total unless Qty or Rate changed. A new name, brand, size, unit, vendor, date, *Ordered as*, delivered tick or *Leave out of Rates* leaves the total as it is. A new Qty or Rate makes the total Qty × Rate, as before.
- The editor's *Total* shows the line's own total until Qty or Rate is changed, then Qty × Rate, so it always shows what will be saved.
- Done when: tests show the same materials, prices, vendors and dates in Rates before and after a project is deleted, with a line left out of Rates staying out, and the ₹22,420 line keeping ₹22,420 after its vendor changes and becoming ₹15,200 when Qty becomes 40.

#### Finding 11. Docs that said the repository was private (low) ✅ in this PR

The tech writer corrects `self-hosted-runner.md`, Nirman workflows, the Code guideline and the README.

#### Check on a phone (this PR)

- *Report a problem*: the GitHub page has no item, rate, vendor, address or phone number.
- *Restore* a backup with a contract whose phone field holds two numbers.
- Delete a test project: its materials still show their prices in Rates.
- Change the vendor of a bill line whose total isn't qty × rate: the total stays.

### Open findings, in priority order

#### 1. A Google API key in the public git history (finding 1)

**High · ⏳ · owner · as soon as possible**

**Problem.** `firebase-applet-config.json`, in the first commit (b0f6698, 30 September 2026), holds a Google API key of the AI Studio project `gen-lang-client-0185398496`. The file is gone, but the key stays readable in the history of a public repository. Removing a file doesn't remove it from history.

**To do** (the owner, in a browser):
- Google Cloud console, that project → *APIs & Services → Credentials*: delete the key, or restrict it if something still uses it.
- Delete the project's leftover Firestore database if nothing uses it.
- GitHub → the repository's *Settings → Code security*: turn on secret scanning with push protection.

Done when: the key is gone from *Credentials* (or restricted) and push protection is on. Rewriting git history isn't needed once the key no longer works.

#### 2. The backup reminder trusts the share sheet (finding 6)

**Medium · ⏳ · app-engineer · PR 2**

**Problem.** "Last backup: today" is recorded as soon as the share sheet opens (`shareFiles` returns when Android's chooser starts), even if the user backs out. The reminder then stays quiet for a week with no backup made. And every backup `.zip`, with all bill photos, stays in the app's cache folder for good (`apps/native/src/lib/files.ts`).

**Fix.**
- The backup is recorded only when the user picks where it goes in the share sheet (Android reports the app chosen). Backing out records nothing. The same on the start-up problem screen. Android can't tell whether that app then finished saving; the pick is the best sign there is.
- Backup files in the cache are deleted at the next start of the app and before the next backup is written. Not on a timer: Drive or Gmail may still be reading a large file.

Done when, on a phone: *Save backup*, then Back out of the share sheet: *Last backup* is unchanged. *Save backup* to Drive: "Last backup: today". After a restart, *App info → Storage* shows the cache back at its size before the backup.

#### 3. CI: the signing key sits next to install scripts (finding 8)

**Medium · ⏳ · release-engineer · PR 3**

**Problem.** The `native` job receives the release keystore and, in the same job, runs `npm ci` (every dependency's install scripts) and third-party actions pinned to tags that can be moved (`@v4`, `setup-android@v3`, `ccache-action@v1.2`). A bad package or a moved tag could copy the key or change the signing step.

**Fix.**
- Every action in `.github/workflows` and `.github/actions` is pinned to a full commit SHA, with its version in a comment.
- The build job makes an unsigned APK. A separate small job gets it as an artifact and signs it with the same key and rotation lineage, keeping the API-key check (`sign-apk.sh`). This job runs no npm, Gradle or third-party action.

Done when: no `uses:` lacks a 40-character SHA; the keystore secrets appear only in the signing job; the signed APK installs over the last release (`apksigner verify --print-certs` shows the same certificate); the security reviewer has checked the change.

#### 4. PDFs garble Hindi, ₹ and ≈ (finding 7)

**Medium · ⏳ · core-engineer (with the app-engineer if Android draws the PDFs) · PR 4**

**Problem.** PDFs and their JPGs use jsPDF's built-in font, which has no Hindi letters and no ₹. Any Hindi in a line, vendor, note or contract prints as junk, and so does the ≈ on converted TMT lines in order slips (`packages/core/src/lib/pdf.ts:203`).

**Fix.**
1. Check first: jsPDF can't join Devanagari letters even with a Hindi font (ि comes out after its letter, conjuncts like स्त्र fall apart). Try drawing the PDFs from HTML with Android's own text engine, keeping the preview and the JPG pages. Keep jsPDF only if it prints the words below correctly.
2. Print with Noto Sans and Noto Sans Devanagari. Amounts in PDFs then show ₹ like the app, instead of "Rs." (Phase 6 above).
3. If step 1 takes long, ship "approx." in place of ≈ first, on its own.

Done when: a PDF and its JPG of a list with सरिया, मिस्त्री, ईंट, पत्थर and the vendor श्री ट्रेडर्स show them as the app does (checked by eye on a phone), ₹ and the approximate mark print, columns and page size are as before, and Excel is unchanged.

#### 5. Deletes with no Undo (finding 9)

**Low · ⏳ · app-engineer (the core-engineer for the waiting deletes) · PR 2**

**Problem.** The bin on a queued entry (up to 5 bill photos, `CapturePanel.tsx`) deletes it at once, with no Undo or confirm. So do *Delete* on a learned correction (Settings) and ✕ on a work type (Rates). The UX guideline: never a bin without Undo.

**Fix.** Each takes the row away and shows the Undo strip, like other deletes: carried out when the app goes to the background and before a backup, forgotten on restore. An entry waiting to be deleted isn't read; Undo puts it back in the queue with its photos.

New words (each with *Undo*):
- "Deleted the entry with 3 photos"; for a typed or spoken entry, `Deleted the entry “<its first words>”`.
- `Deleted the correction for “sariya”`
- `Deleted the work type “Plumbing”`

Done when: a test for each waiting delete, and on a phone a deleted 5-photo entry comes back with its 5 photos on Undo and is then read as usual.

#### 6. Memory: training export and restore (finding 10)

**Low · ⏳ · core-engineer (with the app-engineer for reading the file in pieces) · PR 2**

**Problem.** *Export* of kept bill photos builds one string of every photo before writing it. *Restore* reads the whole `.zip` and unzips every file in memory at once. With many photos either can run the phone out of memory: the risk Phase 3 removed from *Save backup*.

**Fix.** The export writes one bill at a time to the file, like `writeBackupZip`. Restore reads the `.zip` from storage in pieces and unzips one file at a time, inserting bill photos as they come.

Done when: tests give the same results as now, and on a phone a backup with 300 bill photos restores, and 300 kept bills export, without the app closing.

#### 7. Sharing into the app accepts file:// links (finding 13)

**Low · ⏳ · app-engineer · PR 3**

**Problem.** The share receiver in the Kotlin module copies any link it is given. A `file://` link points straight at storage and can name the app's own files; apps share with `content://` links.

**Fix.** Only `content://` links are read; others are skipped. If nothing is left of a share, a toast says: "Couldn't open what was shared. Share it again from Gallery or Files."

Done when: photos shared from WhatsApp, Gallery and Files still arrive, and a `file://` share adds nothing and shows the toast.

#### 8. The work-type guess matches parts of words (finding 12)

**Low · ⏳ · core-engineer · PR 5**

**Problem.** `guessCategory` (`packages/shared/src/domain.ts`) looks for each keyword anywhere in a name: "ac" in "black", "bracket" and "acrylic" makes them HVAC; "tap" is found in "tape", "led" in "sealed".

**Fix.** Keywords match whole words only (a plural "s" allowed).

Done when: tests show "AC", "1.5 ton AC" and "AC copper pipe" as HVAC, and "black paint", "bracket", "acrylic sheet", "tape" and "sealed" not matched by those keywords.

#### 9. The site report leaves out the open purchase list (finding 14)

**Low · ⏳ · core-engineer and app-engineer · PR 5** · Owner's decision, 14 October 2026: include it.

**Problem.** Purchases' *Spent* counts the open (unsaved) purchase list; the site report counts only saved lists, so the two totals differ until the list is saved.

**Fix.**
- The site report includes the open list's lines, with the same filters (dates, work type, only delivered).
- In *All lines* (PDF, JPG and Excel) their *List* column says "Open list".
- The choice "All saved purchases" becomes "All purchases".

Done when: with no filters the report's materials total equals the project's *Spent* on Purchases (a test, and on a phone).

#### 10. Site report: materials, labour or both (owner request, 14 October 2026)

**Feature · ⏳ · app-engineer and core-engineer · PR 5 (7.6)**

**Problem.** The site report always combines materials and labour. The owner sometimes needs them separately, for example a labour report for a contractor's payments.

**Behaviour.**
- A choice at the top of *Site report*, labelled "Report": "Materials and labour" (chosen each time the screen opens), "Materials only", "Labour only".
- It applies to PDF, Excel and JPG alike. Title, preview and file name follow it: "Site report", "Materials report", "Labour report".
- *Materials and labour*: as today (materials total, labour total, grand total).
- *Materials only*: today's report without the labour section; its last line is the grand total of materials.
- *Labour only*: the labour table with its labour total. No materials, no *All lines*, no grand total.
- *Labour only* hides *Include* (delivered applies to purchases only). Period and work type apply to all three.
- When the chosen part is empty, Preview and Share are off, with "No purchases match these filters." or "No labour contracts match these filters."

Done when: tests check the title and totals of each choice in the PDF and Excel builds, and on a phone each choice previews and shares in all three formats.

**Release.** 7.6: `apps/native/package.json` to 7.6.0 and a CHANGELOG section (for example "## 7.6 — Site report: materials, labour or both") covering this choice and the open list (item 9). The tech writer updates the README (*Deliveries and site reports*) and Nirman workflows (*A-05 Labour contracts*).

#### 11. Quote line totals reset too (found while writing C)

**Low · ✅ in this PR · core-engineer**

**Problem.** `updateQuoteLine` also sets a quote line's total to qty × rate on every edit, so matching a line to another BOQ item changes the "Line total" shown in quote review. Comparisons and Rates use the rate, so only that label is wrong.

**Fix.** The same rule as C: the total changes only with Qty or Rate. Done when a test shows it.

#### 12. Advisories in build tools (finding 15)

**Info · ⏸ · until the next Expo upgrade**

`npm audit` lists 27 advisories, all in build tools (Metro, Expo CLI) and none in the APK. The next normal Expo upgrade (`npx expo install --fix`) clears them; no action before that (owner, 14 October 2026).

### Left on purpose ⏸

- **Every write reloads all the data and rebuilds Rates** (first audit, above). Still left until the sync phases. Watch it as data grows: if saving on a phone with years of data gets slow (the log records slow steps), bring forward reloading only the tables a write touched.

### Improvements proposed to the owner

| # | Improvement | Status |
|---|---|---|
| 1 | Backups that always restore | A, ✅ in this PR |
| 2 | Private problem reports | B, ✅ in this PR |
| 3 | Totals that match the bill | C, ✅ in this PR |
| 4 | PDFs that can print Hindi | ⏳ PR 4 (open item 4): Hindi, ₹ and the approximate mark print correctly in every PDF and JPG, with Devanagari letters joined as on screen. |
| 5 | Duplicate-bill warning | ⏳ PR 6, 7.7: before adding a bill that matches one already recorded, ask. Spec below. |

The owner also asked (14 October 2026) for *Site report: materials, labour or both* (open item 10, 7.6) and *Text summaries for WhatsApp* (7.8, spec below).

### Duplicate-bill warning (7.7)

**Feature · ⏳ · core-engineer (the rule and the queue), app-engineer (the screens), qa-engineer (acceptance tests) · PR 6**

**Problem.** A bill is often both photographed on site and forwarded on WhatsApp, or shared twice. Each copy is read and added, so *Spent*, the site report and Rates count it twice, and nothing says so.

**Which entries.** Purchase entries (photo, shared, voice or typed), once read. Not BOQ entries, vendor quotes or lines added with *Add item manually*.

**Same bill.** A reading is the same bill as one already recorded, in any project, open or saved list, when all three match:
- **Vendor:** the same name ignoring capitals, spaces and punctuation, or one letter off ("Shree Traders" = "SHREE TRADERS." = "Shree Trader").
- **Date:** the same bill date.
- **Total:** the sum of its lines' totals, within ₹1.

A bill already recorded is the lines of one list with that vendor and date. Lines waiting for Undo don't count. A reading with no vendor, or a total of 0, is never asked about: too little to tell.

**Same photo.** A photo already kept with a bill, byte for byte (the same WhatsApp image shared twice), is asked about when the entry is added, before it is queued. WhatsApp recompresses photos, so a photographed bill forwarded later isn't the same file; vendor, date and total catch that case. If a hash of each photo is stored for this, that is a migration: follow the Code guideline's database rules (Sync 1 plans the same hash).

**Where the question appears.** The entry's lines are not added yet. The entry stays under *Being read* with "Looks like a bill already added. Tap to check." Tapping it opens the question. A dialog never opens by itself while the user is doing something else. For the same photo, the question opens straight away on *Add*.

**The question** (a `confirm`):
- Title: "Bill already added?"
- Message: "Looks like the Shree Traders bill of 12 Oct, ₹22,420, already in the open purchase list. Add anyway?" For a saved list, its title in quotes takes the place of "the open purchase list", with the project's name in brackets when it is another project. For the same photo: "This photo is already in the Shree Traders bill of 12 Oct, ₹22,420. Add anyway?"
- The vendor is shown as recorded. The date is in IST, "12 Oct" this year, "12 Oct 2025" for another year. The amount is in whole rupees with Indian grouping.
- Buttons: "Add anyway" and "Don't add". Back, or a tap outside, closes the question and changes nothing: the entry keeps waiting.

**Add anyway.** The lines are added as usual, to the list the entry was made for, with the photo kept. The entry leaves the queue and is not asked about again.

**Don't add.** Nothing is added. The entry is deleted with the Undo strip ("Deleted the entry with 2 photos", open item 5); Undo puts it back, waiting with the question. For the same photo on *Add*, only that photo is taken out of the entry being made.

**Offline.** The check runs on the phone against the phone's database. It works with no internet and in *Phone only*, and adds no Gemini request. An entry waiting for internet is checked once it is read. Other entries keep being read while one waits for an answer.

**Done when:**
- Tests in `packages/shared` for the rule: the same bill read twice is asked about; the same vendor and date with a total ₹50 apart is not; the same total on another date is not; "SHREE TRADERS." and "Shree Traders" are the same vendor; a reading with no vendor is not asked about; a match in another project is asked about and names that project.
- A core test: an entry asked about adds no lines until *Add anyway*, and none after *Don't add*.
- On a phone: photograph a bill, then share the same bill from WhatsApp: the question appears; *Add anyway* adds it a second time; *Don't add* then *Undo* brings the entry back.

**Release.** 7.7: `apps/native/package.json` to 7.7.0 and a CHANGELOG section ("## 7.7 — A warning for a bill added twice"). The tech writer adds the step to *A-02 Reading a bill* and its diagram in Nirman workflows, and a line to the README.

### Text summaries for WhatsApp (7.8)

**Feature · ⏳ · core-engineer (the summaries, with tests), app-engineer (buttons and sharing text), qa-engineer (acceptance tests), tech-writer (docs) · PR 7** · Owner request, 14 October 2026.

**Problem.** Telling someone how the site stands means sending a PDF or a picture, which is slow to open and hard to read on a phone. Often a few lines are enough: "Today: 6 bills, ₹48,200 · Ramesh: ₹12,000 due".

**Where.**
- *Share* on a purchase list (the open list and each saved list), on a labour contract's statement, and on the site report gets a fourth choice, at the top: "Text message", about: "A few lines to send on WhatsApp, no file".
- Purchases' ⋮ menu gets "Today's summary", which shares the day's summary straight away (one tap).
- The text goes through Android's share sheet, with WhatsApp (and WhatsApp Business) shown first when installed. There is no preview: the receiving app shows the text before it is sent.

**What each summary says** (examples for the project "Sharma house" on 14 October):

Today's summary: today's bills and spend in this project, then what is due on its active contracts.
```
Sharma house · 14 Oct
Today: 6 bills, ₹48,200
• Shree Traders ₹22,420
• Gupta Hardware ₹9,800
+ 4 more bills
Due: Ramesh ₹12,000 · Suresh ₹4,500
```

A purchase list: its total and the lines with the largest amounts.
```
Shree Traders, 12 Oct · Sharma house
6 items, ₹22,420
• Cement: 50 Bag, ₹19,000
• Sand: 70 cft, ₹2,100
+ 4 more items
Not delivered yet: 2 items
```

A labour contract:
```
Ramesh · Internal plaster, 2nd floor
Sharma house · 14 Oct
Work done ₹48,000 · Paid ₹36,000
Ramesh: ₹12,000 due
```

The site report, following its filters and the materials or labour choice (open item 10):
```
Sharma house · Site report, 1 Apr to 14 Oct
Materials: ₹8,45,200 (124 lines)
• Civil ₹6,10,000
• Electrical ₹1,20,500
• Plumbing ₹1,14,700
Labour: work done ₹3,20,000, paid ₹2,90,000, ₹30,000 due
Total: ₹11,65,200
```

**Rules for every summary.**
- Amounts in whole rupees with ₹ and Indian grouping (₹1,25,000), the app's own `formatRupees`. Quantities as on screen. Dates in IST, "14 Oct" this year, "14 Oct 2025" another year.
- A bill is the lines of one list with one vendor and date (as in the duplicate-bill warning).
- At most 5 listed rows (largest amount first), then "+ 4 more items", "+ 1 more bill" (plurals agree). At most 12 lines and 700 characters in all, so it reads on a phone without scrolling far.
- Names, vendors and work types as recorded, Hindi included. No photos, no contractor phone numbers, no site address beyond the project name.
- Rows with nothing to say are left out: no "Due" when nothing is due, no "Not delivered yet" when all arrived; a contract paid ahead says "Paid ahead ₹3,000"; retention still held adds "Held back ₹2,400".
- With nothing to summarise, the choice is off ("No purchases today" in the ⋮ menu).

**Offline.** The text is made on the phone from the phone's data, with no internet and no Gemini. Only sending it on WhatsApp needs a connection, and WhatsApp waits for one by itself.

**Done when:**
- Tests in `packages/shared` give exactly the example texts above from matching data, and check the 5-row and 12-line limits, plurals, paid ahead, held back, a Hindi item name and an empty day.
- On a phone: *Today's summary* opens the share sheet with WhatsApp first and the text in the message box; *Text message* works from a purchase list, a contract statement and the site report; all of it works in flight mode up to the send.
- The problem log records that a summary was shared, never its text.

**Release.** 7.8: `apps/native/package.json` to 7.8.0 and a CHANGELOG section ("## 7.8 — Text summaries for WhatsApp"). The tech writer adds text to the README (*Share in any format*) and to the *Share* row of *What leaves the phone* in Nirman workflows.
