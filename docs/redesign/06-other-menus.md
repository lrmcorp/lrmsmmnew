# 06 · Other menus

Each section: problems → required changes → acceptance. Mockup IDs in brackets. Copy from `07-copy-en.md`. Every page is English only and has no emoji.

## Filter and view matrix (mandatory)

Every page that lists content uses the **scope bar (S4): Company > Accounts > View**. Choose the company first; only that company's accounts can then be picked (multi-select unless noted). The scope is shared across pages and kept in the URL.

| Page | Scope bar | Account mode | Views | Page-specific filters |
|---|---|---|---|---|
| Home | compact (company > "All accounts (n)") | multi | — | — |
| New Post ("Post to") | company > chips (selects targets) | multi | — | — |
| Content Generator (step 1) | company > chips | multi / single (story) | — | — |
| Drafts (list) | full | multi | List · Cards · Calendar | tabs by state, search, sort |
| Drafts (session) | session's accounts only | multi | By date · Grid · Calendar | status chips |
| Content Calendar | full | multi | **By account** (K3) · Month · Week · List | show drafts toggle |
| Posts list (Calendar > List) | full | multi | List · Grid | status (published / scheduled / failed), date range |
| Messages | compact | multi | — (three panes) | Needs reply · All · Done |
| Comments | compact | multi | By post · Latest · By account | Needs reply · All · Hidden |
| Insights | full | single (Single account) / multi (Compare, I2) | Single account · Compare | period |
| Media Library | full | multi | Grid · List · **By account** (ME2) | source chips, Photos/Videos |
| Companies & Accounts | company only (tables are per company) | — | — | — |
| Audit Log | company > accounts (+ member) | multi | — | member, activity type, date |

"By account" views lane or group content per account so several brands can be compared side by side.

---

## Home `#/` · `pageHome` [H1]
**Problems:** first load showed "5 · 0 Instagram · 0 Threads" (accounts not loaded); the "connect your first account" card can show with accounts connected; four equal stat cards plus six quick-action tiles duplicating the sidebar; no prioritised task list.

**Changes**
1. `await loadAccounts()` first (Phase 0).
2. Header: greeting + date, compact scope (company > all accounts); actions "New session" and primary "New Post". Remove the quick-action tile grid.
3. **Needs action** list, by urgency: failed/partial posts → Fix; expired accounts → Reconnect (owner) or "Ask an owner to reconnect" (rep); DMs waiting over 5 minutes with the earliest window end → Reply; Drafts sessions needing action → Open session / Review; sessions expiring within 2 days. Empty: `home.tasks.empty`.
4. **Today's schedule**: timeline of today's posts (time, account chip, caption excerpt, status chip) + Calendar link; account health chips; "{n} Instagram · {m} Threads".
5. KPI strip: Scheduled next 7 days, Published last 7 days (+ failed), Unanswered comments, Followers total (30-day change, worst account named).
6. Onboarding card only when there are no accounts.
7. Everything on Home respects the scope.

**Accept:** correct counts on a cold load; each task row has a working action.

---

## New Post `#/compose` · `pageCompose` [C1]
**Problems:** personal AI connection panel above the task; target accounts are long brand names wrapping into stacked rows; a literal `null` after the media button; preview at the bottom.

**Changes**
1. Two columns: form (left), sticky `phonePreview` with Instagram/Threads toggle (right). Mobile: a Preview tab.
2. **Post to = company > accounts**: company button, then one row of @handle chips (S3). Brand names only in tooltips. Default = global scope.
3. Move the AI connection panel to API & AI / Personal settings. Only a chip remains when AI drafts are waiting ("{n} AI drafts waiting · Open").
4. Media: thumbnails with order numbers, "Add photo or video, or pick from Library", inline validation (max 10, ratio 4:5–1.91:1, size). Fix the `null` node.
5. Caption: Same for all | Per platform (tabs per platform using the existing per-account/Threads logic), counter, "Improve with AI" (only if a provider key exists), Hashtags.
6. When: Now | Schedule + slot picker + "Popular slots: 12:15 · 19:15".
7. Footer: retention note, Save draft, primary Schedule / Publish now.

**Accept:** 5 accounts fit on one line at 1280px; preview visible while typing; no `null`.

---

## Content Calendar `#/calendar` · `pageCalendar` [K1, K2, K3]
**Problems:** two full-width selects for company/account; events show only time + a few characters; no account identity; Generator drafts invisible.

