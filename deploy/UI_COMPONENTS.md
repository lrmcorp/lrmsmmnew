# Shared UI and interactions

The component refresh uses original LRMsmm HTML/CSS/JavaScript. The user supplied Affect UI as a replacement visual reference and allowed an equivalent implementation. Its website returned HTTP 403 from the development environment, so this change does not claim a pixel match or to include its component package/source code/assets. The separate `lrmui` skill was not available in this workspace or the accessible HRGHRD branches; no unverified skill content was invented.

## Application-wide components

- `public/components.css`: shared surfaces, spacing, controls, menu states, segmented choices, dialogs, toast notifications, form focus rings and micro-interactions. Existing emerald identity, native controls, route behavior, generator references and agent-state animations remain compatible.
- `public/interactions.js`: async buttons and form submissions show `aria-busy`, disable repeat activation while their Promise is pending, and restore their controls on completion/failure. Errors that handlers do not already catch use the existing notification surface. This is a UI duplicate-click guard; server-side idempotency remains the publishing guarantee.
- Navigation includes a scoped command dialog (**Ctrl/Cmd + K**) with search, arrow-key navigation, Enter and Escape. Commands come from the same role-filtered menu list; Representative users do not receive admin commands.
- The mobile drawer manages focus, Escape, `aria-expanded`, background inertness and scroll locking. Desktop resizing resets the drawer cleanly.
- Dialogs have accessible headings; notifications can be dismissed. `prefers-reduced-motion` disables decorative transitions/animations, including spinners; disabled and busy states remain available independently of motion.

## Generator and personal settings

- `#/settings` holds each signed-in user's encrypted provider keys, saved status, replacement, connection test and deletion. It is linked from the sidebar footer, menu search and Generator header; Representatives retain their two operational sidebar groups.
- Generator opens with compact account and schedule summaries. Account checkboxes use a single horizontal row; **Selesai** collapses the picker without clearing selection. Company filtering preserves selections. Schedule fields expand when editing; model controls stay in workflow nodes.
- Brand assets and usage rules are edited only in Account Details → Brand Kit & Cerita. The canvas has no duplicate asset upload node. Regular campaigns inherit a saved logo, visual reference and up to two product photos per account; Storyteller selects products from the saved catalog. Each selected campaign account receives separate runs/plans and its own asset snapshot. Session plans are grouped in Draft Konten; content count is per account. Existing drafts retain their original snapshots.
- The saved storyline editor and generation actions share a compact responsive panel. Story results and approval behavior are unchanged.

## Penpot skill based Generator redesign

The requested `penpot-uiux-design` skill is installed in `.agents/skills/penpot-uiux-design`, with provenance in `skills-lock.json`. Its clarity, progressive disclosure, accessible controls and responsive layout guidance is applied to the existing white/emerald LRMsmm design system. No Penpot MCP connection was available; implementation and visual checks ran directly in the application, and no Penpot design file is claimed.

- `public/generator-studio.js` / `.css` present **Storyline berkelanjutan** and **Campaign baru** as keyboard-accessible tabs. Editing values survive mode changes. Each mode shows its own account controls; planning is shared.
- The editor owns the main action. A session summary shows actual account, dates/times in WIB, content/slide counts, saved Brand Kit counts and review-ready draft counts. It collapses by default on narrow screens.
- The white canvas and all seven model/instruction controls remain in **Tim agen & model**. Live states come from existing jobs; routine creation does not require panning the canvas. Campaign previews and approvals are also available outside the canvas. Deep links to a campaign run select the campaign mode.
- API keys remain in personal settings, Brand Kit uploads remain in account details, and existing authorization/publication gates are unchanged. Missing seed, loading account data and campaign validation have explicit UI states. The generator is disabled while switching account data; errors preserve entered text.
- Summary updates avoid rebuilding unchanged controls during polling; media-query listeners and workflow observers are disposed on route changes. Skill sources are excluded from the production image.

## Verification

An optional browser regression is saved at `test/browser-components.cjs`. It runs the real app against temporary SQLite/media, uses fixture credentials and simulated Meta, and never publishes to a real social account. It covers keyboard search, scoped commands, mobile drawer/focus state, pending button deduplication, a 12-content manual plan, photo upload, review-to-calendar approval, login form pending state, failed-login notification dismissal, and 390px/1440px layouts.

Provide Playwright and a Chromium executable in your test environment (they are not production dependencies), then run:

```bash
PLAYWRIGHT_MODULE=/path/to/playwright CHROMIUM_EXECUTABLE=/path/to/chromium node --no-warnings test/browser-components.cjs
```

If Playwright is resolvable normally, omit PLAYWRIGHT_MODULE. The browser test is optional and requires explicit browser tooling; the existing CI checks continue to test application and production-image behavior. Separate local generator browser checks also verify reference-image uploads, active-stage animation and reduced-motion behavior under the shared styles.

### Scheduler model availability

The Generator fetches Gemini's model catalogue using the signed-in user's encrypted personal key, with a five-minute metadata cache. Refresh it from **Tim agen → Perbarui model Gemini**. Catalogue availability does not guarantee generation quota. Keys and raw provider errors are never returned to the browser.

If the Storyline Scheduler alone receives HTTP 404, it preserves completed Storyteller/QC output and creates a validated rules-based schedule across the selected future WIB slots. The proposal explicitly labels this fallback and its reasons; it does not claim account analytics or make an additional paid model call. Authentication, quota, malformed output, and invalid schedules still fail visibly. Existing failed sessions require **Coba ulang sesi**; completed stages are reused. Publishing still requires human approval.


### Simplified production and thumbnail drafts

The routine Generator screen contains account, schedule, direction and one Generate action. Both Storyline and campaign generation produce complete proposals without a separate concept approval. The optional Tim agen & model disclosure retains the editable white workflow and model controls, including Final Visual Conceptor before Image Creator. Brand assets stay in account details; API keys stay in personal settings. Publication remains a separate human decision.

Draft Konten is an image-first gallery with keyboard-accessible checkboxes, Select all and a count of selected deletable items. Bulk delete requires confirmation and is validated server-side before any deletion. Filter changes clear selections that are no longer visible. Preview/edit uses an accessible native dialog opened by a thumbnail; no draft editor opens automatically on gallery navigation. Direct draft links open that specific preview. Filters and production tools are collapsed by default.

`test/visual-production.js` verifies complete generation, real profile thumbnails reaching the visual agent, rejected non-Meta/private media URLs, exact caption retention, refined prompts reaching Image Creator, no automatic publishing, model compatibility and scoped bulk deletion. With PLAYWRIGHT_MODULE set it also tests desktop/mobile gallery selection, delete, preview, and one-click campaign production.
