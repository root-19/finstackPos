# Architect: landing-ui

See ADR-002 and `.10x/specs/2026-11-10-landing-ui-design.md`.

## Components
- `app/Http/Controllers/WelcomeController.php`: "/" props (`canLogin`, `canRegister`, `pricing`, `trial`) + `meta()` view data helper.
- `routes/web.php`: `/` (name `welcome`), `/privacy`, `/terms` (Inertia `Legal/Privacy`, `Legal/Terms`).
- `resources/views/app.blade.php`: `@isset($marketing)` → SEO tags + Plus Jakarta Sans, no boot splash.
- `resources/js/Components/Landing/`: MarketingLayout (nav, footer, useVisitor), DeviceFrames, Faq, LegalDoc, contact.ts,
  LineIcon, Reveal, Transaction3D (+ QrPattern, moved out of the deleted Showcase).
- `resources/js/Pages/Welcome.tsx`, `Pages/Legal/{Privacy,Terms}.tsx`; Register footer links.
- `database/seeders/LandingDemoSeeder.php` (manual), `public/landing/*.webp`, `public/og-image.png`.

## Boundaries
No edits to POS/Sales/Inventory/Payroll code or the app's existing tokens.

## Failure modes
- No contact env → footer shows "Support chat inside the app"; Custom card and final CTA drop "Talk to us".
- `trial.days = 0` → no trial chip, Pro CTA "Get Pro", FAQ says no trial right now.
- Unsafe contact URL (not https/viber/tel) → link is dropped.
