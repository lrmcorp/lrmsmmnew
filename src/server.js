import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { one } from './db.js';
import { ApiError, err } from './util.js';
import { checkLogin, startSession, endSession, sessionUser, createUser, userCount, publicUser, revokeAllMachineAccess } from './auth.js';
import { hashPassword, verifyPassword } from './util.js';
import { run } from './db.js';
import { api } from './routes/api.js';
import { oauth } from './routes/oauth.js';
import { metaCb } from './routes/metaCallbacks.js';
import { mcpHandler } from './mcp.js';
import { beginConnect, finishConnect } from './services/accounts.js';
import { startWorker } from './worker.js';
import { mockRouter } from './meta/mock.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(cookieParser());
app.use((req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); next(); });

if (config.mock) {
  app.use('/__mock', mockRouter());
  console.log('[mock] META_MOCK=1 — Instagram & Threads are simulated at /__mock');
}

app.get('/healthz', (_q, res) => res.json({ ok: true, mock: config.mock }));

// CORS for MCP + OAuth discovery (browser-based MCP clients)
app.use(['/mcp', '/oauth', '/.well-known'], (req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version');
  res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.set('Access-Control-Expose-Headers', 'Mcp-Session-Id, WWW-Authenticate');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});
app.use(oauth);
app.use(metaCb);
app.all('/mcp', express.json({ limit: '4mb' }), mcpHandler);

// ---- public media (Meta fetches these URLs when publishing) ----
app.get('/m/:file', (req, res) => {
  const token = req.params.file.replace(/\.[a-z0-9]+$/i, '');
  const m = one("SELECT * FROM media WHERE public_token=? AND status='ready'", token);
  if (!m || !m.path || !fs.existsSync(m.path)) return res.status(404).end();
  res.set('Cache-Control', 'public, max-age=86400');
  res.type(m.mime).sendFile(m.path);
});

// ---- dashboard auth ----
const auth = express.Router();
auth.use(express.json());
auth.get('/state', (req, res) => res.json({ user: publicUser(sessionUser(req)), needs_setup: userCount() === 0, signup_open: config.allowSignup, mock: config.mock }));
auth.post('/register', (req, res) => {
  const first = userCount() === 0;
  if (!first && !config.allowSignup) throw err(403, 'signup_closed', 'Pendaftaran ditutup. Minta admin menambahkan akunmu.');
  const u = createUser({ ...req.body, role: first ? 'admin' : 'member' });
  startSession(res, req, u.id);
  res.status(201).json({ user: u });
});
auth.post('/login', (req, res) => { const u = checkLogin(req.body?.email, req.body?.password); startSession(res, req, u.id); res.json({ user: publicUser(u) }); });
auth.post('/logout', (req, res) => { endSession(req, res); res.json({ ok: true }); });
auth.post('/password', (req, res) => {
  const u = sessionUser(req);
  if (!u) throw err(401, 'unauthenticated', 'Login dulu');
  if (!verifyPassword(req.body?.current || '', u.password_hash)) throw err(400, 'invalid_credentials', 'Password lama salah');
  if (!req.body?.next || req.body.next.length < 8) throw err(400, 'validation_failed', 'Password baru minimal 8 karakter');
  run('UPDATE users SET password_hash=? WHERE id=?', hashPassword(req.body.next), u.id);
  run('DELETE FROM sessions WHERE user_id=?', u.id);
  revokeAllMachineAccess(u.id); // password change revokes all API keys and AI app access
  startSession(res, req, u.id);
  res.json({ ok: true });
});
app.use('/auth', auth);

// ---- social account connect (browser redirects) ----
app.get('/connect/:platform', (req, res, next) => {
  try {
    const u = sessionUser(req);
    if (!u) return res.redirect('/#/login');
    res.redirect(beginConnect(req.params.platform, u.id));
  } catch (e) { next(e); }
});
app.get('/connect/:platform/callback', async (req, res) => {
  const { code, state, error, error_description: ed } = req.query;
  if (error) return res.redirect(`/#/accounts?error=${encodeURIComponent(ed || error)}`);
  try {
    const r = await finishConnect(req.params.platform, code, state);
    res.redirect(`/#/accounts?connected=${encodeURIComponent('@' + r.account.username)}`);
  } catch (e) {
    console.warn('[connect]', e.message);
    res.redirect(`/#/accounts?error=${encodeURIComponent(e.message)}`);
  }
});

app.use('/v1', express.json({ limit: '2mb' }), api);
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

// ---- errors ----
app.use((e, req, res, _next) => {
  if (e?.type === 'entity.too.large') e = err(413, 'payload_too_large', 'File/body terlalu besar');
  if (e?.type === 'entity.parse.failed') e = err(400, 'validation_failed', 'JSON tidak valid');
  const isApi = req.path.startsWith('/v1') || req.path.startsWith('/auth') || req.path.startsWith('/oauth');
  if (!(e instanceof ApiError)) { console.error(e); e = err(500, 'internal_error', 'Terjadi kesalahan di server'); }
  if (isApi || req.accepts(['json', 'html']) === 'json') {
    return res.status(e.status).json({ error: { code: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) } });
  }
  res.status(e.status).type('html').send(`<!doctype html><link rel=stylesheet href="/app.css"><body class="center-page"><div class="card"><h1>Ups</h1><p>${String(e.message).replace(/</g, '&lt;')}</p><a class="btn" href="/">Kembali</a></div>`);
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(config.port, () => {
    console.log(`LRMsmm running on ${config.publicUrl} (port ${config.port})`);
    console.log(`  MCP endpoint: ${config.publicUrl}/mcp`);
    startWorker();
  });
}
