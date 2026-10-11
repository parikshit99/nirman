# Audit fixes plan

From the architecture audit of October 2026 (after #107). Each phase is one commit on the same branch. The checks (`npm run lint`, `npm test`, `npm run build`) pass before every push. These are all fixes, so the version and the CHANGELOG don't change (Code guideline, *Versions*). Status: ⏳ to do, ✅ done, ⏸ left on purpose (reason given).

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

## Phase 6: Duplicates and dead code ⏳

- **Money and quantities:** one `formatRupees` and one `formatQty` in `packages/shared` replace 9 rupee formatters and 3 quantity formatters. PDFs keep "Rs." (their font has no ₹).
- **Export headers:** one `madeByLine()` replaces the 10 copies of "Nirman by Akohsa - <date>" in PDFs and spreadsheets.
- **Backup versions:** `READABLE_VERSIONS` and the version check come from `VERSION`; no hand-written list of 1–14 to keep in step.
- **One way to share:** backups go through the app's own share (`Nirman.shareFiles`) like every other file, and `expo-sharing` is removed. `expo-clipboard` (never imported) is removed too.
- **Removed:** the unused `Actions` type, `webview: 'n/a'` in problem reports, and a comment about base64 pieces in `shareBytes`, which writes bytes.

## Left on purpose ⏸

- **Every write reloads all the data.** Correct but O(all rows) per write. A real fix is reloading only the tables a write touched. That belongs with the sync phases (Supabase), which change how changes arrive anyway. Reloads are already ordered and coalesced (#107).
- **Screens read raw rows** (`snapshot.items` and so on, about 24 places). They read and never write, so nothing is at risk. Moving them behind selectors is churn with no user-visible gain.
- **Exports used only in their own file** (about 70, mostly the zod row schemas). They are the shared package's public API for sync and the web version. Not dead.
