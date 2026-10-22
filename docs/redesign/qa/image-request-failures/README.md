# GPT Image request failure recovery — 2026-10-23

## Confirmed diagnosis

Read-only production diagnostics showed HTTP 400 on all three image stages;
Storyteller, Manager, Scheduler, Conceptor, reviewer and Visual Conceptor completed.
Prompt component subtotals were 47,890 / 47,938 / 48,182 characters before extra
policy text. GPT Image permits 32,000 characters. Duplicate account history and
story archives caused the application to exceed the request limit.

## Changes and verification

- Image requests use approved visual prompts, current brief/episode, account
  identity/rules and original reference images without duplicate story/history.
- Mandatory original-logo/product preservation remains complete at the end of
  every prompt; source-image composition and completed stages remain unchanged.
- Both builder and provider adapter prevent oversized paid requests.
- Every failed draft has visible Failure details; new failures record safe stage,
  provider/model and error code. Null structured results are validation errors.
- Static frontend files require revalidation; an open page must be refreshed.
- 64 backend checks, 40 application checks, full browser workflow, English and SVG
  gates passed. Browser checks verify the actual visible failure reason/model/code,
  and static cache headers, alongside existing calendar/approval/mobile checks.
- No paid provider call or live Instagram publishing was used for verification.
  Production retry remains an explicit user action because it can use API credits.

Official request-limit reference:
https://github.com/openai/openai-node/blob/master/src/resources/images.ts
