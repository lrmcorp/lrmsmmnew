# Brand cutouts and product mockups — 2026-10-23

## Scope

Replace mandatory full-photo product panels with in-scene AI product references.
Automatically prepare logo/product cutouts when attached to Brand Kit; keep
originals unchanged. Product-level exact-cutout placement remains available.

## Verified

- 65 backend checks and 40 application checks passed with isolated data.
- Full browser workflow passed, including product-mode upload defaults, persisted
  product metadata, prepared PNG URL serving, Brand Kit, drafts, calendar, mobile,
  permissions, autosave and approval boundaries.
- Cutout tests verify tight white/transparent bounds, foreground source pixels,
  unchanged input bytes, and honest complex/blank-background review states.
- Pipeline tests verify mockup product references reach the image provider,
  instructions permit nails worn on fingers, products are not pasted as overlays,
  source logos remain composited, and final QC receives source images.
- Exact mode persists across process restart. Original/derived file cleanup tested.
- English, SVG/no-emoji and clean-diff gates passed.

No live paid image generation or social publishing was performed. Local cleanup
is conservative background/margin processing, not universal AI object segmentation;
complex backgrounds require review. Generative mockups require human product-detail
review and cannot guarantee pixel-exact product appearance. Past generated images
are not modified automatically; use confirmed regeneration to apply the new flow.
