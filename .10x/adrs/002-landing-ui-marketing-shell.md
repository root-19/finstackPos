# ADR-002: Landing page as an isolated "marketing" shell with server-driven pricing

**Status:** Accepted
**Date:** 2026-11-10
**Feature:** landing-ui
**Author:** 10x-Team (Architect + Staff Engineer)
**Supersedes:** ADR-001 (receipt concept, on the abandoned `feature/landing-receipt` branch)

## Context
- The old `Welcome.tsx` autoplayed a 76 MB video, hard-coded ₱199 / "100 products" (real default: 50) and sold a Custom plan
  that does not exist. Price, product limit and trial are admin-editable in `App\Support\Platform`.
- No Inertia SSR: crawlers only see `app.blade.php`; every page shows a boot splash until React mounts (hurts LCP).
- The new design needs its own font and tokens, but the POS and back office must not change.

## Decision
1. **Server-driven facts.** "/" is an invokable `WelcomeController` passing `pricing` + `trial` from `Platform::*` (the
   `SubscriptionController` shape). Pro features derive from `PRO_MODULES`.
2. **Marketing flag in Blade.** `WelcomeController::meta()` adds `marketing` + `meta` view data for `/`, `/privacy`, `/terms`.
   Only then does `app.blade.php` print description/canonical/OG/Twitter tags, load Plus Jakarta Sans (non-blocking), and skip
   the boot splash. App pages render exactly as before.
3. **Isolated tokens.** `font-jakarta`, `max-w-content`, `shadow-soft(-lg)` in tailwind and `mk-*` component classes in app.css;
   the app's `sans`, `brand`, `ink` tokens are reused, not changed.
4. **Shared shell.** `Components/Landing/MarketingLayout` (nav + footer + `useVisitor`) used by Welcome and `Legal/*`. Links into
   the app are plain `<a>` (full load) so the app gets its own font/splash and the POS is cached by the service worker.
5. **Lean JS.** No new runtime libraries. Transaction3D is code-split and mounted only near the viewport. Screenshots are WebP
   with width/height; only the hero tablet image is eager (`fetchpriority=high`).
6. **Real screenshots** from a manual `LandingDemoSeeder` (separate demo store, never in DatabaseSeeder), captured with a
   Playwright script kept outside the repo, encoded with ffmpeg to `public/landing/*.webp` (≤150 KB each).

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Change global `fontFamily.sans` | One font | Changes POS/back office | "Landing only" |
| Pricing in `VITE_*` or hard-coded | Simple | Drifts from Admin → Pricing | Already wrong today |
| Static Blade landing page | Best LCP, crawlable | Second rendering stack, loses auth-aware CTAs | Fallback only if Lighthouse misses |
| Compressed video modal | Shows the promo | 15 MB asset, user asked to remove the video | User decision |

## Consequences
- Positive: no video on first load; prices always match the admin page; legal pages reuse the shell.
- Negative: `proModules.ts` pulls `NavIcons` into the Welcome chunk; `VITE_CONTACT_*` need a rebuild to change; two font stacks.
- Risk: client-only rendering caps LCP. Mitigations: no splash, non-blocking font, lazy below-the-fold, small chunk.
