# Handoff

## Current: Security → SDE / owner (2026-11-10)
Read `.10x/decisions/security/landing-ui.md` and `.10x/reviews/2026-11-10-security-review.md`.
- Owner (can't be done in code): rotate the PayMongo live secret (S1); revoke the CvSU Gmail app password and set up a
  dedicated mailer (S2); delete the commented production DB lines from `.env` (S5).
- SDE: done S3, S4, S6. Remaining: S7 retention/prune for demo_requests.

## History

To: QA (after screenshots land).
Read: `.10x/specs/2026-11-10-landing-ui-design.md`, `.10x/adrs/002-landing-ui-marketing-shell.md`.

Check: `npm run build`, `php artisan test`, `/`, `/privacy`, `/terms` at 360/390/768/1024/1440 (no horizontal scroll),
signed-in vs guest CTAs, `trial_days = 0`, empty vs set `VITE_CONTACT_*`, keyboard (menu Esc, FAQ), reduced motion.

Gotchas: `Platform::flush()` after `Platform::set()` in tests; never `git add .` (`.claude/` is untracked in this checkout).
