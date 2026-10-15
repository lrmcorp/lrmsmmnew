// Siar dashboard — vanilla JS SPA (no build step).
const $app = document.getElementById('app');

// ---------------- helpers ----------------
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
}
const svg = (s) => { const t = document.createElement('template'); t.innerHTML = s.trim(); return t.content.firstChild; };
const I = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 11 12 4l9 7v9H3z"/><path d="M9 20v-6h6v6"/></svg>',
  pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13 7 4 4"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h16v10a3 3 0 0 1-3 3H8l-4 3z"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.6c2 .8 3.2 2.6 3.6 5.4"/></svg>',
  img: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>',
  key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="6" width="18" height="14" rx="3"/><path d="M8 6l1.5-2.5h5L16 6"/><circle cx="12" cy="13" r="3.5"/></svg>',
  threads: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 5h14v9a3 3 0 0 1-3 3h-5l-4 3v-3H5z"/><path d="M9 9h6M9 12.5h4"/></svg>',
};
const icon = (k) => svg(I[k]);
const PLAT = { instagram: 'Instagram', threads: 'Threads' };
const plat = (p) => h('span', { class: `plat ${p}` }, icon(p), PLAT[p] || p);
const avatar = (a, cls = '') => h('span', { class: `avatar ${a.platform} ${cls}`, title: `@${a.username}` }, (a.username || '?').slice(0, 2).toUpperCase());
const STATUS = { published: 'Terbit', scheduled: 'Terjadwal', publishing: 'Sedang diterbitkan', pending: 'Menunggu', failed: 'Gagal', partial: 'Sebagian gagal', cancelled: 'Dibatalkan', expired: 'Perlu disambung ulang', active: 'Aktif' };
const status = (s) => h('span', { class: `status ${s}` }, STATUS[s] || s);
const len = (s) => [...(s || '')].length;
const fmtDT = (iso) => iso ? new Date(iso).toLocaleString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
const fmtBytes = (b) => b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;
const ago = (iso) => { const s = (Date.now() - new Date(iso)) / 1000; if (s < 60) return 'baru saja'; if (s < 3600) return `${Math.floor(s / 60)} mnt`; if (s < 86400) return `${Math.floor(s / 3600)} jam`; return `${Math.floor(s / 86400)} hr`; };
const ERR = {
  account_expired: 'Akun perlu disambungkan ulang', permission_missing: 'Izin Meta belum diberikan', rate_limited: 'Kena batas Meta, dicoba ulang otomatis',
  media_fetch_failed: 'Meta tidak bisa mengambil file media — pastikan PUBLIC_URL bisa diakses publik', image_too_large: 'Gambar terlalu besar (maks 8 MB)',
  aspect_ratio_invalid: 'Rasio foto di luar 4:5 sampai 1.91:1', caption_too_long: 'Teks terlalu panjang', publish_limit_reached: 'Kuota posting 24 jam habis',
  media_invalid_format: 'Format media tidak diterima', platform_error: 'Error dari platform', thread_partial: 'Post utama terbit, sebagian utas gagal',
};

async function api(method, path, body, opts = {}) {
  const init = { method, headers: { ...(opts.headers || {}) }, credentials: 'same-origin' };
  if (body instanceof Blob || body instanceof ArrayBuffer) init.body = body;
  else if (body !== undefined) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(body); }
  const r = await fetch(path, init);
  if (r.status === 204) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && !path.startsWith('/auth')) { state.user = null; go('/login'); }
    const e = new Error(j.error?.message || `HTTP ${r.status}`); e.code = j.error?.code; e.details = j.error?.details; throw e;
  }
  return j;
}
function toast(msg, bad = false) {
  const el = h('div', { class: bad ? 'bad' : '' }, msg);
  document.getElementById('toast').append(el);
  setTimeout(() => el.remove(), bad ? 6000 : 3200);
}
const errMsg = (e) => (e.code && ERR[e.code] ? `${ERR[e.code]}. ` : '') + (e.message || 'Gagal');
const go = (p) => { location.hash = `#${p}`; };
function modal(title, body, actions = []) {
  const d = h('dialog', {}, h('div', { class: 'dh' }, h('h2', {}, title), h('span', { class: 'spacer' }), h('button', { class: 'btn ghost sm', onclick: () => d.close(), 'aria-label': 'Tutup' }, '✕')),
    h('div', { class: 'db' }, body), actions.length ? h('div', { class: 'df' }, actions) : null);
  d.addEventListener('close', () => d.remove());
  document.body.append(d); d.showModal();
  return d;
}

// ---------------- state & shell ----------------
const state = { user: null, mock: false, accounts: [], stats: {} };
async function loadAccounts() { state.accounts = (await api('GET', '/v1/accounts')).data; return state.accounts; }

