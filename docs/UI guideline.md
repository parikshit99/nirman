# UI guideline

How Nirman's screens look. Users are on site, on a phone, often in sunlight, sometimes with gloves. Keep every screen consistent. When a rule doesn't fit, change the shared piece rather than working around it in one screen. What the app says and how it behaves is in the [UX guideline](UX%20guideline.md).

These rules are for the app, `apps/native`.

## Shared pieces (`apps/native/src/components/ui/`)

Use these; don't hand-build them again. They have the same names and props as the old app's, except where Android has its own control.

| Piece | Use it for |
|---|---|
| `Sheet` | Anything shown over the app. `kind="sheet"` (default) is Android's bottom sheet (`react-native-true-sheet`), for choices and short forms; `"dialog"` is a centred box; `"screen"` is a full view with its own list; it slides in from the right, and a swipe from the left edge or Back slides it out (`SheetHeader`'s close button too). It handles Back, the status and gesture bars and the animation. Pass `busy` while saving or sharing (Back and outside taps do nothing). `closeOnBackdrop` only for sheets without typed input. `open={false}` keeps it loaded but hidden (the Add sheet keeps a half-typed entry). Use `SheetHeader` for the title and close button, `SheetLabel` + `SheetOption` for lists of choices. |
| `Button` | `primary` (orange) is the **one** main action on a screen or sheet; `secondary` (white, grey outline) for everything else; `danger` (solid red) only to confirm a delete or clear; `dangerOutline` for a Delete beside other actions; `ghost` for Cancel. Sizes `sm` (36 dp) and `md` (44 dp). `icon` is a Material icon name; the text is the child. No blue, black or dark grey actions. |
| `Tabs` | Any pick-one row: sub-tabs, status filters, settings choices. The white pill slides to the picked option. |
| `EmptyState` | Every empty list (texts: see the UX guideline). |
| `Field`, `NumberField`, `SuggestInput` (`fields.tsx`) | Every text and number input. `NumberField` opens the number keyboard. |
| `Select`, `DateField` | Pick from a list (Android's list sheet) and dates (Android's date picker). Never a home-made dropdown or calendar. |
| `OverflowMenu` | A ⋮ inside a screen, for its secondary actions that don't fit (Rates: Export, Delete). Not in the header. |
| `ActionFab` (`components/`) | Purchases and BOQ, bottom right above the tabs, as in Telegram: the round Add button and, above it, a small one that pops up Save, Share, Preview and Clear. Both slide away while scrolling down. |
| `Icon` | Material icon names only. |
| `PressScale` | A Pressable that shrinks a little while held. `Button`, `SheetOption` and chips use it; use it for anything else that looks like a button. |
| `RollingText` | Money totals and counts in headers: the digits roll to the new value. Monospace. |
| `PriceChart`, `Sparkline` | Price history (`react-native-svg`). |
| `useDialogs()` | `confirm` and `alert` are Android's own dialog, `prompt` a small sheet, `toast` a strip above the tabs, `undoable` the same strip with Undo and a countdown ring (after every `…Later` delete). Never React Native's `Alert` directly. |
| `LineEditor` (`components/`) | Editing a material line anywhere: purchase and BOQ lines, prices in Rates. Extend it; don't add another line form. |
| `DocumentPreview` (`components/`) | Before sharing any PDF (list, site report, quote comparison, order slip, statement): show the file as it will be shared, then Share. |
| `ScreenHeader` (`components/`) | The header of every tab: the project, the status, the Settings gear (a page of its own) and a second row such as the total. Tab actions are on the tab, not here. |

## Motion

Movement is after Telegram's: fast in, soft landing, short springs. Take the curves and durations from `src/lib/motion.ts` (`EASE_OUT`, `EASE_IN`, `DURATION`, `SPRING`), never numbers picked per screen. Animate only `transform` and `opacity` (they run on the UI thread with Reanimated). Things that move: screens and sheets, the Add button and its actions, the undo strip, the Tabs pill, totals (`RollingText`), lines coming and going (`ItemLog`), pressed buttons (`PressScale`), and the switch between light and dark (`useCircleReveal`, from the finger).

