import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lrmsmm-message-sync-'));
Object.assign(process.env, { META_MOCK: '1', DATA_DIR: directory, DISABLE_WORKER: '1' });
const { db, run, one } = await import('../src/db.js');
const { createUser } = await import('../src/auth.js');
const { encrypt } = await import('../src/util.js');
const { setAssignments } = await import('../src/services/scope.js');
const { syncUserMessages, messageSyncStatus, getConversation, sendMessage } = await import('../src/services/messages.js');
const owner = createUser({ email: 'owner@example.com', password: 'fixture-password', role: 'owner' });
const first = createUser({ email: 'first@example.com', password: 'fixture-password', role: 'rep' });
const second = createUser({ email: 'second@example.com', password: 'fixture-password', role: 'rep' });
for (const id of ['ig-a', 'ig-b', 'ig-c']) run('INSERT INTO accounts(id,platform,platform_user_id,username,token_enc,status) VALUES(?,?,?,?,?,?)', id, 'instagram', id, id, encrypt('private-fixture-token'), 'active');
setAssignments(first.id, ['ig-a', 'ig-b']);
setAssignments(second.id, ['ig-b']);
const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; db.close(); fs.rmSync(directory, { recursive: true, force: true }); });

let failure = false;
let responseMode = 'normal';
const requested = [];
globalThis.fetch = async url => {
  const pathname = new URL(url).pathname;
  const account = ['ig-a', 'ig-b', 'ig-c'].find(id => pathname.includes(id));
  assert.ok(account, 'Only fixture account requests are expected');
  requested.push(account);
  if (responseMode === 'empty') return new Response(JSON.stringify({ data: [] }));
  if (responseMode === 'invalid-list' || (responseMode === 'invalid-messages' && !pathname.endsWith('/conversations'))) return new Response(JSON.stringify({ unexpected: true }));
  if (failure && account === 'ig-b') return new Response(JSON.stringify({ error: { code: 10, message: 'Private upstream details: private-fixture-token' } }), { status: 400 });
  const body = pathname.endsWith('/conversations')
    ? { data: [{ id: 'conv-' + account, participants: { data: [{ id: account, username: account }, { id: 'peer-' + account, username: 'customer' }] } }] }
    : { messages: { data: [{ id: 'message-' + account, created_time: new Date().toISOString(), from: { id: 'peer-' + account }, message: 'Fixture inbound' }] } };
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
};

test('history reaches past the first page by following Instagram\'s cursors', async () => {
 const { listConversations, conversationMessages } = await import('../src/meta/instagram.js');
 // Graph caps `limit` silently, so depth can only come from paging. Three
 // pages of two, with the third carrying no cursor, proves the client walks
 // them and stops when Instagram says there is no more.
 const pages = new Map();
 const page = (n, rows, hasNext) => ({ data: rows, ...(hasNext ? { paging: { cursors: { after: String(n) }, next: `https://graph.instagram.com/next/${n}` } } : {}) });
 const conv = (i) => ({ id: `c${i}`, updated_time: '2026-11-01T00:00:00+0000', participants: { data: [{ id: 'me' }, { id: `p${i}`, username: `peer${i}` }] } });
 const msg = (i) => ({ id: `m${i}`, created_time: '2026-11-01T00:00:00+0000', from: { id: `p1`, username: 'peer1' }, message: `text ${i}` });
 const asked = [];
 const original = globalThis.fetch;
 globalThis.fetch = async (url) => {
  asked.push(String(url));
  const m = /\/next\/(\d+)/.exec(String(url));
  const n = m ? Number(m[1]) : 0;
  return new Response(JSON.stringify(pages.get(n)), { status: 200, headers: { 'content-type': 'application/json' } });
 };
 try {
  pages.set(0, page(1, [conv(1), conv(2)], true));
  pages.set(1, page(2, [conv(3), conv(4)], true));
  pages.set(2, page(3, [conv(5)], false));
  const all = await listConversations('me', 'tok', { limit: 2, maxPages: 5 });
  assert.deepEqual(all.map(c => c.id), ['c1','c2','c3','c4','c5'], 'every page is walked until the cursor runs out');
  asked.length = 0;
  const capped = await listConversations('me', 'tok', { limit: 2, maxPages: 2 });
  assert.deepEqual(capped.map(c => c.id), ['c1','c2','c3','c4'], 'and the page bound is honoured, so a sync cannot walk an inbox forever');
  assert.equal(asked.length, 2, 'exactly two requests were made');
  // Messages start from the nested field, whose cursor points at the edge.
  pages.set(0, { id: 'c1', messages: page(1, [msg(1), msg(2)], true) });
  pages.set(1, page(2, [msg(3)], false));
  const msgs = await conversationMessages('c1', 'tok', { limit: 2, maxPages: 5 });
  assert.deepEqual(msgs.map(m => m.id), ['m1','m2','m3'], 'older messages arrive from the following pages');
  assert.equal(msgs[0].text, 'text 1', 'and are still mapped, not returned raw');
  pages.set(0, { id: 'c1', messages: page(1, [msg(1), msg(2)], true) });
  const one = await conversationMessages('c1', 'tok', { limit: 2, maxPages: 1 });
  assert.deepEqual(one.map(m => m.id), ['m1','m2'], 'a single page stays a single page');
 } finally { globalThis.fetch = original; }
});

