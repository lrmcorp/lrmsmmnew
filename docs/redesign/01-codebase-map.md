# 01 · Codebase map (current state)

Derived from the served bundle on 20 Oct 2026. Line numbers refer to served `app.js` (1,766 lines) and may be slightly off in source. **Verify each function before editing.**

## Files

| File | Size | Role |
|---|---|---|
| `app.js` | 160 KB | Everything else: `h()`, `api()`, `toast()`, `modal()`, state, shell, router, every page function. |
| `generator-studio.js` | 2.8 KB | `generatorStudio()`: the Storyline / Campaign tab wrapper and `chooseMode()`. |
| `story-workspace.js` | 15.5 KB | `storyWorkspace()`: Brand Kit + continuous story (seed prompt, rules, assets, story jobs, proposals). Used in `mode:'setup'` (account detail) and `mode:'production'` (Generator). |
| `workflow-canvas.js` | 11.6 KB | `workflowCanvas()`: the pan/zoom agent node canvas. |
| `interactions.js` | 1.2 KB | `bindInteraction()` helper. |
| `icons.js` | 9.4 KB | SVG icon map used by `icon(name)`. |
| `app.css` | 57 KB | Base styles, shell, pages. |
| `components.css` | 10 KB | Shared components. |
| `generator-studio.css` | 19 KB | Generator page. |
| `workflow-canvas.css` | 20 KB | Canvas. |

The stylesheets are loaded with separate `<link>` tags. On 20 Oct, `app.css` failed with `ERR_CONNECTION_RESET` and the login page rendered unstyled.

## Core helpers (app.js)

| Helper | Line | Notes |
|---|---|---|
| `h(tag, attrs, ...children)` | ~1 | Hyperscript. Attributes starting `on` become listeners; `style` accepts an object. |
| `api(method, path, body, opts)` | 67 | Fetch wrapper; throws errors with `.code`. |
| `toast(msg, bad, action)` | 80 | Appends to `#toast`. Auto-dismiss 4.5s / 10s (error) / 6s (with action). |
| `errMsg(e)` | 86 | Maps `e.code` via `ERR`. |
| `go(path)` | 87 | Sets `location.hash`. |
| `modal(title, body, actions)` | 88 | `<dialog>`-based. **Extend this** for `confirmDialog()` / `inputDialog()`. |
| `state` | ~96 | `{user, mock, accounts, companies, stats, lastOverdue}`. |
| `loadAccounts()` | 101 | Fills `state.accounts` / `state.companies`. |
| `badgeFor(key)`, `badgeEl(key)` | 118 | Nav badges. Add `drafts`. |
| `navGroups()` | 130 | Sidebar structure. |
| `shell(active, content)` | 186 | Sidebar + top bar wrapper. |
| `pagehead(title, sub, ...actions)` | 226 | Page header. Renders the group eyebrow chip, which should be removed. |
| `authPage(mode)` | 281 | Login / setup. Shows errors with `toast(err.message, true)`. |
| `route()` | 1720 | Hash router; `window.addEventListener('hashchange', route)` at 1764. |

## Pages and routes

| Route | Function | Line |
|---|---|---|
| `#/` | `pageHome` | 315 |
| `#/compose`, `#/compose/:id` | `pageCompose` | 383 |
| `#/posts/:id` | `pagePost` | 656 |
| `#/generator` | `pageGenerator` | 864 |
| `#/generator/drafts` | `pageContentDrafts` | 727 |
| `#/settings` | `pageSettings` | 832 |
| `#/calendar` | `pageCalendar` | 1056 |
| `#/inbox` | `pageInbox` | 1155 |
| `#/messages`, `#/messages/:id` | `pageMessages` | 1234 |
| `#/insights` | `pageInsights` | 1371 |
| `#/accounts/:id` (`?tab=brand`) | `pageAccountDetail` | 1410 |
| `#/accounts` | `pageAccounts` | 1433 |
| `#/media` | `pageMedia` | 1502 |
| `#/developer` | `pageDeveloper` | 1532 |
| `#/team` | `pageTeam` | 1589 |
| `#/admin` | `pageAdmin` | 1672 |

Pages set `pageCleanup` for timers. Drafts polls every 5s and the Generator every 2.5s.

**New route to add:** `#/generator/drafts/:sessionId` → `pageDraftSession(sessionId)`.

## Generator data model (as used by the front end)

