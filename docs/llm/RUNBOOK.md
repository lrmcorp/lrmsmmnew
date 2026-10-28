# Development, verification and deployment runbook

## Start safely

Inspect git status, current branch, recent commits and relevant diffs. Do not reset
other worktrees or assume old absolute workspace paths are the active checkout.
Use Node **22.5+**, npm lockfile dependencies and ffmpeg for video tests. Never point
tests at production DATA_DIR. Run local tools in a checkout without production .env.

    node --version
    npm ci
    DATA_DIR="$(mktemp -d)" META_MOCK=1 DISABLE_WORKER=1 npm start

This local server simulates Meta and disables scheduled worker ticks; it does not
prove publication. Use allowed local initial setup or provisioning tooling for a
local owner. Production registration/initial setup are closed; never enable them
as a login workaround. Configuration names include PUBLIC_URL, DATA_DIR, META_MOCK
and DISABLE_WORKER, not the retired application's variable names.

## Required gates

For docs-only edits, check links, referenced code and diff cleanliness. No paid
integrations or redeployment is needed to validate prose. For implementation changes,
run affected tests and satisfy required workflow gates.

    node scripts/check-ui-language.mjs
    node scripts/check-no-emoji.mjs
    npm test
    python3 -m unittest discover -s deploy/tests -v
    NODE_ENV=production node --no-warnings --test test/production-setup.js test/account-profile.js test/message-sync.js test/company-migration.js test/ai-images.js test/generator.js test/storytelling.js test/visual-production.js test/ui-helpers.js test/calendar-workspace.js test/audit-workspace.js test/brand-metadata.js test/dashboard.js test/story-memory-migration.js test/protected-composition.js test/account-specialist-session.js
    git diff --check

Use .github/workflows/deploy.yml as the current executable list. The backend list
above now matches it, including `test/account-specialist-session.js` and
`NODE_ENV=production`, both of which CI uses and an earlier copy of this page
omitted. As of #21, npm test reports 40 checks and the backend list reports 72.
Counts can change; meaningful passing behavior matters more than preserving
historical numbers.

`test/browser-storytelling.cjs` and `test/browser-components.cjs` are **not** in CI
and fail on the current checkout: they still expect the retired Indonesian
interface. They were already failing before the 2026-10-27 work. Do not treat them
as a regression, and do not "fix" them incidentally without being asked.

`test/visual-production.js` carried a `PLAYWRIGHT_MODULE`-gated browser block of
the same kind, aimed at the retired `.draft-tile` gallery with Indonesian labels
and a native `confirm`. CI never sets that variable for this file, so the block
never ran, and it failed when run by hand. It was removed on 2026-10-28 rather
than left asserting an interface that no longer exists and a dialog the product
rules forbid.

**Gap this leaves:** bulk draft deletion is covered in CI at the service level by
`test/generator.js` and `test/visual-production.js` (ownership, account scope,
run state, idempotency), but **no CI test drives the checkboxes and the Delete
bulk action in the browser**. Adding that to `test/redesign-browser.cjs` was
attempted and abandoned: the suite is coupled to its exact set of fixture
sessions, and adding one more plan, at setup or mid-run and on any date, breaks
the later storyline assertion on `.rd-session-page`. Decoupling that suite is the
prerequisite, and is worth doing before more browser coverage is added anywhere.

Browser workflow needs Playwright and an installed Chromium executable. Install
browser tools outside application dependencies, as CI does:

    npm install --prefix /tmp/lrmsmm-browser-tools --no-save --ignore-scripts playwright@1.56.1
    PLAYWRIGHT_MODULE=/tmp/lrmsmm-browser-tools/node_modules/playwright CHROMIUM_PATH=/usr/bin/chromium node --no-warnings test/redesign-browser.cjs

Set CHROMIUM_PATH to the installed browser. The fixture starts an isolated app,
uses temporary SQLite/media, mocks AI/Meta and writes /tmp/redesign-*.png. It covers
mobile/desktop, approval, calendar moves, partial success, permissions, CSS fallback,
route races, memory sessions and Ide cepat. Do not repeat unrelated optional browser
suites without a concrete risk.

