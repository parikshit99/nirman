# UI guideline

How Nirman's screens look. Users are on site, on a phone, often in sunlight, sometimes with gloves. What the app says and how it behaves is in the [UX guideline](UX%20guideline.md).

These rules are for the app, `apps/native`.

## Android first

Nirman is a React Native app with Android's own controls. **Where Android has a control, a behaviour or a convention, use it; build our own only where it has none.** The design system is [Material 3](https://m3.material.io) (Material You).

The 6.x app was a WebView, and many of its rules existed only to make a web page look like Android (home-made pressed states, a copied colour palette, monospace numbers, upper-case buttons). Those rules are gone. If a rule below seems to stop a native feature, the native feature wins: change the rule in the same PR.

Keep every screen consistent. When a rule doesn't fit, change the shared piece rather than working around it in one screen.

## Shared pieces (`apps/native/src/components/ui/`)

Use these; don't hand-build them again. Each one should wrap Android's control where one exists, or follow Material 3 where it doesn't.

| Piece | Use it for |
|---|---|
| `Sheet` | Anything shown over the app. `kind="sheet"` (default) is Android's bottom sheet (`react-native-true-sheet`), for choices and short forms; `"dialog"` is a centred dialog; `"screen"` is a full view with its own list; it slides in from the right, and a swipe from the left edge or Back slides it out (`SheetHeader`'s close button too). It handles Back, the status and gesture bars and the animation. Pass `busy` while saving or sharing (Back and outside taps do nothing). `closeOnBackdrop` only for sheets without typed input. `open={false}` keeps it loaded but hidden (the Add sheet keeps a half-typed entry). Use `SheetHeader` for the title and close button, `SheetLabel` + `SheetOption` for lists of choices. |
| `Button` | Material 3 buttons. `primary` (filled, the accent) is the **one** main action on a screen or sheet; `secondary` (outlined, or tonal) for other actions; `danger` (filled, error colour) only to confirm a delete or clear; `dangerOutline` for a Delete beside other actions; `ghost` (text button) for Cancel and other light actions. `icon` is a Material icon name; the text is the child. |
| `Tabs` | Any pick-one row: sub-tabs, status filters, settings choices (Material segmented buttons). |
| `EmptyState` | Every empty list (texts: see the UX guideline). |
| `Field`, `NumberField`, `SuggestInput` (`fields.tsx`) | Every text and number input. `NumberField` opens the number keyboard. Set `returnKeyType` (*Next* between fields, *Done* on the last) so the keyboard moves through a form. |
| `Select`, `DateField` | Pick from a list (Android's list sheet) and dates (Android's date picker). Never a home-made dropdown or calendar. |
| `OverflowMenu` | The ⋮ menu (Android's popup menu) for secondary actions that don't fit, in a screen or in its header. |
| `ActionFab` (`components/`) | Every list tab, bottom right above the tabs: the floating Add button (Purchases and BOQ: add items; Saved: new BOQ; Labour: new contract; Rates has none) and, above it, a small tonal ⋮ one (the accent's pale shade, so it stands out from the cards in dark mode) that opens the tab's other actions (Save, Share, Preview, Clear; Export CSV, Delete). A tab with only one other action (Saved: New purchase list; Labour: Site report) shows that action's icon, and a tap runs it. Don't repeat an action that is already on the screen (Site report in the header, Delete all at the end of the list). Both slide away while scrolling down (`useHideOnScroll`). Give the list `paddingBottom: 96` so its last row clears them. |
| `TrashButton` (`components/`) | The bin on a row or card that can be deleted (purchase and BOQ lines, saved lists, contracts, materials in Rates). It deletes at once; the caller shows `dialogs.undoable`. |
| `SwipeRow` (`components/`) | A purchase or BOQ line that swipes right for Delivered (or Not delivered). Not for deleting. |
| `Icon` | Material icon names only. |
| `Pressable` | Everything that can be tapped: React Native's Pressable with Android's ripple. Import it from `components/ui/Pressable`, never from `react-native`. On a coloured background pass `android_ripple={{ color: c.rippleOnPrimary, foreground: true }}` (or `rippleOnDanger`); `android_ripple={null}` for a backdrop. Give rounded shapes `overflow: 'hidden'` so the ripple keeps to the corners. |
| `PressScale` | The same, and it also shrinks a little while held: buttons, chips and cards. |
| `RollingText` | Money totals and counts in headers: the digits roll to the new value. |
| `PriceChart`, `Sparkline` | Price history (`react-native-svg`). |
| `useDialogs()` | `confirm` and `alert` are the app's own Material 3 dialog (headline, supporting text, Cancel as a text button and the answer as a filled one, red for `danger`; Back or a tap outside cancels), `prompt` a small dialog with a field, `toast` a Snackbar above the tabs, `undoable` the same Snackbar with Undo and a countdown ring (after every `…Later` delete). Use these rather than React Native's `Alert`, so wording and haptics stay the same everywhere. |
| `LineEditor` (`components/`) | Editing a material line anywhere: purchase and BOQ lines, prices in Rates. Extend it; don't add another line form. |
| `DocumentPreview` (`components/`) | Before sharing any PDF (list, site report, quote comparison, order slip, statement): show the file as it will be shared, then Share. |
| `ScreenHeader` (`components/`) | The top app bar of every tab: the project, the status, Settings, a second row such as the total, and the backup reminder (`BackupReminder`) when one is due. It may hold up to two action icons and a ⋮ for the tab's less used actions; the main ones stay on the Add button and the button above it. |

## Native features to use

Use these when a screen or feature needs them, rather than a home-made version:

- **Touch feedback:** Android's ripple on everything that can be tapped (`Pressable` above). No pressed colours of our own.
- **Back:** the system Back and the predictive back preview, on every screen and sheet. Never a screen that only closes with an on-screen button.
- **Dynamic colour:** the wallpaper's colour (Android 12+), already offered in *Settings → Appearance*. Dark mode follows the system unless the user picks one.
- **System font size and display size:** honoured everywhere (Android 14 scales text up to 200%). Don't cap scaling with `maxFontSizeMultiplier` except on a piece that can't grow (the tab bar labels), and then only as little as needed.
- **TalkBack:** every icon-only button has an `accessibilityLabel`; pressables have an `accessibilityRole`; a status shown only by colour (delivered, price up) is also in text or the label.
- **Haptics:** through `haptic()` (`lib/haptics.ts`, Android's own touch feedback constants).
- **System pickers and sheets:** the share sheet, the Photo Picker, the camera, the date picker, the document picker.
- **Notifications** for work that finishes while the app is closed or in the background (queued bills read, a backup reminder), on a channel the user can turn off in Android's settings. Ask for the notification permission when the feature is first used, not at launch.
- **App shortcuts** (long press on the launcher icon), e.g. *Photograph a bill*, *Add to Purchases*.
- **Share into the app** (already there), and Android's text selection menu (copy, share) on text worth copying.
- **Pull to refresh** (`RefreshControl`) only where a list can change from outside (later, with sync).
- **Per-app language** (Android 13+) when the app is translated.

## Motion

Movement is after Telegram's: fast in, soft landing, short springs. Take the curves and durations from `src/lib/motion.ts` (`EASE_OUT`, `EASE_IN`, `DURATION`, `SPRING`), never numbers picked per screen. Animate only `transform` and `opacity` (they run on the UI thread with Reanimated). Things that move: screens and sheets, the Add button and its actions, the undo Snackbar, the Tabs selection, totals (`RollingText`), lines coming and going (`ItemLog`), pressed buttons (`PressScale`), and the switch between light and dark (`useCircleReveal`, from the finger). Respect Android's *Remove animations* setting (`useReducedMotion`): show the end state without the movement.

## Colour

- **Material 3 colour roles**, from `useColors()` (`apps/native/src/theme.ts`): `primary` / `onPrimary`, `primaryContainer` / `onPrimaryContainer`, `surface`, `surfaceContainer` (low, high), `onSurface`, `onSurfaceVariant`, `outline`, `outlineVariant`, `error` / `onError`, `errorContainer`, and Nirman's own `success` / `successContainer`. They are worked out for light and dark from the accent (Nirman's orange by default, a colour picked in *Settings → Appearance*, or the wallpaper's; `packages/shared/src/palette.ts`).
- No hex, `rgb()` or named colours in components (the colour circles in *Settings → Appearance* show their own colours). When a screen needs a colour that isn't there, add a role to `theme.ts` for **both** light and dark, rather than a one-off shade.
- **Surfaces, not borders:** separate cards and sections with surface tones (`surfaceContainer`), as Material 3 does, rather than grey outlines and shadows everywhere.
- **Meanings never change:**
  - **primary (the accent):** the main action and the brand, in whatever colour is chosen
  - **error (red):** delete, errors, prices higher than last time
  - **success (green):** delivered, saved, prices lower
  - **neutral:** everything else.
- **Text on a coloured background** uses its `on…` role (`onPrimary` on the accent, `onError` on red), which is light or dark, whichever reads.
- **The PDF preview stays light** (paper), in dark mode too.
- **Check every screen in dark mode**, with pure black, and with a light accent (amber) and a dark one (indigo).

## Text

- **The Material 3 type scale**, from Roboto (the system font): body 14–16 for content, title 16–22 for headings, label 12–14 for buttons, chips and field labels. Pick the role, not a size per screen.
- **Smallest size 12.** Smaller text doesn't read in sunlight. The PDF preview is the only exception: it mirrors the PDF.
- **Sentence case** for everything, buttons and tabs included (Material 3). No upper case, letter spacing or monospace labels.
- **Numbers line up with tabular figures** (`fontVariant: ['tabular-nums']`) in Roboto, not a monospace font: amounts, rates, quantities, counts and dates in columns, and in `RollingText`.
- **Secondary text** is `onSurfaceVariant`. `outline` and `outlineVariant` are for icons, dividers and borders, not text.

## Layout

- **Phones first:** the bottom navigation bar (native), a top app bar with the total, the list first, the floating **Add** button opens the entry form in a sheet.
- **Must fit 320 dp wide without sideways scrolling**, at the largest font size too. **Never cut off a money amount**; make room instead (wrap the label, not the number).
- **Edge to edge** (SDK 36): use `useSafeAreaInsets()` (`react-native-safe-area-context`) for the status and gesture bars. `Sheet`, `ScreenHeader`, the tab bar and the Add button already do.
- **Lists** scroll on their own (`FlashList` for long ones); content leaves room at the bottom for the tab bar and the Add button.
- **Touch targets at least 48 dp** (Android's minimum). A button may look smaller (40 dp) when its touch area reaches 48 dp with padding or `hitSlop`.
- **Wide screens** (tablets, foldables open, 840 dp and wider) may show the entry form beside the list. Check with `useWindowDimensions()`.

## Feel

- Everything that can be tapped shows the ripple; buttons and cards also shrink a little (`PressScale`).
- `Button`, `Tabs`, the tab bar and Snackbars buzz through `haptic()`. A custom main action that isn't a `Button` calls `haptic('tap')` itself.
- Text people may want to copy (names, phone numbers, addresses, notes, amounts on a statement) is `selectable`, which gives Android's copy and share menu. Other text isn't.

## Checking a UI change

- **Run** `npm run lint` and `npm run build`.
- **Look at the screen on a phone or emulator** in light and dark, at the normal font size and at the largest (*Settings → Display → Font size*), with TalkBack on for a new screen, and with *Remove animations* on. Check the narrowest phone you have, or an emulator at 320 dp.

## Catching up

Parts of the app still follow the 6.x WebView rules. New screens follow this guideline; the shared pieces are moved over as separate fixes (patch releases), one piece at a time, so every screen changes together:

| Today | Moving to |
|---|---|
| `theme.ts` holds 6.x's Tailwind palette (`gray50`…`gray900`, `orange…`, `red…`, `green…`, `blue…`, and `white`/`brandGray` that turn dark in dark mode) | The Material 3 roles above, generated from the accent with `palette.ts`. Add the roles first beside the old names, move screens over, then remove the old names |
| `Button` sizes 36 and 44 dp | 40 dp visible, 48 dp touch area |
| `Tabs`' sliding white pill | Material segmented buttons |
| Grey outlines on cards | Surface tones |