function shell(active, content) {
  const nav = [
    ['/', 'home', 'Beranda'], ['/compose', 'pen', 'Tulis'], ['/calendar', 'cal', 'Kalender'],
    ['/inbox', 'inbox', 'Komentar', state.stats.unreplied], ['/accounts', 'users', 'Akun'], ['/media', 'img', 'Media'], ['/developer', 'key', 'API & AI'],
  ];
  return h('div', {},
    state.mock ? h('div', { class: 'mock-banner' }, 'Mode simulasi: Instagram & Threads tiruan (META_MOCK=1). Tidak ada yang benar-benar terposting.') : null,
    h('div', { class: 'shell' },
      h('aside', { class: 'side' },
        h('a', { class: 'brand', href: '#/' }, 'siar', h('span', { class: 'wave', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'))),
        h('nav', { class: 'nav' }, nav.map(([p, ic, label, count]) =>
          h('a', { href: `#${p}`, class: active === p ? 'on' : '' }, icon(ic), label, count ? h('span', { class: 'count' }, count) : null))),
        h('div', { class: 'foot' }, h('div', {}, state.user?.email), h('a', { href: '#/team' }, state.user?.role === 'admin' ? 'Tim & akun saya' : 'Akun saya'), ' · ',
          h('button', { onclick: async () => { await api('POST', '/auth/logout'); state.user = null; go('/login'); } }, 'Keluar'))),
      h('main', { class: 'main' }, content)));
}
function pagehead(title, sub, ...actions) {
  return h('div', { class: 'pagehead' }, h('div', {}, h('h1', {}, title), sub ? h('p', { class: 'muted' }, sub) : null), h('div', { class: 'row' }, actions));
}

// ---------------- auth ----------------
function authPage(mode) {
  const next = new URLSearchParams(location.hash.split('?')[1] || '').get('next');
  const setup = mode === 'setup';
  const form = h('form', { class: 'card', onsubmit: async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    try {
      const r = await api('POST', setup ? '/auth/register' : '/auth/login', Object.fromEntries(f));
      state.user = r.user;
      if (next) location.href = next; else go('/');
    } catch (err) { toast(err.message, true); }
  } },
  h('div', { class: 'brand' }, 'siar', h('span', { class: 'wave' }, h('i'), h('i'), h('i'))),
  h('h1', {}, setup ? 'Buat akun admin' : 'Masuk'),
  h('p', { class: 'muted' }, setup ? 'Akun pertama otomatis jadi admin. Anggota tim lain ditambahkan dari menu Tim.' : 'Posting dan jadwalkan Instagram & Threads tim.'),
  setup ? h('label', { class: 'field' }, h('span', {}, 'Nama'), h('input', { name: 'name', autocomplete: 'name' })) : null,
  h('label', { class: 'field' }, h('span', {}, 'Email'), h('input', { name: 'email', type: 'email', required: true, autocomplete: 'email' })),
  h('label', { class: 'field' }, h('span', {}, 'Password'), h('input', { name: 'password', type: 'password', required: true, minlength: setup ? 8 : null, autocomplete: setup ? 'new-password' : 'current-password' })),
  h('button', { class: 'btn primary', style: { width: '100%' } }, setup ? 'Buat akun' : 'Masuk'));
  return h('div', { class: 'center-page' }, form);
}

// ---------------- home ----------------
async function pageHome() {
  const [stats, sched, failed] = await Promise.all([
    api('GET', '/v1/stats'), api('GET', '/v1/posts?status=scheduled&limit=100'), api('GET', '/v1/posts?limit=30'),
  ]);
  state.stats = stats;
  const upcoming = sched.data.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)).slice(0, 8);
  const attention = failed.data.filter((p) => ['failed', 'partial'].includes(p.status)).slice(0, 5);
  const expired = state.accounts.filter((a) => a.status === 'expired');
  return shell('/', h('div', {},
    pagehead(`Halo${state.user.name ? ', ' + state.user.name.split(' ')[0] : ''}`, null, h('a', { class: 'btn primary', href: '#/compose' }, 'Tulis post')),
    h('div', { class: 'strip' },
      h('a', { href: '#/accounts' }, h('b', {}, stats.accounts), h('span', {}, 'akun aktif')),
      h('a', { href: '#/calendar' }, h('b', {}, stats.scheduled), h('span', {}, 'post terjadwal')),
      h('a', { href: '#/calendar', class: stats.failed_7d ? 'alert' : '' }, h('b', {}, stats.failed_7d), h('span', {}, 'gagal 7 hari')),
      h('a', { href: '#/inbox' }, h('b', {}, stats.unreplied), h('span', {}, 'komentar belum dibalas'))),
    expired.length ? h('div', { class: 'panel', style: { borderColor: 'var(--bad)', marginBottom: '16px' } },
      h('h3', {}, 'Akun perlu disambungkan ulang'),
      h('p', { class: 'muted' }, 'Post terjadwal ke akun ini akan gagal sampai disambungkan lagi.'),
      h('div', { class: 'row' }, expired.map((a) => h('a', { class: 'btn sm', href: `/connect/${a.platform}` }, avatar(a), `Sambungkan @${a.username}`)))) : null,
    !state.accounts.length ? h('div', { class: 'panel empty' }, h('h2', {}, 'Sambungkan akun pertama'), h('p', {}, 'Hubungkan Instagram Business/Creator atau Threads untuk mulai posting.'), h('a', { class: 'btn primary', href: '#/accounts' }, 'Sambungkan akun')) : null,
    attention.length ? h('div', { style: { marginBottom: '22px' } }, h('h2', {}, 'Perlu dicek'), postList(attention)) : null,
    h('h2', {}, 'Terbit berikutnya'),
    upcoming.length ? postList(upcoming) : h('div', { class: 'list empty' }, 'Belum ada post terjadwal.', h('br'), h('a', { class: 'btn', href: '#/compose' }, 'Jadwalkan post'))));
}

function postList(posts) {
  return h('div', { class: 'list' }, posts.map((p) => {
    const m = p.media[0];
    return h('a', { class: 'item', href: `#/posts/${p.id}` },
      m ? (m.type === 'video' ? h('video', { class: 'thumb', src: m.url, muted: true, preload: 'metadata' }) : h('img', { class: 'thumb', src: m.url, alt: '' })) : h('div', { class: 'thumb' }),
      h('div', { class: 'body' },
        h('div', { class: 'title' }, p.content || h('span', { class: 'faint' }, '(tanpa teks)')),
        h('div', { class: 'meta' },
          h('span', {}, p.scheduled_at ? fmtDT(p.scheduled_at) : fmtDT(p.created_at)),
          h('span', {}, p.targets.map((t) => `@${t.username}`).join(', ')),
          p.source !== 'dashboard' ? h('span', {}, p.source === 'mcp' ? 'via AI' : 'via API') : null)),
      status(p.status));
  }));
}

