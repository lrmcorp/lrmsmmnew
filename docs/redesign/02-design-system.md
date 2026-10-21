# 02 · Design system & shared components

Build these **in Phase 0** in `components.css` plus a new `ui.js` module (or the top of `app.js`, matching current conventions). Every later phase uses them. Never re-style a one-off.

## Tokens

Add to `:root` in `app.css` (reuse existing variable names if equivalents exist; map, don't duplicate).

```css
:root{
  --c-bg:#f3f4f3; --c-surface:#fff; --c-side:#fafbfa;
  --c-text:#101828; --c-text-2:#344054; --c-muted:#667085; --c-faint:#98a2b3;
  --c-line:#e4e7ec; --c-line-2:#d0d5dd; --c-ink-soft:#f2f4f7;
  --c-brand:#0b6b4b; --c-brand-2:#0f8a61; --c-brand-soft:#e6f4ed; --c-brand-line:#bfe3d2;
  /* status */
  --c-ok:#0b6b4b;   --c-ok-soft:#e6f4ed;
  --c-warn:#b54708; --c-warn-soft:#fef4e6; --c-warn-line:#fbd9a7;
  --c-bad:#b42318;  --c-bad-soft:#fef0ef;  --c-bad-line:#fecdca;
  --c-info:#175cd3; --c-info-soft:#eef4ff; --c-info-line:#c7d7fe;
  --c-concept:#6941c6; --c-concept-soft:#f4f0ff;
  --r-sm:6px; --r-md:8px; --r-lg:12px; --r-xl:14px; --r-pill:999px;
  --sp-1:4px; --sp-2:8px; --sp-3:12px; --sp-4:16px; --sp-5:20px; --sp-6:24px;
  --fs-xs:11px; --fs-sm:12.5px; --fs-md:13px; --fs-lg:14.5px; --fs-h3:15px; --fs-h2:18px; --fs-h1:22px; --fs-num:28px;
  --shadow-pop:0 12px 30px rgba(16,24,40,.15);
}
```

Font: keep the current family (Plus Jakarta Sans–like). Headings 700–800, `letter-spacing:-.02em` on h1 and big numbers. `font-variant-numeric: tabular-nums` on counts, times and tables.

## Rules

1. **One primary button per view region.** Primary = the next step in the flow.
2. **Disabled buttons always explain why**, via the readiness checklist (Generator) or a tooltip and `aria-describedby`.
3. **No accordions for primary inputs or actions.** `<details>` is only for optional or advanced content (agent canvas, prompts, technical error details).
4. **Status = chip with text + colour.** Use the run-status table in `01` for colours.
5. **Every list has an empty state** with one sentence of why and one action.
6. **Account identity** everywhere = avatar (Meta photo or initials) + `@handle`. Full brand name goes in `title`/tooltip, not inline in pickers.
7. **Dates and numbers:** `fmtDay(iso)` → "Sat, 1 Nov"; `fmtSlot(iso)` → "Sat, 1 Nov · 12:15"; `fmtRange(a,b)` → "21 Oct – 3 Nov"; 24-hour times; numbers "2,322". All `en-GB` in `Asia/Jakarta`.
9. **English only.** Every user-visible string comes from `strings.en.js` via `t(key, vars)` (see `03` §0.8 and `07`).
10. **No emoji.** Icons are SVGs from `icons.js` via `icon(name)`. No emoji or pictographic/dingbat characters (e.g. ✓ ✕ ✦ ✎ ⚙ ⚠ ⏱ 🏢 👤) in strings, templates or CSS `content:`; checked in CI (`03` §0.9).
8. **Remove the group eyebrow chip** ("OPERASIONAL") from `pagehead()`; the breadcrumb already says it.

## Components to build

### `confirmDialog({title, body, tone, details, confirmLabel, cancelLabel='Batal'}) → Promise<boolean>`
- Built on `modal()`. `tone` ∈ `default | cost | danger`.
  - `cost` shows a blue "API cost" chip and an optional `details` table (rows `[label, value]`). The confirm button is primary.
  - `danger` shows a red "Cannot be undone" chip and a red confirm button.
- Esc / backdrop / Batal → `false`. Focus starts on Batal for `danger` and on Confirm otherwise.
- Mockups: S2 (left, middle), G4, D8.

### `inputDialog({title, label, placeholder, value, suggestions[], hint, confirmLabel, multiline}) → Promise<string|null>`
- `suggestions` render as chips that append text. Mockup: S2 (right).

### `chip(text, tone, {dot, icon})`
- Tones: `neutral, ok, warn, bad, info, concept, outline, selected`.

### `statusChip(run)`
- Maps `run.status` to label + tone from the `01` table. Use it everywhere a run status appears.

### `accountPicker({accounts, selected, mode:'multi'|'single', readiness?, onChange, maxInline=8})`: the only account selector (mockup S3)
- **One horizontal row of compact chips**, never a vertical stack of cards and never full brand names inline. Used in Content Generator (step 1), New Post ("Post to"), and the account filters in Content Calendar, Drafts, Comments, Messages, Insights, Media Library and Audit Log.
- Chip: 32px pill = 20px avatar (Meta photo, initials fallback) + `@handle`. Selected: green fill + `check` icon. `readiness` not OK: 8px amber dot (Generator only). Disabled: 50% opacity, reason in tooltip. Single mode can add a suffix inside the chip (e.g. "· Ep. 13"). The selected state uses the `check` icon, never a ✓ character.
- Tooltip on hover/focus: full brand name, follower count (`toLocaleString('en-GB')`), readiness text.
- Right of the row: "{n} selected · Select all" (multi). The company step comes first (scope bar or a company button left of the row).
- `accounts.length > maxInline`: show only selected chips + a dashed "{n} more · Search accounts" chip (with the `search` icon) that opens a popover with search, company group headers ("LRM Corporation · 5" + "Select all"), and checkbox rows (avatar, @handle, followers, readiness chip). The popover closes on outside click/Esc. **No Done or Clear buttons.**
- Mobile: the row is `flex-wrap:nowrap; overflow-x:auto` with selected chips first; it never wraps into a stack.
- Keyboard: roving tabindex across chips; Space/Enter toggles; arrow keys move.
- Implementation: the chip row is a `role="group"` (multi) or `role="radiogroup"` (single) of `<button aria-pressed>` / `role="radio"`.

### `scopeBar({page, views[], accountMode:'multi'|'single', extra})`: Company > Accounts > View (mockup S4)
The **only** way list pages filter by company and account. Fixed order, left to right:
1. **Company** button (`building` icon + name + chevron icon) → dropdown: "All companies" + each company from `companyGroups()` with its account count. Companies with 0 accounts are disabled, plus "Unassigned" when unassigned accounts exist, plus "Manage companies" (owner).
2. A chevron separator, then **Accounts** = `accountPicker` limited to the chosen company's accounts (with "All companies", chips are grouped under small company labels). Multi-select by default; `accountMode:'single'` for single-account views.
3. Page-specific filters (status tabs, source chips, toggles) after a divider.
4. **View** switcher, segmented control, right-aligned.

**Cascade rules**
- Choosing a company selects **all** its accounts. Narrow by clicking chips. Deselecting the last chip returns to all of that company.
- An account can never be selected outside the chosen company. Switching company clears account picks from other companies.
- Representatives only see companies and accounts assigned to them. If they have exactly one company, its button is read-only.

**Persistence**
- Global `state.scope = {companyId|null, accountIds:[]|'all', views:{[page]:view}}`, saved in `localStorage('lrm.scope')` (try/catch) and mirrored in the URL query `?co=<id>&acc=a,b&view=<v>` so links reproduce the view. URL wins over storage on load.
- The same scope applies on every page that has the bar. The view choice is remembered per page.
- When a stored scope hides data on a page the user just opened, show a one-time info callout (`scope.notice` / `scope.notice.cta`).

**Mobile (<760px)**: three buttons in one row: company, accounts ("{n} accounts", bottom sheet with checkboxes + "Show {n} accounts"), and a view icon menu. Never a wrapped stack of chips.

### `accountChip(account, {selected})`
- The same chip, non-interactive, for display (session meta, calendar events, lists). Mockups: D1, K1, G10.

### `readiness(accountId) → {ok, items:[{ok, text, action?}]}`
- Shown as the amber dot in `accountPicker` and as items in the summary checklist. Rules (shared by Generator G1/G3, Brand Kit B1 and Accounts A1):
  - **Required:** seed prompt non-empty (`profile.seed`), account `status==='active'`, at least one provider key with a text model (and an image model if AI images are on).
  - **Recommended (warning, not blocking):** ≥1 logo, ≥1 visual reference, ≥1 product photo (story mode).
- Completeness % = required (60%) + each recommended (≈13% each).

### `summaryPanel(model)`
- Sticky right column (bottom sheet on mobile). Shows total = accounts × posts, image count = total × slides (when AI images), period length, rhythm, team preset, readiness list, primary button with total in its label. Mockup: G1.

### `progressPipeline(steps)`
- 5 segments with labels and counts; states `done | working(pct) | failed | todo`. Mockups: G5, G6.

### `sessionCard(session)`
- Stacked thumbnails, title, accounts, mode chip, date range, state chip, stacked status bar, meta line (expiry or updated), primary action. Mockup: D1.

### `bulkBar({count, actions})`
- Sticky bottom bar on desktop and mobile. Primary action on the right. Mockups: D3, D7.

### `phonePreview({account, media[], caption, platform})`
- Instagram / Threads toggle, carousel dots, 4:5 media. Mockups: D5, C1.

### `emptyState({icon, title, body, action})`
- Mockup: D2.

### `autosave(saveFn, {delay:1000, statusEl})`
- Debounced, serialises saves, shows "Saving…", "Saved HH:MM" or "Not saved: <reason>"; exposes `flush()` for `pageCleanup`.

### Helpers
- `sessionTitle(plan)`: first non-empty line of `brief`, strip leading `#`s and markdown emphasis, collapse whitespace, convert ALL-CAPS to title case if the line is fully uppercase, truncate at 80 chars on a word boundary with "…". Keep the full text in `title`.
- `groupSessions(plans, runs)` and `sessionState(session)`: see `05-drafts.md`.
- `t(key, vars)`: English string lookup from `strings.en.js` (`07-copy-en.md`).
- `icon(name)`: SVG icon from `icons.js`. Add any missing icons there (building, user, spark, pen, gear, calendar, chat, lock, alert, clock, refresh, upload, bell, info, move, copy, image, grid, more, team, check, x, search, chevron-down, chevron-right).
- `sessionState(runs, plan)`: see `05`.

## Layout

- Content max width 1280px; page padding 24px desktop, 16px mobile.
- Two-column work layouts (Generator, session review, New Post): `minmax(0,1fr) 320–360px` with the right column `position:sticky; top:16px`. Below 960px it stacks and the right column becomes a bottom sheet / sticky footer.
- Top bar: chips have fixed height and `white-space:nowrap`. The breadcrumb shows `Group / Page` and truncates the group first.

## Motion
- 150–200ms ease-out for popovers, drawers and dialogs. Respect `prefers-reduced-motion`.
- Progress bars animate width only.
