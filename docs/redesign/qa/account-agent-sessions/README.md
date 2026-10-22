# Account agents, English UI and Storyline recovery

Review date: 2026-10-23 (WIB).

## Verified with isolated fixtures

- Required backend suite: 62 checks passed.
- Application E2E: 40/40 passed.
- Dedicated receiver unit tests: 6 passed.
- English UI, WIB helper and no-native-dialog gate passed.
- Interface SVG/no-emoji gate and `git diff --check` passed.
- Browser workflow: see CI for the complete final run. Locally verified successful
  Campaign → exact draft-plan navigation; Storyline → durable pending session →
  real six-item draft plan; capacity guidance; no image calls before approval.
- Wrong-count Storyteller response: one repair completes all six episodes.
  Repeated wrong count: stops with precise error, no draft/memory advancement.
- Per-account context excludes unrelated account and other users' private history.

The included screenshots show the actual fixture app and English progress/review
pages, not a visual similarity score. The simulation banner is expected in tests.
No real AI charges, production account changes or social publication were tested.