| Area | Tests |
|---|---|
| Auth/setup/company scope | production-setup.js, company-migration.js, e2e.js |
| Calendar/Audit/Brand | calendar-workspace.js, audit-workspace.js, brand-metadata.js |
| Home | dashboard.js and browser workflow |
| Generator/providers | generator.js, ai-images.js, visual-production.js |
| Story memory/migration | storytelling.js, story-memory-migration.js |
| Original asset composition | protected-composition.js, visual-production.js |
| Meta profile/DM sync | account-profile.js, message-sync.js |

## Shared production topology

See [SHARED_VPS.md](../../deploy/SHARED_VPS.md). Do not rerun setup on an already
configured server as a routine deployment step.

- Runtime: /opt/lrmsmmnew; source-install convention: /opt/lrmsmmnew-source.
- Secrets: runtime .env and private access/; never print or commit their contents.
- Container convention: lrmsmmnew-app-1; shared network: proxy-net.
- Nginx Proxy Manager: lrmsosmed.playgo.id forwards HTTP to lrmsmmnew-app:3000.
  Retired lrmsosmed-app:5000 is the wrong upstream.
- Workflow: .github/workflows/deploy.yml, Test & Deploy. Main pushes can deploy
  automatically when ENABLE_VPS_DEPLOY=true. Docs-only main merges currently also
  trigger that workflow; there is no assumed path filtering.
- Image: ghcr.io/lrmcorp/lrmsmmnew, digest-pinned receiver requests.
- SSH account: deploy-lrmsmmnew, forced receiver, no unrestricted root shell or
  Docker-group access. Current configured SSH port: 1506.
- Repository secret names: VPS_HOST, VPS_PORT, VPS_USER, VPS_SSH_KEY,
  VPS_KNOWN_HOSTS. Never put their values in documents/chat.

The receiver pulls before stopping the old release, checks space, stops the one
application instance, backs up private env/data, starts/tests the new image, and
restores previous data/image if startup health fails. Backups are retained. Private
PNG sources and SQLite share this lifecycle. Never downgrade only an image after
a schema change or prune backup/data directories without understanding the state.

## Deployment verification

    gh pr checks PR_NUMBER --repo lrmcorp/lrmsmmnew
    gh run list --repo lrmcorp/lrmsmmnew --workflow deploy.yml --branch main --limit 3
    gh run view RUN_ID --repo lrmcorp/lrmsmmnew --json status,conclusion,jobs

Require success of the actual non-root production-image test, dedicated VPS receiver
and public application health steps. Skipped receiver deployment or a GHCR image is
not a deployed application. From an authorized network, /healthz must return ok:true
and mock:false. That proves reachability/configuration, not live Meta publication.
Verify the served module/behavior too when reviewing a frontend change.

## Troubleshooting without collateral changes

1. Read the exact failed step/error before changing anything. One bounded failed-job
   rerun can check a transient issue; do not loop blindly.
2. Read failed logs with the command below where allowed. Managed network policies
   can block signed GitHub log hosts even if the API works. Do not bypass the proxy;
   report the block and request a redacted excerpt or supported network configuration.

       gh run view RUN_ID --repo lrmcorp/lrmsmmnew --log-failed

3. Inspect only this application's containers using actual authorized VPS access:

       docker ps --filter name=lrmsmmnew --format '{{.Names}} {{.Status}}'

4. For 502, compare app health and NPM upstream/network resolution. For 525, inspect
   Cloudflare-to-origin TLS/certificates. Changing a Meta App ID alone does not explain
   an SSL handshake failure. Do not alter shared proxy/DNS/firewall from a screenshot.
5. For publishing, inspect target errors, scheduled/published timestamps and actual
   Meta result. Avoid blind retries that could duplicate an already published item.
6. For empty DM sync, distinguish errors from valid zero results; inspect permissions,
   IDs, integration and recent traffic. Do not repeat settings already confirmed enabled.
7. For AI failures, inspect provider/model, sanitized error, completed stages and key
   presence. Never dump keys. Retrying can incur cost; use existing consent flows.
8. For storage, private PNGs must be collected with derivatives. Brand assets/active
   drafts are pinned. Global Docker cleanup or live database reset is not a substitute
   for investigating usage.
