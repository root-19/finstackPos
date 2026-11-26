# ADR-005: Hardware compatibility through the browser, not device control

**Status:** Accepted
**Date:** 2026-11-10
**Feature:** hardware-support
**Author:** 10x-Team (CTO)

## Context

The promo video's hardware scene shows a cash drawer as a prop, with a caption saying the app does not control it. That
raised the question of whether FinstackPOS should support POS peripherals for real.

The trigger was competitive: a competitor lists hardware support on its feature page. There is **no sales signal** —
no prospect has asked for it, no deal has been lost over it. The product is pre-launch with zero merchants.

What the code actually has today (verified, with refs):

| Peripheral | State | Where |
|---|---|---|
| Receipt printer | Works through the OS driver | `resources/js/Components/Receipt.tsx:174-194` (`window.print()`), 58/80 mm + auto-print settings on `merchants` (`…000008_add_pos_settings_and_payments.php:20-21`) |
| Barcode scanner | Works, keyboard-wedge | `resources/js/Pages/Pos/Index.tsx:215-228` (Enter → exact match on `barcode` or `sku`) |
| Customer display | Works, same machine only | `resources/js/lib/customerDisplay.ts` (`BroadcastChannel`) |
| Cash drawer | No code at all | repo-wide search for `drawer\|kick\|escpos\|0x1B` → only a mobile-nav comment |
| Cash management | Does not exist | `Shift` is employee scheduling/payroll (`app/Models/Shift.php:23-32`), not a register session |

The app is a pure browser PWA — no Electron/Tauri/Capacitor, no WebUSB/Web Serial/WebHID/Bluetooth, no native or
printing package in `package.json` or `composer.json`.

The decisive physical fact: **a cash drawer is not a smart device.** It hangs off the receipt printer's RJ11/DK port and
is kicked by the printer driver when a receipt prints. Nothing in the application needs to address it. So the drawer was
never a feature gap — it was an unverified compatibility claim.

## Decision

**FinstackPOS supports the hardware a merchant already owns, through the browser and the OS driver. It does not drive
devices itself.**

Concretely:
- Printing stays `window.print()` through the OS print dialog. Any printer with a driver works — USB, Bluetooth or network.
- The cash drawer is supported by being wired to the printer and enabled in the printer driver. The app does not open it.
- Barcode scanners are supported as keyboard-wedge input.
- Compatibility is **documented and physically verified** on a real drawer + 80 mm printer before it is claimed anywhere.

Three gaps make the plain claim false today, and are in scope:
1. `window.print()` raises the print dialog on every sale, so `auto_print_receipt` is not actually automatic and the drawer
   only kicks after a human clicks Print. Fix: document Chrome `--kiosk-printing` + a default printer as the setup path.
2. The scanner only works when the POS search box has focus. Fix: capture wedge input globally on the POS page.
3. There is no way to open the drawer without a sale (no "no sale" / change-making open).
   Accepted as a limitation and stated plainly; not fixed.

## Alternatives Considered

| Alternative | Pros | Cons | Why not |
|---|---|---|---|
| **Direct device control** — WebUSB / Web Serial ESC/POS, or an Electron/native helper | Can open the drawer on command; silent printing; "real" hardware support | Chrome-only; a user gesture per device per browser profile; per-printer-model quirks; a permanent per-model support burden; abandons the pure-PWA deployment model | 3-6 weeks plus ongoing cost, and it **replaces something that works with every driver-backed printer with something that works only with the models we personally tested.** A downgrade sold as an upgrade. No demand to justify it. |
| **Cash management first** — register sessions: opening float, pay-in/out, blind count, over/short, X/Z reading | This is the real gap and the actual reason cash-heavy PH stores buy a POS; pure software, no hardware | ~2-3 weeks (≈0.5 engineer-month), and it must work offline in IndexedDB, where half the cost hides | Deferred, not rejected. Premature at zero merchants. Promote when a pilot asks "how do I know if my cash is short?" or at the 5th pilot merchant. |
| **"Open drawer" button via a no-sale slip** | Opens the drawer with no device control, using a tiny printed slip | Wastes paper on every change-making; a workaround presented as a feature | Not now. Revisit only if a merchant actually complains about the limitation. |
| **Do nothing** | Free | The three ⚠️ gaps stay, and the first live demo fails in front of a prospect: dialog pops, drawer does not kick, scanner ignores the scan | Rejected. The gaps are cheap to close and expensive to discover on stage. |

## Consequences

### Positive
- "Works with the printer and drawer you already own" is a stronger SMB pitch than "buy our hardware", and it is true.
- Zero ongoing device-support burden; no printer-model compatibility matrix to maintain.
- The PWA deployment model is preserved — no installer, no native build, works on any OS with Chrome.
- Cheap: days, not weeks, and it leaves the 0.5 engineer-month free for shipping.

### Negative
- The competitor's feature list still looks longer. This is answered by positioning, not by code.
- No "no sale" drawer open. A cashier making change outside a sale must open the drawer by its key.
- Silent printing depends on how the merchant launches Chrome — a setup step we must document, not something we control.
- Customer display still requires one machine with two screens.

### Risks
- **The compatibility claim stays unverified until hardware is bought and tested** (~PHP 4-6k for a drawer + 80 mm printer).
  Until then, nothing may be published claiming drawer support. This is the one non-negotiable step.
- Chrome's `--kiosk-printing` flag could change behaviour across versions; the setup guide must name a tested version.
- Deferring cash management is correct now but becomes wrong quietly. The review trigger below exists so it is not forgotten.

## Dependencies
- Blocks nothing. Additive and reversible (a two-way door) — direct device control stays possible later if a paying
  merchant ever funds it.
- **Separate, larger decision, deliberately not bundled here:** BIR accreditation. A POS issuing official receipts in the
  Philippines is registered with the BIR, which brings Z-reading and accumulated-grand-total requirements. That is a
  one-way architectural door (tamper-evident counters, immutable sales) and dwarfs everything in this ADR. It has not been
  researched against current BIR regulations. It needs its own ADR before any claim about official receipts is made.

## Review point
At the 5th pilot merchant, or the first time a merchant asks how to tell whether their cash is short — whichever comes
first. At that point, re-evaluate cash management (register sessions) for promotion into a build phase.
