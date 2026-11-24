// Config → AI plans: sign the Codex CLI into the owner's ChatGPT subscription.
//
// The terminal is a real pty in the bridge container, reached over a WebSocket.
// Nothing about the login happens in this page: it only draws what the CLI
// prints and forwards what the owner types, so no credential is ever handled by
// the browser or by the application.
const ASSET_BASE = '/teammates/assets/vendor';

let xtermReady = null;
function loadXterm() {
  // Loaded on demand and from the bridge, so the console pays nothing for it
  // until an owner actually opens this tab.
  xtermReady ??= (async () => {
    if (globalThis.Terminal) return globalThis.Terminal;
    // Ask first, so a failure says why. A <script> tag that fails reports
    // nothing but "error", which is how this page once told the owner only
    // that the terminal "could not be loaded" with no way to tell a refused
    // request from a missing file or an unreachable service.
    const probe = await fetch(`${ASSET_BASE}/xterm.js`, { credentials: 'same-origin', cache: 'no-store' }).catch((e) => ({ ok: false, status: 0, statusText: e.message }));
    if (!probe.ok) {
      const why = probe.status === 403 ? 'access was refused (sign in again as the workspace Owner)'
        : probe.status === 404 ? 'the file was not found on the plans service'
        : probe.status === 502 || probe.status === 503 ? 'the plans service did not answer'
        : probe.status === 0 ? `the request failed: ${probe.statusText}`
        : `HTTP ${probe.status}`;
      throw new Error(`The terminal could not be loaded: ${why}.`);
    }
    return new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = `${ASSET_BASE}/xterm.css`;
    document.head.append(css);
    const script = document.createElement('script');
    script.src = `${ASSET_BASE}/xterm.js`;
    script.onload = () => {
      // This build copies its exports onto the global object; tolerate a build
      // that exposes the exports object instead.
      const T = globalThis.Terminal?.Terminal || globalThis.Terminal;
      typeof T === 'function' ? resolve(T) : reject(new Error('The terminal widget loaded but did not register itself.'));
    };
    script.onerror = () => reject(new Error('The terminal widget was served but the browser refused to run it.'));
    document.head.append(script);
    });
  })();
  // A failed load must not be cached forever, or one bad moment breaks the
  // panel until the page is reloaded.
  xtermReady.catch(() => { xtermReady = null; });
  return xtermReady;
}

