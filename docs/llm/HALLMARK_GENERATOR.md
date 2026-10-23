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

## Verification

- Hallmark static sweep of the two new CSS files: 0 FAIL, 0 REFLEX, 0 WARN.
- Hallmark render tier could not render standalone CSS; no render pass claimed.
- Existing real-browser fixture separately verified desktop and 375/390px mobile,
  generation-to-Drafts handoff, cost confirmation, autosave and route behavior.
- Screenshots reviewed: /tmp/redesign-generator-1280.png and generator-375.png.
- 67 production-mode backend checks, 40 application checks and 6 deployment tests
  passed locally. Providers mocked; no paid image request or real social post.
