# What's new in Nirman

Versions are MAJOR.MINOR.PATCH. Each section here is a feature (minor) or major release; fixes in between only raise the last number and are not listed. Newest first.

## 7.14 — Rent, food and other site expenses

**Expenses**
- Record money spent on a project that is neither material nor labour: rent, transport, food and tea, electricity and water, permits and fees, and anything else. Each has a date, an amount, who was paid, how (cash, UPI, bank transfer, cheque) and a note.
- On the **Labour** tab, the *Expenses* card shows the project's total and opens the list: newest first, chips for each kind, tap one to change it, the bin to delete it (with Undo). *Add expense* is also in the tab's + menu.
- Deleting a project deletes its expenses too; the confirm says how many.
- The **site report** has an *Expenses* part, with a subtotal for each kind and an *Expenses total*; the grand total is now materials + labour + expenses. Expenses have no work type, so they show only with all work types.
- Expenses are in backups. Backups made by earlier versions still restore, with no expenses.

## 7.5 — Saved lists of every project

**Saved**
- **All projects** at the top of Saved shows the saved lists of every project together, newest first, each marked with its project. *This project* goes back to the open project's lists; the app remembers which one you used.
- Search and the work-type filter cover every project; the second row of chips filters by project.
- Closed projects' lists stay out until you tick **Show closed projects**.
- *Open* or *Quotes* on another project's list switches to that project first. *Delete all saved lists* is only offered in *This project*.

## 7.4 — The new buttons on every tab

**Purchases and BOQ**
- **Clear all** is back on show, at the end of the list under *Mark all delivered* (it is also in the small button at the bottom right).

**Saved**
- Every saved list has a **Share** button: PDF, Excel or JPG (a BOQ also as an order slip), without opening it first.
- The round button at the bottom right starts a **new BOQ**; the small one above it has *Site report*, *New purchase list* and *Delete all saved lists* (still also at the end of the list).
- **Swipe** a saved list to the left to delete it, with Undo.

**Labour**
- **New contract** is the round **+** at the bottom right; *Site report* is also in the small button above it.
- **Swipe** a contract to the left to delete it, with Undo.

**Rates**
- *Export CSV* and *Delete* are in the small button at the bottom right, instead of the ⋮.
- **Swipe** a material to the left to delete it from Rates, with Undo.

## 7.3 — Smoother, Telegram-style

**Purchases and BOQ**
- A round **+** at the bottom right adds items. The small button above it opens **Save, Share, Preview** and **Clear the list**. Both slide away while you scroll down the list and come back when you scroll up.
- **Swipe** a line to the right to mark it delivered (or not delivered), or all the way to the left to delete it.
- **Long press** a line to pick several, then mark them delivered or delete them together. *Pick all* picks every line shown.
- A deleted line leaves the list at once. A strip at the bottom says what was deleted, with **Undo** and a countdown.

**Everywhere**
- Settings is the ⚙ at the top right and opens as its own page. Rates' *Export CSV* and *Delete* are in the ⋮ beside *Select*.
- Screens slide in from the right. Swipe from the left edge, or press Back, to slide them away.
- Buttons shrink a little when pressed, tabs slide, new lines slide into place, and totals roll to their new value.
- Switching between Light and Dark spreads the new colours from your finger.
- The app opens with its icon and goes straight to your lists, with no blank screen or spinner.
- The highlight behind the picked tab is now in the app's colour.

**Projects**
- **Long press** a project to pin it to the top.
- Closed projects are folded into one row at the end. Tap it to see them.

## 7.2 — Choose the app's colour

**Settings → Appearance**
- Pick the app's colour from twelve: orange (as before), red, pink, purple, indigo, blue, teal, green, lime, amber, brown or grey. Buttons, tabs, highlights and charts all change together, in light and dark.
- **Wallpaper** takes the colour from the phone's wallpaper, and changes with it.
- **Pure black** makes dark mode black instead of dark grey, which saves battery on most phones.
- Red, green and blue still mean the same things: a problem, done, information.

**App icon**
- With *Themed icons* turned on in the phone's wallpaper settings, the Nirman icon takes the wallpaper's colour like other apps.

## 7.1 — One name per material

