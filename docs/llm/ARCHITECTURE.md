# Architecture and source map

## Runtime

Single Node.js 22.5+ ES-module application: Express 5, built-in `node:sqlite`,
Sharp and optional ffmpeg. Frontend is vanilla JavaScript served by the same app.
Worker polling runs inside this application process. There is no required Redis,
Postgres, Temporal, React or ComfyUI service in this repository. The node-canvas
experience is application UI, not a separate ComfyUI installation.

```mermaid
flowchart LR
    Browser[Vanilla JS dashboard] --> API[Express /v1]
    Client[External MCP client] --> MCP[MCP plus OAuth]
    MCP --> Services[Scoped services]
    API --> Services
    Services --> DB[(SQLite)]
    Services --> Files[Private media and public JPEG derivatives]
    Services --> LLM[User-key AI providers]
    Worker[In-process worker] --> Services
    Worker --> Meta[Instagram and Threads APIs]
    Meta --> Hooks[Signed webhooks]
    Hooks --> Services
```

## Active frontend modules

| Source | Responsibility |
|---|---|
| `public/app.js` | Application shell, auth, hash routing and workspace dispatch; also contains older implementations |
| `public/ui.js` | Shared dialogs, chips, scope controls, autosave, grouping/format helpers |
| `public/icons.js` | SVG icons |
| `public/strings.id.js`, `public/strings.en.js` | English UI catalog plus retained legacy Indonesian translations (not the active interface) |
| `public/generator-workspace.js` | Campaign/Storyline form, model drawer, quick ideas, progress and generation submission |
| `public/content-workspace.js` | Draft session list/detail, concept/image review and session-calendar presentation |
| `public/home-workspace.js` | H1 dashboard with scoped summary and polling cleanup |
| `public/workspace-pages.js` | Calendar, media, insights and team page factory; delegates Home, Accounts/Brand Kit and Audit |
| `public/account-brand-workspace.js` | Company/accounts and account Brand Kit/Story Bible/memory detail |
| `public/story-memory.js` | Shared named-memory picker and session mutations |
| `public/audit-workspace.js` | Audit filtering, human-readable events, CSV |
| `public/workflow-canvas.js` | Workflow canvas UI |
| `public/schedule-times.js` | Posting density: `perDayFor` and `fillPostingTimes`. **Shared verbatim with the scheduler** in `src/services/generator.js`, because the gate that decides whether a session may start and the code that places the posts must agree |
| `public/*fidelity.css`, `public/index.html` | Page styling and stylesheet order |

Do not change a legacy function just because its name matches the requested page.
Trace the current dispatch in `app.js` and delegated factories first. Some older
functions and `public/story-workspace.js` remain for historical/other call paths.

## Backend modules

| Source | Responsibility |
|---|---|
| `src/server.js` | Express app, auth endpoints, health, public media, social connect/callback and worker startup |
| `src/config.js` | Configuration/env parsing, public URL, data directory, Meta settings |
| `src/auth.js`, `src/services/scope.js` | Sessions, machine auth and company/account authorization |
| `src/routes/api.js` | REST wiring and dashboard-only `sessionOnly` boundaries |
| `src/routes/oauth.js`, `src/mcp.js` | LRMsmm OAuth/MCP, personal draft handoff and distinct Owner automation |
| `src/services/generator.js` | Provider settings/keys, planning, production stages, quick ideas, review, retries and approval |
| `src/services/storytelling.js` | Account foundations/catalog, named memory, storyteller/manager/scheduler jobs |
| `src/services/brand-metadata.js` | Structured identity and labeled asset metadata |
| `src/services/brand-asset-policy.js` | Mandatory identity/product preservation policy |
| `src/services/image-prompt.js` | Builds the image request: prompt budgeting under the 32k limit, art-direction formatting, `brandWords` and `stripBrandFromQuotes` |
| `src/services/output-language.js` | Resolves one caption/on-image language per run and strips competing language statements out of embedded notes |
| `src/services/caption-policy.js` | `CAPTION_SHAPE`: the paragraph structure every stage that writes or carries a caption must follow |
| `src/services/visual-design-policy.js` | `VISUAL_DESIGN_POLICY`: reference-led craft, refused defaults, text discipline and headline voice |
| `src/services/protected-composition.js` | Cleaned logo / explicit exact-product overlay; mockup products stay in scene |
| `src/services/brand-cutout.js` | Local background/padding preparation, original retention and derivative cleanup |
| `src/services/visual-context.js` | Authorized Meta feed thumbnails; constrained CDN fetch, cache and availability reporting |
| `src/llm/providers.js` | OpenAI, Anthropic and Gemini adapters, model/schema/image request handling |
| `src/services/media.js` | Uploads, JPEG derivatives, retained private PNGs, ownership, use checks and GC |
| `src/services/posts.js`, `src/worker.js`, `src/meta/` | Publishing, polling, retries, synchronization and Meta adapters |
| `src/services/dashboard.js` | Home summary and durable Owner reconnect requests |
| `src/services/calendar-workspace.js` | Move/retarget conflict checks and private duplication |
| `src/services/audit-workspace.js` | Scoped audit data and export support |