test('two members may share an account, with multiple Instagram assignments and immediate revocation', async () => {
  const result = await syncUserMessages(first);
  assert.equal(result.synced_accounts, 2);
  assert.equal(result.new_messages, 2);
  assert.deepEqual(result.errors, []);
  assert.ok(requested.every(a => a !== 'ig-c'));
  assert.deepEqual(new Set(messageSyncStatus(first).map(a => a.account_id)), new Set(['ig-a', 'ig-b']));
  assert.deepEqual(messageSyncStatus(second).map(a => a.account_id), ['ig-b']);
  const conv = one("SELECT id FROM conversations WHERE account_id='ig-b'").id;
  assert.equal(getConversation(first, conv).account_id, 'ig-b');
  assert.equal(getConversation(second, conv).account_id, 'ig-b');
  await assert.rejects(syncUserMessages(second, 'ig-a'), e => e.status === 404);
  setAssignments(first.id, ['ig-a']);
  assert.throws(() => getConversation(first, conv), e => e.status === 404);
  await assert.rejects(sendMessage(first, conv, 'must not send'), e => e.status === 404);
  assert.equal(getConversation(second, conv).account_id, 'ig-b');
  assert.deepEqual(messageSyncStatus(first).map(a => a.account_id), ['ig-a']);
});

test('permission failures are visible per account without leaking tokens or hiding other successful syncs', async () => {
  failure = true;
  requested.length = 0;
  const result = await syncUserMessages(owner);
  assert.equal(result.synced_accounts, 2);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].account_id, 'ig-b');
  assert.equal(result.errors[0].code, 'permission_missing');
  assert.match(result.errors[0].message, /instagram_business_manage_messages/);
  assert.equal(JSON.stringify(result).includes('private-fixture-token'), false);
  const status = messageSyncStatus(second)[0];
  assert.equal(status.status, 'error');
  assert.ok(status.last_attempt);
  assert.ok(status.last_success, 'Previous successful timestamp is retained');
  failure = false;
  const recovered = await syncUserMessages(second);
  assert.equal(recovered.synced_accounts, 1);
  assert.deepEqual(recovered.errors, []);
  assert.equal(messageSyncStatus(second)[0].status, 'ok');
  assert.equal(messageSyncStatus(second)[0].code, undefined);
});


test('empty Meta inboxes report zero conversations without claiming messages were synced', async () => {
  responseMode = 'empty';
  const result = await syncUserMessages(second);
  const status = result.accounts[0];
  assert.equal(result.new_messages, 0);
  assert.equal(status.status, 'empty');
  assert.equal(status.conversations_found, 0);
  assert.ok(status.messages_stored > 0, 'Existing history is preserved');
  assert.match(status.message, /Connected tools/);
});

test('invalid successful HTTP responses cannot silently become empty inboxes', async () => {
  for (const mode of ['invalid-list', 'invalid-messages']) {
    responseMode = mode;
    const result = await syncUserMessages(second);
    assert.equal(result.errors.length, 1);
    assert.equal(result.accounts[0].status, 'error');
    assert.equal(result.synced_accounts, 0);
  }
  responseMode = 'normal';
});
