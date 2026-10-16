import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lrmsmm-closed-setup-'));
Object.assign(process.env, {
  NODE_ENV: 'production', ENCRYPTION_KEY: 'a'.repeat(64), META_MOCK: '0',
  ALLOW_INITIAL_SETUP: '0', ALLOW_SIGNUP: '0', DATA_DIR: data, DISABLE_WORKER: '1',
});
const { app } = await import('../src/server.js');
test('empty production installation has no public owner registration', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const state = await (await fetch(base + '/auth/state')).json();
    assert.equal(state.needs_setup, false);
    assert.equal(state.signup_open, false);
    const response = await fetch(base + '/auth/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'attacker@example.com', password: 'not-a-real-password' }),
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, 'signup_closed');
    const health = await (await fetch(base + '/healthz')).json();
    assert.deepEqual(health, { ok: true, mock: false });
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(data, { recursive: true, force: true });
  }
});
