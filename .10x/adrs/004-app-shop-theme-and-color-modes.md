# ADR-004: Whole-app "shop floor" theme with a dark/light toggle

**Status:** Accepted
**Date:** 2026-11-10
**Feature:** app-shop-theme (branch `feature/app-shop-theme`, on top of `feature/landing-ui`)

## Context
The user asked for the landing page's look across the whole system (merchant app, admin, POS), with bolder sidebar text,
then for a dark/light mode toggle. The app uses Tailwind grays and `bg-white` in ~900 places across 30+ pages.

## Decision
- **Theme by CSS variables, not per-page edits.** `gray-50…950`, `surface`, `card` and `brand-50…200` are
  `rgb(var(--x) / <alpha>)` in tailwind. `:root` holds the old light values; `html[data-theme="shop"]` (screen only)
  remaps them to the dark ink/paper palette. A few targeted overrides cover what variables can't: `bg-white` → card,
  white text on now-light gray chips → ink, small red text → a lighter red, form controls, square corners.
- **Print and receipts stay light**: the dark values live in `@media screen`; `.theme-light` (the on-screen Receipt) resets them.
- **Type everywhere**: Archivo (sans), Anton (page titles, stat numbers), IBM Plex Mono (labels, sidebar, table heads, badges).
- **Modes**: `data-theme="shop"` (dark, default) or `"light"` on app pages; marketing pages use `"marketing"` and are never
  switched. The choice is saved in `localStorage['finstack-theme']` and applied by an inline script in `app.blade.php`
  before the first paint. `ThemeToggle` sits in the app and admin top bars.

## Alternatives Considered
| Alternative | Why not |
|---|---|
| Tailwind `darkMode: 'class'` + `dark:` variants on every page | ~900 edits, easy to miss, long to review |
| Restyle only the shell | The user chose "Buong app" |
| Server-side saved preference (users table) | Needs a migration and a request; per-device is enough for now |

## Consequences
- New pages get both modes for free if they use grays/`bg-white`/design-system classes.
- Hard-coded hex colors or `text-black` on screen must use `.theme-light` or theme-aware classes.
- Risk: niche screens not checked by eye yet (checked: dashboard, POS, products, inventory, reports).
