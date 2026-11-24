// The login terminal, carried over plain HTTP between the browser and this app.
//
// The browser used to open a WebSocket to /teammates/terminal. On the production
// host the reverse proxy in front of this app drops WebSocket upgrades: a
// handshake through the public URL answers 404 while the same handshake straight
// to the app answers 403, and enabling WebSocket support on the proxy host did
// not change that. So the browser now speaks plain HTTP only: output arrives as
// Server-Sent Events and keystrokes go up as small POSTs. This app holds the
// WebSocket to the bridge itself, inside the docker network, where no proxy is
// involved.
import crypto from 'node:crypto';
import { config } from '../config.js';
import { err } from '../util.js';
import { configured, mintTerminalTicket, assertOwnerMayUsePlans } from '../llm/plans.js';

const MAX_TERMINALS = 3;
const IDLE_MS = 10 * 60_000;
// Output printed before the browser's stream connects is kept, so the device
// code shown in the first second is never lost to that race.
const BACKLOG_BYTES = 64 * 1024;
const COMMANDS = new Set(['login', 'status']);

const terminals = new Map();

function bridgeSocketUrl(cmd, ticket) {
  const u = new URL(config.plans.baseUrl);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  u.pathname = '/teammates/terminal';
  u.search = '';
  u.searchParams.set('ticket', ticket);
  u.searchParams.set('cmd', cmd);
  return u.toString();
}

const frame = (event, payload) => `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
function emit(t, event, payload) { for (const res of t.listeners) res.write(frame(event, payload)); }

function touch(t) {
  clearTimeout(t.idle);
  t.idle = setTimeout(() => close(t.id), IDLE_MS);
  t.idle.unref?.();
}

function close(id) {
  const t = terminals.get(id);
  if (!t) return;
  terminals.delete(id);
  clearTimeout(t.idle);
  try { t.ws.close(); } catch { /* already closed */ }
  if (!t.ended) { t.ended = { code: 1000, reason: 'closed' }; emit(t, 'end', t.ended); }
  for (const res of t.listeners) res.end();
  t.listeners.clear();
}

/** The caller's own terminal, or 404: one user never reaches another's. */
function own(user, id) {
  const t = terminals.get(String(id));
  if (!t || t.userId !== user.id) throw err(404, 'not_found', "That terminal is not open.");
  return t;
}

export function openTerminal(user, cmd = 'login') {
  assertOwnerMayUsePlans(user);
  if (!configured()) throw err(503, 'plans_not_configured', "The plans service is not configured on this server.");
  if (!COMMANDS.has(cmd)) cmd = 'login';
  // One terminal per owner: a second Sign in replaces the first rather than
  // leaving a login waiting on a code nobody is looking at.
  for (const t of [...terminals.values()]) if (t.userId === user.id) close(t.id);
  if (terminals.size >= MAX_TERMINALS) throw err(429, 'plans_terminal_busy', "Too many terminals are open. Close one and try again.");

  const id = crypto.randomBytes(16).toString('hex');
  const ws = new WebSocket(bridgeSocketUrl(cmd, mintTerminalTicket(user)));
  const t = { id, userId: user.id, ws, listeners: new Set(), backlog: '', ended: null, idle: null, opened: false };
  ws.addEventListener('open', () => { t.opened = true; });
  ws.addEventListener('message', (e) => {
    const chunk = typeof e.data === 'string' ? e.data : '';
    if (!chunk) return;
    t.backlog = (t.backlog + chunk).slice(-BACKLOG_BYTES);
    emit(t, 'data', chunk);
  });
  ws.addEventListener('close', (e) => {
    if (!t.opened) {
      // The bridge refused or could not be reached; say so in the terminal,
      // because the browser has no other way to learn why.
      const note = '\r\nThe plans service did not accept the terminal. Check the teammates container log.\r\n';
      t.backlog += note; emit(t, 'data', note);
      console.warn(`[plans-terminal] bridge refused or unreachable for "${cmd}" (close ${e.code})`);
    }
    t.ended = { code: e.code, reason: e.reason || '' };
    emit(t, 'end', t.ended);
    // Keep the finished output briefly so a late stream still sees it.
    setTimeout(() => close(id), 60_000).unref?.();
  });
  ws.addEventListener('error', () => { /* a close event always follows */ });
  terminals.set(id, t);
  touch(t);
  return { id };
}

/** Attach an SSE response; replays what was printed before it connected. */
export function streamTerminal(user, id, res) {
  const t = own(user, id);
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders?.();
  if (t.backlog) res.write(frame('data', t.backlog));
  if (t.ended) { res.write(frame('end', t.ended)); return res.end(); }
  t.listeners.add(res);
  touch(t);
  // A comment line keeps intermediaries from closing an idle stream while the
  // owner is in another tab entering the code.
  const ping = setInterval(() => res.write(': ping\n\n'), 20_000);
  ping.unref?.();
  res.on('close', () => { clearInterval(ping); t.listeners.delete(res); });
}

export function sendInput(user, id, body) {
  const t = own(user, id);
  touch(t);
  if (t.ended || t.ws.readyState !== 1) throw err(409, 'plans_terminal_closed', "The terminal has already closed.");
  if (typeof body?.data === 'string' && body.data.length <= 4096) t.ws.send(JSON.stringify({ data: body.data }));
  else if (body?.resize && Number.isFinite(body.resize.cols) && Number.isFinite(body.resize.rows)) {
    t.ws.send(JSON.stringify({ resize: { cols: body.resize.cols | 0, rows: body.resize.rows | 0 } }));
  } else throw err(400, 'validation_failed', "Send data (at most 4,096 characters) or resize.");
  return { ok: true };
}

export function closeTerminal(user, id) { own(user, id); close(String(id)); return { ok: true }; }
export const _openCount = () => terminals.size;