**Bills now match what is already in Rates**
- A line read from a bill, or typed with *Add item manually*, that is a material you already have under a slightly different name ("Mount air" for "Mountair", "Cemnt" for "Cement") gets the name in Rates as it is read, so its price goes into the same material.
- Common materials are named the same way every time: "Ultratech PPC 50kg" and "Cement - UT" both become **Cement**, brand UltraTech. Saria, reti, gitti, eent, conduit and other everyday words are covered, with brand short forms.
- Units are converted where they can be: 2 MT of TMT becomes 2,000 kg at the rate per kg, a brass of sand becomes 100 cft. The bill total stays as billed, and the line says how it was billed.
- A matched line shows **Matched to Rates; read as “…”**. Tap **Undo** if it is a different material, and it goes back to the name and unit on the bill.

**Merging in Rates**
- Rates now offers to merge names spaced differently ("Mount air" and "Mountair").
- Merging two materials in different units of the same kind (MT and kg, brass and cft, sqm and sqft) converts the prices, so they compare.

**Also**
- *Site report* is back as a button on Saved and Labour.
- The ⋮ menu opens without stuttering.

## 7.0 — A real Android app

Nirman is rebuilt with Android's own controls. It is the same app, updated in place: everything you saved is here as before.

**After the update**
- **Paste your Gemini key again once** (Settings → AI reading). The old app's storage can't be read by the new one; your lists don't need it.
- Small choices start fresh: the sort order, the last work type picked and the backup reminder. The project you used last opens.
- A copy of your data from before the update is kept on the phone, in case anything goes wrong.

**What feels different**
- Android's own bottom bar, back gesture (with the preview on Android 14 and later), bottom sheets you can drag, confirm dialogs and date picker.
- A **⋮ menu** in the header holds Preview, Share, Clear and Settings, so everything fits on small phones.
- **Undo** in a bar at the bottom after a delete.
- The number keyboard for quantities and rates, and the Photo Picker for bills with no permission to give.
- Long lists scroll smoothly, and PDFs are previewed by Android itself, page by page.
- Photos shared from WhatsApp still go straight into Purchases, BOQ or a vendor quote.

## 6.0 — One copy of every list

**How saving works now**
- **Save list moves the list into Saved.** The open purchase list or BOQ becomes the saved list, and an empty one is ready for the next bill. Nothing is copied, so there are never two versions of the same bill to keep in step.
- **Open a saved list to change it.** Tap *Open* in Saved: the list shows on its tab with *Editing the saved list…* above it, and every change goes straight into that list. Tap *Done* to go back to the open list for the next bill, which is kept as you left it.
- Every line was already saved on the phone the moment it was added or changed; that hasn't changed, and closing the app or a phone call never loses a line.

**Also since 5.0**
- Advances (kharcha) on labour contracts, and a red *Paid ahead* warning when a contractor is paid more than the work measured.
- Vendor quotes read and matched to the BOQ on the phone, offline.
- Backups as one .zip with every bill photo.
- Price checks against this site's last price first, then other sites, with their address.
- Rates worked out faster as your purchases grow.

## 5.3 — Vendor quotes without the internet

- **Vendor quotes are read on the phone.** A printed or typed quote is read on the phone and each line matched to the BOQ there, so quotes can be compared in a basement or on a plot with no signal. Gemini is only asked when the phone is unsure and you are online. Lines the phone can't match are left for you to match when you review the quote, as before.

## 5.2 — Advances (kharcha) in labour contracts

- **Record an advance (kharcha)** on a contract: cash given to the mistry before the work is measured, for wages or rations, apart from payments against measured work. Both count as paid; the contract shows how much of it was advances.
- **See when a contractor is paid ahead of the work.** When payments and advances add up to more than the work measured is worth (after retention and deductions), the contract and its card show *Paid ahead* in red, instead of a quiet "advance", so you can stop before paying more for work not yet done.

## 5.1 — Bill photos in backups, prices checked per site

- **Backups keep the bills.** *Save backup* now makes one .zip with everything and every bill photo, so a restored phone still has the proof behind each line. Save it to Google Drive every week; the app reminds you. Older .json backups still restore.
- **Prices are checked against this site first.** *Last paid* on a purchase, and the comparison of vendor quotes, now use the last price paid on this project. Only when this site has none is another site's price shown, with its address ("Last paid at Dwarka").

## 5.0 — Projects

