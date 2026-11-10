# Security review: landing-ui + app-shop-theme (2026-11-10)

Scope: `main..feature/app-shop-theme` (landing page, Book a demo, legal pages, SEO, auth shell and redirects,
app theme and color toggle) plus secrets handled during the session. Method: code reading, targeted probes
(email header and iCalendar injection, markup injection), test suite (231 passing).

## System and trust boundaries
- **Public, unauthenticated**: `GET /`, `/privacy`, `/terms`, auth pages; `POST /book-demo` (new write endpoint).
- **Outbound**: Gmail SMTP (demo notifications and every other app email), Google Fonts (now loaded on every page),
  PayMongo (unchanged).
- **Data**: new `demo_requests` table (name, business, email, phone, notes: personal data under RA 10173).
- **Assets at risk**: the shared mail account (also used for password resets), PayMongo live key, demo request PII,
  staff/owner sessions.
- **Adversaries**: opportunistic bots/spammers on the public form; anyone who sees leaked secrets.

## Findings

| ID | Severity | Finding | Recommendation |
|---|---|---|---|
| S1 | **HIGH** | The PayMongo **live** secret key was printed in this session's tool output (an `.env` excerpt). It stayed local but must be treated as exposed. | Roll the secret key in the PayMongo dashboard; update `.env`. |
| S2 | **HIGH** | SMTP uses an **app password for a third-party org account** (`VMAAS.CVSU@gmail.com`), pasted in chat. A Gmail app password gives full mailbox access (IMAP), not just sending. A FinstackPOS server compromise would expose that organization's mailbox. | Revoke that app password. Use a dedicated FinstackPOS mailbox or a transactional provider (Postmark, SES, Mailgun) with a send-only key. |
| S3 | MEDIUM | `/book-demo` sends one synchronous SMTP email per request: 5/min per IP, with no global or daily cap. An attacker rotating IPs can flood the inbox, exhaust the Gmail daily sending quota (which also breaks **password-reset and verification emails**), and tie up PHP workers on slow SMTP calls. | A global daily cap, a per-email/per-slot duplicate check, and a short `rescue` timeout; later Cloudflare Turnstile and a queued mailer with a worker. |
| S4 | MEDIUM | Google Fonts is now loaded on **every app page** (previously Bunny Fonts, which is privacy-friendly). Every staff/owner visit sends their IP and user agent to Google. This third-party disclosure isn't in the Privacy Policy. The fonts also aren't available offline. | Self-host the three font files (woff2 in `public/fonts`, `@font-face`). This also helps offline POS and performance. |
| S5 | MEDIUM | `.env` keeps **commented-out production DB credentials**. `.env` is gitignored and was never committed (checked), but local copies, backups and screen shares leak it. | Remove them from `.env`; keep production secrets only on the server. |
| S6 | LOW | `LandingDemoSeeder` has no environment guard. Run on production, it creates a Pro store (`SubscriptionService::grant`) with a known email and prints its password. | Refuse to run when `app()->isProduction()` unless explicitly forced. |
| S7 | LOW | `demo_requests` has no retention rule and no admin view or delete. The PII lives in the database indefinitely. The Privacy Policy retention section is a placeholder. | Prune after N days (scheduled command), or add an admin list with delete; fill in the retention text. |
| S8 | LOW | The demo account password appeared in chat. The account is local demo data only. | Re-run the seeder (it rotates the password). |
| S9 | INFO | Reply-To is set by the visitor (intended), and notes may contain URLs that Gmail auto-links. | Accept; the email is plain escaped HTML (tested). |

## Verified OK (no action)
- **Email header injection**: CRLF payloads in name and business name don't create headers (`Bcc` probe was negative; Symfony encodes the subject).
- **iCalendar injection**: CRLF, `ATTENDEE:` and `END:VEVENT` payloads stay escaped inside `DESCRIPTION`; there's one real `END:VEVENT`. Lines are folded at 75 octets.
- **Markup injection**: the email is a plain HTML Blade view with `{{ }}` escaping (Pest test `renders the notification email without letting the visitor inject markup`).
- **CSRF** on `/book-demo` (web group); **server-side validation** (FormRequest; the date range and slots come from the server); honeypot; throttle.
- **Redirects**: `Inertia::location(redirect()->intended(...))` uses the session's same-origin intended URL, so there's no open redirect. Logout stays a POST with CSRF.
- **Reset tokens**: the canonical/og URL on `/reset-password/{token}` contains the token, but it's escaped, and `Referrer-Policy: strict-origin-when-cross-origin` keeps it out of the Google Fonts requests.
- **Contact links**: scheme allowlist (`https:`, `viber:`, `tel:`), `rel="noopener noreferrer"`.
- **Theme script**: the inline script only compares a localStorage string. There's no CSP today; a nonce will be needed if one is added.
- **Security headers** middleware already sets XFO, nosniff, Referrer-Policy, Permissions-Policy and HSTS (on HTTPS).
- **Public screenshots** show demo data only.

## Verification plan for the fixes
- S3: Pest tests prove the cap returns a friendly error, sends no email after N per day, and skips duplicates for the same email and slot.
- S4: no request to `fonts.googleapis.com` or `fonts.gstatic.com` in the network log; fonts still render offline after one load.
- S6: Pest test that the seeder throws in the `production` environment.
- S1, S2, S5: the owner confirms rotation; `grep` shows no production credentials in `.env`.
