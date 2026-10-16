import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lrmsmm-company-migration-'));
const legacy = new DatabaseSync(path.join(directory, 'lrmsmm.db'));
legacy.exec(`CREATE TABLE accounts (
 id TEXT PRIMARY KEY, platform TEXT NOT NULL, platform_user_id TEXT NOT NULL,
 username TEXT, name TEXT, avatar_url TEXT, token_enc TEXT NOT NULL,
 token_expires_at TEXT, token_issued_at TEXT, status TEXT NOT NULL DEFAULT 'active',
 last_error TEXT, followers_count INTEGER, connected_by TEXT, created_at TEXT, updated_at TEXT,
 UNIQUE(platform, platform_user_id)
);
INSERT INTO accounts(id,platform,platform_user_id,username,name,token_enc)
 VALUES('legacy-account','instagram','1234','legacy-brand','Existing Brand','preserve-encrypted-token');`);
legacy.close();
Object.assign(process.env, { META_MOCK: '1', DATA_DIR: directory, DISABLE_WORKER: '1' });
const { db, one, run } = await import('../src/db.js');
const { createUser } = await import('../src/auth.js');
const { setAssignments, scopeOf, setCompanyAssignments } = await import('../src/services/scope.js');
after(() => { db.close(); fs.rmSync(directory, { recursive: true, force: true }); });
test('additive company migration preserves legacy accounts, encrypted credentials and direct grants', () => {
  const account = one('SELECT * FROM accounts WHERE id=?', 'legacy-account');
  assert.equal(account.name, 'Existing Brand');
  assert.equal(account.token_enc, 'preserve-encrypted-token');
  assert.equal(account.company_id, null);
  const member = createUser({ email: 'migration@fixture.id', password: 'fixture-password', role: 'rep' });
  setAssignments(member.id, [account.id]);
  run("INSERT INTO companies(id,name) VALUES('company','Existing Company')");
  run("UPDATE accounts SET company_id='company' WHERE id='legacy-account'");
  assert.deepEqual(scopeOf(member), [account.id]);
  setCompanyAssignments(member.id, ['company']);
  setAssignments(member.id, []);
  assert.deepEqual(scopeOf(member), [account.id]);
  setCompanyAssignments(member.id, []);
  assert.deepEqual(scopeOf(member), []);
  assert.equal(one('SELECT token_enc FROM accounts WHERE id=?', account.id).token_enc, 'preserve-encrypted-token');
});
