# Spec: Landing page UI redesign ("modern premium")

Feature slug: `landing-ui` · Branch: `feature/landing-ui` · Status: **approved by user 2026-11-10** (chose "Modern premium" over
"Dark and bold" / "Bright and friendly"; the receipt concept on `feature/landing-receipt` was rejected and is abandoned).

## Goal
A totally new landing page (`resources/js/Pages/Welcome.tsx`): modern, premium, trustworthy (Square / Shopify POS / Linear
feel) for Philippine small-business owners on phones. Real product screenshots, honest claims, no video. Landing, legal
pages, the "/" route, `app.blade.php` head and the Register footer only; POS, sales, inventory and payroll untouched.

## Tokens (tailwind.config.js + `mk-*` classes in app.css)
- Font: Plus Jakarta Sans 400–800 (Google Fonts, `display=swap`, non-blocking), loaded only on marketing pages. The app keeps Figtree.
- Type: `.mk-h1` clamp(2.5rem, 6vw, 4.5rem) · `.mk-h2` clamp(2rem, 4vw, 3rem) · body 17px / 1.6 · headings -0.03em, `text-wrap: balance`.
- Layout: `max-w-content` 1200px, 16px mobile gutter, sections `py-20 lg:py-28`, 8-pt spacing.
- Radius: cards `rounded-2xl`, buttons `rounded-xl`, chips `rounded-full`. Shadows `shadow-soft` / `shadow-soft-lg`.
- Color: brand red `#C8102E` (brand-700) as the accent only (buttons, highlights, key icons); ink-900 for the dark band; gray-50 alternating.
- Buttons: primary brand-700 → hover brand-800 + 2px lift, secondary white + gray border; ≥48px tall.
- Icons: LineIcon 24px in a `mk-icon` tile (brand-50 bg, brand-600 icon).
- Motion: Reveal fade-and-rise, 150–250 ms hovers, all off under `prefers-reduced-motion`. No parallax, no autoplay.

## Sections
Nav (sticky, blur after scroll, full-screen mobile menu) → Hero (2 cols: copy + tablet/phone screenshots, "Sale synced ₱245.00"
card, soft red glow) → payments strip (GCash · Maya · QR Ph · PayMongo, text only) → problems/solutions 2×2 → See it in action
(Transaction3D, lazy, gray-50) → bento features (Sell, Serve, Stock, Team & Payroll [PRO, dark], Branches [PRO], Staff roles
[PRO], Sales & reports) → who it's for (scroll row on mobile, 3×2 desktop) → works with → how it works (4 steps + line) →
pricing (Free / Pro highlighted / Custom) → your data (dark) → testimonials (only if non-empty; empty) → FAQ accordion →
final CTA (red gradient card) → footer (Product · Contact · Legal).

## Honesty rules applied (verified in code)
- Free vs Pro: table ordering/pay and the orders board are Pro (`Merchant::tableOrderingActive`); Free gets a view-only table
  menu. Staff accounts/roles, Branches, Team & Payroll are Pro (`subscribed` middleware).
- Price, free product limit, max months and trial come from `Platform::*` props. No ₱199/100 hard-coded.
- Removed claims: "1 store and 1 register", "Unlimited registers and devices", "Custom integrations", "Dedicated onboarding",
  "Multiple branches" under Custom, "Priority support", "Volume pricing". Custom card has no feature list.
- "Cancel anytime" not used: Pro is prepaid with no auto-renewal, so the line reads "no auto-renewal and no hidden fees".
- CSV export = inventory + stock history only (no sales export). **No backup claim** (none configured).
- Works with: printing through the print dialog, keyboard-wedge scanners; no Bluetooth printing / cash drawer / camera scanning.

## Deviations from the brief (decided)
- **No promo video** (no hero video, no "Watch the full video" modal): the user asked twice for the video to be removed. The MP4 file is left alone.
- Font: Plus Jakarta Sans chosen although Figtree exists, because Figtree is the framework default and the user asked for a look unlike the old page.

## Done means
`npm run build` + `php artisan test` pass; Pest covers "/" props, SEO tags and legal pages; screenshots at 360/390/768/1024/1440
with no horizontal scroll; Lighthouse mobile reported as measured; small commits on `feature/landing-ui`, no push until asked.
