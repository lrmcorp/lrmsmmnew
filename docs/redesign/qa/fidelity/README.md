# Mockup fidelity follow-up

Reference: docs/redesign/mockups/lrmsmm-mockups.html and the page-specific detailed specs. This follow-up addresses the requested Generator, Draft Konten and Calendar pages, preserving the latest Bahasa Indonesia/WIB requirement. The installed penpot-uiux-design skill's design-system and accessibility guidance was read; no Penpot MCP tool was available, so the provided HTML remained the visual reference.

## Generator G1–G10

- G1: Three stepped sections, compact company/account chips with count/select-all, mode switch within step 2, structured format/slide/source controls, brief counter and append-only ideas, sticky 320px summary, live totals/readiness.
- G2/G9: Single-account Storyline, episode chip, empty direction, parsed chapter arc when present and readable Story Bible fallback. Real asset counts and product-photo warning.
- G3: Identity/Rules/Assets quick setup stages, tone helpers, language/emoji defaults, existing Brand Kit autosave and multiple assets. AI autofill is hidden because no backend endpoint exists.
- G4: Paid preflight stage table: text now, images after concepts, publication only after final approval. Optional in-app readiness notification; existing idempotent requests retained.
- G5/G6: Running/failed session pipeline with real completed counts, failed-only retry, technical details and compact three-session history. Successful Campaign creation stays on the Generator.
- G7: Described cost presets, provider/model controls grouped by recommendations and capabilities, optional canvas, default/apply actions and Gemini refresh.
- G8: Editable schedule sentence, date/count/time dialog, presets, Monday-first range calendar and removable time chips.
- G10: Compact stacked sections, horizontal account chips, fixed summary/action footer, vertical progress on mobile.

## Calendar K1–K3

- K1: Compact month header/navigation, Company → Accounts → draft toggle → View, Monday-first grid, status colors, avatar/time/truncated caption, draft links to session and status legend.
- K2: Detail side panel stays on Calendar; actual media/caption/accounts/schedule/source, edit, reschedule, cancellation and published Instagram link.
- K3: Account lanes, gaps/conflicts, date dragging and undo. The instruction pack names this additional view even though the attached HTML has only K1/K2 screens.

## Draft D1–D10

See DRAFT-REVIEW.md for each numbered screen and implementation limits.

## Verified

Full maintained browser workflow suite passed after integration: authentication, shared scope keyboard behavior, paid cancellation, autosave and navigation recovery, concept/image approval gates, retained approved drafts, read-only editor, handoff, partial bulk approval, Generator popover/canvas, Calendar side panel/account lanes, permissions, CSS fallback and route races. Desktop and 375/390px overflow checks passed. Focused Generator test additionally verified preflight rows, no provider request on cancel, Storyline and canvas. Three UI helper tests and language/SVG/whitespace gates passed.

Screenshots contain local fixture accounts/media, not production data. They demonstrate layout and states; no numerical pixel-match score is asserted.

## Explicit backend-dependent differences

Unsupported actions are not simulated: account-insight-based automatic time adjustment, weekday-only distribution, Brand Kit AI autofill, safe duplication to a draft, cross-account retargeting, approval undo and restoring deleted media. Existing scheduling distributes within the chosen range and slots. Notifications are in-app while the page polls, not background push. Model switching for a failed run remains through its actual saved-settings workflow; retry does not silently switch providers. Existing grouping and concept draft persistence limitations remain documented in IMPLEMENTATION-REPORT.md.