// ---------------- composer ----------------
async function pageCompose(editId) {
  await loadAccounts();
  const editing = editId ? await api('GET', `/v1/posts/${editId}`) : null;
  const active = state.accounts.filter((a) => a.status === 'active');
  const s = {
    key: crypto.randomUUID(),
    selected: new Set(editing ? editing.targets.map((t) => t.account_id) : active.length === 1 ? [active[0].id] : []),
    content: editing?.content || '',
    media: editing ? editing.media : [],
    per: {}, // account_id -> { content?, options:{} }
    when: editing ? 'later' : 'now',
    at: editing?.scheduled_at ? toLocalInput(editing.scheduled_at) : toLocalInput(new Date(Date.now() + 3600_000).toISOString()),
  };
  if (editing) for (const t of editing.targets) s.per[t.account_id] = { content: t.content ?? undefined, options: t.options || {} };
  const per = (id) => (s.per[id] ||= { options: {} });

  const root = h('div', { class: 'composer' });
  const left = h('div', { class: 'panel' });
  const right = h('div', { class: 'preview-wrap' });
  root.append(left, right);

  function render() {
    left.replaceChildren(...renderForm());
    renderPreview();
  }
  function renderForm() {
    const sel = state.accounts.filter((a) => s.selected.has(a.id));
    const igMax = 2200, thMax = 500;
    const n = len(s.content);
    const ta = h('textarea', { placeholder: 'Tulis caption…', 'aria-label': 'Caption', oninput: (e) => { s.content = e.target.value; renderPreview(); updateMeter(); } });
    ta.value = s.content;
    const meter = h('div', { class: 'meter' });
    const updateMeter = () => {
      const c = len(s.content);
      meter.replaceChildren(...[
        sel.some((a) => a.platform === 'instagram') ? h('span', { class: c > igMax ? 'over' : '' }, `Instagram ${c}/${igMax}`) : null,
        sel.some((a) => a.platform === 'threads') ? h('span', { class: c > thMax ? 'over' : '' }, `Threads ${c}/${thMax}`) : null].filter(Boolean));
    };
    updateMeter();
    return [
      h('h3', {}, 'Akun tujuan'),
      state.accounts.length ? h('div', { class: 'acc-picker' }, state.accounts.map((a) =>
        h('button', { type: 'button', class: `acc-chip ${s.selected.has(a.id) ? 'on' : ''}`, disabled: a.status !== 'active', 'aria-pressed': s.selected.has(a.id),
          title: a.status !== 'active' ? 'Akun perlu disambungkan ulang' : PLAT[a.platform],
          onclick: () => { s.selected.has(a.id) ? s.selected.delete(a.id) : s.selected.add(a.id); render(); } }, avatar(a), `@${a.username}`, h('span', { class: `chip-plat ${a.platform}`, 'aria-label': PLAT[a.platform] }, icon(a.platform)))))
        : h('p', { class: 'muted' }, 'Belum ada akun. ', h('a', { href: '#/accounts' }, 'Sambungkan dulu.')),
      ta, meter,
      h('div', { class: 'media-strip' },
        s.media.map((m, i) => h('div', { class: 'tile' },
          m.type === 'video' ? h('video', { src: m.url, muted: true }) : h('img', { src: m.url, alt: m.alt_text || '' }),
          h('span', { class: 'badge' }, i + 1),
          h('button', { type: 'button', 'aria-label': 'Hapus media', onclick: () => { s.media.splice(i, 1); render(); } }, '×'))),
        h('button', { type: 'button', class: 'add', onclick: () => pickMedia((picked) => { s.media.push(...picked); render(); }) }, '+ Foto / video')),
      sel.length ? h('div', {}, sel.map(perAccount)) : null,
      h('div', { class: 'per-acc' }, h('h3', {}, 'Kapan'),
        h('div', { class: 'when-box' },
          h('div', { class: 'seg' },
            h('button', { type: 'button', class: s.when === 'now' ? 'on' : '', onclick: () => { s.when = 'now'; render(); }, disabled: !!editing }, 'Terbitkan sekarang'),
            h('button', { type: 'button', class: s.when === 'later' ? 'on' : '', onclick: () => { s.when = 'later'; render(); } }, 'Jadwalkan')),
          s.when === 'later' ? h('input', { type: 'datetime-local', value: s.at, oninput: (e) => { s.at = e.target.value; renderPreview(); }, 'aria-label': 'Waktu terbit' }) : null)),
      h('div', { class: 'row end', style: { marginTop: '18px' } },
        editing ? h('a', { class: 'btn', href: `#/posts/${editing.id}` }, 'Batal') : null,
        h('button', { class: 'btn primary', onclick: submit, disabled: !sel.length }, editing ? 'Simpan perubahan' : s.when === 'now' ? 'Terbitkan' : 'Jadwalkan')),
    ];
  }

  function perAccount(a) {
    const p = per(a.id);
    const o = p.options;
    const custom = p.content !== undefined;
    const body = h('div', { class: 'inner' },
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: custom, onchange: (e) => { p.content = e.target.checked ? s.content : undefined; render(); } }), 'Teks berbeda untuk akun ini'),
      custom ? h('textarea', { style: { marginTop: '8px', minHeight: '80px' }, oninput: (e) => { p.content = e.target.value; renderPreview(); } }, p.content) : null,
      a.platform === 'instagram' ? h('div', { class: 'row', style: { marginTop: '10px' } },
        h('label', { class: 'check' }, 'Format', h('select', { style: { width: 'auto' }, onchange: (e) => { o.format = e.target.value === 'story' ? 'story' : undefined; if (o.format) p.content = ''; render(); } },
          h('option', { value: 'feed', selected: o.format !== 'story' }, 'Feed / Reels'), h('option', { value: 'story', selected: o.format === 'story' }, 'Story'))),
        s.media.length === 1 && s.media[0].type === 'video' && o.format !== 'story'
          ? h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: o.share_to_feed !== false, onchange: (e) => { o.share_to_feed = e.target.checked; } }), 'Reels tampil di feed') : null) : null,
      a.platform === 'threads' ? threadsOptions(o) : null);
    const d = h('details', { class: 'per-acc', open: custom || Object.keys(o).length > 0 }, h('summary', {}, avatar(a), `@${a.username}`, h('span', { class: 'faint small' }, PLAT[a.platform])), body);
    return d;
  }

  function threadsOptions(o) {
    const parts = o.thread || [];
    return h('div', { style: { marginTop: '10px' } },
      h('div', { class: 'row' },
        h('label', { class: 'check' }, 'Topik', h('input', { style: { width: '140px' }, value: o.topic_tag || '', placeholder: 'mis. Kopi', oninput: (e) => { o.topic_tag = e.target.value || undefined; } })),
        h('label', { class: 'check' }, 'Siapa boleh balas', h('select', { style: { width: 'auto' }, onchange: (e) => { o.reply_control = e.target.value || undefined; } },
          [['', 'Semua orang'], ['accounts_you_follow', 'Yang kamu ikuti'], ['mentioned_only', 'Yang disebut'], ['followers_only', 'Pengikut']].map(([v, l]) => h('option', { value: v, selected: (o.reply_control || '') === v }, l))))),
      !s.media.length ? h('label', { class: 'check', style: { marginTop: '10px' } }, h('input', { type: 'checkbox', checked: !!o.poll, onchange: (e) => { o.poll = e.target.checked ? { options: ['', ''] } : undefined; render(); } }), 'Tambah polling') : null,
      o.poll ? h('div', { style: { marginTop: '8px' } }, o.poll.options.map((opt, i) => h('div', { class: 'thread-part' },
        h('input', { value: opt, maxlength: 25, placeholder: `Pilihan ${i + 1}`, oninput: (e) => { o.poll.options[i] = e.target.value; renderPreview(); } }),
        o.poll.options.length > 2 ? h('button', { class: 'btn sm ghost', type: 'button', onclick: () => { o.poll.options.splice(i, 1); render(); } }, '×') : null)),
        o.poll.options.length < 4 ? h('button', { class: 'btn sm', type: 'button', onclick: () => { o.poll.options.push(''); render(); } }, 'Tambah pilihan') : null) : null,
      h('div', { style: { marginTop: '10px' } },
        parts.map((p, i) => h('div', { class: 'thread-part' },
          h('textarea', { placeholder: `Bagian ${i + 2} utas`, oninput: (e) => { parts[i] = e.target.value; renderPreview(); } }, typeof p === 'string' ? p : p.text),
          h('button', { class: 'btn sm ghost', type: 'button', 'aria-label': 'Hapus bagian', onclick: () => { parts.splice(i, 1); if (!parts.length) delete o.thread; render(); } }, '×'))),
        parts.length < 10 ? h('button', { class: 'btn sm', type: 'button', onclick: () => { o.thread = [...parts, '']; render(); } }, 'Tambah bagian utas') : null));
  }

  function renderPreview() {
    const sel = state.accounts.filter((a) => s.selected.has(a.id));
    const when = s.when === 'later' && s.at ? fmtDT(new Date(s.at).toISOString()) : 'sekarang';
    const cards = sel.map((a) => {
      const p = per(a.id);
      const text = p.content !== undefined ? p.content : s.content;
      const m = s.media;
      const mediaEl = (x) => x.type === 'video' ? h('video', { src: x.url, muted: true, autoplay: true, loop: true, playsinline: true }) : h('img', { src: x.url, alt: x.alt_text || '' });
      if (a.platform === 'instagram') {
        const story = p.options.format === 'story';
        return h('div', { class: 'pv instagram' },
          h('div', { class: 'hd' }, avatar(a), a.username, h('span', { class: 'when' }, when)),
          h('div', { class: `img ${story ? 'story' : ''}` }, m[0] ? mediaEl(m[0]) : 'Instagram wajib ada foto atau video', m.length > 1 && !story ? h('div', { class: 'dots' }, m.map(() => h('i'))) : null),
          !story && text ? h('div', { class: 'cap' }, h('b', {}, a.username), text) : null,
          len(text) > 2200 ? h('div', { class: 'warn' }, `Kelebihan ${len(text) - 2200} karakter`) : null);
      }
      const parts = p.options.thread || [];
      return h('div', { class: 'pv threads' },
        h('div', { class: 'hd' }, avatar(a), a.username, h('span', { class: 'when' }, when)),
        text ? h('div', { class: 'tbody' }, text) : null,
        m.length ? h('div', { class: 'tmedia' }, m.slice(0, 3).map(mediaEl)) : null,
        p.options.poll ? h('div', { class: 'poll' }, p.options.poll.options.map((x, i) => h('div', {}, x || `Pilihan ${i + 1}`))) : null,
        parts.map((t) => h('div', { class: 'tpart' }, typeof t === 'string' ? t : t.text)),
        len(text) > 500 ? h('div', { class: 'warn' }, `Kelebihan ${len(text) - 500} karakter — Threads maks 500`) : null);
    });
    right.replaceChildren(h('h3', {}, 'Preview'), h('div', { class: 'previews' }, cards.length ? cards : h('div', { class: 'pv-empty' }, 'Pilih akun untuk melihat preview Instagram dan Threads berdampingan.')));
  }

  async function submit(e) {
    const btn = e.currentTarget;
    const targets = [...s.selected].map((id) => {
      const p = per(id); const t = { account_id: id };
      if (p.content !== undefined) t.content = p.content;
      const o = structuredClone(p.options);
      for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
      if (o.thread) o.thread = o.thread.filter((x) => (typeof x === 'string' ? x.trim() : x.text?.trim()));
      if (o.thread && !o.thread.length) delete o.thread;
      if (o.poll) o.poll.options = o.poll.options.filter((x) => x.trim());
      if (Object.keys(o).length) t.options = o;
      return t;
    });
    const body = { content: s.content, media_ids: s.media.map((m) => m.id), targets };
    if (s.when === 'later') {
      if (!s.at) return toast('Isi waktu terbit', true);
      body.scheduled_at = new Date(s.at).toISOString();
    }
    btn.disabled = true;
    try {
      const p = editing ? await api('PATCH', `/v1/posts/${editing.id}`, body) : await api('POST', '/v1/posts', body, { headers: { 'Idempotency-Key': s.key } });
      toast(editing ? 'Perubahan disimpan' : s.when === 'now' ? 'Sedang diterbitkan…' : `Terjadwal ${fmtDT(p.scheduled_at)}`);
      go(`/posts/${p.id}`);
    } catch (err) {
      btn.disabled = false;
      const who = err.details?.account_id ? state.accounts.find((a) => a.id === err.details.account_id) : null;
      toast(`${who ? `@${who.username}: ` : ''}${errMsg(err)}`, true);
    }
  }

  render();
  return shell('/compose', h('div', {}, pagehead(editing ? 'Ubah post terjadwal' : 'Tulis post', 'Tulis sekali, cek tampilan di tiap platform sebelum terbit.'), root));
}
function toLocalInput(iso) {
  const d = new Date(iso); const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
}

