// LRMsmm dashboard — vanilla JS SPA (no build step). UI mengikuti hrd.playgo.id.
import { HERO } from './icons.js';
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
const PLAT_SVG = {
  instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="6" width="18" height="14" rx="3"/><path d="M8 6l1.5-2.5h5L16 6"/><circle cx="12" cy="13" r="3.5"/></svg>',
  threads: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 5h14v9a3 3 0 0 1-3 3h-5l-4 3v-3H5z"/><path d="M9 9h6M9 12.5h4"/></svg>',
};
// UI icons: Heroicons v1 outline — the same set hrd.playgo.id uses
const ICO = { home: 'home', pen: 'pencil-alt', cal: 'calendar', chat: 'chat-alt-2', inbox: 'chat', chart: 'trending-up', users: 'user-group',
  img: 'photograph', key: 'code', shield: 'shield-check', team: 'users', menu: 'menu', bell: 'bell', logout: 'logout', person: 'user-circle',
  x: 'x', warn: 'exclamation', clock: 'clock', send: 'paper-airplane', upload: 'cloud-upload', lock: 'lock-closed', bolt: 'lightning-bolt',
  sparkles: 'sparkles', link: 'link', globe: 'globe-alt', plus: 'plus', right: 'chevron-right', refresh: 'refresh', cog: 'cog', doc: 'document-text', grid: 'view-grid' };
const icon = (k) => {
  if (PLAT_SVG[k]) return svg(PLAT_SVG[k]);
  const p = HERO[ICO[k] || k];
  return p ? svg(`<svg class="hi" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" aria-hidden="true">${p}</svg>`) : h('span');
};
const logo = (tag = 'a', attrs = {}) => h(tag, { class: 'logo', href: tag === 'a' ? '#/' : null, ...attrs },
  h('span', { class: 'word' }, 'LRM', h('span', {}, 'smm')), h('span', { class: 'tag' }, 'SMM'));
