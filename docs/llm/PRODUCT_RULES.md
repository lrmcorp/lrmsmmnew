# Product invariants

## Design and copy

- Preserve LRMsmm's white/light, compact visual identity and the mockup notes for
  the page being edited. Preserve useful functions when matching a screenshot.
- English is the current UI default; WIB is the visible scheduling zone.
  Internal timestamps are ISO UTC. Do not use the browser's local zone accidentally.
- UI icons are SVG. Caption language defaults to Indonesian, can be chosen per
  account/session, and may include emoji. Content is not interface copy.
- Lists use Company → Accounts → Filters → View with remembered/shareable scope.
  Account selection is a compact row of avatar + `@handle` chips.
- Show loading, empty, error, partial-success and success states. Missing data is
  not zero, synchronization success is not proof of messages, and unavailable
  optional backend features must not be presented as working controls.
- Shared dialogs replace native browser confirm/prompt/alert. Keep keyboard focus,
  escape handling, autosave flush and 375px layouts functional.

## Permission and approval

- Owner can administer the workspace. Representative access derives from direct
  account assignments plus company membership; hiding navigation is not authorization.
- Recheck access server-side on reads, writes, retries, approval and publishing.
  A multi-target post may be viewable with only some targets but is editable only
  with the complete required scope. See `src/services/scope.js` for details.
- Provider credentials, generator jobs/drafts and external AI handoff drafts are
  user-private. Being assigned to the same account does not grant another user's
  private draft or key. Account Brand Kit and story memory are shared with authorized
  account members; do not apply the private-draft rule to all account metadata.
- AI generates proposals; humans approve publication. A successful paid request,
  a prepared concept or a scheduled calendar entry is not a published Meta post.
- Paid actions require clear cost context and the existing API confirmation fields.
  Do not introduce a recurring checkbox that the user previously asked to remove.
- Preserve idempotency on request retries and final approval, including old story
  request hashes across migrations and retries after memory-session deletion.

## Brand and image generation

- Keep uploaded source files unchanged. Automatic derivatives may remove simple
  background and empty margins. Complex backgrounds are marked for review.
- Logos use cleaned source cutouts and must not be AI redrawn. Products default
  to in-scene AI mockups (for example nails worn on fingers), with mandatory human
  product-detail review; optional Exact cutout mode preserves source placement.
  Do not promise pixel-exact AI mockups or invent product facts.
- Editable agent presets cannot override `ASSET_PRESERVATION`.
- Style references guide composition, palette, typography, lighting and vibes;
  they do not redefine product identity or authorize copied foreign brand claims.
- Send visual references before protected inputs. Preserve server composition of
  original sources after model generation and the protected-source final QC.
- New PNG originals are private retained sources; publishing remains JPEG. Do not
  expose original filesystem paths or forget their storage/GC lifecycle.
- Do not promise exact output pixels or a perfect reference match. Approved content
  remains subject to human visual review; actual model behavior is not proven by stubs.

## Story and scheduling

- Named memory sessions are selected explicitly for continuity. New sessions start
  at episode 1; continuing a session uses only its own Bible/memory/retained history.
- Global episode storage uniqueness is separate from displayed session numbering.
  Do not remove the legacy uniqueness constraint or silently renumber old episodes.
- Changing memory/assets/foundation while account generation is active is blocked.
  Deleting memories does not delete generated drafts, posts or schedules.
- Retain draft expiration: untouched disposable content drafts expire after seven
  days; approved/scheduled content and persistent Brand Kits/memory are distinct.
- Best-time suggestions must state their actual basis; no invented analytics.
- Drag/drop is a real backend operation with conflict/access checks and constrained
  retargeting. Calendar duplicate creates a private draft, not a new published post.
- Published items retain real Instagram permalinks when returned by Meta. Never
  construct an unverified publication link from a container ID or calendar status.

## AI integrations

- Generator uses each user's encrypted OpenAI/Anthropic/Gemini API credentials.
  Consumer ChatGPT/Claude/Gemini subscriptions do not provide these API credits.
- LRMsmm also serves OAuth for external MCP clients. That OAuth authorizes access
  to LRMsmm, not login to OpenAI or automatic access to ChatGPT Projects.
- External images require downloadable HTTPS/base64 or a manual upload. `sandbox:`
  links and conversation URLs are not public image endpoints.
- Never fabricate testimonials, discounts, clinical/product claims, observed feed
  direction or performance. Ide cepat may infer direction from actual supplied
  history while distinguishing drafts from published facts.
