# Account-specialized agents and draft-session handoff

## Behavior

The application UI is English. Caption language remains an independent Brand Kit
and session choice; stored captions, user prompts and custom agent instructions
are not translated. Dates retain Asia/Jakarta / WIB.

`account-specialist.js` builds trusted, authorized account context for campaign
planning and production agents. Each run snapshots the selected account's Brand
Kit, assets, selected story memory, permitted prior proposals and published posts.
Other users' private proposals and unrelated account histories are excluded.
Model defaults are personal; specialization is enforced through account context,
not separate model credentials per account. Existing custom instructions remain.

Successful Campaign generation opens its plan in Drafts. Storyline opens a durable
`#/generator/drafts/story_ID` progress page immediately after queueing, then moves
to the created plan when Storyteller, Manager and Scheduler finish. Failed stages
remain visible and can be retried without repeating completed stages. Stopping a
pending session retains existing drafts/posts.

## Validation and recovery

Date/time capacity is checked before queueing. Six items over two days with two
candidate times have only four gross slots; occupied drafts/posts can reduce that
further. UI guidance and server `schedule_capacity` details explain the fix. The
server remains authoritative; it never silently changes dates or posting times.

Storyteller and Manager requests constrain the episodes array to the requested
count, use a larger output budget and validate required fields, lengths, media
and product choices. A malformed structure receives one additional repair call,
within the session's disclosed cost context. The repair must return a complete
valid replacement; it never truncates, invents or accepts missing episodes.
Provider outages/auth/quota failures and invalid product/video selections are not
automatically retried. Repeated invalid structure stops safely with a precise
English error. No plan, episode memory or publishing is committed on failure.

## Verification

- `test/account-specialist-session.js`: account/history isolation, six/four slot
  capacity and actual Conceptor/Revision account context.
- `test/storytelling.js`: continuity, schema validation, bounded repair, unsafe
  products/video, completed-stage retention and scheduler failures.
- `test/redesign-browser.cjs`: English workflow, Campaign session routing,
  Storyline pending progress and transition to real concepts, capacity errors,
  mobile, autosave, approvals, calendar and permissions.

These tests use isolated storage and mocked providers. They do not prove a real
paid model response or a live Instagram publication. Consult CI and the receiver
result for deployment evidence; a built image alone is not a deployed release.
