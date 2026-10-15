// Meta-required callbacks: deauthorize/uninstall and data deletion (Instagram + Threads).
import express from 'express';
import crypto from 'node:crypto';
import { one, kvGet, kvSet } from '../db.js';
import { config } from '../config.js';
import { disconnect } from '../services/accounts.js';
import { randomToken } from '../util.js';

export const metaCb = express.Router();
metaCb.use(express.urlencoded({ extended: false }));

function parseSignedRequest(sr, secret) {
  const [sig, payload] = String(sr || '').split('.');
  if (!sig || !payload) return null;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(sig.replace(/=+$/, '')); const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return null; }
}

function handle(platform, kind) {
  const secret = platform === 'instagram' ? config.instagram.appSecret : config.threads.appSecret;
  return (req, res) => {
    const data = parseSignedRequest(req.body?.signed_request, secret);
    if (!data?.user_id) return res.status(400).json({ error: 'invalid signed_request' });
    const acc = one("SELECT id FROM accounts WHERE platform=? AND platform_user_id=? AND status != 'disconnected'", platform, String(data.user_id));
    if (acc) disconnect(acc.id);
    if (kind === 'uninstall') return res.json({ ok: true });
    const code = randomToken(10);
    kvSet(`deletion:${code}`, JSON.stringify({ platform, at: new Date().toISOString(), status: 'completed' }));
    res.json({ url: `${config.publicUrl}/data-deletion?code=${code}`, confirmation_code: code });
  };
}
for (const p of ['instagram', 'threads']) {
  metaCb.post(`/meta/${p}/uninstall`, handle(p, 'uninstall'));
  metaCb.post(`/meta/${p}/delete`, handle(p, 'delete'));
}
metaCb.get('/data-deletion', (req, res) => {
  const r = req.query.code ? kvGet(`deletion:${req.query.code}`) : null;
  const d = r && JSON.parse(r);
  res.type('html').send(`<!doctype html><meta name=viewport content="width=device-width"><link rel=stylesheet href="/app.css"><body class="center-page"><div class="card"><h1>Penghapusan data</h1>
  <p>${d ? `Permintaan dari ${d.platform} diterima ${new Date(d.at).toLocaleString('id-ID')}. Status: <b>selesai</b> — token, komentar, dan statistik akun sudah dihapus.` : 'Masukkan kode konfirmasi dari Meta di URL (?code=...).'}</p></div>`);
});
