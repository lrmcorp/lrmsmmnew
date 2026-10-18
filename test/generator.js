import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lrmsmm-generator-'));
Object.assign(process.env, { META_MOCK: '1', DATA_DIR: tmp, DISABLE_WORKER: '1' });
const { app } = await import('../src/server.js');
const { createUser, createApiKey } = await import('../src/auth.js');
const { run, one } = await import('../src/db.js');
const { encrypt } = await import('../src/util.js');
const { setAssignments } = await import('../src/services/scope.js');
const gen = await import('../src/services/generator.js');
const { deleteMedia, gcMedia } = await import('../src/services/media.js');
const { generateText } = await import('../src/llm/providers.js');
const sharp = (await import('sharp')).default;
const image = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#4c8' } }).png().toBuffer();
const realFetch = globalThis.fetch;
let providerCalls = [], failImage = false, malformed = false, gate = null, blocked = null, failAfterSlide = 0, imageCalls = 0;
const secret = 'fixture-secret-DO-NOT-EXPOSE';
// Intercept only official provider origins; application HTTP still exercises Express/auth/SQLite.
globalThis.fetch = async (url, opts) => {
  const origin = new URL(url).origin;
  if (!['https://api.openai.com', 'https://api.anthropic.com', 'https://generativelanguage.googleapis.com'].includes(origin)) return realFetch(url, opts);
  const body = JSON.parse(opts.body);
  providerCalls.push({ origin, url, headers: opts.headers, body });
  const imageRequest = String(url).includes('/images/generations') || body.generationConfig?.responseModalities;
  if (imageRequest) {
    imageCalls++;
    if (gate) { blocked?.(); await gate; }
    if (failImage || (failAfterSlide && imageCalls === failAfterSlide)) return new Response(JSON.stringify({ error: { message: secret } }), { status: 429 });
    return Response.json(origin.includes('openai') ? { data: [{ b64_json: image.toString('base64') }] } : { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: image.toString('base64') } }] } }] });
  }
  const system = body.system || body.messages?.[0]?.content || body.systemInstruction?.parts?.[0]?.text || '';
  let text = 'Visual review: inspect the CTA before publishing. No auto approval.';
  if (system.includes('Return ONLY JSON')) {
    const n = Number(system.match(/Exactly (\d+) slides/)[1]);
    text = malformed ? '{malformed' : JSON.stringify({ title: 'Campaign', caption: 'Final caption', slides: Array.from({ length: n }, (_, i) => ({ prompt: 'Green brand image slide ' + (i + 1) })) });
  }
  return Response.json(origin.includes('openai') ? { choices: [{ message: { content: text } }], usage: { total_tokens: 42 } } : origin.includes('anthropic') ? { content: [{ type: 'text', text }], usage: { input_tokens: 20, output_tokens: 22 } } : { candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { totalTokenCount: 42 } });
};
const user = createUser({ email: 'generator@test.id', password: 'fixture-password', name: 'Generator Rep', role: 'rep' });
const other = createUser({ email: 'other-generator@test.id', password: 'fixture-password', name: 'Other Rep', role: 'rep' });
run("INSERT INTO accounts(id,platform,platform_user_id,username,token_enc) VALUES('ig-generator','instagram','ig-fixture','fixturebrand',?)", encrypt('fake-meta-token'));
setAssignments(user.id, ['ig-generator']); setAssignments(other.id, ['ig-generator']);
const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
const base = 'http://127.0.0.1:' + server.address().port;
async function login(u) {
  const res = await realFetch(base + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: u.email, password: 'fixture-password' }) });
  return res.headers.get('set-cookie').split(';')[0];
}
const cookie = await login(user), otherCookie = await login(other);
async function http(method, route, body, cred = cookie, machine = false) {
  const response = await realFetch(base + '/v1/generator' + route, { method, headers: { [machine ? 'Authorization' : 'Cookie']: machine ? 'Bearer ' + cred : cred, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, json: response.status === 204 ? null : await response.json() };
}
let seq = 0;
const make = (overrides = {}) => gen.createRun(user, { request_id: 'run-' + ++seq, brief: 'Make a wellness carousel in Indonesian', account_ids: ['ig-generator'], slide_count: 2, confirm_cost: true, ...overrides });
async function execute(r) { gen.runGeneratorTick(); await gen.waitGenerator(); return gen.getRun(user, r.id); }

test('personal credentials, provider contracts, durable pipeline and final handoff', async t => {
  try {
    await t.test('keys encrypted, no returned secrets, settings and runs are private/session-only', async () => {
      for (const provider of ['openai', 'anthropic', 'gemini']) assert.equal((await http('PUT', '/keys/' + provider, { key: secret })).status, 204);
      const row = one('SELECT secret_enc FROM generator_keys WHERE user_id=? LIMIT 1', user.id);
      assert.ok(!row.secret_enc.includes(secret));
      assert.ok(!JSON.stringify((await http('GET', '/settings')).json).includes(secret));
      assert.equal((await http('GET', '/settings', undefined, otherCookie)).json.keys.length, 0);
      const key = createApiKey(user.id, 'machine', 'write').key;
      assert.equal((await http('GET', '/settings', undefined, key, true)).status, 403);
      assert.equal((await http('POST', '/runs', { confirm_cost: true }, key, true)).status, 403);
      assert.throws(() => make({ confirm_cost: false }), /Konfirmasi/);
      assert.throws(() => make({ account_ids: ['unassigned'] }), /tidak ditemukan/);
      assert.throws(() => make({ agents: { ...gen.DEFAULT_AGENTS, image: { ...gen.DEFAULT_AGENTS.image, provider: 'anthropic' } } }), /Provider/);
    });
    await t.test('concept → Claude revision → OpenAI images → Gemini visual review, no publishing', async () => {
      const r = make(); const postCount = one('SELECT COUNT(*) n FROM posts').n;
      const done = await execute(r);
      assert.equal(done.status, 'review'); assert.equal(done.media.length, 2);
      assert.ok(done.media.every(m => m.mime_type === 'image/jpeg' && m.url));
      for (const role of gen.ROLES) assert.equal(done.steps[role].status, 'done');
      const final = providerCalls.find(c => c.origin.includes('googleapis') && !c.body.generationConfig?.responseModalities);
      assert.equal(final.body.contents[0].parts.filter(p => p.inlineData).length, 2, 'reviewer sees actual image bytes');
      assert.equal(one('SELECT COUNT(*) n FROM posts').n, postCount);
      assert.equal((await http('GET', '/runs/' + r.id, undefined, otherCookie)).status, 404);
      const row = one('SELECT path FROM media WHERE id=?', done.media_ids[0]);
      run("UPDATE media SET created_at='2000-01-01T00:00:00.000Z' WHERE id=?", done.media_ids[0]); gcMedia(); assert.ok(fs.existsSync(row.path));
      assert.throws(() => deleteMedia(done.media_ids[0]), /dipakai/);
      const draft = await gen.handoff(user, r.id, { content: 'Human corrected caption' });
      assert.ok(draft.compose_url.includes('ai_draft='));
      assert.equal(one('SELECT COUNT(*) n FROM posts').n, postCount);
      assert.equal(gen.getRun(user, r.id).status, 'drafted');
      assert.equal((await gen.handoff(user, r.id, {})).draft_id, draft.draft_id);
      assert.equal(one('SELECT content FROM ai_drafts WHERE id=?', draft.draft_id).content, 'Human corrected caption');
    });
    await t.test('Gemini image generation and Claude/OpenAI vision connectors', async () => {
      const agents = structuredClone(gen.DEFAULT_AGENTS);
      agents.image = { ...agents.image, provider: 'gemini', model: 'gemini-2.5-flash-image' };
      agents.final = { ...agents.final, provider: 'anthropic', model: 'claude-sonnet-4-5' };
      const done = await execute(make({ agents, slide_count: 1 })); assert.equal(done.status, 'review');
      assert.ok(providerCalls.some(c => c.origin.includes('googleapis') && c.body.generationConfig?.responseModalities));
      assert.ok(providerCalls.some(c => c.origin.includes('anthropic') && c.body.messages[0].content.some(p => p.type === 'image')));
      await generateText({ provider: 'openai', model: 'gpt-4.1-mini', key: secret, system: 'Review', prompt: 'Review actual image', images: [{ mime: 'image/jpeg', data: 'fixture-image' }] });
      assert.ok(providerCalls.some(c => c.origin.includes('openai') && c.body.messages?.[1].content.some(p => p.type === 'image_url')));
      for (const call of providerCalls) {
        assert.equal(call.headers.Authorization || call.headers['x-api-key'] || call.headers['x-goog-api-key'], call.origin.includes('openai') ? 'Bearer ' + secret : secret);
        assert.ok(!String(call.url).includes(secret));
      }
    });
    await t.test('image failure is safe, keeps completed slides and requires explicit retry', async () => {
      imageCalls = 0; failAfterSlide = 2;
      let r = make(); r = await execute(r);
      assert.equal(r.status, 'failed'); assert.equal(r.media.length, 1); assert.ok(!r.error.includes(secret));
      const first = r.media_ids[0], calls = providerCalls.length;
      gen.runGeneratorTick(); await gen.waitGenerator(); assert.equal(providerCalls.length, calls, 'no automatic paid retry');
      failAfterSlide = 0; gen.retryRun(user, r.id); r = await execute(r);
      assert.equal(r.status, 'review'); assert.equal(r.media_ids[0], first); assert.equal(r.media_ids.length, 2);
      gen.cancelRun(user, r.id);
    });
    await t.test('idempotency, malformed output, revoked scope and cancellation during a provider call', async () => {
      const body = { request_id: 'stable', brief: 'Stable', account_ids: ['ig-generator'], slide_count: 1, confirm_cost: true };
      const a = gen.createRun(user, body); assert.equal(gen.createRun(user, body).id, a.id);
      assert.throws(() => gen.createRun(user, { ...body, brief: 'Changed' }), /request_id/);
      gen.cancelRun(user, a.id);
      malformed = true; let r = await execute(make()); assert.equal(r.status, 'failed'); assert.ok(r.error.includes('JSON')); malformed = false; gen.cancelRun(user, r.id);
      r = make(); setAssignments(user.id, []); gen.runGeneratorTick(); await gen.waitGenerator(); assert.equal(one('SELECT status FROM generator_runs WHERE id=?', r.id).status, 'failed');
      setAssignments(user.id, ['ig-generator']); gen.cancelRun(user, r.id);
      let release; gate = new Promise(r => { release = r; }); const started = new Promise(r => { blocked = r; });
      r = make(); gen.runGeneratorTick(); await started; gen.cancelRun(user, r.id); release(); await gen.waitGenerator(); gate = null; blocked = null;
      assert.equal(gen.getRun(user, r.id).status, 'cancelled'); assert.equal(gen.getRun(user, r.id).media.length, 0);
      await assert.rejects(() => gen.handoff(user, r.id, {}), /Tunggu/);
      const stale = make(); const callsBefore = providerCalls.length;
      run("UPDATE generator_runs SET status='running',updated_at='2000-01-01T00:00:00.000Z' WHERE id=?", stale.id);
      gen.runGeneratorTick(); await gen.waitGenerator();
      assert.equal(gen.getRun(user, stale.id).status, 'failed'); assert.equal(providerCalls.length, callsBefore);
      gen.cancelRun(user, stale.id);
    });
  } finally { globalThis.fetch = realFetch; await gen.waitGenerator(); await new Promise(r => server.close(r)); fs.rmSync(tmp, { recursive: true, force: true }); }
});
