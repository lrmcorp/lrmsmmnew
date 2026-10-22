# Beranda H1 verification

Reference: `mockups/lrmsmm-mockups.html#H1` and `06-other-menus.md` Home notes.

Implemented date/greeting and actions, compact shared scope, 1.4:1 task/timeline layout, combined account health, four lower KPI cards, urgency ordering and the specified all-clear state. Owner reconnect links and representative reconnect requests work; requests persist for the Owner dashboard. Cold-load counts await accounts. Empty filtered scopes do not show first-account onboarding.

Data coverage: target-level partial failures, actual publication timestamps, unique post counts, all unanswered comments without pagination truncation, strict five-minute DM threshold and 24-hour reply windows, private generator sessions, assignment checks, and genuine thirty-day follower snapshots. Unknown follower totals/history remain explicitly unavailable. The failed-count period uses post update time because no target failure timestamp is stored.

Verification:
- 40 end-to-end checks.
- 51 backend checks, including three dedicated dashboard tests.
- Browser workflow checks desktop and 375px layout, combined timeline/health card, four KPIs, cold-load onboarding behavior and existing route/permission flows.
- UX review against H1 completed without blocking findings.

Screenshots use an isolated database with simulated Meta; its simulation banner is intentionally visible. No real Instagram publishing or paid AI calls were made. Screenshots demonstrate structure, not a measured pixel similarity percentage. The first-party deployment workflow checks production readiness and public health separately.
