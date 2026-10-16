// End-to-end test against the in-process mock Meta API.  Run: npm test
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const PORT = 4100 + Math.floor(Math.random() * 500);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lrmsmm-test-'));
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
  assert.equal(r.status, 201); assert.equal(r.json.user.role, 'owner');
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

await step('a second Instagram account coexists; reconnect and disconnect do not replace the first', async () => {
  assert.match(await followConnect('instagram', 'brandkedua'), /connected=/);
  let accounts = (await http('GET', '/v1/accounts')).json.data;
  const second = accounts.find(a => a.platform === 'instagram' && a.username === 'brandkedua');
  assert.ok(second);
  assert.notEqual(second.id, ig.id);
  assert.equal(accounts.filter(a => a.platform === 'instagram').length, 2);
  assert.equal(accounts.find(a => a.id === ig.id).username, 'kopisenja');
  await followConnect('instagram', 'brandkedua');
  accounts = (await http('GET', '/v1/accounts')).json.data;
  assert.equal(accounts.filter(a => a.platform === 'instagram').length, 2);
  assert.equal(accounts.find(a => a.username === 'brandkedua').id, second.id);
  assert.equal((await http('DELETE', `/v1/accounts/${second.id}`)).status, 204);
  accounts = (await http('GET', '/v1/accounts')).json.data;
  assert.ok(accounts.some(a => a.id === ig.id && a.status === 'active'));
  assert.ok(!accounts.some(a => a.id === second.id));
});

