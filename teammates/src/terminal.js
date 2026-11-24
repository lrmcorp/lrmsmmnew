// The login terminal: a real pty running `codex login --device-auth`, bridged
// to xterm.js in the console over a WebSocket.
//
// A pty is used rather than piped stdio because the CLI draws its device-code
// screen for a terminal. Only the login command is ever run here: this is not a
// general shell, and the allowlist below is the whole of what it will start.
import { WebSocketServer } from 'ws';
import pty from 'node-pty';
import { verifyTicket, sameOrigin } from './auth.js';
import { CODEX_BIN, childEnv } from './codex.js';

const MAX_TERMINALS = Number(process.env.MAX_TERMINALS || 3);
const IDLE_MS = Number(process.env.TERMINAL_IDLE_MS || 10 * 60_000);

// The only argument vectors this endpoint will ever spawn.
const COMMANDS = {
  login: ['login', '--device-auth'],
  status: ['login', 'status'],
  logout: ['logout'],
};

export function attachTerminal(server, { path = '/teammates/terminal' } = {}) {
  const wss = new WebSocketServer({ noServer: true });
  let open = 0;

  server.on('upgrade', (req, socket, head) => {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { return socket.destroy(); }
    if (url.pathname !== path) return; // another handler may own it

    // Every refusal is logged with its reason: a browser reports a failed
    // WebSocket handshake only as "connection failed", so the server log is the
    // one place the cause can be read. The ticket itself is never logged.
    const deny = (code, why, reason) => {
      console.warn(`[teammates] terminal refused (${code}): ${reason}`);
      socket.write(`HTTP/1.1 ${code} ${why}\r\nConnection: close\r\n\r\n`);
      socket.destroy();
    };
    if (!sameOrigin(req)) return deny(403, 'Forbidden', `origin ${JSON.stringify(req.headers.origin)} is not CONSOLE_ORIGIN ${JSON.stringify(process.env.CONSOLE_ORIGIN || '')}`);
    const ticket = verifyTicket(url.searchParams.get('ticket'));
    if (!ticket) return deny(401, 'Unauthorized', 'ticket missing, expired or not signed with this INTERNAL_TOKEN');
    if (open >= MAX_TERMINALS) return deny(429, 'Too Many Requests', `${open} terminals already open`);

    wss.handleUpgrade(req, socket, head, (ws) => {
      open++;
      const command = COMMANDS[url.searchParams.get('cmd')] || COMMANDS.login;
      const term = pty.spawn(CODEX_BIN, command, {
        name: 'xterm-256color', cols: 100, rows: 30,
        cwd: process.env.HOME || '/home/codex',
        env: { ...childEnv(), TERM: 'xterm-256color' },
      });

      let idle = setTimeout(() => ws.close(4408, 'idle'), IDLE_MS);
      const touch = () => { clearTimeout(idle); idle = setTimeout(() => ws.close(4408, 'idle'), IDLE_MS); };

      term.onData((data) => { if (ws.readyState === ws.OPEN) ws.send(data); });
      term.onExit(({ exitCode }) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(`\r\n\x1b[90m[codex ${command.join(' ')} exited with ${exitCode}]\x1b[0m\r\n`);
          ws.close(1000, 'exited');
        }
      });

      ws.on('message', (raw) => {
        touch();
        let msg; try { msg = JSON.parse(String(raw)); } catch { return; }
        // Keystrokes go to the pty; the device-code flow needs nothing else.
        if (typeof msg.data === 'string') term.write(msg.data);
        else if (msg.resize) term.resize(Math.max(20, msg.resize.cols | 0), Math.max(5, msg.resize.rows | 0));
      });

      const close = () => {
        clearTimeout(idle);
        try { term.kill(); } catch { /* already gone */ }
        open = Math.max(0, open - 1);
      };
      ws.on('close', close);
      ws.on('error', close);
    });
  });

  return wss;
}