// ---------------- media picker & uploads ----------------
async function uploadFile(file, { inLibrary = true, onProgress } = {}) {
  const BIG = 90 * 1024 * 1024;
  if (file.size <= BIG) {
    return new Promise((res, rej) => {
      const x = new XMLHttpRequest();
      x.open('POST', `/v1/media/upload?in_library=${inLibrary}`);
      x.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
      x.upload.onprogress = (e) => onProgress?.(e.loaded / e.total);
      x.onload = () => { const j = JSON.parse(x.responseText || '{}'); x.status < 300 ? res(j) : rej(Object.assign(new Error(j.error?.message || 'Upload gagal'), { code: j.error?.code })); };
      x.onerror = () => rej(new Error('Koneksi terputus'));
      x.send(file);
    });
  }
  const up = await api('POST', '/v1/media/uploads', { mime_type: file.type || 'video/mp4', size_bytes: file.size, original_name: file.name, in_library: inLibrary });
  for (let i = 0; i < up.part_count; i++) {
    await api('PUT', `/v1/media/${up.id}/parts/${i + 1}`, file.slice(i * up.part_size, (i + 1) * up.part_size), { headers: { 'content-type': 'application/octet-stream' } });
    onProgress?.((i + 1) / up.part_count);
  }
  return api('POST', `/v1/media/${up.id}/complete`);
}