await step('API keys: create write + read, hashed', async () => {
  const w = await http('POST', '/v1/api-keys', { body: { name: 'n8n', scope: 'write' } });
  const r = await http('POST', '/v1/api-keys', { body: { name: 'viewer', scope: 'read' } });
  writeKey = w.json.key; readKey = r.json.key;
  assert.match(writeKey, /^lrm_live_/);
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
  assert.equal(page.status, 200); assert.match(page.json, /ingin mengakses LRMsmm/);
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


// ---------------- roles, messages, realtime, audit ----------------
async function asCookie(c, fn) { const saved = cookie; cookie = c; try { return await fn(); } finally { cookie = saved; } }
let sp, repCookie = '', repId;

await step('roles: Representative only sees and acts on assigned accounts', async () => {
  await followConnect('instagram', 'sunrisepadel');
  sp = (await http('GET', '/v1/accounts')).json.data.find((a) => a.username === 'sunrisepadel');
  const u = await http('POST', '/v1/users', { body: { email: 'rep@hrgroup.id', password: 'rahasia123', name: 'Rep Kopi', role: 'rep', account_ids: [ig.id] } });
  assert.equal(u.status, 201, JSON.stringify(u.json)); assert.deepEqual(u.json.account_ids, [ig.id]); repId = u.json.id;
  const ownerCookie = cookie; cookie = '';
  await http('POST', '/auth/login', { body: { email: 'rep@hrgroup.id', password: 'rahasia123' } });
  repCookie = cookie; cookie = ownerCookie;
  await asCookie(repCookie, async () => {
    const acc = (await http('GET', '/v1/accounts')).json.data;
    assert.deepEqual(acc.map((a) => a.id), [ig.id]);
    const r = await http('POST', '/v1/posts', { body: { content: 'x', media_ids: [imgId], targets: [{ account_id: sp.id }] } });
    assert.equal(r.status, 404, 'cannot post to unassigned account');
    assert.equal((await http('GET', '/v1/users')).status, 403);
    assert.equal((await http('GET', '/v1/admin/audit')).status, 403);
    assert.equal((await http('GET', `/v1/accounts/${sp.id}/insights`)).status, 404);
    const cm = (await http('GET', '/v1/comments?reply_status=all')).json.data;
    assert.ok(cm.every((c) => c.account_id === ig.id));
  });
  const at = new Date(Date.now() + 3600_000).toISOString();
  const both = (await http('POST', '/v1/posts', { body: { content: 'Bareng', media_ids: [imgId], targets: [{ account_id: ig.id }, { account_id: sp.id }], scheduled_at: at } })).json;
  const onlySp = (await http('POST', '/v1/posts', { body: { content: 'Padel only', media_ids: [imgId], targets: [{ account_id: sp.id }], scheduled_at: at } })).json;
  await asCookie(repCookie, async () => {
    assert.equal((await http('GET', `/v1/posts/${both.id}`)).status, 200, 'can view shared post');
    assert.equal((await http('DELETE', `/v1/posts/${both.id}`)).status, 403, 'cannot cancel post touching other accounts');
    assert.equal((await http('GET', `/v1/posts/${onlySp.id}`)).status, 404, 'cannot see other account post');
    const list = (await http('GET', '/v1/posts?limit=100')).json.data.map((p) => p.id);
    assert.ok(list.includes(both.id) && !list.includes(onlySp.id));
    const r = await http('POST', '/v1/posts', { body: { content: 'Rep post', media_ids: [imgId], targets: [{ account_id: ig.id }], scheduled_at: at } });
    assert.equal(r.status, 201);
    assert.equal((await http('DELETE', `/v1/posts/${r.json.id}`)).json.status, 'cancelled');
  });
  await http('DELETE', `/v1/posts/${both.id}`); await http('DELETE', `/v1/posts/${onlySp.id}`);
  const upd = await http('PUT', `/v1/users/${repId}/accounts`, { body: { account_ids: [ig.id, sp.id] } });
  assert.equal(upd.json.account_ids.length, 2);
  await asCookie(repCookie, async () => assert.equal((await http('GET', '/v1/accounts')).json.data.length, 2));
  const last = await http('PATCH', `/v1/users/${(await http('GET', '/v1/me')).json.user.id}`, { body: { role: 'rep' } });
  assert.equal(last.status, 400, 'owner cannot demote self');
});

let rinaConv;
await step('messages: sync Instagram DMs, needs-reply + overdue > 5 min', async () => {
  const s = await http('POST', '/v1/messages/sync', { auth: undefined });
  assert.ok(s.json.new_messages >= 3, JSON.stringify(s.json));
  const list = (await http('GET', `/v1/conversations?account_id=${ig.id}`)).json.data;
  rinaConv = list.find((c) => c.participant.username === 'rina.ardhani');
  assert.ok(rinaConv, JSON.stringify(list)); assert.ok(rinaConv.waiting_minutes >= 11); assert.equal(rinaConv.can_reply, true);
  assert.ok(!list.find((c) => c.participant.username === 'bayu_w'), 'replied conversation not in needs_reply');
  const u = (await http('GET', '/v1/messages/unreplied')).json;
  assert.ok(u.overdue >= 2, JSON.stringify(u)); // one per IG account (kopisenja + sunrisepadel)
  const st = (await http('GET', '/v1/stats')).json; assert.equal(st.messages_overdue, u.overdue);
});

await step('messages: reply clears it; 24h window enforced; done/open', async () => {
  const r = await http('POST', `/v1/conversations/${rinaConv.id}/messages`, { body: { text: 'Masih ada Kak, jam 08.00 dan 10.00 ✨' } });
  assert.equal(r.status, 201, JSON.stringify(r.json)); assert.equal(r.json.needs_reply, false);
  assert.equal(r.json.messages.at(-1).direction, 'out'); assert.equal(r.json.messages.at(-1).sent_by, 'Reyner');
  const all2 = (await http('GET', `/v1/conversations?filter=all&account_id=${ig.id}`)).json.data;
  const bayu = all2.find((c) => c.participant.username === 'bayu_w');
  run('UPDATE conversations SET last_inbound_at=? WHERE id=?', new Date(Date.now() - 2 * 864e5).toISOString(), bayu.id);
  const late = await http('POST', `/v1/conversations/${bayu.id}/messages`, { body: { text: 'halo' } });
  assert.equal(late.json.error.code, 'messaging_window_closed');
  const spConv = (await http('GET', `/v1/conversations?account_id=${sp.id}`)).json.data[0];
  assert.equal((await http('PATCH', `/v1/conversations/${spConv.id}`, { body: { status: 'done' } })).json.status, 'done');
  assert.equal((await http('GET', '/v1/messages/unreplied')).json.overdue, 0);
});

await step('webhooks: verify challenge, reject bad signature', async () => {
  const v = await fetch(`${B}/webhooks/instagram?hub.mode=subscribe&hub.verify_token=lrmsmm-verify&hub.challenge=12345`).then((r) => r.text());
  assert.equal(v, '12345');
  assert.equal((await fetch(`${B}/webhooks/instagram?hub.mode=subscribe&hub.verify_token=salah&hub.challenge=1`)).status, 403);
  const bad = await fetch(`${B}/webhooks/instagram`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=00' }, body: '{}' });
  assert.equal(bad.status, 401);
});

await step('real-time: inbound DM via signed webhook is pushed to dashboard (SSE)', async () => {
  const ctrl = new AbortController();
  const res = await fetch(`${B}/v1/events`, { headers: { cookie: repCookie }, signal: ctrl.signal });
  const reader = res.body.getReader(); const dec = new TextDecoder();
  let buf = '';
  const got = (async () => {
    for (;;) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value); if (buf.includes('event: message.new')) return true; }
  })();
  await new Promise((r) => setTimeout(r, 100));
  const sim = await fetch(`${B}/__mock/ig/simulate/dm`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ owner: 'kopisenja', owner_id: ig.platform_user_id, from: 'dewi.s', text: 'Bisa booking buat 4 orang?' }) }).then((r) => r.json());
  assert.equal(sim.webhook_status, 200);
  const ok = await Promise.race([got, new Promise((r) => setTimeout(() => r(false), 5000))]);
  ctrl.abort();
  assert.equal(ok, true, 'SSE message.new received');
  const dewi = (await http('GET', `/v1/conversations?account_id=${ig.id}`)).json.data.find((c) => c.participant.username === 'dewi.s');
  assert.ok(dewi?.needs_reply);
  assert.equal((await http('GET', '/v1/messages/unreplied')).json.overdue, 0, 'fresh message not yet overdue');
  assert.ok((await http('GET', '/v1/messages/unreplied?older_than=0')).json.overdue >= 1);
});

