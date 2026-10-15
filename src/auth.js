import { one, run, all, id, sha256, now } from './db.js';
import { err, randomToken, hashPassword, verifyPassword } from './util.js';
import { config } from './config.js';

const SESSION_COOKIE = 'siar_sid';
const SESSION_DAYS = 30;

// ---------- users ----------
export function createUser({ email, password, name, role = 'member' }) {
  email = String(email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw err(400, 'validation_failed', 'Email tidak valid');
  if (!password || password.length < 8) throw err(400, 'validation_failed', 'Password minimal 8 karakter');
  if (one('SELECT 1 FROM users WHERE email=?', email)) throw err(409, 'email_taken', 'Email sudah terdaftar');
  const uid = id('u');
  run('INSERT INTO users(id,email,name,password_hash,role) VALUES(?,?,?,?,?)', uid, email, name || null, hashPassword(password), role);
  return publicUser(one('SELECT * FROM users WHERE id=?', uid));
}
export const userCount = () => one('SELECT COUNT(*) n FROM users').n;
export const publicUser = (u) => u && ({ id: u.id, email: u.email, name: u.name, role: u.role, created_at: u.created_at });

export function checkLogin(email, password) {
  const u = one('SELECT * FROM users WHERE email=?', String(email || '').trim().toLowerCase());
  if (!u || !verifyPassword(password || '', u.password_hash)) throw err(401, 'invalid_credentials', 'Email atau password salah');
  return u;
}

// ---------- sessions ----------
export function startSession(res, req, userId) {
  const token = randomToken(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  run('INSERT INTO sessions(id_hash,user_id,expires_at,ip,user_agent) VALUES(?,?,?,?,?)',
    sha256(token), userId, expires.toISOString(), req.ip, String(req.headers['user-agent'] || '').slice(0, 300));
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: config.publicUrl.startsWith('https'), expires, path: '/',
  });
}
export function endSession(req, res) {
  const t = req.cookies?.[SESSION_COOKIE];
  if (t) run('DELETE FROM sessions WHERE id_hash=?', sha256(t));
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}
export function sessionUser(req) {
  const t = req.cookies?.[SESSION_COOKIE];
  if (!t) return null;
  const s = one('SELECT * FROM sessions WHERE id_hash=? AND expires_at > ?', sha256(t), now());
  if (!s) return null;
  return one('SELECT * FROM users WHERE id=?', s.user_id) || null;
}

// ---------- API keys ----------
export function createApiKey(userId, name, scope) {
  if (!['read', 'write'].includes(scope)) throw err(400, 'validation_failed', 'scope harus read atau write');
  const active = one('SELECT COUNT(*) n FROM api_keys WHERE user_id=? AND revoked_at IS NULL', userId).n;
  if (active >= 25) throw err(400, 'too_many_keys', 'Maksimal 25 API key aktif');
  const key = `sr_live_${randomToken(24)}`;
  const kid = id('key');
  run('INSERT INTO api_keys(id,user_id,name,prefix,key_hash,scope) VALUES(?,?,?,?,?,?)',
    kid, userId, String(name || 'API key').slice(0, 80), key.slice(0, 12), sha256(key), scope);
  return { id: kid, name, scope, prefix: key.slice(0, 12), key };
}
export const listApiKeys = (userId) => all(
  'SELECT id,name,prefix,scope,last_used_at,created_at FROM api_keys WHERE user_id=? AND revoked_at IS NULL ORDER BY created_at DESC', userId);
export const revokeApiKey = (userId, kid) =>
  run('UPDATE api_keys SET revoked_at=? WHERE id=? AND user_id=? AND revoked_at IS NULL', now(), kid, userId).changes;

export function revokeAllMachineAccess(userId) {
  run('UPDATE api_keys SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL', now(), userId);
  run('UPDATE oauth_tokens SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL', now(), userId);
}

// ---------- bearer resolution (API key or OAuth access token) ----------
export function resolveBearer(token) {
  if (!token) return null;
  const h = sha256(token);
  if (token.startsWith('sr_live_')) {
    const k = one('SELECT * FROM api_keys WHERE key_hash=? AND revoked_at IS NULL', h);
    if (!k) throw err(401, 'invalid_api_key', 'API key tidak valid atau sudah dicabut');
    run('UPDATE api_keys SET last_used_at=? WHERE id=?', now(), k.id);
    return { user: one('SELECT * FROM users WHERE id=?', k.user_id), scope: k.scope, via: 'api_key', credentialId: k.id };
  }
  const t = one('SELECT * FROM oauth_tokens WHERE access_hash=? AND revoked_at IS NULL', h);
  if (!t || t.access_expires_at < now()) throw err(401, 'invalid_token', 'Token tidak valid atau kedaluwarsa');
  run('UPDATE oauth_tokens SET last_used_at=? WHERE id=?', now(), t.id);
  return { user: one('SELECT * FROM users WHERE id=?', t.user_id), scope: t.scope.includes('write') ? 'write' : 'read', via: 'oauth', credentialId: t.id, clientId: t.client_id };
}

/** Express middleware: accepts session cookie (dashboard) or Bearer token. */
export function authenticate(req, _res, next) {
  try {
    const h = req.headers.authorization || '';
    if (h.startsWith('Bearer ')) {
      req.auth = resolveBearer(h.slice(7).trim());
    } else {
      const u = sessionUser(req);
      if (u) req.auth = { user: u, scope: 'write', via: 'session' };
    }
    if (!req.auth?.user) throw err(401, 'unauthenticated', 'Login atau kirim header Authorization: Bearer <key>');
    next();
  } catch (e) { next(e); }
}
export const requireWrite = (req, _res, next) =>
  req.auth?.scope === 'write' ? next() : next(err(403, 'insufficient_scope', 'Akses ini hanya baca (read). Butuh scope write.'));
export const requireAdmin = (req, _res, next) =>
  req.auth?.user?.role === 'admin' ? next() : next(err(403, 'forbidden', 'Hanya admin'));