const pref = { get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } } };
const PLAT = { instagram: 'Instagram', threads: 'Threads' };
const initials = (s) => (s || '?').replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase();
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
function toast(msg, bad = false, action = null) {
  const el = h('div', { class: bad ? 'bad' : '' }, msg,
    action ? h('button', { class: 'toast-act', onclick: () => { el.remove(); action.fn(); } }, action.label) : null);
  document.getElementById('toast').append(el);
  setTimeout(() => el.remove(), action ? 6000 : bad ? 6000 : 3200);
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
const state = { user: null, mock: false, accounts: [], stats: {}, lastOverdue: 0 };
const isOwner = () => state.user?.role === 'owner';
const ROLE = { owner: 'Owner', rep: 'Representative' };
async function loadAccounts() { state.accounts = (await api('GET', '/v1/accounts')).data; return state.accounts; }

function badgeFor(key) {
  const s = state.stats;
  if (key === 'messages') return s.messages_overdue ? { n: s.messages_overdue, tone: 'bad', title: `${s.messages_overdue} pesan menunggu lebih dari 5 menit` } : s.messages_waiting ? { n: s.messages_waiting, tone: 'soft', title: `${s.messages_waiting} pesan menunggu balasan` } : null;
  if (key === 'comments') return s.unreplied ? { n: s.unreplied, tone: 'soft', title: `${s.unreplied} komentar belum dibalas` } : null;
  return null;
}
function badgeEl(key) {
  const b = badgeFor(key);
  return h('span', { class: `count ${b?.tone || ''}`, 'data-badge': key, title: b?.title || '', hidden: !b }, b?.n ?? '');
}

// Navigation grouped like the HRD sidebar
function navGroups() {
  return [
    ['Operasional', [['/', 'home', 'Beranda'], ['/compose', 'pen', 'Tulis Post'], ['/calendar', 'cal', 'Kalender Konten']]],
    ['Interaksi', [['/messages', 'chat', 'Pesan (DM)', 'messages'], ['/inbox', 'inbox', 'Komentar', 'comments'], ['/insights', 'chart', 'Insights']]],
    ['Administrasi & Integrasi', [['/accounts', 'users', 'Akun Sosial'], ['/media', 'img', 'Pustaka Media'], ['/developer', 'key', 'API & AI'],
      ['/team', 'team', isOwner() ? 'Tim & Akses' : 'Akun Saya'], ...(isOwner() ? [['/admin', 'shield', 'Jejak Audit']] : [])]],
  ];
}
const PAGE_LABEL = () => Object.fromEntries(navGroups().flatMap(([g, items]) => items.map(([p, , l]) => [p, { label: l, group: g }])));

let clockTimer;
function shell(active, content) {
  const info = PAGE_LABEL()[active] || { label: 'LRMsmm', group: '' };
  content.classList.add('wrap');
  const clock = h('div', { class: 'clock', title: 'Waktu server (WIB)' });
  const tick = () => { clock.textContent = `${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })} WIB · Jakarta`; };
  tick(); clearInterval(clockTimer); clockTimer = setInterval(tick, 30000);
  const close = () => document.body.classList.remove('side-open');
  return h('div', { class: 'app' },
    h('aside', { class: 'side' },
      h('div', {},
        h('div', { class: 'side-top' }, logo(), h('button', { class: 'side-close', 'aria-label': 'Tutup menu', onclick: close }, icon('x'))),
        h('nav', { class: 'nav', 'aria-label': 'Menu utama' }, navGroups().map(([g, items]) =>
          h('div', { class: 'nav-group' }, h('div', { class: 'nav-h' }, g),
            h('div', { class: 'nav-items' }, items.map(([p, ic, label, badge]) =>
              h('a', { href: `#${p}`, class: active === p ? 'on' : '', onclick: close }, icon(ic), h('span', { class: 'lbl' }, label), badge ? badgeEl(badge) : null))))))),
      h('div', { class: 'side-foot' },
        h('a', { class: 'ucard', href: '#/team' },
          h('div', { class: 'who' }, h('div', { class: 'ini' }, initials(state.user?.name || state.user?.email)),
            h('div', { style: { minWidth: 0 } }, h('div', { class: 'nm' }, state.user?.name || state.user?.email), h('div', { class: 'rl' }, ROLE[state.user?.role] || ''))),
          icon('right')),
        h('button', { class: 'logout', onclick: async () => { await api('POST', '/auth/logout'); state.user = null; live.stop(); go('/login'); } }, icon('logout'), h('span', {}, 'Keluar Akun')))),
    h('div', { class: 'scrim', onclick: close }),
    h('div', { class: 'col' },
      h('header', { class: 'hdr' }, h('div', { class: 'hdr-in' },
        h('div', { class: 'hdr-l' },
          h('button', { class: 'menu-btn', 'aria-label': 'Buka menu', onclick: () => document.body.classList.add('side-open') }, icon('menu')),
          h('div', { class: 'crumb' }, info.group ? h('span', {}, info.group) : null, info.group ? h('span', { class: 'sep' }, '/') : null, h('b', {}, info.label))),
        h('div', { class: 'hdr-r' },
          h('a', { class: 'chip', href: '#/compose' }, icon('pen'), h('span', { class: 'chip-t' }, 'Tulis Post')),
          h('a', { class: 'chip', href: '#/messages', title: 'Pesan belum dibalas' }, icon('bell'), h('span', { class: 'chip-t' }, 'Pesan'), badgeEl('messages')),
          clock,
          h('span', { class: 'role' }, ROLE[state.user?.role] || '')))),
      h('main', { class: 'main' },
        state.mock ? h('div', { class: 'wrap', style: { marginBottom: '1.5rem' } }, h('div', { class: 'mock-banner' }, icon('warn'), 'Mode simulasi — Instagram & Threads tiruan, tidak ada yang benar-benar terposting.')) : null,
        content)));
}

// HRD-style page header: eyebrow pill + extrabold title + description, actions on the right
function pagehead(title, sub, ...actions) {
  const path = (location.hash.slice(1) || '/').split('?')[0];
  const info = PAGE_LABEL()[path] || PAGE_LABEL()['/' + path.split('/')[1]];
  const eyebrow = path === '/' ? new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : (info?.group || 'LRMsmm');
  return h('div', { class: 'pagehead' },
    h('div', {}, h('div', { class: 'eyebrow' }, icon(path === '/' ? 'cal' : 'grid'), h('span', {}, eyebrow)), h('h1', {}, title), sub ? h('p', {}, sub) : null),
    h('div', { class: 'row' }, actions));
}
// HRD stat card: label, big number, icon tile, footer with link
const stat = (href, ic, value, label, foot, tone = 'em', alert = false, linkText = 'Kelola →') =>
  h('a', { class: `stat tone-${tone} ${alert ? 'alert' : ''}`, href },
    h('div', { class: 'top' }, h('div', {}, h('div', { class: 'lbl' }, label), h('div', { class: 'val' }, value)), h('div', { class: 'ico' }, icon(ic))),
    h('div', { class: 'foot' }, h('span', {}, foot), h('b', {}, linkText)));
const secHead = (ic, title, sub, link) => h('div', { class: 'sec-h' },
  h('h2', {}, h('span', { class: 'ico' }, icon(ic)), h('span', {}, title, sub ? h('div', { class: 'faint small', style: { fontWeight: 500 } }, sub) : null)),
  link ? h('a', { href: link[0] }, link[1]) : null);

// ---------------- live updates: badges, overdue popup, SSE ----------------
const live = {
  es: null, timer: null, listeners: new Set(),
  start() {
    if (this.es) return;
    try {
      this.es = new EventSource('/v1/events');
      for (const t of ['message.new', 'message.sent', 'message.status', 'comment.new', 'post.updated']) {
        this.es.addEventListener(t, (e) => { const d = JSON.parse(e.data || '{}'); this.refresh(); for (const fn of this.listeners) fn(t, d); });
      }
      this.es.onerror = () => { /* browser reconnects automatically */ };
    } catch { /* SSE unsupported: polling only */ }
    this.timer = setInterval(() => this.refresh(), 30000);
    this.refresh();
  },
  stop() { this.es?.close(); this.es = null; clearInterval(this.timer); },
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  async refresh() {
    try { state.stats = await api('GET', '/v1/stats'); } catch { return; }
    for (const el of document.querySelectorAll('[data-badge]')) {
      const b = badgeFor(el.dataset.badge);
      el.hidden = !b; el.textContent = b?.n ?? ''; el.className = `count ${b?.tone || ''}`; el.title = b?.title || '';
    }
    const o = state.stats.messages_overdue || 0;
    document.title = o ? `(${o}) LRMsmm` : 'LRMsmm';
    if (o > state.lastOverdue) overduePopup(o);
    state.lastOverdue = o;
  },
};
function overduePopup(n) {
  document.querySelector('.overdue-pop')?.remove();
  const el = h('a', { class: 'overdue-pop', href: '#/messages', role: 'alert', onclick: () => el.remove() },
    h('b', {}, n), h('span', {}, n === 1 ? 'pesan belum dibalas lebih dari 5 menit' : 'pesan belum dibalas lebih dari 5 menit'),
    h('button', { class: 'x', 'aria-label': 'Tutup', onclick: (e) => { e.preventDefault(); e.stopPropagation(); el.remove(); } }, '×'));
  document.body.append(el);
}

// ---------------- auth (HRD login layout) ----------------
function authPage(mode) {
  const next = new URLSearchParams(location.hash.split('?')[1] || '').get('next');
  const setup = mode === 'setup';
  const field = (label, ic, attrs) => h('label', { class: 'field' }, h('span', {}, label), h('div', { class: 'inp-ico' }, icon(ic), h('input', attrs)));
  const form = h('form', { class: 'auth-card', onsubmit: async (e) => {
    e.preventDefault();
    try {
      const r = await api('POST', setup ? '/auth/register' : '/auth/login', Object.fromEntries(new FormData(form)));
      state.user = r.user;
      if (next) location.href = next; else go('/');
    } catch (err) { toast(err.message, true); }
  } },
  h('div', { class: 'pill' }, 'Portal Terpadu Social Media'),
  h('h1', {}, setup ? 'Buat Akun Owner' : 'Selamat Datang Kembali'),
  h('p', {}, setup ? 'Akun pertama otomatis menjadi Owner. Anggota tim lain ditambahkan dari menu Tim & Akses.' : 'Masuk ke LRMsmm untuk menulis, menjadwalkan, dan membalas komentar serta pesan Instagram & Threads seluruh brand HR Group.'),
  setup ? field('Nama', 'person', { name: 'name', autocomplete: 'name', placeholder: 'Nama lengkap' }) : null,
  field('Email', 'person', { name: 'email', type: 'email', required: true, autocomplete: 'email', placeholder: 'Alamat email Anda' }),
  field('Kata Sandi', 'lock', { name: 'password', type: 'password', required: true, minlength: setup ? 8 : null, autocomplete: setup ? 'new-password' : 'current-password', placeholder: '••••••••' }),
  h('button', { class: 'btn primary' }, setup ? 'Buat Akun' : 'Masuk ke Akun', icon('right')),
  h('div', { class: 'auth-note' }, icon('shield'), 'Koneksi terenkripsi · token Meta disimpan terenkripsi AES-256'));
  const feat = (ic, t, d) => h('div', { class: 'feat' }, h('div', { class: 'ico' }, icon(ic)), h('div', {}, h('b', {}, t), h('span', {}, d)));
  return h('div', { class: 'auth' },
    h('div', { class: 'auth-bar' }, logo('div'), h('div', { class: 'clock' }, 'WIB (UTC+7) Jakarta')),
    h('div', { class: 'auth-main' }, form,
      h('div', { class: 'auth-side' },
        h('div', { class: 'tagline' }, logo('div'), h('span', { class: 'eco' }, 'Ecosystem')),
        h('h2', {}, 'Satu Tempat untuk Semua Akun Sosial'),
        h('p', {}, 'Infrastruktur konten terpadu untuk seluruh brand: rapi, terjadwal, dan bisa dikerjakan bersama AI.'),
        feat('cal', 'Jadwal & Kalender Konten', 'Tulis sekali, terbit di Instagram dan Threads sesuai jadwal.'),
        feat('chat', 'Pesan & Komentar Terpusat', 'Satu inbox untuk semua akun, dengan pengingat pesan lebih dari 5 menit.'),
        feat('bolt', 'Terhubung ke Claude & ChatGPT', 'MCP dan REST API dengan akses Owner / Representative.'))));
}

// ---------------- home (HRD Beranda layout) ----------------
async function pageHome() {
  const [stats, sched, recent] = await Promise.all([
    api('GET', '/v1/stats'), api('GET', '/v1/posts?status=scheduled&limit=100'), api('GET', '/v1/posts?limit=30'),
  ]);
  state.stats = stats;
  const upcoming = sched.data.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)).slice(0, 6);
  const attention = recent.data.filter((p) => ['failed', 'partial'].includes(p.status)).slice(0, 5);
  const published = recent.data.filter((p) => p.status === 'published').slice(0, 5);
  const expired = state.accounts.filter((a) => a.status === 'expired');
  const ig = state.accounts.filter((a) => a.platform === 'instagram').length;
  const tasks = (stats.messages_overdue ? 1 : 0) + (attention.length ? 1 : 0) + (expired.length ? 1 : 0);
  const first = state.user.name ? state.user.name.split(' ')[0] : '';
  return shell('/', h('div', {},
    pagehead(`Halo${first ? ', ' + first : ''}`, 'Pusat kendali konten dan interaksi seluruh akun Instagram & Threads HR Group.',
      h('a', { class: 'btn soft', href: '#/messages' }, icon('chat'), 'Buka Pesan'),
      h('a', { class: 'btn primary', href: '#/compose' }, icon('plus'), 'Tulis Post'),
      h('a', { class: 'btn', href: '#/calendar' }, icon('cal'), 'Kalender')),
    tasks ? h('div', { class: `banner ${stats.messages_overdue || expired.length ? 'red' : ''}` },
      h('div', { class: 'l' }, h('span', { class: 'num' }, tasks),
        h('div', {}, h('h3', {}, 'Tugas Menunggu Tindakan'),
          h('p', {}, [
            stats.messages_overdue ? `${stats.messages_overdue} pesan belum dibalas lebih dari 5 menit` : null,
            attention.length ? `${attention.length} post gagal terbit` : null,
            expired.length ? `${expired.length} akun perlu disambungkan ulang` : null,
          ].filter(Boolean).join(' · ')))),
      h('div', { class: 'row' },
        stats.messages_overdue ? h('a', { class: 'btn primary sm', href: '#/messages' }, 'Balas Pesan', icon('right')) : null,
        attention.length ? h('a', { class: 'btn sm', href: `#/posts/${attention[0].id}` }, 'Tinjau Post Gagal') : null,
        expired.length ? h('a', { class: 'btn sm', href: '#/accounts' }, 'Sambungkan Ulang') : null)) : null,
    h('div', { class: 'strip' },
      stat('#/accounts', 'users', stats.accounts, 'Akun Sosial Aktif', `${ig} Instagram · ${state.accounts.length - ig} Threads`, 'em'),
      stat('#/calendar', 'cal', stats.scheduled, 'Post Terjadwal', upcoming[0] ? `Berikutnya ${fmtDT(upcoming[0].scheduled_at)}` : 'Belum ada jadwal', 'sky', false, 'Kalender →'),
      stat('#/messages', 'chat', stats.messages_waiting, 'Pesan Menunggu', stats.messages_overdue ? `${stats.messages_overdue} lewat 5 menit` : 'Semua dalam batas', stats.messages_overdue ? 'ro' : 'am', !!stats.messages_overdue, 'Balas →'),
      stat('#/inbox', 'inbox', stats.unreplied, 'Komentar Baru', stats.failed_7d ? `${stats.failed_7d} post gagal (7 hari)` : 'Belum dibalas', 'pu', false, 'Buka →')),
    h('div', { class: 'panel' },
      h('div', { class: 'sec-h', style: { paddingBottom: '1rem', borderBottom: '1px solid var(--slate-100)', marginBottom: '1rem' } },
        h('div', {}, h('h2', {}, 'Pusat Tindakan Cepat'), h('div', { class: 'faint small', style: { fontWeight: 500 } }, 'Jalan pintas untuk pekerjaan harian tim konten.')),
        h('span', { class: 'mode' }, `${ROLE[state.user.role]} Mode`)),
      h('div', { class: 'quick' }, [
        ['#/compose', 'pen', 'Tulis Post', 'IG & Threads', 'em'], ['#/calendar', 'cal', 'Kalender', 'Jadwal Konten', 'sky'],
        ['#/messages', 'chat', 'Pesan', 'DM Instagram', 'ro'], ['#/inbox', 'inbox', 'Komentar', 'Balas & Moderasi', 'am'],
        ['#/insights', 'chart', 'Insights', 'Statistik Akun', 'pu'], ['#/media', 'img', 'Media', 'Pustaka Foto', 'em'],
      ].map(([href, ic, t, d, tone]) => h('a', { class: `q-${tone}`, href }, h('div', { class: 'ico' }, icon(ic)), h('b', {}, t), h('small', {}, d))))),
    !state.accounts.length ? h('div', { class: 'panel empty' }, h('h2', {}, 'Sambungkan akun pertama'), h('p', {}, 'Hubungkan Instagram Business/Creator atau Threads untuk mulai posting.'), h('a', { class: 'btn primary', href: '#/accounts' }, 'Sambungkan Akun')) : null,
    attention.length ? h('div', {}, secHead('warn', 'Perlu Dicek', 'Post yang gagal terbit di salah satu akun.', ['#/admin?t=failed', isOwner() ? 'Lihat Semua →' : '']), postList(attention)) : null,
    h('div', { class: 'grid2' },
      h('div', {}, secHead('cal', 'Terbit Berikutnya', 'Post terjadwal terdekat.', ['#/calendar', 'Lihat Kalender →']),
        upcoming.length ? postList(upcoming) : h('div', { class: 'list empty' }, 'Belum ada post terjadwal.', h('br'), h('a', { class: 'btn primary sm', href: '#/compose' }, 'Jadwalkan Post'))),
      h('div', {}, secHead('send', 'Baru Terbit', 'Aktivitas posting terakhir.', ['#/calendar?v=list', 'Lihat Semua →']),
        published.length ? postList(published) : h('div', { class: 'list empty' }, 'Belum ada post yang terbit.')))));
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
  const atParam = new URLSearchParams(location.hash.split('?')[1] || '').get('at');
  const editing = editId ? await api('GET', `/v1/posts/${editId}`) : null;
  const active = state.accounts.filter((a) => a.status === 'active');
  const s = {
    key: crypto.randomUUID(),
    selected: new Set(editing ? editing.targets.map((t) => t.account_id) : active.length === 1 ? [active[0].id] : []),
    content: editing?.content || '',
    media: editing ? editing.media : [],
    per: {}, // account_id -> { content?, options:{} }
    when: editing || atParam ? 'later' : 'now',
    at: editing?.scheduled_at ? toLocalInput(editing.scheduled_at) : toLocalInput(atParam || new Date(Date.now() + 3600_000).toISOString()),
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
  const BIG = 20 * 1024 * 1024; // above this: resumable chunked upload
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
  // Resumable chunked upload: retries each part and, after a reload, continues from the parts already received.
  const key = `lrm-up:${file.name}:${file.size}:${file.lastModified}`;
  let up = null;
  try { const saved = JSON.parse(localStorage.getItem(key) || 'null'); if (saved) { const st = await api('GET', `/v1/media/${saved.id}/parts`).catch(() => null); if (st?.status === 'uploading') up = { ...st, received: st.received }; } } catch { /* storage unavailable */ }
  if (!up) {
    up = { ...(await api('POST', '/v1/media/uploads', { mime_type: file.type || 'video/mp4', size_bytes: file.size, original_name: file.name, in_library: inLibrary })), received: [] };
    try { localStorage.setItem(key, JSON.stringify({ id: up.id })); } catch { /* ignore */ }
  }
  const done = new Set(up.received);
  for (let i = 1; i <= up.part_count; i++) {
    if (done.has(i)) { onProgress?.(i / up.part_count); continue; }
    for (let attempt = 1; ; attempt++) {
      try {
        await api('PUT', `/v1/media/${up.id}/parts/${i}`, file.slice((i - 1) * up.part_size, i * up.part_size), { headers: { 'content-type': 'application/octet-stream' } });
        break;
      } catch (e) {
        if (attempt >= 5 || (e.code && e.code !== 'internal_error')) throw e;
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
    }
    onProgress?.(i / up.part_count);
  }
  const m = await api('POST', `/v1/media/${up.id}/complete`);
  try { localStorage.removeItem(key); } catch { /* ignore */ }
  return m;
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
        h('button', { class: 'btn ghost danger sm', onclick: async () => { if (!confirm('Hapus dari riwayat LRMsmm? Post di Instagram/Threads tidak ikut terhapus.')) return; await api('POST', `/v1/posts/${p.id}/remove`); toast('Dihapus dari riwayat'); go('/calendar'); } }, 'Hapus dari riwayat')) : null);
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
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = (d) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));

