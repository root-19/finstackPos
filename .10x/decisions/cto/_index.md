# CTO decisions

Cross-cutting principles:

- **Claims must be verifiable in code or on real hardware.** Never market a capability that has not been run. An
  unverified claim is a defect, not copy.
- **A competitor's feature list is not a business case.** Build on demand signal — a prospect who asked, a deal that was
  lost, a merchant who complained. At zero merchants the default answer is "document it, don't build it."
- **Prefer the browser and the OS over owning the device.** The pure-PWA model (no Electron, no WebUSB) is a deployment
  advantage, not a limitation. Do not trade broad compatibility for narrow control.
- **Defer with a trigger, not with silence.** Anything postponed gets a written promotion condition so it resurfaces by
  itself.

Active features: [hardware-support](hardware-support.md) — support merchants' existing printer / drawer / scanner through
the browser; no device control. Decided 2026-11-10, not yet built.
