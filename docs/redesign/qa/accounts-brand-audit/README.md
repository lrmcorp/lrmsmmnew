# A1 / B1–B2 / J1 and functional Calendar moves

Implements the supplied annotated mockup and its detailed page notes in the existing vanilla application. Actual account names, follower counts, health, assets and audit events replace example data. The mockup's orange numbered annotation pins are documentation, not product controls. Layout was inspected at desktop and 375px; a numerical 100% pixel-match score has not been measured.

## A1 Perusahaan & Akun

Company-grouped tables; avatar/name/handle/platform, followers, four-slot Brand Kit completeness and token-expiry chips. Primary connection menu (Instagram/Threads), secondary company action, anchored row menus. Company creation, renaming, confirmed moving and empty-company deletion work against real APIs. Refresh/reconnect/disconnect are functional; disconnect confirmation counts scheduled targets. Added missing SVG menu/building/info icons.

## B1 / B2 Brand Kit & Cerita

Account header and tabs, completeness meter linked to missing slots, two structured identity/tone/rules cards and autosave status. Original markdown remains behind a full editor/preview. Language and caption-emoji choices persist and enter model instructions. Logo, visual references, product photos and optional video columns have counts, thumbnails, editable labels and add tiles. Product multi-upload validates required names and saves description, collection and tags, with partial-failure retry. Metadata uses additive SQLite tables and preserves older prompts/rules. Legacy text extraction is best effort, never replaces original stored text. Brand Kit service remains for Instagram; Threads connection management remains available.

Completeness uses the same four 25% slots in Accounts, Brand Kit and Generator: saved identity, logo, references, products. Recommended missing assets do not block seed-only generation. Product collections/tags and identity survive application restart.

## J1 Jejak Audit

Compact real health chip/tooltip, member/activity/date filters, shared account scope, activity and failed-post tabs. Day-grouped readable sentences, colored category chips, actual actor/account/session links and 15-minute consecutive event collapse. Raw codes live in technical details. CSV fetches all matching pages. Failed posts expose actual provider errors and retry; no fabricated webhook status. Historical events can only show relationships actually recorded or resolvable.

## Calendar K1–K3

Fixed HTML enumerated draggable attributes; actual browser drag now works. Date moves persist with Asia/Jakarta wall time, update worker run_at and offer Undo. Drafts can be dragged to another assigned account lane, with explicit confirmation. Optimistic versions reject stale moves/undo. Running, approved and published items cannot be moved. Touch pointer dragging and Alt+Left/Right alternatives are implemented. Post duplication creates an idempotent private draft with separately owned media, preserving target captions/options; it never schedules or publishes. Deleted source media is reported rather than reconstructed.

## Immutable logo/product instructions

One mandatory policy is appended to Campaign planning, Storyteller, Manager, Scheduler, Concept Creator, Reviewer, Visual Conceptor, Image Creator and final QC, after editable instructions. Logo lettering, typography, colors, shapes/proportions and every product/label/packaging detail must remain unchanged; only uniform positioning/scaling and surrounding layout/background are permitted. Conflicting prompts must be rejected. QC compares generated slides to the supplied protected sources and must report mismatches or uncertainty as a blocking issue for human review. Protected reference images retain PNG transparency rather than lossy JPEG conversion. Original stored uploads are not edited by this workflow. Prompt instructions and model QC do not mathematically guarantee generated-image fidelity; final human approval remains required.

## Verification

- Maintained real-application browser fixture passed, including native drag/drop, cross-account confirmation, persistence/Undo, duplicate-without-publication, product required-name validation and persisted collection/tags, Brand Kit autosave, audit CSV download, mobile overflow, permissions and all previous workflow regressions.
- Backend/helper suite: 48 passing tests, including new Calendar access/stale-update/worker/duplicate tests, audit context/pagination and metadata restart persistence.
- Additional real mocked-provider payload assertions confirm the immutable policy reaches planning/production roles, QC receives originals, and protected references remain PNG.
- Bahasa Indonesia UI, SVG-only icons and whitespace checks passed. Production provider/Meta calls are not part of these fixture tests.
