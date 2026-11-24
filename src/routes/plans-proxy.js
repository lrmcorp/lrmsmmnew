// Browser-facing path to the plans bridge.
//
// The bridge publishes no port: the compose file gives it none, and the design
// said "the only way in is the reverse proxy at /teammates/". That proxy is
// shared with other applications on this host, and changing it to make one
// feature work is exactly the kind of incidental edit this project forbids. So
// the application forwards the two browser-facing paths itself, over the docker
// network it already uses to reach the bridge.
//
// Only the terminal widget is forwarded, and nothing else under /teammates/ is.
// The login terminal itself travels over /v1/ai-plans/terminals as plain HTTP,
// because the reverse proxy in front of production drops WebSocket upgrades.
// The bridge's own API at /teammates/v1 stays server-to-server and must never
// become reachable from a browser, because the internal bearer token is what
// guards it and a browser would not be carrying one.
import http from 'node:http';
import { URL } from 'node:url';
import { config } from '../config.js';
import { sessionUser } from '../auth.js';

const ASSETS = /^\/teammates\/assets\/[A-Za-z0-9._/-]*$/;

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