## Colour

- Only the colours from `useColors()` (`apps/native/src/theme.ts`). No other hex, `rgb()` or named colours in components (the colour circles in *Settings → Appearance* show their own colours). When a screen needs a shade that isn't there, add it to **both** `light` and `dark`.
- **The accent can be any colour.** The `orange…` shades and `brandPrimary` are Nirman's orange by default, but are worked out again from the colour picked in *Settings → Appearance* or the wallpaper's (`packages/shared/src/palette.ts`). So use them for their role (the main action, a highlight), never because something must look orange. *Pure black* turns dark mode's `white`, `brandGray` and `gray50` black.
- **Meanings never change:**
  - **orange (the accent):** the main action and the brand, in whatever colour is chosen
  - **red:** delete, errors, prices higher than last time
  - **green:** delivered, saved, prices lower
  - **grey:** everything else.
- **Text on a coloured background** uses `white` (it turns dark in dark mode, which is intended); on the accent (`brandPrimary`, `orange500`: buttons, the Add button, picked chips) it uses `onPrimary`, which is white or near-black, whichever reads on the chosen colour. Only text on red buttons and the page images in `DocumentPreview` stay white in both modes.
- **The PDF preview stays light** (paper), in dark mode too.
- **Check every screen in dark mode** (*Settings → Appearance → Dark*), and with a light colour (amber) and a dark one (indigo).

## Text

- **Smallest size 12** (`fontSize: 12`). The PDF preview is the only exception: it mirrors the PDF.
- **Labels and headings** are plain sentence case: 12, bold, `gray600`. Not upper case, letter-spaced or monospace.
- **Monospace only for numbers:** amounts, rates, quantities, dates in fields. Everything else uses the system font (Roboto).
- **Buttons** may be upper case with a little letter spacing.
- **Hint and secondary text** is `gray500` at the lightest. `gray300`/`gray400` are only for icons and borders.

## Layout

- **Phones first:** bottom tab bar (native), a slim header with the total, the list first, the orange **Add** button opens the entry form in a sheet.
- **Must fit 320 dp wide without sideways scrolling.** The header holds only the project, the status and Settings; a screen's actions go on the screen (ActionFab, buttons, or a ⋮ inside it) rather than shrinking. **Never cut off a money amount**; make room instead (wrap the label, not the number).
- **Status and gesture bars:** use `useSafeAreaInsets()` (`react-native-safe-area-context`). `Sheet`, `ScreenHeader`, the tab bar and the Add button already do. The app is edge to edge (SDK 36).
- **Lists** scroll on their own; content leaves room at the bottom for the tab bar and, on Purchases and BOQ, the Add button.
- **Touch targets at least 40 dp.** Icon-only buttons have a 16–20 dp icon with padding to reach 40 dp (or `hitSlop`), and an `accessibilityLabel`.
- **Wide screens** (tablets, 1024 dp and wider) may show the entry form beside the list. Check with `useWindowDimensions()`.

## Feel

- Every pressable darkens when pressed.
- `Button`, `Tabs`, the tab bar and Snackbars buzz through `haptic()` (`lib/haptics.ts`, Android's own touch feedback). A custom main action that isn't a `Button` calls `haptic('tap')` itself.
- Text can't be selected, except in fields and text people may want to copy (contract notes: `selectable`).
- Use Android's own controls where they exist: back (with the predictive back preview), the date picker, the share sheet, the Photo Picker, dialogs, Snackbars.

## Checking a UI change

- **Run** `npm run lint` and `npm run build`.
- **Look at the screen on a phone or emulator** in light and dark, at the normal font size and at 1.3× (*Settings → Display → Font size*). Check the narrowest phone you have, or an emulator at 320 dp.
