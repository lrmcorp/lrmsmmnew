// Comments inbox + insights (sync from platforms, reply/hide, metrics).
import { one, all, run, id, now } from '../db.js';
import { err, parseJSON } from '../util.js';
import { clients, tokenOf, markExpired, getAccount } from './accounts.js';
import { assertAccount, scopeSql } from './scope.js';
import { emit } from './events.js';

// ---------------- comments ----------------
function upsertComment(acc, c, mediaId, targetId) {
  const own = c.own || (c.username && acc.username && c.username.toLowerCase() === acc.username.toLowerCase());
  const ex = one('SELECT id FROM comments WHERE platform=? AND platform_comment_id=?', acc.platform, c.id);
  if (ex) {
    run('UPDATE comments SET text=?, hidden=?, fetched_at=? WHERE id=?', c.text ?? null, c.hidden ? 1 : 0, now(), ex.id);
  } else {
    run(`INSERT INTO comments(id,account_id,target_id,platform,platform_comment_id,platform_media_id,parent_platform_id,username,text,commented_at,hidden,from_self,reply_status)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id('c'), acc.id, targetId, acc.platform, c.id, mediaId, c.parent_id, c.username, c.text ?? null, c.timestamp || now(), c.hidden ? 1 : 0, own ? 1 : 0, own ? 'replied' : 'unreplied');
  }
  if (own && c.parent_id) run("UPDATE comments SET reply_status='replied' WHERE platform=? AND platform_comment_id=? AND reply_status='unreplied'", acc.platform, c.parent_id);
  return !ex && !own;
}

export async function syncAccountComments(acc) {
  const token = tokenOf(acc);
  const c = clients[acc.platform];
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const mediaIds = new Map();
  for (const t of all("SELECT id, platform_post_id FROM post_targets WHERE account_id=? AND status='published' AND published_at > ? AND platform_post_id IS NOT NULL", acc.id, since)) {
    mediaIds.set(t.platform_post_id, t.id);
  }
  try { for (const m of await c.recentMedia(acc.platform_user_id, token, 15)) if (!mediaIds.has(m.id)) mediaIds.set(m.id, null); }
  catch (e) { if (e.code === 'account_expired') { markExpired(acc.id, e.message); return 0; } }
  let n = 0, fresh = 0;
  for (const [mid, tid] of mediaIds) {
    try {
      const list = acc.platform === 'instagram' ? await c.listComments(mid, token) : await c.listReplies(mid, token);
      for (const cm of list) { if (upsertComment(acc, cm, mid, tid)) fresh++; n++; }
    } catch (e) {
      if (e.code === 'account_expired') { markExpired(acc.id, e.message); return n; }
      if (e.code !== 'permission_missing') console.warn(`[comments] ${acc.username}/${mid}: ${e.message}`);
    }
  }
  if (fresh) emit('comment.new', { account_id: acc.id, count: fresh });
  return n;
}

export async function syncAllComments() {
  let n = 0;
  for (const a of all("SELECT * FROM accounts WHERE status='active'")) n += await syncAccountComments(a);
  return n;
}

export function publicComment(c) {
  const a = one('SELECT username, platform FROM accounts WHERE id=?', c.account_id);
  const post = c.target_id ? one('SELECT post_id FROM post_targets WHERE id=?', c.target_id) : null;
  return {
    id: c.id, account_id: c.account_id, account_username: a?.username, platform: c.platform, post_id: post?.post_id || null,
    platform_media_id: c.platform_media_id, parent_id: c.parent_platform_id ? one('SELECT id FROM comments WHERE platform=? AND platform_comment_id=?', c.platform, c.parent_platform_id)?.id || null : null,
    username: c.username, text: c.text, commented_at: c.commented_at, hidden: !!c.hidden, reply_status: c.reply_status, from_self: !!c.from_self,
  };
}

export function listComments({ account_id, post_id, reply_status, include_own = false, limit = 50, cursor } = {}, user) {
  limit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const where = ['1=1']; const p = [];
  if (user) { const [w, sp] = scopeSql(user, 'account_id'); where.push(w); p.push(...sp); }
  if (account_id) { where.push('account_id=?'); p.push(account_id); }
  if (post_id) { where.push('target_id IN (SELECT id FROM post_targets WHERE post_id=?)'); p.push(post_id); }
  if (reply_status === 'hidden') where.push('hidden=1');
  else if (reply_status && reply_status !== 'all') { where.push('reply_status=?'); p.push(reply_status); }
  if (!include_own) where.push('from_self=0');
  if (cursor) { where.push('commented_at < ?'); p.push(cursor); }
  const rows = all(`SELECT * FROM comments WHERE ${where.join(' AND ')} ORDER BY commented_at DESC LIMIT ?`, ...p, limit + 1);
  const more = rows.length > limit; const page = rows.slice(0, limit);
  return { data: page.map(publicComment), next_cursor: more ? page.at(-1).commented_at : null };
}

function getComment(cid, user) {
  const c = one('SELECT * FROM comments WHERE id=?', cid);
  if (!c) throw err(404, 'not_found', `Komentar ${cid} tidak ditemukan`);
  if (user) assertAccount(user, c.account_id);
  return c;
}

export async function replyToComment(cid, message, user) {
  if (!message || !String(message).trim()) throw err(400, 'validation_failed', 'Teks balasan wajib diisi');
  const c = getComment(cid, user);
  const acc = getAccount(c.account_id);
  if (acc.status !== 'active') throw err(422, 'account_expired', `Akun @${acc.username} perlu disambungkan ulang`);
  const token = tokenOf(acc);
  if (c.platform === 'threads' && [...message].length > 500) throw err(400, 'caption_too_long', 'Threads maksimal 500 karakter');
  let r;
  try {
    r = acc.platform === 'instagram'
      ? await clients.instagram.replyComment(c.platform_comment_id, message, token)
      : await clients.threads.replyComment(c.platform_comment_id, message, { userId: acc.platform_user_id, token });
  } catch (e) { throw platformToApi(e, acc); }
  run(`INSERT OR IGNORE INTO comments(id,account_id,target_id,platform,platform_comment_id,platform_media_id,parent_platform_id,username,text,commented_at,from_self,reply_status)
       VALUES(?,?,?,?,?,?,?,?,?,?,1,'replied')`, id('c'), acc.id, c.target_id, c.platform, String(r.id), c.platform_media_id, c.platform_comment_id, acc.username, message, now());
  run("UPDATE comments SET reply_status='replied' WHERE id=?", c.id);
  return { ok: true, reply_id: String(r.id), comment: publicComment(one('SELECT * FROM comments WHERE id=?', c.id)) };
}

export async function hideComment(cid, hidden, user) {
  const c = getComment(cid, user);
  const acc = getAccount(c.account_id);
  const token = tokenOf(acc);
  try {
    if (acc.platform === 'instagram') await clients.instagram.hideComment(c.platform_comment_id, hidden, token);
    else await clients.threads.hideReply(c.platform_comment_id, hidden, token);
  } catch (e) { throw platformToApi(e, acc); }
  run('UPDATE comments SET hidden=? WHERE id=?', hidden ? 1 : 0, c.id);
  return publicComment(one('SELECT * FROM comments WHERE id=?', c.id));
}

export function setCommentStatus(cid, status, user) {
  if (status === 'done') status = 'ignored';
  if (!['unreplied', 'replied', 'ignored'].includes(status)) throw err(400, 'validation_failed', 'reply_status harus unreplied, replied, atau ignored');
  getComment(cid, user);
  run('UPDATE comments SET reply_status=? WHERE id=?', status, cid);
  return publicComment(one('SELECT * FROM comments WHERE id=?', cid));
}

function platformToApi(e, acc) {
  if (e.code === 'account_expired') { markExpired(acc.id, e.message); return err(422, 'account_expired', `Akun @${acc.username} perlu disambungkan ulang`, { account_id: acc.id }); }
  if (e.code === 'permission_missing') return err(422, 'permission_missing', `Izin Meta belum diberikan: ${e.message}`, { account_id: acc.id });
  if (e.code === 'rate_limited') return err(429, 'rate_limited', e.message);
  return err(502, 'platform_error', e.message, { account_id: acc.id });
}

// ---------------- insights ----------------
export async function syncInsights() {
  const today = new Date().toISOString().slice(0, 10);
  for (const acc of all("SELECT * FROM accounts WHERE status='active'")) {
    const token = tokenOf(acc);
    const c = clients[acc.platform];
    try {
      const m = await c.accountInsights(acc.platform_user_id, token);
      if (acc.platform === 'instagram') {
        const prof = await c.me(token);
        if (prof.followers != null) { m.followers_count = prof.followers; }
      }
      if (m.followers_count != null) run('UPDATE accounts SET followers_count=? WHERE id=?', m.followers_count, acc.id);
      run('INSERT INTO insights_daily(account_id,date,metrics) VALUES(?,?,?) ON CONFLICT(account_id,date) DO UPDATE SET metrics=excluded.metrics', acc.id, today, JSON.stringify(m));
    } catch (e) {
      if (e.code === 'account_expired') { markExpired(acc.id, e.message); continue; }
      console.warn(`[insights] account @${acc.username}: ${e.message}`);
    }
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    for (const t of all("SELECT * FROM post_targets WHERE account_id=? AND status='published' AND published_at > ? AND platform_post_id IS NOT NULL", acc.id, since)) {
      try {
        const m = await c.mediaInsights(t.platform_post_id, token);
        run('INSERT INTO post_insights(target_id,metrics,updated_at) VALUES(?,?,?) ON CONFLICT(target_id) DO UPDATE SET metrics=excluded.metrics, updated_at=excluded.updated_at', t.id, JSON.stringify(m), now());
      } catch (e) { if (e.code !== 'permission_missing') console.warn(`[insights] post ${t.id}: ${e.message}`); }
    }
  }
}

export function accountInsights(accountId, { from, to } = {}) {
  const a = getAccount(accountId);
  to = to || new Date().toISOString().slice(0, 10);
  from = from || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const rows = all('SELECT date, metrics FROM insights_daily WHERE account_id=? AND date>=? AND date<=? ORDER BY date', a.id, from, to);
  return { account_id: a.id, platform: a.platform, from, to, followers_count: a.followers_count, days: rows.map((r) => ({ date: r.date, ...parseJSON(r.metrics, {}) })) };
}

export function postInsights(postId) {
  const ts = all('SELECT t.id, t.account_id, t.platform, i.metrics, i.updated_at FROM post_targets t LEFT JOIN post_insights i ON i.target_id=t.id WHERE t.post_id=?', postId);
  if (!ts.length) throw err(404, 'not_found', 'Post tidak ditemukan');
  return { post_id: postId, targets: ts.map((t) => ({ target_id: t.id, account_id: t.account_id, platform: t.platform, metrics: parseJSON(t.metrics, null), updated_at: t.updated_at })) };
}
