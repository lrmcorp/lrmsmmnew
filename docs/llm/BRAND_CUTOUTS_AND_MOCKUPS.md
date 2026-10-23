# Automatic brand cutouts and product mockups

## Why the old screenshot had pasted rectangles

The previous system appended restrictive asset instructions and then stamped full
original product photos into a fixed lower panel after generation. A better user
prompt could not remove that server overlay. White logo padding also survived
because the full source bounds were scaled. This was principally a system issue.

## Current behavior

- Brand Kit logo/product uploads automatically create a prepared PNG derivative.
- Local Sharp processing removes border-connected near-white background and empty
  transparent margins; original uploaded files remain untouched. No provider/API
  key or paid AI call is used for preparation.
- Logo preparation also clears enclosed white letter counters (for example the
  inside of an “a”) in white-backed or transparent logo sources. Product cutouts
  retain enclosed white details. Logos use a new prepared derivative so existing
  cached cutouts do not hide the correction; original media remains unchanged.
- Complex backgrounds are retained and flagged **needs review**, rather than
  claiming a perfect semantic foreground extraction. White foreground objects,
  antialiased edges and tiny details need review. This is not universal AI matting.
- Prepared previews expose the background/edge status. Original files remain
  available for comparison. Old selected assets prepare lazily during generation.
- Logos are composited from prepared cutouts. AI must not redraw logos. The Visual
  Conceptor inspects the uploaded references at high detail and selects an
  upper-left, upper-centre or upper-right placement per slide, with a one-sentence
  design reason. The image prompt reserves that location within the headline
  composition, and the server places the unchanged cutout there. Existing runs
  without this metadata retain the prior upper-right fallback.
- Uploaded visual references lead the art direction for new slides: the Visual
  Conceptor and image prompt request their concrete palette, background, subject
  scale/placement, typography hierarchy, spacing and lighting. This improves
  reference fidelity but cannot guarantee an exact match from a generative model.
- The Final Reviewer also receives the visual style references and is asked to
  flag generic layouts and poorly integrated logos. Its findings appear for human
  review; the app does not silently spend extra credits on an automatic redraw.
- Products default to **In-scene AI mockup**, including applicable products worn or
  used naturally (for example press-on nails on fingers). Product reference photos
  inform the image model, and are not pasted over the final scene.
- **Exact product cutout** is available per product at upload/edit. Only these
  product sources receive deterministic overlays, alongside logos.
- Mockup perspective/lighting can change, so exact pixels/details cannot be promised.
  Final QC sees source images and is instructed to flag altered/uncertain product
  appearance. Draft preview and approval warn that human detail review is needed.
- Product presentation persists in additive `brand_asset_metadata.presentation`;
  original media contracts and publishing JPEG derivatives are preserved.
- Prepared PNG/JSON derivatives are removed in the existing media cleanup lifecycle.

## Existing drafts and verification

Existing images are not silently changed, republished or regenerated. Apply the
new behavior through the existing confirmed image-revision/generation actions.
Completed runs keep their saved content; original assets remain available.

Tests cover opaque/transparent whitespace, unchanged source bytes, complex/blank
fallback, metadata persistence, default mockups without product overlays, PNG/logo
preservation and placement, prepared upload URLs, cleanup and the full browser workflow.
Provider calls are mocked: no paid generation or live Instagram publishing is
claimed as verification of visual fidelity.
