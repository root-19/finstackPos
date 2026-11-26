# Handoff

## Current: Senior Engineer → QA / SDE (2026-11-10, `hardware-support`)

Read `.10x/decisions/senior-engineer/hardware-support.md`.

**Task 1 is built and green, but unverified in a browser.** `npm run typecheck` clean, `npx vitest run` 19 passed,
`npm run build` succeeded. Nothing committed.

**QA — manual pass needed on `/pos` (the automated tests cannot reach any of this):**
1. Tap a product tile, then type a barcode on the keyboard. It must land in the search box, **first character included** —
   that character is the one at risk. Repeat fast; a dropped first character is intermittent by nature.
2. Same after tapping a category chip and the cart.
3. With the checkout, discount, size-picker, hold and held-orders modals open: typing must go to the modal's own fields,
   never to the search box behind it.
4. Press Space with focus on a product tile — the tile must still activate.
5. Ctrl+R / Cmd+F / Tab / Escape must behave normally.
6. Scan or type a code that matches nothing: the red banner "No product found for …" appears and clears after 5 s.
   Type a term that matches products by name and press Enter: **no banner** (the grid shows them).
7. Ideally with a real USB scanner, not just a keyboard.

**Files:** `resources/js/hooks/useScanToSearch.ts` (new, exports `shouldCaptureKey` + default hook),
`resources/js/hooks/useScanToSearch.test.ts` (new), `resources/js/Pages/Pos/Index.tsx` (searchRef, hook call,
`onSearchKeyDown` no-match notice, `stockNotice`→`notice` rename).

**Gotchas for anyone touching this:**
- The `flushSync` in the hook is load-bearing, not decoration. Remove it and scanners drop their first character
  intermittently. Same pattern as `Components/Receipt.tsx:174-194`.
- The modal gate is `document.getElementById('modal')`, which works because `Components/Modal.tsx` puts `id="modal"` on a
  `Dialog` that `Transition` unmounts when closed. **If a POS modal is ever built without the shared `Modal`, scanning
  will fire behind it.**
- Space is intentionally not captured. Don't "fix" it.

**SDE — tasks 2 and 3 are still open** (Settings hardware guidance; landing compatibility page), both behind the
ADR-005 real-hardware gate.

## History

## CTO → PM / Architect / SDE (2026-11-10, `hardware-support`)

Read `.10x/decisions/cto/hardware-support.md` and `.10x/adrs/005-hardware-compatibility-not-device-control.md`.

**Decision:** support the hardware the merchant already owns, through the browser and the OS driver. No device control —
no WebUSB, no Web Serial, no Electron. A cash drawer is kicked by the printer driver on print; the app has no part in it.

Budget/timeline: ~2-3 days of work, ~PHP 4-6k of hardware. No engineer-month commitment.

**Three scoped items** (the user picked "fix the three gaps + document"):
1. **SDE** — capture keyboard-wedge scanner input globally on the POS page, so scanning works without focusing the search
   box first. Today: `resources/js/Pages/Pos/Index.tsx:215-228` only fires on the focused input. Beware false positives
   from normal typing in the cart/discount fields; a keystroke-timing heuristic is the usual approach.
2. **SDE / PM** — a "Hardware setup" guidance screen or help panel in Settings, next to the existing paper-width and
   auto-print controls (`resources/js/Pages/Settings/Edit.tsx:165-176`): Chrome `--kiosk-printing` + a default printer for
   silent printing, and the printer driver's "open cash drawer on print" option. Name the Chrome version tested.
3. **PM** — a hardware compatibility page for the landing site: printer ✅, drawer ✅ (via the printer), scanner ✅,
   customer display ✅ (one machine, two screens), and the honest limits.

**Hard gate before any of this is published:** buy a cash drawer + 80 mm thermal printer and verify that the drawer kicks
on print. Until then the compatibility claim is unverified and must not appear on the landing page, in the promo video, or
in sales conversations. The promo video's current treatment (drawer as a prop, captioned "the app does not control it") is
already correct and needs no change.

**Known limits to state plainly, not hide:** no "no sale" drawer open (the drawer only kicks with a printed receipt);
silent printing depends on how the merchant launches Chrome; the customer display needs one machine with two screens.

**Deferred, do not build now:** cash management / register sessions (float, pay-in/out, blind count, over/short, X/Z).
This is the real gap, ~0.5 engineer-month, mostly in making it work offline in IndexedDB. Promotion trigger is in
`status.md`.

**Flagged for the CTO's next session, not bundled here:** BIR accreditation and its Z-reading / accumulated-grand-total
requirements. One-way architectural door. Needs its own research and ADR before any official-receipt claim.

## History

## Security → SDE / owner (2026-11-10)
Read `.10x/decisions/security/landing-ui.md` and `.10x/reviews/2026-11-10-security-review.md`.
- Owner (can't be done in code): rotate the PayMongo live secret (S1); revoke the CvSU Gmail app password and set up a
  dedicated mailer (S2); delete the commented production DB lines from `.env` (S5).
- SDE: done S3, S4, S6. Remaining: S7 retention/prune for demo_requests.

## History

To: QA (after screenshots land).
Read: `.10x/specs/2026-11-10-landing-ui-design.md`, `.10x/adrs/002-landing-ui-marketing-shell.md`.

Check: `npm run build`, `php artisan test`, `/`, `/privacy`, `/terms` at 360/390/768/1024/1440 (no horizontal scroll),
signed-in vs guest CTAs, `trial_days = 0`, empty vs set `VITE_CONTACT_*`, keyboard (menu Esc, FAQ), reduced motion.

Gotchas: `Platform::flush()` after `Platform::set()` in tests; never `git add .` (`.claude/` is untracked in this checkout).
