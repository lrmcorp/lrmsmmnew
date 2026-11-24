// The login terminal end to end, the way production now carries it:
//   browser --HTTP (SSE + POST)--> application --WebSocket--> bridge --pty--> codex
// Real application routes, the real bridge and a real pty; only the Codex binary
// is a fake, so no ChatGPT account, network call or spend is involved.
//
// The browser used to open the WebSocket itself, and the reverse proxy in front
// of production dropped the upgrade. This test proves the replacement path works
// without the browser ever speaking WebSocket.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'console-terminal-'));
// A private fixture: it prints a device code, then waits for one line of input.
// It does not share files with the other bridge tests, which run in parallel.
const fake = path.join(tmp, 'codex');
fs.writeFileSync(fake, `#!/usr/bin/env bash
if [ "$1" = "login" ] && [ "$2" = "--device-auth" ]; then
  echo "Open https://auth.example.test/codex/device and enter ABCD-1234"
  read -r line
  echo "got: $line"
  exit 0
fi
if [ "$1" = "login" ] && [ "$2" = "status" ]; then echo "Not logged in"; exit 0; fi
exit 0
`);
fs.chmodSync(fake, 0o755);

const TOKEN = crypto.randomBytes(24).toString('hex');
Object.assign(process.env, {
  INTERNAL_TOKEN: TOKEN, CODEX_BIN: fake, WORK_DIR: path.join(tmp, 'work'), PORT: '0',
  // Deliberately unlike anything the application could send: production sets
  // this to the public URL, and a server-side client must pass without it.
  CONSOLE_ORIGIN: 'https://console.example.test',
});
const { server: bridge } = await import('../src/server.js');
await new Promise((r) => (bridge.listening ? r() : bridge.once('listening', r)));

Object.assign(process.env, {
  DATA_DIR: path.join(tmp, 'data'), META_MOCK: '1', DISABLE_WORKER: '1', ALLOW_INITIAL_SETUP: '1',
  ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
  PLANS_BRIDGE_URL: `http://127.0.0.1:${bridge.address().port}/teammates/v1`,
  PLANS_BRIDGE_TOKEN: TOKEN,
});
const { app } = await import('../../src/server.js');
const server = app.listen(0);
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;
after(() => { server.close(); bridge.close(); });

let owner = '', rep = '';
before(async () => {
  const reg = await fetch(`${base}/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'owner@example.test', password: 'rahasia123', name: 'Owner' }) });
  owner = (reg.headers.get('set-cookie') || '').split(';')[0];
  const { createUser } = await import('../../src/auth.js');
  createUser({ email: 'rep@example.test', password: 'rahasia123', name: 'Rep', role: 'rep' });
  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'rep@example.test', password: 'rahasia123' }) });
  rep = (login.headers.get('set-cookie') || '').split(';')[0];
});

const call = (method, p, cookie, body) => fetch(base + p, {
  method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
});

/** Read an SSE response until `done(text)` is true or the deadline passes. */
async function readUntil(reader, state, done, ms = 8000) {
  const deadline = Date.now() + ms;
  const decoder = new TextDecoder();
  while (!done(state.text)) {
    if (Date.now() > deadline) throw new Error(`timed out; stream so far:\n${state.text}`);
    const { value, done: ended } = await Promise.race([
      reader.read(),
      new Promise((r) => setTimeout(() => r({ value: undefined, done: false }), 250)),
    ]);
    if (ended) break;
    if (value) {
      state.raw += decoder.decode(value, { stream: true });
      // Reassemble the terminal text from data frames, as the page does.
      state.text = state.raw.split('\n\n').filter((f) => f.startsWith('event: data'))
        .map((f) => { try { return JSON.parse(f.slice(f.indexOf('data: ') + 6)); } catch { return ''; } }).join('');
    }
  }
  return state.text;
}

test('the Owner signs in through plain HTTP: the code appears and typing reaches the CLI', async () => {
  const open = await call('POST', '/v1/ai-plans/terminals', owner, { cmd: 'login' });
  assert.equal(open.status, 201, `opening a terminal: ${await open.clone().text()}`);
  const { id } = await open.json();

  const stream = await call('GET', `/v1/ai-plans/terminals/${id}/stream`, owner);
  assert.equal(stream.status, 200);
  assert.match(stream.headers.get('content-type'), /text\/event-stream/);
  assert.equal(stream.headers.get('x-accel-buffering'), 'no', 'nginx must not buffer the stream');
  const reader = stream.body.getReader();
  const state = { raw: '', text: '' };

  await readUntil(reader, state, (t) => /ABCD-1234/.test(t));
  assert.match(state.text, /auth\.example\.test\/codex\/device/, 'the device link reaches the browser');

  const sent = await call('POST', `/v1/ai-plans/terminals/${id}/input`, owner, { data: 'hello\r' });
  assert.equal(sent.status, 200, 'keystrokes are accepted');
  await readUntil(reader, state, (t) => /got: hello/.test(t));

  await readUntil(reader, state, () => /event: end/.test(state.raw));
  reader.cancel().catch(() => {});
});

test('a representative cannot open a terminal', async () => {
  assert.equal((await call('POST', '/v1/ai-plans/terminals', rep, { cmd: 'login' })).status, 403);
});

test("one user cannot read or type into another's terminal", async () => {
  const { id } = await (await call('POST', '/v1/ai-plans/terminals', owner, { cmd: 'login' })).json();
  assert.equal((await call('GET', `/v1/ai-plans/terminals/${id}/stream`, rep)).status, 403, 'a representative is refused outright');
  assert.equal((await call('POST', `/v1/ai-plans/terminals/${id}/input`, rep, { data: 'x' })).status, 403);
  assert.equal((await call('DELETE', `/v1/ai-plans/terminals/${id}`, owner)).status, 200, 'the owner can close it');
  assert.equal((await call('GET', `/v1/ai-plans/terminals/${id}/stream`, owner)).status, 404, 'and it is gone');
});

test('the browser no longer has a WebSocket path or a ticket endpoint to reach', async () => {
  assert.notEqual((await call('POST', '/v1/ai-plans/terminal-ticket', owner, {})).status, 200);
  // fetch refuses to set Upgrade headers, so the handshake is sent raw.
  const { default: http } = await import('node:http');
  const status = await new Promise((resolve) => {
    const req = http.get(`${base}/teammates/terminal`, { headers: {
      cookie: owner, connection: 'Upgrade', upgrade: 'websocket',
      'sec-websocket-version': '13', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
    } });
    req.on('upgrade', (res, socket) => { socket.destroy(); resolve(101); });
    req.on('response', (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', () => resolve(0));
  });
  assert.notEqual(status, 101, 'no WebSocket is accepted from the browser side');
});
