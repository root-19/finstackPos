# Handoff

To: QA (after screenshots land).
Read: `.10x/specs/2026-11-10-landing-ui-design.md`, `.10x/adrs/002-landing-ui-marketing-shell.md`.

Check: `npm run build`, `php artisan test`, `/`, `/privacy`, `/terms` at 360/390/768/1024/1440 (no horizontal scroll),
signed-in vs guest CTAs, `trial_days = 0`, empty vs set `VITE_CONTACT_*`, keyboard (menu Esc, FAQ), reduced motion.

Gotchas: `Platform::flush()` after `Platform::set()` in tests; never `git add .` (`.claude/` is untracked in this checkout).
