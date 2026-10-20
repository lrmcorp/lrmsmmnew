# Generator review and draft retention

## Approval and selective revision

New runs stop after Concept Creator and Concept Reviewer at `concept_review`. No image or final-review provider call is made before an explicit, paid-cost-confirmed `POST /v1/generator/runs/:id/approve-concept`. The human can edit the title, caption and each slide's visual prompt at that gate. Changing the brief or reference assets while waiting invalidates the old concept and returns it to planning. Existing ready media and manual-upload workflows remain reviewable.

Concept and campaign-planning requests use provider structured outputs: OpenAI strict JSON schema, Anthropic forced structured tool output, Gemini JSON schema. Local count/caption/prompt validation remains authoritative. Token budgets scale with requested slides/content. No automatic paid retry is added.

`POST /v1/generator/runs/:id/slides/revise` accepts `request_id`, zero-based `slide_index`, `instruction` and `confirm_cost:true`. Only the selected image and final review run again. Other slide IDs and concept stages remain intact. Replaced images are versioned, viewable in Draft Konten, and protected from media GC while the draft is active. At most 30 previous slide versions are retained per draft. A repeated request ID cannot duplicate paid work; a changed payload using the same ID is rejected. Completed stages/slides survive explicit retries.

Draft Konten displays thumbnail cards. Human publication approval leaves the user in the draft list. It still requires a future schedule; concept approval does not publish or schedule a post.

## Deletion

The UI exposes **Hapus draft**. `DELETE /v1/generator/runs/:id/content` deletes the signed-in creator's idle planned/concept-review/review/failed/cancelled draft. Queued/running runs must be cancelled first. Already handed-off or approved runs cannot be deleted through this endpoint. The old DELETE run endpoint still cancels work.

An expiry job runs every 15 minutes. Eligible drafts are deleted once seven days have elapsed since their last material saved content change or newly generated review result. Opening, polling, or saving unchanged fields does not reset the clock. Unsaved local changes do not extend retention. The UI displays each eligible draft's expiry timestamp.

`draft_touched_at` is independent of worker heartbeats. Existing rows receive seven days from the first migration, not a retrospective immediate expiry. Subsequent application restarts do not reset them. Queued/running, approved/scheduled, and Tulis Post handoffs are excluded. Existing post records are never deleted by draft expiry.

Deletion clears draft content, outputs, references and versions, retaining only a hidden idempotency tombstone so a replayed request cannot regenerate a deleted draft and incur costs. The draft disappears from list/detail APIs. Only non-library assets no longer used by another active generator draft, pending AI draft or any post are removed from disk. Shared and scheduled assets remain. Backup retention is unaffected.

## Verification

Generator integration tests cover the human gate with zero image requests, structured provider payloads, selective revision and replay protection, unchanged-vs-changed retention, active/scheduled protection, ownership, private-file cleanup and shared/library asset survival. Browser tests cover concept editing/approval, slide revision/history, manual deletion, manual image approval/calendar flow, and mobile/desktop layouts. All provider requests in tests are simulated; no real Instagram posts or paid calls are made.
