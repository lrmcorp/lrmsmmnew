# 09 · Using the UX/UI agent skills kit (optional, recommended)

The kit at https://github.com/plugin87/ux-ui-agent-skills gives the coding agent design-specific skills: a component spec writer, a UX-writing system, an accessibility audit, heuristic review, a 52-check quality gate, and an independent critic. Use it to **check and sharpen** this redesign, not to replace it. The mockups and specs in this pack stay the source of truth.

## Install (in the LRMsmm repo)

**Claude Code** (gives 26 skills + the `design-critic` agent):
```
/plugin marketplace add plugin87/ux-ui-agent-skills
/plugin install ux-ui-agent-skills@ux-ui-agent-skills
```
Start a new session if the skills don't show up.

**Cursor / Codex / other AGENTS.md tools:**
```
npx ux-ui-agent-skills init --agent codex
```
Here the skills don't load on demand; the kit's doctrine is inlined into `AGENTS.md`, and `/critique` becomes a written checklist instead of a separate reviewer.

**Browser checks for `/gate`** (34 of the 52 checks need a browser):
```
npm install
npx playwright install chrome
```
Run these inside the kit directory. Without Playwright those checks are skipped.

## Which skill to use when

| Moment | Skill | How to use it here |
|---|---|---|
| Before each phase | `/grill-me` | Feed it the phase's spec file (`04`/`05`/`06`) and let it question the brief. Put answers that change scope in the PR description, and **do not** silently change the spec. |
| Always on | `design-doctrine` | Its rules (eight states per component, token-by-intent, mobile-first) match `02`. Where they conflict, `02` wins, because the app is a vanilla-JS codebase with an existing visual identity. |
| Phase 0 components | `design-component` | Generate an anatomy / variants / states / a11y spec for `accountPicker` (S3), `confirmDialog`, `inputDialog`, `summaryPanel`, `sessionCard`, `bulkBar`, `progressPipeline`, `phonePreview`. Save the specs in `docs/redesign/components/`, then implement them with `h()`. |
| Tokens | `design-tokens` (+ `token-build`, optional) | Convert the token block in `02` to intent-named tokens (e.g. `color.status.warning.bg`) and generate the CSS variables. Keep the existing hex values. |
| Copy | `ux-writing` | Check the new strings in `07` against its error- and empty-state formulas. Proposals for better wording go in the PR as suggestions; `07` is still applied as written unless the reviewer agrees. |
| After each page | `a11y-audit` | WCAG 2.2 AA audit of the changed pages. Fix every P0/P1 before merge. |
| After each page | `design-review` | Nielsen-heuristic scoring of the changed pages. Attach its findings table to the PR. |
| Before opening the PR | `/gate` | Run against the rendered pages (localhost, or a static snapshot of each changed route). Target: every browser check for the changed routes passes. Report the N/52 score. |
| Before merge | `/critique` | Independent reviewer: screenshots at 1280 and 390, clicks every control, returns a verdict with three send-back reasons. Address them or explain why not. |
| Don't use for this project | `apply-aesthetic`, `/redesign`, `/migrate-design-system`, `/scaffold-project`, `/image-to-code` | These change visual direction or structure wholesale. The direction is already decided in the mockups, so using them would fight the spec. |

## Notes on fit

- The kit's framework adapters don't name vanilla JS; vanilla CSS is supported. Treat its code output as reference, and write the final code in the app's `h()` style.
- `/gate` tests both light and dark themes. LRMsmm is light-only today. Either add a dark token set as a separate, later task (out of scope for this redesign), or record dark-theme checks as "N/A, light-only" in the PR. Don't half-implement dark mode.
- `/gate`'s responsive checks run at 280, 320 and 414px. This pack requires 375px. Fix anything under 320px only if the fix is cheap.
- Hooks and `/observe` are optional. If enabled, `/observe` reports whether the agent followed the doctrine. Include its output when a reviewer asks.

## Suggested per-phase loop

```
/grill-me  → clarify phase scope (from 04/05/06)
design-component → specs for any new component
implement (h(), CSS tokens, 07 copy)
a11y-audit + design-review → fix P0/P1
/gate → N/52, fix failures on changed routes
/critique → address 3 send-back reasons
open PR with mockup IDs, screenshots (1280/375), gate score, critique verdict, [BACKEND] items
```
