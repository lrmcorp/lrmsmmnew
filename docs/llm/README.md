# LLM entry point

This is the coding-agent handoff for **lrmcorp/lrmsmmnew**, serving
`https://lrmsosmed.playgo.id`. Last substantive implementation documented:
**2026-11-01, PR #45**. Documentation language is English for agent readability;
product UI defaults to English.

## Read in this order

| Document | Purpose |
|---|---|
| [HANDOFF.md](HANDOFF.md) | Current state first: deployed commit, what is unproven, what waits on the owner, then incident history |
| [PRD.md](PRD.md) | What the product is for, who uses it, what counts as working and what is out of scope |
| [RULES.md](RULES.md) | Invariants that must survive changes |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Entry points, modules, data ownership and execution flows |
| [API_WORKFLOWS.md](API_WORKFLOWS.md) | Important endpoint families and approval boundaries |
| [RUNBOOK.md](RUNBOOK.md) | Isolated development/tests, deployment and troubleshooting |
| [NEXT_SESSION_PROMPT.md](NEXT_SESSION_PROMPT.md) | Copyable prompt for the next LLM session |

Also read the root [AGENTS.md](../../AGENTS.md). For a page redesign, consult only
that page's original mockups and numbered notes, plus the relevant QA evidence.

## Other sources

- [Latest mockups](../redesign/mockups/lrmsmm-mockups.html)
- [Supporting menu specifications](../redesign/06-other-menus.md)
- [Shared VPS deployment](../../deploy/SHARED_VPS.md)
- [ChatGPT/MCP handoff guide](../../deploy/CHATGPT_HANDOFF.md): connector/OAuth user
  guide, **not** the general engineering handoff.
- [CI definition](../../.github/workflows/deploy.yml): executable test/deploy source.

Historical redesign files contain superseded requirements, including English-only
UI and old phase order. The latest user direction selected English UI while preserving WIB and independently selectable caption language. Do not revive superseded rules just because an older file calls itself
"master". Current user direction wins; reconcile discrepancies explicitly.

- [Account-specialized agents and draft sessions](ACCOUNT_AGENT_SESSIONS.md)

- [Automatic brand cutouts and product mockups](BRAND_CUTOUTS_AND_MOCKUPS.md)

- [Hallmark Generator and reference-led image craft](HALLMARK_GENERATOR.md)
