// Browser-facing path to the plans bridge.
//
// The bridge publishes no port: the compose file gives it none, and the design
// said "the only way in is the reverse proxy at /teammates/". That proxy is
// shared with other applications on this host, and changing it to make one
// feature work is exactly the kind of incidental edit this project forbids. So
// the application forwards the two browser-facing paths itself, over the docker
// network it already uses to reach the bridge.
//
// Only two paths are forwarded, and nothing else under /teammates/ is:
//   /teammates/assets/…  the terminal widget
//   /teammates/terminal  the login WebSocket
// The bridge's own API at /teammates/v1 stays server-to-server and must never
// become reachable from a browser, because the internal bearer token is what
// guards it and a browser would not be carrying one.
import http from 'node:http';
import { URL } from 'node:url';
import { config } from '../config.js';
import { sessionUser } from '../auth.js';

const ASSETS = /^\/teammates\/assets\/[A-Za-z0-9._/-]*$/;
const TERMINAL = '/teammates/terminal';

/** Where the bridge lives, derived from the base URL the app already uses. */
function upstream() {
  try {
    const u = new URL(config.plans?.baseUrl || '');
    return { hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80) };
  } catch { return null; }
}

/** Only the Owner may reach the bridge, as only the Owner may use the plan. */
const owner = (req) => {
  const user = sessionUser(req);
  return user && user.role === 'owner' ? user : null;
};

/** Express middleware: forward the terminal widget. */
export function plansAssets(req, res, next) {
  if (!ASSETS.test(req.path)) return next();
  const target = upstream();
  if (!target) return res.status(503).end();
  if (!owner(req)) return res.status(403).end();
  const proxied = http.request({
    ...target, method: 'GET', path: req.originalUrl,
    headers: { host: `${target.hostname}:${target.port}`, accept: req.get('accept') || '*/*' },
    timeout: 15_000,
  }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 502, {
      'content-type': upstreamRes.headers['content-type'] || 'application/octet-stream',
      'cache-control': 'private, max-age=3600',
    });
    upstreamRes.pipe(res);
  });
  proxied.on('timeout', () => proxied.destroy(new Error('timeout')));
  proxied.on('error', () => { if (!res.headersSent) res.status(502).end(); else res.end(); });
  proxied.end();
}

/**
 * Forward the terminal's WebSocket upgrade.
 *
 * The bridge checks its own ticket and the Origin header; this only decides
 * whether the request is worth forwarding at all, so an unauthenticated socket
 * never reaches it.
 */
export function attachPlansUpgrade(server) {
  server.on('upgrade', (req, socket, head) => {
    let path;
    try { path = new URL(req.url, 'http://localhost').pathname; } catch { return socket.destroy(); }
    if (path !== TERMINAL) return; // not ours; another handler may own it
    const target = upstream();
    const deny = (code, text, reason) => {
      console.warn(`[plans-proxy] terminal refused (${code}): ${reason}`);
      socket.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\n\r\n`); socket.destroy();
    };
    if (!target) return deny(503, 'Service Unavailable', 'PLANS_BRIDGE_URL is not a valid URL');
    if (!owner(req)) return deny(403, 'Forbidden', 'no Owner session on the upgrade request');

    const proxied = http.request({
      ...target, method: 'GET', path: req.url,
      headers: { ...req.headers, host: `${target.hostname}:${target.port}` },
    });
    proxied.on('upgrade', (upstreamRes, upstreamSocket, upstreamHead) => {
      const lines = Object.entries(upstreamRes.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n');
      socket.write(`HTTP/1.1 101 Switching Protocols\r\n${lines}\r\n\r\n`);
      if (upstreamHead?.length) socket.unshift(upstreamHead);
      upstreamSocket.pipe(socket).pipe(upstreamSocket);
      const close = () => { upstreamSocket.destroy(); socket.destroy(); };
      socket.on('error', close); upstreamSocket.on('error', close);
    });
    // The bridge refused before switching protocols: pass its answer through.
    proxied.on('response', (upstreamRes) => deny(upstreamRes.statusCode || 502, upstreamRes.statusMessage || 'Error', `bridge answered ${upstreamRes.statusCode} instead of switching protocols; see the teammates log`));
    proxied.on('error', (e) => deny(502, 'Bad Gateway', `bridge unreachable: ${e.code || e.message}`));
    if (head?.length) proxied.write(head);
    proxied.end();
  });
}
