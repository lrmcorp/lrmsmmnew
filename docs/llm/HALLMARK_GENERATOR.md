# Hallmark and Generator visual direction

## Selection

Hallmark v2.0.0 was installed globally from nutlope/hallmark at the user's request.
Its app-screen guidance is used for the Generator interface. The repository's
existing design-taste-frontend skill remains useful for image composition.
Neither skill is a runtime package or requires a new provider/API key.

The existing LRMsmm white/emerald brand, font, routes, permissions, controls,
three-step flow, paid-action confirmations and approval gates are retained.
Generator-only CSS improves label contrast, sentence-case readiness headings,
44px controls, focus visibility, a quieter summary, mobile wrapping and reduced
motion. Other screens and the global application shell are not redesigned.
Tokens live in public/generator-tokens.css; scoped rules in generator-hallmark.css.
This adapts the relevant craft rules, not a claim that the entire legacy app
passes every Hallmark gate. Existing status labels and metadata remain intact.

## Generated images

src/services/visual-design-policy.js provides a compact shared policy to the
Final Visual Conceptor, Image Creator and Final Reviewer, including users with
saved custom agent instructions. The account's uploaded visual references and
Brand Kit outrank generic design taste. The policy calls for a deliberate focal
point, alignment, readable typography, spacing and carousel continuity. It does
not impose a random theme, web interface elements or a blanket ban on colors or
effects deliberately present in the references. Missing references are not
invented; approved content and source-asset protections still apply.

The existing 32,000-character image prompt guard remains. Original logos are
composed by the server; product mockups require human detail review. The policy
makes no promise of exact model output or a measured aesthetic improvement.
Existing images are not regenerated automatically. New generation and confirmed
image revisions use the policy; final approval is still needed for publication.

## Observed art direction (2026-10-27)

Reviewed output reproduced the category default — a marketplace flat-lay with
unrelated props — while the account's references were a different design language.
Three causes were found and fixed.

1. The references reached the Visual Conceptor as images, but nothing required it
   to write down what it saw. The image model then received only adjectives.
   `visualSchema` now requires an `art_direction` object per run: `palette`,
   `background`, `typography`, `composition`, `lighting` and `avoid`, each 10–400
   characters of concrete observation. `planOf` rejects a run that omits or pads
   them, before any paid image request. `buildImagePrompt` prints the object above
   the slide prompt in every image call, so each slide carries the same direction.
   A run with no visual reference must derive the fields from the Brand Kit and
   say so in the field; describing imagery that was not supplied remains forbidden.
2. `VISUAL_DESIGN_POLICY` stated only what good work looks like. It now also names
   the defaults to refuse — listing composites, flat-lays, uninvited props, catalog
   grids, competing subjects, edge-crammed headlines, directionless stock lighting.
   The list yields to any reference that plainly shows one of those treatments, so
   the existing rule against a blanket ban on deliberate colors or decoration holds.
3. Logo placement was advisory only; see the cutouts and mockups page.

`art_direction` is additive. Runs produced before this change keep their saved
visual output, and retrying only their image stage omits the section rather than
failing. Retrying the visual stage applies the new contract.

## Verification

- Hallmark static sweep of the two new CSS files: 0 FAIL, 0 REFLEX, 0 WARN.
- Hallmark render tier could not render standalone CSS; no render pass claimed.
- Existing real-browser fixture separately verified desktop and 375/390px mobile,
  generation-to-Drafts handoff, cost confirmation, autosave and route behavior.
- Screenshots reviewed: /tmp/redesign-generator-1280.png and generator-375.png.
- 67 production-mode backend checks, 40 application checks and 6 deployment tests
  passed locally. Providers mocked; no paid image request or real social post.
