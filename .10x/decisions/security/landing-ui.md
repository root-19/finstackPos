# Security: landing-ui (+ app-shop-theme)

Full report: `.10x/reviews/2026-11-10-security-review.md`.

## Threat model (short)
- Public write surface: `POST /book-demo` (bots, spam, mail flooding). Everything else new is read-only or auth flow.
- Shared Gmail SMTP account = single point of failure for demo notices **and** password resets.
- PII: `demo_requests` (RA 10173).

## Open findings
- **HIGH** S1 rotate PayMongo live secret (exposed in session output).
- **HIGH** S2 replace the CvSU Gmail app password with a dedicated send-only mailer.
- ~~MEDIUM S3~~ FIXED: per-IP minute/day limiter, per-email cap, duplicate check, site-wide daily cap, SMTP timeout.
- ~~MEDIUM S4~~ FIXED: fonts self-hosted and bundled (no Google Fonts).
- MEDIUM S5 remove commented production DB credentials from `.env`.
- ~~LOW S6~~ FIXED: seeder refuses production; LOW S7 retention for `demo_requests`; LOW S8 rotate demo password.

## Decided / verified
Header and iCalendar injection negative, markup escaped, CSRF + server validation + honeypot + throttle in place,
no open redirect in the new `Inertia::location` flows, reset tokens not leaked by Referer.
