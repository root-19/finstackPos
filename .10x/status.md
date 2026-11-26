# Status

Feature: `landing-ui` · Branch: `feature/landing-ui` (from main @ e2910ac + Roles fix 5639ea7)

| Phase | State |
|---|---|
| 0 Brainstorm / spec | Done: user chose "Modern premium" (2026-11-10). Spec + ADR-002 |
| 4 Build | Done (see decisions/sde/landing-ui.md) |
| 5 Verify | Done locally (see decisions/qa/landing-ui.md); production Lighthouse Performance not measured yet |
| 4b Book a demo | Done: form + demo_requests table + email with .ics to DEMO_REQUEST_NOTIFY_EMAIL (efe195d) |
| 4c Redesign v3 | Done: "shop floor" format after jasprintcraft.vercel.app (ADR-003) |
| 4d App theme | Done: shop-floor theme for the whole app + dark/light toggle (ADR-004, branch feature/app-shop-theme) |
| 5b Security review | Done 2026-11-10: 2 HIGH (secret rotation: PayMongo live key, CvSU Gmail app password), 3 MEDIUM, 3 LOW. See reviews/2026-11-10-security-review.md |
| 5c Security fixes | Done: S3 demo limits, S4 self-hosted fonts, S6 seeder guard (236 tests) |
| 6 Delivery | Not pushed; **blocked on S1/S2 rotation before any deploy** |

Feature: `hardware-support` · no branch yet

| Phase | State |
|---|---|
| 1 Strategy | Done 2026-11-10: support existing merchant hardware through the browser; no device control. ADR-005, decisions/cto/hardware-support.md |
| 4 Build — task 1 scan anywhere | Done 2026-11-10 (uncommitted): `hooks/useScanToSearch.ts` + test, `Pos/Index.tsx` wired, no-match notice, `stockNotice`→`notice` rename. typecheck clean, 19 vitest pass, build OK. See decisions/senior-engineer/hardware-support.md |
| 5 Verify — task 1 | **Not done: never opened in a browser, never tried with a real scanner.** The `flushSync` first-character race is reasoned, not observed |
| 4 Build — tasks 2-3 | Not started: "Hardware setup" guidance in Settings, hardware compatibility page |
| Gate | **Nothing may be published claiming cash-drawer support until a real drawer + 80 mm printer has been tested** (~PHP 4-6k) |

Abandoned: `feature/landing-receipt` (receipt concept, rejected by the user).
Decided defaults: no backup claim (none configured); no promo video on the page.
Found outside scope (not fixed): POS catalog sync bug with soft-deleted categories/products; POS/Orders overflow on narrow screens.

Deferred with a trigger:
- **Cash management / register sessions** (float, pay-in/out, blind count, over/short, X/Z reading) — the real gap, ~0.5
  engineer-month. Promote at the 5th pilot merchant, or the first merchant who asks how to tell whether cash is short.
- **BIR accreditation** — needs its own ADR and research; a one-way architectural door. No claim about official receipts
  until then.

Risks: the hardware compatibility claim is unverified on real devices; `auto_print_receipt` still raises the print dialog
on every sale without Chrome `--kiosk-printing`; the POS barcode scanner only works while the search box has focus.
