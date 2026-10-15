import { one, all, run, id, now, tx, sha256 } from '../db.js';
import { err, parseJSON, toUtcIso } from '../util.js';
import { getAccount } from './accounts.js';
import { getMedia, publicMedia } from './media.js';
import { validateTarget } from './rules.js';

const TERMINAL = ['published', 'failed', 'cancelled'];

export function publicTarget(t) {
  const a = one('SELECT username, platform FROM accounts WHERE id=?', t.account_id);
  return {
    id: t.id, account_id: t.account_id, platform: t.platform, username: a?.username || null,
    content: t.content, media_ids: parseJSON(t.media_ids, null), options: parseJSON(t.options, {}),
    status: t.status, permalink: t.permalink, platform_post_id: t.platform_post_id,
    error_code: t.error_code, error_message: t.error_message, attempts: t.attempts, published_at: t.published_at,
  };
}

export function publicPost(p) {
  if (!p) return null;
  const targets = all('SELECT * FROM post_targets WHERE post_id=? ORDER BY rowid', p.id).map(publicTarget);
  const mids = parseJSON(p.media_ids, []);
  return {
    id: p.id, status: p.status, content: p.content, media_ids: mids,
    media: mids.map((m) => publicMedia(one('SELECT * FROM media WHERE id=?', m))).filter(Boolean),
    scheduled_at: p.scheduled_at, source: p.source, created_at: p.created_at, updated_at: p.updated_at, targets,
  };
}

/** Recompute aggregate post status from its targets. */
export function refreshPostStatus(postId) {
  const ts = all('SELECT status FROM post_targets WHERE post_id=?', postId).map((t) => t.status);
  const c = (s) => ts.filter((x) => x === s).length;
  let status;
  if (!ts.length || c('cancelled') === ts.length) status = 'cancelled';
  else if (c('publishing') > 0) status = 'publishing';
  else if (c('pending') > 0) status = c('published') || c('failed') ? 'publishing' : 'scheduled';
  else if (c('published') && c('failed')) status = 'partial';
  else if (c('failed')) status = 'failed';
  else status = 'published';
  run('UPDATE posts SET status=?, updated_at=? WHERE id=?', status, now(), postId);
  return status;
}

function normalizeTargets(body) {
  const targets = body.targets;
  if (!Array.isArray(targets) || !targets.length) throw err(400, 'validation_failed', 'targets wajib berisi minimal 1 akun', { field: 'targets' });
  const seen = new Set();
  const sharedContent = typeof body.content === 'string' ? body.content : '';
  const sharedMedia = Array.isArray(body.media_ids) ? body.media_ids : [];
  return targets.map((t) => {
    if (!t?.account_id) throw err(400, 'validation_failed', 'Setiap target wajib punya account_id');
    if (seen.has(t.account_id)) throw err(400, 'validation_failed', 'account_id duplikat di targets', { account_id: t.account_id });
    seen.add(t.account_id);
    const acc = getAccount(t.account_id);
    if (acc.status === 'expired') throw err(422, 'account_expired', `Akun @${acc.username} perlu disambungkan ulang`, { account_id: acc.id });
    const content = typeof t.content === 'string' ? t.content : sharedContent;
    const mediaIds = Array.isArray(t.media_ids) ? t.media_ids : sharedMedia;
    const media = mediaIds.map((m) => {
      const r = getMedia(m);
      return { id: r.id, kind: r.kind, width: r.width, height: r.height, duration_ms: r.duration_ms, size: r.size_bytes };
    });
    const options = t.options && typeof t.options === 'object' ? structuredClone(t.options) : {};
    // validate referenced media inside options
    if (options.cover_media_id) {
      const cm = getMedia(options.cover_media_id);
      if (cm.kind !== 'image') throw err(400, 'invalid_options', 'cover_media_id harus gambar');
    }
    for (const part of options.thread || []) if (typeof part === 'object') for (const mid of part.media_ids || []) getMedia(mid);
    validateTarget(acc.platform, { content, media, options, accountId: acc.id });
    return {
      account: acc, options,
      contentOverride: typeof t.content === 'string' ? t.content : null,
      mediaOverride: Array.isArray(t.media_ids) ? t.media_ids : null,
    };
  });
}

