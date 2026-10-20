# Continuous account stories and reusable brand kits

## User workflow

In Sosmed Generator, **Cerita Berkelanjutan & Brand Kit** selects one assigned Instagram account. Account Social rows also link here using **Brand & Story**. The account choice in this panel determines the session's target account.

The initial prompt and brand rules autosave after editing, with a visible save status and an explicit save button. Generating a session waits for pending prompt saves. Logos, visual references, product photos and uploaded videos are stored in a reusable account catalog. Up to 250 assets per account and 20 files per upload batch are supported; batches can be repeated. Asset names/descriptions are editable. The first logo and first visual reference are reused automatically. The Storyteller selects at most two products per content item from the larger catalog, so actual image-generation inputs remain within the four-reference limit.

Set content count, slide count, date range and candidate WIB times in the existing planning controls. Optional session direction adds a focus without replacing the initial foundation. **Generate / Lanjutkan storyline** runs:

1. **Storyteller**: sees the original prompt, accumulated bible/memory, episode history, actual saved captions/briefs and statuses, product descriptions and product contact sheets. Creates the next numbered episodes, captions, content types and selected catalog products.
2. **Social Media Manager**: checks and corrects story progression, repetition, claims, brand consistency and product selection. Rejection creates no plan or memory advance.
3. **Scheduler**: reads the Manager's notes, proposes a chronological assignment to available slots, and records both its response to those notes and a reason for each date/time. These are contextual suggestions using generic candidate times, not measured account-performance predictions.

All three have separate provider/model/instruction controls in the node workspace and use the signed-in user's own encrypted provider keys. Regular four-stage content workflows remain available. Existing saved agent presets merge with the three new defaults.

The three-agent session is durable background work. UI activity reflects actual stored stage states. Account-level locking prevents concurrent sessions from forking the same episode sequence. Paid retries preserve completed stages; old sessions cannot overwrite a later story foundation or memory revision. Cancelling stops subsequent stages; already-running provider calls may still be billed. Request IDs prevent duplicate session creation. Plan, episodes, memory and completion state commit in one SQLite transaction after QC/scheduling validation.

## Proposals and publication

A session creates one plan containing independent content drafts. Each shows its caption, image/carousel/Reel preview, date/time in Asia/Jakarta, and scheduling reason. Product IDs must belong to the selected account; invalid IDs, invalid schedules and out-of-order episodes are rejected.

If **Buat media proposal sesudah QC Manager** is selected, the user's explicit cost consent authorizes image production after Manager QC without the separate human concept gate. Core concept/revision/image/final agents then prepare image drafts. If unchecked, planned drafts wait for normal manual production. Manual non-story workflows retain their human concept gate.

Reels use uploaded videos with their generated captions. No AI video-generation connector is installed. The final step clearly requests human video inspection; it does not claim a vision model watched the video. Single uploaded videos publish through the existing Instagram Reel behavior.

**Setujui N proposal siap** explicitly schedules the ready drafts shown. Each approval is idempotent; partial errors are reported individually. Nothing publishes or enters the calendar before human approval. Existing schedule validation still requires a future date. Manual schedule overrides are labelled as user changes rather than Scheduler recommendations.

Full concept revisions keep the episode linked to the new draft version. Future story sessions see current saved captions/briefs and distinguish published/scheduled/draft/deleted episodes. The original foundation remains stored; generating the next session requires no new storyline prompt. Sessions are generated on demand, not endlessly in the background.

## Ownership and retention

Brand assets and memory belong to the social account and are accessible only to users with that account's current grant (including company grants). Provider keys and session jobs remain private to the initiating user. Async provider checkpoints recheck account access before saving outputs. Asset/profile edits are blocked during an active account story session.

Catalog assets and story memory outlive the seven-day unchanged-draft policy. Catalog assets are protected against deletion, publication cleanup and media GC while linked. Removing an asset from the catalog only removes the physical file when no draft/post/other catalog entry still needs it. Validated shared video snapshots remain usable by their assigned creator even after catalog unlinking. Account assets do not become globally shared library files. Human-approved scheduled posts remain protected as before.

## Verification

`test/storytelling.js` covers account boundaries, personal-key isolation, catalog GC protection, structured provider requests, product selection/vision sheets, continuous numbering and memory, exact-once request replay, Manager rejection, invalid products/schedules, stage-preserving retry, queued cancellation, access revocation across provider calls, image/Reel proposals and shared-asset approval.

`test/browser-storytelling.cjs` covers automatic prompt persistence, logo/reference plus six product uploads, refresh persistence, model selectors, on-demand sessions, continuation without a new prompt, scheduling explanations, proposal preview, batch human approval, and mobile layout. Run with the same Playwright prerequisite as `test/browser-components.cjs`. Provider calls are simulated, and the publisher is disabled: no real Instagram posts or paid requests are used in tests.

CI runs the story integration suite both on the runner and inside the actual non-root production image before deployment.
