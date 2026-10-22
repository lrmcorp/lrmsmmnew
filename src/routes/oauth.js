// OAuth 2.1 authorization server for MCP clients (Claude, ChatGPT, etc.)
// Supports: dynamic client registration, authorization_code + PKCE (S256), refresh_token rotation.
import express from 'express';
import crypto from 'node:crypto';
import { one, run, id, now, sha256, kvGet, kvSet } from '../db.js';
import { err, randomToken } from '../util.js';
import { sessionUser } from '../auth.js';
import { config } from '../config.js';

export const oauth = express.Router();
const ACCESS_TTL = 3600;              // 1 hour
const REFRESH_TTL = 90 * 864e2;       // 90 days (seconds)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const asMetadata = () => ({
  issuer: config.publicUrl,
  authorization_endpoint: `${config.publicUrl}/oauth/authorize`,
  token_endpoint: `${config.publicUrl}/oauth/token`,
  registration_endpoint: `${config.publicUrl}/oauth/register`,
  revocation_endpoint: `${config.publicUrl}/oauth/revoke`,
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  code_challenge_methods_supported: ['S256'],
  token_endpoint_auth_methods_supported: ['none'],
  scopes_supported: ['read', 'write'],
});
export const prMetadata = () => ({
  resource: `${config.publicUrl}/mcp`,
  authorization_servers: [config.publicUrl],
  scopes_supported: ['read', 'write'],
  bearer_methods_supported: ['header'],
});

oauth.get('/.well-known/oauth-authorization-server', (_q, res) => res.json(asMetadata()));
oauth.get(['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'], (_q, res) => res.json(prMetadata()));

const validRedirect = (u) => {
  try {
    const x = new URL(u);
    if (x.protocol === 'https:') return true;
    if (x.protocol === 'http:') return ['localhost', '127.0.0.1', '[::1]'].includes(x.hostname);
    return !['javascript:', 'data:', 'file:', 'vbscript:'].includes(x.protocol); // custom schemes for desktop apps
  } catch { return false; }
};

oauth.post('/oauth/register', express.json(), (req, res) => {
  const uris = req.body?.redirect_uris;
  if (!Array.isArray(uris) || !uris.length || !uris.every(validRedirect)) {
    return res.status(400).json({ error: 'invalid_redirect_uri', error_description: "redirect_uris must use HTTPS or localhost." });
  }
  const clientId = `cl_${randomToken(16)}`;
  const name = String(req.body.client_name || 'Aplikasi AI').slice(0, 100);
  run('INSERT INTO oauth_clients(client_id,name,redirect_uris) VALUES(?,?,?)', clientId, name, JSON.stringify(uris));
  res.status(201).json({
    client_id: clientId, client_name: name, redirect_uris: uris, client_id_issued_at: Math.floor(Date.now() / 1000),
    grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none',
  });
});

function loadAuthRequest(q) {
  const client = one('SELECT * FROM oauth_clients WHERE client_id=?', q.client_id);
  if (!client) throw err(400, 'invalid_client', "Unknown client_id.");
  const uris = JSON.parse(client.redirect_uris);
  if (!uris.includes(q.redirect_uri)) throw err(400, 'invalid_redirect_uri', "redirect_uri is not registered.");
  if (q.response_type !== 'code') throw err(400, 'unsupported_response_type', "response_type must be code.");
  if (!q.code_challenge || q.code_challenge_method !== 'S256') throw err(400, 'invalid_request', "PKCE S256 is required.");
  return client;
}

oauth.get('/oauth/authorize', (req, res, next) => {
  try {
    const client = loadAuthRequest(req.query);
    const user = sessionUser(req);
    if (!user) return res.redirect(`/#/login?next=${encodeURIComponent(req.originalUrl)}`);
    const csrf = randomToken(18);
    kvSet(`csrf:${csrf}`, JSON.stringify({ u: user.id, exp: Date.now() + 10 * 60_000 }));
    const wantWrite = String(req.query.scope || 'read write').includes('write');
    const hidden = ['client_id', 'redirect_uri', 'state', 'code_challenge', 'code_challenge_method', 'resource']
      .map((k) => `<input type="hidden" name="${k}" value="${esc(req.query[k])}">`).join('');
    res.type('html').send(`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Izinkan akses · LRMsmm</title><link rel="stylesheet" href="/app.css"></head>
<body class="center-page"><form class="card consent" method="post" action="/oauth/authorize">
<div class="brand">LRM<span>smm</span></div>
<h1>${esc(client.name)} ingin mengakses LRMsmm</h1>
<p class="muted">Masuk sebagai <b>${esc(user.email)}</b>. Aplikasi ini akan bisa memakai akun Instagram & Threads yang terhubung di LRMsmm.</p>
${hidden}<input type="hidden" name="csrf" value="${csrf}">
<label class="opt"><input type="radio" name="scope" value="read" ${wantWrite ? '' : 'checked'}><span><b>Baca saja</b><br><small>Lihat akun, post, komentar, statistik</small></span></label>
<label class="opt"><input type="radio" name="scope" value="read write" ${wantWrite ? 'checked' : ''}><span><b>Baca dan kirim draf</b><br><small>Kirim caption dan gambar ke Tulis Post milik akun ini; balas DM/komentar dengan konfirmasi. Post hanya diterbitkan setelah disetujui di dashboard LRMsmm.</small></span></label>
<div class="row"><button class="btn" name="decision" value="deny" type="submit">Tolak</button><button class="btn primary" name="decision" value="allow" type="submit">Izinkan</button></div>
<p class="muted small">Setiap anggota menghubungkan akun LRMsmm sendiri. Akses hanya ke perusahaan/akun yang ditugaskan. Cabut koneksi dari Tulis Post → Koneksi AI pribadi.</p>
</form></body></html>`);
  } catch (e) { next(e); }
});

