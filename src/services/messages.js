// Direct messages inbox (Instagram). Threads has no messaging API.
import { one, all, run, id, now, kvGet, kvSet } from '../db.js';
import { err, parseJSON } from '../util.js';
import { clients, tokenOf, markExpired, getAccount } from './accounts.js';
import { assertAccount, scopeSql } from './scope.js';
import { emit } from './events.js';
import { config } from '../config.js';

export const MESSAGING_PLATFORMS = ['instagram'];
const WINDOW_MS = 24 * 3600_000;

function upsertConversation(acc, c) {
  const peer = c.participants.find((p) => p.id !== acc.platform_user_id && p.username?.toLowerCase() !== acc.username?.toLowerCase()) || c.participants[0] || {};
  let row = one('SELECT * FROM conversations WHERE account_id=? AND platform_conversation_id=?', acc.id, c.id);
  if (!row) {
    const cid = id('cv');
    run('INSERT INTO conversations(id,account_id,platform,platform_conversation_id,participant_id,participant_username,participant_name) VALUES(?,?,?,?,?,?,?)',
      cid, acc.id, acc.platform, c.id, peer.id || null, peer.username || null, peer.name || null);
    row = one('SELECT * FROM conversations WHERE id=?', cid);
    row._new = true;
  } else if (peer.username && peer.username !== row.participant_username) {
    run('UPDATE conversations SET participant_username=?, participant_id=COALESCE(participant_id, ?) WHERE id=?', peer.username, peer.id, row.id);
  }
  return row;
}

function storeMessages(acc, conv, msgs) {
  let newInbound = 0;
  for (const m of msgs) {
    const dir = m.from_id === acc.platform_user_id || (m.from_username && m.from_username.toLowerCase() === acc.username?.toLowerCase()) ? 'out' : 'in';
    const r = run('INSERT OR IGNORE INTO messages(id,conversation_id,platform_message_id,direction,text,attachments,sent_at) VALUES(?,?,?,?,?,?,?)',
      id('msg'), conv.id, m.id, dir, m.text || '', m.attachments?.length ? JSON.stringify(m.attachments) : null, m.created_time || now());
    if (r.changes && dir === 'in') newInbound++;
  }
  refreshConversation(conv.id);
  if (newInbound) {
    run("UPDATE conversations SET status='open' WHERE id=? AND last_direction='in'", conv.id);
    emit('message.new', { account_id: acc.id, conversation_id: conv.id, count: newInbound });
  }
  return newInbound;
}

function refreshConversation(convId) {
  const last = one('SELECT * FROM messages WHERE conversation_id=? ORDER BY sent_at DESC, rowid DESC LIMIT 1', convId);
  const lastIn = one("SELECT sent_at FROM messages WHERE conversation_id=? AND direction='in' ORDER BY sent_at DESC LIMIT 1", convId);
  if (!last) return;
  run('UPDATE conversations SET last_message_at=?, last_message_text=?, last_direction=?, last_inbound_at=?, updated_at=? WHERE id=?',
    last.sent_at, (last.text || (last.attachments ? "[attachment]" : '')).slice(0, 300), last.direction, lastIn?.sent_at || null, now(), convId);
}

function syncErrorMessage(code) {
  if (code === 'invalid_response') return "Instagram returned an invalid conversation or message list. Synchronization has not succeeded.";
  if (code === 'permission_missing') return "DM permission has not been granted. Reconnect Instagram and allow instagram_business_manage_messages. In Instagram enable Messages > Connected tools > Allow access to messages.";
  if (code === 'account_expired') return "Instagram token has expired. Reconnect this account.";
  if (code === 'rate_limited') return "Instagram request limit reached. Wait and try again.";
  return "Instagram could not synchronize DMs. Check messaging permissions and the account connection, then try again.";
}

export function messageSyncStatus(user) {
  const [where, params] = scopeSql(user, 'id');
  return all(`SELECT id, username, status FROM accounts WHERE platform='instagram' AND status!='disconnected' AND ${where}`, ...params).map(a => ({
    account_id: a.id, username: a.username,
    ...parseJSON(kvGet(`messages-sync:${a.id}`), { status: 'never', last_attempt: null, last_success: null }),
    ...(a.status !== 'active' ? { status: 'error', code: 'account_expired', message: syncErrorMessage('account_expired') } : {}),
  }));
}

