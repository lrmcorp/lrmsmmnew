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
  composition, and the server places the unchanged cutout there. The image model
  receives visual and product references but not the separate logo source, which
  reduces duplicate or imitated wordmarks. The planner and reviewer still see the
  original logo. Existing runs
  without this metadata retain the prior upper-right fallback.
- A corner mark is a signature: 13% of the canvas width by 4.5% of its height,
  on the same 6% margin as the artwork, with the bottom placements ending exactly
  on that margin. `hero-center` is the one deliberate exception at 24% by 9%. The
  prompt also says the mark is small and that no oversized band or header strip
  should be opened for it.
- The reserved header is now verified before the logo is stamped. The prompt asks
  the image model to keep that area clear, but it frequently puts the headline
  there anyway and the server used to composite the original straight over the
  lettering. `resolveLogoPlacement` measures the greyscale spread of every
  candidate slot in the finished background and moves the logo to the calmest
  corner either when its slot is outright busy and that corner reads clearly
  calmer, or when its slot simply sits `PREFER_CALMER_BY` stdev or more above the
  calmest corner. The second rule was added because the first left the mark in a
  merely-adequate corner while a genuinely empty one went unused. `hero-center` is
  excluded from both sides of the decision: a hero mark owns the centre by design,
  so it is never relocated and never a fallback.
  The geometry is defined once and shared by the prompt text, the measurement and
  the composite. Each slide records `requested`, `applied`, `moved`, `occupied`,
  `still_occupied` and the readings in `steps.image.logo_placement`. When no slot
  is clear the requested placement stands and the collision is reported to the
  Final Reviewer for human review rather than being silently accepted. A calm
  reading means the area is quiet, not that the logo's colors contrast with it;
  contrast remains a human check.
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

## Logo as a coordinated watermark (2026-10-28)

The composited logo read as a sticker: full opacity, original colours, always in
the top band. On the account owner's instruction the no-recolour rule in
`PRODUCT_RULES.md` and `ASSET_PRESERVATION` was amended, and the Final Visual
Conceptor now chooses a treatment per slide alongside the placement.

- `logo_placement` gained the three lower slots, so the mark can take whatever
  corner the composition actually leaves quiet rather than reflexively the top.
- `logo_soft` composites at 55% alpha, setting the mark back into the scene.
- `logo_tint` is empty to keep the original colours, or a `#rrggbb` from the
  palette the conceptor just recorded. `treatCutout` rewrites only the RGB
  channels and scales alpha; every pixel's coverage still comes from the original
  cutout, so shape, edges, lettering and proportions are the source's.
- The applied tint and softness are stored in `steps.image.protected_placements`
  for review, and uploaded source files are never rewritten.

This is a deterministic server composite, not a model repainting a logo, which
remains forbidden. A tint is a flat single colour: a logo whose identity depends
on its own gradient or multiple colours will lose that, so leave `logo_tint`
empty for those brands.

## Hero logo placement (2026-10-28)

Output stayed short of the account's references even once the art direction was
reaching the model, and the reason was structural rather than a prompt weakness.
Every placement put the logo in a corner band 30% wide and 10% tall, while the
references build whole slides around a large centred wordmark: a small
letterspaced eyebrow, the mark as the focal element, one short line beneath. That
layout could not be expressed at all, because the model is forbidden to draw the
brand name and the server could only stamp a corner mark.

Placements are now boxes in canvas fractions rather than a shared band, and
`hero-center` reserves 46% of the width at 36–53% of the height. The Final Visual
Conceptor chooses it when the references open a campaign or a chapter that way,
and is told not to use it on a slide whose focal point is a face, a hand or the
product. The prompt then asks for the centre of the frame to be held completely
empty, with the scene arranged around that space.

The composited mark is still the original file, scaled proportionally. The test
asserts a hero mark is substantially larger than a corner mark, centred, inside
the middle band, identical in proportions, and that the source file is unchanged.

**This only pays off with the right logo file.** The server composites whatever
the Brand Kit holds. These references show a purple gradient wordmark while the
uploaded asset is a flat black script, so a hero placement will enlarge the black
script unless the styled artwork is uploaded. A flat tint cannot substitute: it
would discard the gradient. See the tint caveat above.

## Four corrections from reviewed output (2026-10-28)

- **Logo size.** Corner placements were 30% of the width and 10% of the height,
  which read as oversized. They are now 20% by 7%, and `hero-center` drops from
  46% by 17% to 34% by 13%.
- **The brand name as drawn lettering.** Asking for "no wordmark" in the abstract
  kept failing: a model reproduces the brand name readily because every reference
  it is shown carries it, and it does not recognise "WITH MANISKY" or a watermark
  as a wordmark. `brandWords` derives the actual words from whichever account owns
  the run (handle, its distinctive first segment, display name) and the prompt
  names them: these strings must appear zero times in any drawn lettering, as
  headline, signature, caption, watermark, sign-off, "with" line, hashtag or small
  print. Lettering genuinely printed on the product or packaging remains allowed.
  The derivation deliberately does not split a display name, so a nail brand can
  still write "Nails" in a headline. No account, no ban: nothing is invented.
- **Product detail.** `ASSET_PRESERVATION` said perspective and lighting may adapt.
  It now says they are the **only** things that may: colours and their placement,
  every pattern, motif and decal, finish, shape and length of each piece, the count
  of pieces, and packaging form, print and lettering are copied from the reference.
  Inventing a colourway, a motif, a different count or a restyled box is refused,
  as is filling an unclear detail from imagination.
- **On-image language.** The interface already prepends "Write captions and
  on-image text in English" to every agent's instructions, but the image model
  follows the slide prompt, and a slide prompt written in Indonesian produced
  Indonesian artwork. The Conceptor must now write on-image text in the language
  its instructions name and quote it in double quotes exactly as it must appear;
  the image prompt requires quoted text to be rendered verbatim, character for
  character, never translated or substituted.

The prompt budget absorbed these: a deliberately maximal case measures about
29,600 of 32,000. `clipMiddle` keeps both ends of the reference direction, because
the user's own notes sit at its tail and a head-only clip discarded them.
