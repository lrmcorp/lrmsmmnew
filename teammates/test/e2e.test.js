// End to end through the real HTTP server, with the fake Codex binary standing
// in for the CLI. Proves the wire contract the application depends on.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'teammates-e2e-'));
const argLog = path.join(here, 'fake-args.log');
const control = path.join(here, 'fake-control.env');

process.env.CODEX_BIN = path.join(here, 'fake-codex.sh');
process.env.WORK_DIR = work;
process.env.INTERNAL_TOKEN = 'e2e-internal-token-0123456789';
process.env.PORT = '0';

// The bridge runs Codex with a minimal environment on purpose, so the fixture
// is steered through a file beside it rather than exported variables.
const fixture = (settings = {}) => {
  const base = { SIGNED_IN: 1, REPLY_TEXT: 'Hello from the plan.', FAIL: 0, FAIL_MSG: 'boom', RESUME_FAILS: 0, HANG: 0 };
  const merged = { ...base, ...settings };
  fs.writeFileSync(control, Object.entries(merged).map(([k, v]) => `${k}=${JSON.stringify(String(v))}`).join('\n') + '\n');
};
fixture();

const { server } = await import('../src/server.js');
const { _resetStatusCache } = await import('../src/turn.js');

let base;
before(async () => {
  if (!server.listening) await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); fs.rmSync(control, { force: true }); fs.rmSync(argLog, { force: true }); fs.rmSync(path.join(here, 'fake-prompt.txt'), { force: true }); });

const TOKEN = process.env.INTERNAL_TOKEN;
const call = (p, { method = 'GET', body, token = TOKEN, session = 'conv-1' } = {}) =>
  fetch(base + p, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(session ? { 'x-lrm-session': session } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

const readArgs = () => fs.existsSync(argLog) ? fs.readFileSync(argLog, 'utf8').trim().split('\n').filter(Boolean) : [];
const resetArgs = () => fs.writeFileSync(argLog, '');

test('the internal bearer token is required', async () => {
  assert.equal((await call('/teammates/v1/models', { token: null })).status, 401);
  assert.equal((await call('/teammates/v1/models', { token: 'wrong-token-entirely' })).status, 401);
  assert.equal((await call('/teammates/v1/models')).status, 200);
});

test('GET /models lists the plan models while signed in', async () => {
  _resetStatusCache();
  const r = await call('/teammates/v1/models');
  const j = await r.json();
  assert.equal(j.object, 'list');
  assert.ok(j.data.some((m) => m.id === 'codex'), 'the default plan model is offered');
});

test('GET /models is empty when the plan is signed out', async () => {
  fixture({ SIGNED_IN: 0 }); _resetStatusCache();
  const j = await (await call('/teammates/v1/models')).json();
  assert.deepEqual(j.data, [], 'an empty catalogue, so the app simply hides the provider');
  fixture(); _resetStatusCache();
});

test('a chat completion returns the file the -o flag wrote', async () => {
  resetArgs();
  fixture({ REPLY_TEXT: 'A caption from the plan.' });
  const r = await call('/teammates/v1/chat/completions', {
    method: 'POST', session: 'conv-first',
    body: { model: 'codex', messages: [{ role: 'user', content: 'write one' }] },
  });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.object, 'chat.completion');
  assert.equal(j.choices[0].message.content, 'A caption from the plan.');
  const args = readArgs().join(' ');
  assert.match(args, /exec .*--skip-git-repo-check/, 'the first turn starts a session');
  assert.ok(!/resume/.test(args), 'and does not resume');
});

test('the second message in a conversation resumes it', async () => {
  resetArgs();
  await call('/teammates/v1/chat/completions', {
    method: 'POST', session: 'conv-resume',
    body: { messages: [{ role: 'user', content: 'one' }] },
  });
  await call('/teammates/v1/chat/completions', {
    method: 'POST', session: 'conv-resume',
    body: { messages: [{ role: 'user', content: 'one' }, { role: 'assistant', content: 'ok' }, { role: 'user', content: 'two' }] },
  });
  const lines = readArgs();
  assert.ok(!/resume/.test(lines[0]), 'first turn: no resume');
  assert.match(lines[1], /exec resume --last/, 'second turn: resume --last');
});

test('a failed resume restarts the turn with a summary', async () => {
  resetArgs();
  await call('/teammates/v1/chat/completions', { method: 'POST', session: 'conv-broken', body: { messages: [{ role: 'user', content: 'one' }] } });
  fixture({ RESUME_FAILS: 1 });
  const r = await call('/teammates/v1/chat/completions', {
    method: 'POST', session: 'conv-broken',
    body: { messages: [{ role: 'user', content: 'one' }, { role: 'assistant', content: 'ok' }, { role: 'user', content: 'two' }] },
  });
  fixture();
  assert.equal(r.status, 200, 'the caller still gets an answer');
  const lines = readArgs();
  assert.match(lines[1], /exec resume --last/, 'resume was attempted');
  assert.ok(!/resume/.test(lines[2]), 'and the retry ran as a first message');
});

test('a failed first turn does not make the next one resume', async () => {
  // Resuming depends on a turn having completed, not on the conversation having
  // been seen: otherwise a first turn that failed leaves the second one trying
  // to resume a Codex thread that was never created.
  resetArgs();
  fixture({ FAIL: 1, FAIL_MSG: 'transient explosion' });
  const first = await call('/teammates/v1/chat/completions', {
    method: 'POST', session: 'conv-failed-first',
    body: { messages: [{ role: 'user', content: 'one' }] },
  });
  assert.equal(first.status, 502, 'the first turn fails');
  fixture();
  const second = await call('/teammates/v1/chat/completions', {
    method: 'POST', session: 'conv-failed-first',
    body: { messages: [{ role: 'user', content: 'one' }, { role: 'user', content: 'two' }] },
  });
  assert.equal(second.status, 200);
  const lines = readArgs();
  assert.ok(!lines.some((l) => /resume/.test(l)), 'neither turn resumed');
});

test('two conversations do not share a working directory', async () => {
  const a = await (await call('/teammates/v1/chat/completions', { method: 'POST', session: 'conv-A', body: { messages: [{ role: 'user', content: 'x' }] } })).json();
  const b = await (await call('/teammates/v1/chat/completions', { method: 'POST', session: 'conv-B', body: { messages: [{ role: 'user', content: 'x' }] } })).json();
  assert.ok(a.id && b.id && a.id !== b.id);
  const dirs = fs.readdirSync(work).filter((d) => fs.statSync(path.join(work, d)).isDirectory());
  assert.ok(dirs.length >= 2, 'each conversation has its own folder');
});

test('X-LRM-Session is required', async () => {
  const r = await call('/teammates/v1/chat/completions', { method: 'POST', session: null, body: { messages: [{ role: 'user', content: 'x' }] } });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error.code, 'session_required');
});

