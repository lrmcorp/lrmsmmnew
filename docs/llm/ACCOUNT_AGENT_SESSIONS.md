# Account-specialized agents and draft-session handoff

## Behavior

The application UI is English. Caption language remains an independent Brand Kit
and session choice; stored captions, user prompts and custom agent instructions
are not translated. Dates retain Asia/Jakarta / WIB.

`account-specialist.js` builds trusted, authorized account context for campaign
planning and production agents. Each run snapshots the selected account's Brand
Kit, assets, selected story memory, permitted prior proposals and published posts.
Other users' private proposals and unrelated account histories are excluded.
Model defaults are personal; specialization is enforced through account context,
not separate model credentials per account. Existing custom instructions remain.

Successful Campaign generation opens its plan in Drafts. Storyline opens a durable
`#/generator/drafts/story_ID` progress page immediately after queueing, then moves
to the created plan when Storyteller, Manager and Scheduler finish. Failed stages
remain visible and can be retried without repeating completed stages. Stopping a
pending session retains existing drafts/posts.

In a Drafts session, **View full image** opens the selected slide in a large
dialog. Images fit inside the viewport without cropping; videos keep controls.
Carousel slides can be changed with buttons or Left/Right keys, and Escape closes
the dialog. The narrow social preview remains for layout context.

## Validation and recovery

Date/time capacity is checked before queueing. Six items over two days with two
candidate times have only four gross slots; occupied drafts/posts can reduce that
further. UI guidance and server `schedule_capacity` details explain the fix. The
server remains authoritative; it never silently changes dates or posting times.

Storyteller and Manager requests constrain the episodes array to the requested
count, use a larger output budget and validate required fields, lengths, media
and product choices. A malformed structure receives one additional repair call,
within the session's disclosed cost context. The repair must return a complete
valid replacement; it never truncates, invents or accepts missing episodes.
Provider outages/auth/quota failures and invalid product/video selections are not
automatically retried. Repeated invalid structure stops safely with a precise
English error. No plan, episode memory or publishing is committed on failure.

## Verification

- `test/account-specialist-session.js`: account/history isolation, six/four slot
  capacity and actual Conceptor/Revision account context.
- `test/storytelling.js`: continuity, schema validation, bounded repair, unsafe
  products/video, completed-stage retention and scheduler failures.
- `test/redesign-browser.cjs`: English workflow, Campaign session routing,
  Storyline pending progress and transition to real concepts, capacity errors,
  full-image carousel dialog at desktop and 375px, autosave, approvals, calendar
  and permissions.

These tests use isolated storage and mocked providers. They do not prove a real
paid model response or a live Instagram publication. Consult CI and the receiver
result for deployment evidence; a built image alone is not a deployed release.

## Failed production drafts

Every failed draft exposes **Failure details** in its card, preview and editor.
It shows the stored error, recorded/inferred stage, provider/model, error code and
draft ID. Historical runs with no diagnostics say so; no root cause is invented.
New failures save a sanitized `steps.failure` record. Known provider/validation
errors include their safe reason; unexpected internal errors exclude raw exception
messages. Completed stages/media remain intact and failure metadata clears on a
confirmed retry. JSON `null` and null slides are rejected as validation errors.
Static HTML/JS/CSS responses require revalidation to reduce stale frontend files.
An already-open page still needs refresh; unsaved edits are never auto-discarded.

The plan URL and a generic failure badge alone cannot reveal private provider
errors to an unauthenticated debugging environment. Read its stored error through
an authorized session or a read-only SQLite query before claiming a root cause.

### Provider rejection reasons (2026-10-27)

`jsonRequest` used to cancel the response body of a failed provider request and
store a fixed sentence. An HTTP 400 therefore read "Check the model and provider
account", which is a guess: the model and account were usually fine. The actual
cause was discarded, so no amount of reading the draft could recover it.

Failed responses are now read, bounded to 64 KB, and `providerDetail` keeps only
`code`, `type` and `status` when each matches `^[\w.-]{1,60}$` — bounded machine
identifiers such as `moderation_blocked`, `string_above_max_length` or
`INVALID_ARGUMENT`. The provider's free-text `message` is **never** surfaced or
stored: it is provider-controlled and may echo the prompt or other content, which
the existing rule against exposing raw provider responses forbids. A body with no
usable identifier yields "The provider named no reason" rather than a guess.
Gemini's numeric `code` is ignored and its string `status` kept. `test/generator.js`
asserts the identifiers reach `steps.failure.message` while a secret planted in
the provider's `message` never does.

This reports the rejection; it does not prevent one. A 400 on the Image Creator
stage is still to be diagnosed from the identifier it now records.

### Image prompt budget (2026-10-28)

The guard fired again at 33,295 characters. The craft policy had grown through the
day, but the real fault was that nothing bounded the variable inputs: a campaign
brief may be 10,000 characters and reference notes 6,000, and both were being sent
to the image model whole.

Both had already been read by the Conceptor and are expressed in the slide prompt
and the recorded art direction, so this is the same duplication the 2026-10-23 fix
removed, in a different place. They now travel as short context: brief 700
characters, reference direction 2,000, story episode 400, each elided rather than
cut mid-word.

