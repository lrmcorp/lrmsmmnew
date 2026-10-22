# API workflow reference

Routes below are relative to `/v1`. This is a navigation aid, **not** a replacement
for validation in `src/routes/api.js` and the relevant service. Do not copy a browser
cookie into docs or assume Owner API-key/OAuth credentials can call session-only
Generator endpoints. Error responses use the existing `{error: ...}` structure.

## Generator and ideas

| Method/route | Purpose |
|---|---|
| `GET /generator/settings` | User's saved provider/model configuration and key presence metadata |
| `PUT /generator/settings` | Persist agent configuration |
| `PUT/DELETE /generator/keys/:provider` | Save/revoke own provider key; never return its plaintext |
| `POST /generator/keys/:provider/test` | Test selected provider/model |
| `POST /generator/quick-idea` | Paid Conceptor creates detailed editable direction; no images/posts |
| `POST /generator/timing` | Actual timing recommendations/basis |
| `GET/POST /generator/plans` | List/create own plans |
| `POST /generator/plans/:id/start` | Start proposed content with cost confirmation |
| `GET/POST /generator/runs` | Own runs/create a run |
| `GET/PATCH /generator/runs/:id` | Read/edit own content |
| `POST /generator/runs/:id/approve-concept` | Approve concepts for media production |
| `POST /generator/runs/:id/slides/revise` | Revise a selected generated slide |
| `POST /generator/runs/:id/approve` | Final approval creates/returns the post |
| `POST /generator/runs/:id/retry` | Retry supported failed stage |
| `DELETE /generator/runs/:id/content` | Delete disposable draft content |
| `POST /generator/drafts/delete` | Validated bulk deletion of own eligible drafts |

Quick idea request shape:

```json
{
  "kind": "Edukasi produk",
  "account_ids": ["ACCOUNT_ID"],
  "direction": "Optional existing direction",
  "memory_sessions": {"ACCOUNT_ID": "MEMORY_SESSION_ID"},
  "confirm_cost": true
}
```

Optional `agents` follows the saved agent configuration shape. Kinds are `Promo`,
`Edukasi produk`, `Testimoni`, `Di balik layar`. Response includes `prompt`,
`provider` and `model`; it must not be mistaken for generated media or a post ID.

## Brand Kit and named memory

| Method/route | Purpose |
|---|---|
| `GET /generator/accounts/:id/brand?memory_session_id=...` | Shared account profile plus selected session/episodes and available session metadata |
| `PUT /generator/accounts/:id/brand` | Foundation/rules/structured identity |
| `POST /generator/accounts/:id/assets` | Attach owned uploaded media to shared account catalog |
| `PATCH/DELETE /generator/accounts/:id/assets/:asset` | Edit/remove catalog entry |
| `POST /generator/accounts/:id/memory-sessions` | Create with `{title}`; starts empty at episode 1 |
| `PATCH /generator/accounts/:id/memory-sessions/:sid` | Rename with `{title}` |
| `DELETE /generator/accounts/:id/memory-sessions/:sid` | Delete selected continuity/memories; preserve produced content |
| `DELETE /generator/accounts/:id/memory-sessions/:sid/memories/:eid` | Delete one memory and rebuild retained summary |
| `POST /generator/story-jobs` | Queue Storyline; pass `memory_session_id` explicitly |
| `GET /generator/accounts/:id/story-jobs` | Current service returns latest own account job, not every memory session |
| `GET /generator/story-jobs/:id` | Own progress/stage data |
| `POST /generator/story-jobs/:id/retry` | Explicit paid retry |
| `DELETE /generator/story-jobs/:id` | Cancel active job; **not** delete a memory session |

Story job bodies include `account_id`, unique `request_id`, `memory_session_id`,
`content_count`, `slide_count`, `start_date`, `end_date`, `times`, optional `direction`
and `agents`, plus `confirm_cost:true`. `produce_media` is a distinct option. Reuse
request IDs only for identical logical retries. The UI separately remembers the
chosen memory session per user/account and carries it in account-to-Generator URLs.

## Home and calendar

- `GET /dashboard/summary`: `company_id` and comma-separated `account_ids`; returns
  scoped accounts, tasks/data and KPI inputs. Empty account selection follows the
  current UI convention of all accounts; company filtering still applies.
- `POST /dashboard/reconnect-request`: `{account_id}` records a request for Owner;
  it does not send email/Slack or reconnect Meta by itself.
- `GET /calendar`: requires ISO `from` and `to`.
- `POST /calendar/move`: use the exact current body from Calendar/service, including
  optimistic `expected_updated_at`. Do not invent a client-only drag/drop result.
- `POST /posts/:id/duplicate`: validated `request_id`; creates a private draft and
  copies required available media. It does not publish or schedule.

## External AI handoff

`/mcp` and `/oauth/*` are outside `/v1`. OAuth `submit_post_draft` returns a private
composer draft and `compose_url`. Only the owning dashboard user can approve that
handoff. OAuth publication restrictions differ from legacy Owner API-key automation.
See [the specialized guide](../../deploy/CHATGPT_HANDOFF.md) and current auth code.
