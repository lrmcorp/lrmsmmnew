# 04 · Content Generator (`#/generator`)

Mockups: **G1–G10** (phases 3 and 4). Prerequisites: Phase 0 (shared components, English strings, scope bar) and the Drafts session page (`#/generator/drafts/:id`). All copy comes from `07-copy-en.md` (`gen.*`). No emoji; icons from `icons.js`.

## Goal
Someone picks accounts, writes one line of direction, checks a summary that shows exactly what will be produced, and starts a session. They never have to open an accordion or guess why the button is disabled.

## Problems being fixed
1. The Generate button is disabled with the reason in small grey text under it; the fix (Brand Kit) is a small button elsewhere.
2. Two tabs with different account controls: a single `<select>` for story mode, and a collapsed multi-picker with clear/done buttons for campaigns.
3. The account picker and schedule are collapsed by default. A default of 12 posts per account is applied silently, with no total shown.
4. The brief placeholder mentions a "3-slide carousel" while the slides setting is 1.
5. Story mode pre-fills the direction field with the entire Brand Narrative Bible and shows the bible as a wall of text.
6. The agent canvas mixes both pipelines (10 nodes), nodes overflow the frame, and model lists are unfiltered (22 Gemini models for the Scheduler, including transcription and computer-use models).
7. Progress lives in a queue/history accordion at the very bottom, with no empty state.
8. The page is in Indonesian; the agent names and all labels must be English.

## Page structure (G1)
```
pagehead: "Content Generator" · sub · [Drafts (badge: n to review)]
[Running session card(s)]                       <- G5/G6, only when active or failed
grid: [Composer card (3 steps)] [Session summary (sticky)]
link: "AI team & models · Advanced" + "Preset: Balanced · N agents"   -> G7 drawer
```
Remove: the mode tabs at the top, the account/schedule `<details>` rows, the queue/history accordion, and the inline canvas section.

## Step 1 · Which accounts? (G1, G2)
- **Company first, then accounts** (same cascade as S4): a company button left of the chips; chips list only that company's active accounts. Default company = global `state.scope.companyId`.
- Use `accountPicker` (S3): **one row of compact chips** (avatar + @handle). No tiles or cards. Order: ready first, then alphabetical.
- Right side of the step header: "{n} of {m} selected · Select all".
- Readiness (`readiness(account)`) shows only as the amber dot + tooltip. The explanation and fix ("Set it up now" opens G3, "skip this account" deselects) live in the summary checklist. One helper line under the row explains the dot.
- **Campaign:** multi-select. **Story:** single-select; the chip shows "· Ep. N". Accounts without a Brand Kit are disabled; clicking one opens G3. Switching mode keeps the first selected account.
- Keep supporting `?story_account=<id>`. Persist the last selection in `localStorage('lrm.gen.accounts')` (try/catch).

## Step 2 · What do you want to make? (G1, G2)
- Mode segmented control **inside** step 2: Continue story / New campaign (calls the existing `studio.chooseMode()`).
- **Campaign:**
  - Brief textarea (existing `brief`), counter `n / 10,000`, placeholder `gen.brief.placeholder`.
  - Quick-idea chips (Promo, Product education, Testimonial, Behind the scenes) **append** a starter sentence; never replace text.
  - Format: Single | Carousel + slide stepper (1–10, disabled for Single), driving the existing `count` input. Images: AI creates | My photos (maps to the existing manual mode, "date + upload your own photos").
  - **Caption language** select: Indonesian / English / Mixed. Defaults to the Brand Kit setting of the selected accounts (Indonesian unless changed). If selected accounts have different defaults, show "Per account (Brand Kit)" as the default option. The choice applies to this session only and is sent with the run/plan body (**[BACKEND]** `caption_language`; until supported, append "Write captions in {language}." to the brief). Shown in the summary as "Language".
- **Story:**
  - Story position card: chapter tiles parsed from the story bible (G2). If parsing fails, show "Next episode: N" and a "View Story Bible" link.
  - `direction` textarea **starts empty**, placeholder `gen.direction.placeholder`. Never pre-fill it with the seed or bible.
  - Remove the "story saved by the agent" text wall; link to G9 instead.

## Step 3 · When should it go out? (G1, G8)
- One sentence with inline editable tokens: `gen.schedule.sentence` / `gen.schedule.sentence.story`.
- Each token opens a popover (G8): presets (2 weeks, 1 month, This week, From next Monday), range calendar (Monday-first week), spread (evenly / specific days) and a rhythm line.
- Time chips: add with "+ time" (24-hour input), remove with the chip's close icon. Validate HH:MM; at least one.
- Toggle `gen.scheduler.toggle` (story: on by default; campaign: off). Hide if the backend can't support it (**[BACKEND]** `allow_scheduler_adjust`).
- Bounds: posts 1–30, slides 1–10, end ≥ start, start ≥ tomorrow.

## Session summary (G1, G2)
- Recalculates on every input:
  - Campaign: **total = selected accounts × posts**; images = total × slides (AI images only); period days; pace = posts ÷ days per account, one decimal ("about 0.9 posts/day/account").
  - Story: "{n} episodes" and "@handle · episodes X–Y".