async function pageCalendar() {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const view = q.get('v') || 'month';
  const anchor = q.get('d') ? new Date(`${q.get('d')}T00:00:00`) : new Date();
  let start, end, label;
  if (view === 'month') {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    start = mondayOf(first); end = addDays(start, 42);
    label = first.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  } else if (view === '3day') {
    start = startOfDay(anchor); end = addDays(start, 3);
    label = `${start.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} – ${addDays(end, -1).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  } else {
    start = mondayOf(anchor); end = addDays(start, 7);
    label = `${start.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} – ${addDays(end, -1).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  const { data } = await api('GET', `/v1/calendar?from=${start.toISOString()}&to=${end.toISOString()}`);
  const step = view === 'month' ? null : view === '3day' ? 3 : 7;
  const nav = (dir) => {
    let d;
    if (!dir) d = new Date();
    else if (view === 'month') d = new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);
    else d = addDays(anchor, dir * step);
    go(`/calendar?v=${view}&d=${ymd(d)}`);
  };
  const today = startOfDay(new Date()).getTime();
  const at = (p) => new Date(p.scheduled_at || p.created_at);
  const dayPosts = (d) => data.filter((p) => startOfDay(at(p)).getTime() === d.getTime());
  const createAt = (d) => { const x = new Date(d); x.setHours(9, 0, 0, 0); if (x < new Date()) { x.setTime(Date.now() + 3600_000); x.setMinutes(0, 0, 0); } return `/compose?at=${encodeURIComponent(x.toISOString())}`; };
  const ev = (p) => h('a', { class: `ev ${p.status}`, href: `#/posts/${p.id}`, onclick: (e) => e.stopPropagation() },
    h('time', {}, fmtTime(at(p).toISOString())), h('span', { class: 't' }, p.content || '(media)'),
    h('span', { class: 'icons' }, [...new Set(p.targets.map((t) => t.platform))].map(icon)));

  let body;
  if (view === 'list') {
    body = data.length ? postList(data) : h('div', { class: 'list empty' }, 'Tidak ada post di rentang ini.');
  } else if (view === 'month') {
    const cells = [...Array(42)].map((_, i) => addDays(start, i));
    body = h('div', { class: 'month' },
      ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((d) => h('div', { class: 'mh' }, d)),
      cells.map((d) => {
        const ps = dayPosts(d); const past = d.getTime() < today; const other = d.getMonth() !== anchor.getMonth();
        return h('div', { class: `mc ${other ? 'other' : ''} ${d.getTime() === today ? 'today' : ''} ${past ? 'past' : ''}`,
          role: past ? null : 'button', tabindex: past ? null : 0, title: past ? null : `Buat post tanggal ${d.getDate()}`,
          onclick: past ? null : () => go(createAt(d)), onkeydown: past ? null : (e) => { if (e.key === 'Enter') go(createAt(d)); } },
        h('div', { class: 'mn' }, d.getDate()),
        ps.slice(0, 3).map(ev),
        ps.length > 3 ? h('a', { class: 'more', href: `#/calendar?v=3day&d=${ymd(d)}`, onclick: (e) => e.stopPropagation() }, `+${ps.length - 3} lagi`) : null);
      }));
  } else {
    const days = [...Array(step)].map((_, i) => addDays(start, i));
    body = h('div', { class: 'cal', style: { gridTemplateColumns: `repeat(${step}, minmax(0, 1fr))` } }, days.map((d) => {
      const past = d.getTime() < today;
      return h('div', { class: `day ${d.getTime() === today ? 'today' : ''}` },
        h('div', { class: 'dh' }, d.toLocaleDateString('id-ID', { weekday: 'short' }), h('b', {}, d.getDate()),
          !past ? h('a', { class: 'add-day', href: `#${createAt(d)}`, 'aria-label': `Buat post tanggal ${d.getDate()}` }, '+') : null),
        dayPosts(d).map(ev));
    }));
  }
  return shell('/calendar', h('div', {},
    pagehead('Kalender', label,
      h('div', { class: 'seg' }, [['month', 'Bulan'], ['week', 'Minggu'], ['3day', '3 hari'], ['list', 'Daftar']].map(([v, l]) => h('button', { class: view === v ? 'on' : '', onclick: () => go(`/calendar?v=${v}&d=${ymd(anchor)}`) }, l))),
      h('button', { class: 'btn', onclick: () => nav(-1), 'aria-label': 'Sebelumnya' }, '‹'),
      h('button', { class: 'btn', onclick: () => nav(0) }, 'Hari ini'),
      h('button', { class: 'btn', onclick: () => nav(1), 'aria-label': 'Berikutnya' }, '›'),
      h('a', { class: 'btn primary', href: '#/compose' }, 'Tulis post')),
    body,
    view === 'month' ? h('p', { class: 'faint small', style: { marginTop: '10px' } }, 'Klik tanggal untuk membuat post di hari itu.') : null));
}

// ---------------- inbox ----------------
async function pageInbox() {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const filter = q.get('f') || 'unreplied';
  const acc = q.get('a') || '';
  const group = q.get('g') === 'post';
  await loadAccounts();
  const setQ = (k, v) => { const n = new URLSearchParams(q); v ? n.set(k, v) : n.delete(k); go(`/inbox?${n}`); };
  const listWrap = h('div');

  async function draw() {
    const [{ data }, all] = await Promise.all([
      api('GET', `/v1/comments?reply_status=${filter}&limit=100${acc ? `&account_id=${acc}` : ''}`),
      api('GET', `/v1/comments?reply_status=all&include_own=true&limit=100${acc ? `&account_id=${acc}` : ''}`),
    ]);
    const repliesOf = (c) => all.data.filter((x) => x.parent_id === c.id && x.from_self);
    const row = (c) => {
      const accnt = state.accounts.find((a) => a.id === c.account_id);
      const reply = h('textarea', { placeholder: `Balas @${c.username}…`, 'aria-label': `Balas komentar @${c.username}`,
        onkeydown: (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendBtn.click(); } } });
      const sendBtn = h('button', { class: 'btn primary sm', onclick: async (e) => {
        if (!reply.value.trim()) return;
        e.currentTarget.disabled = true;
        try { await api('POST', `/v1/comments/${c.id}/reply`, { message: reply.value }); toast('Balasan terkirim'); draw(); live.refresh(); }
        catch (err) { e.currentTarget.disabled = false; toast(errMsg(err), true); }
      } }, 'Balas');
      const setStatus = async (st, msg, undoTo) => {
        await api('PATCH', `/v1/comments/${c.id}`, { reply_status: st }); draw(); live.refresh();
        if (msg) toast(msg, false, undoTo ? { label: 'Urungkan', fn: async () => { await api('PATCH', `/v1/comments/${c.id}`, { reply_status: undoTo }); draw(); live.refresh(); } } : null);
      };
      return h('div', { class: `cmt ${c.hidden ? 'hidden' : ''}` },
        accnt ? avatar(accnt) : null,
        h('div', { class: 'body', style: { flex: 1, minWidth: 0 } },
          h('div', { class: 'row' }, h('span', { class: 'who' }, `@${c.username}`), h('span', { class: 'faint small' }, `${ago(c.commented_at)} · ke @${c.account_username}`),
            c.hidden ? h('span', { class: 'status' }, 'Disembunyikan') : null, c.reply_status === 'ignored' ? h('span', { class: 'status' }, 'Selesai') : null),
          h('div', { class: 'txt' }, c.text || ''),
          repliesOf(c).map((r) => h('div', { class: 'replies' }, h('b', {}, 'Balasan kamu: '), r.text)),
          h('div', { class: 'reply-box' }, reply, sendBtn),
          h('div', { class: 'row', style: { marginTop: '6px' } },
            c.reply_status !== 'ignored'
              ? h('button', { class: 'btn ghost sm', title: 'Tandai selesai kalau tidak perlu dibalas', onclick: () => setStatus('ignored', 'Ditandai selesai', c.reply_status) }, 'Tandai selesai')
              : h('button', { class: 'btn ghost sm', onclick: () => setStatus('unreplied') }, 'Tandai perlu dibalas'),
            h('button', { class: 'btn ghost sm', onclick: async () => { try { await api('POST', `/v1/comments/${c.id}/hide`, { hidden: !c.hidden }); toast(c.hidden ? 'Komentar ditampilkan' : 'Komentar disembunyikan'); draw(); } catch (err) { toast(errMsg(err), true); } } }, c.hidden ? 'Tampilkan' : 'Sembunyikan'),
            !group && c.post_id ? h('a', { class: 'btn ghost sm', href: `#/posts/${c.post_id}` }, 'Buka post') : null,
            h('span', { class: 'faint small' }, 'Ctrl+Enter untuk kirim'))));
    };
    if (!data.length) { listWrap.replaceChildren(h('div', { class: 'list empty' }, filter === 'unreplied' ? 'Semua komentar sudah dibalas.' : 'Tidak ada komentar.')); return; }
    if (!group) { listWrap.replaceChildren(h('div', { class: 'list' }, data.map(row))); return; }
    const groups = new Map();
    for (const c of data) { const k = c.post_id || c.platform_media_id; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); }
    const posts = await Promise.all([...groups.keys()].map((k) => (k?.startsWith('p_') ? api('GET', `/v1/posts/${k}`).catch(() => null) : null)));
    listWrap.replaceChildren(...[...groups.entries()].map(([k, cs], i) => {
      const p = posts[i]; const m = p?.media?.[0];
      return h('div', { class: 'list', style: { marginBottom: '14px' } },
        h(p ? 'a' : 'div', { class: 'item group-head', href: p ? `#/posts/${p.id}` : null },
          m ? h('img', { class: 'thumb', src: m.url, alt: '' }) : h('div', { class: 'thumb' }),
          h('div', { class: 'body' }, h('div', { class: 'title' }, p?.content || 'Post di luar LRMsmm'), h('div', { class: 'meta' }, `${cs.length} komentar · @${cs[0].account_username}`))),
        cs.map(row));
    }));
  }
  await draw();
  pageCleanup = live.on((t) => { if (t === 'comment.new' && document.activeElement?.tagName !== 'TEXTAREA') draw(); });
  return shell('/inbox', h('div', {},
    pagehead('Komentar', 'Komentar Instagram dan balasan Threads di post kamu. Komentar baru masuk otomatis.',
      h('select', { style: { width: 'auto' }, onchange: (e) => setQ('a', e.target.value), 'aria-label': 'Filter akun' }, h('option', { value: '' }, 'Semua akun'), state.accounts.map((a) => h('option', { value: a.id, selected: a.id === acc }, `@${a.username} (${PLAT[a.platform]})`))),
      h('div', { class: 'seg' }, [['unreplied', 'Perlu dibalas'], ['all', 'Semua'], ['hidden', 'Disembunyikan']].map(([v, l]) => h('button', { class: filter === v ? 'on' : '', onclick: () => setQ('f', v) }, l))),
      h('div', { class: 'seg' }, h('button', { class: !group ? 'on' : '', onclick: () => setQ('g', '') }, 'Terbaru'), h('button', { class: group ? 'on' : '', onclick: () => setQ('g', 'post') }, 'Per post')),
      h('button', { class: 'btn', onclick: async (e) => { e.currentTarget.disabled = true; const r = await api('POST', '/v1/comments/sync'); toast(`${r.synced} komentar dicek`); route(); } }, 'Muat terbaru')),
    listWrap));
}