What the image model actually needs is never truncated: the slide prompt, the art
direction, `VISUAL_DESIGN_POLICY`, `protectedLayout` and `ASSET_PRESERVATION`
arrive whole. Budgeting the duplicated parts is what keeps room for them.

`test/generator.js` builds a prompt with every input at its validated maximum at
once and asserts it stays under the limit, that the 6,000-character slide prompt
survives intact, that the policy and asset rules are present, and that the brief
was reduced. A deliberately maximal run now measures about 29,100 characters.

### Image prompt limit regression (2026-10-23)

Production diagnostics showed all text/visual stages complete, GPT Image 1 failing
with HTTP 400, and a ~48k-character subtotal from duplicated account archive,
story, rules and slide instructions. OpenAI's official Images SDK schema documents
a maximum prompt length of 32,000 characters. The former image request exceeded it.

`image-prompt.js` now sends the approved visual prompt, current brief/episode,
image-agent instructions, reference direction and structured account identity.
It excludes duplicated prior proposals and story archives already reviewed by the
Visual Conceptor. The full run archive remains saved for continuity. It preserves
complete structured identity rules and ends with the mandatory immutable-asset
policy; original image references and server composition are unchanged. Oversized
essential instructions fail locally before any provider call, with actionable
`image_prompt_too_long`. The OpenAI image adapter also enforces this boundary.
Confirmed retries keep completed concepts/reviews/visual plans and existing slides;
users need not create a new story or pay to redo those completed stages.

## Same-day generation

Generator date defaults and calendar permit today in WIB. Schedule presets begin
today; Start next Monday retains its explicit future meaning. In Plan & schedule,
Start now adds the nearest whole-minute slot at least six minutes ahead (including
midnight rollover). The backend still excludes slots within five minutes and
existing account conflicts; the UI counts only future slots when checking capacity.
Saved future date choices are preserved. Generation starts on submission; publishing
still requires final approval. If production outlasts the slot, reschedule at approval.

## Separate creative per account (2026-10-28)

A campaign used to put every selected account on every run
(`body.account_ids.map(account_id => ({account_id}))`), so one concept, one art
direction and one image set were shared by all of them. Two brands selected
together received identical posts, which defeats the account specialisation the
rest of the pipeline is built on.

`createPlan` now fans out: one run per idea **per account**, each carrying a
single account in `targets`. A plan's `content_count` keeps its existing meaning
of posts per account, which is what the interface already said, so a campaign of
2 posts across 2 accounts creates 4 runs. Each run then goes through its own
concept, revision, visual and image stages with `accountSpecialistContext` for
that one account, so the Brand Kit, references, memory and published history
driving the creative are that account's alone.

Scheduling follows. `slotsFor` reserved a time only when it was free for **every**
selected account; it is now called once per account, so an account is not blocked
by a conflict belonging to a different feed, and two accounts may legitimately
post at the same wall-clock time. A capacity failure names the account it belongs
to rather than reporting a single pooled number.

Both active-run guards now count `content_count * account_ids.length`, since that
is what the plan creates.

Unchanged: `createRun` for a single content item still accepts several accounts
and produces one multi-target run. Changing it would break the documented REST
contract of `POST /v1/generator/runs`, which returns one run. The campaign path
is what the interface uses and what produced the shared creative.

Cost moves with the fan-out: a campaign now runs the full agent pipeline once per
account instead of once in total.

## Session content types and the direction limit (2026-10-30)

`storyContentTypes({slideCount,hasVideo})` decides what a Storyline session may
produce, and the same list builds the agent JSON schema and the sentence naming
it in the prompt. A one-image session is offered `image` only; `carousel` needs
two or more slides and `reel` needs a video in the account catalogue. Before
this the schema always offered all three and a session could fail outright on a
type it could never have produced.

The workspace no longer appends its language, emoji and asset rules to the
user's brief or session direction. Those rules reach every agent through its
instructions, the language also travels as `caption_language`, and asset
preservation is added server-side, so appending them again only pushed a
full-length brief past the 10,000-character limit. Validation messages for the
brief, the session direction and `request_id` are now separate, and an oversized
one states the actual length.
<<<<<<< HEAD

## Posting density (2026-10-30)

`perDayFor(count, days)` and `fillPostingTimes(times, perDay)` in
`public/schedule-times.js` derive the posting times a session needs from the
ones the user chose. The chosen times are always kept and never moved; extra
ones land in the widest gaps between them, inside 06:00-21:00 WIB, at least
thirty minutes apart. Twelve posts over three days produces four a day without
the user adding anything, and a session started after the day's last chosen time
keeps its first day instead of being refused.

`slotsFor` begins at the arithmetic need and adds one time a day at a time until
the posts fit, so times already past and slots held by other drafts are absorbed
too. A `schedule_capacity` error now means the range cannot hold the count even
at full density. The workspace imports the same module for its readiness gate,
so what it allows and what the scheduler produces cannot drift apart.
=======
>>>>>>> origin/claude/elegant-edison-a2xv8m
