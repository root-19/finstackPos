# Senior Engineer decisions

Cross-cutting principles:

- **Read the code before accepting the premise.** Handoffs describe bugs from memory. Twice now the code has been less
  broken than the ticket said (`hardware-support`: the scanner already worked on page load because of `autoFocus`). State
  the correction rather than implementing against a wrong description.
- **Prefer reusing the existing path over adding a parallel one.** Fixes that route into code that already works are
  smaller, and they cannot drift from it later.
- **No tuning constants where a structural answer exists.** A threshold that is wrong for one customer's hardware fails
  silently; prefer a design with nothing to tune.
- **`flushSync` for controlled inputs fed faster than React renders.** Barcode scanners (1-5 ms/char) and printing both
  hit this; `Components/Receipt.tsx` is the reference use.
- **Gate on the DOM fact, not on a list of state booleans**, when the list will grow without this file being reread —
  e.g. `#modal` for "is any modal open?".
- **No DOM test environment in this project** (vitest runs in node). Extract decisions into pure functions and test those
  rather than adding jsdom for one hook.

Active features: [hardware-support](hardware-support.md) — task 1 (scan anywhere on the POS) built and green; tasks 2-3
(Settings guidance, compatibility page) not started, both behind the real-hardware gate.