// ---------------- messages (Instagram DM) ----------------
const drafts = {};
function waitBadge(c) {
  if (!c.needs_reply || c.waiting_minutes == null) return null;
  const m = c.waiting_minutes;
  const late = m >= Math.round((state.stats.overdue_threshold_seconds || 300) / 60);
  const txt = m < 1 ? 'baru' : m < 60 ? `${m} mnt` : m < 1440 ? `${Math.floor(m / 60)} jam` : `${Math.floor(m / 1440)} hr`;
  return h('span', { class: `wait ${late ? 'late' : ''}`, title: late ? 'Menunggu lebih dari 5 menit' : 'Menunggu balasan' }, txt);
}
async function pageMessages(convId) {
  await loadAccounts();
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const filter = q.get('f') || 'needs_reply';
  const acc = q.get('a') || '';
  const igAccounts = state.accounts.filter((a) => a.platform === 'instagram');
  const qs = (extra = {}) => { const n = new URLSearchParams(q); for (const [k, v] of Object.entries(extra)) v ? n.set(k, v) : n.delete(k); const t = n.toString(); return t ? `?${t}` : ''; };
  const wrap = h('div', { class: `dm ${convId ? 'has-thread' : ''}` });
  const listEl = h('div', { class: 'dm-list' });
  const threadEl = h('div', { class: 'dm-thread' });
  wrap.append(listEl, threadEl);

  async function drawList() {
    const { data } = await api('GET', `/v1/conversations?filter=${filter}${acc ? `&account_id=${acc}` : ''}`);
    listEl.replaceChildren(...(data.length ? data.map((c) => h('a', { class: `dm-row ${c.id === convId ? 'on' : ''}`, href: `#/messages/${c.id}${qs()}` },
      h('span', { class: 'peer' }, initials(c.participant.username)),
      h('div', { class: 'body' },
        h('div', { class: 'who' }, `@${c.participant.username || 'pengguna'}`),
        h('div', { class: 'prev' }, c.last_message.direction === 'out' ? 'Kamu: ' : '', c.last_message.text || ''),
        h('div', { class: 'faint small' }, `ke @${c.account_username}`)),
      h('div', { style: { textAlign: 'right' } }, h('div', { class: 'faint small' }, ago(c.last_message.at)), waitBadge(c))))
      : [h('div', { class: 'dm-empty' }, filter === 'needs_reply' ? 'Semua pesan sudah dibalas.' : 'Belum ada percakapan.')]));
  }
  async function drawThread() {
    if (!convId) { threadEl.replaceChildren(h('div', { class: 'dm-empty' }, igAccounts.length ? 'Pilih percakapan di kiri.' : 'Hubungkan akun Instagram untuk membalas DM.')); return; }
    let c;
    try { c = await api('GET', `/v1/conversations/${convId}`); } catch (e) { threadEl.replaceChildren(h('div', { class: 'dm-empty' }, errMsg(e))); return; }
    const box = h('div', { class: 'dm-msgs' });
    for (const m of c.messages) {
      box.append(h('div', { class: `bubble ${m.direction}` }, m.text || (m.attachments?.length ? '[lampiran]' : '')),
        h('div', { class: `bubble-meta ${m.direction}` }, fmtDT(m.sent_at), m.sent_by ? ` · ${m.sent_by}` : ''));
    }
    const ta = h('textarea', { placeholder: `Balas @${c.participant.username}…`, 'aria-label': 'Balasan', oninput: (e) => { drafts[c.id] = e.target.value; },
      onkeydown: (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } } });
    ta.value = drafts[c.id] || '';
    const sendBtn = h('button', { class: 'btn primary', onclick: () => send() }, 'Kirim');
    async function send() {
      const text = ta.value.trim(); if (!text) return;
      sendBtn.disabled = true;
      try { await api('POST', `/v1/conversations/${c.id}/messages`, { text }); drafts[c.id] = ''; toast('Pesan terkirim'); await Promise.all([drawThread(), drawList()]); live.refresh(); }
      catch (e) { sendBtn.disabled = false; toast(errMsg(e), true); }
    }
    threadEl.replaceChildren(
      h('div', { class: 'dm-head' },
        h('a', { class: 'btn sm ghost mobile-only', href: `#/messages${qs()}` }, '‹'),
        h('span', { class: 'peer' }, initials(c.participant.username)),
        h('div', {}, h('b', {}, `@${c.participant.username}`), h('div', { class: 'faint small' }, `ke @${c.account_username} · Instagram`)),
        waitBadge(c), h('span', { class: 'spacer' }),
        c.status === 'open'
          ? h('button', { class: 'btn sm', onclick: async () => { await api('PATCH', `/v1/conversations/${c.id}`, { status: 'done' }); toast('Ditandai selesai'); drawList(); drawThread(); live.refresh(); } }, 'Tandai selesai')
          : h('button', { class: 'btn sm', onclick: async () => { await api('PATCH', `/v1/conversations/${c.id}`, { status: 'open' }); drawList(); drawThread(); live.refresh(); } }, 'Buka lagi')),
      box,
      c.can_reply
        ? h('div', { class: 'dm-compose' }, ta, sendBtn)
        : h('div', { class: 'dm-closed' }, 'Lewat 24 jam sejak pesan terakhir pelanggan. Instagram tidak mengizinkan balasan dari aplikasi pihak ketiga — balas langsung dari aplikasi Instagram.'));
    box.scrollTop = box.scrollHeight;
    if (c.can_reply && document.activeElement?.tagName !== 'TEXTAREA') ta.focus({ preventScroll: true });
  }
  await Promise.all([drawList(), drawThread()]);
  pageCleanup = live.on((t) => { if (t.startsWith('message.')) { drawList(); if (document.activeElement?.tagName !== 'TEXTAREA') drawThread(); } });
  return shell('/messages', h('div', {},
    pagehead('Pesan', 'DM Instagram dari semua akun yang kamu pegang. Balasan hanya bisa dalam 24 jam sejak pesan terakhir pelanggan.',
      h('select', { style: { width: 'auto' }, 'aria-label': 'Filter akun', onchange: (e) => go(`/messages${qs({ a: e.target.value })}`) },
        h('option', { value: '' }, 'Semua akun Instagram'), igAccounts.map((a) => h('option', { value: a.id, selected: a.id === acc }, `@${a.username}`))),
      h('div', { class: 'seg' }, [['needs_reply', 'Perlu dibalas'], ['all', 'Semua'], ['done', 'Selesai']].map(([v, l]) => h('button', { class: filter === v ? 'on' : '', onclick: () => go(`/messages${qs({ f: v })}`) }, l))),
      h('button', { class: 'btn', onclick: async (e) => { e.currentTarget.disabled = true; const r = await api('POST', '/v1/messages/sync'); toast(r.new_messages ? `${r.new_messages} pesan baru` : 'Tidak ada pesan baru'); route(); } }, 'Muat terbaru')),
    wrap,
    h('p', { class: 'faint small', style: { marginTop: '10px' } }, 'Threads belum menyediakan API pesan, jadi hanya DM Instagram yang tampil di sini.')));
}