function scheduleTime(input) {
  const iso = toUtcIso(input);
  if (!iso) return null;
  if (new Date(iso).getTime() < Date.now() - 5 * 60_000) throw err(400, 'validation_failed', 'scheduled_at sudah lewat', { field: 'scheduled_at' });
  if (new Date(iso).getTime() > Date.now() + 365 * 864e5) throw err(400, 'validation_failed', 'scheduled_at maksimal 1 tahun ke depan', { field: 'scheduled_at' });
  return iso;
}

/**
 * Create a post. Idempotent via explicit key (REST) or identical-body dedupe window (MCP).
 */
export function createPost(userId, body, { idempotencyKey, source = 'api', dedupeWindowMin = 0 } = {}) {
  const canonical = JSON.stringify({ c: body.content ?? '', m: body.media_ids ?? [], t: body.targets ?? [], s: body.scheduled_at ?? null });
  const reqHash = sha256(`${userId}:${canonical}`);

  if (idempotencyKey) {
    const ex = one('SELECT * FROM posts WHERE created_by=? AND idempotency_key=?', userId, idempotencyKey);
    if (ex) {
      if (ex.request_hash !== reqHash) throw err(409, 'idempotency_conflict', 'Idempotency-Key ini sudah dipakai dengan body berbeda');
      return { post: publicPost(ex), replayed: true };
    }
  }
  if (dedupeWindowMin > 0) {
    const since = new Date(Date.now() - dedupeWindowMin * 60_000).toISOString();
    const ex = one("SELECT * FROM posts WHERE request_hash=? AND created_at > ? AND status != 'cancelled' ORDER BY created_at DESC", reqHash, since);
    if (ex) return { post: publicPost(ex), replayed: true };
  }

  const targets = normalizeTargets(body);
  const scheduledAt = scheduleTime(body.scheduled_at);
  const runAt = scheduledAt || now();
  const pid = id('p');
  tx(() => {
    run(`INSERT INTO posts(id,created_by,content,media_ids,status,scheduled_at,idempotency_key,request_hash,source)
         VALUES(?,?,?,?,?,?,?,?,?)`,
      pid, userId, body.content || '', JSON.stringify(body.media_ids || []), scheduledAt ? 'scheduled' : 'publishing', scheduledAt, idempotencyKey || null, reqHash, source);
    for (const t of targets) {
      run(`INSERT INTO post_targets(id,post_id,account_id,platform,content,media_ids,options,status,run_at) VALUES(?,?,?,?,?,?,?,?,?)`,
        id('t'), pid, t.account.id, t.account.platform, t.contentOverride, t.mediaOverride ? JSON.stringify(t.mediaOverride) : null, JSON.stringify(t.options), 'pending', runAt);
    }
  });
  return { post: publicPost(one('SELECT * FROM posts WHERE id=?', pid)), replayed: false };
}

export function getPost(postId) {
  const p = one('SELECT * FROM posts WHERE id=? AND removed_at IS NULL', postId);
  if (!p) throw err(404, 'not_found', `Post ${postId} tidak ditemukan`);
  return p;
}

export function listPosts({ limit = 20, cursor, status, account_id, from, to } = {}) {
  limit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const where = ['removed_at IS NULL']; const params = [];
  if (status) { where.push('status = ?'); params.push(status); }
  if (account_id) { where.push('id IN (SELECT post_id FROM post_targets WHERE account_id=?)'); params.push(account_id); }
  if (from) { where.push('COALESCE(scheduled_at, created_at) >= ?'); params.push(toUtcIso(from) || from); }
  if (to) { where.push('COALESCE(scheduled_at, created_at) < ?'); params.push(toUtcIso(to) || to); }
  if (cursor) { where.push('created_at < ?'); params.push(cursor); }
  const rows = all(`SELECT * FROM posts WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ?`, ...params, limit + 1);
  const more = rows.length > limit; const page = rows.slice(0, limit);
  return { data: page.map(publicPost), next_cursor: more ? page.at(-1).created_at : null };
}

/** Calendar view: posts whose effective time falls in [from, to). */
export function calendar(fromIso, toIso) {
  return all(`SELECT * FROM posts WHERE removed_at IS NULL AND status != 'cancelled'
    AND COALESCE(scheduled_at, created_at) >= ? AND COALESCE(scheduled_at, created_at) < ? ORDER BY COALESCE(scheduled_at, created_at)`, fromIso, toIso).map(publicPost);
}