### Plans (sessions)
- `GET /v1/generator/plans` → `{data:[{id, content_count, start_date, end_date, brief, …}]}`
- `POST /v1/generator/plans` (Campaign mode with schedule) and `POST /v1/generator/runs` (single runs). Called from `submitForAccounts(kind, body)` (≈line 922).
  - **One plan is created per selected account** (`account_ids:[aid]`), all sharing a client batch id `request_id = batch.id + '-' + i`.
  - Before posting, it fetches each account's Brand Kit and attaches up to 1 logo, 1 visual and 2 product asset ids as `reference_media_ids` / `reference_roles`, plus `reference_notes`.
- `POST /v1/generator/plans/:id/start {confirm_cost:true}` → `{queued}`. Creates concepts for every planned run in the plan.
- Story mode: `POST /v1/generator/story-jobs`, `GET /v1/generator/accounts/:aid/story-jobs`, `DELETE /v1/generator/story-jobs/:id`, `POST …/story-jobs/:id/retry`. A story job has a `plan_id`; its proposals are runs with that `plan_id`, ordered by `story_episode`.

> **Session grouping.** The UI concept "session" = all plans created by one Generator submit. The backend doesn't expose a batch id, as far as the front end shows. **[BACKEND]** Add `session_id` (or `batch_id`) to plans, set from the `request_id` prefix. Until then, group client-side: same `brief` + same `start_date`/`end_date` + `created_at` within 5 minutes. A single-account plan is its own session.

### Runs (content items)
- `GET /v1/generator/runs` → all runs (filtered client-side today).
- Fields used: `id, plan_id, status, title, brief, caption, scheduled_at, schedule_reason, content_type, story_episode, slide_count, media[], media_versions[], targets[{account_id}], steps{concept,revision,visual,image,final,…}, expires_at, error, post_id, draft_id, references, reference_notes, reference_roles`.
- Actions:
  - `PATCH /v1/generator/runs/:id {content, brief, scheduled_at, media_ids?}`: save
  - `POST …/runs/:id/start {confirm_cost}`: planned → concepts
  - `POST …/runs/:id/approve-concept {concept, confirm_cost}`: concept_review → images
  - `POST …/runs/:id/approve {content, scheduled_at}`: review → approved (post created, `post_id`)
  - `POST …/runs/:id/revise {request_id, brief, confirm_cost}`: new run, old one cancelled
  - `POST …/runs/:id/slides/revise {request_id, slide_index, instruction, confirm_cost}`
  - `POST …/runs/:id/retry`, `POST …/runs/:id/draft` (send to New Post)
  - `DELETE …/runs/:id/content`, `POST /v1/generator/drafts/delete {ids}`

### Run statuses → UI labels (use these everywhere)

| `status` | Label (chip) | Chip colour | Bucket |
|---|---|---|---|
| `planned` | Plan | neutral | Plan only |
| `queued` | Waiting | blue | In progress |
| `running` | In progress | blue | In progress |
| `concept_review` | Review concept | purple | Needs action |
| `review` | Ready | amber | Needs action |
| `failed` | Failed | red | Needs action |
| `approved` | Approved | green | Done |
| `drafted` | In New Post | green | Done |
| `cancelled` | Cancelled | neutral (hidden by default) | — |

Deletable today: `planned, concept_review, review, failed, cancelled` with no `post_id`/`draft_id`.

### Settings / agents
- `GET/PUT /v1/generator/settings` → `{agents:{role:{provider,model,instructions}}, providers:{openai|anthropic|gemini:{textModels,imageModels,textModel,imageModel,image,live}}, keys:[…]}`
- `GET /v1/generator/providers/gemini/models?refresh=true`
- Roles: `concept, revision, visual, image, final` (campaign) + `storyteller, manager, scheduler` (story).

### Brand Kit
- `GET/PUT /v1/generator/accounts/:aid/brand` (seed prompt, rules / `brand_notes`, `assets[]` with `category` ∈ `logo|visual|product|video`, `media_id`)
- `POST/PATCH/DELETE /v1/generator/accounts/:aid/assets[/:id]`
- `storyWorkspace` already autosaves (`markDirty` → 1.2s → `save()`), but still renders a "Simpan fondasi cerita" button.

## Data needed for company → account filtering everywhere

