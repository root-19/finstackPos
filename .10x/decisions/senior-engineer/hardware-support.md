# Senior Engineer — hardware-support

**Date:** 2026-11-10 · Upstream: [ADR-005](../../adrs/005-hardware-compatibility-not-device-control.md), [decisions/cto/hardware-support.md](../cto/hardware-support.md)

## Correction to the CTO handoff

The handoff said the scanner "only works while the search box has focus," implying it is broadly broken. Reading the code
first changed the picture: the search input has `autoFocus` (`resources/js/Pages/Pos/Index.tsx`), so **a scan works from
the moment the POS opens.** The bug appears only after the cashier taps a product tile, a category chip or the cart —
focus moves to that button and the keystrokes go nowhere. Real, but narrower than stated.

## Task 1 — scanner works wherever focus is (DONE)

### Approach chosen: redirect typing into the search box

A global `keydown` on `document`. When a printable character arrives, no modifier is held, the target is not a field and
no modal is open, the handler focuses the search input and seeds it with that character. **Everything after the first
character flows through the code that already existed** — the rest of the barcode lands in the now-focused input and the
closing Enter is handled by the field's own `onKeyDown`, exactly as a scan into a focused box always was.

### Alternatives rejected

| Alternative | Why not |
|---|---|
| **Buffered wedge with a timing heuristic** (collect characters, reset after a ~100 ms gap, commit on Enter if fast enough) | A tuning constant that will be wrong for some scanner — a slow Bluetooth unit would be silently ignored, the worst possible failure for a cashier. It also duplicates the matching logic that already exists in `onSearchKeyDown`. ~60 lines to maintain instead of ~25. |
| **Refocus the search box after every click** | Fights the user for focus and breaks keyboard navigation. |

### The non-obvious bug this had to avoid

A scanner types at roughly 1-5 ms per character. Seeding the controlled input with a plain `setSearch(key)` means React has
**not re-rendered by the time the second character arrives**, so the input's DOM value is still the old one, its `onChange`
overwrites what we set, and **the first character of every scan is lost** — intermittently, and only with real hardware.
Fixed with `flushSync`, which is already the codebase's answer to the same class of problem in
`resources/js/Components/Receipt.tsx:174-194` (flushing receipt data before `window.print()`).

### Design decisions worth knowing

- **Modal gate by DOM, not by state.** Every POS modal renders the shared `Components/Modal.tsx`, whose `Dialog` carries
  `id="modal"` and is unmounted by `Transition` when closed. So `document.getElementById('modal') !== null` answers "is a
  modal open?" for all six modals **and for any modal added later.** Enumerating the seven boolean states instead would
  have been correct today and quietly wrong the first time someone adds a modal and forgets this file.
- **Space is deliberately not captured.** Space activates the focused button and scrolls the page. Barcodes contain no
  spaces, so skipping it costs nothing and keeps buttons working. This matters because the main scenario *is* a focused
  button (the product tile the cashier just tapped), so buttons could not simply be excluded wholesale.
- **Modifiers, non-printable keys and IME composition are left alone**, so Ctrl+R, Cmd+F, Tab and Escape behave normally.

### Testability

The project has **no DOM test environment** (no jsdom, no testing-library; `vitest` runs in node). Rather than add
dependencies for this, the decision was extracted into an exported pure function, `shouldCaptureKey(context)`, that takes
plain facts instead of a DOM event. The hook only reads those facts off the event. The risky part is fully covered; the
remaining DOM plumbing is five lines.

### Files

- **New** `resources/js/hooks/useScanToSearch.ts` — `shouldCaptureKey()` + the `useScanToSearch()` hook. Sits with the
  existing `usePosSync`, `useHeldOrders`, `useOnlineStatus` hooks.
- **New** `resources/js/hooks/useScanToSearch.test.ts` — 9 cases: captures letters/digits/symbols on a button and on body;
  ignores Ctrl/Meta/Alt, non-printable keys, Space, fields, contenteditable, open modals, IME composition.
- **Changed** `resources/js/Pages/Pos/Index.tsx`:
  - `searchRef` on the search input; `useScanToSearch(searchRef, setSearch)`.
  - `onSearchKeyDown` now returns early on an empty box, and when nothing matches the code *even loosely* it raises a
    notice. If the text does match products by name, it stays quiet — the cashier can see them in the grid and pick one.
  - **Rename** `stockNotice` → `notice` (6 occurrences, mechanical). The banner is generic; reusing a name that says
    "stock" for a barcode message would have been misleading. Called out because it widens the diff.

### Verified
`npm run typecheck` clean · `npx vitest run` 19 passed (10 existing + 9 new) · `npm run build` succeeded.

### NOT verified
Behaviour in a real browser, and with real scanner hardware. The `flushSync` race in particular is reasoned from how React
batches, not observed. **Needs a manual pass before this is called done.**

## Tasks 2 and 3 — not started

2. "Hardware setup" guidance in Settings, beside the paper-width and auto-print controls
   (`resources/js/Pages/Settings/Edit.tsx:165-176`): Chrome `--kiosk-printing` + default printer for silent printing; the
   printer driver's "open cash drawer on print" option. Name the Chrome version tested.
3. Hardware compatibility page for the landing site.

Both are content more than engineering, and **both are behind the ADR-005 gate: nothing claiming cash-drawer support ships
until a real drawer kicks on a real printer.**