- **Everything belongs to a project.** Tap the project name at the top to switch projects or start a new one (a name and its site address). Each project keeps its own open purchase list and BOQ, its saved lists and its labour contracts, so bills for one site never land in another's list.
- **Your existing data is sorted for you.** Saved lists and contracts go into one project per site address; those without an address go into *My site*. The open purchase list and BOQ go to the project you used last. Rename any project from its pencil button.
- **Move a saved list or contract** to another project from its *Edit* sheet.
- **Close a finished project** to tidy the list, or delete it with everything in it. Prices it added stay in Rates.
- **Rates covers all projects**, so you still see every price you have paid, wherever you bought it.
- **Site report** is now for the open project: no need to pick the site.
- Backups now include projects. Older backups still restore and are sorted into projects the same way.

Also since 4.0: every purchase counts in Rates as soon as it is added (with *Leave out of Rates*), sort and filter in Rates, suggestions under the field you type in, deliveries on BOQs, editing materials in Rates, bill photos kept with their lines, one line editor everywhere, and a preview before every share.

## 4.4 — Every purchase counts in Rates

- **No more Save rate.** A purchase with a rate shows in Rates as soon as you add it, so price trends and *Last paid* checks are never missing an entry. Fixing a line's rate or vendor fixes Rates too, and deleting the line takes the price out.
- **Leave out of Rates.** When a price isn't the usual rate (transport or an emergency charge included), tap the line and tick *Leave out of Rates*. The line keeps its total in the list and shows *Not in Rates*; untick it to count it again. The same box is there when you fix a price from Rates.

## 4.3 — Sort and filter in Rates

- **Sort materials in Rates** by the newest or oldest price, or by name (A–Z or Z–A). The phone remembers your choice.
- **One Filter button in Rates.** Work type, site address, vendor, brand, size and colour are now in one sheet, instead of three rows of buttons and boxes above the list. The filters you have on show under the buttons; tap one to remove it.
- **Suggestions under the box you are typing in.** Item names, units, vendors, site addresses and contractors are suggested in a list under the field, instead of a popup that covered it.
- Pulling a list past its end no longer stretches the screen and pushes the bottom bar under Android's buttons.
- Builds are now release builds signed with Nirman's own key, which Google Play Protect flags less often.

## 4.2 — Deliveries on BOQs, editing in Rates

- **Tick BOQ lines as delivered**, like purchases: on the open BOQ, or with *Delivered* on a saved BOQ, so you can see what is still to come on an order.
- **Edit a material straight from Rates.** Tap a material (or *Edit*) to open the same editor as BOQ and purchase lines: change its name or unit everywhere, or its brand, size, rate and vendor, either correcting the latest price or with *Save as today's price*. Tapping a price under *Prices* still fixes just that one.
- **Preview the site report** before sharing it, from Labour or Saved.
- Automatic crash reports (Sentry) are gone; nothing leaves the phone unless you send it. *Report a problem* and *Share log* stay.
- **Clear the *Deleted from Rates* list** (Settings → On this phone): their old added rates are deleted and their saved lines stop counting in Rates for good. Saved lists and site reports keep the lines.

## 4.1 — Bill photos and one line editor

- **See the bill behind the lines.** Photos you read are now kept with the lines they became. Tap **Bill** on a line, or **Bills** on a saved list, to check the reading against the photo; tap a photo to zoom in. A photo goes when its last line is deleted; *Settings → On this phone → Bill photos* frees the space. Photos are not in backups.
- **Pick the vendor when saving** a purchase list. When a bill was read with your own name or number as the vendor, type or pick the right one in *Save list* (or *Edit* on a saved list) and it goes on every line.
- **One editor everywhere.** The editor for purchase and BOQ lines (name, brand, model, size, colour, unit calculator, rate, vendor) now opens in **Rates** too: open *Prices* and tap a price to correct it.
- **Preview before sharing** the site report, quote comparison, order slip and labour statement, page by page as the PDF will look.
- **No stray delete buttons.** A saved list is deleted from its *Edit* sheet, and Rates has no bin on every card or price. *Delete all saved lists* is a labelled button at the end of Saved instead of a bare bin at the top.
- **Delivered** is a clearer button on each saved purchase list.
- *Settings → Deleted from Rates* is folded away, explains what it does, and a material leaves it by itself once the prices it hid are gone.
- Fixed: the status bar and navigation bar could be see-through, or the bottom bar could sit under Android's buttons.