// ---------------- insights ----------------
const METRIC = {
  followers_count: 'Pengikut', views: 'Tayangan', reach: 'Jangkauan', accounts_engaged: 'Akun berinteraksi', total_interactions: 'Total interaksi',
  likes: 'Suka', comments: 'Komentar', saves: 'Disimpan', shares: 'Dibagikan', replies: 'Balasan', reposts: 'Repost', quotes: 'Kutipan', clicks: 'Klik link',
};
const fmtNum = (n) => (n == null ? '–' : Number(n).toLocaleString('id-ID'));

/** Single-series line chart (SVG) with recessive grid, 2px line, hover tooltip. */
function lineChart(points, label) {
  const W = 320, H = 120, P = { l: 4, r: 4, t: 10, b: 18 };
  const vals = points.map((p) => p.v).filter((v) => v != null);
  const wrap = h('div', { class: 'spark' });
  if (!vals.length) { wrap.append(h('div', { class: 'faint small spark-empty' }, 'Belum ada data')); return wrap; }
  const min = Math.min(...vals), max = Math.max(...vals);
  const lo = min === max ? min - 1 : min, hi = min === max ? max + 1 : max;
  const x = (i) => P.l + (points.length === 1 ? (W - P.l - P.r) / 2 : (i * (W - P.l - P.r)) / (points.length - 1));
  const y = (v) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
  const pts = points.map((p, i) => (p.v == null ? null : [x(i), y(p.v), p]));
  const path = pts.filter(Boolean).map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  const ns = 'http://www.w3.org/2000/svg';
  const el = (t, a) => { const n = document.createElementNS(ns, t); for (const [k, v] of Object.entries(a)) n.setAttribute(k, v); return n; };
  const svgEl = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Grafik ${label}`, preserveAspectRatio: 'none' });
  for (const g of [0, 0.5, 1]) svgEl.append(el('line', { x1: P.l, x2: W - P.r, y1: P.t + g * (H - P.t - P.b), y2: P.t + g * (H - P.t - P.b), class: 'grid' }));
  svgEl.append(el('path', { d: path, class: 'line' }));
  const dot = el('circle', { r: 4.5, class: 'dot', visibility: 'hidden' });
  const cross = el('line', { y1: P.t, y2: H - P.b, class: 'cross', visibility: 'hidden' });
  svgEl.append(cross, dot);
  if (pts.filter(Boolean).length === 1) { const [px, py] = pts.find(Boolean); svgEl.append(el('circle', { cx: px, cy: py, r: 4, class: 'dot solo' })); }
  const tip = h('div', { class: 'tip', hidden: true });
  const hit = el('rect', { x: 0, y: 0, width: W, height: H, fill: 'transparent' });
  hit.addEventListener('mousemove', (e) => {
    const r = svgEl.getBoundingClientRect();
    const mx = ((e.clientX - r.left) / r.width) * W;
    let best = null; for (const p of pts) if (p && (!best || Math.abs(p[0] - mx) < Math.abs(best[0] - mx))) best = p;
    if (!best) return;
    dot.setAttribute('cx', best[0]); dot.setAttribute('cy', best[1]); dot.setAttribute('visibility', 'visible');
    cross.setAttribute('x1', best[0]); cross.setAttribute('x2', best[0]); cross.setAttribute('visibility', 'visible');
    tip.hidden = false; tip.replaceChildren(h('b', {}, fmtNum(best[2].v)), ' ', new Date(`${best[2].d}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }));
    tip.style.left = `${(best[0] / W) * 100}%`;
  });
  hit.addEventListener('mouseleave', () => { dot.setAttribute('visibility', 'hidden'); cross.setAttribute('visibility', 'hidden'); tip.hidden = true; });
  svgEl.append(hit);
  const fmtD = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  wrap.append(svgEl, tip, h('div', { class: 'axis' }, h('span', {}, fmtD(points[0].d)), h('span', {}, fmtD(points.at(-1).d))));
  return wrap;
}

