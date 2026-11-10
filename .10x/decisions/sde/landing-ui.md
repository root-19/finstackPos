# SDE: landing-ui (what was built)

- `WelcomeController` + `/privacy`, `/terms` routes; `app.blade.php` marketing branch (SEO, Plus Jakarta Sans non-blocking, no splash).
- `Components/Landing`: MarketingLayout (sticky blur nav, full-screen mobile menu with Esc + focus handling, 3-col footer),
  DeviceFrames (tablet, phone; `className` positions an outer wrapper), Faq (one open, aria-expanded/controls), LegalDoc,
  contact.ts (https/viber/tel allowlist), QrPattern (moved out of Showcase), LineIcon (+10 icons). Showcase, DashboardPreview,
  useParallax deleted. Transaction3D kept, code-split, mounted near the viewport.
- `Welcome.tsx`: all sections in the spec; testimonials array empty (section hidden).
- `LandingDemoSeeder` (manual): demo café "Kapihan sa Kanto" (slug `landing-demo-kapihan-sa-kanto`, owner
  `landing-demo@finstack.test`, password random per run or `LANDING_DEMO_PASSWORD`), built through the app's own services.
- Assets: `public/landing/{register,checkout-gcash,orders,inventory,payslip}.webp` (24–72 KB), `public/og-image.png` (1200×630).
  Capture scripts live outside the repo (scratchpad `pw/shoot.cjs`, `pw/og.cjs`).

## Deviations
- No promo video / video modal (user asked to remove the video).
- Pricing note says "no auto-renewal and no hidden fees" instead of "Cancel anytime" (prepaid, nothing to cancel).

## Debt / follow-ups (not landing scope)
- POS catalog sync sends `deleted.*` as a JSON object when a store has soft-deleted categories/products
  (`SyncController::catalog`, `partition` keeps keys; needs `->values()`), which breaks the first POS sync.
- POS wider than a 390px phone when there are many category chips / the table-orders banner (grid item without `min-w-0`).
- Orders board badges overflow narrow columns.