oauth.post('/oauth/authorize', express.urlencoded({ extended: false }), (req, res, next) => {
  try {
    const b = req.body;
    const client = loadAuthRequest({ ...b, response_type: 'code' });
    const user = sessionUser(req);
    const cs = kvGet(`csrf:${b.csrf}`); run('DELETE FROM kv WHERE k=?', `csrf:${b.csrf}`);
    const c = cs && JSON.parse(cs);
    if (!user || !c || c.u !== user.id || c.exp < Date.now()) throw err(400, 'invalid_request', "Approval session has expired. Start again from the AI app.");
    const back = new URL(b.redirect_uri);
    if (b.state) back.searchParams.set('state', b.state);
    if (b.decision !== 'allow') { back.searchParams.set('error', 'access_denied'); return res.redirect(back.toString()); }
    const code = randomToken(32);
    run('INSERT INTO oauth_codes(code_hash,client_id,user_id,redirect_uri,scope,code_challenge,resource,expires_at) VALUES(?,?,?,?,?,?,?,?)',
      sha256(code), client.client_id, user.id, b.redirect_uri, b.scope === 'read' ? 'read' : 'read write', b.code_challenge, b.resource || null,
      new Date(Date.now() + 5 * 60_000).toISOString());
    back.searchParams.set('code', code);
    res.redirect(back.toString());
  } catch (e) { next(e); }
});

function issueTokens(clientId, userId, scope) {
  const access = `lrma_${randomToken(32)}`;
  const refresh = `lrmr_${randomToken(32)}`;
  run(`INSERT INTO oauth_tokens(id,client_id,user_id,scope,access_hash,refresh_hash,access_expires_at,refresh_expires_at) VALUES(?,?,?,?,?,?,?,?)`,
    id('tok'), clientId, userId, scope, sha256(access), sha256(refresh),
    new Date(Date.now() + ACCESS_TTL * 1000).toISOString(), new Date(Date.now() + REFRESH_TTL * 1000).toISOString());
  return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL, refresh_token: refresh, scope };
}

oauth.post('/oauth/token', express.urlencoded({ extended: false }), express.json(), (req, res) => {
  const b = req.body || {};
  const fail = (e, d, s = 400) => res.status(s).json({ error: e, error_description: d });
  res.set('Cache-Control', 'no-store');
  if (b.grant_type === 'authorization_code') {
    const row = one('SELECT * FROM oauth_codes WHERE code_hash=?', sha256(String(b.code || '')));
    if (row) run('DELETE FROM oauth_codes WHERE code_hash=?', row.code_hash);
    if (!row || row.expires_at < now()) return fail('invalid_grant', 'Code is invalid or expired.');
    if (b.client_id && b.client_id !== row.client_id) return fail('invalid_grant', 'client_id does not match.');
    if (b.redirect_uri && b.redirect_uri !== row.redirect_uri) return fail('invalid_grant', 'redirect_uri does not match.');
    const challenge = crypto.createHash('sha256').update(String(b.code_verifier || '')).digest('base64url');
    if (challenge !== row.code_challenge) return fail('invalid_grant', 'code_verifier salah');
    return res.json(issueTokens(row.client_id, row.user_id, row.scope));
  }
  if (b.grant_type === 'refresh_token') {
    const row = one('SELECT * FROM oauth_tokens WHERE refresh_hash=? AND revoked_at IS NULL', sha256(String(b.refresh_token || '')));
    if (!row || row.refresh_expires_at < now()) return fail('invalid_grant', 'Invalid refresh token.');
    run('UPDATE oauth_tokens SET revoked_at=? WHERE id=?', now(), row.id); // rotate
    return res.json(issueTokens(row.client_id, row.user_id, row.scope));
  }
  fail('unsupported_grant_type', 'Unsupported grant_type.');
});

oauth.post('/oauth/revoke', express.urlencoded({ extended: false }), (req, res) => {
  const h = sha256(String(req.body?.token || ''));
  run('UPDATE oauth_tokens SET revoked_at=? WHERE (access_hash=? OR refresh_hash=?) AND revoked_at IS NULL', now(), h, h);
  res.status(200).end();
});
