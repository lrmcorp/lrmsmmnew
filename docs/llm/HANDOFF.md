# Engineering handoff

## Snapshot: 2026-10-28

- Correct repository: **lrmcorp/lrmsmmnew**. `lrmsocmedauto` is retired; do not
  deploy its Temporal/Postgres/Redis architecture or copy its old environment.
- Public application: `https://lrmsosmed.playgo.id`.
- Last verified deployed application commit:
  **`d8042cf`**, PR [#30](https://github.com/lrmcorp/lrmsmmnew/pull/30).
- Deployment run [40693634301](https://github.com/lrmcorp/lrmsmmnew/actions/runs/40693634301)
  passed the non-root production-image test, the dedicated receiver and the public
  health check on its **third** attempt. Attempts 1 and 2 failed at the receiver
  with `ssh: connect to host *** port ***: Connection timed out`, about fifteen
  seconds each, matching the client's `ConnectTimeout=15`: the runner never opened
  a TCP connection. Nothing before that step was involved, the tested image was
  already published, and attempt 3 succeeded with no change to the code or the
  workflow. Treat a receiver timeout as the VPS, its `sshd` or the firewall in
  front of it, not as a fault in the release, and re-run the failed job rather
  than rebuilding.
- Last verified checks: **40 application e2e**, **77 backend checks**, 6 deployment
  tests, browser workflows and the English/SVG gates.
- These are historical observations, not a present-time uptime guarantee. Tests
  simulated AI/Meta and did not demonstrate a real paid generation or live post.
- `npm test` reported 39/40 once on 2026-10-27 and the failing check was not
  identified; it passed 8 consecutive runs afterwards and in CI. Treat a repeat as
  a real intermittent failure, most likely in publish-retry timing, not as noise.

### Prior snapshot, superseded

PR [#8](https://github.com/lrmcorp/lrmsmmnew/pull/8) (`e31af9a`) was recorded here as
the deployed commit until 2026-10-27, long after releases #15 and later had shipped.
Check the actual latest successful `deploy.yml` run on `main` rather than trusting
this section, and update it whenever a release deploys.

## Current implementation update: 2026-10-23

The current fix adds English UI/error messages, per-account agent context, direct
Drafts session navigation, capacity guidance and bounded malformed-story repair.
See [account-agent sessions](ACCOUNT_AGENT_SESSIONS.md). The earlier deployment
record above remains historical until the new release passes the actual receiver.
Preserve main’s Brand Kit raw-length fix, personal AI settings entry, available-key
provider defaults, Codex Responses adapter and ffmpeg/ffprobe CI setup.

## Brand asset update: 2026-10-23

Automatic white/transparent-margin preparation and in-scene product mockups
supersede the older full-photo product overlays. Logos still use source cutouts.
See [cutouts and mockups](BRAND_CUTOUTS_AND_MOCKUPS.md) for modes, limits and tests.

## Visual quality update: 2026-10-27

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

## Retired image model: 2026-10-27

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

## Anthropic models refreshed: 2026-10-27

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

## Duplicate brand wordmark: 2026-10-28

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

## Identical layouts across one campaign: 2026-10-28

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

## Logo seated in the emptiest area: 2026-10-28

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

## One output language per run: 2026-10-29

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

## The brand name in the quoted headline: 2026-10-29

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

## Logo sized as a signature: 2026-10-29

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

## One product per content, and not every content a product: 2026-10-30

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
| #34 | Product rotation across a campaign and a typographic non-product format | this page |

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

## Workspace note

The preceding implementation used `/workspace/lrmsmm-phase0`; other worktrees may
contain unrelated user edits. Absolute paths and old branches are session-specific,
not canonical repository architecture. During preparation of this documentation,
remote refresh failed because the session proxy was unavailable. The local #8
implementation commit is `a9ff06f`; its deployed squash commit is recorded above.
Verify remote state when connectivity returns; don't overwrite other worktrees.
