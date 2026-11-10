# Fonts

Self-hosted copies (latin and latin-ext subsets, as served by Google Fonts, unmodified) of:

| Font | Files | License |
|---|---|---|
| Anton | `anton-*.woff2` | SIL Open Font License 1.1, [OFL-anton.txt](OFL-anton.txt) |
| Archivo (variable, 400–800) | `archivo-*.woff2` | SIL Open Font License 1.1, [OFL-archivo.txt](OFL-archivo.txt) |
| IBM Plex Mono (400, 500, 600, 700) | `ibm-plex-mono-*.woff2` | SIL Open Font License 1.1, [OFL-ibmplexmono.txt](OFL-ibmplexmono.txt) |

They're declared in `resources/css/fonts.css` and bundled by Vite into `build/assets`, where the service worker
precaches them. No page loads fonts from a CDN: visitors' and staff's IP addresses aren't sent to a third party
(see `.10x/reviews/2026-11-10-security-review.md`, S4).
