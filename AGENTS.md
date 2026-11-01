# LRMsmm: instructions for coding agents

## Read first

1. [LLM documentation index](docs/llm/README.md)
2. [Handoff and last verified state](docs/llm/HANDOFF.md)
3. [Product requirements](docs/llm/PRD.md)
4. [Product invariants](docs/llm/RULES.md)
5. [Architecture](docs/llm/ARCHITECTURE.md), then the relevant workflow/runbook.

These documents describe the checked-in implementation, not proof that a remote
server is currently healthy. Verify current Git state, runtime and user intent.
Current user instructions take precedence over historical redesign briefs.

## Implementation constraints

- Keep vanilla JavaScript, ES modules, existing `h()`, `api()`, `modal()` and shared
  UI helpers. Do not introduce a framework or replace the stack incidentally.
- UI defaults to English, dates/times to WIB. Use SVG icons, not emoji
  for interface decorations. Generated captions may contain emoji.
- Preserve existing REST/MCP contracts, idempotency, account scope and approval
  boundaries. Add migrations compatible with existing SQLite data.
- Company → Accounts → Filters → View is the shared list scope. Use compact
  avatar/`@handle` selectors and preserve scope across pages.
- Use application dialogs, never `window.confirm`, `prompt` or `alert`.
- Autosave must flush before leaving; dispose timers/listeners and guard stale
  async rendering. Cover keyboard operation and 375px mobile layouts.
- Keep uploaded originals unchanged. Automatic derivatives may remove background
  and empty margins. Logos use source cutouts; products support AI scene mockups
  (mandatory detail review) or explicit exact-cutout composition. Keep cleanup intact.
- Named story memory is account-scoped; generator jobs/drafts and provider keys
  remain user-private. Session deletion must not delete produced posts/drafts.
- Do not invoke real paid AI or publish to real social accounts as a test unless
  the user authorizes that action. Use isolated fixtures and provider stubs.

## Verification and deployment

Use [RUNBOOK.md](docs/llm/RUNBOOK.md). `npm test` alone is not the entire CI suite.
Test the affected workflow meaningfully, then satisfy required gates. Do not
invent a measured mockup similarity percentage or equate mock tests with live Meta
publication. Keep UX changes aligned with the relevant mockup's numbered notes.

Production is a shared VPS with a dedicated receiver. Never rerun the retired
standalone installer, reset live SQLite, rotate encryption keys casually, prune
Docker globally, or alter other apps/proxy/DNS/firewall as an incidental fix.
Never print `.env`, private keys, tokens, passwords or private backup contents.

## Documentation maintenance

Update the relevant `docs/llm/` pages after material behavior/schema/deployment
changes. Record what was actually tested and what remains unknown. Do not promote
historical screenshots, chat claims or a successful CI build into live evidence.