## Where prompt behaviour lives

Most of the product's recent behaviour is prompt assembly rather than control
flow, and the recurring failure mode is a prompt that contradicts itself: the
later, weaker statement wins. Two rules follow from that and are worth keeping.

**State a decision once.** Competing statements are stripped from the text that
gets embedded rather than left to fight. `stripLanguageDirectives` removes the
Brand Kit's language sentences from the notes before they travel, so
`outputLanguageClause` is the only language statement in the prompt.

**Put the authoritative statement last, and say that it outranks.** The
one-logo rule sits where the logo is actually composited; the output language is
appended after the policy, the account profile and the brief. Where two rules
genuinely conflict — render quoted text verbatim, versus never write the brand
name — the prompt says which one wins, and the server also removes the conflict
at its source.

## Persistence and ownership

`src/db.js` creates the schema and performs compatibility migrations on startup.
The default database is `DATA_DIR/lrmsmm.db`; media lives under `DATA_DIR/media`.
Preserve the existing encryption key when moving/restoring data.

| Tables/fields | Meaning |
|---|---|
| `users`, `sessions` and OAuth/API-key tables | User identity and distinct credential lifecycles |
| `companies`, `user_companies`, `accounts`, `user_accounts` | Company membership plus direct account grants |
| `posts`, `post_targets` | A post and independently succeeding/failing social targets |
| `media` | Public derivative path plus private `source_path`/`source_size_bytes` for new PNG uploads |
| `generator_plans`, `generator_runs` | Private production proposals, stages, source references, versions and approval linkage. `generator_runs.caption_language` stores the language resolved at creation; empty on rows created before that column, which fall back to the Brand Kit |
| `account_story_profiles`, `account_brand_assets` | Shared account foundation and pinned asset catalog |
| `story_memory_sessions` | Authoritative selected continuity: title, Bible, memory, next episode |
| `story_jobs`, `story_episodes` | Production history linked to a memory session; global vs session episode numbering |
| `conversations`, `comments`, `insights_daily` | Synchronized interactions and historical metrics |

Sessions are not generator plans: a named memory session can be continued through
several production jobs/plans. `story_jobs.memory_session_id` and
`story_episodes.memory_session_id/session_episode` keep continuity separate.
Legacy account memory migrates once to a session; compatibility profile summary
fields must not resurrect deleted sessions.

## Agent roles and their models

Eight roles, each configurable per user. The defaults follow what a stage
actually does, not one provider for everything:

| Role | Default | Why |
|---|---|---|
| `concept`, `revision`, `manager`, `scheduler` | `gemini / gemini-2.5-flash` | text only; Flash is multimodal so attached references still arrive, and it has a free tier |
| `storyteller` | `anthropic / claude-sonnet-5-5` | carries a session's whole narrative arc |
| `visual` | `anthropic / claude-opus-5` | reads the uploaded references at full detail and writes the art direction |
| `final` | `anthropic / claude-sonnet-5-5` | looks at the finished images before a human does |
| `image` | `openai / gpt-image-2.5-sunburst` | no alternative at this quality |

A stored configuration always wins over these defaults. `resetSettings`
(`DELETE /v1/generator/settings`) removes the stored row so the defaults apply
again, which is the only way an account that saved a team once can adopt a
better default. `settings()` falls back to any provider the account holds a key
for, so a missing key degrades rather than fails. `SUPERSEDED_MODELS` remaps
retired model ids wherever a stored configuration is read.

## Per-content variation

Every content of a campaign runs its stages independently from the same
references, so without intervention they converge on one answer. Three
mechanisms create difference, all derived rather than stored, so a retried draft
keeps its identity:

| Mechanism | Where | Effect |
|---|---|---|
| `shotTypeFor(row)` | `generator.js` | assigns one of six compositional framings by the row's position among its same-plan, same-account siblings; one of the six carries no product and its product references are filtered out before the concept stage reads them |
| `rotateProductReference` | `generator.js` | gives content *n* the *n*-th product of the account's catalogue, keeping the session's logo and visual picks within the four-reference contract |
| `resolveLogoPlacement` | `protected-composition.js` | measures greyscale spread in every candidate slot of the finished background and seats the mark in the emptiest corner |

## Production sequence

Campaign: plan ideas → **one run per idea per account** → concept → revision →
concept review → visual concept → image background → original asset composition
→ final QC → image review → final approval → scheduled post/targets → worker →
real Meta result.

Storyline first runs Storyteller → Manager → Scheduler against the chosen memory
session, creates proposed content and commits that session's continuity. Production
can then use the same content stages. A memory episode may describe a draft; agents
must not treat it as already published. Image/source paths and provider keys are
not public API payloads.
