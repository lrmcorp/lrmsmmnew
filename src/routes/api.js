import express from 'express';
import { authenticate, requireWrite, requireAdmin, createApiKey, listApiKeys, revokeApiKey, publicUser, createUser } from '../auth.js';
import { all, run, one, now, kvGet, kvSet } from '../db.js';
import { err } from '../util.js';
import * as accounts from '../services/accounts.js';
import * as posts from '../services/posts.js';
import * as media from '../services/media.js';
import * as eng from '../services/engagement.js';
import { RULES } from '../services/rules.js';
import { runPublisherTick } from '../services/publisher.js';

export const api = express.Router();
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---- rate limit: 120 req / min per credential ----
const buckets = new Map();
api.use(authenticate, (req, res, next) => {
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
const source = (req) => (req.auth.via === 'session' ? 'dashboard' : req.auth.via === 'oauth' ? 'mcp' : 'api');

// ---- me / accounts ----
api.get('/me', (req, res) => res.json({ user: publicUser(req.auth.user), access: { via: req.auth.via, scope: req.auth.scope } }));
api.get('/accounts', (_req, res) => res.json({ data: accounts.listAccounts() }));
api.get('/accounts/:id', (req, res) => res.json(accounts.publicAccount(accounts.getAccount(req.params.id))));
api.delete('/accounts/:id', W, (req, res) => { accounts.disconnect(req.params.id); res.status(204).end(); });
api.get('/accounts/:id/publishing-limit', ah(async (req, res) => res.json(await accounts.publishingLimit(req.params.id))));
api.get('/accounts/:id/insights', (req, res) => res.json(eng.accountInsights(req.params.id, req.query)));
api.post('/connect/:platform', W, (req, res) => res.json({ url: accounts.beginConnect(req.params.platform, req.auth.user.id, req.body?.return_to) }));
api.get('/platform-rules', (_req, res) => res.json(RULES));

// ---- posts ----
api.post('/posts', W, ah(async (req, res) => {
  const key = req.get('Idempotency-Key') || null;
  if (key && key.length > 200) throw err(400, 'validation_failed', 'Idempotency-Key terlalu panjang');
  const { post, replayed } = posts.createPost(req.auth.user.id, req.body || {}, { idempotencyKey: key, source: source(req) });
  if (!post.scheduled_at && !replayed) setImmediate(() => runPublisherTick().catch(() => {}));
  res.status(replayed ? 200 : 201).set('Idempotent-Replayed', String(replayed)).json(post);
}));
api.get('/posts', (req, res) => res.json(posts.listPosts(req.query)));
api.get('/calendar', (req, res) => {
  if (!req.query.from || !req.query.to) throw err(400, 'validation_failed', 'from dan to wajib (ISO 8601)');
  res.json({ data: posts.calendar(new Date(req.query.from).toISOString(), new Date(req.query.to).toISOString()) });
});
api.get('/posts/:id', (req, res) => res.json(posts.publicPost(posts.getPost(req.params.id))));
api.patch('/posts/:id', W, (req, res) => res.json(posts.updatePost(req.params.id, req.body || {})));
api.delete('/posts/:id', W, (req, res) => res.json(posts.cancelPost(req.params.id)));
api.post('/posts/:id/publish', W, (req, res) => { const p = posts.publishNow(req.params.id); setImmediate(() => runPublisherTick().catch(() => {})); res.json(p); });
api.post('/posts/:id/retry', W, (req, res) => { const p = posts.retryPost(req.params.id); setImmediate(() => runPublisherTick().catch(() => {})); res.json(p); });
api.post('/posts/:id/remove', W, (req, res) => { posts.removePost(req.params.id); res.status(204).end(); });
api.get('/posts/:id/insights', (req, res) => res.json(eng.postInsights(req.params.id)));

// ---- media ----
const raw = express.raw({ type: () => true, limit: '101mb' });
const rawPart = express.raw({ type: () => true, limit: '9mb' });
api.post('/media/from-url', W, ah(async (req, res) => res.status(201).json(await media.fromUrl(req.auth.user.id, req.body?.url, req.body || {}))));
api.post('/media/upload', W, raw, ah(async (req, res) => {
  const inLib = req.query.in_library !== 'false';
  res.status(201).json(await media.saveBuffer(req.auth.user.id, req.body, { originalName: req.get('X-File-Name') ? decodeURIComponent(req.get('X-File-Name')) : null, inLibrary: inLib, alt_text: req.query.alt_text }));
}));
api.post('/media/uploads', W, (req, res) => res.status(201).json(media.createUpload(req.auth.user.id, req.body || {})));
api.put('/media/:id/parts/:n', W, rawPart, (req, res) => { media.putPart(req.params.id, req.params.n, req.body); res.status(204).end(); });
api.post('/media/:id/complete', W, ah(async (req, res) => res.json(await media.completeUpload(req.params.id))));
api.get('/media', (req, res) => res.json(media.listMedia(req.query)));
api.get('/media/:id', (req, res) => res.json(media.publicMedia(media.getMedia(req.params.id))));
api.patch('/media/:id', W, (req, res) => {
  if (req.body?.in_library != null) run('UPDATE media SET in_library=? WHERE id=?', req.body.in_library ? 1 : 0, req.params.id);
  res.json(req.body?.alt_text !== undefined ? media.setAlt(req.params.id, req.body.alt_text) : media.publicMedia(media.getMedia(req.params.id)));
});
api.delete('/media/:id', W, (req, res) => { media.deleteMedia(req.params.id); res.status(204).end(); });

// ---- comments & insights ----
api.get('/comments', (req, res) => res.json(eng.listComments({ ...req.query, reply_status: req.query.reply_status ?? 'unreplied', include_own: req.query.include_own === 'true' })));
api.post('/comments/sync', W, ah(async (_req, res) => res.json({ synced: await eng.syncAllComments() })));
api.post('/comments/:id/reply', W, ah(async (req, res) => res.json(await eng.replyToComment(req.params.id, req.body?.message))));
api.post('/comments/:id/hide', W, ah(async (req, res) => res.json(await eng.hideComment(req.params.id, req.body?.hidden !== false))));
api.patch('/comments/:id', W, (req, res) => res.json(eng.setCommentStatus(req.params.id, req.body?.reply_status)));
api.post('/insights/sync', W, ah(async (_req, res) => {
  const last = Number(kvGet('insights:manual') || 0);
  if (Date.now() - last < 5 * 60_000) throw err(429, 'rate_limited', 'Sinkron statistik maksimal 1 kali per 5 menit');
  kvSet('insights:manual', Date.now());
  await eng.syncInsights();
  res.json({ ok: true, synced_at: now() });
}));

// ---- dashboard-only: API keys, connected apps, users ----
api.get('/api-keys', sessionOnly, (req, res) => res.json({ data: listApiKeys(req.auth.user.id) }));
api.post('/api-keys', sessionOnly, (req, res) => res.status(201).json(createApiKey(req.auth.user.id, req.body?.name, req.body?.scope || 'read')));
api.delete('/api-keys/:id', sessionOnly, (req, res) => { if (!revokeApiKey(req.auth.user.id, req.params.id)) throw err(404, 'not_found', 'Key tidak ditemukan'); res.status(204).end(); });
api.get('/apps', sessionOnly, (req, res) => res.json({
  data: all(`SELECT t.id, t.scope, t.created_at, t.last_used_at, c.name AS client_name, c.client_id FROM oauth_tokens t LEFT JOIN oauth_clients c ON c.client_id=t.client_id
             WHERE t.user_id=? AND t.revoked_at IS NULL ORDER BY t.created_at DESC`, req.auth.user.id),
}));
api.delete('/apps/:id', sessionOnly, (req, res) => { run('UPDATE oauth_tokens SET revoked_at=? WHERE id=? AND user_id=?', now(), req.params.id, req.auth.user.id); res.status(204).end(); });
api.get('/users', sessionOnly, requireAdmin, (_req, res) => res.json({ data: all('SELECT id,email,name,role,created_at FROM users ORDER BY created_at') }));
api.post('/users', sessionOnly, requireAdmin, (req, res) => res.status(201).json(createUser({ ...req.body, role: req.body?.role === 'admin' ? 'admin' : 'member' })));
api.delete('/users/:id', sessionOnly, requireAdmin, (req, res) => {
  if (req.params.id === req.auth.user.id) throw err(400, 'validation_failed', 'Tidak bisa menghapus diri sendiri');
  run('DELETE FROM users WHERE id=?', req.params.id); res.status(204).end();
});
api.get('/stats', (_req, res) => res.json({
  accounts: one("SELECT COUNT(*) n FROM accounts WHERE status='active'").n,
  scheduled: one("SELECT COUNT(*) n FROM posts WHERE status='scheduled' AND removed_at IS NULL").n,
  failed_7d: one("SELECT COUNT(*) n FROM post_targets WHERE status='failed' AND rowid IN (SELECT t.rowid FROM post_targets t JOIN posts p ON p.id=t.post_id WHERE p.updated_at > ?)", new Date(Date.now() - 7 * 864e5).toISOString()).n,
  unreplied: one("SELECT COUNT(*) n FROM comments WHERE reply_status='unreplied' AND from_self=0 AND hidden=0").n,
}));