**Changes**
1. Header: month title + previous / Today / next, primary New Post.
2. Scope bar (S4): Company > Accounts · "Show drafts" toggle · View: Month / Week / List / By account (the view switch moves out of the header).
3. Events: avatar + 24-hour time + title; colour by status: published (green), scheduled (blue), draft/plan (dashed), failed (red). Legend under the grid. Week starts Monday.
4. **By account (K3)**: one row per selected account × 7 days. Flags "empty {n} days" (3+ days without a post) and "clash" (posts under 30 minutes apart). Drag moves the day; for drafts, dragging to another account's row re-targets the draft.
5. Click an event → side panel (K2): media, caption, account, slot, source session chip; Edit / Reschedule / Duplicate / Cancel post (danger). Draft events link to D6.
6. Click an empty day → New Post prefilled with that date (keep).

**[BACKEND]** If `/v1/calendar` doesn't return generator runs, fetch `/v1/generator/runs` for the range and merge client-side.

---

## Messages `#/messages` · `pageMessages` [M1]
**Problems:** five identical diagnostic paragraphs as the page body; no layout when empty; the 24-hour reply window only mentioned in the subtitle.

**Changes**
1. Three panes: conversations (300px) · thread · customer context (260px, hidden below 1200px).
2. Tabs: Needs reply (count) · All · Done. Compact scope: company > "{n} accounts".
3. Sync diagnostics collapse into one chip `msg.sync.warn` with a popover listing each account and a "How to fix" link.
4. List row: avatar, name, last message, relative time, "over 5 min" red chip, receiving-account avatar.
5. Thread header: name + "via @account" + live countdown chip `msg.window`. After it ends, the composer is disabled with `msg.window.closed`.
6. Optional AI reply suggestions in the brand's tone (**[BACKEND]**; hide if absent). Customer messages are shown exactly as written (they may contain emoji; that is user content, not app UI).
7. Empty state: `msg.empty`.

---

## Comments `#/inbox` · `pageInbox` [R1]
**Changes**
1. One header row: title + tabs (Needs reply · All · Hidden) + compact scope + views By post / Latest / By account + "Synced {relative}".
2. Default grouping by post (thumbnail, caption excerpt, account, date, "{n} need a reply", Open post).
3. Each comment: inline reply field (AI suggestion prefilled when available), Reply, Reply by DM, Hide. "likely spam" chip for link/follower-offer comments with a red Hide.
4. Keep the empty state (`comments.empty`).

---

## Insights `#/insights` · `pageInsights` [I1, I2]
**Problems:** the account select shows the full brand description; nine equal sparkline cards without axes; no comparison; no link to posts.

**Changes**
1. Scope bar: Company > account(s). **Single account** (I1, single-select) or **Compare** (I2, multi): table of selected accounts (followers, 30-day change, reach, interactions, published, scheduled next 7 days) with a company total row; clicking a row opens Single account.
2. KPI row: Followers, Reach, Views, Interactions, each with a period-over-period change chip (value and %).
3. One main chart with a metric switcher: y-axis with 3 ticks, date ticks, area fill, end-point dot, annotation on the biggest change.
4. "Top posts this period" table linking to each post.
5. Secondary metrics (likes, comments, saves, shares, accounts engaged) in a compact table.
6. Footnote: `insights.updated`.

---

## Companies & Accounts `#/accounts` · `pageAccounts` [A1]
**Problems:** an always-visible company select on every account card saves on change; "Add company" is the primary button; no Brand Kit status.

**Changes**
1. Header: secondary Add company, primary Connect account (menu: Instagram / Threads).
2. One table per company: Account (avatar, name, @handle · platform), Followers, Brand Kit (completeness chip from `readiness`, links to B1), Connection (status + token expiry), more menu.
3. More menu: Brand Kit & Story, Integration details, Move to company… (dialog + confirm), Refresh name and photo, Reconnect, Disconnect account… (danger dialog stating how many scheduled posts will be cancelled).
4. Empty company: "0 accounts" + hint to use "Move to company".
5. "Refresh name and photo" for all accounts moves to a header overflow menu.

---

## Brand Kit & Story `#/accounts/:id?tab=brand` · `pageAccountDetail` + `storyWorkspace` [B1, B2, G9]
**Problems:** one large raw-markdown textarea; a manual save button despite autosave; assets listed by file name; no completeness signal; blank area after scrolling.