export async function syncAccountMessages(acc, { onlyConversationIds, throwOnError = false } = {}) {
  if (!MESSAGING_PLATFORMS.includes(acc.platform) || acc.status !== 'active') return 0;
  const ig = clients.instagram;
  let n = 0;
  let fetched = 0;
  const previous = parseJSON(kvGet(`messages-sync:${acc.id}`), {});
  const attempted = now();
  try {
    const token = tokenOf(acc);
    const convs = await ig.listConversations(acc.platform_user_id, token, 25);
    for (const c of convs) {
      if (onlyConversationIds && !onlyConversationIds.includes(c.id)) continue;
      const row = upsertConversation(acc, c);
      if (!row._new && row.last_message_at && c.updated_time && new Date(c.updated_time) <= new Date(row.last_message_at)) continue;
      const messages = await ig.conversationMessages(c.id, token, 25);
      fetched += messages.length;
      n += storeMessages(acc, row, messages);
    }
    const stored = one('SELECT COUNT(*) n FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.account_id=?', acc.id).n;
    const empty = !convs.length || (!fetched && !stored);
    kvSet(`messages-sync:${acc.id}`, JSON.stringify({
      status: empty ? 'empty' : 'ok', last_attempt: attempted, last_success: now(), new_messages: n,
      conversations_found: convs.length, messages_fetched: fetched, messages_stored: stored,
      ...(empty ? { message: `Meta returned ${convs.length} conversations; ${stored} messages saved. If Instagram has DMs, check Connected tools > Allow access to messages and app permissions, then try receiving a new message.` } : {}),
    }));
  } catch (e) {
    if (e.code === 'account_expired') markExpired(acc.id, syncErrorMessage('account_expired'));
    const code = ['permission_missing', 'account_expired', 'rate_limited', 'invalid_response'].includes(e.code) ? e.code : 'platform_error';
    const metaCode = Number(e.raw?.code);
    const message = syncErrorMessage(code) + (Number.isInteger(metaCode) && metaCode > 0 ? ` (Meta code ${metaCode})` : '');
    kvSet(`messages-sync:${acc.id}`, JSON.stringify({ status: 'error', code, message, last_attempt: attempted, last_success: previous.last_success || null, new_messages: n }));
    console.warn(`[messages] @${acc.username}: ${code}`);
    if (throwOnError) throw err(422, code, message, { account_id: acc.id, new_messages: n });
  }
  return n;
}

export async function syncUserMessages(user, accountId) {
  if (accountId !== undefined && (typeof accountId !== 'string' || !accountId.trim())) throw err(400, 'validation_failed', "account_id must be an Instagram account ID.");
  if (accountId) assertAccount(user, accountId);
  const [where, params] = scopeSql(user, 'id');
  const rows = all(`SELECT * FROM accounts WHERE platform='instagram' AND status!='disconnected' AND ${where}${accountId ? ' AND id=?' : ''}`, ...params, ...(accountId ? [accountId] : []));
  let n = 0, synced = 0;
  const errors = [];
  for (const account of rows) {
    if (account.status !== 'active') {
      errors.push({ account_id: account.id, username: account.username, code: 'account_expired', message: syncErrorMessage('account_expired') });
      continue;
    }
    try { n += await syncAccountMessages(account, { throwOnError: true }); synced++; }
    catch (error) {
      n += error.details?.new_messages || 0;
      errors.push({ account_id: account.id, username: account.username, code: error.code, message: error.message });
    }
  }
  return { new_messages: n, synced_accounts: synced, errors, accounts: messageSyncStatus(user).filter(a => !accountId || a.account_id === accountId) };
}

export async function syncAllMessages() {
  let n = 0;
  for (const a of all("SELECT * FROM accounts WHERE status='active' AND platform IN ('instagram')")) n += await syncAccountMessages(a);
  return n;
}

const minutesSince = (iso) => (iso ? Math.floor((Date.now() - new Date(iso)) / 60000) : null);

export function publicConversation(c) {
  const a = one('SELECT username, platform FROM accounts WHERE id=?', c.account_id);
  const waiting = c.status === 'open' && c.last_direction === 'in';
  return {
    id: c.id, account_id: c.account_id, account_username: a?.username, platform: c.platform,
    participant: { id: c.participant_id, username: c.participant_username, name: c.participant_name },
    last_message: { text: c.last_message_text, at: c.last_message_at, direction: c.last_direction },
    status: c.status, needs_reply: waiting,
    waiting_minutes: waiting ? minutesSince(c.last_inbound_at) : null,
    can_reply: !!c.last_inbound_at && Date.now() - new Date(c.last_inbound_at) < WINDOW_MS,
    reply_window_ends_at: c.last_inbound_at ? new Date(new Date(c.last_inbound_at).getTime() + WINDOW_MS).toISOString() : null,
  };
}