async function pickMedia(onDone) {
  const lib = await api('GET', '/v1/media?limit=100');
  const chosen = [];
  const grid = h('div', { class: 'mgrid' }, lib.data.map((m) => {
    const cell = h('div', { class: 'mcell pick', tabindex: 0, role: 'button', onclick: () => toggle(), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } } },
      h('div', { class: 'pic' }, m.type === 'video' ? h('video', { src: m.url, muted: true }) : h('img', { src: m.url, alt: m.alt_text || '' })),
      h('div', { class: 'info' }, m.type === 'video' ? `Video ${Math.round((m.duration_ms || 0) / 1000)} dtk` : `${m.width}×${m.height}`));
    function toggle() { const i = chosen.indexOf(m); i >= 0 ? chosen.splice(i, 1) : chosen.push(m); cell.classList.toggle('on', i < 0); }
    return cell;
  }));
  const prog = h('div', { class: 'progress' }, h('i'));
  const input = h('input', { type: 'file', accept: 'image/jpeg,image/png,video/mp4,video/quicktime', multiple: true, hidden: true, onchange: async () => {
    const files = [...input.files];
    try {
      const out = [];
      for (const [i, f] of files.entries()) out.push(await uploadFile(f, { inLibrary: true, onProgress: (p) => { prog.firstChild.style.width = `${((i + p) / files.length) * 100}%`; } }));
      d.close(); onDone(out);
    } catch (e) { toast(errMsg(e), true); }
  } });
  const d = modal('Pilih media', h('div', {},
    h('div', { class: 'drop' }, h('p', {}, 'Upload dari perangkat: JPEG/PNG maks 8 MB, MP4/MOV maks 300 MB.'), h('button', { class: 'btn', onclick: () => input.click() }, 'Pilih file'), input, prog),
    lib.data.length ? grid : h('p', { class: 'muted' }, 'Pustaka media masih kosong.')),
  [h('button', { class: 'btn', onclick: () => d.close() }, 'Batal'), h('button', { class: 'btn primary', onclick: () => { d.close(); onDone(chosen); } }, 'Pakai yang dipilih')]);
}

// ---------------- post detail ----------------
async function pagePost(id) {
  let p = await api('GET', `/v1/posts/${id}`);
  const box = h('div');
  const draw = () => {
    const editable = p.status === 'scheduled';
    box.replaceChildren(
      pagehead(p.scheduled_at ? `Terjadwal ${fmtDT(p.scheduled_at)}` : `Dibuat ${fmtDT(p.created_at)}`, null,
        status(p.status),
        editable ? h('a', { class: 'btn', href: `#/compose/${p.id}` }, 'Ubah') : null,
        editable ? h('button', { class: 'btn', onclick: () => act('publish', 'Sedang diterbitkan…') }, 'Terbitkan sekarang') : null,
        editable ? h('button', { class: 'btn danger', onclick: () => confirm('Batalkan post terjadwal ini?') && act('cancel', 'Post dibatalkan') }, 'Batalkan') : null,
        ['failed', 'partial'].includes(p.status) ? h('button', { class: 'btn primary', onclick: () => act('retry', 'Mencoba ulang…') }, 'Coba ulang yang gagal') : null),
      h('div', { class: 'grid2' },
        h('div', { class: 'panel' }, h('h2', {}, 'Isi'),
          h('p', { style: { whiteSpace: 'pre-wrap' } }, p.content || h('span', { class: 'faint' }, '(tanpa teks bersama)')),
          p.media.length ? h('div', { class: 'media-strip' }, p.media.map((m) => h('div', { class: 'tile' }, m.type === 'video' ? h('video', { src: m.url, muted: true, controls: true }) : h('img', { src: m.url, alt: m.alt_text || '' })))) : null,
          h('p', { class: 'faint small' }, `Sumber: ${p.source === 'mcp' ? 'AI (MCP)' : p.source === 'api' ? 'REST API' : 'dashboard'}`)),
        h('div', { class: 'panel' }, h('h2', {}, 'Status per akun'),
          p.targets.map((t) => h('div', { class: 'target-row' },
            plat(t.platform), h('b', {}, `@${t.username}`), h('span', { class: 'spacer' }), status(t.status),
            t.permalink ? h('a', { class: 'btn sm', href: t.permalink, target: '_blank', rel: 'noopener' }, 'Lihat post') : null,
            t.error_code ? h('div', { class: 'err-box' }, h('b', {}, ERR[t.error_code] || t.error_code), t.error_message ? h('div', {}, t.error_message) : null,
              t.error_code === 'account_expired' ? h('a', { class: 'btn sm', style: { marginTop: '6px' }, href: `/connect/${t.platform}` }, 'Sambungkan ulang') : null) : null,
            t.content != null ? h('div', { class: 'small muted', style: { width: '100%', whiteSpace: 'pre-wrap' } }, `Teks khusus: ${t.content || '(kosong)'}`) : null)))),
      p.status !== 'scheduled' && !['publishing', 'cancelled'].includes(p.status) ? h('div', { class: 'row', style: { marginTop: '16px' } },
        h('button', { class: 'btn ghost danger sm', onclick: async () => { if (!confirm('Hapus dari riwayat Siar? Post di Instagram/Threads tidak ikut terhapus.')) return; await api('POST', `/v1/posts/${p.id}/remove`); toast('Dihapus dari riwayat'); go('/calendar'); } }, 'Hapus dari riwayat')) : null);
  };
  async function act(kind, msg) {
    try {
      p = kind === 'cancel' ? await api('DELETE', `/v1/posts/${p.id}`) : await api('POST', `/v1/posts/${p.id}/${kind}`);
      toast(msg); draw(); poll();
    } catch (e) { toast(errMsg(e), true); }
  }
  let timer;
  function poll() {
    clearTimeout(timer);
    if (!['publishing'].includes(p.status) && !p.targets.some((t) => ['pending', 'publishing'].includes(t.status) && !p.scheduled_at)) return;
    timer = setTimeout(async () => {
      if (!location.hash.includes(p.id)) return;
      p = await api('GET', `/v1/posts/${p.id}`); draw(); poll();
    }, 2500);
  }
  draw(); poll();
  return shell('/calendar', box);
}

// ---------------- calendar ----------------
async function pageCalendar() {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const base = q.get('w') ? new Date(q.get('w')) : new Date();
  const start = new Date(base); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // Monday
  const end = new Date(start); end.setDate(end.getDate() + 7);
  const view = q.get('v') || 'week';
  const { data } = await api('GET', `/v1/calendar?from=${start.toISOString()}&to=${end.toISOString()}`);
  const shift = (days) => { const d = new Date(start); d.setDate(d.getDate() + days); go(`/calendar?w=${d.toISOString().slice(0, 10)}&v=${view}`); };
  const label = `${start.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} – ${new Date(end - 1).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const today = new Date().toDateString();
  const days = [...Array(7)].map((_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; });
  const cal = h('div', { class: 'cal' }, days.map((d) => {
    const items = data.filter((p) => new Date(p.scheduled_at || p.created_at).toDateString() === d.toDateString());
    return h('div', { class: `day ${d.toDateString() === today ? 'today' : ''}` },
      h('div', { class: 'dh' }, d.toLocaleDateString('id-ID', { weekday: 'short' }), h('b', {}, d.getDate())),
      items.map((p) => h('a', { class: `ev ${p.status}`, href: `#/posts/${p.id}` },
        h('time', {}, fmtTime(p.scheduled_at || p.created_at)),
        h('span', { class: 't' }, p.content || '(media)'),
        h('span', { class: 'icons' }, [...new Set(p.targets.map((t) => t.platform))].map(icon)))));
  }));
  return shell('/calendar', h('div', {},
    pagehead('Kalender', label,
      h('div', { class: 'seg' }, h('button', { class: view === 'week' ? 'on' : '', onclick: () => go(`/calendar?w=${start.toISOString().slice(0, 10)}&v=week`) }, 'Minggu'), h('button', { class: view === 'list' ? 'on' : '', onclick: () => go(`/calendar?w=${start.toISOString().slice(0, 10)}&v=list`) }, 'Daftar')),
      h('button', { class: 'btn', onclick: () => shift(-7), 'aria-label': 'Minggu sebelumnya' }, '‹'),
      h('button', { class: 'btn', onclick: () => go('/calendar') }, 'Minggu ini'),
      h('button', { class: 'btn', onclick: () => shift(7), 'aria-label': 'Minggu berikutnya' }, '›'),
      h('a', { class: 'btn primary', href: '#/compose' }, 'Tulis post')),
    view === 'list' ? (data.length ? postList(data) : h('div', { class: 'list empty' }, 'Tidak ada post minggu ini.')) : cal));
}