async function pageInsights() {
  await loadAccounts();
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const days = Number(q.get('r') || 30);
  const accId = q.get('a') || state.accounts[0]?.id;
  const setQ = (k, v) => { const n = new URLSearchParams(q); n.set(k, v); go(`/insights?${n}`); };
  if (!accId) return shell('/insights', h('div', {}, pagehead('Insights'), h('div', { class: 'panel empty' }, 'Belum ada akun terhubung.', h('br'), h('a', { class: 'btn', href: '#/accounts' }, 'Hubungkan akun'))));
  const from = new Date(Date.now() - (days - 1) * 864e5).toISOString().slice(0, 10);
  const data = await api('GET', `/v1/accounts/${accId}/insights?from=${from}`);
  const a = state.accounts.find((x) => x.id === accId);
  const allDays = [...Array(days)].map((_, i) => new Date(Date.now() - (days - 1 - i) * 864e5).toISOString().slice(0, 10));
  const byDay = Object.fromEntries(data.days.map((d) => [d.date, d]));
  const keys = [...new Set(data.days.flatMap((d) => Object.keys(d).filter((k) => k !== 'date' && METRIC[k])))];
  const order = Object.keys(METRIC).filter((k) => keys.includes(k));
  const tiles = order.map((k) => {
    const pts = allDays.map((d) => ({ d, v: byDay[d]?.[k] ?? null }));
    const latest = [...pts].reverse().find((p) => p.v != null)?.v;
    const first = pts.find((p) => p.v != null)?.v;
    const delta = latest != null && first != null && k === 'followers_count' ? latest - first : null;
    return h('div', { class: 'panel metric' },
      h('div', { class: 'muted small' }, METRIC[k]),
      h('div', { class: 'big' }, fmtNum(latest), delta ? h('span', { class: `delta ${delta > 0 ? 'up' : 'down'}` }, `${delta > 0 ? '+' : ''}${fmtNum(delta)}`) : null),
      lineChart(pts, METRIC[k]));
  });
  const table = h('details', { class: 'panel', style: { marginTop: '16px' } }, h('summary', {}, 'Lihat sebagai tabel'),
    h('div', { style: { overflowX: 'auto', marginTop: '10px' } }, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Tanggal'), order.map((k) => h('th', {}, METRIC[k])))),
      h('tbody', {}, data.days.slice().reverse().map((d) => h('tr', {}, h('td', {}, d.date), order.map((k) => h('td', {}, fmtNum(d[k])))))))));
  return shell('/insights', h('div', {},
    pagehead('Insights', 'Perkembangan akun dari hari ke hari. Diperbarui otomatis tiap 6 jam; Meta bisa telat hingga 48 jam.',
      h('select', { style: { width: 'auto' }, 'aria-label': 'Akun', onchange: (e) => setQ('a', e.target.value) }, state.accounts.map((x) => h('option', { value: x.id, selected: x.id === accId }, `@${x.username} (${PLAT[x.platform]})`))),
      h('div', { class: 'seg' }, [7, 30, 90].map((r) => h('button', { class: r === days ? 'on' : '', onclick: () => setQ('r', String(r)) }, `${r} hari`))),
      h('button', { class: 'btn', onclick: async (e) => { e.currentTarget.disabled = true; try { await api('POST', '/v1/insights/sync'); toast('Statistik diperbarui'); route(); } catch (err) { toast(errMsg(err), true); e.currentTarget.disabled = false; } } }, 'Perbarui')),
    a?.status === 'expired' ? h('div', { class: 'err-box', style: { marginBottom: '14px' } }, 'Akun perlu dihubungkan ulang; statistik berhenti diperbarui. ', h('a', { href: `/connect/${a.platform}` }, 'Hubungkan ulang')) : null,
    tiles.length ? h('div', { class: 'metrics' }, tiles) : h('div', { class: 'panel empty' }, 'Belum ada data untuk rentang ini. Klik Perbarui atau tunggu sinkron berikutnya.'),
    tiles.length ? table : null));
}

// ---------------- accounts ----------------
async function pageAccounts() {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  if (q.get('connected')) toast(`${q.get('connected')} tersambung`);
  if (q.get('error')) toast(q.get('error'), true);
  if (q.get('connected') || q.get('error')) history.replaceState(null, '', '#/accounts');
  await loadAccounts();
  return shell('/accounts', h('div', {},
    pagehead('Akun', 'Login lewat halaman resmi Meta. LRMsmm tidak pernah tahu password akunmu; token disimpan terenkripsi.',
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
      isOwner() && h('button', { class: 'btn sm ghost danger', onclick: async () => {
        if (!confirm(`Putuskan @${a.username}? Post terjadwal ke akun ini dibatalkan.`)) return;
        await api('DELETE', `/v1/accounts/${a.id}`); toast(`@${a.username} diputus`); route();
      } }, 'Putuskan'))) : h('div', { class: 'empty' }, 'Belum ada akun tersambung.')),
    h('p', { class: 'faint small', style: { marginTop: '14px' } }, 'Instagram harus akun Business atau Creator. Selama Meta App masih mode Development, akun harus terdaftar sebagai tester/role di app tersebut.')));
}