await step('MCP: list_conversations + send_message', async () => {
  const c = await mcp(oauthAccess);
  const list = JSON.parse((await c.callTool({ name: 'list_conversations', arguments: {} })).content[0].text);
  assert.match(list._notice, /UNTRUSTED/);
  const dewi = list.data.find((x) => x.participant.username === 'dewi.s');
  const sent = JSON.parse((await c.callTool({ name: 'send_message', arguments: { conversation_id: dewi.id, text: 'Bisa Kak, untuk jam berapa?' } })).content[0].text);
  assert.equal(sent.needs_reply, false);
  await c.close();
});

await step('resumable chunked upload + storage usage', async () => {
  const big = Buffer.concat([await sharp({ create: { width: 1080, height: 1080, channels: 3, background: '#357' } }).jpeg().toBuffer(), Buffer.alloc(9 * 1024 * 1024 - 200000)]);
  const sz = (await sharp({ create: { width: 1080, height: 1080, channels: 3, background: '#357' } }).jpeg().toBuffer()).length;
  const buf = big.subarray(0, Math.min(big.length, 7 * 1024 * 1024)); // < 8MB image limit
  const up = (await http('POST', '/v1/media/uploads', { body: { mime_type: 'image/jpeg', size_bytes: buf.length } })).json;
  assert.equal(up.part_count, 1);
  assert.deepEqual((await http('GET', `/v1/media/${up.id}/parts`)).json.received, []);
  await http('PUT', `/v1/media/${up.id}/parts/1`, { body: buf, raw: true, headers: { 'content-type': 'application/octet-stream' } });
  assert.deepEqual((await http('GET', `/v1/media/${up.id}/parts`)).json.received, [1]);
  assert.ok(sz > 0);
  const u = (await http('GET', '/v1/media/usage')).json;
  assert.ok(u.used_bytes > 0 && u.files > 0);
});

await step('audit log records who did what', async () => {
  const a = (await http('GET', '/v1/admin/audit?limit=200')).json.data;
  const acts = new Set(a.map((x) => x.action));
  for (const k of ['account.connect', 'post.publish', 'post.schedule', 'message.send', 'user.create', 'user.assign', 'comment.reply', 'api_key.create']) assert.ok(acts.has(k), `missing ${k}`);
  assert.ok(a.some((x) => x.action === 'message.send' && x.via === 'oauth'), 'AI actions attributed');
  const ov = (await http('GET', '/v1/admin/overview')).json; assert.ok(ov.webhooks.received >= 1);
  const fp = (await http('GET', '/v1/admin/failed-posts')).json; assert.ok(Array.isArray(fp.data));
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
  assert.ok(!(await http('GET', '/v1/accounts')).json.data.some((a) => a.id === th.id));
});

await step('Meta data-deletion callback (signed_request) disconnects account', async () => {
  const payload = Buffer.from(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: ig.platform_user_id, issued_at: Date.now() / 1000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', 'mock-ig-secret').update(payload).digest('base64url');
  const bad = await fetch(`${B}/meta/instagram/delete`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `signed_request=xx.${payload}` });
  assert.equal(bad.status, 400);
  const r = await fetch(`${B}/meta/instagram/delete`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `signed_request=${sig}.${payload}` }).then((x) => x.json());
  assert.ok(r.confirmation_code);
  assert.ok(!(await http('GET', '/v1/accounts')).json.data.some((a) => a.id === ig.id));
  const page = await fetch(r.url).then((x) => x.text());
  assert.match(page, /selesai/);
});

server.close();
fs.rmSync(tmp, { recursive: true, force: true });
const failed = results.filter((r) => r[0] === '✗').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
