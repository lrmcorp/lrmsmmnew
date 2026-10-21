# LRMsmm redesign pack

Instructions and reference mockups for an LLM coding agent (Claude Code, Cursor, etc.) to implement the UI/UX redesign of **LRMsmm** (`https://lrmsosmed.playgo.id`), with the most depth on the **Content Generator** and **Drafts**.

Two rules apply to the whole app interface: **the UI is English only**, and **the UI has no emoji**. Generated post content is separate: captions default to **Indonesian** (selectable per account and per session) and **may include emoji** (allowed by default).

## What's inside

| File | Purpose |
|---|---|
| `00-MASTER-PROMPT.md` | Paste this into the agent first. Role, rules, phase order, definition of done. |
| `01-codebase-map.md` | The front end today: files, functions, routes, API endpoints, run statuses, known bugs with line refs. |
| `02-design-system.md` | Tokens, shared components, interaction rules. |
| `03-phase0-global-fixes.md` | Bugs, the English conversion, the no-emoji rule, the shell, dialogs and the scope bar. |
| `04-content-generator.md` | Full spec for `#/generator` (mockups G1–G10). |
| `05-drafts.md` | Full spec for `#/generator/drafts` and the new session page (mockups D1–D10). |
| `06-other-menus.md` | The filter/view matrix and specs for every other menu (H1, C1, K1–K3, M1, R1, I1–I2, A1, B1–B2, ME1–ME2, P1, T1, J1, ST1, L1). |
| `07-copy-en.md` | English UI strings: navigation, labels, states, errors, confirmations. |
| `08-qa-checklist.md` | Acceptance checks per phase. |
| `09-agent-skills.md` | How to use the `plugin87/ux-ui-agent-skills` kit in each phase. |
| `mockups/lrmsmm-mockups.html` | All 43 annotated mockups, in English with line icons. Open in a browser. |

Hosted copy of the mockups: https://claude.ai/artifact/Gr2Es9gXFEgXbuG4feJGp9

## Menu names (old → new)
Beranda → Home · Sosmed Generator → Content Generator · Draft Konten → Drafts · Tulis Post → New Post · Kalender Konten → Content Calendar · Pesan (DM) → Messages · Komentar → Comments · Insights → Insights · Perusahaan & Akun → Companies & Accounts · Pustaka Media → Media Library · API & AI → API & AI · Tim & Akses → Team & Access · Jejak Audit → Audit Log · Pengaturan pribadi → Personal settings. Groups: Operasional → Content, Interaksi → Engagement, Administrasi & Integrasi → Workspace.

## How to use it
1. Open the real repository (the source of `app.js`, `generator-studio.js`, `story-workspace.js`, `workflow-canvas.js` and the CSS files) in your agent.
2. Copy this folder into the repo, e.g. `docs/redesign/`.
3. Paste `00-MASTER-PROMPT.md` as the first message.
4. Optional but recommended: install the UX/UI skills kit (see `09-agent-skills.md`).
5. Run one phase per session or PR. Review each PR against `08-qa-checklist.md` and the matching mockups.

## Phase order

| Phase | Scope | Mockups | Size |
|---|---|---|---|
| 0 | Global fixes, **English conversion of the whole app**, **no-emoji pass + CI check**, shell, dialogs, account picker, scope bar | S1–S4, L1 | L |
| 1 | Drafts: session list, session page, plan-only state | D1, D2, D3, D5 | L |
| 2 | Drafts: concept review, editor drawer, bulk approve, calendar view, mobile | D4, D6–D10 | L |
| 3 | Content Generator: unified composer, summary, readiness checklist, pre-flight dialog | G1, G2, G3, G4, G8 | L |
| 4 | Content Generator: running/failed sessions, agent presets, Story Bible, mobile | G5, G6, G7, G9, G10 | M |
| 5 | Brand Kit + Companies & Accounts | B1, B2, A1 | M |
| 6 | Remaining menus | H1, C1, K1–K3, M1, R1, I1–I2, ME1–ME2, P1, T1, J1, ST1 | M each |

Drafts comes before the Generator on purpose: the Generator's running-session card and its links point into the session page, so that page has to exist first.

## Source of truth
- Visual and interaction intent: the mockups. Behaviour, states and acceptance: the spec files. Where they disagree, the spec files win.
- Written from the **served front-end bundle** and a walkthrough on 20 Oct 2026. Line numbers refer to the served `app.js`. The backend wasn't inspected; anything needing a new endpoint is marked **[BACKEND]**.