export function listConversations(user, { account_id, filter = 'needs_reply', limit = 50 } = {}) {
  limit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const [w, p] = scopeSql(user, 'account_id');
  const where = [w]; const params = [...p];
  if (account_id) { assertAccount(user, account_id); where.push('account_id=?'); params.push(account_id); }
  if (filter === 'needs_reply') where.push("status='open' AND last_direction='in'");
  else if (filter === 'done') where.push("status='done'");
  where.push('last_message_at IS NOT NULL');
  return { data: all(`SELECT * FROM conversations WHERE ${where.join(' AND ')} ORDER BY last_message_at DESC LIMIT ?`, ...params, limit).map(publicConversation) };
}

function getConv(user, convId) {
  const c = one('SELECT * FROM conversations WHERE id=?', convId);
  if (!c) throw err(404, 'not_found', `Conversation ${convId} not found`);
  assertAccount(user, c.account_id);
  return c;
}

export function getConversation(user, convId, { limit = 100 } = {}) {
  const c = getConv(user, convId);
  const msgs = all('SELECT m.*, u.email AS sent_by_email, u.name AS sent_by_name FROM messages m LEFT JOIN users u ON u.id=m.sent_by WHERE conversation_id=? ORDER BY sent_at DESC, m.rowid DESC LIMIT ?', c.id, Math.min(Number(limit) || 100, 200)).reverse();
  return {
    ...publicConversation(c),
    messages: msgs.map((m) => ({ id: m.id, direction: m.direction, text: m.text, attachments: parseJSON(m.attachments, []), sent_at: m.sent_at, sent_by: m.sent_by ? (m.sent_by_name || m.sent_by_email) : null })),
  };
}

export async function sendMessage(user, convId, text) {
  text = String(text || '').trim();
  if (!text) throw err(400, 'validation_failed', "Message must not be empty.");
  if ([...text].length > 1000) throw err(400, 'validation_failed', "Instagram messages must not exceed 1,000 characters.");
  const c = getConv(user, convId);
  const acc = getAccount(c.account_id);
  if (acc.status !== 'active') throw err(422, 'account_expired', `Account @${acc.username} needs to be reconnected`, { account_id: acc.id });
  if (!c.last_inbound_at || Date.now() - new Date(c.last_inbound_at) > WINDOW_MS) {
    throw err(422, 'messaging_window_closed', "Instagram only allows replies within 24 hours of the customer's last message. Reply directly in the Instagram app.", { conversation_id: c.id });
  }
  let r;
  try { r = await clients.instagram.sendMessage(acc.platform_user_id, c.participant_id, text, tokenOf(acc)); }
  catch (e) {
    if (e.code === 'account_expired') { markExpired(acc.id, e.message); throw err(422, 'account_expired', `Account @${acc.username} needs to be reconnected`); }
    if (e.code === 'messaging_window_closed') throw err(422, 'messaging_window_closed', 'Di luar jendela 24 jam Instagram. Balas langsung dari aplikasi Instagram.');
    if (e.code === 'permission_missing') throw err(422, 'permission_missing', `Instagram messaging permission has not been granted: ${e.message}`);
    throw err(502, 'platform_error', e.message);
  }
  run('INSERT OR IGNORE INTO messages(id,conversation_id,platform_message_id,direction,text,sent_at,sent_by) VALUES(?,?,?,?,?,?,?)', id('msg'), c.id, r.id, 'out', text, now(), user.id);
  refreshConversation(c.id);
  emit('message.sent', { account_id: acc.id, conversation_id: c.id });
  return getConversation(user, c.id);
}

export function setConversationStatus(user, convId, status) {
  if (!['open', 'done'].includes(status)) throw err(400, 'validation_failed', "status must be open or done.");
  const c = getConv(user, convId);
  run('UPDATE conversations SET status=? WHERE id=?', status, c.id);
  emit('message.status', { account_id: c.account_id, conversation_id: c.id });
  return publicConversation(one('SELECT * FROM conversations WHERE id=?', c.id));
}

/** Conversations waiting for a reply longer than N seconds (default 5 minutes). */
export function unrepliedSummary(user, olderThanSec = config.unrepliedAlertSeconds) {
  const [w, p] = scopeSql(user, 'account_id');
  const cutoff = new Date(Date.now() - olderThanSec * 1000).toISOString();
  const rows = all(`SELECT * FROM conversations WHERE ${w} AND status='open' AND last_direction='in' AND last_inbound_at < ? ORDER BY last_inbound_at`, ...p, cutoff);
  const total = one(`SELECT COUNT(*) n FROM conversations WHERE ${w} AND status='open' AND last_direction='in'`, ...p).n;
  return { overdue: rows.length, waiting: total, threshold_seconds: olderThanSec, oldest: rows[0] ? publicConversation(rows[0]) : null };
}
