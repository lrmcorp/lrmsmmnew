# 05 · Drafts (`#/generator/drafts`, `#/generator/drafts/:sessionId`)

Mockups: **D1–D10** (phases 1 and 2). Drafts is where people review sessions created in the Content Generator. Copy from `07-copy-en.md` (`draft.*`). No emoji.

## Problems being fixed
1. Sessions only appear as options in a collapsed filter `<select>`, labelled with raw markdown and ISO dates (`12 … · 2026-10-21 – 2026-11-03 · # MANISKY — CHAPTER 01: …`).
2. A plan with `content_count: 12` shows "0 posts" and an empty-filter message, with no explanation (not generated, still running, or expired/bulk-deleted; the audit log shows `generator.bulk_delete` on 20 Oct 22:36).
3. Primary actions ("create concepts for selected plans", "Calendar") and the 7-day auto-delete rule are hidden inside an accordion.
4. The status filter defaults to "not approved", so approved work seems to vanish.
5. Selection can only delete. Approval is one at a time inside a modal with `confirm()`.
6. Manual "Save draft" with a warning to click it after editing.
7. Concept review (`concept_review`) and slide revision (`window.prompt`) are buried in the preview dialog.
8. The page is in Indonesian.

## Information architecture
- `#/generator/drafts` → **session list** (`pageContentDrafts`, rewritten).
- `#/generator/drafts/:sessionId` → **session page** (new `pageDraftSession`). Stages: Concepts, Images (default when no concepts are pending), Approved. Views: By date | Grid | Calendar. Query params `?view=grid&filter=ready&item=<runId>` for deep links. The existing `?id=<runId>` opens the item editor (D6) after resolving its session.
- Backward compatibility: `?plan=<id>` and `?plans=a,b` redirect to the matching session page.

## Session model
```js
// session = { id, title, mode:'story'|'campaign', accounts:[account], plans:[plan], runs:[run],
//             start, end, createdAt, updatedAt, expiresAt, counts:{planned,queued,running,concept_review,review,failed,approved,drafted,cancelled}, state }
function groupSessions(plans, runs, storyJobs) {
  // 1. If plan.session_id exists [BACKEND], group by it.
  // 2. Else group plans with identical brief + start_date + end_date whose created_at is within 5 minutes.
  // 3. Runs join by run.plan_id. Runs without plan_id become one session each (title = run.title || sessionTitle(run)).
  // 4. mode = 'story' if a story job references the plan or any run has story_episode; else 'campaign'.
}
function sessionState(s) {
  const c = s.counts, live = c.planned + c.queued + c.running + c.concept_review + c.review + c.failed;
  if (s.runs.length === 0 && s.plans.some(p => p.content_count > 0)) return 'expired';   // Drafts deleted
  if (c.concept_review) return 'concept';      // Review concepts
  if (c.review)         return 'review';       // Review images
  if (c.failed)         return 'failed';       // Needs fixing
  if (c.queued + c.running) return 'running';  // In progress
  if (c.planned && c.planned === live) return 'plan';  // Plan only
  return 'done';                               // Done
}
```
Tabs and the nav badge: **Needs action** = `plan | concept | review | failed`; **In progress** = `running`; **Done** = `done`; `expired` appears in All (and in Needs action for 24 hours after expiry).

`expiresAt` = earliest `expires_at` of runs not approved/drafted. Chip: more than 2 days neutral "Auto-deletes in {n} days"; 2 days or less amber; 1 day or less red ("Auto-deletes tomorrow at HH:MM" / "today at HH:MM").

## D1 · Session list
- Header: title, subtitle, primary "New session" (→ `#/generator`).
- **Scope bar (S4)** above the tabs: Company > Accounts (multi). A session shows if **any** of its accounts is in scope. Views: **List** (rows), **Cards** (3-column thumbnail cards), **Calendar** (sessions as date-range bars, coloured by state).
- Tabs with counts: Needs action · In progress · Done · All (remember the last tab).
- Inline: search (title) and sort (Newest / Next scheduled / Expiring first).
- `sessionCard` rows: stacked thumbnails · title + meta (avatars · mode chip · range · created) · state chip + count summary + stacked status bar + expiry/edited line · primary action:
  - plan → "Create {n} concepts" (cost dialog → `POST /plans/:id/start` per plan)
  - concept → "Review concepts"
  - review → "Review {n}"
  - failed → "Fix {n}"
  - running → "View progress"
  - done → "View"
  - expired → "Recreate from plan" (if `/plans/:id/start` works on a plan with no runs; otherwise "Open the Content Generator with this direction", which pre-fills the Generator. **[BACKEND]** confirm.)
- The row opens the session page; the action button stops propagation.
- Poll every 5 s, 15 s when nothing is running.
- **D2 empty states**: no sessions; filter empty (name the filter, offer "Clear filter", point to the tab that has items); expired.

## D3 · Session page: plan only
- Header: breadcrumb, title (`sessionTitle`), meta (mode, accounts, range, count, expiry chip), "View direction" (brief in a dialog) and a more menu (Delete session, Duplicate to Generator).
- Info callout `draft.plan.callout` + primary "Create {n} concepts".
- Table of planned runs: checkbox, episode/number, title + one-line plan, `content_type` chip (with "needs video" when a Reel has no video asset), editable `scheduled_at` (PATCH, autosave), `schedule_reason`.
- Bulk bar: "{n} of {m} selected" · Shift all dates (± days dialog) · Delete plan · primary "Create {n} concepts" (cost dialog → `/runs/:id/start` per selected; `/plans/:id/start` when all are selected).

