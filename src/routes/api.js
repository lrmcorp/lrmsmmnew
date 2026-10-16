import express from 'express';
import { authenticate, requireWrite, requireOwner, createApiKey, listApiKeys, revokeApiKey, publicUser, createUser, revokeAllMachineAccess } from '../auth.js';
import { all, run, one, now, kvGet, kvSet } from '../db.js';
import { err, hashPassword } from '../util.js';
import * as accounts from '../services/accounts.js';
import * as posts from '../services/posts.js';
import * as media from '../services/media.js';
import * as eng from '../services/engagement.js';
import * as msgs from '../services/messages.js';
import { RULES } from '../services/rules.js';
import { runPublisherTick } from '../services/publisher.js';
import { assertAccount, assertPostView, assertPostEdit, scopeSql, scopeOf, setAssignments, assignedAccounts, assignedCompanies, setCompanyAssignments, ROLES, isOwner } from '../services/scope.js';
import { listCompanies, saveCompany, moveAccount } from '../services/companies.js';
import { audit, listAudit } from '../services/audit.js';
import { bus } from '../services/events.js';
import { stats as webhookStats } from './webhooks.js';
import { config } from '../config.js';

export const api = express.Router();

// ---- rate limit: 120 req / min per credential ----
const buckets = new Map();
api.use(authenticate, (req, res, next) => {
  if (req.path === '/events') return next();
  const key = req.auth.credentialId || `s:${req.auth.user.id}`;
  const LIMIT = 120, WINDOW = 60_000;
  const t = Date.now();
  let b = buckets.get(key);
  if (!b || t - b.start > WINDOW) { b = { start: t, n: 0 }; buckets.set(key, b); }
  b.n++;
  res.set('RateLimit-Limit', String(LIMIT));
  res.set('RateLimit-Remaining', String(Math.max(0, LIMIT - b.n)));
  res.set('RateLimit-Reset', String(Math.ceil((b.start + WINDOW - t) / 1000)));
  if (b.n > LIMIT) return next(err(429, 'rate_limited', 'Terlalu banyak request, coba lagi sebentar'));
  next();
});
const sessionOnly = (req, _res, next) => (req.auth.via === 'session' ? next() : next(err(403, 'forbidden', 'Endpoint ini hanya untuk dashboard')));
const W = requireWrite;
const U = (req) => req.auth.user;
const source = (req) => (req.auth.via === 'session' ? 'dashboard' : req.auth.via === 'oauth' ? 'mcp' : 'api');
const kick = () => setImmediate(() => runPublisherTick().catch(() => {}));

// ---- me / accounts ----
api.get('/me', (req, res) => res.json({ user: publicUser(U(req)), access: { via: req.auth.via, scope: req.auth.scope }, account_ids: scopeOf(U(req)), integrations: { instagram: accounts.platformConfigured('instagram'), threads: accounts.platformConfigured('threads') } }));
api.get('/accounts', (req, res) => res.json({ data: accounts.listAccounts(U(req)) }));
api.get('/companies', (req, res) => res.json({ data: listCompanies(U(req)) }));
api.post('/companies', sessionOnly, requireOwner, (req, res) => {
  const company = saveCompany(null, req.body?.name);
  audit(req.auth, 'company.create', 'company', company.id, { name: company.name });
  res.status(201).json(company);
});
api.patch('/companies/:id', sessionOnly, requireOwner, (req, res) => {
  const company = saveCompany(req.params.id, req.body?.name);
  audit(req.auth, 'company.update', 'company', company.id, { name: company.name });
  res.json(company);
});
api.put('/accounts/:id/company', sessionOnly, requireOwner, (req, res) => {
  moveAccount(req.params.id, req.body?.company_id);
  audit(req.auth, 'account.company', 'account', req.params.id, { company_id: req.body.company_id });
  res.json(accounts.publicAccount(accounts.getAccount(req.params.id)));
});
api.post('/accounts/:id/profile', W, async (req, res) => {
  assertAccount(U(req), req.params.id);
  let profile;
  try { profile = await accounts.refreshAccountProfile(req.params.id); }
  catch (error) { throw err(422, 'profile_refresh_failed', 'Profil belum bisa diperbarui dari Meta. Periksa koneksi atau sambungkan ulang akun.'); }
  assertAccount(U(req), req.params.id);
  res.json(profile);
});
api.get('/accounts/:id', (req, res) => { assertAccount(U(req), req.params.id); res.json(accounts.publicAccount(accounts.getAccount(req.params.id))); });
api.delete('/accounts/:id', W, requireOwner, (req, res) => {
  const a = accounts.getAccount(req.params.id);
  accounts.disconnect(a.id);
  audit(req.auth, 'account.disconnect', 'account', a.id, { username: a.username, platform: a.platform });
  res.status(204).end();
});
api.get('/accounts/:id/publishing-limit', async (req, res) => { assertAccount(U(req), req.params.id); res.json(await accounts.publishingLimit(req.params.id)); });
api.get('/accounts/:id/insights', (req, res) => { assertAccount(U(req), req.params.id); res.json(eng.accountInsights(req.params.id, req.query)); });
api.post('/connect/:platform', W, (req, res) => res.json({ url: accounts.beginConnect(req.params.platform, U(req).id, req.body?.return_to) }));
api.get('/platform-rules', (_req, res) => res.json(RULES));

