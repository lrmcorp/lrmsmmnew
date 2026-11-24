// The application half of the plans bridge: who may spend the owner's ChatGPT
// subscription, how a request is shaped, and that the terminal ticket this app
// mints is the one the bridge verifies.
//
// No ChatGPT account, no Codex CLI and no network: the bridge is stubbed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// config.js creates its media directory at import time, and DATA_DIR defaults
// to /data, which the production image's unprivileged user cannot write. Every
// other backend test points it at a temporary directory first; this one did
// not, and only failed inside that image.
Object.assign(process.env, {
  DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'lrmsmm-plans-')),
  META_MOCK: '1',
  DISABLE_WORKER: '1',
});
process.env.PLANS_BRIDGE_URL = 'http://teammates.test/teammates/v1';
process.env.PLANS_BRIDGE_TOKEN = 'shared-internal-token-0123456789';
process.env.ENCRYPTION_KEY ||= crypto.randomBytes(32).toString('hex');

const plans = await import('../src/llm/plans.js');
const { withPlanContext } = await import('../src/llm/plan-context.js');

const owner = { id: 'u-owner', role: 'owner' };
const rep = { id: 'u-rep', role: 'rep' };

const stubFetch = (handler) => {
  const real = globalThis.fetch;
  globalThis.fetch = handler;
  return () => { globalThis.fetch = real; };
};
const ok = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

test('only the Owner may spend the plan', async (t) => {
  await t.test('an Owner passes', () => assert.doesNotThrow(() => plans.assertOwnerMayUsePlans(owner)));
  await t.test('a representative is refused', () => {
    assert.throws(() => plans.assertOwnerMayUsePlans(rep), (e) => e.code === 'plans_owner_only' && e.status === 403);
  });
  await t.test('an absent user is refused', () => {
    assert.throws(() => plans.assertOwnerMayUsePlans(null), (e) => e.code === 'plans_owner_only');
  });
  await t.test('a completion for a representative never reaches the bridge', async () => {
    let called = false;
    const restore = stubFetch(async () => { called = true; return ok({}); });
    try {
      await assert.rejects(
        withPlanContext({ user: rep, sessionId: 'run:1' }, () => plans.planCompletion({ model: 'codex', prompt: 'x' })),
        (e) => e.code === 'plans_owner_only');
      assert.equal(called, false, 'the ownership check runs before any request');
    } finally { restore(); }
  });
});

test('a completion carries the conversation id and the schema', async () => {
  let seen = null;
  const restore = stubFetch(async (url, init) => {
    seen = { url: String(url), headers: init.headers, body: JSON.parse(init.body) };
    return ok({ choices: [{ message: { role: 'assistant', content: 'a caption' } }] });
  });
  try {
    const schema = { type: 'object', properties: { caption: { type: 'string' } } };
    const text = await withPlanContext({ user: owner, sessionId: 'run:abc' }, () =>
      plans.planCompletion({ model: 'codex', system: 'be terse', prompt: 'write one', jsonSchema: schema }));
    assert.equal(text, 'a caption');
    assert.match(seen.url, /\/chat\/completions$/);
    assert.equal(seen.headers['x-lrm-session'], 'run:abc', 'one working directory per conversation');
    assert.equal(seen.headers.authorization, 'Bearer shared-internal-token-0123456789');
    assert.equal(seen.body.messages[0].role, 'system');
    assert.deepEqual(seen.body.response_format.json_schema.schema, schema, 'structured output is preserved');
  } finally { restore(); }
});

test('a request without a conversation in scope is refused', async () => {
  const restore = stubFetch(async () => ok({}));
  try {
    await assert.rejects(
      withPlanContext({ user: owner }, () => plans.planCompletion({ model: 'codex', prompt: 'x' })),
      (e) => e.code === 'plans_session_missing');
  } finally { restore(); }
});

test('a signed-out plan surfaces the actionable message', async () => {
  const restore = stubFetch(async () => new Response(
    JSON.stringify({ error: { code: 'plan_signed_out', message: 'Codex is not signed in yet. Sign in on Config → AI plans.' } }),
    { status: 409, headers: { 'content-type': 'application/json' } }));
  try {
    await assert.rejects(
      withPlanContext({ user: owner, sessionId: 'run:1' }, () => plans.planCompletion({ model: 'codex', prompt: 'x' })),
      (e) => e.status === 409 && e.code === 'plan_signed_out' && /Config → AI plans/.test(e.message));
  } finally { restore(); }
});

test('the provider is offered only while a plan is signed in', async (t) => {
  await t.test('an empty catalogue means no plans', async () => {
    const restore = stubFetch(async () => ok({ object: 'list', data: [] }));
    try { plans._resetModelCache(); assert.equal(await plans.plansAvailable(), false); } finally { restore(); }
  });
  await t.test('a listed model means the provider may appear', async () => {
    const restore = stubFetch(async () => ok({ object: 'list', data: [{ id: 'codex' }] }));
    try { plans._resetModelCache(); assert.equal(await plans.plansAvailable(), true); } finally { restore(); }
  });
  await t.test('an unreachable bridge reads as no plans, not as an error', async () => {
    const restore = stubFetch(async () => { throw new Error('ECONNREFUSED'); });
    try { plans._resetModelCache(); assert.equal(await plans.plansAvailable(), false); } finally { restore(); }
  });
  await t.test('the catalogue is cached rather than spawning a process per render', async () => {
    let calls = 0;
    const restore = stubFetch(async () => { calls++; return ok({ object: 'list', data: [{ id: 'codex' }] }); });
    try {
      plans._resetModelCache();
      await plans.listModels(); await plans.listModels(); await plans.listModels();
      assert.equal(calls, 1, 'one request serves the 60-second window');
    } finally { restore(); }
  });
});

