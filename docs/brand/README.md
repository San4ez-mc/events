# Brand assets

- `kiro-logo-concept.jpg` — initial logo/app-icon concept (neon "K" mark with
  a swipe-arrow accent, nodding to the Tinder-style discovery feed).

**Not store-ready as-is.** This concept has baked-in rounded corners and a
drop shadow. For actual submission we'll need:

- **iOS**: a flat 1024×1024 PNG, no alpha, **no pre-rounded corners** —
  App Store Connect / the OS applies its own corner mask, so a pre-rounded
  icon gets double-masked into a smaller icon inside a visible square.
- **Android (adaptive icons)**: separate **foreground** and **background**
  layers (each 108×108dp safe-zone within a 432×432px canvas), not one
  flattened image — the OS composites and masks them per-device (circle,
  squircle, etc.).
- **Web favicon/OG image**: derived from the same mark, various sizes.

Revisit this when we get to app-store packaging (Phase 10 / pre-submission).