// ---- posts ----
api.post('/posts', W, (req, res) => {
  const key = req.get('Idempotency-Key') || null;
  if (key && key.length > 200) throw err(400, 'validation_failed', 'Idempotency-Key terlalu panjang');
  const { post, replayed } = posts.createPost(U(req), req.body || {}, { idempotencyKey: key, source: source(req) });
  if (!replayed) {
    audit(req.auth, post.scheduled_at ? 'post.schedule' : 'post.publish', 'post', post.id, { accounts: post.targets.map((t) => `@${t.username}`), scheduled_at: post.scheduled_at });
    if (!post.scheduled_at) kick();
  }
  res.status(replayed ? 200 : 201).set('Idempotent-Replayed', String(replayed)).json(post);
});
api.get('/posts', (req, res) => res.json(posts.listPosts(req.query, U(req))));
api.get('/calendar', (req, res) => {
  if (!req.query.from || !req.query.to) throw err(400, 'validation_failed', 'from dan to wajib (ISO 8601)');
  res.json({ data: posts.calendar(new Date(req.query.from).toISOString(), new Date(req.query.to).toISOString(), U(req)) });
});
api.get('/posts/:id', (req, res) => { assertPostView(U(req), req.params.id); res.json(posts.publicPost(posts.getPost(req.params.id))); });
api.patch('/posts/:id', W, (req, res) => {
  assertPostEdit(U(req), req.params.id);
  const p = posts.updatePost(req.params.id, req.body || {}, U(req));
  audit(req.auth, 'post.update', 'post', p.id, { fields: Object.keys(req.body || {}) });
  res.json(p);
});
api.delete('/posts/:id', W, (req, res) => { assertPostEdit(U(req), req.params.id); const p = posts.cancelPost(req.params.id); audit(req.auth, 'post.cancel', 'post', p.id); res.json(p); });
api.post('/posts/:id/publish', W, (req, res) => { assertPostEdit(U(req), req.params.id); const p = posts.publishNow(req.params.id); audit(req.auth, 'post.publish_now', 'post', p.id); kick(); res.json(p); });
api.post('/posts/:id/retry', W, (req, res) => { assertPostEdit(U(req), req.params.id); const p = posts.retryPost(req.params.id); audit(req.auth, 'post.retry', 'post', p.id); kick(); res.json(p); });
api.post('/posts/:id/remove', W, (req, res) => { assertPostEdit(U(req), req.params.id); posts.removePost(req.params.id); audit(req.auth, 'post.remove', 'post', req.params.id); res.status(204).end(); });
api.get('/posts/:id/insights', (req, res) => { assertPostView(U(req), req.params.id); res.json(eng.postInsights(req.params.id)); });