test('the terminal ticket this app mints is the one the bridge accepts', async (t) => {
  // Reimplements the bridge's verifier rather than importing it: the two
  // services ship separately, and this is the contract between them.
  const verifyLikeBridge = (ticket, token) => {
    const [body, mac] = String(ticket).split('.');
    if (!body || !mac) return null;
    const expected = crypto.createHmac('sha256', token).update(body).digest('base64url');
    if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload.exp > Date.now() ? payload : null;
  };

  await t.test('a fresh ticket verifies against the shared token', () => {
    const payload = verifyLikeBridge(plans.mintTerminalTicket(owner), process.env.PLANS_BRIDGE_TOKEN);
    assert.equal(payload?.userId, 'u-owner');
  });
  await t.test('it expires', () => {
    const ticket = plans.mintTerminalTicket(owner, { ttlMs: -1 });
    assert.equal(verifyLikeBridge(ticket, process.env.PLANS_BRIDGE_TOKEN), null);
  });
  await t.test('a different token does not verify it', () => {
    assert.equal(verifyLikeBridge(plans.mintTerminalTicket(owner), 'some-other-token'), null);
  });
  await t.test('a representative cannot mint one', () => {
    assert.throws(() => plans.mintTerminalTicket(rep), (e) => e.code === 'plans_owner_only');
  });
});

test('a stopped bridge is reported as unreachable, not as signed out', async (t) => {
  // The status page once showed "Not signed in" for a bridge container that was
  // not running at all, because both failures collapsed into "no models". The
  // owner was sent to a sign-in button that could never work.
  await t.test('connection refused -> unreachable', async () => {
    const restore = stubFetch(async () => { throw new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } }); });
    try { plans._resetModelCache(); assert.deepEqual(await plans.probe(), { reachable: false, models: [] }); } finally { restore(); }
  });
  await t.test('answering but signed out -> reachable with no models', async () => {
    const restore = stubFetch(async () => ok({ object: 'list', data: [] }));
    try { plans._resetModelCache(); assert.deepEqual(await plans.probe(), { reachable: true, models: [] }); } finally { restore(); }
  });
  await t.test('signed in -> reachable with models', async () => {
    const restore = stubFetch(async () => ok({ object: 'list', data: [{ id: 'codex' }] }));
    try { plans._resetModelCache(); assert.deepEqual(await plans.probe(), { reachable: true, models: ['codex'] }); } finally { restore(); }
  });
});

test('a saved plan stage is kept, not swapped for a keyed provider', async () => {
  const { run } = await import('../src/db.js');
  const generator = await import('../src/services/generator.js');
  const user = { id: 'u-owner-settings', role: 'owner' };
  run("INSERT OR IGNORE INTO users(id,email,password_hash,role) VALUES(?,?,?,'owner')", user.id, 'owner-settings@test.local', 'x');
  // An OpenAI key is saved: before the fix every keyless provider fell back to it.
  run("INSERT OR REPLACE INTO generator_keys(user_id,provider,secret_enc,updated_at) VALUES(?,?,?,?)", user.id, 'openai', 'not-read-here', new Date().toISOString());
  const agents = generator.settings(user).agents;
  agents.concept = { ...agents.concept, provider: 'lrmplans', model: 'codex' };
  generator.saveSettings(user, { agents });
  assert.equal(generator.settings(user).agents.concept.provider, 'lrmplans');

  const restore = stubFetch(async () => ok({ object: 'list', data: [{ id: 'codex' }] }));
  try {
    plans._resetModelCache();
    const view = await generator.settingsView(user);
    assert.equal(view.agents.concept.provider, 'lrmplans');
    assert.ok(view.providers.lrmplans, 'offered while signed in');
    assert.deepEqual(view.keys.filter((k) => k.virtual).map((k) => k.provider), ['lrmplans'], 'the browser sees it as ready without a key');
  } finally { restore(); }

  plans._resetModelCache();
  const signedOut = stubFetch(async () => ok({ object: 'list', data: [] }));
  try {
    const view = await generator.settingsView(user);
    assert.equal(view.keys.some((k) => k.virtual), false, 'no virtual key while no plan is signed in');
  } finally { signedOut(); }
});

// The stages call generateText(), not planCompletion(), and read result.text.
// The plan branch returned a bare string, so every stage saw undefined and
// failed as "The concept response was truncated or could not be read" although
// Codex had answered. Tested here through the function the stages actually use.
test('generateText answers on the plan with the same { text } shape as every provider', async () => {
  const { generateText } = await import('../src/llm/providers.js');
  const answer = JSON.stringify({ title: 'Reformer', caption: 'Line one.\n\nLine two.', slides: [{ prompt: 'a studio' }] });
  const restore = stubFetch(async () => ok({ choices: [{ message: { role: 'assistant', content: answer } }] }));
  try {
    const result = await withPlanContext({ user: owner, sessionId: 'gen:1' }, () =>
      generateText({ provider: 'lrmplans', model: 'codex', system: 's', prompt: 'p', jsonSchema: { type: 'object' } }));
    assert.equal(typeof result, 'object');
    assert.equal(result.text, answer);
    assert.equal(JSON.parse(result.text).slides.length, 1, 'the stage can parse it');
  } finally { restore(); }
});