## 4.0 — A new look for phones

**Easier to use on a phone**
- The five sections are now a **bar at the bottom** of the screen, within reach of your thumb, and they have clearer names: **Purchases, BOQ, Labour, Rates** (was Data) and **Saved** (was History).
- The top of the screen is much smaller, so more of your list fits. The total spent and the Save, Preview, Share and Clear buttons stay at the top while you scroll.
- **Your list comes first.** Tap the orange **Add** button to photograph a bill, speak or type what was bought, or add an item by hand. What you half-typed is kept if you close it, and readings in progress show above the list.
- To **delete an item**, tap it and use Delete next to Save (Undo still appears). No more red bin on every line to tap by mistake.
- **Dark mode**: Settings → Appearance → Phone, Light or Dark. The PDF preview stays white, like the file.
- **Easier to read**: larger small text, plain labels instead of spaced-out capitals, darker grey text, and bigger buttons for close, delete and retry.
- One look everywhere: every pop-up opens the same way, keeps clear of Android's gesture bar, and Back closes it (but not while something is being saved or shared). Tapping outside a form no longer closes it and loses what you typed. Orange marks the one main button on each screen.
- Clearer words: *Save list* (name, site address, work type, date), *Save rate* (was Index rate), *Read items* (says why it's greyed out), *Work type* everywhere, also in Excel and PDF files.
- Short notes such as "Backup restored" appear for a moment at the bottom instead of a box to dismiss.
- Fixed: on narrow phones (320–360 px) the Share and Clear buttons were cut off; Saved said "No matching sessions" when nothing had been saved.

**Since 3.0**
- **Bills are read on the phone first**, with no internet or API key; Gemini reads what the phone can't (Settings → How bills are read). Optionally keep bill photos for training. Settings → Model lists the models your key can use.

## 3.1 — Bills read on the phone

- **Bills are now read on the phone first**, with no internet or API key. Printed bills (photographed) and typed lists like "cement 50 bags 380" become lines in about a second, with vendor, date, quantities, rates and amounts, your learned corrections, and TMT / tile conversions.
- The phone checks its own reading (quantity × rate = amount, and the bill's total). When it isn't sure, as with most handwritten bills, Gemini reads it instead; without a key, the phone's reading is used.
- Choose in **Settings → How bills are read**: *Phone first* (default), *Phone only* (nothing is sent to Gemini) or *Gemini always*.
- **Keep bill photos for training** (off by default): each photographed bill is kept on the phone with the lines it became, as you correct them. Export them from Settings to train an AI that runs inside the app later.
- Settings → Model is now a list of the Gemini models your key can use. A bill that times out three times stops retrying, so the queue can finish. *Index rate* now saves the purchase list to History.

## 3.0 — Labour contracts

**New Labour tab**
- Add a **contract** for each contractor: name and phone, the job ("Internal plaster, 2nd floor"), site and category, and how they're paid: a **rate** per unit of work (₹18 per sqft, with an optional estimated quantity) or a **lump sum** (₹2,50,000), with optional **retention %** and start date.
- On a contract, record **work done** as it's measured (sqft done, or % of a lump-sum job), every **payment or advance** (cash, UPI, bank, cheque) and **deductions** (material you supplied, penalties). Tap an entry to correct it; deletes can be undone.
- Each contract shows **work done, paid and the balance due** (or the advance paid ahead of work), progress against the estimate, and the retention held. Closing a contract releases the retention.
- **Share a statement** with the contractor as PDF, Excel or JPG: the terms, each entry with a running balance, and what is due, for everything or a chosen period.
- Filter contracts by site, category and Ongoing / Closed; the side panel totals what's shown.
- The **site report** now adds a Labour section (work done and paid per contract), with materials + labour as the grand total. It's also on the Labour tab.

**Also since 2.0**
- Order slips, vendor-quote rates typed by hand, *Order from this vendor*, *Buy again* (2.2, 2.3).
- TMT bundles, tiles and ACP sheets converted to billed kg and sqft (2.1).
- *Settings → Report a problem*, the diagnostic log and optional crash reports (2.4). The log now includes what each step worked on (items, rates, vendors) so problems can be reproduced; photos and your API key are never included.
- *Index rate* asks which site the purchase was for, so indexed spends appear under the right site.

Backups now include contracts; backups from earlier versions still restore. Install over the existing app to keep your data.

## 2.4 — Report a problem

- **Settings → Problems and diagnostics**: the app now keeps a short log on the phone of errors, AI readings (success or failure, time taken, lines read), the steps you take and slow screens. It never records what you bought, prices, addresses, names or your API key.
- **Report a problem** opens a GitHub issue with your phone details and recent errors already filled in; add a note or screenshot and submit. **Share log** sends the full log as a text file (WhatsApp, email).
- **Automatic crash reports** (errors only) can be switched off in the same place.
- If a screen ever crashes, the app shows *Reload* instead of a blank page, and the error is logged.

## 2.3 — Faster quotes and repeat orders

- **Type a vendor's rates** without the AI: on a saved BOQ, *Add vendor quote → Type rates* lists each BOQ line with a rate box. Leave blank what they didn't quote, then review and confirm as usual. Works offline and without an API key.
- **Order from this vendor**: each vendor on the quote comparison has a button that opens an order slip already addressed to them, with only the items they quoted.
- **Buy again**: a saved purchase session has an *Again* button that copies its lines into a new purchase list, dated today, for repeat orders like cement and sand.
- Order slips have an optional **To (vendor)** line.

Also in this version: prices aren't counted twice when "Index rate" is used on a saved line; after saving you're asked to start a new list so bills don't merge; the chosen Work Type carries into Save; manual entry sits at the top; History and the backup reminder take less space.

## 2.2 — Order slips

- **Share → Order slip** on the BOQ tab: send a vendor the order itself instead of a blank BOQ. It lists each item with brand, size and quantity, and how it's ordered (e.g. "5 bundles of 12 mm"), with no rates.
- Add where to deliver, the delivery date, and the receiver's name and phone; your specifications / notes are included. The site and receiver are remembered for next time.
- Share it as PDF, Excel or JPG, like other reports. *BOQ for quotes* (rates left blank) is still there.

## 2.1 — TMT, tiles and ACP sheets

**Ordered in one unit, billed in another**
- **TMT bars**: a calculator turns bundles and loose bars into kg (using your bars per bundle: 8 mm 18, 10 mm 12, 12 mm 8, 16 mm 5, 20 mm 3, 25 mm 2, and the bar length). Enter the weighed kg from the slip and it shows the difference from standard weight.
- **Tiles and ACP sheets**: enter the sqft needed and the size in mm (600×1200, 800×1600, 1200×1800, 1200×3000 for tiles; 1200×2400, 1200×3000, 1200×3600 for ACP, or any size) plus an optional wastage %; it rounds up to whole pieces and gives the billed sqft.
- Each line keeps **how it was ordered** ("3 bundles + 4 bars of 12 mm", "37 tiles of 800×1600 mm"), shown on the list, in PDFs, Excel and site reports. Rates stay per kg or per sqft, so prices compare.
- The AI does the same when a slip says "5 bundles 16 mm" or "62 tiles 600x1200".
- Change bars per bundle, bar length and the sizes in *Settings → TMT, tiles and ACP*.

## 2.0 — Site reports and deliveries

**Site reports and delivery tracking**
- Tick each purchase line as **delivered** when it reaches the site: on the open list, or later from *History → Deliveries*. *Mark all delivered* does a whole bill at once, and History shows "N of M delivered".
- **History → Site report**: everything bought for one address, for all time or between any dates (*This FY* / *Last FY* shortcuts), for all or chosen work categories, and optionally only what was delivered. Grouped by category and material with quantities, average rates, amounts, vendors and bills, then every line. Share it as PDF, Excel or JPG.

**Also new since 1.1**
- **Share in any format**: the Share button on purchase lists, BOQs and quote comparisons offers PDF, Excel (.xlsx) or a JPG of each page.
- **Share into Nirman**: share bill photos or a text message from WhatsApp (or any app) straight into Purchases, a BOQ, or a vendor quote.
- **Add items by hand** without the AI, so lists and BOQs work fully offline.
- **Data tab filters** for vendor, brand, size/spec and colour; vendor-quote prices now keep their BOQ's category and site, so category filters include them.
- **Learned corrections** can be viewed, edited and deleted one by one in Settings.
- A **Settings** button next to the online status, and this **What's new** screen (shown once after an update, and any time from *Settings → On this phone*).

Backups from earlier versions still restore. Install over the existing app to keep your data.