**Changes**
1. Header: avatar, name, @handle · company · platform · status; Integration details, primary "Plan a session" (→ `#/generator?story_account=<id>`).
2. Tabs: Brand Kit · Story Bible (G9) · Story memory (n) · Integration.
3. Completeness bar with the single most useful next step.
4. Cards: **Identity and tone** (essence, **caption language: Indonesian by default, options Indonesian / English / Mixed**, tone chips, **Emoji in captions** toggle (default on, allowed), "Edit full prompt (markdown)" opening the full seed in a large editor with preview); **Brand rules** (Do / Don't lists saved into the existing rules field).
5. Remove the manual save button; show "Saved automatically HH:MM".
6. **Brand assets**: Logo, Visual references, Product photos, Video / Reels with thumbnails, counts, status icons and dashed add tiles. Each asset has an editable **label** (default = file name without extension and without "WhatsApp Image"/"ChatGPT Image" prefixes); products have a description and collection (B2). "{n} of 250 assets".
7. Product upload (B2): multi-upload → one card per file with name (required), description, collection → "Save {n} products".
8. Both settings are passed into the agents' instructions: the caption language ("Write captions and on-image text in {language}") and, only if emoji are turned off, "Do not use emoji in captions". The Final Reviewer flags captions in the wrong language, or with emoji when they are off.

---

## Media Library `#/media` · `pageMedia` [ME1, ME2]
**Problems:** "7 files" in the header but nothing listed; alt text via `prompt()`; delete via `confirm()`.

**Changes**
1. Scope bar (S4): Company > Accounts. Media owned by an account (Brand Kit assets, AI results, tagged uploads) follows the scope; untagged team uploads appear under "All accounts (untagged)" and can be tagged. Views: **Grid**, **List** (file, account, source, size, used in, uploaded), **By account** (ME2, one section per account with counts and size).
2. Source chips with counts: All · Team uploads · Brand Kit · AI results; type: All · Photos · Videos. **[BACKEND]** `account_id` and `source` on media (or `?source=all`); until then merge Brand Kit assets client-side.
3. Tiles: thumbnail, label, source/account, "used in {n} drafts/posts". Click → side panel with details, inline alt text, used-in list, Delete (danger; blocked with an explanation if a scheduled post uses it).
4. Compact drop zone under the grid plus Upload in the header.

---

## API & AI `#/developer` · `pageDeveloper` [P1]
1. Three cards: Claude/ChatGPT connector URL + Copy; Claude Code/Cursor/n8n command + Copy; REST API docs.
2. API key table: name, last 4 characters, access chip, created, last used, Revoke (danger). Create flow: dialog → key shown once with Copy and a warning.
3. Connected OAuth apps with Revoke.

---

## Team & Access `#/team` · `pageTeam` [T1]
1. Members table: member (avatar, name, email, "You"), role chip, account access (avatar stack + count, or "All companies and accounts"), last active, more menu (Edit role and access, Remove: danger).
2. Role explainer card.
3. **Move the password form to Personal settings > Security**; leave a link.
4. Invite member dialog: email, role, account access via company > accounts picker.

---

## Audit Log `#/admin` · `pageAdmin` [J1]
**Problems:** raw event codes; repeated identical lines; stat cards duplicating Home.

**Changes**
1. Remove the stat cards; webhook/polling status becomes a header chip with a tooltip.
2. Filters: compact scope (company > accounts) + member, activity type, date; Export CSV. Events without an account appear only when "All accounts" is selected.
3. Group by day; each line is a sentence (`07` audit table), with type chip, time and source (dashboard / API key / AI).
4. Collapse consecutive identical events by the same actor within 15 minutes.

---

## Personal settings `#/settings` · `pageSettings` [ST1]
1. Title and breadcrumb: "Personal settings". Tabs: Profile · Security (password form moved from Team) · AI connections · Notifications (session ready, DM overdue).
2. AI connections table: provider (+ what it powers), status (connected + last test / number of models), used by agents, saved date, Test / Replace / Remove. Empty row: inline key input + Save.
3. Remove "Back to Generator" from the header; show a contextual back link only when arriving with `?from=generator`.

---

## Sign in [L1]
See Phase 0 §0.3. Copy in `07` (`login.*`).
