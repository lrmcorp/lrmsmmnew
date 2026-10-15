// Shared HTTP helper for Meta Graph APIs (Instagram + Threads) with error mapping.
export class PlatformError extends Error {
  constructor(code, message, { transient = false, raw } = {}) {
    super(message);
    this.code = code; this.transient = transient; this.raw = raw;
  }
}

// Map Meta error payloads into stable LRMsmm error codes.
export function mapMetaError(status, body) {
  const e = body?.error || {};
  const code = Number(e.code), sub = Number(e.error_subcode);
  const msg = e.error_user_msg || e.message || `HTTP ${status}`;
  if (code === 190 || sub === 463 || sub === 460) return new PlatformError('account_expired', msg, { raw: e });
  if (code === 10 || (code >= 200 && code < 300)) return new PlatformError('permission_missing', msg, { raw: e });
  if ([4, 17, 32, 613, 80001, 80002].includes(code)) return new PlatformError('rate_limited', msg, { transient: true, raw: e });
  if (sub === 2207042 || sub === 2207051) return new PlatformError('publish_limit_reached', msg, { raw: e });
  if (sub === 2207052 || sub === 2207003 || sub === 2207020 || code === 9004) return new PlatformError('media_fetch_failed', msg, { raw: e });
  if (code === 36003 || sub === 2207009) return new PlatformError('aspect_ratio_invalid', msg, { raw: e });
  if (code === 36001 || sub === 2207004) return new PlatformError('image_too_large', msg, { raw: e });
  if (sub === 2207026 || sub === 2207001 || code === 352) return new PlatformError('media_invalid_format', msg, { raw: e });
  if (code === 1 || code === 2 || status >= 500 || e.is_transient) return new PlatformError('platform_error', msg, { transient: true, raw: e });
  return new PlatformError('platform_error', msg, { raw: e });
}

async function call(method, url, params = {}) {
  const u = new URL(url);
  let body;
  if (method === 'GET') {
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
  } else {
    body = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) body.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  let res;
  try {
    res = await fetch(u, { method, body, signal: AbortSignal.timeout(60000) });
  } catch (e) {
    throw new PlatformError('platform_error', `Network error: ${e.message}`, { transient: true });
  }
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok || json?.error) throw mapMetaError(res.status, json);
  return json;
}

export const gget = (url, params) => call('GET', url, params);
export const gpost = (url, params) => call('POST', url, params);
