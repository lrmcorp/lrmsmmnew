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
  xtermReady ??= new Promise((resolve, reject) => {
    if (globalThis.Terminal) return resolve(globalThis.Terminal);
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = `${ASSET_BASE}/xterm.css`;
    document.head.append(css);
    const script = document.createElement('script');
    script.src = `${ASSET_BASE}/xterm.js`;
    script.onload = () => globalThis.Terminal ? resolve(globalThis.Terminal) : reject(new Error('Terminal did not load'));
    script.onerror = () => reject(new Error('The terminal could not be loaded from the plans service.'));
    document.head.append(script);
  });
  return xtermReady;
}

export function aiPlansPanel({ h, api, toast, errMsg, title = 'AI plans' }) {
  const statusLine = h('p', { class: 'muted small', role: 'status' }, 'Checking…');
  const screen = h('div', { class: 'plans-terminal', style: { height: '380px', background: '#0b0b0d', borderRadius: '10px', padding: '8px', display: 'none' } });
  let socket = null, term = null;

  const setStatus = (text, tone = '') => {
    statusLine.textContent = text;
    statusLine.className = `small ${tone === 'ok' ? 'ok' : tone === 'warn' ? 'warn' : 'muted'}`;
  };

  async function refresh() {
    try {
      const s = await api('GET', '/v1/ai-plans/status');
      if (!s.configured) return setStatus('The plans service is not configured on this server.', 'warn');
      // The exact wording the brief asks for, so the state is unambiguous.
      setStatus(s.signed_in ? `Signed in (ChatGPT) · ${s.models.join(', ')}` : 'Not signed in', s.signed_in ? 'ok' : 'warn');
    } catch (e) { setStatus(errMsg(e), 'warn'); }
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

  const panel = h('section', { class: 'panel' },
    h('h2', {}, title),
    h('p', { class: 'muted small' },
      'Sign the official OpenAI Codex CLI into your own ChatGPT plan. The sign-in runs inside the plans service; this console never receives or stores a ChatGPT credential, and the session survives a redeploy.'),
    statusLine,
    h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap', marginTop: '12px' } },
      h('button', { class: 'btn primary', onclick: () => openTerminal('login') }, 'Sign in'),
      h('button', { class: 'btn', onclick: () => openTerminal('status') }, 'Check status'),
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
