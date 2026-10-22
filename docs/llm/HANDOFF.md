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
