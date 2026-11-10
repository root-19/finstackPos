# Security decisions

Cross-cutting principles:
- Public forms: CSRF, server-side validation, honeypot, per-IP throttle **and** a global cap when they trigger email.
- Secrets live only in `.env` on the server (never in chat, commits, or screenshots); third-party accounts get least-privilege keys.
- Third-party requests from app pages (fonts, scripts) count as personal-data disclosure under RA 10173: prefer self-hosting.

Active features:
- [landing-ui](landing-ui.md): landing, Book a demo, auth shell, app theme. Review 2026-11-10: open = 2 HIGH (secret rotation, owner), 1 MEDIUM (S5 .env cleanup, owner), 2 LOW. S3/S4/S6 fixed.
