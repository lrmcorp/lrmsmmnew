# LRMsmm Agent API

Base: https://lrmsosmed.playgo.id/v1
OpenAPI: /openapi.json

Any external agent, script, n8n workflow or backend can use this REST API with an authorized LRMsmm user's credentials. It is not anonymous public publishing. Obtain a personal read/write API key from Owner → API & AI. Do not share an Owner key with other people; each LRMsmm user can manage their own keys via their authenticated session endpoints /v1/api-keys. Account/company assignments are checked on every request and again when a scheduled post runs.

Send `Authorization: Bearer YOUR_KEY` on every request. Use HTTPS and keep keys out of browser JavaScript, prompts, source control and logs. Revoking a key stops further requests; already scheduled posts are not automatically cancelled. OAuth integrations may submit drafts but cannot publish directly.

## 1. Discover destinations and limits

GET /me
GET /companies
GET /accounts — use the returned account `id` (not the Instagram username/ID).
GET /platform-rules — current server limits.

## 2. Upload ordered photos/videos

POST /media/upload?in_library=false
Content-Type: image/jpeg (or image/png, video/mp4, video/quicktime)
Body: raw file bytes, NOT JSON or multipart/form-data.
Optional X-File-Name: URL-encoded original filename.
Response: 201 {"id":"m_...","type":"image","status":"ready", ...}

JPEG/PNG maximum 8 MB; PNG is converted to JPEG. Video maximum 300 MB, direct upload maximum 100 MB. A proxy may impose a smaller limit; use chunks for videos. Upload order is the order of media_ids in the final request.

Chunk flow:
1. POST /media/uploads with {"mime_type":"video/mp4","size_bytes":12345678,"original_name":"reel.mp4","in_library":false}.
2. Use returned id, part_size and part_count. PUT /media/{id}/parts/1, /2, ... with raw bytes and Content-Type: application/octet-stream. Parts are numbered from 1; last part contains the remainder. GET /media/{id}/parts lists received parts for resuming. Re-sending a part replaces that part.
3. POST /media/{id}/complete. Use returned media id only after status=ready.

Chunks are private to the uploading user. Upload the actual bytes; ChatGPT sandbox: references are not downloadable URLs.

## 3a. Submit a private draft for human approval (recommended for agents)

POST /agent/drafts
Content-Type: application/json

{"request_id":"campaign-2026-001","content":"Caption here","media_ids":["m_photo","m_video"],"targets":[{"account_id":"acc_..."}],"scheduled_at":"2026-12-01T09:00:00+07:00"}

scheduled_at is an optional proposal, not an active schedule. Response 201 includes id, status=pending and compose_url. Open compose_url in LRMsmm to review and approve. No post is published before approval. GET /agent/drafts lists your pending drafts; GET /agent/drafts/{id} reports pending/approved/cancelled and post_id after approval. Drafts belong to the submitting user; another Owner/member cannot read them. Maximum 10 media (including videos) per draft.

Instead of uploaded media_ids, small JPEG/PNG can be sent in images:[{"base64":"..."}] or images:[{"url":"https://..."}]. URLs must be publicly downloadable HTTPS; no private IPs. Maximum 8 MB/image, 20 MB total inline image bytes; JSON/proxy limits may be lower. For videos use uploads. Images are appended after media_ids; use only ordered media_ids for a mixed carousel with a precise order.

## 3b. Schedule or publish directly (explicitly trusted API-key automation)

POST /posts
Idempotency-Key: campaign-2026-001
Content-Type: application/json

{"content":"Caption here","media_ids":["m_photo","m_video"],"targets":[{"account_id":"acc_...","options":{"format":"feed"}}],"scheduled_at":"2026-12-01T09:00:00+07:00"}

scheduled_at must include a timezone. Omit scheduled_at to publish now. Do not omit it by mistake. API keys need write permission. OAuth cannot bypass dashboard approval.

Instagram: 1 image = photo, 1 video = Reel, 2–10 ordered images/videos = carousel. Caption ≤2,200 characters. Photos must meet platform-rules (currently ratio 4:5 through 1.91:1). Story: exactly 1 media, options.format=story and empty caption. Additional options: share_to_feed, cover_media_id, thumb_offset_ms. Use multiple targets for multiple assigned accounts; each may have its own content/options. A mixed carousel is a single Instagram post, not multiple posts.

## 4. Confirm publishing and get the link

GET /posts/{id}
A successful POST means accepted, NOT confirmed live. Poll every 15 seconds until status published, partial, failed or cancelled. Each targets[] entry contains its own status, error_code, error_message and permalink. Use permalink to open the actual Instagram post. A pending permalink may arrive later; Stories generally lack permanent links. Do not retry a successful publish to obtain a link.

PATCH /posts/{id} changes a still-scheduled post. DELETE /posts/{id} cancels pending targets. POST /posts/{id}/retry retries failed targets after correcting the problem.

## Idempotency, errors and cleanup

Repeat identical /agent/drafts requests with the same request_id: 200 replay; changed payload: 409. For /posts use Idempotency-Key: identical replay is 200, new creation 201, conflict 409. Reuse the original media IDs on submission retries. Re-running an upload creates new IDs, so do not rebuild an already submitted request with new IDs under the same key. Persist upload IDs and submission result in your agent's durable job record. The example CLI is for a single initial submission; resume with those saved IDs after uncertain network failures.

Errors: {"error":{"code":"...","message":"...","details":{...}}}. 401 invalid/expired credentials, 403 wrong scope/account, 404 inaccessible resource, 409 conflict, 422 account issue, 429 rate limit. Limit 120 requests/minute/credential; honor RateLimit-Reset and use backoff. A validation error does not schedule a post. Never automatically retry permanent validation/permission errors.

After every target referencing a file is published/cancelled, published uploads are deleted from active storage (including library files). Future schedules, pending drafts and failed targets retain their media. History and post links remain. Backups retain their existing policy. Keep originals if needed elsewhere.