function assertEditable(p) {
  const started = one("SELECT 1 FROM post_targets WHERE post_id=? AND status NOT IN ('pending','cancelled')", p.id);
  if (started || p.status !== 'scheduled') throw err(409, 'post_not_editable', 'Post sudah mulai diterbitkan dan tidak bisa diubah');
}

export function updatePost(postId, patch) {
  const p = getPost(postId);
  assertEditable(p);
  const merged = {
    content: patch.content ?? p.content,
    media_ids: patch.media_ids ?? parseJSON(p.media_ids, []),
    targets: all("SELECT * FROM post_targets WHERE post_id=? AND status='pending'", p.id).map((t) => ({
      account_id: t.account_id,
      ...(t.content != null ? { content: t.content } : {}),
      ...(t.media_ids != null ? { media_ids: parseJSON(t.media_ids, []) } : {}),
      options: parseJSON(t.options, {}),
    })),
  };
  if (Array.isArray(patch.targets)) merged.targets = patch.targets;
  const targets = normalizeTargets(merged);
  const scheduledAt = patch.scheduled_at !== undefined ? scheduleTime(patch.scheduled_at) : p.scheduled_at;
  if (!scheduledAt) throw err(400, 'validation_failed', 'Post terjadwal butuh scheduled_at. Pakai /publish untuk terbit sekarang.');
  tx(() => {
    run('UPDATE posts SET content=?, media_ids=?, scheduled_at=?, updated_at=? WHERE id=?', merged.content, JSON.stringify(merged.media_ids), scheduledAt, now(), p.id);
    run('DELETE FROM post_targets WHERE post_id=?', p.id);
    for (const t of targets) {
      run(`INSERT INTO post_targets(id,post_id,account_id,platform,content,media_ids,options,status,run_at) VALUES(?,?,?,?,?,?,?,?,?)`,
        id('t'), p.id, t.account.id, t.account.platform, t.contentOverride, t.mediaOverride ? JSON.stringify(t.mediaOverride) : null, JSON.stringify(t.options), 'pending', scheduledAt);
    }
  });
  return publicPost(one('SELECT * FROM posts WHERE id=?', p.id));
}

export function cancelPost(postId) {
  const p = getPost(postId);
  assertEditable(p);
  run("UPDATE post_targets SET status='cancelled' WHERE post_id=? AND status='pending'", p.id);
  refreshPostStatus(p.id);
  return publicPost(one('SELECT * FROM posts WHERE id=?', p.id));
}

export function publishNow(postId) {
  const p = getPost(postId);
  assertEditable(p);
  run("UPDATE post_targets SET run_at=? WHERE post_id=? AND status='pending'", now(), p.id);
  run("UPDATE posts SET scheduled_at=NULL, status='publishing', updated_at=? WHERE id=?", now(), p.id);
  return publicPost(one('SELECT * FROM posts WHERE id=?', p.id));
}

export function retryPost(postId) {
  const p = getPost(postId);
  const failed = all("SELECT * FROM post_targets WHERE post_id=? AND status='failed'", p.id);
  if (!failed.length) throw err(409, 'nothing_to_retry', 'Tidak ada akun yang gagal di post ini');
  for (const t of failed) {
    const acc = one('SELECT status, username FROM accounts WHERE id=?', t.account_id);
    if (acc?.status !== 'active') throw err(422, 'account_expired', `Akun @${acc?.username} perlu disambungkan ulang sebelum retry`, { account_id: t.account_id });
  }
  run("UPDATE post_targets SET status='pending', run_at=?, error_code=NULL, error_message=NULL, attempts=0, container_id=NULL WHERE post_id=? AND status='failed'", now(), p.id);
  refreshPostStatus(p.id);
  return publicPost(one('SELECT * FROM posts WHERE id=?', p.id));
}

export function removePost(postId) {
  const p = getPost(postId);
  if (one("SELECT 1 FROM post_targets WHERE post_id=? AND status IN ('pending','publishing')", p.id)) {
    throw err(409, 'post_not_removable', 'Batalkan post terjadwal dulu sebelum menghapus dari riwayat');
  }
  run('UPDATE posts SET removed_at=? WHERE id=?', now(), p.id);
}

export { TERMINAL };