// ---------------- inbox ----------------
async function pageInbox() {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const filter = q.get('f') || 'unreplied';
  const acc = q.get('a') || '';
  await loadAccounts();
  const [{ data }, all] = await Promise.all([
    api('GET', `/v1/comments?reply_status=${filter}&limit=100${acc ? `&account_id=${acc}` : ''}`),
    api('GET', `/v1/comments?reply_status=all&include_own=true&limit=100${acc ? `&account_id=${acc}` : ''}`),
  ]);
  const repliesOf = (c) => all.data.filter((x) => x.parent_id === c.id && x.from_self);
  const setQ = (k, v) => { const n = new URLSearchParams(q); v ? n.set(k, v) : n.delete(k); go(`/inbox?${n}`); };
  const list = h('div', { class: 'list' }, data.length ? data.map((c) => {
    const accnt = state.accounts.find((a) => a.id === c.account_id);
    const reply = h('textarea', { placeholder: `Balas sebagai @${c.account_username}…`, 'aria-label': 'Balasan' });
    const el = h('div', { class: `cmt ${c.hidden ? 'hidden' : ''}` },
      accnt ? avatar(accnt) : null,
      h('div', { class: 'body', style: { flex: 1, minWidth: 0 } },
        h('div', { class: 'row' }, h('span', { class: 'who' }, `@${c.username}`), h('span', { class: 'faint small' }, `${ago(c.commented_at)} · ke @${c.account_username}`), c.hidden ? h('span', { class: 'status' }, 'Disembunyikan') : null),
        h('div', { class: 'txt' }, c.text || ''),
        repliesOf(c).map((r) => h('div', { class: 'replies' }, h('b', {}, `@${r.username} `), r.text)),
        h('div', { class: 'reply-box' }, reply, h('button', { class: 'btn primary sm', onclick: async (e) => {
          if (!reply.value.trim()) return;
          e.currentTarget.disabled = true;
          try { await api('POST', `/v1/comments/${c.id}/reply`, { message: reply.value }); toast('Balasan terkirim'); route(); }
          catch (err) { e.currentTarget.disabled = false; toast(errMsg(err), true); }
        } }, 'Balas')),
        h('div', { class: 'row', style: { marginTop: '6px' } },
          h('button', { class: 'btn ghost sm', onclick: async () => { try { await api('POST', `/v1/comments/${c.id}/hide`, { hidden: !c.hidden }); toast(c.hidden ? 'Komentar ditampilkan' : 'Komentar disembunyikan'); route(); } catch (err) { toast(errMsg(err), true); } } }, c.hidden ? 'Tampilkan' : 'Sembunyikan'),
          c.reply_status !== 'ignored' ? h('button', { class: 'btn ghost sm', onclick: async () => { await api('PATCH', `/v1/comments/${c.id}`, { reply_status: 'ignored' }); route(); } }, 'Abaikan') : null,
          c.reply_status !== 'unreplied' ? h('button', { class: 'btn ghost sm', onclick: async () => { await api('PATCH', `/v1/comments/${c.id}`, { reply_status: 'unreplied' }); route(); } }, 'Tandai belum dibalas') : null,
          c.post_id ? h('a', { class: 'btn ghost sm', href: `#/posts/${c.post_id}` }, 'Lihat post') : null)));
    return el;
  }) : h('div', { class: 'empty' }, filter === 'unreplied' ? 'Semua komentar sudah dibalas.' : 'Tidak ada komentar.'));
  return shell('/inbox', h('div', {},
    pagehead('Komentar', 'Komentar Instagram dan balasan Threads dari semua akun. Sinkron otomatis tiap 10 menit.',
      h('select', { style: { width: 'auto' }, onchange: (e) => setQ('a', e.target.value), 'aria-label': 'Filter akun' }, h('option', { value: '' }, 'Semua akun'), state.accounts.map((a) => h('option', { value: a.id, selected: a.id === acc }, `@${a.username} (${PLAT[a.platform]})`))),
      h('div', { class: 'seg' }, [['unreplied', 'Belum dibalas'], ['all', 'Semua'], ['hidden', 'Disembunyikan']].map(([v, l]) => h('button', { class: filter === v ? 'on' : '', onclick: () => setQ('f', v) }, l))),
      h('button', { class: 'btn', onclick: async (e) => { e.currentTarget.disabled = true; const r = await api('POST', '/v1/comments/sync'); toast(`${r.synced} komentar disinkron`); route(); } }, 'Sinkron sekarang')),
    list));
}

// ---------------- accounts ----------------
async function pageAccounts() {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  if (q.get('connected')) toast(`${q.get('connected')} tersambung`);
  if (q.get('error')) toast(q.get('error'), true);
  if (q.get('connected') || q.get('error')) history.replaceState(null, '', '#/accounts');
  await loadAccounts();
  return shell('/accounts', h('div', {},
    pagehead('Akun', 'Login lewat halaman resmi Meta. Siar tidak pernah tahu password akunmu; token disimpan terenkripsi.',
      h('a', { class: 'btn', href: '/connect/instagram' }, icon('instagram'), 'Sambungkan Instagram'),
      h('a', { class: 'btn', href: '/connect/threads' }, icon('threads'), 'Sambungkan Threads')),
    h('div', { class: 'list' }, state.accounts.length ? state.accounts.map((a) => h('div', { class: 'item' },
      avatar(a, 'lg'),
      h('div', { class: 'body' },
        h('div', {}, h('b', {}, `@${a.username}`), ' ', h('span', { class: 'muted' }, a.name || '')),
        h('div', { class: 'meta' }, plat(a.platform), a.followers_count != null ? h('span', {}, `${a.followers_count.toLocaleString('id-ID')} pengikut`) : null,
          a.token_expires_at ? h('span', {}, `Token berlaku s/d ${new Date(a.token_expires_at).toLocaleDateString('id-ID')} (diperpanjang otomatis)`) : null),
        a.last_error && a.status !== 'active' ? h('div', { class: 'err-box', style: { marginTop: '6px' } }, a.last_error) : null),
      status(a.status),
      h('a', { class: 'btn sm', href: `/connect/${a.platform}` }, a.status === 'expired' ? 'Sambungkan ulang' : 'Perbarui'),
      h('button', { class: 'btn sm ghost danger', onclick: async () => {
        if (!confirm(`Putuskan @${a.username}? Post terjadwal ke akun ini dibatalkan.`)) return;
        await api('DELETE', `/v1/accounts/${a.id}`); toast(`@${a.username} diputus`); route();
      } }, 'Putuskan'))) : h('div', { class: 'empty' }, 'Belum ada akun tersambung.')),
    h('p', { class: 'faint small', style: { marginTop: '14px' } }, 'Instagram harus akun Business atau Creator. Selama Meta App masih mode Development, akun harus terdaftar sebagai tester/role di app tersebut.')));
}

