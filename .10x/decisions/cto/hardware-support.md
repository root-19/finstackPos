# CTO — hardware-support

**Date:** 2026-11-10 · **ADR:** [ADR-005](../../adrs/005-hardware-compatibility-not-device-control.md) · **Status:** Decided, not yet built

## Decision

Support the hardware the merchant already owns, through the browser and the OS driver. Do not drive devices from the app.

**Build/buy verdict: neither — document and verify.** The capability largely exists; what is missing is proof and setup
guidance. No device-control code, no native wrapper, no hardware reselling.

## Business justification

The trigger was a competitor's feature page, not a customer. Pre-launch, zero merchants, zero deals lost to hardware.
That is not a business case, and the analysis was run to decide how *little* to build, not how much.

A cash drawer hangs off the receipt printer's RJ11 port and is kicked by the printer driver on print. The app has no part
in it. So "we don't support cash drawers" was never true — it was never tested or written down.

Positioning follows from this: *"use the printer and drawer you already have"* beats *"buy our hardware"* for Philippine
SMBs, and costs nothing to deliver.

## What is true today (verified in code, 2026-11-10)

| Peripheral | State | Evidence |
|---|---|---|
| Receipt printer, any driver-backed model | Works | `resources/js/Components/Receipt.tsx:174-194`; 58/80 mm + auto-print on `merchants` |
| Cash drawer via printer port | Works, untested on real hardware | No app code involved by design |
| Barcode scanner | Works, keyboard-wedge | `resources/js/Pages/Pos/Index.tsx:215-228` |
| Customer display | Works, one machine / two screens | `resources/js/lib/customerDisplay.ts` |
| Cash management (float, X/Z, over/short) | **Does not exist** | `Shift` is payroll scheduling, not a register session |

## Scope agreed (the user chose "fix the three gaps + document")

1. **Global scanner capture on the POS page** — scanning works without first clicking the search box. Small code change.
2. **"Hardware setup" guidance in Settings** — Chrome `--kiosk-printing` + default printer for silent printing; the printer
   driver's "open cash drawer on print" option; which paper width to pick.
3. **Hardware compatibility page** for the landing site, listing what works and what does not.

Estimate: ~2-3 days of work, plus ~PHP 4-6k of hardware.

**Gate: buy a drawer + 80 mm printer and verify before publishing any claim.** Until a real unit kicks, the claim is a
guess, and a false hardware claim is worse than silence.

## Trade-offs accepted

- The competitor's list stays longer; answered with positioning, not code.
- **No "no sale" drawer open** — the drawer only kicks when a receipt prints. Cashiers use the key for change.
- Silent printing depends on how the merchant launches Chrome; a setup step, not a product guarantee.
- Customer display remains one-machine.

## Explicitly rejected

- **Direct device control** (WebUSB / Web Serial ESC/POS / Electron). 3-6 weeks plus a permanent per-printer-model support
  burden, and it trades "works with every driver-backed printer" for "works with the models we tested." Revisit only if a
  paying merchant funds it.
- **"Open drawer" no-sale slip.** Wastes paper on every change-making. Revisit only on a real complaint.

## Deferred, not rejected

**Cash management / register sessions** — opening float, pay-in/out, blind count, over/short, X-reading, Z-reading.
This is the genuine gap and the real reason cash-heavy stores buy a POS. ~2-3 weeks (≈0.5 engineer-month), with the cost
concentrated in making it work offline in IndexedDB alongside the existing sale flow.

Premature at zero merchants. **Promotion trigger: the 5th pilot merchant, or the first merchant who asks how to tell
whether their cash is short.**

## Risks

| Risk | Mitigation |
|---|---|
| Claim published before hardware is tested | Hard gate above — nothing ships to the landing page until a real drawer kicks |
| Chrome kiosk-printing behaviour changes | Name the tested Chrome version in the setup guide |
| Cash management deferred and then forgotten | Review trigger recorded here and in `status.md` |

## Success criteria

Within one week, "will this work with my printer and drawer?" can be answered with a photo of a real setup and a link to
a page — with no new device-control code.

## Flagged for a separate decision

**BIR accreditation.** A POS issuing official receipts in the Philippines is registered with the BIR, which carries
Z-reading and accumulated-grand-total requirements. That is a one-way architectural door (tamper-evident counters,
immutable sales) and is larger than everything above. Not researched against current regulations. **No claim about
official receipts should be made until it has its own ADR.**