export function aiPlansPanel({ h, api, toast, errMsg, title = 'AI plans' }) {
  const statusLine = h('p', { class: 'muted small', role: 'status' }, 'Checking…');
  const screen = h('div', { class: 'plans-terminal', style: { height: '380px', background: '#0b0b0d', borderRadius: '10px', padding: '8px', display: 'none' } });
  let socket = null, term = null, ready = false;

  const setStatus = (text, tone = '') => {
    statusLine.textContent = text;
    statusLine.className = `small ${tone === 'ok' ? 'ok' : tone === 'warn' ? 'warn' : 'muted'}`;
  };

  async function refresh() {
    try {
      const s = await api('GET', '/v1/ai-plans/status');
      // Signing in needs the plans service to exist. Offering the button
      // without it only produces an error the owner cannot act on, so the
      // controls follow the state rather than the other way round.
      setReady(!!s.configured && s.reachable !== false);
      if (!s.configured) {
        return setStatus('The plans service is not running on this server. Set PLANS_BRIDGE_TOKEN in the deployment .env and start it with: docker compose --profile plans up -d', 'warn');
      }
      if (s.reachable === false) {
        return setStatus('The plans service is configured but not answering, so the container is stopped or failed to start. On the server: docker compose --profile plans up -d teammates, then check docker logs for the teammates container.', 'warn');
      }
      // The exact wording the brief asks for, so the state is unambiguous.
      setStatus(s.signed_in ? `Signed in (ChatGPT) · ${s.models.join(', ')}` : 'Not signed in', s.signed_in ? 'ok' : 'warn');
    } catch (e) { setReady(false); setStatus(errMsg(e), 'warn'); }
  }

  function closeTerminal() {
    try { socket?.close(); } catch { /* already closed */ }
    socket = null;
    try { term?.dispose(); } catch { /* already disposed */ }
    term = null;
    screen.style.display = 'none';
    screen.replaceChildren();
  }

  async function openTerminal(cmd) {
    if (!ready) return toast('The plans service is not running on this server.', true);
    closeTerminal();
    let ticket;
    try { ({ ticket } = await api('POST', '/v1/ai-plans/terminal-ticket', {})); }
    catch (e) { return toast(errMsg(e), true); }

    let Terminal;
    try { Terminal = await loadXterm(); } catch (e) { return toast(e.message, true); }

    screen.style.display = '';
    term = new Terminal({ convertEol: true, fontSize: 13, theme: { background: '#0b0b0d' }, cursorBlink: true });
    term.open(screen);

    const url = new URL('/teammates/terminal', location.href);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('ticket', ticket);
    url.searchParams.set('cmd', cmd);
    socket = new WebSocket(url);

    socket.addEventListener('open', () => term.focus());
    socket.addEventListener('message', (e) => term.write(typeof e.data === 'string' ? e.data : ''));
    socket.addEventListener('close', (e) => {
      term?.write(`\r\n\x1b[90m[session closed${e.code === 4408 ? ': idle' : ''}]\x1b[0m\r\n`);
      socket = null;
      refresh();
    });
    socket.addEventListener('error', () => toast('The terminal connection failed.', true));
    term.onData((data) => socket?.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ data })));
  }

  // Built before the panel so their disabled state can follow the service.
  const signIn = h('button', { class: 'btn primary', disabled: true, onclick: () => openTerminal('login') }, 'Sign in');
  const checkStatus = h('button', { class: 'btn', disabled: true, onclick: () => openTerminal('status') }, 'Check status');
  function setReady(value) {
    ready = value;
    for (const button of [signIn, checkStatus]) {
      button.disabled = !value;
      button.title = value ? '' : 'The plans service is not running on this server.';
    }
  }

  const panel = h('section', { class: 'panel' },
    h('h2', {}, title),
    h('p', { class: 'muted small' },
      'Sign the official OpenAI Codex CLI into your own ChatGPT plan. The sign-in runs inside the plans service; this console never receives or stores a ChatGPT credential, and the session survives a redeploy.'),
    statusLine,
    h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap', marginTop: '12px' } },
      signIn, checkStatus,
      h('button', { class: 'btn', onclick: refresh }, 'Refresh'),
      h('button', { class: 'btn', onclick: closeTerminal }, 'Close terminal')),
    h('ol', { class: 'muted small', style: { marginTop: '14px', paddingLeft: '18px', lineHeight: '1.7' } },
      h('li', {}, 'Select Sign in. The terminal prints a link and a one-time code.'),
      h('li', {}, 'Open the link in your browser and sign in with your ChatGPT account.'),
      h('li', {}, 'Enter the code there. It expires after 15 minutes.'),
      h('li', {}, 'If the terminal reports that device codes are off, enable "device code authorization for Codex" in ',
        // The one step that happens outside this app, so it is a real link.
        h('a', { href: 'https://chatgpt.com/#settings/Security', target: '_blank', rel: 'noopener noreferrer' }, 'ChatGPT → Settings → Security'),
        ', then try again.')),
    h('p', { class: 'muted small', style: { marginTop: '10px' } },
      'Only you, as the workspace Owner, can use this plan: it spends your personal subscription. Representatives keep using their own API keys. Image generation still runs on an API-key provider.'),
    screen);

  refresh();
  // The caller registers dispose with the page's cleanup, so a live socket
  // never outlives the view that opened it.
  return { panel, dispose: closeTerminal };
}
