import { one, all, run, id, now, kvGet, kvSet } from '../db.js';
import { encrypt, decrypt, err, randomToken } from '../util.js';
import { config } from '../config.js';
import * as ig from '../meta/instagram.js';
import * as th from '../meta/threads.js';
import { refreshPostStatus } from './posts.js';
import { scopeSql, assignAccount } from './scope.js';

export const clients = { instagram: ig, threads: th };
export const PLATFORMS = Object.keys(clients);

export const redirectUri = (platform) => `${config.publicUrl}/connect/${platform}/callback`;

export function publicAccount(a) {
  if (!a) return null;
  return {
    id: a.id, platform: a.platform, platform_user_id: a.platform_user_id, username: a.username, name: a.name,
    avatar_url: a.avatar_url, status: a.status, last_error: a.last_error, followers_count: a.followers_count,
    token_expires_at: a.token_expires_at, created_at: a.created_at,
  };
}

export function listAccounts(user) {
  const [w, p] = user ? scopeSql(user, 'id') : ['1=1', []];
  return all(`SELECT * FROM accounts WHERE status != 'disconnected' AND ${w} ORDER BY platform, username`, ...p).map(publicAccount);
}

export function getAccount(accountId) {
  const a = one("SELECT * FROM accounts WHERE id=? AND status != 'disconnected'", accountId);
  if (!a) throw err(404, 'not_found', `Akun ${accountId} tidak ditemukan`, { account_id: accountId });
  return a;
}
export const tokenOf = (a) => decrypt(a.token_enc);

// ---- connect flow ----
export function platformConfigured(platform) {
  if (config.mock) return true;
  const e = process.env;
  return platform === 'instagram' ? !!(e.IG_APP_ID && e.IG_APP_SECRET) : !!(e.THREADS_APP_ID && e.THREADS_APP_SECRET);
}

export function beginConnect(platform, userId, returnTo = '/#/accounts') {
  if (!clients[platform]) throw err(400, 'validation_failed', 'Platform tidak dikenal');
  if (!platformConfigured(platform)) {
    const k = platform === 'instagram' ? 'IG_APP_ID / IG_APP_SECRET' : 'THREADS_APP_ID / THREADS_APP_SECRET';
    throw err(503, 'meta_not_configured', `Integrasi ${platform === 'instagram' ? 'Instagram' : 'Threads'} belum dikonfigurasi di server: isi ${k} di /etc/lrmsmm.env lalu restart (systemctl restart lrmsmm).`);
  }
  const st = randomToken(18);
  kvSet(`connect:${st}`, JSON.stringify({ platform, userId, returnTo, exp: Date.now() + 15 * 60_000 }));
  return clients[platform].authorizeUrl(st, redirectUri(platform));
}

export async function finishConnect(platform, code, st) {
  const raw = kvGet(`connect:${st}`);
  run('DELETE FROM kv WHERE k=?', `connect:${st}`);
  const s = raw && JSON.parse(raw);
  if (!s || s.platform !== platform || s.exp < Date.now()) throw err(400, 'invalid_state', 'Sesi penyambungan kedaluwarsa. Coba lagi.');
  const c = clients[platform];
  const { accessToken, expiresIn } = await c.exchangeCode(String(code).replace(/#_$/, ''), redirectUri(platform));
  const profile = await c.me(accessToken);
  const exp = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
  const existing = one('SELECT * FROM accounts WHERE platform=? AND platform_user_id=?', platform, profile.platformUserId);
  if (existing) {
    run(`UPDATE accounts SET username=?, name=?, avatar_url=?, token_enc=?, token_expires_at=?, token_issued_at=?, status='active', last_error=NULL,
         followers_count=COALESCE(?, followers_count), updated_at=? WHERE id=?`,
      profile.username, profile.name, profile.avatarUrl, encrypt(accessToken), exp, now(), profile.followers, now(), existing.id);
    assignIfRep(s.userId, existing.id);
    return { account: publicAccount(one('SELECT * FROM accounts WHERE id=?', existing.id)), returnTo: s.returnTo, reconnected: true, userId: s.userId };
  }
  const aid = id(platform === 'instagram' ? 'ig' : 'th');
  run(`INSERT INTO accounts(id,platform,platform_user_id,username,name,avatar_url,token_enc,token_expires_at,token_issued_at,followers_count,connected_by)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    aid, platform, profile.platformUserId, profile.username, profile.name, profile.avatarUrl, encrypt(accessToken), exp, now(), profile.followers, s.userId);
  assignIfRep(s.userId, aid);
  return { account: publicAccount(one('SELECT * FROM accounts WHERE id=?', aid)), returnTo: s.returnTo, reconnected: false, userId: s.userId };
}

function assignIfRep(userId, accountId) {
  const u = one('SELECT role FROM users WHERE id=?', userId);
  if (u && u.role !== 'owner') assignAccount(userId, accountId);
}

export function disconnect(accountId) {
  const a = getAccount(accountId);
  const affected = all("SELECT DISTINCT post_id FROM post_targets WHERE account_id=? AND status='pending'", a.id);
  run("UPDATE post_targets SET status='cancelled' WHERE account_id=? AND status='pending'", a.id);
  for (const r of affected) refreshPostStatus(r.post_id);
  run("UPDATE accounts SET status='disconnected', token_enc='', updated_at=? WHERE id=?", now(), a.id);
  run('DELETE FROM comments WHERE account_id=?', a.id);
  run('DELETE FROM insights_daily WHERE account_id=?', a.id);
}

export function markExpired(accountId, message) {
  run("UPDATE accounts SET status='expired', last_error=?, updated_at=? WHERE id=? AND status='active'", message || 'Token kedaluwarsa', now(), accountId);
}

// ---- token refresh job: long-lived tokens last 60 days; refresh when < 15 days left (token must be > 24h old) ----
export async function refreshExpiringTokens() {
  const soon = new Date(Date.now() + 15 * 864e5).toISOString();
  const dayAgo = new Date(Date.now() - 864e5).toISOString();
  const rows = all("SELECT * FROM accounts WHERE status='active' AND token_expires_at IS NOT NULL AND token_expires_at < ? AND token_issued_at < ?", soon, dayAgo);
  for (const a of rows) {
    try {
      const r = await clients[a.platform].refreshToken(tokenOf(a));
      run('UPDATE accounts SET token_enc=?, token_expires_at=?, token_issued_at=?, updated_at=? WHERE id=?',
        encrypt(r.accessToken), new Date(Date.now() + (r.expiresIn || 5184000) * 1000).toISOString(), now(), now(), a.id);
      console.log(`[token] refreshed ${a.platform} @${a.username}`);
    } catch (e) {
      console.warn(`[token] refresh failed @${a.username}: ${e.message}`);
      if (e.code === 'account_expired') markExpired(a.id, e.message);
    }
  }
  // Hard-expire tokens that are past expiry
  run("UPDATE accounts SET status='expired', last_error='Token kedaluwarsa, sambungkan ulang' WHERE status='active' AND token_expires_at IS NOT NULL AND token_expires_at < ?", now());
}

export async function publishingLimit(accountId) {
  const a = getAccount(accountId);
  const fn = clients[a.platform].publishingLimit;
  const r = await fn(a.platform_user_id, tokenOf(a));
  return { account_id: a.id, platform: a.platform, ...r };
}
