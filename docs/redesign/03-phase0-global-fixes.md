# 03 · Phase 0: global fixes, English UI, no emoji, shell and shared components

Mockups: **S1, S2, S3, S4, L1**. Ship this first; everything else depends on it.

## 0.1 Router race (bug #1)
```js
let navSeq = 0;
async function route() {
  const nav = ++navSeq;
  // … existing auth bootstrap …
  if (pageCleanup) { pageCleanup(); pageCleanup = null; }
  view = await pageX();
  if (nav !== navSeq) { pageCleanup?.(); pageCleanup = null; return; } // a newer navigation won
  $app.replaceChildren(view);
}
```
- Clear transient toasts from the previous page on navigation (keep toasts that have an action, such as Open).
- Clicking the active nav link re-runs `route()`.
- **Accept:** rapidly clicking Home > Content Generator > Drafts > Calendar always ends on Calendar; `#/generator?story_account=…` never shows the account page.

## 0.2 Home counts (bug #2)
- `pageHome`: `await loadAccounts()` before computing counts. The onboarding card shows only when `stats.accounts === 0`.

## 0.3 Sign in (bugs #3, #4) · mockup L1
- Errors render under the password field (`role="alert"`) and clear on input. Remove the error toast in `authPage`.
- On success remove all toasts. The button shows "Signing in…" and blocks double submit. "Show" toggle on the password field.
- Inline critical CSS (auth layout, shell skeleton, font fallback) in `index.html`. On a stylesheet `error` event, retry once with `?v=<timestamp>`.

## 0.4 Shell · mockup S1
- Sidebar groups (English): **Content** (Home, Content Generator > Drafts, New Post, Content Calendar), **Engagement** (Messages, Comments, Insights), **Workspace** (Companies & Accounts, Media Library, Team & Access, API & AI, Audit Log).
- "Personal settings" moves into the user card menu (keep the route `#/settings`).
- Badges: add `drafts` = sessions in "Needs action" (see `05-drafts.md`).
- Search (Cmd/Ctrl K) moves into the sidebar; it indexes pages, accounts (@handle and name) and sessions (title).
- Top bar: fixed-height chips, `white-space:nowrap`; breadcrumb `Group / Page`, truncating the group only.
- `pagehead()`: remove the group eyebrow chip.
- Nav icons come from `icons.js`.

## 0.5 Dialog components · mockup S2
Build `confirmDialog` and `inputDialog` (spec in `02`) and replace **every** native call:

| Location | Replace with (English copy) |
|---|---|
| app.js 666, cancel a scheduled post | danger · "Cancel this scheduled post?" · "It won't be published. You can schedule it again from New Post." · confirm "Cancel post" |
| 682, delete from history | danger · "Remove from LRMsmm history?" · "The post stays on Instagram/Threads." |
| 725, approve concept and create images | cost · details: slides, image model |
| 744, delete selected drafts | danger · `draft.delete.*` · up to 6 thumbnails |
| 782, approve to calendar | default · body names the account and slot |
| 789, create concept (single) | cost |
| 790, revise prompt and regenerate | cost |
| 792, revise slide (prompt + confirm) | **one** `inputDialog` with `draft.slide.revise.*`; no second confirm |
| 794, delete draft | danger |
| 827, create concepts for plans | cost · details: plans, posts |
| 856, delete personal API key | danger |
| 988 / 989, retry / stop stage | cost / danger |
| 1476, disconnect account | danger · body: number of scheduled posts that will be cancelled |
| 1527, alt text | inline edit in Media Library (no dialog) |
| 1528, delete media | danger |
| 1559, revoke API key | danger |
| 1655, remove member | danger |
| story-workspace.js 44 / 60 / 67 | danger / danger / default |

**Accept:** `grep -nE "\b(confirm|prompt|alert)\(" *.js` finds only the dialog implementation.

## 0.6 Shared components and scope bar · mockups S3, S4
- Build every component in `02` and a hidden owner-only page `#/_ui` that renders each in every state.
- Build `scopeBar` with global `state.scope`, localStorage and URL sync, plus `scopeAccounts()` and `inScope(item)` (works with `targets[]`, `account_id`, `account_ids`).
- Wire the scope bar on Content Calendar (replacing the two selects) and the Drafts list as proof. Other pages adopt it in their phases.

