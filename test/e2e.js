// End-to-end test against the in-process mock Meta API.  Run: npm test
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const PORT = 4100 + Math.floor(Math.random() * 500);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'siar-test-'));
Object.assign(process.env, { META_MOCK: '1', PORT: String(PORT), PUBLIC_URL: `http://localhost:${PORT}`, DATA_DIR: tmp, DISABLE_WORKER: '1' });

const { app } = await import('../src/server.js');
const { runPublisherTick } = await import('../src/services/publisher.js');
const { run } = await import('../src/db.js');
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
const sharp = (await import('sharp')).default;

const server = app.listen(PORT);
const B = `http://localhost:${PORT}`;
let cookie = '';
const results = [];
async function step(name, fn) {
  try { await fn(); results.push(['✓', name]); console.log('✓', name); }
  catch (e) { results.push(['✗', name]); console.error('✗', name, '\n ', e.message); process.exitCode = 1; }
}
async function http(method, p, { body, headers = {}, raw, auth } = {}) {
  const h = { ...headers };
  if (auth) h.authorization = `Bearer ${auth}`; else if (cookie) h.cookie = cookie;
  let b = body;
  if (body && !raw && !(body instanceof Buffer)) { h['content-type'] = 'application/json'; b = JSON.stringify(body); }
  const res = await fetch(B + p, { method, headers: h, body: b, redirect: 'manual' });
  const sc = res.headers.get('set-cookie'); if (sc && !auth) cookie = sc.split(';')[0];
  const text = await res.text(); let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, headers: res.headers };
}
async function followConnect(platform, username) {
  let r = await fetch(`${B}/connect/${platform}`, { headers: { cookie }, redirect: 'manual' });
  let loc = r.headers.get('location');
  assert.ok(loc.includes('/__mock/'), 'redirects to platform consent');
  r = await fetch(`${loc}&auto=${username}`, { redirect: 'manual' });
  loc = r.headers.get('location');
  r = await fetch(loc, { headers: { cookie }, redirect: 'manual' });
  return r.headers.get('location');
}
const tick = async () => { await runPublisherTick(); };

let ig, th, writeKey, readKey, imgId, img2Id, post1;

await step('first user becomes admin; signup then closes', async () => {
  const r = await http('POST', '/auth/register', { body: { email: 'reyner@hrgroup.id', password: 'rahasia123', name: 'Reyner' } });
  assert.equal(r.status, 201); assert.equal(r.json.user.role, 'admin');
  const saved = cookie; cookie = '';
  const r2 = await http('POST', '/auth/register', { body: { email: 'x@y.id', password: 'rahasia123' } });
  assert.equal(r2.status, 403); cookie = saved;
});

await step('connect Instagram and Threads via OAuth', async () => {
  assert.match(await followConnect('instagram', 'kopisenja'), /connected=/);
  assert.match(await followConnect('threads', 'kopisenja.th'), /connected=/);
  const r = await http('GET', '/v1/accounts');
  assert.equal(r.json.data.length, 2);
  ig = r.json.data.find((a) => a.platform === 'instagram'); th = r.json.data.find((a) => a.platform === 'threads');
  assert.equal(ig.username, 'kopisenja'); assert.ok(ig.token_expires_at);
});

await step('reconnecting same account does not duplicate', async () => {
  await followConnect('instagram', 'kopisenja');
  assert.equal((await http('GET', '/v1/accounts')).json.data.length, 2);
});

await step('API keys: create write + read, hashed', async () => {
  const w = await http('POST', '/v1/api-keys', { body: { name: 'n8n', scope: 'write' } });
  const r = await http('POST', '/v1/api-keys', { body: { name: 'viewer', scope: 'read' } });
  writeKey = w.json.key; readKey = r.json.key;
  assert.match(writeKey, /^sr_live_/);
  const me = await http('GET', '/v1/me', { auth: readKey });
  assert.equal(me.json.access.scope, 'read');
});

