// Instagram API with Instagram Login (graph.instagram.com) — Business/Creator accounts.
import { config } from '../config.js';
import { gget, gpost, PlatformError } from './http.js';
import { sleep } from '../util.js';

const C = () => config.instagram;
const G = (p) => `${C().graph}/${C().version}${p}`;

export function authorizeUrl(state, redirectUri) {
  const u = new URL(C().authorizeUrl);
  u.searchParams.set('client_id', C().appId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', C().scopes.join(','));
  u.searchParams.set('state', state);
  u.searchParams.set('enable_fb_login', '0');
  u.searchParams.set('force_authentication', '1');
  return u.toString();
}

export async function exchangeCode(code, redirectUri) {
  const short = await gpost(C().tokenUrl, {
    client_id: C().appId, client_secret: C().appSecret, grant_type: 'authorization_code', redirect_uri: redirectUri, code,
  });
  const long = await gget(`${C().graph}/access_token`, {
    grant_type: 'ig_exchange_token', client_secret: C().appSecret, access_token: short.access_token,
  });
  return { accessToken: long.access_token, expiresIn: long.expires_in };
}

export async function refreshToken(token) {
  const r = await gget(`${C().graph}/refresh_access_token`, { grant_type: 'ig_refresh_token', access_token: token });
  return { accessToken: r.access_token, expiresIn: r.expires_in };
}

export async function me(token) {
  const r = await gget(G('/me'), { fields: 'user_id,username,name,profile_picture_url,followers_count,account_type', access_token: token });
  return { platformUserId: String(r.user_id || r.id), username: r.username, name: r.name, avatarUrl: r.profile_picture_url, followers: r.followers_count ?? null };
}

async function waitContainer(token, containerId, { timeoutMs = 5 * 60_000 } = {}) {
  const start = Date.now();
  let delay = config.mock ? 50 : 3000;
  while (Date.now() - start < timeoutMs) {
    const r = await gget(G(`/${containerId}`), { fields: 'status_code,status', access_token: token });
    if (r.status_code === 'FINISHED' || r.status_code === 'PUBLISHED') return;
    if (r.status_code === 'ERROR' || r.status_code === 'EXPIRED') {
      throw new PlatformError('media_invalid_format', `Instagram gagal memproses media: ${r.status || r.status_code}`);
    }
    await sleep(delay); delay = Math.min(delay * 1.5, 15000);
  }
  throw new PlatformError('platform_error', 'Instagram masih memproses media terlalu lama', { transient: true });
}

/**
 * Publish to Instagram.
 * @param {{igUserId:string, token:string, caption:string, media:{kind:string,url:string,alt_text?:string}[], options:object, onContainer?:(id:string)=>void}} p
 */
export async function publish({ igUserId, token, caption, media, options = {}, onContainer }) {
  if (!media?.length) throw new PlatformError('media_required', 'Instagram wajib minimal 1 foto atau video');
  const fmt = options.format || 'feed';
  let containerId;

  if (fmt === 'story') {
    const m = media[0];
    const p = { media_type: 'STORIES', access_token: token };
    if (m.kind === 'video') p.video_url = m.url; else p.image_url = m.url;
    containerId = (await gpost(G(`/${igUserId}/media`), p)).id;
  } else if (media.length === 1) {
    const m = media[0];
    const p = { caption, access_token: token };
    if (m.kind === 'video') {
      Object.assign(p, { media_type: 'REELS', video_url: m.url, share_to_feed: options.share_to_feed ?? true });
      if (options.cover_url) p.cover_url = options.cover_url;
      if (options.thumb_offset_ms != null) p.thumb_offset = options.thumb_offset_ms;
    } else {
      p.image_url = m.url;
      if (m.alt_text) p.alt_text = m.alt_text;
    }
    containerId = (await gpost(G(`/${igUserId}/media`), p)).id;
  } else {
    const children = [];
    for (const m of media) {
      const p = { is_carousel_item: true, access_token: token };
      if (m.kind === 'video') { p.media_type = 'VIDEO'; p.video_url = m.url; }
      else { p.image_url = m.url; if (m.alt_text) p.alt_text = m.alt_text; }
      const cid = (await gpost(G(`/${igUserId}/media`), p)).id;
      if (m.kind === 'video') await waitContainer(token, cid);
      children.push(cid);
    }
    containerId = (await gpost(G(`/${igUserId}/media`), {
      media_type: 'CAROUSEL', children: children.join(','), caption, access_token: token,
    })).id;
  }
  onContainer?.(containerId);
  await waitContainer(token, containerId);
  const pub = await gpost(G(`/${igUserId}/media_publish`), { creation_id: containerId, access_token: token });
  let permalink = null;
  try { permalink = (await gget(G(`/${pub.id}`), { fields: 'permalink', access_token: token })).permalink || null; } catch { /* stories have no permalink */ }
  return { id: String(pub.id), permalink };
}

export async function publishingLimit(igUserId, token) {
  const r = await gget(G(`/${igUserId}/content_publishing_limit`), { fields: 'quota_usage,config', access_token: token });
  const d = r.data?.[0] || {};
  return { used: d.quota_usage ?? null, limit: d.config?.quota_total ?? 100, window_hours: 24 };
}

export async function listComments(mediaId, token) {
  const out = [];
  let url = G(`/${mediaId}/comments`);
  let params = { fields: 'id,text,username,timestamp,hidden,from{id,username},replies{id,text,username,timestamp,from{id}}', limit: 50, access_token: token };
  for (let page = 0; page < 5 && url; page++) {
    const r = await gget(url, params);
    for (const c of r.data || []) {
      out.push({ id: c.id, text: c.text, username: c.username || c.from?.username, timestamp: c.timestamp, hidden: !!c.hidden, from_id: c.from?.id, parent_id: null });
      for (const rep of c.replies?.data || []) {
        out.push({ id: rep.id, text: rep.text, username: rep.username, timestamp: rep.timestamp, hidden: false, from_id: rep.from?.id, parent_id: c.id });
      }
    }
    url = r.paging?.next || null; params = undefined;
  }
  return out;
}

export const replyComment = (commentId, message, token) =>
  gpost(G(`/${commentId}/replies`), { message, access_token: token });

export const hideComment = (commentId, hide, token) =>
  gpost(G(`/${commentId}`), { hide: !!hide, access_token: token });

export async function accountInsights(igUserId, token) {
  const metrics = ['reach', 'views', 'accounts_engaged', 'total_interactions', 'likes', 'comments', 'saves', 'shares'];
  const since = Math.floor((Date.now() - 2 * 864e5) / 1000);
  const r = await gget(G(`/${igUserId}/insights`), { metric: metrics.join(','), period: 'day', metric_type: 'total_value', since, access_token: token });
  const out = {};
  for (const m of r.data || []) out[m.name] = m.total_value?.value ?? m.values?.at(-1)?.value ?? null;
  return out;
}

export async function mediaInsights(mediaId, token) {
  const r = await gget(G(`/${mediaId}/insights`), { metric: 'views,reach,likes,comments,saved,shares,total_interactions', access_token: token });
  const out = {};
  for (const m of r.data || []) out[m.name === 'saved' ? 'saves' : m.name] = m.values?.[0]?.value ?? m.total_value?.value ?? null;
  return out;
}

export async function recentMedia(igUserId, token, limit = 15) {
  const r = await gget(G(`/${igUserId}/media`), { fields: 'id,timestamp,permalink,caption', limit, access_token: token });
  return (r.data || []).map((m) => ({ id: m.id, timestamp: m.timestamp, permalink: m.permalink, text: m.caption }));
}

// ---------------- Direct messages (instagram_business_manage_messages) ----------------
export async function listConversations(igUserId, token, limit = 25) {
  const r = await gget(G(`/${igUserId}/conversations`), { platform: 'instagram', fields: 'id,updated_time,participants', limit, access_token: token });
  if (!Array.isArray(r.data)) throw new PlatformError('invalid_response', 'Instagram tidak mengembalikan daftar percakapan yang valid.');
  return r.data.map((c) => ({
    id: c.id, updated_time: c.updated_time,
    participants: (c.participants?.data || []).map((p) => ({ id: String(p.id), username: p.username, name: p.name })),
  }));
}

export async function conversationMessages(conversationId, token, limit = 25) {
  const r = await gget(G(`/${conversationId}`), { fields: `messages.limit(${limit}){id,created_time,from,to,message,attachments}`, access_token: token });
  if (!Array.isArray(r.messages?.data)) throw new PlatformError('invalid_response', 'Instagram tidak mengembalikan daftar pesan yang valid.');
  return r.messages.data.map((m) => ({
    id: m.id, created_time: m.created_time, from_id: String(m.from?.id || ''), from_username: m.from?.username,
    text: m.message || '', attachments: m.attachments?.data?.map((a) => ({ type: a.mime_type || a.type || 'file', url: a.image_data?.url || a.video_data?.url || a.file_url || null })) || [],
  }));
}

export async function sendMessage(igUserId, recipientId, text, token) {
  const r = await gpost(G(`/${igUserId}/messages`), { recipient: { id: recipientId }, message: { text }, access_token: token });
  return { id: String(r.message_id || r.id), recipient_id: r.recipient_id };
}