## 0.7 Misc
- Fix the literal `null` in New Post (bug #5); make sure `h()` ignores `null`, `undefined` and `false` children.
- Don't add new `<details>` for primary content.

## 0.8 English UI (whole app)
The entire interface is English. This is a full pass over every page, not only the redesigned ones.
1. Create `strings.en.js` exporting a flat object of keys → strings (start from `07-copy-en.md`) and a tiny `t(key, vars)` helper that interpolates `{name}` placeholders and warns in the console for missing keys in development.
2. Replace every hard-coded user-visible Indonesian string in `app.js`, `generator-studio.js`, `story-workspace.js`, `workflow-canvas.js`, `interactions.js` and `index.html` with `t()` keys: text nodes, button labels, placeholders, `title`, `aria-label`, toasts, `ERR` messages, empty states, confirm texts, `PAGE_LABEL`, nav labels, role names (`ROLE`), status labels (`labels`, `phaseNames`), agent names (`labels` in `pageGenerator`), and `<title>`/meta tags.
3. Locale: replace every `'id-ID'` in `toLocaleString`/`toLocaleDateString`/`Intl` calls with `'en-GB'`, keep `timeZone:'Asia/Jakarta'`, and use 24-hour times. Centralise in `fmtDay`, `fmtSlot`, `fmtRange`, `fmtDT`, `fmtTime`, `fmtNumber`.
4. Error messages coming from the API: map known `code`s to English via `ERR`; show unknown server messages under "Technical details" rather than as the main message (they may be Indonesian).
5. Generated **post content** (captions, story text) is not UI. **Caption language** (content, not UI): Indonesian by default; options Indonesian / English / Mixed. Set per account in the Brand Kit and overridable per session in the Content Generator. The app UI stays English. Pass the chosen language to the agents (e.g. "Write captions and on-image text in Indonesian."). Agent system prompts and the UI around them are English.
6. Customer-written content (DMs, comments) is shown as written.
7. **Accept:** a scripted scan (`scripts/check-ui-language.mjs`) finds none of these common Indonesian UI words in source string literals: `akun, konten, sesi, simpan, hapus, tinjau, setujui, buat, belum, sudah, semua, jadwal, perusahaan, pilih, pesan, komentar, beranda, kalender, pengaturan, tersimpan, gagal, berhasil, dibatalkan, menunggu, kembali, keluar, masuk`. Allow-list only Brand Kit/agent prompt templates that are intentionally multilingual, and comments.

## 0.9 No emoji (whole app)
No emoji or pictographic/dingbat characters anywhere in the **interface**: labels, buttons, toasts, empty states, placeholders, tooltips, notifications, nav, CSS `content:`. Post content (generated captions, customer DMs/comments) is excluded.
1. Replace every such character in source (today the app uses characters like ✓ ✕ × in buttons, "✓ API key tersimpan", "Selesai ✓", "✕" close buttons) with `icon(name)` SVGs from `icons.js` or plain words. `×` (multiplication sign) is allowed only as maths ("3 × 12"); close buttons use the `x` icon with `aria-label="Close"`.
2. Add `scripts/check-no-emoji.mjs`: scan `*.js`, `*.css`, `*.html` (excluding `node_modules` and vendored files) for the regex `/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{FE0F}]/u` and fail with file:line. Run it in CI or a pre-commit hook.
3. **Generated captions:** **Emoji in captions** (content, not UI): allowed by default (Brand Kit toggle on). If a brand turns it off, agents are told not to use emoji and the Final Reviewer flags any that appear. The app UI itself never uses emoji. When off, append to the concept/revision/final agent instructions: "Do not use emoji in captions, titles or on-image text." The review UI shows a warning chip on any post that breaks the setting. Caption text is data, so the CI script scans source files only, never stored captions.
4. Customer DMs/comments are displayed as written; that is user content, not app UI.
5. **Accept:** the script passes on the whole repo; a manual click-through shows no emoji in any menu.
