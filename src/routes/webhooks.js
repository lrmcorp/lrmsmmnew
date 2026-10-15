// Meta webhooks: real-time comments & DMs (Instagram) and replies (Threads).
// Configure in the Meta App: callback https://<PUBLIC_URL>/webhooks/instagram (and /webhooks/threads),
// verify token = WEBHOOK_VERIFY_TOKEN. Subscribe fields: comments, messages (IG); replies (Threads).
import express from 'express';
import crypto from 'node:crypto';
import { one } from '../db.js';
import { config } from '../config.js';
import { syncAccountComments } from '../services/engagement.js';
import { syncAccountMessages } from '../services/messages.js';

export const webhooks = express.Router();
const secretFor = (p) => (p === 'instagram' ? config.instagram.appSecret : config.threads.appSecret);

webhooks.get('/webhooks/:platform', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === config.webhookVerifyToken) {
    return res.type('text').send(String(req.query['hub.challenge'] || ''));
  }
  res.status(403).end();
});

// Debounce per account+kind so a burst of events triggers one targeted sync.
const timers = new Map();
function schedule(key, fn, ms = 1200) {
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => { timers.delete(key); fn().catch((e) => console.warn('[webhook]', e.message)); }, ms));
}

export const stats = { received: 0, rejected: 0, last_at: null };

webhooks.post('/webhooks/:platform', express.raw({ type: () => true, limit: '1mb' }), (req, res) => {
  const platform = req.params.platform;
  if (!['instagram', 'threads'].includes(platform)) return res.status(404).end();
  const sig = String(req.get('x-hub-signature-256') || '');
  const expected = 'sha256=' + crypto.createHmac('sha256', secretFor(platform)).update(req.body || '').digest('hex');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    stats.rejected++;
    return res.status(401).end();
  }
  res.status(200).end(); // ack fast; process async
  stats.received++; stats.last_at = new Date().toISOString();
  let body; try { body = JSON.parse(req.body.toString('utf8')); } catch { return; }

  if (platform === 'instagram') {
    for (const entry of body.entry || []) {
      const acc = one("SELECT * FROM accounts WHERE platform='instagram' AND platform_user_id=? AND status='active'", String(entry.id));
      if (!acc) continue;
      if (entry.messaging?.length) schedule(`dm:${acc.id}`, () => syncAccountMessages(acc), 300);
      if ((entry.changes || []).some((c) => ['comments', 'live_comments', 'mentions'].includes(c.field))) schedule(`cm:${acc.id}`, () => syncAccountComments(acc));
    }
  } else {
    const vals = Array.isArray(body.values) ? body.values : body.values ? [body.values] : [];
    for (const v of vals) {
      const ownerId = v.value?.root_post?.owner_id || body.target_id;
      const acc = ownerId ? one("SELECT * FROM accounts WHERE platform='threads' AND platform_user_id=? AND status='active'", String(ownerId)) : null;
      if (acc) schedule(`cm:${acc.id}`, () => syncAccountComments(acc));
    }
  }
});