await step('upload JPEG (raw body) and PNG (converted to JPEG)', async () => {
  const jpg = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: '#c97b3c' } }).jpeg().toBuffer();
  const r = await http('POST', '/v1/media/upload', { auth: writeKey, body: jpg, raw: true, headers: { 'content-type': 'image/jpeg' } });
  assert.equal(r.status, 201, JSON.stringify(r.json)); assert.equal(r.json.width, 1080); imgId = r.json.id;
  const png = await sharp({ create: { width: 1080, height: 1080, channels: 4, background: '#2a6' } }).png().toBuffer();
  const r2 = await http('POST', '/v1/media/upload', { auth: writeKey, body: png, raw: true, headers: { 'content-type': 'image/png' } });
  assert.equal(r2.json.mime_type, 'image/jpeg'); img2Id = r2.json.id;
  const pub = await fetch(r.json.url); assert.equal(pub.status, 200); assert.equal(pub.headers.get('content-type'), 'image/jpeg');
});

await step('reject bad media: text file and bad aspect ratio', async () => {
  const r = await http('POST', '/v1/media/upload', { auth: writeKey, body: Buffer.from('hello world, not an image'), raw: true });
  assert.equal(r.json.error.code, 'media_invalid_format');
  const wide = await sharp({ create: { width: 3000, height: 1000, channels: 3, background: '#000' } }).jpeg().toBuffer();
  const m = (await http('POST', '/v1/media/upload', { auth: writeKey, body: wide, raw: true })).json;
  const p = await http('POST', '/v1/posts', { auth: writeKey, body: { content: 'x', media_ids: [m.id], targets: [{ account_id: ig.id }] } });
  assert.equal(p.json.error.code, 'aspect_ratio_invalid');
});

await step('read-only key cannot write', async () => {
  const r = await http('POST', '/v1/posts', { auth: readKey, body: { content: 'x', targets: [{ account_id: th.id }] } });
  assert.equal(r.status, 403); assert.equal(r.json.error.code, 'insufficient_scope');
});

await step('validation: IG requires media, Threads 500 chars, poll text-only', async () => {
  let r = await http('POST', '/v1/posts', { auth: writeKey, body: { content: 'halo', targets: [{ account_id: ig.id }] } });
  assert.equal(r.json.error.code, 'media_required');
  r = await http('POST', '/v1/posts', { auth: writeKey, body: { content: 'a'.repeat(501), targets: [{ account_id: th.id }] } });
  assert.equal(r.json.error.code, 'caption_too_long'); assert.equal(r.json.error.details.platform, 'threads');
  r = await http('POST', '/v1/posts', { auth: writeKey, body: { content: 'x', media_ids: [imgId], targets: [{ account_id: th.id, options: { poll: { options: ['a', 'b'] } } }] } });
  assert.equal(r.json.error.code, 'option_requires_text_only');
  r = await http('POST', '/v1/posts', { auth: writeKey, body: { content: 'x', targets: [{ account_id: th.id, options: { foo: 1 } }] } });
  assert.equal(r.json.error.code, 'invalid_options');
});

