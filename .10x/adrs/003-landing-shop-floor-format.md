# ADR-003: Landing page in the "shop floor / work order" format

**Status:** Accepted
**Date:** 2026-11-10
**Feature:** landing-ui
**Supersedes:** the visual part of ADR-002 (the marketing shell, server-driven pricing, SEO and legal pages stay as decided there)

## Context
After the "modern premium" version shipped on `feature/landing-ui`, the user asked for the landing page to follow the UI format
of https://jasprintcraft.vercel.app/ (a print shop site). Its CSS shows: dark ink background (#0d0b0a) with cream paper sections
(#efe8dc) and one red accent; Anton for huge uppercase headlines, Archivo for text, IBM Plex Mono for labels/buttons; square
corners; numbered sections ("01 — The menu"); looping marquee strips with ✶; menu rows with a red wipe on hover; notched
"ticket" stubs; a halftone dot screen; a perforation line; an order-slip form with underline-only inputs; a red "heat" glow.

## Decision
Adopt that format (layout and visual language), not its brand or content:
- Our brand red (#C8102E / brand-500 on dark for contrast), our copy, our real app screenshots.
- Tokens: `shop.*` colors and `font-display` (Anton), `font-archivo`, `font-plex` in tailwind; `mk-*` classes in app.css
  (`mk-ticket`, `mk-heat`, `mk-halftone`, `mk-perf`, `mk-row`, `mk-field`, `mk-marquee`, `mk-btn-red/line/ink`).
- Sections: status strip → nav (numbered) → hero (heat, ticket with the real register + phone) → 2 marquees → 01 Features
  (paper, wipe rows + 3 screenshots) → 02 How it works (stubs, store rules R1–R4, works with) → 03 Pricing (tickets) →
  04 Book a demo (demo slip) → 05 FAQ (paper) → final CTA → footer.
- Transaction3D, Reveal and QrPattern are removed (they don't fit the format and cost JS). Marquee and the red wipe are the
  only motion; both stop under `prefers-reduced-motion`.

## Alternatives Considered
| Alternative | Why not |
|---|---|
| Keep "modern premium" and only recolor | The user asked for the reference format, not a palette change |
| Copy the reference 1:1 (its red, wording, motifs like "press bed") | Their brand/content; ours must stay FinstackPOS and truthful |

## Consequences
- Three Google font families on marketing pages (non-blocking load); the app still uses Figtree only.
- Contrast: small red text uses brand-500 on dark and brand-700/800 on paper; muted text stays at ≥60% opacity.
