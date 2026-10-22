// In-process fake of the Instagram & Threads Graph APIs, mounted at /__mock when META_MOCK=1.
// Lets the whole app (OAuth connect, publishing, comments, insights) run end-to-end without Meta.
// Magic strings in captions trigger errors:  #fail-expired  #fail-transient  #fail-permission
import express from 'express';
import crypto from 'node:crypto';
import { config } from '../config.js';

const rid = () => String(BigInt('0x' + crypto.randomBytes(7).toString('hex')));
const state = { containers: new Map(), media: new Map(), comments: new Map(), transientSeen: new Set(), convs: new Map(), seeded: new Set() };

function metaError(res, code, message, sub) {
  res.status(400).json({ error: { message, type: 'OAuthException', code, error_subcode: sub, fbtrace_id: 'mock' } });
}

function userFromToken(tok) {
  const m = String(tok || '').match(/^(?:ig|th)(?:short|long\d*)_(.+)$/);
  return m ? m[1] : null;
}

export function mockRouter() {
  const r = express.Router();
  r.use(express.urlencoded({ extended: false }));
  r.use(express.json());

  for (const plat of ['ig', 'th']) {
    // ---- OAuth consent screen ----
    r.get(`/${plat}/oauth/authorize`, (req, res) => {
      const { redirect_uri, state: st } = req.query;
      const name = plat === 'ig' ? 'Instagram' : 'Threads';
      const back = (u) => `${redirect_uri}?code=mockcode_${encodeURIComponent(u)}&state=${encodeURIComponent(st)}`;
      if (req.query.auto) return res.redirect(back(req.query.auto));
      res.type('html').send(`<!doctype html><meta name=viewport content="width=device-width"><body style="font-family:system-ui;max-width:420px;margin:60px auto;padding:0 16px">
        <h2>${name} (MOCK)</h2><p>This is a simulated development login. Choose an account to connect:</p>
        <form onsubmit="location.href='${back('')}'.replace('mockcode_','mockcode_'+encodeURIComponent(this.u.value));return false">
        <input name=u value="${plat === 'ig' ? 'kopisenja' : 'kopisenja.threads'}" style="padding:8px;width:100%"><br><br>
        <button style="padding:10px 16px">Allow</button></form>`);
    });
  }

  // ---- token endpoints ----
  r.post('/ig/oauth/access_token', (req, res) => {
    const u = String(req.body.code || '').replace(/^mockcode_/, '');
    if (!u) return metaError(res, 100, 'Invalid code');
    res.json({ access_token: `igshort_${u}`, user_id: `17841${u.length}000` });
  });
  r.post('/th/graph/oauth/access_token', (req, res) => {
    const u = String(req.body.code || '').replace(/^mockcode_/, '');
    if (!u) return metaError(res, 100, 'Invalid code');
    res.json({ access_token: `thshort_${u}`, user_id: `2${u.length}000` });
  });
  for (const plat of ['ig', 'th']) {
    r.get(`/${plat}/graph/access_token`, (req, res) => {
      const u = userFromToken(req.query.access_token);
      if (!u) return metaError(res, 190, 'Invalid OAuth access token');
      res.json({ access_token: `${plat}long_${u}`, token_type: 'bearer', expires_in: 5184000 });
    });
    r.get(`/${plat}/graph/refresh_access_token`, (req, res) => {
      const u = userFromToken(req.query.access_token);
      if (!u) return metaError(res, 190, 'Invalid OAuth access token');
      res.json({ access_token: `${plat}long${Date.now()}_${u}`, token_type: 'bearer', expires_in: 5184000 });
    });
  }

  const uidFor = (plat, u) => `${plat === 'ig' ? '17841' : '2'}${crypto.createHash('md5').update(u).digest('hex').replace(/\D/g, '').slice(0, 10)}`;

  // ---- graph ----
  for (const plat of ['ig', 'th']) {
    const base = `/${plat}/graph/:v`;
    const auth = (req, res) => {
      const tok = req.query.access_token || req.body?.access_token;
      const u = userFromToken(tok);
      if (!u || u.includes('expired')) { metaError(res, 190, 'Error validating access token: Session has expired'); return null; }
      return u;
    };

    r.get(`${base}/me`, (req, res) => {
      const u = auth(req, res); if (!u) return;
      const idv = uidFor(plat, u);
      if (plat === 'ig') res.json({ id: idv, user_id: idv, username: u, name: u.replace(/[._]/g, ' '), profile_picture_url: null, followers_count: 1234, account_type: 'BUSINESS' });
      else res.json({ id: idv, username: u, name: u, threads_profile_picture_url: null });
    });

    const createContainer = async (req, res) => {
      const u = auth(req, res); if (!u) return;
      const b = req.body;
      const text = b.caption ?? b.text ?? '';
      if (text.includes('#fail-expired')) return metaError(res, 190, 'Session has expired');
      if (text.includes('#fail-permission')) return metaError(res, 10, 'Application does not have permission for this action');
      if (text.includes('#fail-transient')) {
        const k = `${plat}:${text}`;
        if (!state.transientSeen.has(k)) { state.transientSeen.add(k); return res.status(500).json({ error: { message: 'An unexpected error has occurred. Please retry your request later.', code: 2, is_transient: true } }); }
      }
      if (plat === 'th' && text && [...text].length > 500) return metaError(res, 100, 'Text exceeds 500 characters');
      // Simulate Meta fetching the media URL (verifies the public media endpoint works)
      const url = b.image_url || b.video_url;
      if (url) {
        try {
          const f = await fetch(url, { method: 'HEAD' });
          if (!f.ok) return metaError(res, 9004, `Media fetch failed (${f.status})`, 2207052);
        } catch (e) { return metaError(res, 9004, `Media fetch failed: ${e.message}`, 2207052); }
      }
      if (plat === 'ig' && !url && b.media_type !== 'CAROUSEL') return metaError(res, 100, 'Media is required', 2207020);
      const cid = rid();
      state.containers.set(cid, { plat, user: u, ...b, polls: 0 });
      res.json({ id: cid });
    };
    r.post(`${base}/:uid/media`, createContainer);
    r.post(`${base}/:uid/threads`, createContainer);

    const publish = (req, res) => {
      const u = auth(req, res); if (!u) return;
      const c = state.containers.get(String(req.body.creation_id));
      if (!c) return metaError(res, 100, 'Invalid creation_id');
      const mid = rid();
      c.published = mid;
      state.media.set(mid, { plat, user: u, text: c.caption ?? c.text, reply_to: c.reply_to_id, permalink: plat === 'ig' ? `https://www.instagram.com/p/MOCK${mid.slice(-6)}/` : `https://www.threads.net/@${u}/post/MOCK${mid.slice(-6)}` });
      // A reply to a comment = our own reply
      if (c.reply_to_id && state.comments.has(c.reply_to_id)) {
        state.comments.get(c.reply_to_id).replies.push({ id: mid, text: c.text, username: u, own: true });
      }
      // Seed a couple of comments from "followers" so the inbox has data
      if (!c.reply_to_id && !c.is_carousel_item) {
        const seeds = plat === 'ig' ? [['rina.ardhani', 'Buka jam berapa kak? 😍'], ['bayu_w', 'Ada versi tanpa gula nggak?']] : [['kedaikecil', 'Kolab yuk bulan depan!']];
        for (const [who, t] of seeds) {
          const cmid = rid();
          state.comments.set(cmid, { id: cmid, media: mid, plat, username: who, text: t, ts: new Date().toISOString(), hidden: false, replies: [] });
        }
      }
      res.json({ id: mid });
    };
    r.post(`${base}/:uid/media_publish`, publish);
    r.post(`${base}/:uid/threads_publish`, publish);

    const recent = (req, res) => {
      const u = auth(req, res); if (!u) return;
      const data = [...state.media.entries()].filter(([, m]) => m.plat === plat && m.user === u && !m.reply_to)
        .map(([mid, m]) => ({ id: mid, timestamp: new Date().toISOString(), permalink: m.permalink, caption: m.text, text: m.text }));
      res.json({ data });
    };
    r.get(`${base}/:uid/media`, recent);

    // ---- Instagram DMs ----
    if (plat === 'ig') {
      const ensureSeed = (u, uid) => {
        if (state.seeded.has(u)) return;
        state.seeded.add(u);
        const mk = (who, msgs) => {
          const cid = `conv_${rid()}`;
          state.convs.set(cid, { owner: u, ownerId: uid, peer: { id: `ps_${who}`, username: who }, messages: msgs.map(([dir, text, agoMin]) => ({ id: `mid_${rid()}`, dir, text, at: new Date(Date.now() - agoMin * 60000).toISOString() })) });
        };
        mk('rina.ardhani', [['in', 'Kak, kelas Sabtu pagi masih ada slot?', 12]]);
        mk('bayu_w', [['in', 'Harga paket 10x berapa ya?', 40], ['out', 'Halo Kak! Paket 10x Rp1.500.000 ya 🙏', 35]]);
      };
      r.get(`${base}/:uid/conversations`, (req, res) => {
        const u = auth(req, res); if (!u) return;
        ensureSeed(u, req.params.uid);
        const data = [...state.convs.entries()].filter(([, c]) => c.owner === u).map(([cid, c]) => ({
          id: cid, updated_time: c.messages.at(-1)?.at,
          participants: { data: [{ id: req.params.uid, username: u }, { id: c.peer.id, username: c.peer.username }] },
        }));
        res.json({ data });
      });
      r.post(`${base}/:uid/messages`, (req, res) => {
        const u = auth(req, res); if (!u) return;
        const rec = typeof req.body.recipient === 'string' ? JSON.parse(req.body.recipient) : req.body.recipient;
        const msg = typeof req.body.message === 'string' ? JSON.parse(req.body.message) : req.body.message;
        const conv = [...state.convs.values()].find((c) => c.owner === u && c.peer.id === rec?.id);
        if (!conv) return metaError(res, 100, 'No matching user found', 2018001);
        const lastIn = [...conv.messages].reverse().find((m) => m.dir === 'in');
        if (!lastIn || Date.now() - new Date(lastIn.at) > 24 * 3600_000) return metaError(res, 10, 'This message is sent outside of allowed window.', 2534022);
        const mid = `mid_${rid()}`;
        conv.messages.push({ id: mid, dir: 'out', text: msg?.text, at: new Date().toISOString() });
        res.json({ recipient_id: rec.id, message_id: mid });
      });
    }
    r.get(`${base}/:uid/threads`, recent);
    r.get(`${base}/:uid/content_publishing_limit`, (req, res) => res.json({ data: [{ quota_usage: 1, config: { quota_total: 100, quota_duration: 86400 } }] }));
    r.get(`${base}/:uid/threads_publishing_limit`, (req, res) => res.json({ data: [{ quota_usage: 1, config: { quota_total: 250, quota_duration: 86400 } }] }));

    r.get(`${base}/:id/comments`, (req, res) => {
      const list = [...state.comments.values()].filter((c) => c.media === req.params.id && c.plat === 'ig');
      res.json({ data: list.map((c) => ({ id: c.id, text: c.text, username: c.username, timestamp: c.ts, hidden: c.hidden, from: { id: 'x', username: c.username }, replies: { data: c.replies.map((r2) => ({ id: r2.id, text: r2.text, username: r2.username, timestamp: c.ts, from: { id: 'self' } })) } })) });
    });
    r.get(`${base}/:id/conversation`, (req, res) => {
      const list = [...state.comments.values()].filter((c) => c.media === req.params.id && c.plat === 'th');
      const data = [];
      for (const c of list) {
        data.push({ id: c.id, text: c.text, username: c.username, timestamp: c.ts, hide_status: c.hidden ? 'HIDDEN' : 'NOT_HUSHED', is_reply_owned_by_me: false, replied_to: { id: req.params.id } });
        for (const r2 of c.replies) data.push({ id: r2.id, text: r2.text, username: r2.username, timestamp: c.ts, hide_status: 'NOT_HUSHED', is_reply_owned_by_me: true, replied_to: { id: c.id } });
      }
      res.json({ data });
    });
    r.post(`${base}/:id/replies`, (req, res) => {
      const u = auth(req, res); if (!u) return;
      const c = state.comments.get(req.params.id);
      if (!c) return metaError(res, 100, 'Comment not found');
      const nid = rid(); c.replies.push({ id: nid, text: req.body.message, username: u, own: true });
      res.json({ id: nid });
    });
    r.post(`${base}/:id/manage_reply`, (req, res) => {
      const c = state.comments.get(req.params.id); if (!c) return metaError(res, 100, 'Not found');
      c.hidden = req.body.hide === 'true'; res.json({ success: true });
    });
    r.get(`${base}/:uid/insights`, (req, res) => res.json({ data: String(req.query.metric).split(',').map((n) => ({ name: n, total_value: { value: Math.floor(Math.random() * 500) } })) }));
    r.get(`${base}/:uid/threads_insights`, (req, res) => res.json({ data: String(req.query.metric).split(',').map((n) => ({ name: n, total_value: { value: Math.floor(Math.random() * 500) } })) }));

    r.get(`${base}/:id`, (req, res) => {
      const conv = state.convs.get(req.params.id);
      if (conv) {
        return res.json({ id: req.params.id, messages: { data: [...conv.messages].reverse().map((m) => ({
          id: m.id, created_time: m.at, message: m.text,
          from: m.dir === 'in' ? { id: conv.peer.id, username: conv.peer.username } : { id: conv.ownerId, username: conv.owner },
          to: { data: [m.dir === 'in' ? { id: conv.ownerId } : { id: conv.peer.id }] },
        })) } });
      }
      const c = state.containers.get(req.params.id);
      if (c) {
        c.polls++;
        const isVideo = c.video_url || c.media_type === 'REELS' || c.media_type === 'VIDEO';
        const done = !isVideo || c.polls >= 2;
        return res.json({ id: req.params.id, status_code: done ? 'FINISHED' : 'IN_PROGRESS', status: done ? 'FINISHED' : 'IN_PROGRESS' });
      }
      const m = state.media.get(req.params.id);
      if (m) return res.json({ id: req.params.id, permalink: m.permalink });
      metaError(res, 100, 'Unsupported get request');
    });
    r.post(`${base}/:id`, (req, res) => { // IG hide comment
      const c = state.comments.get(req.params.id); if (!c) return metaError(res, 100, 'Not found');
      c.hidden = req.body.hide === 'true'; res.json({ success: true });
    });
  }
  // Test/demo helper: simulate an inbound DM and deliver a signed webhook to the app.
  r.post('/ig/simulate/dm', async (req, res) => {
    const { owner, owner_id, from, text } = req.body;
    let conv = [...state.convs.values()].find((c) => c.owner === owner && c.peer.username === from);
    if (!conv) { conv = { owner, ownerId: owner_id, peer: { id: `ps_${from}`, username: from }, messages: [] }; state.convs.set(`conv_${rid()}`, conv); }
    const mid = `mid_${rid()}`;
    conv.messages.push({ id: mid, dir: 'in', text, at: new Date().toISOString() });
    const body = JSON.stringify({ object: 'instagram', entry: [{ id: owner_id, time: Date.now(), messaging: [{ sender: { id: conv.peer.id }, recipient: { id: owner_id }, timestamp: Date.now(), message: { mid, text } }] }] });
    const sig = 'sha256=' + crypto.createHmac('sha256', config.instagram.appSecret).update(body).digest('hex');
    const w = await fetch(`${config.publicUrl}/webhooks/instagram`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig }, body });
    res.json({ ok: true, webhook_status: w.status, mid });
  });
  return r;
}
