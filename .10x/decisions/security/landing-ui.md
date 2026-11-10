# Security: landing-ui (+ app-shop-theme)

Full report: `.10x/reviews/2026-11-10-security-review.md`.

## Threat model (short)
- Public write surface: `POST /book-demo` (bots, spam, mail flooding). Everything else new is read-only or auth flow.
- Shared Gmail SMTP account = single point of failure for demo notices **and** password resets.
- PII: `demo_requests` (RA 10173).

## Open findings
- **HIGH** S1 rotate PayMongo live secret (exposed in session output).
- **HIGH** S2 replace the CvSU Gmail app password with a dedicated send-only mailer.
- MEDIUM S3 daily/global cap + duplicate check on demo requests.
- MEDIUM S4 self-host fonts (Google Fonts on every app page; not in Privacy Policy).
- MEDIUM S5 remove commented production DB credentials from `.env`.
- LOW S6 production guard on `LandingDemoSeeder`; LOW S7 retention for `demo_requests`; LOW S8 rotate demo password.

## Decided / verified
Header and iCalendar injection negative, markup escaped, CSRF + server validation + honeypot + throttle in place,
no open redirect in the new `Inertia::location` flows, reset tokens not leaked by Referer.
