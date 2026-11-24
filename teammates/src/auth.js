// Two separate credentials, on purpose.
//
// The API bearer is the application talking to the bridge, machine to machine.
// The terminal ticket is a human at the console asking for a login shell; it is
// minted by the application only for an Owner with a live session, and carries
// its own short expiry so a copied URL stops working.
import crypto from 'node:crypto';

const TOKEN = process.env.INTERNAL_TOKEN || '';
export const configured = () => TOKEN.length >= 16;

const equal = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  // Length is compared first because timingSafeEqual throws on a mismatch; the
  // length of a bearer token is not the secret.
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** Express middleware: require the shared internal bearer. */
export function requireBearer(req, res, next) {
  if (!configured()) return res.status(503).json({ error: { code: 'not_configured', message: 'The bridge has no internal token configured.' } });
  const header = String(req.get('authorization') || '');
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token || !equal(token, TOKEN)) {
    return res.status(401).json({ error: { code: 'unauthenticated', message: 'A valid internal bearer token is required.' } });
  }
  next();
}

/**
 * Verify a terminal ticket minted by the application.
 * Format: base64url(JSON payload) + "." + base64url(HMAC-SHA256 of that payload).
 */
export function verifyTicket(ticket) {
  if (!configured() || typeof ticket !== 'string') return null;
  const [body, mac] = ticket.split('.');
  if (!body || !mac) return null;
  const expected = crypto.createHmac('sha256', TOKEN).update(body).digest('base64url');
  if (!equal(mac, expected)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (!payload?.exp || Date.now() > Number(payload.exp)) return null;
  return payload;
}

// CONSOLE_ORIGIN comes from PUBLIC_URL, which may carry a trailing slash or a
// path; the browser's Origin header never does. Comparing the raw strings made
// "https://example.com/" refuse "https://example.com". Both sides are reduced
// to scheme://host[:port] first.
const originOf = (value) => { try { return new URL(String(value).trim()).origin; } catch { return null; } };

/** Same-origin check for the WebSocket upgrade. */
export function sameOrigin(req) {
  const origin = req.headers.origin;
  // A non-browser client sends no Origin; the ticket is what authorises it.
  if (!origin) return true;
  const allowed = (process.env.CONSOLE_ORIGIN || '').split(',').map(originOf).filter(Boolean);
  if (!allowed.length) return false;
  return allowed.includes(originOf(origin));
}
