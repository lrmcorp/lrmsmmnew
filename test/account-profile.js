import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lrmsmm-profile-'));
Object.assign(process.env, { META_MOCK: '1', DATA_DIR: directory, DISABLE_WORKER: '1' });
const { db, one, run } = await import('../src/db.js');
const { createUser } = await import('../src/auth.js');
const { beginConnect, finishConnect, tokenOf, refreshAccountProfile } = await import('../src/services/accounts.js');
const user = createUser({ email: 'fixture@example.com', password: 'fixture-only-password', role: 'owner' });
const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; db.close(); fs.rmSync(directory, { recursive: true, force: true }); });

for (const platform of ['instagram', 'threads']) {
  test(`${platform}: omitted optional Meta profile fields can be saved and reconnected`, async () => {
    let profile = platform === 'instagram'
      ? { user_id: '12345', username: 'fixturebrand' }
      : { id: '67890', username: 'fixturebrand' };
    globalThis.fetch = async (url) => {
      const pathname = new URL(url).pathname;
      assert.ok(pathname.endsWith('/me') || pathname.endsWith('/access_token'), 'Only token and profile requests are expected');
      const body = pathname.endsWith('/me') ? profile : { access_token: 'fixture-token', expires_in: 3600 };
      return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    };
    async function connect() {
      const state = new URL(beginConnect(platform, user.id)).searchParams.get('state');
      return finishConnect(platform, 'fixture-code', state);
    }
    try {
      const first = await connect();
      assert.equal(first.reconnected, false);
      assert.equal(first.account.name, null);
      assert.equal(first.account.avatar_url, null);
      assert.equal(first.account.followers_count, null);
      assert.equal(tokenOf(one('SELECT * FROM accounts WHERE id=?', first.account.id)), 'fixture-token');
      profile = { ...profile, name: 'Fixture Brand', followers_count: 0,
        profile_picture_url: 'https://example.com/ig.jpg', threads_profile_picture_url: 'https://example.com/th.jpg' };
      const populated = await connect();
      assert.equal(populated.account.id, first.account.id);
      assert.equal(populated.account.name, 'Fixture Brand');
      if (platform === 'instagram') assert.equal(populated.account.followers_count, 0);
      delete profile.name;
      delete profile.profile_picture_url;
      delete profile.threads_profile_picture_url;
      delete profile.followers_count;
      const reconnected = await connect();
      assert.equal(reconnected.reconnected, true);
      assert.equal(reconnected.account.id, first.account.id);
      assert.equal(reconnected.account.name, null);
      assert.equal(reconnected.account.avatar_url, null);
      // An absent follower count must preserve an existing known zero value.
      if (platform === 'instagram') assert.equal(reconnected.account.followers_count, 0);
      assert.equal(one('SELECT COUNT(*) n FROM accounts WHERE platform=?', platform).n, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
}


test('existing connected profiles refresh their name and photo without losing company or token', async () => {
  const account = one("SELECT * FROM accounts WHERE platform='instagram'");
  run("INSERT INTO companies(id,name) VALUES('profile-company','Profile Company')");
  run('UPDATE accounts SET company_id=? WHERE id=?', 'profile-company', account.id);
  globalThis.fetch = async () => new Response(JSON.stringify({ user_id: account.platform_user_id, username: account.username,
    name: 'Updated Brand', profile_picture_url: 'https://example.com/profile.jpg', followers_count: 42 }));
  try {
    const result = await refreshAccountProfile(account.id);
    assert.equal(result.name, 'Updated Brand');
    assert.equal(result.avatar_url, 'https://example.com/profile.jpg');
    assert.equal(result.company_id, 'profile-company');
    assert.equal(one('SELECT token_enc FROM accounts WHERE id=?', account.id).token_enc, account.token_enc);
  } finally { globalThis.fetch = originalFetch; }
});

test('a profile for a different Instagram identity cannot replace an existing account', async () => {
  const account = one("SELECT * FROM accounts WHERE platform='instagram'");
  globalThis.fetch = async () => new Response(JSON.stringify({ user_id: 'wrong-identity', username: 'wrong-user', name: 'Wrong Brand' }));
  try {
    await assert.rejects(refreshAccountProfile(account.id), error => error.code === 'profile_mismatch');
    assert.equal(one('SELECT name FROM accounts WHERE id=?', account.id).name, account.name);
  } finally { globalThis.fetch = originalFetch; }
});