- "AI team: {preset} · {n} agents · Change" opens G7.
- **Readiness checklist** (always visible): accounts selected; Brand Kit per selected account (list only failing ones, each with "Set it up now" and "skip this account"); direction written (campaign required; story optional); API keys for the providers used by the preset (link to Personal settings).
- Primary button: "Generate {total} posts" / "Plan {n} episodes". Disabled only while a blocking item fails; clicking it while disabled scrolls to and highlights the first failing item.
- Note under the button: `gen.cta.note.campaign` / `gen.cta.note.story`.

## Pre-flight dialog (G4)
- `confirmDialog({tone:'cost'})` with the stage table (concepts now, images later with model and count, publishing only after approval) and the notify checkbox (default on).
- On confirm call the existing `submitForAccounts(kind, body)` unchanged (it already attaches each account's Brand Kit references and uses an idempotent batch `request_id`).
- On success: toast `gen.started.toast` with an Open action, show the G5 card, stay on the page.
- On partial failure: G6-style callout with "Retry" re-calling with the same batch.

## Quick Brand Kit drawer (G3)
- Opens from a disabled chip or the checklist. Three short steps: Identity (what it sells / to whom, tone chips, **caption language (default Indonesian)**, **Emoji in captions toggle (default on, allowed)**) → Rules (do / don't) → Assets (logo, 1–5 references, products).
- Writes to the same endpoints as `storyWorkspace`; autosaves.
- Optional "Fill for me" hidden unless **[BACKEND]** `POST /v1/generator/accounts/:aid/brand/suggest` exists.
- **Caption language** (content, not UI): Indonesian by default; options Indonesian / English / Mixed. Set per account in the Brand Kit and overridable per session in the Content Generator. The app UI stays English.
- **Emoji in captions** (content, not UI): allowed by default (Brand Kit toggle on). If a brand turns it off, agents are told not to use emoji and the Final Reviewer flags any that appear. The app UI itself never uses emoji.

## Session cards (G5, G6)
- Top of page: running sessions (any run `queued|running`) and sessions that failed in the last 24 hours (max 2); then "Recent sessions" (last 3) with "All sessions in Drafts". Data: runs + plans grouped via `groupSessions`. Poll every 2.5 s while running, 10 s otherwise.
- Pipeline: Concepts → Concept review → Visuals → Images → Final review, counts from `run.steps[role].status`.
- If any run is `concept_review`: inline link "Review {n} concepts now" to the session page.
- Buttons: Pause (existing stop endpoint behind a danger confirm) and Open session.
- Failed (G6): map provider errors (429, 401, timeout) to `error.*` strings; actions "Retry {n}" (failed runs only), "Switch to {provider}", "Review the {n} that worked"; raw error behind "Technical details".
- Toast when a session reaches `concept_review` or `review`: `gen.ready.toast`.

## AI team & models drawer (G7)
1. Presets: **Economy**, **Balanced**, **Quality**, computed from `config.providers` so they only use models the user has keys for. "Custom" appears after manual edits.
2. Per-agent table for the active mode only (Campaign: concept, revision, visual, image, final; Story adds storyteller, manager, scheduler). English agent names from `07` (`agent.*`).
3. Model select grouped Recommended / Other text models / Hidden (collapsed). For text roles hide ids or names matching `/transcribe|computer.?use|tts|embedding|image|imagen|nano.?banana|veo|audio/i`. For `image` show only `imageModels`.
4. Footer: "Open as canvas" (existing `workflowCanvas` in a full-screen dialog showing only the active mode's nodes), "Save as default" (`PUT /v1/generator/settings`), "Apply".
5. "Refresh Gemini models" is a small link in the Gemini group header.

## Story Bible view (G9)
- Parse best-effort (`Brand Essence:`, `Brand Personality:`, `Tone of Voice:`, `Visual Identity Keywords:`, `Chapter N - Title (Posts a-b): text`) into cards and a chapter arc with episode bars.
- If nothing parses, render the text as formatted markdown, never with raw `#`.
- "Edit as text" opens the Brand Kit seed editor (B1).

## Mobile (G10)
- Steps stack. Account step: company button + horizontally scrolling chip row (S3-D/S4-E).
- Summary becomes a sticky footer: "{total} posts · {n} images · Ready" + primary button.
- The session card collapses to a vertical step list.

## Acceptance
- No Indonesian text and no emoji/pictographic characters anywhere on the page (including toasts, tooltips, placeholders, aria-labels).
- Step 1 is one row of chips at 1280px with 5 accounts, preceded by the company button.
- With zero accounts the button reads "Generate 0 posts" (disabled) and the checklist says "Select at least 1 account".
- Selecting `@anekajaya.asemka` shows the amber dot and a checklist item with "Set it up now" and "skip this account".
- Changing accounts, posts, slides or format updates the total, image count and button label immediately.
- Story mode with `@manisky.id` shows "episodes 13–24" and an empty direction field.
- Caption language defaults to Indonesian, can be changed for the session, and the generated captions are in the chosen language.
- No `<details>` remains for accounts, schedule or the queue.
- No "Transcribe" or "Computer Use" model appears for a text agent.
- 375px: no horizontal scroll; the footer button is always visible.