// ---------------- media library ----------------
async function pageMedia() {
  const [{ data }, use] = await Promise.all([api('GET', '/v1/media?limit=100'), api('GET', '/v1/media/usage')]);
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
    pagehead('Media', 'Pustaka foto dan video tim. AI bisa memakai media dari sini lewat list_media.', h('span', { class: 'muted small' }, `Penyimpanan: ${fmtBytes(use.used_bytes)} · ${use.files} file`)),
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
    pagehead('API & AI', 'Sambungkan Claude, ChatGPT, Claude Code, Cursor, atau n8n ke LRMsmm.'),
    h('div', { class: 'panel' }, h('h2', {}, 'Pasang di Claude atau ChatGPT'),
      h('p', { class: 'muted' }, 'Di Claude: Settings → Connectors → Add custom connector, tempel URL ini. Login LRMsmm lalu pilih akses baca atau baca-tulis.'),
      h('div', { class: 'secret', style: { background: 'var(--primary-t)' } }, h('code', {}, mcpUrl), h('button', { class: 'btn sm', onclick: () => copy(mcpUrl) }, 'Salin')),
      h('p', { class: 'muted small' }, 'Claude Code (pakai API key):'),
      h('div', { class: 'secret', style: { background: 'var(--bg-2)' } }, h('code', {}, `claude mcp add --transport http lrmsmm ${mcpUrl} --header "Authorization: Bearer lrm_live_..."`))),
    h('div', { class: 'panel' }, h('h2', {}, 'API key'),
      h('p', { class: 'muted' }, 'Untuk REST API (', h('code', {}, `${location.origin}/v1`), ') dan MCP dari Claude Code, Cursor, n8n. Key hanya ditampilkan sekali; LRMsmm cuma menyimpan hash-nya.'),
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

// ---------------- team & user management ----------------
function accountPicker(selected = []) {
  const sel = new Set(selected);
  const box = h('div', { class: 'acc-picker' }, state.accounts.map((a) => {
    const b = h('button', { type: 'button', class: `acc-chip ${sel.has(a.id) ? 'on' : ''}`, 'aria-pressed': sel.has(a.id),
      onclick: () => { sel.has(a.id) ? sel.delete(a.id) : sel.add(a.id); b.classList.toggle('on'); b.setAttribute('aria-pressed', sel.has(a.id)); } },
    avatar(a), `@${a.username}`, h('span', { class: `chip-plat ${a.platform}` }, icon(a.platform)));
    return b;
  }));
  return { el: state.accounts.length ? box : h('p', { class: 'faint' }, 'Belum ada akun sosial terhubung.'), value: () => [...sel] };
}

async function pageTeam() {
  await loadAccounts();
  const owner = isOwner();
  const users = owner ? (await api('GET', '/v1/users')).data : [];
  const me = (await api('GET', '/v1/me'));
  const accName = (id) => { const a = state.accounts.find((x) => x.id === id); return a ? `@${a.username} (${PLAT[a.platform]})` : null; };

  const pw = h('form', { onsubmit: async (e) => {
    e.preventDefault();
    try { await api('POST', '/auth/password', Object.fromEntries(new FormData(pw))); toast('Password diganti. Semua API key dan akses AI dicabut.'); pw.reset(); }
    catch (err) { toast(err.message, true); }
  } },
  h('label', { class: 'field' }, h('span', {}, 'Password sekarang'), h('input', { type: 'password', name: 'current', required: true, autocomplete: 'current-password' })),
  h('label', { class: 'field' }, h('span', {}, 'Password baru'), h('input', { type: 'password', name: 'next', required: true, minlength: 8, autocomplete: 'new-password' })),
  h('p', { class: 'faint small' }, 'Mengganti password juga mencabut semua API key dan akses aplikasi AI.'),
  h('button', { class: 'btn' }, 'Ganti password'));

  function editUser(u) {
    const picker = accountPicker(u.account_ids || []);
    const role = h('select', { onchange: () => { pickWrap.hidden = role.value === 'owner'; } },
      h('option', { value: 'rep', selected: u.role === 'rep' }, 'Representative — hanya akun yang dipilih'),
      h('option', { value: 'owner', selected: u.role === 'owner' }, 'Owner — semua akun, kelola tim'));
    const name = h('input', { value: u.name || '' });
    const pass = h('input', { type: 'text', placeholder: 'Kosongkan kalau tidak diganti', minlength: 8 });
    const pickWrap = h('div', { hidden: u.role === 'owner' }, h('label', { class: 'field' }, h('span', {}, 'Akun yang di-represent'), picker.el));
    const d = modal(`Ubah ${u.email}`, h('div', {},
      h('label', { class: 'field' }, h('span', {}, 'Nama'), name),
      h('label', { class: 'field' }, h('span', {}, 'Peran'), role), pickWrap,
      h('label', { class: 'field' }, h('span', {}, 'Reset password'), pass)),
    [h('button', { class: 'btn', onclick: () => d.close() }, 'Batal'), h('button', { class: 'btn primary', onclick: async () => {
      const body = { name: name.value, role: role.value };
      if (role.value === 'rep') body.account_ids = picker.value();
      if (pass.value) body.password = pass.value;
      try { await api('PATCH', `/v1/users/${u.id}`, body); d.close(); toast('Anggota diperbarui'); route(); } catch (e) { toast(errMsg(e), true); }
    } }, 'Simpan')]);
  }

  function addUser() {
    const picker = accountPicker([]);
    const f = { name: h('input', { autocomplete: 'off' }), email: h('input', { type: 'email', required: true, autocomplete: 'off' }), password: h('input', { type: 'text', minlength: 8, required: true, autocomplete: 'off' }) };
    const role = h('select', { onchange: () => { pickWrap.hidden = role.value === 'owner'; } }, h('option', { value: 'rep' }, 'Representative — hanya akun yang dipilih'), h('option', { value: 'owner' }, 'Owner — semua akun, kelola tim'));
    const pickWrap = h('div', {}, h('label', { class: 'field' }, h('span', {}, 'Akun yang di-represent (boleh lebih dari satu)'), picker.el));
    const d = modal('Tambah anggota', h('div', {},
      h('label', { class: 'field' }, h('span', {}, 'Nama'), f.name), h('label', { class: 'field' }, h('span', {}, 'Email'), f.email),
      h('label', { class: 'field' }, h('span', {}, 'Password awal (min. 8 karakter)'), f.password),
      h('label', { class: 'field' }, h('span', {}, 'Peran'), role), pickWrap),
    [h('button', { class: 'btn', onclick: () => d.close() }, 'Batal'), h('button', { class: 'btn primary', onclick: async () => {
      try {
        await api('POST', '/v1/users', { name: f.name.value, email: f.email.value, password: f.password.value, role: role.value, account_ids: role.value === 'rep' ? picker.value() : undefined });
        d.close(); toast('Anggota ditambahkan'); route();
      } catch (e) { toast(errMsg(e), true); }
    } }, 'Tambah')]);
  }

  return shell('/team', h('div', {},
    pagehead(owner ? 'Tim & Akses' : 'Akun Saya', owner ? 'Owner melihat dan mengelola semua akun. Representative hanya bisa posting, membalas komentar, dan membalas pesan di akun yang ditugaskan.' : null,
      owner ? h('button', { class: 'btn primary', onclick: addUser }, 'Tambah anggota') : null),
    owner ? h('div', { class: 'list', style: { marginBottom: '18px' } }, users.map((u) => h('div', { class: 'item' },
      h('span', { class: 'peer' }, initials(u.name || u.email)),
      h('div', { class: 'body' },
        h('div', {}, h('b', {}, u.name || u.email), ' ', h('span', { class: `status role-${u.role}` }, ROLE[u.role])),
        h('div', { class: 'meta' }, h('span', {}, u.email),
          u.role === 'owner' ? h('span', {}, 'Semua akun') : h('span', {}, u.account_ids.length ? u.account_ids.map(accName).filter(Boolean).join(', ') : 'Belum ada akun ditugaskan'))),
      h('button', { class: 'btn sm', onclick: () => editUser(u) }, 'Ubah'),
      u.id !== state.user.id ? h('button', { class: 'btn sm ghost danger', onclick: async () => { if (!confirm(`Hapus ${u.email}? Aksesnya langsung dicabut.`)) return; await api('DELETE', `/v1/users/${u.id}`); toast('Anggota dihapus'); route(); } }, 'Hapus') : h('span', { class: 'faint small' }, 'Kamu')))) : null,
    !owner ? h('div', { class: 'panel', style: { marginBottom: '16px' } }, h('h2', {}, 'Akun yang kamu pegang'),
      state.accounts.length ? h('div', { class: 'acc-picker' }, state.accounts.map((a) => h('span', { class: 'acc-chip on' }, avatar(a), `@${a.username}`, h('span', { class: `chip-plat ${a.platform}` }, icon(a.platform)))))
        : h('p', { class: 'muted' }, 'Belum ada akun yang ditugaskan. Minta Owner menambahkan akun untukmu.')) : null,
    h('div', { class: 'panel', style: { maxWidth: '460px' } }, h('h2', {}, 'Ganti password'), pw),
    h('p', { class: 'faint small', style: { marginTop: '12px' } }, `Masuk sebagai ${me.user.email} · ${ROLE[me.user.role]}`)));
}

// ---------------- admin (Owner) ----------------
const ACTION = {
  'post.publish': 'Menerbitkan post', 'post.schedule': 'Menjadwalkan post', 'post.update': 'Mengubah post', 'post.cancel': 'Membatalkan post', 'post.publish_now': 'Menerbitkan sekarang',
  'post.retry': 'Mencoba ulang post', 'post.remove': 'Menghapus dari riwayat', 'comment.reply': 'Membalas komentar', 'comment.hide': 'Menyembunyikan komentar', 'comment.unhide': 'Menampilkan komentar',
  'message.send': 'Membalas DM', 'account.connect': 'Menyambungkan akun', 'account.reconnect': 'Menyambungkan ulang akun', 'account.disconnect': 'Memutus akun',
  'user.create': 'Menambah anggota', 'user.update': 'Mengubah anggota', 'user.assign': 'Mengatur akun anggota', 'user.delete': 'Menghapus anggota',
  'api_key.create': 'Membuat API key', 'api_key.revoke': 'Mencabut API key', 'ai_app.revoke': 'Mencabut akses AI', 'media.delete': 'Menghapus media',
};
const VIA = { session: 'dashboard', api_key: 'API key', oauth: 'AI (MCP)', system: 'sistem' };
async function pageAdmin() {
  if (!isOwner()) { go('/'); return shell('', h('div')); }
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const tab = q.get('t') || 'audit';
  const ov = await api('GET', '/v1/admin/overview');
  let body;
  if (tab === 'failed') {
    const { data } = await api('GET', '/v1/admin/failed-posts');
    body = data.length ? h('div', { class: 'list' }, data.map((f) => h('a', { class: 'item', href: `#/posts/${f.post_id}` },
      h('div', { class: 'body' }, h('div', { class: 'title' }, f.content || '(tanpa teks)'),
        h('div', { class: 'meta' }, plat(f.platform), h('span', {}, `@${f.username}`), h('span', {}, fmtDT(f.updated_at))),
        h('div', { class: 'err-box', style: { marginTop: '6px' } }, h('b', {}, ERR[f.error_code] || f.error_code), f.error_message ? ` — ${f.error_message}` : '')),
      status('failed')))) : h('div', { class: 'list empty' }, 'Belum ada post yang gagal.');
  } else {
    const listEl = h('div', { class: 'list' });
    const more = h('button', { class: 'btn', hidden: true }, 'Muat lebih banyak');
    let cursor = null;
    const load = async () => {
      const r = await api('GET', `/v1/admin/audit?limit=50${cursor ? `&cursor=${cursor}` : ''}`);
      for (const a of r.data) {
        const d = a.details || {};
        const extra = [d.accounts?.join(', '), d.username ? `@${d.username}` : null, d.to, d.email, d.text ? `“${d.text}”` : null, d.name].filter(Boolean).join(' · ');
        listEl.append(h('div', { class: 'item' },
          h('div', { class: 'body' }, h('div', {}, h('b', {}, a.user_email || 'Sistem'), ' ', ACTION[a.action] || a.action),
            h('div', { class: 'meta' }, h('span', {}, fmtDT(a.at)), h('span', {}, `via ${VIA[a.via] || a.via}`), extra ? h('span', {}, extra) : null)),
          a.target_type === 'post' && a.target_id ? h('a', { class: 'btn sm ghost', href: `#/posts/${a.target_id}` }, 'Lihat') : null));
      }
      if (!listEl.children.length) listEl.append(h('div', { class: 'empty' }, 'Log masih kosong.'));
      cursor = r.next_cursor; more.hidden = !cursor;
    };
    more.onclick = load;
    await load();
    body = h('div', {}, listEl, h('div', { class: 'row', style: { marginTop: '12px' } }, more));
  }
  return shell('/admin', h('div', {},
    pagehead('Jejak Audit', 'Siapa melakukan apa, dari dashboard, API key, atau AI.'),
    h('div', { class: 'strip' },
      stat('#/team', 'team', ov.users, 'Anggota Tim', 'Owner & Representative', 'em'),
      stat('#/accounts', 'users', ov.accounts, 'Akun Sosial', ov.accounts_expired ? `${ov.accounts_expired} perlu disambung ulang` : 'Semua aktif', ov.accounts_expired ? 'ro' : 'sky', !!ov.accounts_expired),
      stat('#/admin?t=failed', 'send', ov.posts_24h, 'Terbit 24 Jam', `${ov.failed_24h} gagal terbit`, ov.failed_24h ? 'ro' : 'am', !!ov.failed_24h, 'Tinjau →'),
      stat('#/media', 'img', fmtBytes(ov.storage.used_bytes), 'Penyimpanan', `${ov.storage.files} file media`, 'pu', false, 'Buka →')),
    h('p', { class: 'small muted', style: { margin: '-10px 0 18px' } }, `Real-time: ${ov.realtime_hint}${ov.webhooks.last_at ? ` (terakhir ${ago(ov.webhooks.last_at)} lalu)` : ''}.`),
    h('div', { class: 'seg', style: { marginBottom: '14px' } }, h('button', { class: tab === 'audit' ? 'on' : '', onclick: () => go('/admin') }, 'Log audit'), h('button', { class: tab === 'failed' ? 'on' : '', onclick: () => go('/admin?t=failed') }, 'Post gagal')),
    body));
}

// ---------------- router ----------------
let pageCleanup = null;
async function route() {
  const path = (location.hash.slice(1) || '/').split('?')[0];
  if (pageCleanup) { pageCleanup(); pageCleanup = null; }
  try {
    if (!state.user) {
      const st = await api('GET', '/auth/state');
      state.mock = st.mock; state.user = st.user;
      if (!st.user) { $app.replaceChildren(authPage(st.needs_setup ? 'setup' : 'login')); return; }
      await loadAccounts();
      state.stats = await api('GET', '/v1/stats');
      state.lastOverdue = 0;
    }
    live.start();
    if (path === '/login') { go('/'); return; }
    let m, view;
    if (path === '/') view = await pageHome();
    else if (path === '/compose') view = await pageCompose();
    else if ((m = path.match(/^\/compose\/(.+)$/))) view = await pageCompose(m[1]);
    else if ((m = path.match(/^\/posts\/(.+)$/))) view = await pagePost(m[1]);
    else if (path === '/calendar') view = await pageCalendar();
    else if (path === '/inbox') view = await pageInbox();
    else if (path === '/messages') view = await pageMessages();
    else if ((m = path.match(/^\/messages\/(.+)$/))) view = await pageMessages(m[1]);
    else if (path === '/insights') view = await pageInsights();
    else if (path === '/admin') view = await pageAdmin();
    else if (path === '/accounts') view = await pageAccounts();
    else if (path === '/media') view = await pageMedia();
    else if (path === '/developer') view = await pageDeveloper();
    else if (path === '/team') view = await pageTeam();
    else view = shell('', h('div', { class: 'panel empty' }, h('h2', {}, 'Halaman tidak ditemukan'), h('a', { class: 'btn', href: '#/' }, 'Ke beranda')));
    $app.replaceChildren(view);
    if (!path.startsWith('/messages/')) window.scrollTo(0, 0);
    document.querySelectorAll('.dm-msgs').forEach((b) => { b.scrollTop = b.scrollHeight; });
  } catch (e) {
    if (e.code === 'unauthenticated') return;
    $app.replaceChildren(shell('', h('div', { class: 'panel' }, h('h2', {}, 'Halaman gagal dimuat'), h('p', {}, errMsg(e)), h('button', { class: 'btn', onclick: route }, 'Muat ulang'))));
  }
}
window.addEventListener('hashchange', route);
route();
