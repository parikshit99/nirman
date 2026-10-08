# UX guideline

How Nirman behaves and what it says. How it looks is in the [UI guideline](UI%20guideline.md).

## Who it's for

Site supervisors and owners, on a phone, on site: in sunlight, with gloves, with a weak or no connection, often in a hurry. Every screen should work with one hand and a quick glance, and never lose what someone typed or photographed.

## Principles

1. **Lists first.** Each tab opens on its list. Adding is one tap away (the orange **Add** button).
2. **One main action per screen or sheet** (the orange button). Everything else is secondary or in the ⋮ menu.
3. **Everything is saved as it is made.** Each line is written the moment it is added or changed. *Save list* only moves the open list into Saved.
4. **Works offline.** Every screen works without internet. Entries made offline are queued and read once the phone is online, and the app says so ("Waiting for internet", "Being read").
5. **The phone first, Gemini when needed.** Bills are read on the phone where possible. The user picks this in *Settings → How bills are read*.
6. **Nothing typed is lost.** Forms in sheets don't close on an outside tap, and the Add sheet keeps a half-typed entry when it is closed.
7. **Preview before sharing.** Every PDF is shown as it will be shared (`DocumentPreview`) before the share sheet opens.

## Words

Use these everywhere, including toasts, dialogs, Excel/PDF columns, the CHANGELOG and the README:

| Use | Not |
|---|---|
| Purchases (tab), purchase list | Spend, audit, purchase log |
| BOQ, BOQ draft | |
| Labour, contract | |
| Rates (tab), rates by material | Data, material database |
| Saved (tab), saved list | History, session, record |
| Work type | Category, work category |
| Site address | Address / location |
| Save list | Site metadata, confirm save |
| Leave out of Rates | Exclude from benchmark, index rate, indexed |
| Read items, being read | AI extraction, extraction queue |

- **Plain sentences a site supervisor understands.** No internal words: record, session, index, metadata, extraction, sync conflict, error codes.
- **Plurals must agree:** "1 item", "2 items".
- **Amounts** in rupees with Indian grouping (₹1,25,000). **Times and dates** in IST.
- **Messages say what happened and what to do next:** "No internet. The bill will be read when you're back online." Not "Request failed".

## Feedback

| Situation | Use |
|---|---|
| Something just worked and needs no choice | `toast` (a Snackbar): "Backup restored", "List saved" |
| A choice is needed, or something failed and the user must act | `confirm` / `alert` (Android's own dialog) |
| A short typed answer (a name) | `prompt` |
| Work in progress (saving, sharing, reading) | `busy` on the sheet or button, with a short label ("Reading 2 photos…") |

Never an alert for something that just worked. Never a silent failure: if something didn't happen, say so.

## Deleting

Deleting is never silent:
- **Use Undo** where possible (the `…Later` actions show *Undo* in a Snackbar).
- **Otherwise ask first** with a `danger` confirm: a saved list, a contract, clearing a draft, delete all.

Where Delete lives:
- **Lines, prices and saved lists** are deleted from their edit view (`LineEditor`'s Delete, the saved list's Edit sheet). Not with a bin on every row or card (it was tapped by mistake), and not with swipe-to-delete.
- **"Delete all"** is a labelled button at the end of its list, not a bare icon.
- **Small rows that undo** (contract entries, queued readings, photos in an entry) may keep an icon button.

## Empty lists

Every empty list uses `EmptyState` with one of two texts:
- **Nothing yet:** say where things come from and offer the action ("No purchases yet. Tap Add to photograph a bill or type what was bought.").
- **Nothing matches:** say to check the filters or search.

Hide filters, Select and Export when there is nothing to act on.

## Data safety the user sees

- **The app never starts empty silently.** If data can't be opened, it says so and offers *Restore from backup*.
- **Backup reminder** after a week without one. *Save backup* shares one file with everything, photos included.
- **Restore** asks for confirmation (it replaces what is on the phone), then shows a toast.
- **The Gemini key** is asked for once, can be skipped (items can be typed in), and is tested with *Test key*.

## Releases

- A new feature is announced in the *What's new* screen (from the CHANGELOG section), once, after the update.
- **Write the CHANGELOG for site supervisors:** what they can now do, in the words above. Not how it was built.
- **A change in how the app is used every day is a major release**, and its notes explain the change step by step.
