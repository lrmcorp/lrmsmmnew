# Engineering handoff

## Snapshot: 2026-10-22

- Correct repository: **lrmcorp/lrmsmmnew**. `lrmsocmedauto` is retired; do not
  deploy its Temporal/Postgres/Redis architecture or copy its old environment.
- Public application: `https://lrmsosmed.playgo.id`.
- Last verified deployed application commit:
  **`e31af9a820276867667563d0dca01bf1e15ccb57`**, PR [#8](https://github.com/lrmcorp/lrmsmmnew/pull/8).
- Deployment run [39727925380](https://github.com/lrmcorp/lrmsmmnew/actions/runs/39727925380)
  succeeded after one failed receiver attempt and a failed-job rerun. The successful
  attempt passed production-image tests, receiver deployment and public health.
  The first failure's root cause was not established; do not label it a confirmed
  networking or disk issue.
- Last verified checks: **40 application e2e**, **56 backend checks**, browser
  workflows, Bahasa/SVG gates, actual non-root production-image gates.
- These are historical observations, not a present-time uptime guarantee. Tests
  simulated AI/Meta and did not demonstrate a real paid generation or live post.

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

## Recent implemented releases

| Release | Changes | Evidence |
|---|---|---|
| #4 | Generator, Draft Konten and Calendar mockup alignment | `docs/redesign/qa/fidelity/` |
| #5 | Company/account tables, Brand Kit, Audit; native calendar drag/drop, retarget, undo and duplicate; asset policy | `docs/redesign/qa/accounts-brand-audit/` |
| #6 (`8c2103f`) | H1 Beranda, scoped actions, timeline/account health and accurate KPIs | `docs/redesign/qa/home/` |
| #7 (`874511c`) | Named story-memory sessions, selection, rename and deletion | `docs/redesign/qa/story-memory/` |
| #8 (`e31af9a`) | Reference-first images, original asset composition, PNG source retention and real Ide cepat prompts | `docs/redesign/qa/visual-quick-ideas/` |

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
