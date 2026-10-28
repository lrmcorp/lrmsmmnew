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

**This has not yet been exercised by a real generation.** `processRun` skips a
stage whose status is `done`, so every draft retried during the 2026-10-27/28 work
reused a visual output created before the contract existed and sent no
`art_direction` at all. Judge this work only from a **new** campaign; see the
retried-drafts section in [HANDOFF.md](HANDOFF.md).

## One brand mark per slide (2026-10-28)

The image model drew a second brand wordmark beside the one the server composites,
because `referenceDirection` asks it to carry over the references' text hierarchy
and those references are the brand's own images, wordmark included. The prompt now
resolves that conflict explicitly and states the one-mark rule late, where the logo
is reserved; the Final Reviewer counts marks per slide and treats a second drawn
one as blocking. Lettering genuinely printed on the product or its packaging in the
scene remains allowed. See [HANDOFF.md](HANDOFF.md) for the full note.

## Verification

- Hallmark static sweep of the two new CSS files: 0 FAIL, 0 REFLEX, 0 WARN.
- Hallmark render tier could not render standalone CSS; no render pass claimed.
- Existing real-browser fixture separately verified desktop and 375/390px mobile,
  generation-to-Drafts handoff, cost confirmation, autosave and route behavior.
- Screenshots reviewed: /tmp/redesign-generator-1280.png and generator-375.png.
- 67 production-mode backend checks, 40 application checks and 6 deployment tests
  passed locally. Providers mocked; no paid image request or real social post.

## Vision-capable agents (2026-10-28)

The Final Visual Conceptor inspects the uploaded references and writes the art
direction every image then follows, so its model sets the ceiling for the whole
visual pipeline. It ran on `gpt-4.1-mini`, and worse, `settings()` made the visual
role **inherit the Conceptor's provider and model** when no explicit visual agent
was stored. Reference inspection therefore silently used whichever lightweight
model had been chosen for writing text.

- `DEFAULT_AGENTS.visual` is now `anthropic` / `claude-opus-5`, chosen by the user
  over Opus 5.5. Anthropic's deprecations page lists it Active, with retirement no
  sooner than 2027-07-24. It is offered in the Anthropic picker so the choice can
  be changed back in the interface.
- `DEFAULT_AGENTS.final` is now `anthropic` / `claude-sonnet-5-5`, replacing the
  deprecated `gemini-2.5-flash`. The Final Reviewer also reads images.
- The visual role no longer inherits the Conceptor's model. It keeps its own
  default unless the user explicitly configures it.
- `PROVIDERS[*].visionModel` gives each provider a vision-capable fallback
  (`gpt-4.1`, `claude-opus-5-5`, `gemini-2.5-pro`). Note this stays on Opus 5.5:
  it is the current generation and applies only when a vision role falls back
  because its own provider key is missing, which is a different decision from the
  Visual Conceptor's configured default. When a user lacks the key for
  a vision role's provider, it now falls back to that rather than the provider's
  lightweight `textModel`.

`imageDetail: 'high'` is an **OpenAI-only** parameter. Anthropic and Gemini receive
the image bytes directly and read them at native resolution, so detail there is
governed by `referenceBytes`, which caps references at 1536px — close to the point
above which Anthropic downsamples anyway.

**A saved configuration wins over these defaults.** `saveSettings` writes every
role, so any user who has opened AI settings and saved has an explicit `visual`
entry and will keep their old model until they change it in the interface. Changing
a stored choice automatically is deliberately not done; `SUPERSEDED_MODELS` covers
only ids that are retired or have a published retirement date.

Cost moves with capability: Claude Opus 5.5 is $4/$20 per MTok against GPT-4.1
mini's far lower rate, for one call per content item. No measured quality
improvement is claimed here — this removes a known bottleneck, and the art
direction panel on each draft is how to judge whether it helped.
