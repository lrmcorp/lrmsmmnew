// The browser's path to the plans bridge.
//
// The bridge publishes no port and the shared reverse proxy has no rule for it,
// so the application forwards the two browser-facing paths itself. These checks
// cover who may use that path and, just as importantly, what it must not
// forward: the bridge's own API is guarded by an internal bearer token that a
// browser does not carry, so it must never be reachable this way.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';

// A stand-in for the bridge, so this needs no container and no Codex.
let upstreamHits = [];
const upstream = http.createServer((req, res) => {
  upstreamHits.push(req.url);
  if (req.url.startsWith('/teammates/assets/')) {
    res.writeHead(200, { 'content-type': 'application/javascript' });
    return res.end('/* terminal widget */');
  }
  res.writeHead(404).end();
});
await new Promise((r) => upstream.listen(0, '127.0.0.1', r));

Object.assign(process.env, {
  DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'lrmsmm-pxy-')),
  META_MOCK: '1',
  DISABLE_WORKER: '1',
  ALLOW_INITIAL_SETUP: '1',
  ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
  PLANS_BRIDGE_URL: `http://127.0.0.1:${upstream.address().port}/teammates/v1`,
  PLANS_BRIDGE_TOKEN: 'internal-token-for-the-bridge-0123',
});

const { app } = await import('../src/server.js');
const server = app.listen(0);
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;
after(() => { server.close(); upstream.close(); });

let ownerCookie = '', repCookie = '';
const call = (p, cookie) => fetch(base + p, { headers: cookie ? { cookie } : {}, redirect: 'manual' });

before(async () => {
  const sign = async (body) => {
    const r = await fetch(`${base}/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    return (r.headers.get('set-cookie') || '').split(';')[0];
  };
  // The first registration becomes the Owner; the plan is theirs alone.
  ownerCookie = await sign({ email: 'owner@example.test', password: 'rahasia123', name: 'Owner' });
  const { createUser } = await import('../src/auth.js');
  createUser({ email: 'rep@example.test', password: 'rahasia123', name: 'Rep', role: 'rep' });
  const login = await fetch(`${base}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'rep@example.test', password: 'rahasia123' }),
  });
  repCookie = (login.headers.get('set-cookie') || '').split(';')[0];
});

test('the Owner gets the terminal widget through the application', async () => {
  upstreamHits = [];
  const r = await call('/teammates/assets/vendor/xterm.js', ownerCookie);
  assert.equal(r.status, 200, 'the asset is served');
  assert.match(await r.text(), /terminal widget/, 'and it came from the bridge');
  assert.deepEqual(upstreamHits, ['/teammates/assets/vendor/xterm.js'], 'forwarded once, path intact');
});

test('a representative is refused', async () => {
  upstreamHits = [];
  assert.equal((await call('/teammates/assets/vendor/xterm.js', repCookie)).status, 403);
  assert.deepEqual(upstreamHits, [], 'and the request never reaches the bridge');
});

test('an unauthenticated visitor is refused', async () => {
  upstreamHits = [];
  assert.equal((await call('/teammates/assets/vendor/xterm.js', '')).status, 403);
  assert.deepEqual(upstreamHits, [], 'nothing is forwarded');
});

test("the bridge's own API is not reachable from a browser", async () => {
  upstreamHits = [];
  // It is guarded by an internal bearer token the browser does not have, so
  // exposing it here would hand an unauthenticated caller the plan itself.
  for (const p of ['/teammates/v1/models', '/teammates/v1/chat/completions', '/teammates/v1/status']) {
    const r = await call(p, ownerCookie);
    assert.notEqual(r.status, 200, `${p} is not proxied`);
  }
  assert.deepEqual(upstreamHits, [], 'not one of them reached the bridge');
});

test('the asset path cannot be used to reach anything else', async () => {
  upstreamHits = [];
  for (const p of ['/teammates/assets/../v1/models', '/teammates/assets/..%2f..%2fetc%2fpasswd']) {
    const r = await call(p, ownerCookie);
    assert.notEqual(r.status, 200, `${p} is refused`);
  }
  assert.ok(!upstreamHits.some((u) => u.includes('/v1/')), 'nothing walked out of the asset path');
});
