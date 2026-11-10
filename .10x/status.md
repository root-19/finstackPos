# Status

Feature: `landing-ui` · Branch: `feature/landing-ui` (from main @ e2910ac + Roles fix 5639ea7)

| Phase | State |
|---|---|
| 0 Brainstorm / spec | Done: user chose "Modern premium" (2026-11-10). Spec + ADR-002 |
| 4 Build | Done (see decisions/sde/landing-ui.md) |
| 5 Verify | Done locally (see decisions/qa/landing-ui.md); production Lighthouse Performance not measured yet |
| 4b Book a demo | Done: form + demo_requests table + email with .ics to DEMO_REQUEST_NOTIFY_EMAIL (efe195d) |
| 4c Redesign v3 | Done: "shop floor" format after jasprintcraft.vercel.app (ADR-003) |
| 6 Delivery | Not pushed; waiting for the user |

Abandoned: `feature/landing-receipt` (receipt concept, rejected by the user).
Decided defaults: no backup claim (none configured); no promo video on the page.
Found outside scope (not fixed): POS catalog sync bug with soft-deleted categories/products; POS/Orders overflow on narrow screens.
