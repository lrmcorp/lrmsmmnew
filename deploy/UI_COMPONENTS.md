# Shared UI and interactions

The component refresh uses original LRMsmm HTML/CSS/JavaScript. The user supplied Affect UI as a replacement visual reference and allowed an equivalent implementation. Its website returned HTTP 403 from the development environment, so this change does not claim a pixel match or to include its component package/source code/assets. The separate `lrmui` skill was not available in this workspace or the accessible HRGHRD branches; no unverified skill content was invented.

## Application-wide components

- `public/components.css`: shared surfaces, spacing, controls, menu states, segmented choices, dialogs, toast notifications, form focus rings and micro-interactions. Existing emerald identity, native controls, route behavior, generator references and agent-state animations remain compatible.
- `public/interactions.js`: async buttons and form submissions show `aria-busy`, disable repeat activation while their Promise is pending, and restore their controls on completion/failure. Errors that handlers do not already catch use the existing notification surface. This is a UI duplicate-click guard; server-side idempotency remains the publishing guarantee.
- Navigation includes a scoped command dialog (**Ctrl/Cmd + K**) with search, arrow-key navigation, Enter and Escape. Commands come from the same role-filtered menu list; Representative users do not receive admin commands.
- The mobile drawer manages focus, Escape, `aria-expanded`, background inertness and scroll locking. Desktop resizing resets the drawer cleanly.
- Dialogs have accessible headings; notifications can be dismissed. `prefers-reduced-motion` disables decorative transitions/animations, including spinners; disabled and busy states remain available independently of motion.

## Verification

An optional browser regression is saved at `test/browser-components.cjs`. It runs the real app against temporary SQLite/media, uses fixture credentials and simulated Meta, and never publishes to a real social account. It covers keyboard search, scoped commands, mobile drawer/focus state, pending button deduplication, a 12-content manual plan, photo upload, review-to-calendar approval, login form pending state, failed-login notification dismissal, and 390px/1440px layouts.

Provide Playwright and a Chromium executable in your test environment (they are not production dependencies), then run:

```bash
PLAYWRIGHT_MODULE=/path/to/playwright CHROMIUM_EXECUTABLE=/path/to/chromium node --no-warnings test/browser-components.cjs
```

If Playwright is resolvable normally, omit PLAYWRIGHT_MODULE. The browser test is optional and requires explicit browser tooling; the existing CI checks continue to test application and production-image behavior. Separate local generator browser checks also verify reference-image uploads, active-stage animation and reduced-motion behavior under the shared styles.
