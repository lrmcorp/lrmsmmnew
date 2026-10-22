// Threads API (graph.threads.net)
import { config } from '../config.js';
import { gget, gpost, PlatformError } from './http.js';
import { sleep } from '../util.js';

const C = () => config.threads;
const G = (p) => `${C().graph}/${C().version}${p}`;

export function authorizeUrl(state, redirectUri) {
  const u = new URL(C().authorizeUrl);
  u.searchParams.set('client_id', C().appId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', C().scopes.join(','));
  u.searchParams.set('state', state);
  return u.toString();
}

export async function exchangeCode(code, redirectUri) {
  const short = await gpost(`${C().graph}/oauth/access_token`, {
    client_id: C().appId, client_secret: C().appSecret, grant_type: 'authorization_code', redirect_uri: redirectUri, code,
  });
  const long = await gget(`${C().graph}/access_token`, {
    grant_type: 'th_exchange_token', client_secret: C().appSecret, access_token: short.access_token,
  });
  return { accessToken: long.access_token, expiresIn: long.expires_in };
}

export async function refreshToken(token) {
  const r = await gget(`${C().graph}/refresh_access_token`, { grant_type: 'th_refresh_token', access_token: token });
  return { accessToken: r.access_token, expiresIn: r.expires_in };
}

export async function me(token) {
  const r = await gget(G('/me'), { fields: 'id,username,name,threads_profile_picture_url', access_token: token });
  return { platformUserId: String(r.id), username: r.username, name: r.name, avatarUrl: r.threads_profile_picture_url, followers: null };
}

async function waitContainer(token, cid, { timeoutMs = 5 * 60_000 } = {}) {
  const start = Date.now();
  let delay = config.mock ? 50 : 2000;
  while (Date.now() - start < timeoutMs) {
    const r = await gget(G(`/${cid}`), { fields: 'status,error_message', access_token: token });
    if (r.status === 'FINISHED' || r.status === 'PUBLISHED') return;
    if (r.status === 'ERROR' || r.status === 'EXPIRED') throw new PlatformError('media_invalid_format', `Threads could not process the media: ${r.error_message || r.status}`);
    await sleep(delay); delay = Math.min(delay * 1.5, 15000);
  }
  throw new PlatformError('platform_error', "Threads media processing timed out.", { transient: true });
}

function mediaParams(m) {
  const p = m.kind === 'video' ? { media_type: 'VIDEO', video_url: m.url } : { media_type: 'IMAGE', image_url: m.url };
  if (m.alt_text) p.alt_text = m.alt_text;
  return p;
}

async function createSingle({ userId, token, text, media = [], options = {}, replyTo }) {
  const base = { access_token: token };
  if (text) base.text = text;
  if (replyTo) base.reply_to_id = replyTo;
  if (options.reply_control) base.reply_control = options.reply_control;
  if (options.topic_tag) base.topic_tag = options.topic_tag;

  let cid;
  if (media.length === 0) {
    const p = { ...base, media_type: 'TEXT' };
    if (options.link_attachment) p.link_attachment = options.link_attachment;
    if (options.poll?.options?.length) {
      const keys = ['option_a', 'option_b', 'option_c', 'option_d'];
      p.poll_attachment = Object.fromEntries(options.poll.options.map((o, i) => [keys[i], o]));
    }
    if (options.text_attachment?.text) {
      p.text_attachment = { plaintext: options.text_attachment.text, ...(options.text_attachment.link_url ? { link_attachment_url: options.text_attachment.link_url } : {}) };
    }
    cid = (await gpost(G(`/${userId}/threads`), p)).id;
  } else if (media.length === 1) {
    cid = (await gpost(G(`/${userId}/threads`), { ...base, ...mediaParams(media[0]) })).id;
  } else {
    const children = [];
    for (const m of media) {
      const c = (await gpost(G(`/${userId}/threads`), { access_token: token, is_carousel_item: true, ...mediaParams(m) })).id;
      children.push(c);
    }
    for (const c of children) await waitContainer(token, c);
    cid = (await gpost(G(`/${userId}/threads`), { ...base, media_type: 'CAROUSEL', children: children.join(',') })).id;
  }
  await waitContainer(token, cid);
  const pub = await gpost(G(`/${userId}/threads_publish`), { creation_id: cid, access_token: token });
  return { containerId: cid, id: String(pub.id) };
}

/**
 * Publish a Threads post, optionally followed by thread parts (utas).
 * options.thread: (string | {text, media:[{kind,url,alt_text}]})[]
 */
export async function publish({ userId, token, text, media, options = {}, onContainer }) {
  const main = await createSingle({ userId, token, text, media, options });
  onContainer?.(main.containerId);
  let permalink = null;
  try { permalink = (await gget(G(`/${main.id}`), { fields: 'permalink', access_token: token })).permalink || null; } catch { /* ignore */ }

  const extra = [];
  let prev = main.id;
  for (const [i, part] of (options.thread || []).entries()) {
    const p = typeof part === 'string' ? { text: part, media: [] } : part;
    try {
      const r = await createSingle({ userId, token, text: p.text, media: p.media || [], options: { reply_control: options.reply_control }, replyTo: prev });
      extra.push(r.id); prev = r.id;
    } catch (e) {
      e.details = { thread_part: i + 2, published_parts: extra.length + 1 };
      e.partial = { id: main.id, permalink, extra };
      throw e;
    }
  }
  return { id: main.id, permalink, extra };
}

export async function publishingLimit(userId, token) {
  const r = await gget(G(`/${userId}/threads_publishing_limit`), { fields: 'quota_usage,config,reply_quota_usage', access_token: token });
  const d = r.data?.[0] || {};
  return { used: d.quota_usage ?? null, limit: d.config?.quota_total ?? 250, window_hours: 24 };
}

export async function listReplies(mediaId, token) {
  const out = [];
  let url = G(`/${mediaId}/conversation`);
  let params = { fields: 'id,text,username,timestamp,hide_status,is_reply_owned_by_me,replied_to{id}', reverse: false, access_token: token };
  for (let page = 0; page < 5 && url; page++) {
    const r = await gget(url, params);
    for (const c of r.data || []) {
      out.push({
        id: c.id, text: c.text, username: c.username, timestamp: c.timestamp,
        hidden: c.hide_status === 'HIDDEN', own: !!c.is_reply_owned_by_me,
        parent_id: c.replied_to?.id && c.replied_to.id !== mediaId ? c.replied_to.id : null,
      });
    }
    url = r.paging?.next || null; params = undefined;
  }
  return out;
}

export async function replyComment(commentId, message, { userId, token }) {
  return createSingle({ userId, token, text: message, replyTo: commentId });
}

export const hideReply = (replyId, hide, token) =>
  gpost(G(`/${replyId}/manage_reply`), { hide: !!hide, access_token: token });

export async function accountInsights(userId, token) {
  const since = Math.floor((Date.now() - 2 * 864e5) / 1000);
  const until = Math.floor(Date.now() / 1000);
  const r = await gget(G(`/${userId}/threads_insights`), {
    metric: 'views,likes,replies,reposts,quotes,clicks,followers_count', since, until, access_token: token,
  });
  const out = {};
  for (const m of r.data || []) {
    out[m.name] = m.total_value?.value ?? (m.values ? m.values.reduce((a, v) => a + (v.value || 0), 0) : null);
    if (m.name === 'clicks' && Array.isArray(m.link_total_values)) out.clicks = m.link_total_values.reduce((a, v) => a + (v.value || 0), 0);
  }
  return out;
}

export async function mediaInsights(mediaId, token) {
  const r = await gget(G(`/${mediaId}/insights`), { metric: 'views,likes,replies,reposts,quotes,shares', access_token: token });
  const out = {};
  for (const m of r.data || []) out[m.name] = m.values?.[0]?.value ?? m.total_value?.value ?? null;
  return out;
}

export async function recentMedia(userId, token, limit = 15) {
  const r = await gget(G(`/${userId}/threads`), { fields: 'id,timestamp,permalink,text', limit, access_token: token });
  return (r.data || []).map((m) => ({ id: m.id, timestamp: m.timestamp, permalink: m.permalink, text: m.text }));
}