## D4 · Concept review (`concept_review`)
- Left: concept list (checkbox, title, slot, reviewer verdict chip OK / Note / Claim). Right: editor for the selected concept: title input; reviewer callout from `r.steps.revision.output` with "Apply suggestion" when a revised caption exists; caption with counter; one card per slide prompt (`plan.slides[i].prompt`, editable); revision input (`POST /runs/:id/revise`, cost confirm).
- Footer: "Skip this concept" (uncheck) · "Approve and go to concept {n}" (existing `approve-concept`, `confirm_cost:true` after **one** cost confirmation per batch).
- Header primary: "Approve {n} concepts and create {m} images" (cost dialog with image model and count).
- Keyboard: Up/Down moves, A approves, S skips.

## D5 · Image review (main screen)
- Status chips with counts: All · Ready · Approved · Failed · In progress. Account chips limited to the **session's accounts** (no company step inside a session). Views: By date (default) · Grid (D7) · Calendar (D9).
- **By date:** day groups, 2-column post cards: checkbox, thumbnail with slide count, avatar + time + status chip, 2-line caption. Failed cards show the human error + Retry. Running cards show `n/m` slide progress.
- **Right panel** (sticky): `phonePreview` (Instagram/Threads), slide strip, revision input, quick actions (Full edit → D6, Revise slide → `inputDialog`, schedule popover), primary "Approve to calendar" (single item: no confirm; toast with Undo for 6 s. **[BACKEND]** confirm an un-approve path exists; otherwise use a default confirm dialog).
- Keyboard: Left/Right previous/next, A approve, E edit, X select.
- Header: primary "Approve {n} ready" (D8), secondary "Retry failed ({n})" (`/runs/:id/retry` each), "View direction", autosave indicator.

## D6 · Post editor drawer
- Replaces `<dialog class="draft-preview-dialog">`. Right drawer about 720px, previous/next arrows.
- Left: large preview, slide thumbnails (+ add/replace from the Media Library via `pickMedia`), per-slide actions "Revise this slide" (`inputDialog` → `/slides/revise`), "Replace with photo", "Reorder" (drag). "Previous versions · slide n" from `media_versions`.
- Right: caption (counter + hashtag count, "Improve with AI"), schedule (WIB) + Scheduler reason, "Also publish to" (Instagram/Threads when both are connected), reviewer callout from `steps.final.output` with "Revise slide n" when it names a slide, one `<details>` "Prompt and direction for this post".
- Footer: Delete (danger dialog) · Send to New Post (`/runs/:id/draft`) · "Saved HH:MM" · primary "Approve to calendar".
- **Autosave** everything (`autosave(() => PATCH /runs/:id …)`). Remove the Save draft button and its warning.

## D7 · Grid + bulk
- 6-column grid of 4:5 thumbnails with checkbox overlay and caption line (account + slot).
- Bulk bar: "{n} selected" · Shift schedule · Revise with AI (one instruction for all, cost confirm) · Delete (danger) · primary "Approve {n} to calendar".
- Select all respects the current filter. Actions only apply to eligible items; disable with a tooltip if none qualify.

## D8 · Bulk approve dialog + result
- Table per account: posts, first slot, last slot.
- Clash check against already scheduled posts (`GET /v1/calendar` range) for the same account and minute; offer "Shift by 15 minutes".
- Approve sequentially (`POST /runs/:id/approve {content, scheduled_at}`) with a progress line ("Approving 12 of 24…"). On partial failure, list failures and keep them selected.
- Result dialog: "{n} posts added to the calendar", first slot, remaining count; "Stay in session" / "Open Calendar" (focused on the first date).

## D9 · Session calendar
- Grid limited to the session range; events coloured by status (draft dashed, approved blue, failed red); other scheduled posts greyed for context.
- Drag to another day: PATCH `scheduled_at` keeping the time, autosave, toast with Undo. Keyboard alternative: the item's schedule popover.

## D10 · Mobile
- List: company + accounts buttons, segmented Needs action | All, compact cards with state, status bar and one action.
- Session page opens in **one-at-a-time review**: full-width preview, caption, revision input, sticky footer "Skip" / "Approve and next", progress "3 / 24".

## Acceptance
- No Indonesian text and no emoji/pictographic characters on either page.
- The Manisky plan appears as a card titled "Manisky: Chapter 01, A Little Beauty, A Little Manisky" (no `#`, no ISO dates) with a state and a working action.
- A plan whose runs were deleted shows "Drafts deleted" with an action, never "0 posts" alone.
- Approved items stay visible (Approved count, Done tab).
- No modal editor and no `confirm()`/`prompt()` remain.
- Editing a caption and closing the drawer within 1 s still saves (flush on close).
- Bulk approve of 24 items shows progress and a result dialog; failures stay selected.
- Old links `?plan=`, `?plans=`, `?id=` still land in the right place.
- 375px: one-at-a-time review with reachable buttons.
