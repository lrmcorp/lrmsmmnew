# 08 · QA checklist

Run **All phases** on every PR, plus the phase list. Attach screenshots at 1280px and 375px. If the UX/UI skills kit is installed (`09`), also attach the `/gate` score and the `/critique` verdict.

## All phases
- [ ] **English only:** no Indonesian text in any user-visible string, including toasts, errors (`ERR` map), placeholders, `title`, `aria-label`, empty states, dialog text and `<title>`. All strings come from `strings.en.js`.
- [ ] **No emoji in the interface:** `node scripts/check-no-emoji.mjs` passes (see `03` §0.9). No emoji or pictographic/dingbat characters in source strings, templates or CSS `content:`; icons come from `icons.js`. (Captions and customer messages are content and may contain emoji.)
- [ ] Dates `en-GB` in WIB (`Sat, 1 Nov · 12:15`), 24-hour times, numbers with comma thousands separators. No ISO strings, no raw markdown `#`.
- [ ] No `confirm(`, `prompt(` or `alert(` in touched files.
- [ ] No horizontal scroll at 375px, 390px and 1280px.
- [ ] Keyboard reachable, visible focus, accessible names on every control.
- [ ] Dialogs trap focus, close on Esc, return focus to the trigger.
- [ ] Status is never colour-only (chip text present).
- [ ] Contrast at least 4.5:1 for text (3:1 for large text and meaningful borders).
- [ ] Touch targets at least 40px on mobile.
- [ ] Loading, empty, error, partial and success states for every new list or async action.
- [ ] Owner-only routes and actions still hidden for Representatives (test with Devon Cuaca).
- [ ] No console errors; polling timers cleared on navigation.
- [ ] Account selection uses `accountPicker` (S3): one row of chips, never stacked tiles or full brand names inline.
- [ ] Every list page in the `06` matrix has the scope bar in the order Company > Accounts > filters > View.
- [ ] Choosing a company shows only its accounts and selects all of them; chips narrow; accounts from other companies can never stay selected.
- [ ] Scope persists across pages and reloads; `?co=&acc=&view=` links reproduce the view.
- [ ] Representatives see only assigned companies and accounts in every scope bar.

## Phase 0
- [ ] Rapid navigation (Home > Generator > Drafts > Calendar within 1 s) ends on Calendar with the right content.
- [ ] `#/generator?story_account=<id>` from an account page never shows the old page.
- [ ] Cold load of Home shows the correct "{n} Instagram · {m} Threads".
- [ ] Wrong password shows the inline error; a correct password leaves no error toast.
- [ ] Blocking `app.css` in DevTools still renders a usable sign-in page.
- [ ] `#/_ui` shows every shared component in every state.
- [ ] Drafts nav badge matches the "Needs action" count.
- [ ] A full click-through of every menu shows no Indonesian text (spot-check with the browser's find for common words: "akun", "konten", "Simpan", "Hapus", "belum").

## Phases 1–2 · Drafts
- [ ] The Manisky plan is a titled session card with a state and a working action.
- [ ] A plan whose runs were deleted shows "Drafts deleted" with an action.
- [ ] Tab counts equal the cards shown.
- [ ] Plan only: planned items with editable dates; "Create {n} concepts" shows a cost dialog and starts only the selected items.
- [ ] Concept review: edit title/caption/slide prompt, approve, images start, with one cost confirmation per batch.
- [ ] Image review shortcuts (Left/Right/A/E) work; single approve shows Undo (or a confirm if undo isn't supported).
- [ ] Editor autosaves; closing within 1 s of typing still persists.
- [ ] Bulk approve of 10+ items: progress line, result dialog, failures stay selected.
- [ ] Calendar view drag changes the date and keeps the time; Undo works.
- [ ] Old links `?plan=`, `?plans=`, `?id=` resolve correctly.
- [ ] 375px: one-at-a-time review with a sticky footer.

## Phases 3–4 · Content Generator
- [ ] Step 1: company button + one chip row; Select all works; above 8 accounts the popover appears.
- [ ] An account without a Brand Kit shows the amber dot; the checklist offers "Set it up now" (drawer) and "skip this account".
- [ ] Totals, image count and button label update instantly.
- [ ] Story mode: single-select, "Ep. 13" on @manisky.id, empty direction, chapter arc.
- [ ] Pre-flight dialog: stage table and provider; Cancel does nothing; confirm starts and shows the running card.
- [ ] Failed card maps 429/401/timeout to English messages; Retry touches failed items only.
- [ ] Agent drawer: presets switch models; only current-mode agents; no Transcribe/Computer Use/image models for text agents; Save as default persists.
- [ ] Caption language defaults to Indonesian (from the Brand Kit), can be changed per session, and generated captions use the chosen language.
- [ ] Emoji in captions are allowed by default; when a brand turns it off, generated captions contain none and the reviewer flags any that slip through.
- [ ] No `<details>` for accounts, schedule or queue.
- [ ] 375px: sticky footer with the total and button.

## Phases 5–6 · Other menus
- [ ] New Post: "Post to" fits one line for 5 accounts; no `null`; preview visible while typing.
- [ ] Calendar: account avatars, status colours, drafts toggle, side panel actions; By account flags empty days and clashes.
- [ ] Messages: one diagnostics chip; 24-hour countdown; composer locks after it ends.
- [ ] Insights: chart has a y-axis and date ticks; changes are correct; Compare table and total row correct.
- [ ] Accounts: company change only via dialog; Brand Kit column matches the Generator readiness.
- [ ] Brand Kit: no manual save button; labels editable; completeness % matches the rules.
- [ ] Media: visible count equals the header count for "All"; Grid / List / By account work with the scope.
- [ ] Audit Log reads as English sentences; repeats collapse.
- [ ] Password change lives in Personal settings > Security.