// ---------------- media library ----------------
async function pageMedia() {
  const { data } = await api('GET', '/v1/media?limit=100');
  const prog = h('div', { class: 'progress' }, h('i'));
  const input = h('input', { type: 'file', multiple: true, hidden: true, accept: 'image/jpeg,image/png,video/mp4,video/quicktime', onchange: () => upload([...input.files]) });
  async function upload(files) {
    for (const [i, f] of files.entries()) {
      try { await uploadFile(f, { onProgress: (p) => { prog.firstChild.style.width = `${((i + p) / files.length) * 100}%`; } }); }
      catch (e) { toast(`${f.name}: ${errMsg(e)}`, true); }
    }
    toast('Upload selesai'); route();
  }
  const drop = h('div', { class: 'drop',
    ondragover: (e) => { e.preventDefault(); drop.classList.add('over'); }, ondragleave: () => drop.classList.remove('over'),
    ondrop: (e) => { e.preventDefault(); drop.classList.remove('over'); upload([...e.dataTransfer.files]); } },
  h('p', {}, 'Tarik foto/video ke sini, atau'), h('button', { class: 'btn primary', onclick: () => input.click() }, 'Pilih file'), input,
  h('p', { class: 'faint small', style: { marginTop: '8px' } }, 'JPEG/PNG maks 8 MB (PNG otomatis jadi JPEG). MP4/MOV maks 300 MB. Instagram feed butuh rasio 4:5 sampai 1.91:1.'), prog);
  return shell('/media', h('div', {},
    pagehead('Media', 'Pustaka foto dan video tim. AI bisa memakai media dari sini lewat list_media.'),
    drop,
    data.length ? h('div', { class: 'mgrid' }, data.map((m) => h('div', { class: 'mcell' },
      h('div', { class: 'pic' }, m.type === 'video' ? h('video', { src: m.url, muted: true, controls: true, preload: 'metadata' }) : h('img', { src: m.url, alt: m.alt_text || '', loading: 'lazy' })),
      h('div', { class: 'info' },
        h('div', {}, m.type === 'video' ? `Video · ${Math.round((m.duration_ms || 0) / 1000)} dtk` : `${m.width}×${m.height}`, ` · ${fmtBytes(m.size_bytes)}`),
        h('div', { class: 'faint', title: m.id }, m.original_name || m.id),
        h('div', { class: 'row', style: { marginTop: '6px', gap: '4px' } },
          h('button', { class: 'btn sm', onclick: async () => { const t = prompt('Teks alternatif (alt text):', m.alt_text || ''); if (t == null) return; await api('PATCH', `/v1/media/${m.id}`, { alt_text: t }); toast('Alt text disimpan'); } }, 'Alt text'),
          h('button', { class: 'btn sm ghost danger', onclick: async () => { if (!confirm('Hapus media ini?')) return; try { await api('DELETE', `/v1/media/${m.id}`); route(); } catch (e) { toast(errMsg(e), true); } } }, 'Hapus')))))) : null));
}

// ---------------- developer: API keys, AI apps ----------------
async function pageDeveloper() {
  const [keys, apps] = await Promise.all([api('GET', '/v1/api-keys'), api('GET', '/v1/apps')]);
  const mcpUrl = `${location.origin}/mcp`;
  const copy = (t) => navigator.clipboard.writeText(t).then(() => toast('Disalin'));
  const nameIn = h('input', { placeholder: 'Nama key, mis. n8n atau Claude Code', style: { maxWidth: '320px' } });
  const scopeIn = h('select', { style: { width: 'auto' } }, h('option', { value: 'read' }, 'Baca saja'), h('option', { value: 'write' }, 'Baca dan tulis'));
  return shell('/developer', h('div', {},
    pagehead('API & AI', 'Sambungkan Claude, ChatGPT, Claude Code, Cursor, atau n8n ke Siar.'),
    h('div', { class: 'panel' }, h('h2', {}, 'Pasang di Claude atau ChatGPT'),
      h('p', { class: 'muted' }, 'Di Claude: Settings → Connectors → Add custom connector, tempel URL ini. Login Siar lalu pilih akses baca atau baca-tulis.'),
      h('div', { class: 'secret', style: { background: 'var(--accent-soft)' } }, h('code', {}, mcpUrl), h('button', { class: 'btn sm', onclick: () => copy(mcpUrl) }, 'Salin')),
      h('p', { class: 'muted small' }, 'Claude Code (pakai API key):'),
      h('div', { class: 'secret', style: { background: 'var(--line-2)' } }, h('code', {}, `claude mcp add --transport http siar ${mcpUrl} --header "Authorization: Bearer sr_live_..."`))),
    h('div', { class: 'panel' }, h('h2', {}, 'API key'),
      h('p', { class: 'muted' }, 'Untuk REST API (', h('code', {}, `${location.origin}/v1`), ') dan MCP dari Claude Code, Cursor, n8n. Key hanya ditampilkan sekali; Siar cuma menyimpan hash-nya.'),
      h('div', { class: 'row', style: { marginBottom: '12px' } }, nameIn, scopeIn, h('button', { class: 'btn primary', onclick: async () => {
        try {
          const k = await api('POST', '/v1/api-keys', { name: nameIn.value || 'API key', scope: scopeIn.value });
          modal('API key baru', h('div', {}, h('p', {}, 'Salin sekarang. Key ini tidak bisa ditampilkan lagi.'), h('div', { class: 'secret' }, h('code', {}, k.key), h('button', { class: 'btn sm', onclick: () => copy(k.key) }, 'Salin'))),
            [h('button', { class: 'btn primary', onclick: (e) => { e.target.closest('dialog').close(); route(); } }, 'Sudah disalin')]);
        } catch (e) { toast(errMsg(e), true); }
      } }, 'Buat API key')),
      keys.data.length ? h('div', { class: 'list' }, keys.data.map((k) => h('div', { class: 'item' },
        h('div', { class: 'body' }, h('b', {}, k.name), h('div', { class: 'meta' }, h('code', {}, `${k.prefix}…`), h('span', {}, k.scope === 'write' ? 'Baca dan tulis' : 'Baca saja'), h('span', {}, k.last_used_at ? `Terakhir dipakai ${ago(k.last_used_at)} lalu` : 'Belum dipakai'))),
        h('button', { class: 'btn sm ghost danger', onclick: async () => { if (!confirm(`Cabut key "${k.name}"?`)) return; await api('DELETE', `/v1/api-keys/${k.id}`); toast('Key dicabut'); route(); } }, 'Cabut')))) : h('p', { class: 'faint' }, 'Belum ada API key.')),
    h('div', { class: 'panel' }, h('h2', {}, 'Aplikasi terhubung'),
      apps.data.length ? h('div', { class: 'list' }, apps.data.map((a) => h('div', { class: 'item' },
        h('div', { class: 'body' }, h('b', {}, a.client_name || 'Aplikasi'), h('div', { class: 'meta' }, h('span', {}, a.scope.includes('write') ? 'Baca dan tulis' : 'Baca saja'), h('span', {}, `Diizinkan ${fmtDT(a.created_at)}`), a.last_used_at ? h('span', {}, `Aktif ${ago(a.last_used_at)} lalu`) : null)),
        h('button', { class: 'btn sm ghost danger', onclick: async () => { await api('DELETE', `/v1/apps/${a.id}`); toast('Akses dicabut'); route(); } }, 'Cabut')))) : h('p', { class: 'faint' }, 'Belum ada aplikasi AI yang terhubung lewat OAuth.'))));
}