await step('publish now to IG + Threads, with idempotency', async () => {
  const key = crypto.randomUUID();
  const body = { content: 'Menu baru minggu ini: es kopi gula aren ☕', media_ids: [imgId], targets: [{ account_id: ig.id }, { account_id: th.id }] };
  const r = await http('POST', '/v1/posts', { auth: writeKey, body, headers: { 'Idempotency-Key': key } });
  assert.equal(r.status, 201, JSON.stringify(r.json)); post1 = r.json.id;
  const again = await http('POST', '/v1/posts', { auth: writeKey, body, headers: { 'Idempotency-Key': key } });
  assert.equal(again.status, 200); assert.equal(again.json.id, post1);
  const conflict = await http('POST', '/v1/posts', { auth: writeKey, body: { ...body, content: 'beda' }, headers: { 'Idempotency-Key': key } });
  assert.equal(conflict.json.error.code, 'idempotency_conflict');
  await tick();
  const g = await http('GET', `/v1/posts/${post1}`, { auth: readKey });
  assert.equal(g.json.status, 'published', JSON.stringify(g.json.targets));
  for (const t of g.json.targets) assert.match(t.permalink, /^https:\/\//);
});

await step('carousel IG + per-account override + Threads poll', async () => {
  const r = await http('POST', '/v1/posts', { auth: writeKey, body: {
    content: 'Kopi apa favoritmu?',
    targets: [
      { account_id: th.id, options: { poll: { options: ['Tubruk', 'Susu'] }, topic_tag: 'Kopi', reply_control: 'everyone' } },
      { account_id: ig.id, content: 'Dua menu baru ☕', media_ids: [imgId, img2Id] },
    ] } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  await tick();
  assert.equal((await http('GET', `/v1/posts/${r.json.id}`, { auth: readKey })).json.status, 'published');
});

await step('Threads utas (thread with 2 continuation parts)', async () => {
  const r = await http('POST', '/v1/posts', { auth: writeKey, body: {
    content: 'Utas: 3 cara seduh kopi tubruk 🧵', targets: [{ account_id: th.id, options: { thread: ['1. Pakai air 92°C', { text: '2. Diamkan 4 menit', media_ids: [imgId] }] } }] } });
  await tick();
  const g = (await http('GET', `/v1/posts/${r.json.id}`)).json;
  assert.equal(g.status, 'published'); assert.equal(g.targets[0].error_code, null);
});

let sched;
await step('schedule, edit, publish-now, cancel', async () => {
  const at = new Date(Date.now() + 3600_000).toISOString().replace('Z', '+00:00');
  let r = await http('POST', '/v1/posts', { auth: writeKey, body: { content: 'Besok promo!', targets: [{ account_id: th.id }], scheduled_at: at } });
  assert.equal(r.json.status, 'scheduled'); sched = r.json.id;
  await tick();
  assert.equal((await http('GET', `/v1/posts/${sched}`)).json.status, 'scheduled', 'not published early');
  r = await http('PATCH', `/v1/posts/${sched}`, { auth: writeKey, body: { content: 'Besok promo 20%!' } });
  assert.equal(r.json.content, 'Besok promo 20%!');
  r = await http('POST', '/v1/posts', { auth: writeKey, body: { content: 'akan dibatalkan', targets: [{ account_id: th.id }], scheduled_at: at } });
  r = await http('DELETE', `/v1/posts/${r.json.id}`, { auth: writeKey });
  assert.equal(r.json.status, 'cancelled');
  r = await http('POST', `/v1/posts/${sched}/publish`, { auth: writeKey });
  await tick();
  r = await http('GET', `/v1/posts/${sched}`);
  assert.equal(r.json.status, 'published');
  r = await http('PATCH', `/v1/posts/${sched}`, { auth: writeKey, body: { content: 'x' } });
  assert.equal(r.json.error.code, 'post_not_editable');
});

await step('transient Meta error is retried automatically', async () => {
  const r = await http('POST', '/v1/posts', { auth: writeKey, body: { content: 'Server lagi lelah #fail-transient', targets: [{ account_id: th.id }] } });
  await tick();
  let g = (await http('GET', `/v1/posts/${r.json.id}`)).json;
  assert.equal(g.targets[0].status, 'pending'); assert.equal(g.targets[0].error_code, 'platform_error');
  run("UPDATE post_targets SET run_at=? WHERE post_id=?", new Date().toISOString(), r.json.id); // fast-forward backoff
  await tick();
  g = (await http('GET', `/v1/posts/${r.json.id}`)).json;
  assert.equal(g.status, 'published');
});

await step('permission error fails cleanly; retry endpoint works after fix', async () => {
  const r = await http('POST', '/v1/posts', { auth: writeKey, body: { content: 'izin #fail-permission', targets: [{ account_id: th.id }] } });
  await tick();
  const g = (await http('GET', `/v1/posts/${r.json.id}`)).json;
  assert.equal(g.status, 'failed'); assert.equal(g.targets[0].error_code, 'permission_missing');
  const rr = await http('POST', `/v1/posts/${r.json.id}/retry`, { auth: writeKey });
  assert.equal(rr.json.targets[0].status, 'pending');
});

await step('expired token marks account expired; reconnect restores it', async () => {
  const r = await http('POST', '/v1/posts', { auth: writeKey, body: { content: 'token mati #fail-expired', media_ids: [imgId], targets: [{ account_id: ig.id }] } });
  await tick();
  const g = (await http('GET', `/v1/posts/${r.json.id}`)).json;
  assert.equal(g.targets[0].error_code, 'account_expired');
  assert.equal((await http('GET', `/v1/accounts/${ig.id}`)).json.status, 'expired');
  const blocked = await http('POST', '/v1/posts', { auth: writeKey, body: { content: 'x', media_ids: [imgId], targets: [{ account_id: ig.id }] } });
  assert.equal(blocked.json.error.code, 'account_expired');
  await followConnect('instagram', 'kopisenja');
  assert.equal((await http('GET', `/v1/accounts/${ig.id}`)).json.status, 'active');
});

await step('chunked video upload (Reels)', async () => {
  const vf = path.join(tmp, 'v.mp4');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=720x1280:rate=24', '-t', '4', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', vf]);
  const buf = fs.readFileSync(vf);
  let r = await http('POST', '/v1/media/uploads', { auth: writeKey, body: { mime_type: 'video/mp4', size_bytes: buf.length } });
  const { id: vid, part_size, part_count } = r.json;
  for (let i = 0; i < part_count; i++) {
    const pr = await http('PUT', `/v1/media/${vid}/parts/${i + 1}`, { auth: writeKey, body: buf.subarray(i * part_size, (i + 1) * part_size), raw: true, headers: { 'content-type': 'application/octet-stream' } });
    assert.equal(pr.status, 204);
  }
  r = await http('POST', `/v1/media/${vid}/complete`, { auth: writeKey });
  assert.equal(r.json.type, 'video'); assert.ok(r.json.duration_ms >= 3900, `duration ${r.json.duration_ms}`);
  r = await http('POST', '/v1/posts', { auth: writeKey, body: { content: 'Reels sangrai', media_ids: [vid], targets: [{ account_id: ig.id, options: { share_to_feed: true } }] } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  await tick();
  assert.equal((await http('GET', `/v1/posts/${r.json.id}`)).json.status, 'published');
  const del = await http('DELETE', `/v1/media/${vid}`, { auth: writeKey });
  assert.equal(del.status, 204);
});

let commentId;
await step('comments: sync, reply, hide, status', async () => {
  const s = await http('POST', '/v1/comments/sync', { auth: writeKey });
  assert.ok(s.json.synced >= 3, `synced ${s.json.synced}`);
  let r = await http('GET', `/v1/comments?post_id=${post1}`, { auth: readKey });
  assert.ok(r.json.data.length >= 3); commentId = r.json.data.find((c) => c.platform === 'instagram').id;
  r = await http('POST', `/v1/comments/${commentId}/reply`, { auth: writeKey, body: { message: 'Halo Kak! Buka jam 7 pagi ☕' } });
  assert.equal(r.json.comment.reply_status, 'replied');
  const thc = (await http('GET', `/v1/comments?post_id=${post1}`)).json.data.find((c) => c.platform === 'threads');
  r = await http('POST', `/v1/comments/${thc.id}/reply`, { auth: writeKey, body: { message: 'Boleh banget!' } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  r = await http('POST', `/v1/comments/${thc.id}/hide`, { auth: writeKey, body: { hidden: true } });
  assert.equal(r.json.hidden, true);
  await http('POST', '/v1/comments/sync', { auth: writeKey });
  const still = (await http('GET', `/v1/comments?post_id=${post1}&reply_status=all`)).json.data.find((c) => c.id === commentId);
  assert.equal(still.reply_status, 'replied', 'resync keeps replied status');
  r = await http('PATCH', `/v1/comments/${still.id}`, { auth: writeKey, body: { reply_status: 'ignored' } });
  assert.equal(r.json.reply_status, 'ignored');
});

await step('insights sync + read', async () => {
  const r = await http('POST', '/v1/insights/sync', { auth: writeKey });
  assert.equal(r.json.ok, true);
  const a = await http('GET', `/v1/accounts/${ig.id}/insights`, { auth: readKey });
  assert.equal(a.json.days.length, 1); assert.equal(a.json.followers_count, 1234);
  const p = await http('GET', `/v1/posts/${post1}/insights`, { auth: readKey });
  assert.ok(p.json.targets[0].metrics);
  const again = await http('POST', '/v1/insights/sync', { auth: writeKey });
  assert.equal(again.json.error.code, 'rate_limited');
});

let oauthAccess, oauthRefresh, oauthReadAccess;
async function oauthFlow(scope) {
  const reg = await http('POST', '/oauth/register', { body: { client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] } });
  const clientId = reg.json.client_id;
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const q = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: 'https://claude.ai/api/mcp/auth_callback', code_challenge: challenge, code_challenge_method: 'S256', state: 'xyz', scope: 'read write' });
  const page = await http('GET', `/oauth/authorize?${q}`);
  assert.equal(page.status, 200); assert.match(page.json, /ingin mengakses Siar/);
  const csrf = page.json.match(/name="csrf" value="([^"]+)"/)[1];
  const form = new URLSearchParams({ client_id: clientId, redirect_uri: 'https://claude.ai/api/mcp/auth_callback', state: 'xyz', code_challenge: challenge, code_challenge_method: 'S256', csrf, scope, decision: 'allow' });
  const res = await fetch(`${B}/oauth/authorize`, { method: 'POST', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: form, redirect: 'manual' });
  const loc = new URL(res.headers.get('location'));
  assert.equal(loc.searchParams.get('state'), 'xyz');
  const tok = await fetch(`${B}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: loc.searchParams.get('code'), code_verifier: verifier, client_id: clientId, redirect_uri: 'https://claude.ai/api/mcp/auth_callback' }) });
  return tok.json();
}

await step('OAuth 2.1 + PKCE + DCR flow (as Claude connector)', async () => {
  const t = await oauthFlow('read write');
  assert.ok(t.access_token, JSON.stringify(t)); assert.equal(t.scope, 'read write');
  oauthAccess = t.access_token; oauthRefresh = t.refresh_token;
  const ref = await fetch(`${B}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: oauthRefresh }) }).then((r) => r.json());
  assert.ok(ref.access_token); oauthAccess = ref.access_token;
  const reuse = await fetch(`${B}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: oauthRefresh }) });
  assert.equal(reuse.status, 400, 'refresh tokens rotate');
  oauthReadAccess = (await oauthFlow('read')).access_token;
});

await step('MCP 401 advertises resource metadata', async () => {
  const r = await fetch(`${B}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 401); assert.match(r.headers.get('www-authenticate'), /resource_metadata=/);
});