// ---- media (shared team library) ----
const raw = express.raw({ type: () => true, limit: '101mb' });
const rawPart = express.raw({ type: () => true, limit: '9mb' });
api.post('/media/from-url', W, async (req, res) => res.status(201).json(await media.fromUrl(U(req).id, req.body?.url, req.body || {})));
api.post('/media/upload', W, raw, async (req, res) => {
  const inLib = req.query.in_library !== 'false';
  res.status(201).json(await media.saveBuffer(U(req).id, req.body, { originalName: req.get('X-File-Name') ? decodeURIComponent(req.get('X-File-Name')) : null, inLibrary: inLib, alt_text: req.query.alt_text }));
});
api.get('/media/usage', (_req, res) => res.json(media.usage()));
api.post('/media/uploads', W, (req, res) => res.status(201).json(media.createUpload(U(req).id, req.body || {})));
api.get('/media/:id/parts', (req, res) => res.json(media.listParts(req.params.id)));
api.put('/media/:id/parts/:n', W, rawPart, (req, res) => { media.putPart(req.params.id, req.params.n, req.body); res.status(204).end(); });
api.post('/media/:id/complete', W, async (req, res) => res.json(await media.completeUpload(req.params.id)));
api.get('/media', (req, res) => res.json(media.listMedia(req.query)));
api.get('/media/:id', (req, res) => res.json(media.publicMedia(media.getMedia(req.params.id))));
api.patch('/media/:id', W, (req, res) => {
  if (req.body?.in_library != null) run('UPDATE media SET in_library=? WHERE id=?', req.body.in_library ? 1 : 0, req.params.id);
  res.json(req.body?.alt_text !== undefined ? media.setAlt(req.params.id, req.body.alt_text) : media.publicMedia(media.getMedia(req.params.id)));
});
api.delete('/media/:id', W, (req, res) => { media.deleteMedia(req.params.id); audit(req.auth, 'media.delete', 'media', req.params.id); res.status(204).end(); });

// ---- comments ----
api.get('/comments', (req, res) => res.json(eng.listComments({ ...req.query, reply_status: req.query.reply_status ?? 'unreplied', include_own: req.query.include_own === 'true' }, U(req))));
api.post('/comments/sync', W, async (req, res) => {
  let n = 0;
  for (const a of all("SELECT * FROM accounts WHERE status='active'")) if (scopeOf(U(req)) === null || scopeOf(U(req)).includes(a.id)) n += await eng.syncAccountComments(a);
  res.json({ synced: n });
});
api.post('/comments/:id/reply', W, async (req, res) => {
  const r = await eng.replyToComment(req.params.id, req.body?.message, U(req));
  audit(req.auth, 'comment.reply', 'comment', req.params.id, { text: String(req.body?.message).slice(0, 200) });
  res.json(r);
});
api.post('/comments/:id/hide', W, async (req, res) => {
  const r = await eng.hideComment(req.params.id, req.body?.hidden !== false, U(req));
  audit(req.auth, r.hidden ? 'comment.hide' : 'comment.unhide', 'comment', req.params.id);
  res.json(r);
});
api.patch('/comments/:id', W, (req, res) => res.json(eng.setCommentStatus(req.params.id, req.body?.reply_status, U(req))));

// ---- direct messages (Instagram) ----
api.get('/conversations', (req, res) => res.json(msgs.listConversations(U(req), req.query)));
api.get('/conversations/:id', (req, res) => res.json(msgs.getConversation(U(req), req.params.id, req.query)));
api.post('/conversations/:id/messages', W, async (req, res) => {
  const r = await msgs.sendMessage(U(req), req.params.id, req.body?.text);
  audit(req.auth, 'message.send', 'conversation', req.params.id, { to: `@${r.participant.username}`, text: String(req.body?.text).slice(0, 200) });
  res.status(201).json(r);
});
api.patch('/conversations/:id', W, (req, res) => res.json(msgs.setConversationStatus(U(req), req.params.id, req.body?.status)));
api.post('/messages/sync', W, async (req, res) => {
  res.json(await msgs.syncUserMessages(U(req), req.body?.account_id));
});
api.get('/messages/sync-status', (req, res) => res.json({ data: msgs.messageSyncStatus(U(req)) }));
api.get('/messages/unreplied', (req, res) => res.json(msgs.unrepliedSummary(U(req), req.query.older_than ? Number(req.query.older_than) : undefined)));

// ---- insights ----
api.post('/insights/sync', W, async (_req, res) => {
  const last = Number(kvGet('insights:manual') || 0);
  if (Date.now() - last < 5 * 60_000) throw err(429, 'rate_limited', 'Sinkron statistik maksimal 1 kali per 5 menit');
  kvSet('insights:manual', Date.now());
  await eng.syncInsights();
  res.json({ ok: true, synced_at: now() });
});