| Page | Data today | Filter by company/account | Gap |
|---|---|---|---|
| Content Calendar | `/v1/calendar?from&to` posts with targets | client-side via `targets[].account_id` → `state.accounts[].company_id` | ok |
| Drafts | runs with `targets` | client-side | ok |
| Posts list (`#/calendar?v=list`, Home lists) | `/v1/posts` | client-side via targets | add `?account_ids=` server param for large lists **[BACKEND]** (nice to have) |
| Comments | `/v1/comments?…&account=` (single) | multi-account needs repeated calls or `account_ids=` | **[BACKEND]** accept comma list |
| Messages | `/v1/conversations?filter&account=` (single) | same | **[BACKEND]** accept comma list |
| Insights | `/v1/accounts/:id/insights` per account | "Bandingkan" = N parallel calls (≤ 10) | ok |
| Media Library | `/v1/media?limit=100`, no account field seen | needs account ownership | **[BACKEND]** add `account_id` (nullable = "All accounts") + `source` to media; include Brand Kit assets with their account |
| Audit Log | `/v1/admin/audit` | needs account/company on events | **[BACKEND]** include `account_id` where relevant |

## Language and emoji today
- Every UI string is a hard-coded Indonesian literal inside `h()` calls across `app.js`, `generator-studio.js`, `story-workspace.js` and `workflow-canvas.js` (nav labels in `navGroups()`, `PAGE_LABEL`, `ROLE`, the `ERR` map, status `labels`/`phaseNames`, toasts, placeholders, `aria-label`s). Dates use `'id-ID'`. Phase 0 §0.8 moves all of them to `strings.en.js`.
- Several labels use dingbat characters as icons (e.g. "✓ API key tersimpan", "Selesai ✓", "✕" close buttons). Phase 0 §0.9 replaces them with `icons.js` SVGs and adds a CI check.

## Known bugs found during review

| # | Bug | Where | Fix |
|---|---|---|---|
| 1 | **Routing race**: a slow previous page can render over a newer route (reproduced: URL `#/generator`, page still showing account detail for several seconds; and `#/generator` from `#/` stuck on the dashboard). | `route()` 1720 | Navigation token: `const nav = ++navSeq;` before awaiting the page; after the await, `if (nav !== navSeq) return;` before `$app.replaceChildren`. Also call `pageCleanup` for the aborted page. |
| 2 | Dashboard shows "5 · 0 Instagram · 0 Threads" and may show "Sambungkan akun pertama" with accounts connected. | `pageHome` 315 uses `state.accounts` without awaiting `loadAccounts()`. | `await loadAccounts()` at the top (like other pages). Show onboarding only when `stats.accounts === 0`. |
| 3 | Stale "Email atau password salah" toast after successful login. | `authPage` (toast on error) | Inline field error. Clear all toasts on successful auth and on every `route()`. |
| 4 | Login unstyled when a stylesheet fails. | HTML `<link>` tags | Inline critical CSS for the auth page and shell skeleton. Add `onerror` retry once with a cache-busting query. |
| 5 | Literal `null` rendered after "+ Foto / video". | `pageCompose` (media area) | A child evaluates to the string `"null"` (likely template-string concatenation). Ensure `h()` skips `null`/`undefined` and the caller passes `null`, not `` `${x}` ``. |
| 6 | Media page says "7 file" but the list is empty. | `pageMedia` 1502: usage counts all files; `/v1/media?limit=100` returns only library uploads. | Show all sources with a source filter (ME1). **[BACKEND]** may need `?source=all`. |
| 7 | Plan label shows raw markdown and ISO dates. | `pageContentDrafts` 738 | `sessionTitle()` + `fmtRange()` helpers (see `02`). |
| 8 | Native `confirm()` ×20, `prompt()` ×2. | app.js 666, 682, 725, 744, 782, 789, 790, 792 (×2), 794, 827, 856, 988, 989, 1476, 1527, 1528, 1559, 1655; story-workspace.js 44, 60, 67 | Replace with `confirmDialog()` / `inputDialog()`. |
| 9 | Drafts bulk selection can only delete. | `pageContentDrafts` `deletable()` | Add bulk approve / reschedule (D7). |
| 10 | Model dropdowns list every Gemini model, including Transcribe, Computer Use and image-only models, for text agents. | `drawModels()` in `pageGenerator` | Filter by capability per role (G7). |
| 11 | Storyline "Arahan" textarea pre-filled with the full story bible. | `storyWorkspace` production mode | Keep `direction` empty; show the bible separately (G2/G9). |