test('a signed-out plan answers 409 with the sign-in instruction', async () => {
  fixture({ SIGNED_IN: 0 }); _resetStatusCache();
  const r = await call('/teammates/v1/chat/completions', { method: 'POST', session: 'conv-out', body: { messages: [{ role: 'user', content: 'x' }] } });
  assert.equal(r.status, 409);
  const j = await r.json();
  assert.equal(j.error.code, 'plan_signed_out');
  assert.match(j.error.message, /Config → AI plans/);
  fixture(); _resetStatusCache();
});

test('a Codex failure that mentions authorization asks for a new sign-in', async () => {
  fixture({ FAIL: 1, FAIL_MSG: 'stream error: 401 unauthorized' });
  const r = await call('/teammates/v1/chat/completions', { method: 'POST', session: 'conv-401', body: { messages: [{ role: 'user', content: 'x' }] } });
  fixture();
  assert.equal(r.status, 409);
  assert.equal((await r.json()).error.code, 'plan_signed_out');
});

test('stream=true emits well-formed SSE ending in [DONE]', async () => {
  fixture({ REPLY_TEXT: 'Streamed answer.' });
  const r = await call('/teammates/v1/chat/completions', {
    method: 'POST', session: 'conv-stream',
    body: { messages: [{ role: 'user', content: 'x' }], stream: true },
  });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/event-stream/);
  const text = await r.text();
  const payloads = text.split('\n\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6));
  assert.equal(payloads.at(-1), '[DONE]', 'the stream terminates with [DONE]');
  const parsed = payloads.slice(0, -1).map((p) => JSON.parse(p));
  assert.ok(parsed.every((p) => p.object === 'chat.completion.chunk'));
  assert.equal(parsed.map((p) => p.choices[0].delta.content || '').join(''), 'Streamed answer.');
  assert.equal(parsed.at(-1).choices[0].finish_reason, 'stop');
});

test('response_format reaches Codex as --output-schema', async () => {
  resetArgs();
  await call('/teammates/v1/chat/completions', {
    method: 'POST', session: 'conv-schema',
    body: {
      messages: [{ role: 'user', content: 'x' }],
      response_format: { type: 'json_schema', json_schema: { name: 'plan', schema: { type: 'object' } } },
    },
  });
  assert.match(readArgs().join(' '), /--output-schema/, 'structured output is honoured');
});

// The generator's Concept stage: a system prompt, reference images, a schema
// and the "codex" model name, all in one request. This is the shape that made
// the real CLI exit 1 in production, so the fixture parses like the real one.
test('a generator-shaped turn with images reaches Codex with its prompt intact', async () => {
  resetArgs();
  fixture({ REPLY_TEXT: '{"title":"ok"}' });
  const png = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64');
  const r = await call('/teammates/v1/chat/completions', {
    method: 'POST', session: 'conv-concept',
    body: {
      model: 'codex',
      messages: [
        { role: 'system', content: 'You are the Conceptor.' },
        { role: 'user', content: [
          { type: 'text', text: 'BRIEF: Reformer class promo' },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${png}` } },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${png}` } },
        ] },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'plan', schema: { type: 'object' } } },
    },
  });
  assert.equal(r.status, 200, 'the CLI accepted the arguments');
  assert.equal((await r.json()).choices[0].message.content, '{"title":"ok"}');
  const prompt = fs.readFileSync(path.join(here, 'fake-prompt.txt'), 'utf8');
  assert.match(prompt, /You are the Conceptor\./);
  assert.match(prompt, /BRIEF: Reformer class promo/);
  const args = readArgs().at(-1);
  assert.equal((args.match(/--image=/g) || []).length, 2, 'both images attached');
  assert.ok(!/(^| )-m codex/.test(args), '"codex" is the plan default, not a model id');
});