async function mcp(token) {
  const c = new Client({ name: 'test', version: '1' });
  await c.connect(new StreamableHTTPClientTransport(new URL(`${B}/mcp`), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
  return c;
}

await step('MCP (OAuth, write): tools, list_accounts, create_post, dedupe, comments', async () => {
  const c = await mcp(oauthAccess);
  const { tools } = await c.listTools();
  const names = tools.map((t) => t.name);
  for (const n of ['list_accounts', 'create_post', 'reply_to_comment', 'list_comments', 'upload_media_from_url']) assert.ok(names.includes(n), `missing ${n}`);
  const acc = JSON.parse((await c.callTool({ name: 'list_accounts', arguments: {} })).content[0].text);
  assert.equal(acc.length, 2);
  const args = { content: 'Diposting dari Claude lewat MCP 🤖', targets: [{ account_id: th.id }] };
  const r1 = JSON.parse((await c.callTool({ name: 'create_post', arguments: args })).content[0].text);
  assert.equal(r1.post.status, 'published', JSON.stringify(r1));
  const r2 = JSON.parse((await c.callTool({ name: 'create_post', arguments: args })).content[0].text);
  assert.equal(r2.replayed, true); assert.equal(r2.post.id, r1.post.id);
  const bad = await c.callTool({ name: 'create_post', arguments: { content: 'tanpa foto', targets: [{ account_id: ig.id }] } });
  assert.equal(bad.isError, true); assert.match(bad.content[0].text, /media_required/);
  const cm = JSON.parse((await c.callTool({ name: 'list_comments', arguments: { reply_status: 'all' } })).content[0].text);
  assert.match(cm._notice, /UNTRUSTED/);
  const up = await c.callTool({ name: 'upload_media_from_url', arguments: { url: `${B}/m/does-not-exist.jpg` } });
  assert.equal(up.isError, true);
  await c.close();
});

await step('MCP (OAuth, read-only): write tools hidden', async () => {
  const c = await mcp(oauthReadAccess);
  const names = (await c.listTools()).tools.map((t) => t.name);
  assert.ok(names.includes('list_posts')); assert.ok(!names.includes('create_post'));
  await c.close();
});

await step('MCP with API key (Claude Code / Cursor style)', async () => {
  const c = await mcp(writeKey);
  const r = JSON.parse((await c.callTool({ name: 'list_posts', arguments: { limit: 3 } })).content[0].text);
  assert.equal(r.data.length, 3);
  await c.close();
});

await step('password change revokes API keys and AI access', async () => {
  const r = await http('POST', '/auth/password', { body: { current: 'rahasia123', next: 'rahasiabaru123' } });
  assert.equal(r.json.ok, true);
  assert.equal((await http('GET', '/v1/me', { auth: writeKey })).status, 401);
  assert.equal((await http('GET', '/v1/me', { auth: oauthAccess })).status, 401);
});

await step('disconnect account cancels its pending posts', async () => {
  const at = new Date(Date.now() + 7200_000).toISOString();
  const p = await http('POST', '/v1/posts', { body: { content: 'nanti', targets: [{ account_id: th.id }], scheduled_at: at } });
  await http('DELETE', `/v1/accounts/${th.id}`);
  assert.equal((await http('GET', `/v1/posts/${p.json.id}`)).json.status, 'cancelled');
  assert.equal((await http('GET', '/v1/accounts')).json.data.length, 1);
});

await step('Meta data-deletion callback (signed_request) disconnects account', async () => {
  const payload = Buffer.from(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: ig.platform_user_id, issued_at: Date.now() / 1000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', 'mock-ig-secret').update(payload).digest('base64url');
  const bad = await fetch(`${B}/meta/instagram/delete`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `signed_request=xx.${payload}` });
  assert.equal(bad.status, 400);
  const r = await fetch(`${B}/meta/instagram/delete`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `signed_request=${sig}.${payload}` }).then((x) => x.json());
  assert.ok(r.confirmation_code);
  assert.equal((await http('GET', '/v1/accounts')).json.data.length, 0);
  const page = await fetch(r.url).then((x) => x.text());
  assert.match(page, /selesai/);
});

server.close();
fs.rmSync(tmp, { recursive: true, force: true });
const failed = results.filter((r) => r[0] === '✗').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
