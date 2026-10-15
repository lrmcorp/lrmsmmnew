import { one, all, run, now, db } from '../db.js';
import { parseJSON } from '../util.js';
import { clients, tokenOf, markExpired } from './accounts.js';
import { getMedia, mediaUrl, toPublishMedia } from './media.js';
import { refreshPostStatus } from './posts.js';
import { PlatformError } from '../meta/http.js';
import { notify } from './notify.js';

const MAX_ATTEMPTS = 4;
const BACKOFF_MIN = [1, 3, 10, 30];
let running = false;

function claimDue(limit = 5) {
  const stmt = db.prepare(`UPDATE post_targets SET status='publishing', locked_at=?, attempts=attempts+1
    WHERE id IN (SELECT t.id FROM post_targets t JOIN posts p ON p.id=t.post_id
                 WHERE t.status='pending' AND t.run_at <= ? AND p.removed_at IS NULL ORDER BY t.run_at LIMIT ?)
    RETURNING *`);
  return stmt.all(now(), now(), limit);
}

/** Targets stuck in 'publishing' (process crashed) go back to pending if nothing reached the platform. */
function recoverStale() {
  const cutoff = new Date(Date.now() - 20 * 60_000).toISOString();
  run("UPDATE post_targets SET status='pending', locked_at=NULL, run_at=? WHERE status='publishing' AND locked_at < ? AND platform_post_id IS NULL", now(), cutoff);
}

async function publishTarget(t) {
  const post = one('SELECT * FROM posts WHERE id=?', t.post_id);
  const acc = one('SELECT * FROM accounts WHERE id=?', t.account_id);
  const fail = (code, message) => {
    run("UPDATE post_targets SET status='failed', error_code=?, error_message=?, locked_at=NULL WHERE id=?", code, message, t.id);
  };
  try {
    if (!acc || acc.status === 'disconnected') { run("UPDATE post_targets SET status='cancelled' WHERE id=?", t.id); return; }
    if (acc.status === 'expired') return fail('account_expired', 'Akun perlu disambungkan ulang');

    const token = tokenOf(acc);
    const content = t.content ?? post.content ?? '';
    const mediaIds = parseJSON(t.media_ids, null) ?? parseJSON(post.media_ids, []);
    const media = mediaIds.map((m) => toPublishMedia(getMedia(m)));
    const options = parseJSON(t.options, {});
    const onContainer = (cid) => run('UPDATE post_targets SET container_id=? WHERE id=?', cid, t.id);

    let result;
    if (acc.platform === 'instagram') {
      if (options.cover_media_id) options.cover_url = mediaUrl(getMedia(options.cover_media_id));
      result = await clients.instagram.publish({ igUserId: acc.platform_user_id, token, caption: content, media, options, onContainer });
    } else {
      const thread = (options.thread || []).map((p) => (typeof p === 'string' ? p : { text: p.text || '', media: (p.media_ids || []).map((m) => toPublishMedia(getMedia(m))) }));
      result = await clients.threads.publish({ userId: acc.platform_user_id, token, text: content, media, options: { ...options, thread }, onContainer });
    }
    run(`UPDATE post_targets SET status='published', platform_post_id=?, permalink=?, extra_post_ids=?, published_at=?, error_code=NULL, error_message=NULL, locked_at=NULL WHERE id=?`,
      result.id, result.permalink, result.extra?.length ? JSON.stringify(result.extra) : null, now(), t.id);
    console.log(`[publish] ${acc.platform} @${acc.username} ✓ ${result.permalink || result.id}`);
  } catch (e) {
    const pe = e instanceof PlatformError ? e : new PlatformError(e.code || 'internal_error', e.message, { transient: false });
    if (e.partial) {
      // Main thread post is live; a continuation failed. Don't retry (would duplicate the main post).
      run(`UPDATE post_targets SET status='published', platform_post_id=?, permalink=?, extra_post_ids=?, published_at=?, error_code='thread_partial', error_message=?, locked_at=NULL WHERE id=?`,
        e.partial.id, e.partial.permalink, JSON.stringify(e.partial.extra), now(), `Bagian utas ${e.details?.thread_part} gagal: ${pe.message}`, t.id);
    } else if (pe.transient && t.attempts < MAX_ATTEMPTS) {
      const wait = BACKOFF_MIN[Math.min(t.attempts - 1, BACKOFF_MIN.length - 1)] * 60_000;
      run("UPDATE post_targets SET status='pending', run_at=?, error_code=?, error_message=?, locked_at=NULL WHERE id=?",
        new Date(Date.now() + wait).toISOString(), pe.code, pe.message, t.id);
      console.warn(`[publish] transient ${pe.code} on ${t.id}, retry in ${wait / 60000}m`);
    } else {
      fail(pe.code, pe.message);
      console.warn(`[publish] ${acc?.platform} @${acc?.username} ✗ ${pe.code}: ${pe.message}`);
      if (pe.code === 'account_expired' && acc) {
        markExpired(acc.id, pe.message);
        notify('account_expired', { account: acc });
      } else {
        notify('post_failed', { account: acc, post, code: pe.code, message: pe.message });
      }
    }
  } finally {
    refreshPostStatus(t.post_id);
  }
}

let current = null;
let again = false;
/** Run the publisher. Concurrent callers share the in-flight run (plus one follow-up pass). */
export function runPublisherTick() {
  if (current) { again = true; return current; }
  current = (async () => {
    let n = 0;
    do { again = false; n += await tickOnce(); } while (again);
    return n;
  })().finally(() => { current = null; });
  return current;
}

async function tickOnce() {
  if (running) return 0;
  running = true;
  let n = 0;
  try {
    recoverStale();
    for (;;) {
      const batch = claimDue(5);
      if (!batch.length) break;
      n += batch.length;
      await Promise.all(batch.map(publishTarget));
    }
  } finally { running = false; }
  return n;
}

export const pendingCount = () => one("SELECT COUNT(*) n FROM post_targets WHERE status='pending' AND run_at <= ?", now()).n;
export { all };