// ---------------- team ----------------
async function pageTeam() {
  const isAdmin = state.user.role === 'admin';
  const users = isAdmin ? (await api('GET', '/v1/users')).data : [];
  const pw = h('form', { onsubmit: async (e) => {
    e.preventDefault();
    try { await api('POST', '/auth/password', Object.fromEntries(new FormData(pw))); toast('Password diganti. Semua API key dan akses AI dicabut.'); pw.reset(); }
    catch (err) { toast(err.message, true); }
  } },
  h('label', { class: 'field' }, h('span', {}, 'Password sekarang'), h('input', { type: 'password', name: 'current', required: true, autocomplete: 'current-password' })),
  h('label', { class: 'field' }, h('span', {}, 'Password baru'), h('input', { type: 'password', name: 'next', required: true, minlength: 8, autocomplete: 'new-password' })),
  h('p', { class: 'faint small' }, 'Mengganti password juga mencabut semua API key dan akses aplikasi AI.'),
  h('button', { class: 'btn' }, 'Ganti password'));
  const add = h('form', { class: 'row', onsubmit: async (e) => {
    e.preventDefault();
    try { await api('POST', '/v1/users', Object.fromEntries(new FormData(add))); toast('Anggota ditambahkan'); route(); }
    catch (err) { toast(err.message, true); }
  } },
  h('input', { name: 'name', placeholder: 'Nama', style: { maxWidth: '160px' } }), h('input', { name: 'email', type: 'email', placeholder: 'Email', required: true, style: { maxWidth: '220px' } }),
  h('input', { name: 'password', type: 'text', placeholder: 'Password awal (min 8)', required: true, minlength: 8, style: { maxWidth: '200px' } }),
  h('select', { name: 'role', style: { width: 'auto' } }, h('option', { value: 'member' }, 'Anggota'), h('option', { value: 'admin' }, 'Admin')),
  h('button', { class: 'btn primary' }, 'Tambah'));
  return shell('/team', h('div', {},
    pagehead(isAdmin ? 'Tim' : 'Akun saya', 'Semua anggota tim berbagi akun sosial, kalender, dan inbox yang sama.'),
    isAdmin ? h('div', { class: 'panel' }, h('h2', {}, 'Anggota'),
      h('div', { class: 'list', style: { marginBottom: '14px' } }, users.map((u) => h('div', { class: 'item' },
        h('div', { class: 'body' }, h('b', {}, u.name || u.email), h('div', { class: 'meta' }, h('span', {}, u.email), h('span', {}, u.role === 'admin' ? 'Admin' : 'Anggota'))),
        u.id !== state.user.id ? h('button', { class: 'btn sm ghost danger', onclick: async () => { if (!confirm(`Hapus ${u.email}?`)) return; await api('DELETE', `/v1/users/${u.id}`); route(); } }, 'Hapus') : h('span', { class: 'faint small' }, 'Kamu')))),
      add) : null,
    h('div', { class: 'panel', style: { maxWidth: '460px' } }, h('h2', {}, 'Ganti password'), pw)));
}

// ---------------- router ----------------
async function route() {
  const path = (location.hash.slice(1) || '/').split('?')[0];
  try {
    if (!state.user) {
      const st = await api('GET', '/auth/state');
      state.mock = st.mock; state.user = st.user;
      if (!st.user) { $app.replaceChildren(authPage(st.needs_setup ? 'setup' : 'login')); return; }
      await loadAccounts();
      state.stats = await api('GET', '/v1/stats');
    }
    if (path === '/login') { go('/'); return; }
    let m, view;
    if (path === '/') view = await pageHome();
    else if (path === '/compose') view = await pageCompose();
    else if ((m = path.match(/^\/compose\/(.+)$/))) view = await pageCompose(m[1]);
    else if ((m = path.match(/^\/posts\/(.+)$/))) view = await pagePost(m[1]);
    else if (path === '/calendar') view = await pageCalendar();
    else if (path === '/inbox') view = await pageInbox();
    else if (path === '/accounts') view = await pageAccounts();
    else if (path === '/media') view = await pageMedia();
    else if (path === '/developer') view = await pageDeveloper();
    else if (path === '/team') view = await pageTeam();
    else view = shell('', h('div', { class: 'panel empty' }, h('h2', {}, 'Halaman tidak ditemukan'), h('a', { class: 'btn', href: '#/' }, 'Ke beranda')));
    $app.replaceChildren(view);
    window.scrollTo(0, 0);
  } catch (e) {
    if (e.code === 'unauthenticated') return;
    $app.replaceChildren(shell('', h('div', { class: 'panel' }, h('h2', {}, 'Halaman gagal dimuat'), h('p', {}, errMsg(e)), h('button', { class: 'btn', onclick: route }, 'Muat ulang'))));
  }
}
window.addEventListener('hashchange', route);
route();
