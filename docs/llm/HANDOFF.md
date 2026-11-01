# Engineering handoff

Current state first, history underneath. This document had grown into a
755-line changelog with the state buried in it, which is the opposite of what a
handoff is for.

| Document | Purpose |
|---|---|
| [PRD.md](PRD.md) | What the product is for and what counts as working |
| [RULES.md](RULES.md) | Invariants a change must not break |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Modules, data ownership, prompt assembly |
| [RUNBOOK.md](RUNBOOK.md) | Tests, gates, deployment, troubleshooting |

## Current state

- Repository **lrmcorp/lrmsmmnew**, serving `https://lrmsosmed.playgo.id`.
  `lrmsocmedauto` is retired; do not deploy its Temporal/Postgres/Redis
  architecture or copy its environment.
- **Last verified deployed commit: `76c40dc`**, PR
  [#45](https://github.com/lrmcorp/lrmsmmnew/pull/45), deployment run
  [41274990361](https://github.com/lrmcorp/lrmsmmnew/actions/runs/41274990361),
  receiver and public health check both passing.
- Last verified checks: the English/SVG gates, **40 application e2e**, **92
  production-mode backend checks**, 6 deployment tests and the real-browser
  redesign workflow.
- **Verify this rather than trusting it.** This line was once thirteen commits
  stale, naming PR #8 as deployed long after #15 and later had shipped. Check
  the latest successful `deploy.yml` run on `main` and update it on every
  release.

### What these numbers do not prove

Tests simulate the AI providers and Meta. No paid generation and no live
publication has been demonstrated. In particular, the whole body of prompt work
below — reference fidelity, framing variety, language, captions — has been
verified only as *reaching the model*, never as *changing what the model
returns*. That requires a human reviewing a **new campaign**; a retried draft
reuses its completed stages and proves nothing.

### Open on the account owner's side

Carried across several sessions and still unconfirmed:

| Item | Why it matters |
|---|---|
| Gemini API key, then **Use recommended team** in Agent team & models | Stored settings outrank defaults, so the cheaper provider split is not in effect until this is done |
| Manisky Brand Kit caption language set to English | The Generator's selector defaults to "From Brand Kit", so the session choice must otherwise be made every time |
| Upload the purple gradient logo to Manisky's Brand Kit | The server composites whatever the Brand Kit holds, which is still a flat black script |
| Confirm the mobile drawer, the 30-draft schedule move and the desktop logo | All deployed, none confirmed by the owner |

### Known flake

`npm test` has reported 39/40 twice — 2026-10-27 and 2026-11-01 — and the
failing check has never been identified either time, because the summary line
was captured without the `✗ name` that `test/e2e.js` prints to stderr just
above it. It passed all 28 runs attempted immediately after the second
occurrence, so it is real but rare, most likely publish-retry timing.

**If you see it, capture the name.** `npm test 2>&1 | grep -A2 '✗'` before
anything else; the summary line alone is useless for diagnosis.

## Recent implemented releases


| Release | Changes | Evidence |
|---|---|---|
| #4 | Generator, Draft Konten and Calendar mockup alignment | `docs/redesign/qa/fidelity/` |
| #5 | Company/account tables, Brand Kit, Audit; native calendar drag/drop, retarget, undo and duplicate; asset policy | `docs/redesign/qa/accounts-brand-audit/` |
| #6 (`8c2103f`) | H1 Beranda, scoped actions, timeline/account health and accurate KPIs | `docs/redesign/qa/home/` |
| #7 (`874511c`) | Named story-memory sessions, selection, rename and deletion | `docs/redesign/qa/story-memory/` |
| #8 (`e31af9a`) | Reference-first images, original asset composition, PNG source retention and real Ide cepat prompts | `docs/redesign/qa/visual-quick-ideas/` |
| #15 (`5c851a4`) | Hallmark craft on Generator CSS and reference-led visual agents | `HALLMARK_GENERATOR.md` |
| #16 (`7bd0b83`) | Required `art_direction` contract, anti-slop policy list, measured logo placement | `HALLMARK_GENERATOR.md`, `BRAND_CUTOUTS_AND_MOCKUPS.md` |
| #17 (`e1b8b08`) | Provider rejection reasons stored instead of a generic guess | `ACCOUNT_AGENT_SESSIONS.md` |
| #18 (`9ad08d7`) | `gpt-image-2.5-sunburst` replaces the retired `gpt-image-1`, plus superseded-id remapping | this page |
| #19 (`134b559`) | `input_fidelity` sent only to the gpt-image-1 line | this page |
| #20 (`685581e`) | Current Claude models; `claude-opus-4-1` and `claude-sonnet-4-5` remapped | this page |
| #21 (`248243d`) | One-wordmark rule in the image prompt and a blocking review check | this page |
| #22 (`79dc499`) | Handoff documents brought up to the deployed state | this page |
| #23 (`a979212`) | Reference inspection restricted to vision-capable models | `HALLMARK_GENERATOR.md` |
| #24 (`a4fdd99`) | Logo as a coordinated watermark; text kept off the artwork | `BRAND_CUTOUTS_AND_MOCKUPS.md` |
| #25 (`c9220c9`) | Mass selection and deletion on the Drafts index | `ACCOUNT_AGENT_SESSIONS.md` |
| #26 (`18bf786`) | Headline voice rule: the account, not the category | `HALLMARK_GENERATOR.md` |
| #27 (`86a1972`) | One run and one creative per account in a campaign | `ACCOUNT_AGENT_SESSIONS.md` |
| #28 (`4c1c8fd`) | `hero-center` placement, reference reading, image-prompt budget | `HALLMARK_GENERATOR.md` |
| #29 (`e11075c`) | Smaller logo boxes, brand-name ban, product detail held, on-image language | `HALLMARK_GENERATOR.md` |
| #30 (`d8042cf`) | Per-content shot types and emptiest-area logo seating | this page |
| #32 (`f2b0a31`) | One output language per run; brand name out of the quoted headline | this page |
| #33 (`338266d`) | Logo sized as a small signature and aligned to the artwork margin | this page |
| #34 (`8413a6c`) | Product rotation across a campaign and a typographic non-product format | this page |
| #35 (`0c50c16`) | Per-session story content types and the 10,000-character session direction | this page |
| #36 (`fa10d84`) | Posting times spread automatically to fit the count and the date range | this page |
| #37 (`3976789`) | Storyteller on claude-sonnet-5-5; presets no longer override a role's provider | this page |
| #38 (`b65982b`) | Text-only stages on Gemini Flash and a way back to the recommended team | this page |
| #39 (`49f75ed`) | Liando Reyfort Management logo and favicon | this page |
| #40 (`e7e8f82`) | Captions written as short paragraphs, and an editor with room for them | this page |
| #41 (`824afad`) | Save failures report their reason; Approve no longer aborts silently | this page |
| #42 (`278f2a6`) | Blocking posts are named; a campaign moves as one from its first post | this page |
| #43 (`25f08ed`) | Composed content briefs stay within the limit; edits validate only what they change | this page |
| #44 (`bccfcba`) | The phone navigation drawer can open below 760px | this page |
| #45 (`76c40dc`) | Brand Kit assets can be selected and deleted in bulk | `BRAND_CUTOUTS_AND_MOCKUPS.md` |

## Current user-facing behavior


- Company → multiple social accounts; users may hold several companies and direct
  account assignments. Owner and Representative have different menu/API access.
- Generator supports Campaign and continuing Storyline. Concepts are reviewed
  before images in the normal UI; completed content requires final approval before
  entering the publishing calendar. API/internal options may request earlier media
  production; they do not replace final publication approval.
- Storyline uses Storyteller → Social Media Manager → Scheduler, followed by the
  content production agents. Provider/model choices and private user API keys are
  configurable. Paid actions include cost context in application dialogs.
- Account details → Memori cerita: create/select/rename/delete a named session or
  delete an individual memory. Generator continues the selected session. Each
  session owns its Bible, memory and episode progression; brand assets/rules are
  shared for the account. Old memory migrated to **Cerita awal**.
- Ide cepat calls the configured Conceptor and fills a detailed editable prompt
  from Brand Kit, selected memory, the user's prior proposals, published posts
  and authorized Instagram feed imagery when available. It does not publish or
  create images. Other members' private proposals are excluded.
- Uploaded style references precede logo/product inputs. Image generation makes
  the surrounding design; server composition overlays full original protected
  assets with proportional sizing. Final QC receives completed slides and sources.
- Newly uploaded PNGs retain a private original for composition, including alpha;
  the public publishing derivative is JPEG. Cleanup accounts for both copies.
- Beranda actions respect account scope, include partial failures and overdue DMs,
  and provide real Owner reconnect requests. Counts wait for account loading.

## Retried drafts reuse their completed stages


`processRun` skips any stage whose status is already `done`
(`if(steps.visual?.status!=='done')`). This is deliberate: a retry must not charge
the user again for concept, revision and visual work that succeeded.

The consequence cost real time during the 2026-10-27/28 work. Every image reviewed
that session came from **retried** drafts whose visual stage had completed before
the `art_direction` contract shipped. Those runs reused their old slide prompt,
`plan.art_direction` was `undefined`, `formatArtDirection` returned an empty string
and the whole block was omitted. The art direction therefore never reached the
image model, and the output still showed the flat-lay and props the new policy
names and refuses.

**Only a new campaign exercises a visual-stage change.** When judging whether
prompt work has any effect, create a fresh run; do not retry an existing draft, and
do not conclude a visual-stage change failed until a run that actually executed
that stage has been reviewed. As of this writing the art-direction work still has
no such review.

## Deployment incident: ghcr.io unreachable from the VPS


On 2026-10-27 two consecutive `deploy.yml` runs failed at **Deploy to the dedicated
VPS receiver** while build, non-root production-image test and image publish all
passed. The receiver could not reach the registry:

- first attempt: `docker login` succeeded, then the manifest `HEAD` timed out after
  60s (`dial tcp 20.205.243.164:443: i/o timeout`);
- second attempt: `docker login` itself timed out (`Client.Timeout exceeded while
  awaiting headers`).

Failing earlier on the second attempt looked like a degrading path and was reported
as sustained. It was not: a plain re-run roughly five hours later
([40633566477](https://github.com/lrmcorp/lrmsmmnew/actions/runs/40633566477))
succeeded with no change to the VPS, the workflow or the registry.

Lessons for the next occurrence:

- The receiver pulls **before** stopping the running container, so a pull failure
  leaves the current release serving and changes nothing. It is not an outage.
- Do not route around it. The deploy account is a forced-command receiver with no
  shell and no Docker-group access, and altering DNS, firewall, proxy or the
  registry as an incidental fix is forbidden by `AGENTS.md`.
- Re-run, then wait. Mirroring the image to another registry is a real option only
  if ghcr.io stays unreachable for an extended period, and it needs the user's
  decision and a new secret.
- `githubstatus.com` was outside the session container's allowed network domains,
  so a GitHub-side incident could not be confirmed either way.

## Known limitations and follow-up checks


0. **The art-direction work is unverified against a real run.** Every slide
   reviewed on 2026-10-27/28 came from a retried draft that skipped its completed
   visual stage, so no paid generation has yet received an `art_direction` block.
   Whether reference fidelity actually improved is unknown. A new campaign, not a
   retry, is required to find out. Do not report this work as effective until then.
1. Visual similarity is not measured as a percentage. JPEG encoding/scaling means
   exported pixels are not bit-identical. Source composition currently uses fixed
   reserved logo/product panels, not arbitrary reference-derived placement.
2. PNG originals converted before #8 cannot be reconstructed; re-upload when the
   original PNG/alpha is needed. Existing JPEG sources still remain usable.
3. At most four production reference images per run; Storyline reserves slots for
   its selected products/logo. A large catalog is not all attached to every image.
4. Instagram feed imagery is best-effort. Missing permission/CDN/media access must
   remain visible as unavailable; agents must not claim to have seen it.
5. Scheduler suggestions are contextual/heuristic, not measured optimal hours from
   account analytics. The calendar, conflicts and permission rules remain binding.
6. Deleting one memory rebuilds its summary from retained episodes and clears the
   previous generated Bible to avoid restoring deleted facts. It does not renumber
   surviving episodes or delete generated drafts, jobs, schedules or published posts.
7. Home's failed-post period uses post update time because no target failure timestamp
   exists. A thirty-day follower delta requires real baseline/current snapshots.
8. ChatGPT custom connectors depend on workspace/package support. No automatic
   reading of ChatGPT Projects or `sandbox:` image links is promised.
9. Backend readiness is not proof of live Meta publication/DM synchronization. Check
   target results and actual provider errors before diagnosing Meta configuration.

## Next-agent checklist


1. Inspect branch, `git status`, diffs and applicable AGENTS instructions before editing.
2. Read the current user task and the matching mockup notes; don't restart completed work.
3. Verify the actual frontend route/module, then follow it into services and schema.
4. Preserve data/permission/idempotency boundaries; use temporary fixture data.
5. Run relevant tests plus required CI gates; add durable coverage for concrete risks.
6. Update these documents for changed behavior. State unresolved items truthfully.
7. If pushing/deploying is authorized, inspect the PR checks and actual deployment
   conclusion, including receiver and public health steps. Attach created PRs in
   tools that support task artifacts. Do not stop at "image built".

## Incident and decision history

Newest first. Each entry records what was reported, what actually caused it and
what was decided, because several of these were misdiagnosed the first time and
the reasoning is the part worth keeping.

### The phone navigation drawer could never open: 2026-11-01


Tapping the menu button on a phone dimmed and blurred the page but showed no
menu. The scrim was appearing and the panel was not.

`index.html` carries a `<style id="critical-ui">` block for first paint, and it
contains `@media(max-width:760px){ ... .side{display:none} ... }`. That block
sits at line 15, **after** the `<link>` to `app.css` at line 11. Equal
specificity, later in document order, so it beat `app.css`'s `.side{display:flex}`
permanently rather than only until the stylesheets arrived. `.side` is the
drawer itself, so below 760px no amount of `.side-open` could reveal it:
`app.css` sets `transform: none` when open, and a transformed `display:none`
element is still nothing.

Measured in a real browser at 390px: before, `display:none` with a zero-size
box while `body.side-open` and the scrim were both present; after,
`display:flex` at 260x844 and x=0, above the scrim.

The fix is the smallest one that keeps the block's purpose: the critical rule
becomes `body:not(.side-open) .side{display:none}`, so first paint still hides
the sidebar on a phone and the open state falls through to `app.css`. Moving
the whole block above the stylesheet links is the more principled fix and was
deliberately not done: every other rule in it currently overrides the sheets,
and changing that wholesale is a far wider blast radius than this bug warrants.

`test/redesign-browser.cjs` now asserts, at 375px, that the drawer is hidden,
that opening it gives a panel over 200px wide fully slid in with
`display:flex`, and that closing hides it again. **Verified that it fails
without the fix**: reverting the rule alone produces `the phone navigation
drawer is visible when opened`. The assertions deliberately perform no
navigation, because two extra route changes were enough to trip the
application's own rate limiter and break a later assertion in that suite.

### Why every edit on that campaign failed: 2026-10-31


`Brief is required and must not exceed 10,000 characters.` on a schedule move,
and the same on a caption edit the day before. One cause.

`createPlan` stores each content's brief as the campaign brief plus that
content's own idea:

```js
`${body.brief}\n\n${idea.title}: ${idea.brief}`
```

Nothing bounded the sum. The reported session's own direction was at the field's
maximum (its counter read `10,000 / 10.000`), so every one of its thirty
contents was stored over the limit. Creation never checks the composed value, so
the campaign was created happily and only later edits failed.

`updateContent` then re-validated the **stored** brief on every PATCH, even when
the caller sent none. A caption edit sends `content` alone, a schedule move
sends `scheduled_at` alone, and both were refused by a rule about a field
neither of them touched.

Both halves fixed. `composeContentBrief` caps the stored brief at `BRIEF_LIMIT`,
eliding the shared campaign part because the content's own idea is what makes it
different. `updateContent` validates only what the request actually changes, so
drafts stored before this fix become editable again with no migration, and an
over-long brief the caller does send is still refused, now naming its length.

This is what the diagnostics in #41 were for: the previous report said only
"Something went wrong", and the message that replaced it pointed straight at the
cause.

### Naming the posts that block an approval, and moving a campaign as one: 2026-10-31


Approving a 30-draft campaign reported `4 posts do not have a future schedule.
Edit their schedules first.` and stopped there. Counting them is no help across
thirty drafts: the notice now lists each blocking post by its time and title,
each one opening that draft on a click, with `Select only these N` to narrow the
selection and `Move them to the future` to fix them in place. Eight are listed
and the rest counted.

`reschedule` asked for a number of days. That made the user do the arithmetic
and could not express "start on Monday at nine". It now asks for the new time of
the **first** selected post, prefilled with its current slot, and every other
selected post moves by that same delta, keeping its spacing. A new first time in
the past is refused with the reason, since those posts still could not be
approved.

`inputDialog` gained an optional `type`, defaulting to `text`, so the schedule
is picked rather than typed.

**Verified in a real browser** against a seeded campaign of eight drafts, three
of them in the past, because this logic lives inside the workspace closure and
the browser suite is coupled to its own fixtures (see RUNBOOK). The notice named
the three; `Move them to the future` with 5 Nov 09:00 produced 09:00, 10:00 and
11:00, their one-hour spacing intact, leaving the other five alone; selecting
all and moving the earliest from 4 Nov 00:16 to 10 Nov 07:30 moved all eight by
that same delta. No console errors.

Checked while there and **not** a bug: `fmtSlot` renders WIB correctly. A time
three hours in the past showed as 21:17 against `Intl` in `Asia/Jakarta` giving
21:17 for the same instant.

### A failed save hid its reason and silently blocked Approve: 2026-10-30


Reported together: editing a draft showed "Could not save. Something went wrong.
Try again.", and pressing Approve on a 26-draft selection did nothing at all.

They are one chain. `approve()` in `content-workspace.js` began with

```js
for(const saver of drawerSaves){await saver.flush();if(saver.error)return;}
```

so once any open drawer's autosave was in an error state, Approve returned
without a word. It now names the problem and tells the user to fix or close that
draft first.

`autosave` discarded the server's message and printed `common.error`. `errMsg`
already produces a good sentence from a validation failure, so the information
existed and was thrown away at the last step. `errorReason` in `ui.js` now
reports what the server said, falling back to the status and code. This is the
third generic message this week that sent diagnosis the wrong way, after
`Invalid request_id or session direction` and `Brief and request_id are
required`.

**The underlying save failure is not diagnosed.** `updateContent` was exercised
against a plan-created run carrying rotated references, in `review` status with
real media, over caption-only, caption-with-schedule, caption-with-media and
repeat saves. Every one succeeded, and `getRun` returns `media_ids` as an array,
so the client's `mids.join(...)` comparison is sound. `audit()` swallows its own
errors and cannot fail a request. The next report will carry the server's actual
message; do not guess before then.

### Captions came back as one block of prose: 2026-10-30


A reviewed caption ran as a single unbroken paragraph. The display was not at
fault: both the phone preview and `.cap` already set `white-space: pre-wrap`, so
newlines would have rendered. The caption genuinely had none.

Nothing asked for them. The JSON contract said only `Caption <=2200 characters`,
and a model writing into a JSON string does not add real newlines unless told
to. `caption-policy.js` holds `CAPTION_SHAPE`: a hook of one or two lines, which
is all a reader sees before "more", then one to three short paragraphs separated
by blank lines, a closing line of its own, and hashtags on a final line. It says
explicitly to use real newline characters.

It is applied at every stage that writes or keeps a caption, because a caption
that gains its paragraphs at one stage and loses them at the next is no better
than one that never had them: the concept and revision contract, the Storyteller,
the Manager as a correction to make rather than approve, the visual stage which
now carries the caption forward "including its blank lines", and the Final
Reviewer as a check.

The draft editor's caption box was four rows, which could not show a
multi-paragraph caption or leave room to add one. It is now twelve rows, 260px
minimum, and vertically resizable.

### Application branding: 2026-10-30


The interface used a text wordmark built in CSS. It now uses the Liando Reyfort
Management lockup supplied by the owner, in `public/brand/`:

| File | Size | Use |
|---|---|---|
| `lrm-logo.png` | 2000x569 | the lockup, sidebar and sign-in |
| `lrm-logo-light.png` | 2000x569 | the same artwork in white, for dark panels |
| `lrm-mark.png` | 419x569 | the monogram alone |
| `lrm-mark-light.png` | 419x569 | white monogram |
| `favicon.png` | 512x512 | the monogram centred on white, also the apple-touch-icon |

Each is trimmed from the supplied artwork and kept at its **native** pixel size,
and the stylesheet sets **width only**, so the browser scales every instance on
the artwork's own proportions. The square icon pads the monogram rather than
stretching it. Measured in a real browser: rendered 160x46, ratio 3.5153 against
the source's 3.5149, a sub-pixel difference.

`theme-color` moves from the old green to `#ffffff`, since the mark is black on
white. The product name in the title, strings and documentation is unchanged:
renaming LRMsmm was not asked for and touches far more than branding.

Noted while checking the rendered pages and **not** fixed here, to keep this
change to branding: the Home page's "Today's schedule" card links out with the
label `Kalender`, which the English UI gate does not catch.

### Text-only stages on Gemini Flash: 2026-10-30


Chosen by the account owner to cut running cost without waiting on OpenAI's
Sign in with ChatGPT approval. The split is by what a stage actually does:

| Stage | Provider | Why |
|---|---|---|
| concept, revision, manager, scheduler | `gemini / gemini-2.5-flash` | moves text around; Flash is multimodal, so the references it receives still arrive |
| storyteller | `anthropic / claude-sonnet-5-5` | carries a session's whole arc |
| visual | `anthropic / claude-opus-5` | reads the uploaded references at full detail |
| final | `anthropic / claude-sonnet-5-5` | looks at the finished images before a human does |
| image | `openai / gpt-image-2.5-sunburst` | no alternative at this quality |

Gemini also has a free tier, so these stages may cost nothing at this volume. A
missing Gemini key is not a failure: `settings()` already falls back to whichever
provider the account has a key for.

**Stored settings still win, and that is why `resetSettings` exists.** An account
that saved an agent team once could never pick up a better default. `DELETE
/v1/generator/settings` removes the stored row so the defaults apply again, and
the Agent team dialog offers it as "Use recommended team" behind a confirm. It is
audited as `generator.settings.reset`.

Tests that identified a stage by `response_format.json_schema` or read
`messages[1].content[0].text` were asserting the OpenAI request shape, not the
thing they were about. They now read the schema and the user text from whichever
shape the provider uses. Expect more of these whenever a role's provider moves.

### Storyteller on Claude Sonnet, and why a preset overrode it: 2026-10-30


The Storyteller carries a whole session's arc and ran on `gpt-4.1-mini`, which
is also the model that returned a content type the session could not produce.
Its default is now `anthropic / claude-sonnet-5-5`, chosen by the account owner.

A default alone would not have reached this account. `applyPreset` in the
workspace set **every** text role to one provider, `keys.has('openai') ? 'openai'
: ...`, so choosing Economy, Balanced or Quality moved the Storyteller back to
OpenAI whatever its default said. A preset picks the model tier, not the
provider: each role now keeps its own provider whenever there is a key for it,
and only moves when there is none.

A saved configuration still wins. Anyone who has saved AI settings keeps the
stored Storyteller model until they change it in the interface or press a preset
again, which is deliberate.

`test/storytelling.js` identified requests by `response_format.json_schema`,
which is the OpenAI shape, so every storyteller assertion broke the moment the
role moved to Anthropic. The helpers now read the schema, the user text and the
attached images from whichever shape the provider uses, which is what those
tests were always about.

### The count and the date range decide, not the posting times: 2026-10-30


Twelve posts over six days with two chosen times was refused, and twelve posts
over three days was impossible. Capacity was `days x chosen times`, minus any
time already past today and any slot held by an existing draft, so a session
started in the afternoon lost its first day and the workspace told the user to
extend the range. The count and the range are what the user actually decided.

`public/schedule-times.js` holds `perDayFor(count, days)` and
`fillPostingTimes(times, perDay)`. The times the user chose are always kept;
extra ones are placed in the widest gaps between them, within 06:00-21:00 WIB
and at least thirty minutes apart, rounded to five minutes so they read like a
person set them. Twelve posts over three days becomes four a day on its own:
`11:19, 15:00` becomes `08:40, 11:19, 15:00, 18:00`. `slotsFor` starts at the
arithmetic need and adds one more time a day until the posts fit or a day cannot
hold another, which also absorbs times already past and slots reserved by other
drafts. `createPlan` returns the effective `posting_times`.

The module is shared verbatim by the workspace and the scheduler, because the
gate that decides whether a session may start and the code that places the posts
must agree. It is dependency-free and holds no DOM or database access.

**Behaviour change, deliberate.** A plan whose chosen times have all passed today
no longer fails: a later time is added that same day. A capacity error now means
the range genuinely cannot hold the count, and its message says so rather than
suggesting more times. Two tests asserted the old refusals and were updated, not
loosened: `test/generator.js` same-day planning and
`test/account-specialist-session.js` six episodes in two days.

### Two Storyline session failures: 2026-10-30


**"Carousels require at least two slides. Automatic repair also failed."** The
Storyteller returned `content_type: carousel` for a one-image session. The system
prompt did ask for carousels only when `requested_slides` is at least two, but
`sessionSchema` offered `['image','carousel','reel']` unconditionally, so a
lightweight model could pick a type the session could not produce, and the whole
session died on it. The schema is now built per session: `storyContentTypes`
offers `carousel` only at two or more slides and `reel` only when the account has
an uploaded video, and the prompt names the same list. The `validate` check stays
as the backstop. This also removes the matching "Reels must use a video available
in the account catalog" failure for accounts with no video.

**"@manisky.id: Invalid request_id or session direction."** The workspace
appended its own rules (language, emoji, asset preservation) to the user's text
before sending: `direction: (brief.value + '\n' + rules).trim()`. The field's
`maxlength` is 10,000 and so is the server's limit, so a brief typed to the end
of the field always went over and failed the session. The campaign path sliced
to 10,000 instead, silently cutting the rules off the end.

Those rules were pure duplication: they are prepended to every agent's
instructions, the language also travels as `caption_language`, and asset
preservation is appended server-side at every stage. The client now sends the
user's own text unchanged.

Both validators were also splitting one message across unrelated faults. A
full-length direction reported itself as an invalid `request_id`, which sent
diagnosis the wrong way. Each fault now has its own message and an oversized one
states the actual length and the limit.

### One product per content, and not every content a product: 2026-10-30


Twelve posts in a campaign showed the same product twelve times. The cause was
in the workspace, not the agents: it picks the **first** product asset in the
Brand Kit and attaches it to the whole plan, and `createPlan` then wrote one
reference set across every run.

`catalogProducts` reads the account's own `account_brand_assets` of category
`product`, ordered by the Brand Kit's own order, and `rotateProductReference`
swaps this content's product into the client's reference set while keeping its
logo and visual picks and respecting the four-reference contract. Twelve
contents against twelve products use twelve different ones; against four they
cycle evenly. Each rotated set is validated like any other before it reaches a
run, and with fewer than two products nothing changes.

Separately, a feed of nothing but product photographs reads like a catalogue.
`SHOT_TYPES` entries now carry a `product` flag and one of the six is a
typographic card: one short line in the account's voice, no product, no
packaging, no hands. `product:false` also filters the product references out of
that run **before** the concept stage reads them, so no stage can drift back to
a packshot with words over it, `mockupDirection` is empty and
`steps.image.product_mockup` is false. One content in six is type-led; the ratio
is the length of the list and the position of that entry in it.

### Logo sized as a signature: 2026-10-29


Corner placements were 20% of the width by 7% of the height, which still read as
a banner at the top of the slide. They are now **13% by 4.5%**, roughly a third
of the previous area, and `hero-center` drops from 34% by 13% to 24% by 9%.

Placement was tidied at the same time. Every corner box sits on the same 6%
margin the artwork uses, and the three bottom boxes now end exactly on it
(`top: .895` + `height: .045` = `.94`), so the mark lines up with the frame
rather than floating near it. `protectedLayout` tells the model the mark is a
small signature and not to open an oversized empty band or a header strip for
it, since the reserved area shrinking is useless if the composition still leaves
a banner-sized gap.

Two assertions in `test/protected-composition.js` had to be corrected rather
than loosened: they compared integer pixel positions against float boundaries
and compared two rounded aspect ratios for exact equality, both of which only
held by luck at the old sizes. They now compare against the floored boundary and
assert each rendered box matches its source ratio to within one pixel.

### The brand name in the quoted headline: 2026-10-29


Release #29 banned the brand name from drawn lettering, and it still appeared.
The ban was only in the image prompt, while the headline is authored one stage
earlier. The Visual Conceptor wrote "… dengan MANISKY" into the slide prompt as
quoted on-image text, and the prompt also says quoted text is rendered verbatim,
character for character. Two rules, flat contradiction, and verbatim won.

Fixed at all three points. The Visual Conceptor is now given the account's own
banned words and told the headline must read complete without them.
`stripBrandFromQuotes` then removes those words from inside the quoted spans of
every slide prompt, together with a connector that only existed to introduce
them, so "Manicure Cantik Tanpa Kerumitan dengan MANISKY" becomes "Manicure
Cantik Tanpa Kerumitan"; a quote that was nothing but the brand is dropped
entirely. Only quoted spans are touched, so the brand described as printed on
packaging in the scene is left alone. The image prompt now says the ban outranks
the verbatim rule. The Final Reviewer flags lettering in the wrong language and
any brand name drawn as lettering.

### One output language per run: 2026-10-29


A session set to English produced an Indonesian headline and caption, and the
headline ended "dengan MANISKY" beside the composited mark.

The language was stated in three places that could disagree. The workspace
prepends the session choice to every agent's instructions. The account's Brand
Kit compiles "Write captions and on-image text in Bahasa Indonesia." into
`brand_notes`, which travel into the prompt twice: as `reference_notes` inside
`referenceDirection`, and as `brand_rules` inside the account specialization. The
JSON contract added "Write caption in the brief's language", and the brief is
whatever the user typed. Both competing statements sit *later* in the system
prompt than the session choice, so the session choice lost — the same
self-contradiction that caused the duplicate wordmark.

`output-language.js` resolves it once: session choice, else the Brand Kit default
parsed from the notes, else `id`. `generator_runs.caption_language` stores the
answer at creation (empty on older rows, which fall back to the Brand Kit exactly
as before). `stripLanguageDirectives` removes every language sentence and the
`Caption language:` marker from the notes before they are embedded, the contract
line is gone, and `outputLanguageClause` states the answer last and says in words
that it outranks the brand rules, the account profile and the brief's own
language. It is appended to the planner, concept, revision, visual, image and
Final Reviewer prompts, and to the Storyteller and Manager. `quickIdea` no longer
hard-codes Bahasa Indonesia: the brief it writes becomes the campaign brief, so
that one line was enough to carry Indonesian through the whole pipeline.

The language is derived state, so it stays out of the idempotency hash on both
paths, like `base_revision`.

### Logo seated in the emptiest area: 2026-10-28


`resolveLogoPlacement` measured every slot but only moved the mark when its
requested slot was outright busy (greyscale stdev above `BUSY_STDEV`) *and* a
calmer slot read below 75% of it. A mark in a merely-adequate corner therefore
stayed there while a genuinely empty corner went unused, which is what "not
properly seated where the blank space most" described.

Relocation now also fires on a plain margin: `PREFER_CALMER_BY = 5` stdev above the
calmest corner is enough on its own, with the old busy/`CLEARLY_CALMER` rule kept
for the clearly-occupied case. `CORNER_PLACEMENTS` excludes `hero-center` from both
sides of the decision: a hero mark owns the centre by design, so it is never
relocated and never a fallback to drift into.

Still a measurement of *quietness*, not of contrast. A flat area the logo's own
colours disappear into reads as ideal. Contrast remains a human review point.

### Identical layouts across one campaign: 2026-10-28


Every content in a campaign came back with the same composition and only the text
differed. Nothing in the pipeline asked for variety: each content's visual stage
runs independently, gets the same references, the same art direction and the same
policy, so the model converges on the one arrangement that best fits the brand. The
art direction is deliberately prescriptive about palette, light and typography, and
that is correct — the repetition was in *framing*, which nothing had an opinion
about.

`generator.js` now assigns a shot type. `SHOT_TYPES` holds five compositional
archetypes (product as sculptural hero in empty space; tight crop on finish and
texture; held or in use with the person partly cropped; type-led frame with the
product small against a calm area; off-centre lifestyle moment). `shotTypeFor(row)`
finds the row's position among its same-plan, same-account siblings ordered by
`created_at, id` and returns `{index,total,shot}`, cycling through the list. The
visual system prompt opens with that assignment and states plainly that the other
contents in the campaign are getting different framings on purpose, and that
palette, light, typography and treatment still come from the references — only the
framing is assigned. A run with no campaign siblings gets `null` and no clause.

Position is derived at prompt time rather than stored, so a retried draft that
re-runs its visual stage keeps the same index. Six contents reuse the first shot
type; that is intended, five distinct framings is the variety the complaint was
about.

### Duplicate brand wordmark: 2026-10-28


A reviewed slide carried two brand wordmarks: the original the server composites
into the reserved header, plus one the image model drew. A third, printed on the
product box in the scene, is legitimate packaging.

The rule against drawing a logo existed but sat early in the prompt in a single
clause, while `referenceDirection` immediately above it asked the model to carry
over the references' **text hierarchy**. The uploaded references are the brand's
own marketing images and prominently feature its wordmark, so reproducing it read
as following the instruction. The prompt contradicted itself and the earlier,
weaker clause lost.

`protectedLayout` now states the rule where a logo will actually be composited,
late in the prompt and as its own block: one official mark is added by the server,
so brand lettering drawn as a design element is a duplicate. It resolves the
conflict in words — a reference's text hierarchy means its type sizes, weights and
spacing, and the position its wordmark occupies is reserved empty space. Brand
lettering genuinely printed on the product or packaging in the scene stays allowed.
The Final Reviewer counts brand marks per slide and treats a second drawn one as
blocking. This improves the odds and guarantees human review; no server-side check
detects drawn lettering, and a generative model cannot be made to comply.

### Anthropic models refreshed: 2026-10-27


Read from Anthropic's own deprecations page, which **corrected an earlier claim
in this session**. `claude-sonnet-4-5` was reported here as already retired; it
is not. The accurate status at the time of writing:

| Model | State | Date |
|---|---|---|
| `claude-opus-4-1-20250805` | **Retired** | 2026-08-05 — requests fail |
| `claude-sonnet-4-5-20250929` | Deprecated 2026-09-30 | Retires **2026-11-30** |
| `claude-haiku-4-5-20251001` | Active | Not sooner than 2026-10-15 |

So the Concept Reviewer was **not** broken: the dateless `claude-sonnet-4-5`
alias resolves to the deprecated dated snapshot, which still works until
2026-11-30. `claude-opus-4-1` was genuinely retired and was still offered in the
picker, so any user who had selected it was failing.

The catalog is now `claude-sonnet-5-5` (default), `claude-haiku-5-5`
(lightweight) and `claude-opus-5-5` (detailed), and the Concept Reviewer default
moved to `claude-sonnet-5-5`. Sonnet 5.5 is also cheaper than Sonnet 4.5 per
token, so this is not a cost increase.

`RETIRED_MODELS` was renamed `SUPERSEDED_MODELS` because its meaning widened: it
now covers ids that fail today **and** ids with a published retirement date, so
`claude-sonnet-4-5` migrates ahead of 2026-11-30 instead of breaking on it.
`claude-haiku-4-5` is Active and is deliberately left alone — being older than
the current generation is not a reason to override someone's choice.

Checked while reading that page: `temperature`, `top_p` and `top_k` return 400
from Anthropic API version `2026-10-21`. This application sends none of them and
pins `anthropic-version: 2023-06-01`, so it is unaffected.

### Retired image model: 2026-10-27


**OpenAI shut `gpt-image-1` down on 2026-10-23.** Every Image Creator run failed
with a provider HTTP 400 from that date. The stage error said "Check the model
and provider account", which was a guess from the old generic error path, and the
rejection left no entry in OpenAI's request logs. This was unrelated to the visual
quality work deployed on the 27th, which merely coincided with it.

The default and catalog now use `gpt-image-2.5-sunburst`, with
`gpt-image-2.5-flare` also selectable. `RETIRED_MODELS` in `src/llm/providers.js`
maps a retired id to its replacement wherever a stored configuration is read:
saved agent settings, a settings save, and the agents snapshotted into an older
`generator_runs` row, so retrying a draft created before the shutdown reaches a
live model. Only retired ids are remapped; a working model a user chose is left
alone.

### input_fidelity belongs to the gpt-image-1 line only

Moving to `gpt-image-2.5-sunburst` surfaced a second rejection, reported by the
new diagnostics as `invalid_input_fidelity_model / image_generation_user_error`.
`generateImage` sent `input_fidelity: 'high'` on every OpenAI edit request. Only
the gpt-image-1 line accepts it; gpt-image-2 and later hold each supplied
reference at high fidelity on their own and reject the parameter outright. It is
now sent only when the model id matches `^gpt-image-1`, which keeps it working
for `gpt-image-1.5` until that model's 2026-12-01 shutdown. **Omitting it does
not reduce reference fidelity on 2.5**, so brand/product reference behavior is
preserved rather than traded away.

### The rest of the catalog is also stale

Deliberately **not** changed in this release, at the user's direction, but due:

- OpenAI text `gpt-4.1-mini` (default for five agents), `gpt-4.1`, `gpt-4o`,
  `gpt-5.1-codex-mini` — superseded by the GPT-5.6 line (`sol`, `terra`, `luna`).
- Anthropic: **done 2026-10-27**, see below.
- Gemini `gemini-2.5-flash` (Final Reviewer default) is deprecated and limited to
  projects that already used it; `gemini-2.5-flash-image` has conflicting shutdown
  dates reported (2026-10-02 vs 2027-03-15). `geminiModels()` reads Gemini's live
  catalog, so that provider partly self-heals; the hardcoded defaults do not.

Sourcing: the Anthropic lineup was read from the official docs. OpenAI's and
Google's documentation hosts were unreachable from the session container, so
those points come from search results and secondary sources that conflict on some
dates. Verify against each provider's own deprecation page before acting.

### Visual quality update: 2026-10-27


Generated slides ignored the account's uploaded references and reproduced a
generic marketplace flat-lay, with the server logo composited over the generated
headline. Fixed in three places: a required `art_direction` contract carrying the
Visual Conceptor's concrete observations into every image prompt, an explicit list
of refused defaults in `VISUAL_DESIGN_POLICY`, and measured logo placement in
`protected-composition.js` that will not stamp the original over lettering.
See [Hallmark Generator](HALLMARK_GENERATOR.md) and [cutouts and mockups](BRAND_CUTOUTS_AND_MOCKUPS.md).

Verified with mocked providers only: 69 production-mode backend checks, 40
application checks, 6 deployment tests, the English/SVG gates and the real-browser
redesign workflow. No paid image was generated and no post was published, so the
visual improvement itself is **not** demonstrated — it needs a real run reviewed by
a human. `test/browser-storytelling.cjs` and `test/browser-components.cjs` fail on
this checkout both before and after this change: they still expect the retired
Indonesian interface. They are not part of CI and were left alone.

### Brand asset update: 2026-10-23


Automatic white/transparent-margin preparation and in-scene product mockups
supersede the older full-photo product overlays. Logos still use source cutouts.
See [cutouts and mockups](BRAND_CUTOUTS_AND_MOCKUPS.md) for modes, limits and tests.

### Current implementation update: 2026-10-23


The current fix adds English UI/error messages, per-account agent context, direct
Drafts session navigation, capacity guidance and bounded malformed-story repair.
See [account-agent sessions](ACCOUNT_AGENT_SESSIONS.md). The earlier deployment
record above remains historical until the new release passes the actual receiver.
Preserve main’s Brand Kit raw-length fix, personal AI settings entry, available-key
provider defaults, Codex Responses adapter and ffmpeg/ffprobe CI setup.
