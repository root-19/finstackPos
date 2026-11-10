# QA: landing-ui

Run 2026-11-10 on `feature/landing-ui`.

- `php artisan test`: 214 passed (incl. `tests/Feature/LandingTest.php`: live pricing/trial props, SEO tags + font only on
  marketing pages, boot splash kept on app pages, `/privacy` + `/terms` 200 with canonical).
- `npx tsc` clean; `npm run build` OK (Welcome chunk 8.3 KB gzip, Transaction3D split 4.8 KB gzip).
- Playwright, `/`, `/privacy`, `/terms` at 360/390/768/1024/1440: no horizontal scroll, one h1, every image has alt +
  width/height, no page errors. Nav/footer links raised to ≥44px.
- Lighthouse mobile (local dev server, Vite dev assets, http): Accessibility 100, SEO 100, Best Practices 82 (only
  "not HTTPS" left after fixing a React `fetchPriority` warning), CLS 0. **Performance 36 is not representative**: the dev server
  serves ~29 unbundled JS modules. Production Performance/LCP still has to be measured on the built site over HTTPS.