// ---- live events (Server-Sent Events) ----
api.get('/events', (req, res) => {
  const user = U(req);
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders?.();
  const send = (ev, data) => res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`);
  send('hello', { at: now() });
  const onEvent = (e) => {
    const s = scopeOf(user);
    if (e.data.account_id && s !== null && !s.includes(e.data.account_id)) return;
    send(e.type, e.data);
  };
  bus.on('event', onEvent);
  const hb = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(hb); bus.off('event', onEvent); });
});

// ---- counts for badges ----
api.get('/stats', (req, res) => {
  const [w, p] = scopeSql(U(req), 'account_id');
  const [wt, pt] = scopeSql(U(req), 't.account_id');
  const [wa, pa] = scopeSql(U(req), 'id');
  const u = msgs.unrepliedSummary(U(req));
  res.json({
    accounts: one(`SELECT COUNT(*) n FROM accounts WHERE status='active' AND ${wa}`, ...pa).n,
    scheduled: one(`SELECT COUNT(DISTINCT p.id) n FROM posts p JOIN post_targets t ON t.post_id=p.id WHERE p.status='scheduled' AND p.removed_at IS NULL AND ${wt}`, ...pt).n,
    failed_7d: one(`SELECT COUNT(*) n FROM post_targets t JOIN posts p ON p.id=t.post_id WHERE t.status='failed' AND p.updated_at > ? AND ${wt}`, new Date(Date.now() - 7 * 864e5).toISOString(), ...pt).n,
    unreplied: one(`SELECT COUNT(*) n FROM comments WHERE reply_status='unreplied' AND from_self=0 AND hidden=0 AND ${w}`, ...p).n,
    messages_waiting: u.waiting,
    messages_overdue: u.overdue,
    overdue_threshold_seconds: u.threshold_seconds,
  });
});

// ---- dashboard-only: API keys, connected apps ----
api.get('/api-keys', sessionOnly, (req, res) => res.json({ data: listApiKeys(U(req).id) }));
api.post('/api-keys', sessionOnly, (req, res) => {
  const k = createApiKey(U(req).id, req.body?.name, req.body?.scope || 'read');
  audit(req.auth, 'api_key.create', 'api_key', k.id, { name: k.name, scope: k.scope });
  res.status(201).json(k);
});
api.delete('/api-keys/:id', sessionOnly, (req, res) => {
  if (!revokeApiKey(U(req).id, req.params.id)) throw err(404, 'not_found', 'Key tidak ditemukan');
  audit(req.auth, 'api_key.revoke', 'api_key', req.params.id);
  res.status(204).end();
});
api.get('/apps', sessionOnly, (req, res) => res.json({
  data: all(`SELECT t.id, t.scope, t.created_at, t.last_used_at, c.name AS client_name, c.client_id FROM oauth_tokens t LEFT JOIN oauth_clients c ON c.client_id=t.client_id
             WHERE t.user_id=? AND t.revoked_at IS NULL ORDER BY t.created_at DESC`, U(req).id),
}));
api.delete('/apps/:id', sessionOnly, (req, res) => { run('UPDATE oauth_tokens SET revoked_at=? WHERE id=? AND user_id=?', now(), req.params.id, U(req).id); audit(req.auth, 'ai_app.revoke', 'oauth_token', req.params.id); res.status(204).end(); });

// ---- user management (Owner only) ----
const publicMember = (u) => ({ ...publicUser(u), account_ids: u.role === 'owner' ? null : assignedAccounts(u.id), company_ids: u.role === 'owner' ? null : assignedCompanies(u.id) });
api.get('/users', sessionOnly, requireOwner, (_req, res) => res.json({ data: all('SELECT * FROM users ORDER BY created_at').map(publicMember) }));
api.post('/users', sessionOnly, requireOwner, (req, res) => {
  const role = ROLES.includes(req.body?.role) ? req.body.role : 'rep';
  const u = createUser({ ...req.body, role });
  if (role === 'rep' && Array.isArray(req.body?.account_ids)) setAssignments(u.id, req.body.account_ids);
  if (role === 'rep' && req.body?.company_ids !== undefined) setCompanyAssignments(u.id, req.body.company_ids);
  audit(req.auth, 'user.create', 'user', u.id, { email: u.email, role, account_ids: req.body?.account_ids, company_ids: req.body?.company_ids });
  res.status(201).json(publicMember(one('SELECT * FROM users WHERE id=?', u.id)));
});
api.patch('/users/:id', sessionOnly, requireOwner, (req, res) => {
  const u = one('SELECT * FROM users WHERE id=?', req.params.id);
  if (!u) throw err(404, 'not_found', 'User tidak ditemukan');
  const b = req.body || {};
  if (b.role !== undefined) {
    if (!ROLES.includes(b.role)) throw err(400, 'validation_failed', 'role harus owner atau rep');
    if (u.id === U(req).id && b.role !== 'owner') throw err(400, 'validation_failed', 'Tidak bisa menurunkan peran diri sendiri');
    if (u.role === 'owner' && b.role !== 'owner' && one("SELECT COUNT(*) n FROM users WHERE role='owner'").n <= 1) throw err(400, 'validation_failed', 'Minimal harus ada satu Owner');
    run('UPDATE users SET role=? WHERE id=?', b.role, u.id);
  }
  if (b.name !== undefined) run('UPDATE users SET name=? WHERE id=?', String(b.name).slice(0, 100) || null, u.id);
  if (b.password) {
    if (b.password.length < 8) throw err(400, 'validation_failed', 'Password minimal 8 karakter');
    run('UPDATE users SET password_hash=? WHERE id=?', hashPassword(b.password), u.id);
    run('DELETE FROM sessions WHERE user_id=?', u.id);
    revokeAllMachineAccess(u.id);
  }
  if (Array.isArray(b.account_ids)) setAssignments(u.id, b.account_ids);
  if (b.company_ids !== undefined) setCompanyAssignments(u.id, b.company_ids);
  audit(req.auth, 'user.update', 'user', u.id, { email: u.email, role: b.role, account_ids: b.account_ids, company_ids: b.company_ids, password_reset: !!b.password });
  res.json(publicMember(one('SELECT * FROM users WHERE id=?', u.id)));
});
api.put('/users/:id/accounts', sessionOnly, requireOwner, (req, res) => {
  const u = one('SELECT * FROM users WHERE id=?', req.params.id);
  if (!u) throw err(404, 'not_found', 'User tidak ditemukan');
  setAssignments(u.id, req.body?.account_ids);
  audit(req.auth, 'user.assign', 'user', u.id, { email: u.email, account_ids: req.body?.account_ids });
  res.json(publicMember(u));
});
api.delete('/users/:id', sessionOnly, requireOwner, (req, res) => {
  if (req.params.id === U(req).id) throw err(400, 'validation_failed', 'Tidak bisa menghapus diri sendiri');
  const u = one('SELECT email FROM users WHERE id=?', req.params.id);
  run('DELETE FROM users WHERE id=?', req.params.id);
  audit(req.auth, 'user.delete', 'user', req.params.id, { email: u?.email });
  res.status(204).end();
});

// ---- admin (Owner only): audit log, failed posts, system ----
api.get('/admin/audit', requireOwner, (req, res) => res.json(listAudit({ ...req.query, before: req.query.cursor })));
api.get('/admin/failed-posts', requireOwner, (req, res) => res.json({
  data: all(`SELECT t.id AS target_id, t.post_id, t.platform, t.error_code, t.error_message, t.attempts, p.content, p.updated_at, a.username
             FROM post_targets t JOIN posts p ON p.id=t.post_id LEFT JOIN accounts a ON a.id=t.account_id
             WHERE t.status='failed' AND p.removed_at IS NULL ORDER BY p.updated_at DESC LIMIT ?`, Math.min(Number(req.query.limit) || 50, 200)),
}));
api.get('/admin/overview', requireOwner, (_req, res) => res.json({
  users: one('SELECT COUNT(*) n FROM users').n,
  accounts: one("SELECT COUNT(*) n FROM accounts WHERE status!='disconnected'").n,
  accounts_expired: one("SELECT COUNT(*) n FROM accounts WHERE status='expired'").n,
  posts_24h: one("SELECT COUNT(*) n FROM post_targets WHERE published_at > ?", new Date(Date.now() - 864e5).toISOString()).n,
  failed_24h: one("SELECT COUNT(*) n FROM post_targets t JOIN posts p ON p.id=t.post_id WHERE t.status='failed' AND p.updated_at > ?", new Date(Date.now() - 864e5).toISOString()).n,
  storage: media.usage(),
  webhooks: webhookStats,
  realtime_hint: webhookStats.received ? 'Webhook Meta aktif' : 'Belum ada webhook masuk — komentar & pesan disinkron berkala (polling)',
}));
export { isOwner, config };
