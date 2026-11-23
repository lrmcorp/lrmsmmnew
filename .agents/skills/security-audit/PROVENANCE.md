# Provenance

This directory is a **vendored third-party skill**, not code written for LRMsmm.

| | |
|---|---|
| Upstream | https://github.com/cloudflare/security-audit-skill |
| Commit | `c1c8a8c` ("Clarify guidance and full audit modes") |
| Vendored | 2026-11-07 |
| Licence | MIT, Cloudflare Inc. — see [LICENSE](LICENSE) |

## What it is

A defensive, source-first vulnerability-review methodology: an attack-class
taxonomy, per-domain companion files, an evidence contract, and two validators
(`validate-findings.cjs`, `validate-coverage-ledger.cjs`) with their own tests.

## How it is used here

It is guidance for a reviewing agent, not application code. Nothing in `src/`
or `public/` imports it, and it is not in the production image: the Dockerfile
copies only the application's own directories.

Its own tests pass on the vendored copy:

    node --test .agents/skills/security-audit/validate-findings.test.cjs \
                .agents/skills/security-audit/validate-coverage-ledger.test.cjs

They are not part of the CI gates, because the skill is not shipped code.

## Updating

Re-copy from upstream and record the new commit above. Do not edit the files in
place: local edits would be lost on the next update and would silently diverge
from the published methodology. If LRMsmm needs its own rules, add a separate
skill that references this one.

## Reading it

Start at [SKILL.md](SKILL.md). It has two modes, and the distinction matters:
guidance mode for focused questions, full audit mode only for an explicit audit
request. The skill does not authorize modifying the code it reviews — that
remains the owner's decision.
