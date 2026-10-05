# What's new in Nirman

Versions are MAJOR.MINOR.PATCH. Each section here is a feature (minor) or major release; fixes in between only raise the last number and are not listed. Newest first.

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
