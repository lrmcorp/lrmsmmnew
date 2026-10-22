import { workspacePages } from './workspace-pages.js';
import { contentWorkspace } from './content-workspace.js';
import { generatorWorkspace } from './generator-workspace.js';
import { t } from './strings.en.js';
import { createUI, fmtDay, fmtSlot, fmtRange, fmtNumber, sessionTitle, groupSessions, readSessionGroups, sessionState } from './ui.js';
// LRMsmm dashboard — vanilla JS SPA (no build step). UI mengikuti hrd.playgo.id.
import { storyWorkspace } from './story-workspace.js';
import { generatorStudio } from './generator-studio.js';
import { workflowCanvas } from './workflow-canvas.js';
import { bindInteraction } from './interactions.js';
import { HERO, PLAT_SVG } from './icons.js';
const $app = document.getElementById('app');
document.documentElement.lang = 'id';
document.title = t('common.app.title');

// ---------------- helpers ----------------
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;else if (k === 'html') el.innerHTML = v;else if (k.startsWith('on')) bindInteraction(el, k.slice(2), v, error => toast(errMsg(error), true));else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);else if (v === true) el.setAttribute(k, '');else el.setAttribute(k, v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) el.append(k instanceof Node ? k : document.createTextNode(typeof k === 'number' ? fmtNumber(k) : String(k)));
  return el;
}
const replaceContent = (el, ...children) => el.replaceChildren(...children.flat(Infinity).filter(x => x != null && x !== false));
const svg = s => {
  const _targetValue = document.createElement('template');
  _targetValue.innerHTML = s.trim();
  return _targetValue.content.firstChild;
};
// UI icons: Heroicons v1 outline — the same set hrd.playgo.id uses
const ICO = {
  home: 'home',
  pen: 'pencil-alt',
  cal: 'calendar',
  chat: 'chat-alt-2',
  inbox: 'chat',
  chart: 'trending-up',
  users: 'user-group',
  img: 'photograph',
  key: 'code',
  shield: 'shield-check',
  team: 'users',
  menu: 'menu',
  bell: 'bell',
  logout: 'logout',
  person: 'user-circle',
  x: 'x',
  warn: 'exclamation',
  clock: 'clock',
  send: 'paper-airplane',
  upload: 'cloud-upload',
  lock: 'lock-closed',
  bolt: 'lightning-bolt',
  sparkles: 'sparkles',
  link: 'link',
  globe: 'globe-alt',
  plus: 'plus',
  right: 'chevron-right',
  refresh: 'refresh',
  cog: 'cog',
  doc: 'document-text',
  grid: 'view-grid',
  check: 'check',
  search: 'search',
  building: 'office-building',
  'chevron-down': 'chevron-down',
  'chevron-right': 'chevron-right',
  image: 'photograph',
  info: 'information-circle',
  move: 'switch-horizontal',
  copy: 'duplicate',
  more: 'dots-horizontal'
};
const icon = k => {
  if (PLAT_SVG[k]) return svg(PLAT_SVG[k]);
  const p = HERO[ICO[k] || k];
  return p ? svg(`<svg class="hi" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" aria-hidden="true">${p}</svg>`) : h('span');
};
const logo = (tag = 'a', attrs = {}) => h(tag, {
  class: 'logo',
  href: tag === 'a' ? '#/' : null,
  ...attrs
}, h('span', {
  class: 'word'
}, 'LRM', h('span', {}, 'smm')), h('span', {
  class: 'tag'
}, 'SMM'));
const pref = {
  get: (k, d) => {
    try {
      return localStorage.getItem(k) ?? d;
    } catch {
      return d;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {/* ignore */}
  }
};
const PLAT = {
  instagram: 'Instagram',
  threads: 'Threads'
};
const initials = s => (s || '?').replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase();
const plat = p => h('span', {
  class: `plat ${p}`
}, icon(p), PLAT[p] || p);
const avatar = (a, cls = '') => {
  const el = h('span', {
    class: `avatar ${a.platform} ${cls}`,
    title: a.name || `@${a.username}`
  }, initials(a.name || a.username));
  try {
    if (a.avatar_url && new URL(a.avatar_url).protocol === 'https:') el.replaceChildren(h('img', {
      src: a.avatar_url,
      alt: a.name || `@${a.username}`,
      loading: 'lazy',
      referrerpolicy: 'no-referrer',
      onerror: () => el.replaceChildren(document.createTextNode(initials(a.name || a.username)))
    }));
  } catch {/* Invalid or unavailable remote photo: keep initials. */}
  return el;
};
const STATUS = {
  published: t("ui.copy.0001"),
  scheduled: t("ui.copy.0002"),
  publishing: t("ui.copy.0003"),
  pending: t("ui.copy.0004"),
  failed: t("draft.status.failed"),
  partial: t("ui.copy.0005"),
  cancelled: t("ui.copy.0006"),
  expired: t("ui.copy.0007"),
  active: t("ui.copy.0008")
};
const status = s => h('span', {
  class: `status ${s}`
}, STATUS[s] || s);
const len = s => [...(s || '')].length;
const fmtDT = fmtSlot;
const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString('id-ID', {
  timeZone: 'Asia/Jakarta',
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit'
}) : '';
const fmtBytes = b => b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;
const ago = iso => {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return t("ui.copy.0009");
  if (s < 3600) return t("ui.sweep.1", {
    "0": Math.floor(s / 60)
  });
  if (s < 86400) return t("ui.copy.0010", {
    "0": Math.floor(s / 3600)
  });
  return t("ui.copy.0339", {
    "0": Math.floor(s / 86400)
  });
};
const ERR = {
  account_expired: t("ui.copy.0011"),
  permission_missing: t("ui.copy.0012"),
  rate_limited: t("ui.sweep.2"),
  media_fetch_failed: t("ui.copy.0013"),
  image_too_large: t("ui.copy.0014"),
  aspect_ratio_invalid: t("ui.copy.0015"),
  caption_too_long: t("ui.sweep.3"),
  publish_limit_reached: t("ui.copy.0016"),
  media_invalid_format: t("ui.copy.0017"),
  platform_error: t("ui.copy.0018"),
  thread_partial: t("ui.copy.0019")
};
async function api(method, path, body, opts = {}) {
  if(method!=='GET'&&/^\/v1\/(accounts|companies|users)(?:\/|$)/.test(path)){accountsCache=null;accountsPending=null;accountsRevision++;}
  const init = {
    method,
    headers: {
      ...(opts.headers || {})
    },
    credentials: 'same-origin'
  };
  if (body instanceof Blob || body instanceof ArrayBuffer) init.body = body;else if (body !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const r = await fetch(path, init);
  if (r.status === 204) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && !path.startsWith('/auth')) {
      state.user = null;
      go('/login');
    }
    const e = new Error(j.error?.message || `HTTP ${r.status}`);
    e.code = j.error?.code;
    e.details = j.error?.details;
    throw e;
  }
  return j;
}
function toast(msg, bad = false, action = null) {
  const el = h('div', {
    class: bad ? 'bad' : ''
  }, h('span', {
    class: 'toast-message'
  }, msg), action ? h('button', {
    class: 'toast-act',
    onclick: () => {
      el.remove();
      action.fn();
    }
  }, action.label) : null, h('button', {
    type: 'button',
    class: 'toast-dismiss',
    'aria-label': t("ui.extra.1"),
    onclick: () => el.remove()
  }, icon('x')));
  if (action) el.dataset.persistent = 'true';
  document.getElementById('toast').append(el);
  setTimeout(() => el.remove(), action ? 6000 : bad ? 10000 : 4500);
}
const errMsg = e => e.ui ? e.message : e.code && ERR[e.code] ? ERR[e.code] : e.code === 'invalid_credentials' ? t('login.error.generic') : e.code === 'provider_key_missing' ? t('gen.ready.key.missing', {
  provider: 'AI'
}) : e.code === 'rate_limited' ? t('error.429', {
  provider: 'API'
}) : t('common.error');
function technicalError(message, code) {
  return h('div', {
    class: 'err-box'
  }, h('p', {}, code && ERR[code] ? ERR[code] : t('common.error')), h('details', {}, h('summary', {}, t('error.technical')), h('pre', {}, String(message || ''))));
}
const uiError = message => Object.assign(new Error(message), {
  ui: true
});
const go = p => {
  location.hash = `#${p}`;
};
function modal(title, body, actions = []) {
  const headingId = 'dialog-' + crypto.randomUUID();
  const d = h('dialog', {
    'aria-labelledby': headingId
  }, h('div', {
    class: 'dh'
  }, h('h2', {
    id: headingId
  }, title), h('span', {
    class: 'spacer'
  }), h('button', {
    class: 'btn ghost sm',
    onclick: () => d.close(),
    'aria-label': t("common.close")
  }, icon('x'))), h('div', {
    class: 'db'
  }, body), actions.length ? h('div', {
    class: 'df'
  }, actions) : null);
  const trigger = document.activeElement;
  const nativeClose = d.close.bind(d);
  d.close = (...args) => {
    nativeClose(...args);
    // Remove immediately: the native close event is queued and may run after navigation.
    d.remove();
    if (trigger?.isConnected && !document.querySelector('dialog[open]')) trigger.focus({preventScroll: true});
  };
  d.addEventListener('close', () => {
    d.remove();
  });
  d.addEventListener('click', e => {
    const r = d.getBoundingClientRect();
    if (e.target === d && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) d.close();
  });
  document.body.append(d);
  d.showModal();
  return d;
}

// ---------------- state & shell ----------------
const state = {
  user: null,
  mock: false,
  accounts: [],
  companies: [],
  stats: {},
  lastOverdue: 0
};
const isOwner = () => state.user?.role === 'owner';
const ui = createUI({
  h,
  icon,
  modal,
  state,
  loadAccounts,
  isOwner
});
const {
  confirmDialog,
  inputDialog
} = ui;
async function costDetails(agents) {
  const current = agents || state.costAgents?.() || (await api('GET', '/v1/generator/settings')).agents;
  return Object.entries(current).map(([role, a]) => [t('agent.' + role), a.provider + ' / ' + a.model]);
}
async function askCost(title, agents) {
  return confirmDialog({
    title,
    body: agents?.connection ? 'Satu panggilan teks uji akan memakai API key pribadi. Tidak membuat gambar atau memublikasikan post.' : 'Konsep dibuat lebih dulu. Gambar dibuat setelah persetujuan konsep, dan publikasi setelah persetujuan akhir. Menggunakan API key pribadi sesuai tarif provider.',
    tone: 'cost',
    details: await costDetails(agents),
    confirmLabel: t('dialog.confirm')
  });
}
const ROLE = {
  owner: 'Owner',
  rep: 'Representative'
};
let accountsCache=null,accountsPending=null,accountsRevision=0;
async function loadAccounts(force=false) {
  const userId=state.user?.id;
  if(!force&&accountsCache?.userId===userId&&Date.now()-accountsCache.at<5000)return state.accounts;
  if(accountsPending?.userId===userId)return accountsPending.promise;
  const pending={userId,revision:accountsRevision};
  pending.promise=Promise.all([api('GET','/v1/accounts'),api('GET','/v1/companies')]).then(([accounts,companies])=>{
    if(state.user?.id===userId&&pending.revision===accountsRevision){state.accounts=accounts.data;state.companies=companies.data;accountsCache={userId,at:Date.now()};}
    return accounts.data;
  }).finally(()=>{if(accountsPending===pending)accountsPending=null;});
  accountsPending=pending;
  return pending.promise;
}

function companyGroups() {
  return [...state.companies.map(c => ({
    ...c,
    accounts: state.accounts.filter(a => a.company_id === c.id)
  })), {
    id: '',
    name: t("scope.company.unassigned"),
    accounts: state.accounts.filter(a => !a.company_id)
  }];
}
function accountOptions(selected, platform) {
  return companyGroups().map(company => {
    const accounts = company.accounts.filter(a => !platform || a.platform === platform);
    return accounts.length ? h('optgroup', {
      label: company.name
    }, accounts.map(a => h('option', {
      value: a.id,
      selected: a.id === selected
    }, `${a.name || '@' + a.username} · @${a.username} (${PLAT[a.platform]})`))) : null;
  });
}
function badgeFor(key) {
  const s = state.stats;
  if (key === 'messages') return s.messages_overdue ? {
    n: s.messages_overdue,
    tone: 'bad',
    title: t("ui.copy.0020", {
      "0": s.messages_overdue
    })
  } : s.messages_waiting ? {
    n: s.messages_waiting,
    tone: 'soft',
    title: t("ui.copy.0021", {
      "0": s.messages_waiting
    })
  } : null;
  if (key === 'drafts') return state.draftCount ? {
    n: state.draftCount,
    tone: 'soft',
    title: t('draft.tab.action')
  } : null;
  if (key === 'comments') return s.unreplied ? {
    n: s.unreplied,
    tone: 'soft',
    title: t("ui.copy.0022", {
      "0": s.unreplied
    })
  } : null;
  return null;
}
function badgeEl(key) {
  const b = badgeFor(key);
  return h('span', {
    class: `count ${b?.tone || ''}`,
    'data-badge': key,
    title: b?.title || '',
    hidden: !b
  }, b?.n ?? '');
}

// Navigation grouped like the HRD sidebar
function navGroups() {
  return [[t('nav.group.content'), [['/', 'home', t('nav.home')], ['/generator', 'bolt', t('nav.generator')], ['/generator/drafts', 'pen', t('nav.drafts'), 'drafts'], ['/compose', 'pen', t('nav.compose')], ['/calendar', 'cal', t('nav.calendar')]]], [t('nav.group.engagement'), [['/messages', 'chat', t('nav.messages'), 'messages'], ['/inbox', 'inbox', t('nav.comments'), 'comments'], ['/insights', 'chart', t('nav.insights')]]], ...(isOwner() ? [[t('nav.group.workspace'), [['/accounts', 'users', t('nav.accounts')], ['/media', 'img', t('nav.media')], ['/team', 'team', t('nav.team')], ['/developer', 'key', t('nav.developer')], ['/admin', 'shield', t('nav.audit')]]]] : [])];
}
const PAGE_LABEL = () => Object.fromEntries(navGroups().flatMap(([g, items]) => items.map(([p,, l]) => [p, {
  label: l,
  group: g
}])));
async function openMenuSearch() {
  if (document.querySelector('.menu-command')) return;
  const items = [...navGroups().flatMap(([group, entries]) => entries.map(([path, ic, label]) => ({
    group,
    path,
    ic,
    label
  }))), {
    group: t("ui.copy.0023"),
    path: '/settings',
    ic: 'key',
    label: t("settings.title")
  }];
  const plans = await api('GET', '/v1/generator/plans').then(r => r.data).catch(() => []);
  items.push(...state.accounts.map(a => ({
    group: t('nav.accounts'),
    path: '/accounts/' + a.id + '?tab=brand',
    ic: a.platform,
    label: '@' + a.username + ' ' + (a.name || '')
  })), ...plans.map(p => ({
    group: t('nav.drafts'),
    path: '/generator/drafts?plan=' + p.id,
    ic: 'doc',
    label: sessionTitle(p)
  })));
  const results = h('div', {
    class: 'command-results'
  });
  const input = h('input', {
    type: 'search',
    placeholder: t("nav.search"),
    'aria-label': t("nav.search"),
    autocomplete: 'off',
    oninput: draw
  });
  let filtered = items;
  let dialog;
  function draw() {
    const query = input.value.toLocaleLowerCase().trim();
    filtered = items.filter(x => (x.label + ' ' + x.group).toLocaleLowerCase().includes(query));
    results.replaceChildren(...(filtered.length ? filtered.map(item => h('button', {
      type: 'button',
      class: 'command-item',
      onclick: () => {
        dialog.close();
        go(item.path);
      }
    }, icon(item.ic), h('span', {}, h('b', {}, item.label), h('small', {}, item.group)), h('span', {
      class: 'command-enter'
    }, icon("arrow-narrow-right")))) : [h('p', {
      class: 'empty'
    }, t("common.search.empty"))]));
  }
  dialog = modal(t("nav.search"), h('div', {}, h('div', {
    class: 'command-search'
  }, icon('grid'), input), results, h('p', {
    class: 'command-help'
  }, t("ui.copy.0024"))));
  dialog.classList.add('menu-command');
  draw();
  input.focus();
  dialog.addEventListener('keydown', event => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    const buttons = [...results.querySelectorAll('button')];
    if (!buttons.length) return;
    event.preventDefault();
    let index = buttons.indexOf(document.activeElement);
    index = event.key === 'ArrowDown' ? (index + 1) % buttons.length : (index - 1 + buttons.length) % buttons.length;
    buttons[index].focus();
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && filtered.length) {
      event.preventDefault();
      dialog.close();
      go(filtered[0].path);
    }
  });
}
function setNavigation(open) {
  const mobile = matchMedia('(max-width:1023px)').matches;
  document.body.classList.toggle('side-open', mobile && open);
  const aside = document.querySelector('#main-navigation'),
    col = document.querySelector('.col');
  if (aside) aside.inert = mobile && !open;
  if (col) col.inert = mobile && open;
  document.querySelector('.menu-btn')?.setAttribute('aria-expanded', String(mobile && open));
}
window.addEventListener('resize', () => setNavigation(false));
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && state.user) {
    const existing = document.querySelector('.menu-command');
    if (existing) {
      event.preventDefault();
      existing.close();
    } else if (!document.querySelector('dialog[open]')) {
      event.preventDefault();
      openMenuSearch();
    }
  }
  if (document.body.classList.contains('side-open')) {
    if (event.key === 'Escape') {
      setNavigation(false);
      document.querySelector('.menu-btn')?.focus();
    }
    if (event.key === 'Tab') {
      const controls = [...document.querySelectorAll('.side a,.side button')].filter(el => !el.disabled && el.getClientRects().length);
      if (controls.length) {
        const first = controls[0],
          last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
  }
});
let clockTimer;
function shell(active, content, ownCleanup = null) {
  const info = PAGE_LABEL()[active] || (active === '/settings' ? {
    label: t("settings.title"),
    group: t("ui.copy.0023")
  } : {
    label: 'LRMsmm',
    group: ''
  });
  content.classList.add('wrap');
  const clock = h('div', {
    class: 'clock',
    title: t("ui.copy.0025")
  });
  const tick = () => {
    clock.textContent = `${new Date().toLocaleTimeString('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit'
    })} WIB · Jakarta`;
  };
  tick();

  const close = () => setNavigation(false);
  const root = h('div', {
    class: 'app'
  }, h('aside', {
    class: 'side',
    id: 'main-navigation',
    inert: matchMedia('(max-width:1023px)').matches ? true : null
  }, h('div', {}, h('div', {
    class: 'side-top'
  }, logo(), h('button', {
    class: 'side-close',
    'aria-label': t("ui.extra.2"),
    onclick: close
  }, icon('x'))), h('button', {
    type: 'button',
    class: 'menu-search-btn',
    'aria-label': t("nav.search"),
    onclick: openMenuSearch
  }, icon('grid'), h('span', {}, t("nav.search")), h('kbd', {}, navigator.platform.includes('Mac') ? t("ui.copy.0028") : 'Ctrl K')), h('nav', {
    class: 'nav',
    'aria-label': t("ui.extra.3")
  }, navGroups().map(([g, items]) => h('div', {
    class: 'nav-group'
  }, h('div', {
    class: 'nav-h'
  }, g), h('div', {
    class: 'nav-items'
  }, items.map(([p, ic, label, badge]) => h('a', {
    href: `#${p}`,
    class: `${active === p ? 'on' : ''} ${p === '/generator/drafts' ? 'nav-sub' : ''}`,
    'aria-current': active === p ? 'page' : null,
    onclick: e => {
      close();
      if (location.hash.split('?')[0] === '#' + p) {
        e.preventDefault();
        route();
      }
    }
  }, icon(ic), h('span', {
    class: 'lbl'
  }, label), badge ? badgeEl(badge) : null))))))), h('div', {
    class: 'side-foot'
  }, h('button', {
    class: 'ucard',
    type: 'button',
    'aria-label': t('nav.settings'),
    onclick: () => {
      modal(t('nav.settings'), h('div', {
        class: 'user-menu'
      }, h('a', {
        class: 'btn',
        href: '#/settings',
        onclick: e => e.currentTarget.closest('dialog').close()
      }, icon('person'), t("nav.settings")), h('button', {
        class: 'btn danger',
        onclick: async e => {
          e.currentTarget.closest('dialog').close();
          await api('POST', '/auth/logout');
          state.user = null;state.accounts=[];state.companies=[];state.brandProfiles={};state.aiSettings=null;state.scope=null;accountsCache=null;
          live.stop();
          go('/login');
        }
      }, icon('logout'), t('nav.signout'))));
    }
  }, h('div', {
    class: 'who'
  }, h('div', {
    class: 'ini'
  }, initials(state.user?.name || state.user?.email)), h('div', {
    style: {
      minWidth: 0
    }
  }, h('div', {
    class: 'nm'
  }, state.user?.name || state.user?.email), h('div', {
    class: 'rl'
  }, ROLE[state.user?.role] || ''))), icon('right')))), h('div', {
    class: 'scrim',
    onclick: close
  }), h('div', {
    class: 'col'
  }, h('header', {
    class: 'hdr'
  }, h('div', {
    class: 'hdr-in'
  }, h('div', {
    class: 'hdr-l'
  }, h('button', {
    class: 'menu-btn',
    'aria-label': t("ui.copy.0026"),
    'aria-controls': 'main-navigation',
    'aria-expanded': 'false',
    onclick: () => {
      setNavigation(true);
      document.querySelector('.side-close')?.focus();
    }
  }, icon('menu')), h('div', {
    class: 'crumb'
  }, info.group ? h('span', {}, info.group) : null, info.group ? h('span', {
    class: 'sep'
  }, '/') : null, h('b', {}, info.label))), h('div', {
    class: 'hdr-r'
  }, h('a', {
    class: 'chip',
    href: '#/compose'
  }, icon('pen'), h('span', {
    class: 'chip-t'
  }, t("compose.title"))), h('a', {
    class: 'chip',
    href: '#/messages',
    title: t("ui.copy.0029")
  }, icon('bell'), h('span', {
    class: 'chip-t'
  }, t("msg.title")), badgeEl('messages')), clock, h('span', {
    class: 'hdr-user-avatar',
    title: (state.user?.name || '') + ' · ' + (ROLE[state.user?.role] || '')
  }, initials(state.user?.name || state.user?.email))))), h('main', {
    class: 'main'
  }, state.mock ? h('div', {
    class: 'wrap',
    style: {
      marginBottom: '1.5rem'
    }
  }, h('div', {
    class: 'mock-banner'
  }, icon('warn'), t("ui.copy.0030"))) : null, content)));
  root._startClock = ()=>{tick();clearInterval(clockTimer);clockTimer=setInterval(tick,30000);};
  if (ownCleanup) cleanupFor.set(root, ownCleanup);
  return root;
}

// HRD-style page header: eyebrow pill + extrabold title + description, actions on the right
function pagehead(title, sub, ...actions) {
  return h('div', {
    class: 'pagehead'
  }, h('div', {}, h('h1', {}, title), sub ? h('p', {}, sub) : null), h('div', {
    class: 'row'
  }, actions));
}
// HRD stat card: label, big number, icon tile, footer with link
const stat = (href, ic, value, label, foot, tone = 'em', alert = false, linkText = t("ui.sweep.4")) => h('a', {
  class: `stat tone-${tone} ${alert ? 'alert' : ''}`,
  href
}, h('div', {
  class: 'top'
}, h('div', {}, h('div', {
  class: 'lbl'
}, label), h('div', {
  class: 'val'
}, value)), h('div', {
  class: 'ico'
}, icon(ic))), h('div', {
  class: 'foot'
}, h('span', {}, foot), h('b', {}, linkText)));
const secHead = (ic, title, sub, link) => h('div', {
  class: 'sec-h'
}, h('h2', {}, h('span', {
  class: 'ico'
}, icon(ic)), h('span', {}, title, sub ? h('div', {
  class: 'faint small',
  style: {
    fontWeight: 500
  }
}, sub) : null)), link ? h('a', {
  href: link[0]
}, link[1]) : null);

// ---------------- live updates: badges, overdue popup, SSE ----------------
const live = {
  es: null,
  timer: null,
  listeners: new Set(),
  start() {
    if (this.es) return;
    try {
      this.es = new EventSource('/v1/events');
      for (const _targetValue2 of ['message.new', 'message.sent', 'message.status', 'comment.new', 'post.updated']) {
        this.es.addEventListener(_targetValue2, e => {
          const d = JSON.parse(e.data || '{}');
          this.refresh();
          for (const fn of this.listeners) fn(_targetValue2, d);
        });
      }
      this.es.onerror = () => {/* browser reconnects automatically */};
    } catch {/* SSE unsupported: polling only */}
    this.timer = setInterval(() => this.refresh(), 30000);
    this.refresh();
  },
  stop() {
    this.es?.close();
    this.es = null;
    clearInterval(this.timer);
  },
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },
  async refresh() {
    try {
      state.stats = await api('GET', '/v1/stats');
      const [plans, runs] = await Promise.all([api('GET', '/v1/generator/plans'), api('GET', '/v1/generator/runs')]);
      state.draftCount = groupSessions(plans.data, runs.data,readSessionGroups(state.user.id)).filter(s => ['action', 'plan'].includes(sessionState(s))).length;
    } catch {
      return;
    }
    for (const el of document.querySelectorAll('[data-badge]')) {
      const b = badgeFor(el.dataset.badge);
      el.hidden = !b;
      el.textContent = b?.n ?? '';
      el.className = `count ${b?.tone || ''}`;
      el.title = b?.title || '';
    }
    const o = state.stats.messages_overdue || 0;
    document.title = o ? `(${o}) LRMsmm` : 'LRMsmm';
    if (o > state.lastOverdue) overduePopup(o);
    state.lastOverdue = o;
  }
};
function overduePopup(n) {
  document.querySelector('.overdue-pop')?.remove();
  const el = h('a', {
    class: 'overdue-pop',
    href: '#/messages',
    role: 'alert',
    onclick: () => el.remove()
  }, h('b', {}, n), h('span', {}, n === 1 ? t("ui.copy.0031") : t("ui.copy.0031")), h('button', {
    class: 'x',
    'aria-label': t("common.close"),
    onclick: e => {
      e.preventDefault();
      e.stopPropagation();
      el.remove();
    }
  }, icon('x')));
  document.body.append(el);
}

// ---------------- auth (HRD login layout) ----------------
function authPage(mode) {
  const next = new URLSearchParams(location.hash.split('?')[1] || '').get('next'),
    setup = mode === 'setup';
  const error = h('p', {
      class: 'auth-error',
      role: 'alert',
      hidden: true
    }),
    email = h('input', {
      name: 'email',
      type: 'email',
      required: true,
      autocomplete: 'email',
      'aria-label': t('login.email'),
      oninput: clearError
    }),
    password = h('input', {
      name: 'password',
      type: 'password',
      required: true,
      minlength: setup ? 8 : null,
      autocomplete: setup ? 'new-password' : 'current-password',
      'aria-label': t('login.password'),
      placeholder: t('login.password.placeholder'),
      oninput: clearError
    });
  function clearError() {
    error.hidden = true;
    error.textContent = '';
    email.removeAttribute('aria-invalid');
    password.removeAttribute('aria-invalid');
  }
  const submit = h('button', {
    class: 'btn primary',
    type: 'submit'
  }, setup ? t('login.setup.title') : t('login.cta'));
  const form = h('form', {
    class: 'auth-card',
    onsubmit: async e => {
      e.preventDefault();
      clearError();
      submit.textContent = t('login.pending');
      try {
        const response = await api('POST', setup ? '/auth/register' : '/auth/login', Object.fromEntries(new FormData(form)));
        state.user = response.user;
        document.getElementById('toast').replaceChildren();
        if (next && next.startsWith('/') && !next.startsWith('//')) location.href = next;else go('/');
      } catch (e) {
        error.hidden = false;
        error.textContent = e.code === 'invalid_credentials' || e.code === 'unauthenticated' ? t('login.error.generic') : errMsg(e);
        password.setAttribute('aria-invalid', 'true');
        password.focus();
      } finally {
        submit.textContent = setup ? t('login.setup.title') : t('login.cta');
      }
    }
  }, logo('div'), h('h1', {}, setup ? t('login.setup.title') : t('login.title')), h('p', {}, setup ? t('login.setup.sub') : t('login.sub')), setup ? h('label', {
    class: 'field'
  }, t('login.name'), h('input', {
    name: 'name',
    required: true,
    autocomplete: 'name',
    'aria-label': t('login.name')
  })) : null, h('label', {
    class: 'field'
  }, t('login.email'), email), h('label', {
    class: 'field'
  }, t('login.password'), h('div', {
    class: 'password-control'
  }, password, h('button', {
    class: 'btn ghost',
    type: 'button',
    'aria-pressed': 'false',
    onclick: e => {
      const show = password.type === 'password';
      password.type = show ? 'text' : 'password';
      e.currentTarget.textContent = t(show ? 'login.hide' : 'login.show');
      e.currentTarget.setAttribute('aria-pressed', String(show));
    }
  }, t('login.show')))), error, submit, h('p', {
    class: 'auth-note'
  }, icon('shield'), t('login.secure')));
  const feature = (ic, key) => h('div', {
    class: 'feat'
  }, icon(ic), h('div', {}, h('b', {}, t(key + '.heading')), h('p', {}, t(key + '.body'))));
  return h('div', {
    class: 'auth'
  }, h('div', {
    class: 'auth-bar'
  }, logo('div')), h('div', {
    class: 'auth-main'
  }, form, h('aside', {
    class: 'auth-side'
  }, h('h2', {}, t('login.panel.title')), feature('bolt', 'login.panel.1'), feature('cal', 'login.panel.2'), feature('chat', 'login.panel.3'))));
}

// ---------------- home (HRD Beranda layout) ----------------
async function pageHome() {
  await loadAccounts();
  const [stats, sched, recent] = await Promise.all([api('GET', '/v1/stats'), api('GET', '/v1/posts?status=scheduled&limit=100'), api('GET', '/v1/posts?limit=30')]);
  state.stats = stats;
  const upcoming = sched.data.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)).slice(0, 6);
  const attention = recent.data.filter(p => ['failed', 'partial'].includes(p.status)).slice(0, 5);
  const published = recent.data.filter(p => p.status === 'published').slice(0, 5);
  const expired = state.accounts.filter(a => a.status === 'expired');
  const ig = state.accounts.filter(a => a.platform === 'instagram').length;
  const tasks = (stats.messages_overdue ? 1 : 0) + (attention.length ? 1 : 0) + (expired.length ? 1 : 0);
  const first = state.user.name ? state.user.name.split(' ')[0] : '';
  return shell('/', h('div', {}, pagehead(t('home.greeting', {
    'first name': first || state.user.name || ''
  }), t("ui.copy.0032"), h('a', {
    class: 'btn soft',
    href: '#/messages'
  }, icon('chat'), t("ui.copy.0033")), h('a', {
    class: 'btn primary',
    href: '#/compose'
  }, icon('plus'), t("compose.title")), h('a', {
    class: 'btn',
    href: '#/calendar'
  }, icon('cal'), t("view.calendar"))), tasks ? h('div', {
    class: `banner ${stats.messages_overdue || expired.length ? 'red' : ''}`
  }, h('div', {
    class: 'l'
  }, h('span', {
    class: 'num'
  }, tasks), h('div', {}, h('h3', {}, t("draft.tab.action")), h('p', {}, [stats.messages_overdue ? t("ui.copy.0020", {
    "0": stats.messages_overdue
  }) : null, attention.length ? t("ui.copy.0034", {
    "0": attention.length
  }) : null, expired.length ? t("ui.copy.0035", {
    "0": expired.length
  }) : null].filter(Boolean).join(' · ')))), h('div', {
    class: 'row'
  }, stats.messages_overdue ? h('a', {
    class: 'btn primary sm',
    href: '#/messages'
  }, t("ui.copy.0036"), icon('right')) : null, attention.length ? h('a', {
    class: 'btn sm',
    href: `#/posts/${attention[0].id}`
  }, t("ui.copy.0037")) : null, expired.length ? isOwner() ? h('a', {
    class: 'btn sm',
    href: '#/accounts'
  }, t("ui.copy.0038")) : h('span', {}, t("ui.copy.0039")) : null)) : null, h('div', {
    class: 'strip'
  }, stat(isOwner() ? '#/accounts' : '#/compose', 'users', stats.accounts, t("ui.copy.0040"), `${ig} Instagram · ${state.accounts.length - ig} Threads`, 'em'), stat('#/calendar', 'cal', stats.scheduled, t("ui.copy.0041"), upcoming[0] ? t("ui.sweep.5", {
    "0": fmtDT(upcoming[0].scheduled_at)
  }) : t("ui.copy.0042"), 'sky', false, t("view.calendar")), stat('#/messages', 'chat', stats.messages_waiting, t("ui.copy.0043"), stats.messages_overdue ? t("ui.copy.0044", {
    "0": stats.messages_overdue
  }) : t("ui.copy.0045"), stats.messages_overdue ? 'ro' : 'am', !!stats.messages_overdue, t("comments.reply")), stat('#/inbox', 'inbox', stats.unreplied, t("ui.copy.0046"), stats.failed_7d ? t("ui.copy.0047", {
    "0": stats.failed_7d
  }) : t("ui.copy.0048"), 'pu', false, t("ui.copy.0049"))), h('div', {
    class: 'panel'
  }, h('div', {
    class: 'sec-h',
    style: {
      paddingBottom: '1rem',
      borderBottom: '1px solid var(--slate-100)',
      marginBottom: '1rem'
    }
  }, h('div', {}, h('h2', {}, t("ui.extra.4")), h('div', {
    class: 'faint small',
    style: {
      fontWeight: 500
    }
  }, t("ui.copy.0050"))), h('span', {
    class: 'mode'
  }, `${ROLE[state.user.role]} Mode`)), h('div', {
    class: 'quick'
  }, [['#/compose', 'pen', t("compose.title"), 'IG & Threads', 'em'], ['#/calendar', 'cal', t("view.calendar"), t("ui.copy.0051"), 'sky'], ['#/messages', 'chat', t("msg.title"), 'DM Instagram', 'ro'], ['#/inbox', 'inbox', t("comments.title"), t("ui.copy.0052"), 'am'], ['#/insights', 'chart', t("insights.title"), t("ui.copy.0053"), 'pu'], ['#/media', 'img', 'Media', t("ui.copy.0054"), 'em']].filter(([href]) => isOwner() || href !== '#/media').map(([href, ic, _targetValue3, d, tone]) => h('a', {
    class: `q-${tone}`,
    href
  }, h('div', {
    class: 'ico'
  }, icon(ic)), h('b', {}, _targetValue3), h('small', {}, d))))), stats.accounts === 0 && isOwner() ? h('div', {
    class: 'panel empty'
  }, h('h2', {}, t("home.onboarding.title")), h('p', {}, t("home.onboarding.body")), h('a', {
    class: 'btn primary',
    href: '#/accounts'
  }, t("accounts.connect"))) : null, attention.length ? h('div', {}, secHead('warn', t("ui.copy.0055"), t("ui.copy.0056"), ['#/admin?t=failed', isOwner() ? t("ui.copy.0057") : '']), postList(attention)) : null, h('div', {
    class: 'grid2'
  }, h('div', {}, secHead('cal', t("ui.copy.0058"), t("ui.copy.0059"), ['#/calendar', t("draft.approve.done.open")]), upcoming.length ? postList(upcoming) : h('div', {
    class: 'list empty'
  }, t("ui.copy.0060"), h('br'), h('a', {
    class: 'btn primary sm',
    href: '#/compose'
  }, t("ui.extra.5")))), h('div', {}, secHead('send', t("ui.copy.0061"), t("ui.copy.0062"), ['#/calendar?v=list', t("ui.copy.0057")]), published.length ? postList(published) : h('div', {
    class: 'list empty'
  }, t("ui.copy.0063"))))));
}
function postList(posts, linkAttrs = p => ({
  href: `#/posts/${p.id}`
})) {
  return h('div', {
    class: 'list'
  }, posts.map(p => {
    const m = p.media[0];
    return h('a', {
      class: 'item',
      ...linkAttrs(p)
    }, m?.url ? m.type === 'video' ? h('video', {
      class: 'thumb',
      src: m.url,
      muted: true,
      preload: 'metadata'
    }) : h('img', {
      class: 'thumb',
      src: m.url,
      alt: ''
    }) : h('div', {
      class: 'thumb'
    }), h('div', {
      class: 'body'
    }, h('div', {
      class: 'title'
    }, p.content || h('span', {
      class: 'faint'
    }, t("ui.extra.6"))), h('div', {
      class: 'meta'
    }, h('span', {}, p.scheduled_at ? fmtDT(p.scheduled_at) : fmtDT(p.created_at)), h('span', {}, p.targets.map(_targetValue4 => `@${_targetValue4.username}`).join(', ')), p.source !== 'dashboard' ? h('span', {}, p.source === 'mcp' ? 'via AI' : 'via API') : null)), status(p.status));
  }));
}

// ---------------- composer ----------------
async function pageCompose(editId) {
  await loadAccounts();
  const query = new URLSearchParams(location.hash.split('?')[1] || '');
  const atParam = query.get('at');
  const aiId = query.get('ai_draft');
  const aiDraft = aiId && !editId ? await api('GET', '/v1/ai/drafts/' + encodeURIComponent(aiId)) : null;
  if (aiDraft?.post_id) {
    go('/posts/' + aiDraft.post_id);
    return shell('/compose', h('div'));
  }
  const [connection, inbox] = await Promise.all([api('GET', '/v1/ai/connection'), api('GET', '/v1/ai/drafts')]);
  const editing = editId ? await api('GET', `/v1/posts/${editId}`) : null;
  const active = state.accounts.filter(a => a.status === 'active');
  const initial = editing || aiDraft;
  const s = {
    key: crypto.randomUUID(),
    selected: new Set(initial ? initial.targets.map(_targetValue5 => _targetValue5.account_id) : active.length === 1 ? [active[0].id] : []),
    content: initial?.content || '',
    media: initial ? initial.media : [],
    per: {},
    // account_id -> { content?, options:{} }
    when: initial?.scheduled_at || atParam ? 'later' : 'now',
    at: initial?.scheduled_at ? toLocalInput(initial.scheduled_at) : toLocalInput(atParam || new Date(Date.now() + 3600_000).toISOString())
  };
  if (initial) for (const _targetValue6 of initial.targets) s.per[_targetValue6.account_id] = {
    content: _targetValue6.content ?? undefined,
    options: _targetValue6.options || {}
  };
  const slides = {};
  const per = id => s.per[id] ||= {
    options: {}
  };
  let composeCompany = state.scope?.companyId || '';
  const root = h('div', {
    class: 'composer'
  });
  const left = h('div', {
    class: 'panel'
  });
  const right = h('div', {
    class: 'preview-wrap'
  });
  root.append(left, right);
  function render() {
    const focus = document.activeElement?.dataset.accountControl;
    replaceContent(left, ...renderForm());
    renderPreview();
    if(focus) [...left.querySelectorAll('[data-account-control]')].find(el=>el.dataset.accountControl===focus)?.focus({preventScroll:true});
  }
  function renderForm() {
    const sel = state.accounts.filter(a => s.selected.has(a.id));
    const igMax = 2200,
      thMax = 500;
    const n = len(s.content);
    const ta = h('textarea', {
      placeholder: t("ui.copy.0064"),
      'aria-label': t("ui.extra.7"),
      oninput: e => {
        s.content = e.target.value;
        renderPreview();
        updateMeter();
      }
    });
    ta.value = s.content;
    const meter = h('div', {
      class: 'meter'
    });
    const updateMeter = () => {
      const c = len(s.content);
      meter.replaceChildren(...[sel.some(a => a.platform === 'instagram') ? h('span', {
        class: c > igMax ? 'over' : ''
      }, `Instagram ${c}/${igMax}`) : null, sel.some(a => a.platform === 'threads') ? h('span', {
        class: c > thMax ? 'over' : ''
      }, `Threads ${c}/${thMax}`) : null].filter(Boolean));
    };
    updateMeter();
    return [h('h3', {}, t('compose.to')), h('label',{class:'rd-field'},'Perusahaan',h('select',{'aria-label':'Perusahaan tujuan',onchange:e=>{composeCompany=e.target.value;s.selected=new Set([...s.selected].filter(id=>state.accounts.some(a=>a.id===id&&(!composeCompany||a.company_id===composeCompany))));render();}},h('option',{value:''},'Semua perusahaan'),state.companies.map(c=>h('option',{value:c.id,selected:c.id===composeCompany},c.name)))), ui.accountPicker({
      accounts: state.accounts.filter(a=>!composeCompany || (composeCompany==='none'?!a.company_id:a.company_id===composeCompany)).map(a => ({
        ...a,
        disabled: a.status !== 'active',
        reason: a.status !== 'active' ? t('ui.copy.0011') : ''
      })),
      selected: [...s.selected],
      onChange: ids => {
        s.selected = new Set(ids);
        render();
      }
    }).element, ta, meter, h('div', {
      class: 'media-strip'
    }, s.media.map((m, i) => h('div', {
      class: 'tile'
    }, m.type === 'video' ? h('video', {
      src: m.url,
      muted: true
    }) : h('img', {
      src: m.url,
      alt: m.alt_text || ''
    }), h('span', {
      class: 'badge'
    }, i + 1), h('button', {
      type: 'button',
      'aria-label': t("ui.copy.0067"),
      onclick: () => {
        s.media.splice(i, 1);
        render();
      }
    }, icon('x')))), h('button', {
      type: 'button',
      class: 'add',
      onclick: () => pickMedia(picked => {
        s.media.push(...picked);
        render();
      })
    }, t("ui.copy.0068"))), sel.length ? h('div', {}, sel.map(perAccount)) : null, h('div', {
      class: 'per-acc'
    }, h('h3', {}, t("ui.extra.8")), h('p', {
      class: 'muted small'
    }, t("compose.retention")), h('div', {
      class: 'when-box'
    }, h('div', {
      class: 'seg'
    }, h('button', {
      type: 'button',
      class: s.when === 'now' ? 'on' : '',
      onclick: () => {
        s.when = 'now';
        render();
      },
      disabled: !!editing
    }, t("compose.publish")), h('button', {
      type: 'button',
      class: s.when === 'later' ? 'on' : '',
      onclick: () => {
        s.when = 'later';
        render();
      }
    }, t("compose.schedule"))), s.when === 'later' ? h('input', {
      type: 'datetime-local',
      value: s.at,
      oninput: e => {
        s.at = e.target.value;
        renderPreview();
      },
      'aria-label': t("ui.copy.0069")
    }) : null)), h('div', {
      class: 'row end',
      style: {
        marginTop: '18px'
      }
    }, editing ? h('a', {
      class: 'btn',
      href: `#/posts/${editing.id}`
    }, t("common.cancel")) : null, h('button', {
      class: 'btn primary',
      onclick: submit,
      disabled: !sel.length
    }, editing ? t("ui.copy.0070") : aiDraft ? s.when === 'now' ? t("ui.copy.0071") : t("ui.copy.0072") : s.when === 'now' ? t("ui.extra.9") : t("compose.schedule")))];
  }
  function perAccount(a) {
    const p = per(a.id);
    const o = p.options;
    const custom = p.content !== undefined;
    const body = h('div', {
      class: 'inner'
    }, h('label', {
      class: 'check'
    }, h('input', {
      type: 'checkbox',
      checked: custom,
      onchange: e => {
        p.content = e.target.checked ? s.content : undefined;
        render();
      }
    }), t("ui.copy.0073")), custom ? h('textarea', {
      style: {
        marginTop: '8px',
        minHeight: '80px'
      },
      oninput: e => {
        p.content = e.target.value;
        renderPreview();
      }
    }, p.content) : null, a.platform === 'instagram' ? h('div', {
      class: 'row',
      style: {
        marginTop: '10px'
      }
    }, h('label', {
      class: 'check'
    }, t("gen.format"), h('select', {
      style: {
        width: 'auto'
      },
      onchange: e => {
        o.format = e.target.value === 'story' ? 'story' : undefined;
        if (o.format) p.content = '';
        render();
      }
    }, h('option', {
      value: 'feed',
      selected: o.format !== 'story'
    }, t("ui.extra.10")), h('option', {
      value: 'story',
      selected: o.format === 'story'
    }, t("draft.mode.story")))), s.media.length === 1 && s.media[0].type === 'video' && o.format !== 'story' ? h('label', {
      class: 'check'
    }, h('input', {
      type: 'checkbox',
      checked: o.share_to_feed !== false,
      onchange: e => {
        o.share_to_feed = e.target.checked;
      }
    }), t("ui.extra.11")) : null) : null, a.platform === 'threads' ? threadsOptions(o) : null);
    const d = h('details', {
      class: 'per-acc',
      open: custom || Object.keys(o).length > 0
    }, h('summary', {}, avatar(a), `@${a.username}`, h('span', {
      class: 'faint small'
    }, PLAT[a.platform])), body);
    return d;
  }
  function threadsOptions(o) {
    const parts = o.thread || [];
    return h('div', {
      style: {
        marginTop: '10px'
      }
    }, h('div', {
      class: 'row'
    }, h('label', {
      class: 'check'
    }, t("ui.extra.12"), h('input', {
      style: {
        width: '140px'
      },
      value: o.topic_tag || '',
      placeholder: t("ui.extra.13"),
      oninput: e => {
        o.topic_tag = e.target.value || undefined;
      }
    })), h('label', {
      class: 'check'
    }, t("ui.copy.0074"), h('select', {
      style: {
        width: 'auto'
      },
      onchange: e => {
        o.reply_control = e.target.value || undefined;
      }
    }, [['', t("ui.copy.0075")], ['accounts_you_follow', t("ui.copy.0076")], ['mentioned_only', t("ui.copy.0077")], ['followers_only', t("ui.copy.0078")]].map(([v, l]) => h('option', {
      value: v,
      selected: (o.reply_control || '') === v
    }, l))))), !s.media.length ? h('label', {
      class: 'check',
      style: {
        marginTop: '10px'
      }
    }, h('input', {
      type: 'checkbox',
      checked: !!o.poll,
      onchange: e => {
        o.poll = e.target.checked ? {
          options: ['', '']
        } : undefined;
        render();
      }
    }), t("ui.copy.0079")) : null, o.poll ? h('div', {
      style: {
        marginTop: '8px'
      }
    }, o.poll.options.map((opt, i) => h('div', {
      class: 'thread-part'
    }, h('input', {
      value: opt,
      maxlength: 25,
      placeholder: t("ui.copy.0080", {
        "0": i + 1
      }),
      oninput: e => {
        o.poll.options[i] = e.target.value;
        renderPreview();
      }
    }), o.poll.options.length > 2 ? h('button', {
      class: 'btn sm ghost',
      type: 'button',
      onclick: () => {
        o.poll.options.splice(i, 1);
        render();
      }
    }, icon('x')) : null)), o.poll.options.length < 4 ? h('button', {
      class: 'btn sm',
      type: 'button',
      onclick: () => {
        o.poll.options.push('');
        render();
      }
    }, t("ui.copy.0081")) : null) : null, h('div', {
      style: {
        marginTop: '10px'
      }
    }, parts.map((p, i) => h('div', {
      class: 'thread-part'
    }, h('textarea', {
      placeholder: t("ui.sweep.6", {
        "0": i + 2
      }),
      oninput: e => {
        parts[i] = e.target.value;
        renderPreview();
      }
    }, typeof p === 'string' ? p : p.text), h('button', {
      class: 'btn sm ghost',
      type: 'button',
      'aria-label': t("ui.copy.0082"),
      onclick: () => {
        parts.splice(i, 1);
        if (!parts.length) delete o.thread;
        render();
      }
    }, icon('x')))), parts.length < 10 ? h('button', {
      class: 'btn sm',
      type: 'button',
      onclick: () => {
        o.thread = [...parts, ''];
        render();
      }
    }, t("ui.copy.0083")) : null));
  }
  function renderPreview() {
    const sel = state.accounts.filter(a => s.selected.has(a.id));
    const when = s.when === 'later' && s.at ? fmtDT(new Date(s.at+':00+07:00').toISOString()) : t('compose.when.now');
    const cards = sel.map(a => {
      const p = per(a.id);
      const text = p.content !== undefined ? p.content : s.content;
      const m = s.media;
      const mediaEl = x => x.type === 'video' ? h('video', {
        src: x.url,
        muted: true,
        autoplay: true,
        loop: true,
        playsinline: true
      }) : h('img', {
        src: x.url,
        alt: x.alt_text || ''
      });
      if (a.platform === 'instagram') {
        const story = p.options.format === 'story';
        const index = Math.min(slides[a.id] || 0, Math.max(0, m.length - 1));
        const item = m[index];
        const ratio = story ? '9 / 16' : m[0]?.width && m[0]?.height ? String(m[0].width / m[0].height) : '4 / 5';
        const move = delta => {
          slides[a.id] = (index + delta + m.length) % m.length;
          renderPreview();
        };
        return h('div', {
          class: 'pv instagram'
        }, h('div', {
          class: 'hd'
        }, avatar(a), a.username, h('span', {
          class: 'when'
        }, when)), h('div', {
          class: `img ${story ? 'story' : ''}`,
          style: {
            aspectRatio: ratio
          }
        }, item ? mediaEl(item) : t("ui.copy.0084"), m.length > 1 ? h('span', {
          class: 'slide-count'
        }, `${index + 1}/${m.length}`) : null, m.length > 1 ? h('button', {
          type: 'button',
          class: 'slide-prev',
          'aria-label': t("ui.extra.14"),
          onclick: () => move(-1)
        }, icon("chevron-left")) : null, m.length > 1 ? h('button', {
          type: 'button',
          class: 'slide-next',
          'aria-label': t("ui.extra.15"),
          onclick: () => move(1)
        }, icon("chevron-right")) : null), !story ? h('div', {
          class: 'ig-actions',
          'aria-hidden': 'true'
        }, t("ui.copy.0085"), h('span', {}, t("comments.reply"))) : null, m.length > 1 && !story ? h('div', {
          class: 'slide-dots'
        }, m.map((_, i) => h('button', {
          type: 'button',
          class: i === index ? 'on' : '',
          'aria-label': `Slide ${i + 1}`,
          'aria-pressed': String(i === index),
          onclick: () => {
            slides[a.id] = i;
            renderPreview();
          }
        }))) : null, !story && text ? h('div', {
          class: 'cap'
        }, h('b', {}, a.username), text) : null, h('div', {
          class: 'pv-note'
        }, story ? t("ui.copy.0086") : m.length > 1 ? t("ui.copy.0087") : item?.type === 'video' ? t("ui.copy.0088") : t("ui.copy.0089"), t("ui.extra.16")), len(text) > 2200 ? h('div', {
          class: 'warn'
        }, t("ui.sweep.7", {
          "0": len(text) - 2200
        })) : null);
      }
      const parts = p.options.thread || [];
      return h('div', {
        class: 'pv threads'
      }, h('div', {
        class: 'hd'
      }, avatar(a), a.username, h('span', {
        class: 'when'
      }, when)), text ? h('div', {
        class: 'tbody'
      }, text) : null, m.length ? h('div', {
        class: 'tmedia'
      }, m.slice(0, 3).map(mediaEl)) : null, p.options.poll ? h('div', {
        class: 'poll'
      }, p.options.poll.options.map((x, i) => h('div', {}, x || t("ui.copy.0080", {
        "0": i + 1
      })))) : null, parts.map(_targetValue7 => h('div', {
        class: 'tpart'
      }, typeof _targetValue7 === 'string' ? _targetValue7 : _targetValue7.text)), len(text) > 500 ? h('div', {
        class: 'warn'
      }, t("ui.sweep.8", {
        "0": len(text) - 500
      })) : null);
    });
    right.replaceChildren(h('h3', {}, t("ui.copy.0090")), h('div', {
      class: 'previews'
    }, cards.length ? cards : h('div', {
      class: 'pv-empty'
    }, t("ui.copy.0091"))));
  }
  async function submit(e) {
    const btn = e.currentTarget;
    const targets = [...s.selected].map(id => {
      const p = per(id);
      const _targetValue8 = {
        account_id: id
      };
      if (p.content !== undefined) _targetValue8.content = p.content;
      const o = structuredClone(p.options);
      for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
      if (o.thread) o.thread = o.thread.filter(x => typeof x === 'string' ? x.trim() : x.text?.trim());
      if (o.thread && !o.thread.length) delete o.thread;
      if (o.poll) o.poll.options = o.poll.options.filter(x => x.trim());
      if (Object.keys(o).length) _targetValue8.options = o;
      return _targetValue8;
    });
    const body = {
      content: s.content,
      media_ids: s.media.map(m => m.id),
      targets,
      ...(aiDraft ? {
        ai_draft_id: aiDraft.id
      } : {})
    };
    if (s.when === 'later') {
      if (!s.at) return toast(t("ui.copy.0092"), true);
      body.scheduled_at = new Date(s.at+':00+07:00').toISOString();
    }
    btn.disabled = true;
    try {
      const p = editing ? await api('PATCH', `/v1/posts/${editing.id}`, body) : await api('POST', '/v1/posts', body, {
        headers: {
          'Idempotency-Key': s.key
        }
      });
      toast(editing ? t("ui.sweep.9") : s.when === 'now' ? t("ui.copy.0093") : t("ui.copy.0094", {
        "0": fmtDT(p.scheduled_at)
      }));
      go(`/posts/${p.id}`);
    } catch (err) {
      btn.disabled = false;
      const who = err.details?.account_id ? state.accounts.find(a => a.id === err.details.account_id) : null;
      toast(`${who ? `@${who.username}: ` : ''}${errMsg(err)}`, true);
    }
  }
  render();
  function connectionHelp() {
    modal(t("ui.copy.0095"), h('div', {}, h('p', {}, t("ui.copy.0096")), h('p', {}, t("ui.extra.17"), h('code', {}, connection.mcp_url)), h('p', {}, t("ui.copy.0097")), h('p', {}, t("ui.copy.0098")), h('p', {
      class: 'muted small'
    }, t("ui.copy.0099")), h('a', {
      class: 'btn primary',
      href: 'https://chatgpt.com/',
      target: '_blank',
      rel: 'noopener noreferrer'
    }, t("ui.copy.0100"))));
  }
  const aiPanel = h('section', {
    class: 'panel',
    'aria-label': t("ui.copy.0101")
  }, h('div', {
    class: 'sec-h'
  }, h('h2', {}, t("ui.copy.0101")), h('button', {
    class: 'btn',
    onclick: connectionHelp
  }, t("ui.extra.18"))), h('p', {
    class: 'muted small'
  }, t("ui.copy.0102", {
    "0": state.user.email,
    "1": connection.connected ? t("ui.sweep.10") : t("ui.sweep.11")
  })), connection.apps.map(app => h('div', {
    class: 'row'
  }, h('span', {}, app.name || t("ui.sweep.12")), h('button', {
    class: 'btn sm ghost',
    onclick: async () => {
      try {
        await api('DELETE', '/v1/ai/connections/' + app.id);
        toast(t("ui.copy.0103"));
        route();
      } catch (error) {
        toast(errMsg(error), true);
      }
    }
  }, t("ui.extra.19")))), h('button', {
    class: 'btn sm',
    onclick: route
  }, t("ui.copy.0104")), inbox.data.length ? h('div', {
    class: 'list'
  }, inbox.data.map(draft => h('a', {
    class: 'item',
    href: '#/compose?ai_draft=' + draft.id
  }, draft.media[0]?.url ? draft.media[0].type === 'video' ? h('video', {
    class: 'thumb',
    src: draft.media[0].url,
    muted: true,
    preload: 'metadata'
  }) : h('img', {
    class: 'thumb',
    src: draft.media[0].url,
    alt: t("ui.copy.0105")
  }) : null, h('div', {
    class: 'body'
  }, h('b', {}, t("ui.copy.0106", {
    "0": draft.source
  })), h('p', {}, draft.content.slice(0, 160)), h('span', {
    class: 'faint small'
  }, fmtDT(draft.created_at)))))) : h('p', {
    class: 'faint small'
  }, t("ui.copy.0107")));
  return shell('/compose', h('div', {}, pagehead(editing ? t("ui.copy.0108") : t("compose.title"), t("ui.copy.0109")), inbox.data.length ? h('button',{class:'btn sm',onclick:()=>modal('Draft dari AI / agen',h('div',{class:'list'},inbox.data.map(d=>h('a',{class:'item',href:'#/compose?ai_draft='+d.id,onclick:e=>e.currentTarget.closest('dialog').close()},d.content?.slice(0,140)||'Draft tanpa caption'))))},inbox.data.length+' draft AI menunggu · Buka') : null, h('div',{class:'rd-compose-tabs'},h('button',{class:'btn',onclick:()=>root.classList.remove('show-preview')},'Editor'),h('button',{class:'btn',onclick:()=>root.classList.add('show-preview')},'Pratinjau')), aiDraft ? h('div', {
    class: 'banner'
  }, t("ui.copy.0110")) : null, root));
}
function toLocalInput(iso) { return iso ? new Date(Date.parse(iso)+7*3600000).toISOString().slice(0,16) : ''; }

// ---------------- media picker & uploads ----------------
async function uploadFile(file, {
  inLibrary = true,
  onProgress
} = {}) {
  const BIG = 20 * 1024 * 1024; // above this: resumable chunked upload
  if (file.size <= BIG) {
    return new Promise((res, rej) => {
      const x = new XMLHttpRequest();
      x.open('POST', `/v1/media/upload?in_library=${inLibrary}`);
      x.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
      x.upload.onprogress = e => onProgress?.(e.loaded / e.total);
      x.onload = () => {
        const j = JSON.parse(x.responseText || '{}');
        x.status < 300 ? res(j) : rej(Object.assign(new Error(j.error?.message || t("ui.copy.0111")), {
          code: j.error?.code
        }));
      };
      x.onerror = () => rej(uiError(t("ui.sweep.13")));
      x.send(file);
    });
  }
  // Resumable chunked upload: retries each part and, after a reload, continues from the parts already received.
  const key = `lrm-up:${file.name}:${file.size}:${file.lastModified}`;
  let up = null;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved) {
      const st = await api('GET', `/v1/media/${saved.id}/parts`).catch(() => null);
      if (st?.status === 'uploading') up = {
        ...st,
        received: st.received
      };
    }
  } catch {/* storage unavailable */}
  if (!up) {
    up = {
      ...(await api('POST', '/v1/media/uploads', {
        mime_type: file.type || 'video/mp4',
        size_bytes: file.size,
        original_name: file.name,
        in_library: inLibrary
      })),
      received: []
    };
    try {
      localStorage.setItem(key, JSON.stringify({
        id: up.id
      }));
    } catch {/* ignore */}
  }
  const done = new Set(up.received);
  for (let i = 1; i <= up.part_count; i++) {
    if (done.has(i)) {
      onProgress?.(i / up.part_count);
      continue;
    }
    for (let attempt = 1;; attempt++) {
      try {
        await api('PUT', `/v1/media/${up.id}/parts/${i}`, file.slice((i - 1) * up.part_size, i * up.part_size), {
          headers: {
            'content-type': 'application/octet-stream'
          }
        });
        break;
      } catch (e) {
        if (attempt >= 5 || e.code && e.code !== 'internal_error') throw e;
        await new Promise(r => setTimeout(r, 1000 * 2 ** attempt));
      }
    }
    onProgress?.(i / up.part_count);
  }
  const m = await api('POST', `/v1/media/${up.id}/complete`);
  try {
    localStorage.removeItem(key);
  } catch {/* ignore */}
  return m;
}
async function pickMedia(onDone) {
  const lib = await api('GET', '/v1/media?limit=100');
  const chosen = [];
  const grid = h('div', {
    class: 'mgrid'
  }, lib.data.map(m => {
    const cell = h('div', {
      class: 'mcell pick',
      tabindex: 0,
      role: 'button',
      onclick: () => toggle(),
      onkeydown: e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      }
    }, h('div', {
      class: 'pic'
    }, m.type === 'video' ? h('video', {
      src: m.url,
      muted: true
    }) : h('img', {
      src: m.url,
      alt: m.alt_text || ''
    })), h('div', {
      class: 'info'
    }, m.type === 'video' ? t("ui.sweep.14", {
      "0": Math.round((m.duration_ms || 0) / 1000)
    }) : `${m.width}×${m.height}`));
    function toggle() {
      const i = chosen.indexOf(m);
      i >= 0 ? chosen.splice(i, 1) : chosen.push(m);
      cell.classList.toggle('on', i < 0);
    }
    return cell;
  }));
  const prog = h('div', {
    class: 'progress'
  }, h('i'));
  const input = h('input', {
    type: 'file',
    accept: 'image/jpeg,image/png,video/mp4,video/quicktime',
    multiple: true,
    hidden: true,
    onchange: async () => {
      const files = [...input.files];
      try {
        const out = [];
        for (const [i, f] of files.entries()) out.push(await uploadFile(f, {
          inLibrary: true,
          onProgress: p => {
            prog.firstChild.style.width = `${(i + p) / files.length * 100}%`;
          }
        }));
        d.close();
        onDone(out);
      } catch (e) {
        toast(errMsg(e), true);
      }
    }
  });
  const d = modal(t("ui.copy.0112"), h('div', {}, h('div', {
    class: 'drop'
  }, h('p', {}, t("ui.copy.0113")), h('button', {
    class: 'btn',
    onclick: () => input.click()
  }, t("ui.copy.0114")), input, prog), lib.data.length ? grid : h('p', {
    class: 'muted'
  }, t("ui.copy.0115"))), [h('button', {
    class: 'btn',
    onclick: () => d.close()
  }, t("common.cancel")), h('button', {
    class: 'btn primary',
    onclick: () => {
      d.close();
      onDone(chosen);
    }
  }, t("ui.copy.0116"))]);
}

// ---------------- post detail ----------------
async function pagePost(id) {
  let p = await api('GET', `/v1/posts/${id}`);
  const box = h('div');
  const draw = () => {
    const editable = p.status === 'scheduled';
    box.replaceChildren(pagehead(p.scheduled_at ? t("ui.copy.0094", {
      "0": fmtDT(p.scheduled_at)
    }) : t("ui.copy.0117", {
      "0": fmtDT(p.created_at)
    }), null, status(p.status), editable ? h('a', {
      class: 'btn',
      href: `#/compose/${p.id}`
    }, t("cal.event.edit")) : null, editable ? h('button', {
      class: 'btn',
      onclick: () => act('publish', t("ui.copy.0093"))
    }, t("compose.publish")) : null, editable ? h('button', {
      class: 'btn danger',
      onclick: async () => (await confirmDialog({
        title: t("ui.copy.0118"),
        body: t("dialog.danger.note"),
        tone: "danger",
        confirmLabel: t("dialog.confirm")
      })) && act('cancel', t("ui.copy.0119"))
    }, t("common.cancel")) : null, ['failed', 'partial'].includes(p.status) ? h('button', {
      class: 'btn primary',
      onclick: () => act('retry', t("ui.sweep.15"))
    }, t("ui.copy.0120")) : null), h('div', {
      class: 'grid2'
    }, h('div', {
      class: 'panel'
    }, h('h2', {}, t("nav.group.content")), h('p', {
      style: {
        whiteSpace: 'pre-wrap'
      }
    }, p.content || h('span', {
      class: 'faint'
    }, t("ui.extra.20"))), p.media.length ? h('div', {
      class: 'media-strip'
    }, p.media.filter(m => m.url).map(m => h('div', {
      class: 'tile'
    }, m.type === 'video' ? h('video', {
      src: m.url,
      muted: true,
      controls: true
    }) : h('img', {
      src: m.url,
      alt: m.alt_text || ''
    })))) : null, p.media.some(m => m.status === 'purged') ? h('p', {
      class: 'muted small'
    }, t("ui.copy.0121")) : null, h('p', {
      class: 'faint small'
    }, t("ui.sweep.16", {
      "0": p.source === 'mcp' ? 'AI (MCP)' : p.source === 'api' ? 'REST API' : 'dashboard'
    }))), h('div', {
      class: 'panel'
    }, h('h2', {}, t("ui.copy.0122")), p.targets.map(_targetValue9 => h('div', {
      class: 'target-row'
    }, plat(_targetValue9.platform), h('b', {}, `@${_targetValue9.username}`), h('span', {
      class: 'spacer'
    }), status(_targetValue9.status), _targetValue9.permalink ? h('a', {
      class: 'btn sm',
      href: _targetValue9.permalink,
      target: '_blank',
      rel: 'noopener'
    }, _targetValue9.platform === 'instagram' ? t("ui.copy.0123") : t("ui.copy.0124")) : _targetValue9.status === 'published' ? h('span', {
      class: 'muted small'
    }, _targetValue9.options?.format === 'story' ? t("ui.copy.0125") : t("ui.copy.0126")) : null, _targetValue9.error_code ? h('div', {
      class: 'err-box'
    }, h('b', {}, ERR[_targetValue9.error_code] || _targetValue9.error_code), _targetValue9.error_message ? technicalError(_targetValue9.error_message, _targetValue9.error_code) : null, _targetValue9.error_code === 'account_expired' ? h('a', {
      class: 'btn sm',
      style: {
        marginTop: '6px'
      },
      href: `/connect/${_targetValue9.platform}`
    }, t("ui.copy.0038")) : null) : null, _targetValue9.content != null ? h('div', {
      class: 'small muted',
      style: {
        width: '100%',
        whiteSpace: 'pre-wrap'
      }
    }, t("ui.sweep.17", {
      "0": _targetValue9.content || '(kosong)'
    })) : null)))), p.status !== 'scheduled' && !['publishing', 'cancelled'].includes(p.status) ? h('div', {
      class: 'row',
      style: {
        marginTop: '16px'
      }
    }, h('button', {
      class: 'btn ghost danger sm',
      onclick: async () => {
        if (!(await confirmDialog({
          title: t("ui.copy.0127"),
          body: t("dialog.danger.note"),
          tone: "danger",
          confirmLabel: t("dialog.confirm")
        }))) return;
        await api('POST', `/v1/posts/${p.id}/remove`);
        toast(t("ui.copy.0128"));
        go('/calendar');
      }
    }, t("ui.copy.0129"))) : null);
  };
  async function act(kind, msg) {
    try {
      p = kind === 'cancel' ? await api('DELETE', `/v1/posts/${p.id}`) : await api('POST', `/v1/posts/${p.id}/${kind}`);
      toast(msg);
      draw();
      poll();
    } catch (e) {
      toast(errMsg(e), true);
    }
  }
  let timer;
  function poll() {
    clearTimeout(timer);
    if (!['publishing'].includes(p.status) && !p.targets.some(_targetValue0 => ['pending', 'publishing'].includes(_targetValue0.status) && !p.scheduled_at)) return;
    timer = setTimeout(async () => {
      if (!location.hash.includes(p.id)) return;
      p = await api('GET', `/v1/posts/${p.id}`);
      draw();
      poll();
    }, 2500);
  }
  draw();
  poll();
  return shell('/calendar', box);
}
function agentActivity(r) {
  const roles = [['concept', t("ui.extra.21"), 'KC'], ['revision', t("ui.extra.22"), 'KR'], ['visual', 'Visual Conceptor', 'VC'], ['image', t("agent.image"), 'IC'], ['final', 'Final Review', 'FR']];
  const done = roles.filter(([role]) => r.steps[role]?.status === 'done').length;
  return h('section', {
    class: 'agent-activity',
    'aria-label': t("ui.extra.23")
  }, h('div', {
    class: 'agent-activity-head'
  }, h('b', {}, t("ui.copy.0130")), h('span', {
    class: 'muted small'
  }, r.status === 'running' ? t("ui.sweep.18") : r.status === 'queued' ? t("ui.copy.0131") : r.status === 'failed' ? t("ui.copy.0132") : t("ui.copy.0133", {
    "0": done,
    "1": roles.length
  }))), h('div', {
    class: 'agent-workfloor'
  }, roles.map(([role, name, initials]) => {
    const step = r.steps[role];
    const state = step?.status === 'done' ? 'done' : step?.status === 'running' && r.status === 'running' ? 'working' : step?.status === 'running' && r.status === 'failed' ? 'error' : 'waiting';
    return h('div', {
      class: `agent-desk ${state}`,
      'data-agent': role,
      'data-state': state
    }, h('div', {
      class: 'agent-orbit'
    }, h('div', {
      class: 'agent-face'
    }, initials), h('i', {
      class: 'agent-signal'
    })), h('b', {}, name), h('span', {
      class: 'agent-state'
    }, step?.status === 'manual' ? t("ui.copy.0134") : state === 'working' ? t("ui.copy.0135") : state === 'done' ? t("draft.state.done") : state === 'error' ? t("draft.tab.action") : t("ui.copy.0004")), role === 'image' && step ? h('small', {}, t("ui.copy.0136", {
      "0": step.completed_slides || 0,
      "1": r.slide_count
    })) : null, h('div', {
      class: 'agent-wave',
      'aria-hidden': 'true'
    }, h('i'), h('i'), h('i'), h('i')));
  })), h('div', {
    class: 'agent-total-progress',
    role: 'progressbar',
    'aria-label': t("ui.copy.0137"),
    'aria-valuemin': '0',
    'aria-valuemax': String(roles.length),
    'aria-valuenow': String(done)
  }, h('i', {
    style: {
      width: `${done / roles.length * 100}%`
    }
  })));
}
const wibInput = iso => iso ? new Date(Date.parse(iso) + 7 * 3600000).toISOString().slice(0, 16) : '';
const wibIso = value => value ? new Date(value + ':00+07:00').toISOString() : null;
function conceptReviewPanel(r, approve) {
  if (r.status !== 'concept_review') return null;
  const plan = r.steps.revision?.output;
  if (!plan) return null;
  const title = h('input', {
    'aria-label': t("ui.extra.24"),
    value: plan.title
  });
  const caption = h('textarea', {
    'aria-label': t("ui.extra.25"),
    maxlength: 2200
  }, plan.caption);
  const prompts = plan.slides.map((slide, i) => h('textarea', {
    'aria-label': t("ui.copy.0138", {
      "0": i + 1
    }),
    maxlength: 6000
  }, slide.prompt));
  return h('section', {
    class: 'panel concept-review-panel'
  }, h('h2', {}, t("ui.copy.0139")), h('p', {
    class: 'muted small'
  }, t("ui.copy.0140")), h('label', {}, t("ui.extra.26"), title), h('label', {}, t("ui.extra.7"), caption), ...prompts.map((input, i) => h('label', {}, t("ui.copy.0141", {
    "0": i + 1
  }), input)), h('button', {
    class: 'btn primary',
    onclick: async () => {
      if (await askCost(t("ui.copy.0142", {
        "0": plan.slides.length
      }), r.agents)) await approve({
        title: title.value,
        caption: caption.value,
        slides: prompts.map(input => ({
          prompt: input.value
        }))
      });
    }
  }, t("ui.copy.0143")));
}
const redesignContext = () => ({
  h,
  api,
  ui,
  state,
  icon,
  modal,
  toast,
  go,
  loadAccounts,
  pickMedia,
  uploadFile,
  errMsg
});
async function redesigned(page, id) {
  const ctx = redesignContext(),
    workspace = contentWorkspace(ctx);
  const pages = workspacePages(ctx, workspace);
  const result = page === 'generator' ? await generatorWorkspace(ctx, workspace) : ['home', 'accounts', 'brand', 'media', 'calendar', 'insights', 'team', 'audit'].includes(page) ? await pages[page](id) : await workspace[page](id);
  return shell({
    home: '/',
    accounts: '/accounts',
    brand: isOwner() ? '/accounts' : '/generator',
    media: '/media',
    calendar: '/calendar',
    insights: '/insights',
    team: '/team',
    audit: '/admin',
    generator: '/generator'
  }[page] || '/generator/drafts', result.element, result.dispose || null);
}
async function pageContentDrafts() {
  await loadAccounts();
  const query = new URLSearchParams(location.hash.split('?')[1] || '');
  const requestedPlan = query.get('plan') || '';
  const requestedPlans = (query.get('plans') || '').split(',').filter(Boolean);
  let selectedId = query.get('id') || '',
    last = '',
    stopped = false,
    fetching = false;
  const selectedDrafts = new Set();
  let visibleDrafts = [],
    gallerySignature = '';
  const deletable = r => ['planned', 'concept_review', 'review', 'failed', 'cancelled'].includes(r.status) && !r.post_id && !r.draft_id;
  const edits = {},
    chosenMedia = {},
    previewSlides = {};
  const planSelect = h('select', {
    'aria-label': t("ui.copy.0144"),
    onchange: () => {
      selectedId = '';
      last = '';
      refresh();
    }
  }, h('option', {
    value: ''
  }, t("ui.copy.0145")));
  const plans = (await api('GET', '/v1/generator/plans')).data;
  if (requestedPlans.length) planSelect.append(h('option', {
    value: 'session',
    selected: true
  }, t("ui.copy.0146", {
    "0": requestedPlans.length
  })));
  plans.forEach(p => planSelect.append(h('option', {
    value: p.id,
    selected: p.id === requestedPlan
  }, t("ui.copy.0147", {
    "0": p.content_count,
    "1": fmtDay(p.start_date + 'T00:00:00+07:00'),
    "2": fmtDay(p.end_date + 'T00:00:00+07:00'),
    "3": sessionTitle(p)
  }))));
  const statusFilter = h('select', {
    'aria-label': t("ui.extra.27"),
    onchange: () => {
      selectedId = '';
      last = '';
      refresh();
    }
  }, h('option', {
    value: 'pending',
    selected: !query.get('status') || query.get('status') === 'pending'
  }, t("ui.copy.0149")), h('option', {
    value: 'all',
    selected: query.get('status') === 'all'
  }, t("draft.tab.all")), h('option', {
    value: 'approved',
    selected: query.get('status') === 'approved'
  }, t("ui.copy.0150")));
  const scope = ui.scopeBar({
    page: 'drafts',
    views: [{
      id: 'grid',
      label: t('view.grid')
    }],
    extra: h('div', {
      class: 'ui-scope-extra'
    }, h('label', {}, t('status.planned'), planSelect), h('label', {}, t('ui.extra.34'), statusFilter)),
    onChange: () => {
      selectedId = '';
      last = '';
      refresh();
    }
  });
  const list = h('div', {
      class: 'draft-list draft-gallery'
    }),
    detail = h('div', {
      class: 'draft-editor'
    }),
    summary = h('p', {
      class: 'muted small'
    });
  const selectedCount = h('span', {
      role: 'status'
    }),
    selectAll = h('input', {
      type: 'checkbox',
      'aria-label': t("ui.copy.0151"),
      onchange: () => {
        for (const r of visibleDrafts.filter(deletable)) selectAll.checked ? selectedDrafts.add(r.id) : selectedDrafts.delete(r.id);
        last = '';
        refresh();
      }
    });
  const bulkDelete = h('button', {
    class: 'btn danger',
    disabled: true,
    onclick: async () => {
      const ids = [...selectedDrafts];
      if (!ids.length || !(await confirmDialog({
        title: t("ui.copy.0152", {
          "0": ids.length
        }),
        body: t("dialog.danger.note"),
        tone: "danger",
        confirmLabel: t("dialog.confirm")
      }))) return;
      bulkDelete.disabled = true;
      try {
        const result = await api('POST', '/v1/generator/drafts/delete', {
          ids
        });
        selectedDrafts.clear();
        if (ids.includes(selectedId)) {
          selectedId = '';
          editor.close();
        }
        last = '';
        toast(t("ui.copy.0153", {
          "0": result.deleted
        }));
        await refresh();
      } catch (e) {
        toast(errMsg(e), true);
        bulkDelete.disabled = false;
      }
    }
  }, t("ui.copy.0154"));
  const editor = h('dialog', {
    class: 'draft-preview-dialog',
    'aria-label': t("ui.extra.28")
  }, h('div', {
    class: 'draft-dialog-head'
  }, h('h2', {}, t("ui.copy.0155")), h('button', {
    class: 'btn',
    onclick: () => editor.close(),
    'aria-label': t("ui.extra.29")
  }, t("common.close"))), detail);
  const bulkBar = h('div', {
    class: 'draft-bulkbar'
  }, h('label', {
    class: 'check'
  }, selectAll, t("picker.all")), selectedCount, h('button', {
    class: 'btn',
    onclick: () => {
      selectedDrafts.clear();
      last = '';
      refresh();
    }
  }, t("ui.copy.0156")), bulkDelete);
  function updateSelection() {
    selectedCount.textContent = selectedDrafts.size + t("ui.sweep.19");
    selectedCount.hidden = !selectedDrafts.size;
    bulkDelete.hidden = !selectedDrafts.size;
    bulkBar.querySelector('button').hidden = !selectedDrafts.size;
    bulkDelete.disabled = !selectedDrafts.size;
    const allowed = visibleDrafts.filter(deletable);
    selectAll.checked = allowed.length > 0 && allowed.every(r => selectedDrafts.has(r.id));
    selectAll.indeterminate = allowed.some(r => selectedDrafts.has(r.id)) && !selectAll.checked;
    selectAll.disabled = !allowed.length;
  }
  const labels = {
    concept_review: t("ui.copy.0157"),
    planned: t("ui.copy.0158"),
    queued: t("ui.copy.0004"),
    running: t("ui.sweep.20"),
    review: t("draft.status.ready"),
    failed: t("draft.status.failed"),
    drafted: t("ui.copy.0159"),
    approved: t("ui.copy.0002"),
    cancelled: t("ui.copy.0006")
  };
  const act = (text, fn, primary = false) => h('button', {
    class: `btn ${primary ? 'primary' : ''}`,
    onclick: async e => {
      e.currentTarget.disabled = true;
      try {
        await fn();
        last = '';
        await refresh();
      } catch (error) {
        toast(errMsg(error), true);
      } finally {
        e.target.disabled = false;
      }
    }
  }, text);
  function draw(r) {
    const edit = edits[r.id] ||= {
      content: r.caption,
      brief: r.brief,
      at: wibInput(r.scheduled_at),
      references: r.references || [],
      reference_notes: r.reference_notes || '',
      reference_roles: r.reference_roles || {}
    };
    const editable = ['planned', 'concept_review', 'review', 'failed'].includes(r.status);
    const caption = h('textarea', {
      'aria-label': t("ui.extra.30"),
      maxlength: 2200,
      oninput: e => {
        edit.content = e.target.value;
      }
    }, edit.content);
    const prompt = h('textarea', {
      'aria-label': t("ui.extra.31"),
      maxlength: 10000,
      oninput: e => {
        edit.brief = e.target.value;
      }
    }, edit.brief);
    const at = h('input', {
      type: 'datetime-local',
      value: edit.at,
      'aria-label': t("ui.copy.0160"),
      oninput: e => {
        edit.at = e.target.value;
      }
    });
    const images = chosenMedia[r.id] || r.media;
    const index = Math.min(previewSlides[r.id] || 0, Math.max(0, images.length - 1));
    const acc = state.accounts.find(a => a.id === r.targets[0]?.account_id);
    const save = async () => {
      const data = {
        content: edit.content,
        brief: edit.brief,
        scheduled_at: wibIso(edit.at)
      };
      if (chosenMedia[r.id]) data.media_ids = chosenMedia[r.id].map(m => m.id);
      const updated = await api('PATCH', `/v1/generator/runs/${r.id}`, data);
      delete chosenMedia[r.id];
      return updated;
    };
    const mediaPicker = () => pickMedia(picked => {
      chosenMedia[r.id] = picked;
      previewSlides[r.id] = 0;
      draw(r);
    });
    const image = images[index];
    detail.replaceChildren(h('div', {
      class: 'panel'
    }, h('div', {
      class: 'row'
    }, h('h2', {}, r.title || t("draft.title")), h('span', {
      class: 'spacer'
    }), h('span', {
      class: 'pill'
    }, labels[r.status] || r.status)), ['queued', 'running', 'failed'].includes(r.status) ? agentActivity(r) : null, h('p', {
      class: 'muted small'
    }, r.targets.map(_targetValue1 => state.accounts.find(a => a.id === _targetValue1.account_id)?.username || '').map(u => '@' + u).join(', ')), r.expires_at ? h('p', {
      class: 'draft-expiry'
    }, t("ui.copy.0161", {
      "0": fmtDT(r.expires_at)
    })) : null, conceptReviewPanel(r, async concept => {
      await api('POST', `/v1/generator/runs/${r.id}/approve-concept`, {
        concept,
        confirm_cost: true
      });
      delete edits[r.id];
      last = '';
      await refresh();
      toast(t("ui.copy.0162"));
    }), h('div', {
      class: 'draft-review'
    }, h('div', {
      class: 'pv instagram'
    }, h('div', {
      class: 'hd'
    }, acc ? avatar(acc) : null, acc?.username || t("ui.copy.0163")), h('div', {
      class: 'img'
    }, image?.url ? image.type === 'video' ? h('video', {
      src: image.url,
      controls: true,
      muted: true
    }) : h('img', {
      src: image.url,
      alt: `Slide ${index + 1}`
    }) : image?.status === 'purged' ? t("ui.copy.0164") : t("ui.copy.0165")), images.length > 1 ? h('div', {
      class: 'row gen-slide-controls'
    }, act('‹', () => {
      previewSlides[r.id] = (index + images.length - 1) % images.length;
      draw(r);
    }), h('span', {}, `${index + 1}/${images.length}`), act('›', () => {
      previewSlides[r.id] = (index + 1) % images.length;
      draw(r);
    })) : null, h('div', {
      class: 'cap'
    }, h('b', {}, acc?.username || ''), edit.content)), h('div', {}, h('label', {}, t("ui.extra.7"), caption), h('label', {}, t("ui.copy.0166"), at), r.story_episode ? h('p', {
      class: 'pill'
    }, `Episode ${r.story_episode} · ${r.content_type}`) : null, r.schedule_reason ? h('p', {
      class: 'schedule-reason'
    }, t("ui.sweep.21", {
      "0": r.schedule_reason
    })) : null, h('p', {
      class: 'faint small'
    }, t("ui.copy.0167")), r.error ? technicalError(r.error) : null, editable ? h('div', {
      class: 'row'
    }, act(t("ui.copy.0168"), mediaPicker), act(t("compose.save"), async () => {
      await save();
      toast(t("ui.copy.0169"));
    })) : null, editable && (r.status === 'review' || chosenMedia[r.id]?.length) ? act(t("draft.approve.one"), async () => {
      if (!edit.at) throw uiError(t("ui.copy.0170"));
      if (!(await confirmDialog({
        title: t("ui.copy.0171"),
        body: t("draft.approve.dialog.body"),
        tone: "default",
        confirmLabel: t("dialog.confirm")
      }))) return;
      await save();
      const p = await api('POST', `/v1/generator/runs/${r.id}/approve`, {
        content: edit.content,
        scheduled_at: wibIso(edit.at)
      });
      toast(t("ui.copy.0172"));
      delete edits[r.id];
    }, true) : null, r.post_id ? h('a', {
      class: 'btn primary',
      href: '#/posts/' + r.post_id
    }, t("ui.copy.0173")) : null, r.status === 'drafted' && r.draft_id ? h('a', {
      class: 'btn',
      href: '#/compose?ai_draft=' + r.draft_id
    }, t("ui.copy.0174")) : null)), editable ? h('details', {}, h('summary', {}, t("ui.copy.0175")), prompt, h('p', {
      class: 'faint small'
    }, t("ui.copy.0176")), h('div', {
      class: 'row'
    }, r.targets.map(_targetValue10 => h('a', {
      class: 'btn sm',
      href: '#/accounts/' + encodeURIComponent(_targetValue10.account_id) + '?tab=brand'
    }, 'Brand Kit @' + (state.accounts.find(a => a.id === _targetValue10.account_id)?.username || '')))), h('p', {
      class: 'muted small'
    }, t("ui.copy.0177")), h('div', {
      class: 'row'
    }, r.status === 'planned' ? act(t("ui.copy.0178"), async () => {
      await save();
      if (await askCost(t("ui.copy.0179", {
        "0": r.slide_count
      }), r.agents)) await api('POST', `/v1/generator/runs/${r.id}/start`, {
        confirm_cost: true
      });
    }) : null, act(t("ui.extra.32"), async () => {
      if (!(await askCost(t("ui.copy.0180"), r.agents))) return;
      await save();
      const next = await api('POST', `/v1/generator/runs/${r.id}/revise`, {
        request_id: crypto.randomUUID(),
        brief: edit.brief,
        confirm_cost: true
      });
      selectedId = next.id;
    }))) : null, r.status === 'review' && r.steps.revision?.output?.slides?.[index] ? h('section', {
      class: 'panel'
    }, h('h3', {}, t("ui.copy.0181", {
      "0": index + 1
    })), h('p', {
      class: 'muted small'
    }, t("ui.copy.0182")), h('button', {
      class: 'btn',
      onclick: async () => {
        const instruction = await inputDialog({
          title: t('draft.slide.revise.title', {
            n: index + 1
          }),
          label: t('dialog.input'),
          hint: t('draft.slide.revise.hint') + ' ' + t('dialog.cost.note'),
          confirmLabel: t('draft.slide.revise'),
          suggestions: [t('visual.white'), t('visual.brighter'), t('visual.no_text')]
        });
        if (!instruction?.trim()) return;
        await api('POST', `/v1/generator/runs/${r.id}/slides/revise`, {
          request_id: crypto.randomUUID(),
          slide_index: index,
          instruction,
          confirm_cost: true
        });
        delete edits[r.id];
        last = '';
        await refresh();
      }
    }, t("draft.slide.revise"))) : null, r.media_versions?.some(v => v.slide_index === index) ? h('details', {
      class: 'slide-version-history'
    }, h('summary', {}, t("ui.sweep.22", {
      "0": index + 1
    })), h('div', {
      class: 'slide-version-grid'
    }, r.media_versions.filter(v => v.slide_index === index).map(v => h('figure', {}, v.media?.url ? h('img', {
      src: v.media.url,
      alt: t("ui.sweep.23")
    }) : null, h('figcaption', {}, v.instruction))))) : null, ['planned', 'concept_review', 'review', 'failed', 'cancelled'].includes(r.status) && !r.post_id && !r.draft_id ? act(t("ui.copy.0183"), async () => {
      if (!(await confirmDialog({
        title: t("ui.copy.0184"),
        body: t("dialog.danger.note"),
        tone: "danger",
        confirmLabel: t("dialog.confirm")
      }))) return;
      await api('DELETE', `/v1/generator/runs/${r.id}/content`);
      delete edits[r.id];
      selectedId = '';
      toast(t("ui.copy.0185"));
    }) : null, r.steps.visual?.profile_context ? h('p', {
      class: 'faint small'
    }, r.steps.visual.profile_context.note) : null, r.steps.final?.output ? h('details', {}, h('summary', {}, t("ui.copy.0186")), h('p', {
      class: 'gen-findings'
    }, r.steps.final.output)) : null, ['queued', 'running'].includes(r.status) ? h('a', {
      class: 'btn',
      href: '#/generator?id=' + r.id
    }, t("ui.copy.0187")) : null));
  }
  async function refresh() {
    if (stopped || fetching) return;
    fetching = true;
    try {
      let {
        data
      } = await api('GET', '/v1/generator/runs');
      if (stopped) return;
      data = data.filter(r => (!planSelect.value || (planSelect.value === 'session' ? requestedPlans.includes(r.plan_id) : r.plan_id === planSelect.value)) && scope.inScope(r) && (statusFilter.value === 'all' || statusFilter.value === 'approved' ? statusFilter.value === 'all' || r.status === 'approved' : !['approved', 'cancelled'].includes(r.status)));
      if (planSelect.value) data.sort((a, b) => String(a.scheduled_at || '').localeCompare(String(b.scheduled_at || '')));
      summary.textContent = t("ui.copy.0188", {
        "0": data.length
      });
      visibleDrafts = data;
      for (const id of selectedDrafts) if (!data.some(r => r.id === id && deletable(r))) selectedDrafts.delete(id);
      const nextGallerySignature = JSON.stringify([data, [...selectedDrafts]]);
      if (nextGallerySignature !== gallerySignature) {
        gallerySignature = nextGallerySignature;
        list.replaceChildren(...data.map(r => {
          const pick = h('input', {
            type: 'checkbox',
            'aria-label': t("ui.copy.0189") + (r.title || r.brief.slice(0, 70)),
            checked: selectedDrafts.has(r.id),
            disabled: !deletable(r),
            onchange: () => {
              pick.checked ? selectedDrafts.add(r.id) : selectedDrafts.delete(r.id);
              card.classList.toggle('is-selected', pick.checked);
              updateSelection();
            }
          });
          const card = h('article', {
            class: 'draft-tile' + (selectedDrafts.has(r.id) ? ' is-selected' : '')
          }, h('label', {
            class: 'draft-pick'
          }, pick, h('span', {
            class: 'sr-only'
          }, t("ui.copy.0190"))), h('button', {
            class: 'gen-history-item draft-thumbnail',
            'aria-label': t("ui.copy.0191") + (r.title || r.brief.slice(0, 70)),
            onclick: () => {
              selectedId = r.id;
              last = '';
              draw(r);
              if (!editor.open) editor.showModal();
            }
          }, r.media?.[0]?.url ? r.media[0].type === 'video' ? h('video', {
            class: 'draft-card-image',
            src: r.media[0].url,
            muted: true,
            preload: 'metadata'
          }) : h('img', {
            class: 'draft-card-image',
            src: r.media[0].url,
            alt: r.title || t("ui.copy.0155"),
            loading: 'lazy'
          }) : h('div', {
            class: 'draft-card-placeholder'
          }, r.status === 'concept_review' ? t("ui.extra.21") : t("ui.copy.0192")), h('span', {
            class: 'draft-thumb-badge'
          }, labels[r.status] || r.status), r.slide_count > 1 ? h('span', {
            class: 'draft-thumb-slides'
          }, r.slide_count + ' slide') : null, h('span', {
            class: 'draft-thumb-caption'
          }, h('b', {}, r.title || r.brief.slice(0, 70)), h('small', {}, r.scheduled_at ? fmtDT(r.scheduled_at) : t("ui.copy.0193")))));
          return card;
        }));
        if (!data.length) list.append(h('div', {
          class: 'panel empty'
        }, t("ui.copy.0194")));
      }
      updateSelection();
      const r = data.find(r => r.id === selectedId);
      if (r) {
        const signature = JSON.stringify(r);
        if (last !== signature) {
          last = signature;
          draw(r);
        }
        if (!editor.open && query.get('id') === selectedId) requestAnimationFrame(() => {
          if (editor.isConnected && !editor.open) editor.showModal();
        });
      } else if (editor.open) {
        editor.close();
        selectedId = '';
      }
    } catch (error) {
      if (!stopped) toast(errMsg(error), true);
    } finally {
      fetching = false;
    }
  }
  await refresh();
  const timer = setInterval(refresh, 5000);
  pageCleanup = () => {
    stopped = true;
    clearInterval(timer);
  };
  editor.addEventListener('close', () => {
    selectedId = '';
    query.delete('id');
  });
  return shell('/generator/drafts', h('div', {}, pagehead(t("draft.title"), t("ui.copy.0195"), h('a', {
    class: 'btn primary',
    href: '#/generator'
  }, t("draft.new"))), scope.element, h('details', {
    class: 'draft-options'
  }, h('summary', {}, t("ui.copy.0197")), h('p', {
    class: 'muted small'
  }, t("ui.copy.0198")), h('div', {
    class: 'row'
  }, act(t("ui.copy.0199"), async () => {
    if (!planSelect.value) throw uiError(t("ui.copy.0200"));
    const ids = planSelect.value === 'session' ? requestedPlans : [planSelect.value];
    if (await askCost(t("ui.copy.0201"))) {
      let queued = 0;
      for (const id of ids) {
        const result = await api('POST', `/v1/generator/plans/${id}/start`, {
          confirm_cost: true
        });
        queued += result.queued;
      }
      toast(t("ui.copy.0202", {
        "0": queued
      }));
    }
  }), h('a', {
    class: 'btn',
    href: '#/calendar'
  }, t("cal.title")))), summary, bulkBar, h('div', {
    class: 'draft-workspace'
  }, list), editor));
}

// Personal provider credentials are available to every signed-in user.
async function pageSettings() {
  const config = await api('GET', '/v1/generator/settings');
  const keys = h('div', {
    class: 'gen-keys'
  });
  const keySummary = h('span', {
    class: 'generator-key-summary'
  });
  function drawKeys() {
    keySummary.textContent = config.keys.length ? t("ui.copy.0203", {
      "0": config.keys.length
    }) : t("ui.copy.0204");
    keys.replaceChildren(...Object.entries(config.providers).map(([provider, p]) => {
      const saved = config.keys.find(k => k.provider === provider);
      const input = h('input', {
        type: 'password',
        autocomplete: 'new-password',
        placeholder: saved ? t("ui.sweep.24") : t("ui.copy.0205"),
        'aria-label': `API key ${p.name}`
      });
      const button = (text, fn) => h('button', {
        type: 'button',
        class: 'btn sm',
        onclick: fn
      }, text);
      const editor = h('div', {
        class: 'generator-key-editor',
        hidden: !!saved
      });
      const change = button(t("ui.copy.0206"), () => {
        editor.hidden = false;
        change.hidden = true;
        input.focus();
      });
      const status = h('div', {
        class: `generator-key-status ${saved ? 'saved' : ''}`,
        role: 'status'
      }, saved ? t("ui.copy.0207") : t("ui.copy.0208"));
      editor.append(input, h('div', {
        class: 'row'
      }, button(saved ? t("ui.copy.0209") : t("ui.copy.0210"), async () => {
        await api('PUT', '/v1/generator/keys/' + provider, {
          key: input.value.trim()
        });
        input.value = '';
        config.keys = [...config.keys.filter(k => k.provider !== provider), {
          provider,
          updated_at: new Date().toISOString()
        }];
        drawKeys();
        toast(t("ui.copy.0211", {
          "0": p.name
        }));
      }), saved ? button(t("common.cancel"), () => {
        input.value = '';
        editor.hidden = true;
        change.hidden = false;
      }) : null));
      return h('div', {
        class: 'gen-key',
        'data-key-provider': provider
      }, h('h3', {}, p.name), status, saved ? h('p', {
        class: 'muted small'
      }, t("ui.sweep.25", {
        "0": fmtDT(saved.updated_at)
      })) : null, saved ? h('p', {
        class: 'faint small'
      }, t("ui.copy.0212")) : null, editor, saved ? h('div', {
        class: 'row'
      }, change, button(t("ui.sweep.26"), async () => {
        if (!(await askCost(t('settings.ai.test'), {
          connection: {
            provider,
            model: p.textModel
          }
        }))) return;
        const r = await api('POST', '/v1/generator/keys/' + provider + '/test', {
          model: p.textModel
        });
        toast(t('settings.connection.ok'));
      }), button(t("ui.copy.0213"), async () => {
        if (!(await confirmDialog({
          title: t("ui.copy.0214"),
          body: t("dialog.danger.note"),
          tone: "danger",
          confirmLabel: t("dialog.confirm")
        }))) return;
        await api('DELETE', '/v1/generator/keys/' + provider);
        config.keys = config.keys.filter(k => k.provider !== provider);
        drawKeys();
        toast(t("ui.copy.0215", {
          "0": p.name
        }));
      })) : null);
    }));
  }
  drawKeys();
  const currentTab = new URLSearchParams(location.hash.split('?')[1] || '').get('tab') || 'ai';
  const securityStatus = h('p', {
    role: 'status',
    class: 'small muted'
  });
  const passwordForm = h('form', {
    onsubmit: async e => {
      e.preventDefault();
      try {
        await api('POST', '/auth/password', Object.fromEntries(new FormData(passwordForm)));
        passwordForm.reset();
        securityStatus.textContent = 'Password diperbarui.';
      } catch (e) {
        securityStatus.textContent = errMsg(e);
      }
    }
  }, h('label', {
    class: 'rd-field'
  }, 'Password saat ini', h('input', {
    type: 'password',
    name: 'current',
    required: true,
    autocomplete: 'current-password'
  })), h('label', {
    class: 'rd-field'
  }, 'Password baru (minimal 8 karakter)', h('input', {
    type: 'password',
    name: 'next',
    required: true,
    minlength: 8,
    autocomplete: 'new-password'
  })), securityStatus, h('button', {
    class: 'btn primary',
    type: 'submit'
  }, 'Ubah password'));
  return shell('/settings', h('div', {
    class: 'personal-settings rd-page'
  }, pagehead('Pengaturan pribadi', 'Profil, keamanan dan koneksi AI pribadi.'), h('div', {
    class: 'rd-tabs',
    style: {
      marginBottom: '20px'
    }
  }, [['profile', 'Profil'], ['security', 'Keamanan'], ['ai', 'Koneksi AI']].map(([id, label]) => h('a', {
    class: 'btn ' + (currentTab === id ? 'on' : ''),
    href: '#/settings?tab=' + id
  }, label))), currentTab === 'security' ? h('section', {
    class: 'panel',
    style: {
      maxWidth: '500px'
    }
  }, h('h2', {}, 'Ubah password'), passwordForm) : currentTab === 'profile' ? h('section', {
    class: 'panel'
  }, h('h2', {}, state.user.name), h('p', {}, state.user.email), h('p', {}, 'Peran: ' + ROLE[state.user.role])) : h('section', {
    class: 'panel'
  }, h('h2', {}, 'Koneksi AI pribadi', keySummary), h('p', {
    class: 'muted small'
  }, 'Key disimpan terenkripsi dan tidak ditampilkan kembali. Tagihan mengikuti tarif provider. Model tiap agen diatur di Sosmed Generator.'), keys)));
}

// ---------------- Sosmed Generator ----------------
async function pageGenerator() {
  await loadAccounts();
  let config = await api('GET', '/v1/generator/settings');
  state.aiSettings = config;
  state.brandProfiles ??= {};
  await Promise.allSettled(state.accounts.filter(a => a.platform === 'instagram').map(async a => {
    state.brandProfiles[a.id] = await api('GET', '/v1/generator/accounts/' + encodeURIComponent(a.id) + '/brand');
  }));
  const catalogNotice = h('p', {
    class: 'studio-model-catalog-note',
    role: 'status'
  });
  async function loadGeminiCatalog(refresh = false) {
    if (!config.keys.some(k => k.provider === 'gemini')) return;
    try {
      const catalog = await api('GET', '/v1/generator/providers/gemini/models' + (refresh ? '?refresh=true' : ''));
      config.providers.gemini = {
        ...config.providers.gemini,
        ...catalog
      };
      catalogNotice.textContent = t("ui.copy.0219");
    } catch (e) {
      catalogNotice.textContent = t("ui.copy.0220") + errMsg(e);
    }
  }
  await loadGeminiCatalog();
  let studio,
    storyContext = null,
    lastStoryJob = null,
    campaignRun = null,
    campaignRuns = [];
  const labels = {
    concept: t("agent.concept"),
    revision: t("agent.revision"),
    image: t("agent.image"),
    final: t("agent.final"),
    storyteller: t("agent.storyteller"),
    manager: t("agent.manager"),
    scheduler: t("agent.scheduler"),
    visual: t("agent.visual")
  };
  const phaseNames = {
    concept_review: t("ui.copy.0157"),
    planned: t("ui.copy.0158"),
    approved: t("ui.copy.0221"),
    queued: t("ui.copy.0004"),
    running: t("ui.sweep.20"),
    review: t("ui.sweep.27"),
    failed: t("draft.tab.action"),
    cancelled: t("ui.copy.0006"),
    drafted: t("ui.copy.0159")
  };
  const inputs = {},
    selected = new Set();
  const accountBox = h('div', {
    class: 'acc-picker generator-account-row'
  });
  const accountSummary = h('span', {
    class: 'generator-account-summary'
  });
  const accountPicker = h('section', {
    class: 'panel generator-account-picker'
  }, h('summary', {}, h('b', {}, t("ui.copy.0222")), accountSummary));
  const requestedAccount = new URLSearchParams(location.hash.split('?')[1] || '').get('story_account');
  if (state.accounts.some(a => a.id === requestedAccount && a.status === 'active')) selected.add(requestedAccount);
  const company = h('select', {
    'aria-label': t("ui.copy.0223"),
    onchange: drawAccounts
  }, h('option', {
    value: ''
  }, t("scope.company.all")), companyGroups().filter(c => c.accounts.length).map(c => h('option', {
    value: c.id || 'none'
  }, c.name)));
  function summarizeAccounts() {
    const chosen = state.accounts.filter(a => selected.has(a.id));
    accountSummary.textContent = chosen.length ? chosen.slice(0, 3).map(a => '@' + a.username).join(', ') + (chosen.length > 3 ? ` +${chosen.length - 3}` : '') : t("ui.copy.0224");
    accountSummary.title = chosen.map(a => '@' + a.username).join(', ');
    studio?.update();
  }
  function drawAccounts() {
    const visible = state.accounts.filter(a => a.status === 'active' && (!company.value || (a.company_id || 'none') === company.value));
    for (const id of selected) if (!visible.some(a => a.id === id)) selected.delete(id);
    const picker = ui.accountPicker({
      accounts: visible,
      selected: [...selected],
      readiness: id => ui.readiness(id),
      onChange: ids => {
        selected.clear();
        ids.forEach(id => selected.add(id));
        summarizeAccounts();
      }
    });
    accountBox.replaceChildren(picker.element);
    summarizeAccounts();
  }
  company.addEventListener('change', () => {
    selected.clear();
    for (const a of state.accounts) if (a.status === 'active' && (!company.value || (a.company_id || 'none') === company.value)) selected.add(a.id);
    drawAccounts();
  });
  drawAccounts();
  accountPicker.replaceChildren(h('label', {
    class: 'ui-field'
  }, t('ui.copy.0196'), company), accountBox);
  const agentCards = Object.entries(labels).map(([role, name], i) => {
    const savedAgent = config.agents?.[role] || {};
    const fallbackProvider = role === 'image' ? Object.keys(config.providers).find(id => config.providers[id].image) : 'openai';
    const providerId = config.providers[savedAgent.provider] && (role !== 'image' || config.providers[savedAgent.provider].image) ? savedAgent.provider : fallbackProvider;
    const agent = {
      provider: providerId,
      model: (savedAgent.provider === providerId ? savedAgent.model : '') || config.providers[providerId][role === 'image' ? 'imageModel' : 'textModel'],
      instructions: savedAgent.instructions || ''
    };
    const model = h('select', {
      'aria-label': t("ui.sweep.28", {
        "0": name
      })
    });
    const help = h('p', {
      class: 'faint small generator-model-help'
    });
    function drawModels(providerId, preferred) {
      const p = config.providers[providerId];
      const options = p[role === 'image' ? 'imageModels' : 'textModels'] || [];
      const fallback = role === 'image' ? p.imageModel : p.textModel;
      const available = [...options];
      if (preferred && !p.live && !available.some(m => m.id === preferred)) available.push({
        id: preferred,
        name: t('models.saved', {
          model: preferred
        })
      });
      model.replaceChildren(...available.map(m => h('option', {
        value: m.id,
        selected: m.id === (preferred || fallback)
      }, m.name)));
      const missing = preferred && p.live && !available.some(m => m.id === preferred);
      help.textContent = (missing ? t("ui.copy.0230", {
        "0": preferred
      }) : '') + (role === 'image' ? t("ui.copy.0231") : t("ui.copy.0232"));
    }
    drawModels(agent.provider, agent.model);
    const prompt = h('textarea', {
      'aria-label': t("ui.sweep.29", {
        "0": name
      }),
      maxlength: 4000
    }, agent.instructions);
    const provider = h('select', {
      'aria-label': t("ui.sweep.30", {
        "0": name
      }),
      onchange: () => drawModels(provider.value)
    }, Object.entries(config.providers).filter(([, p]) => role !== 'image' || p.image).map(([id, p]) => h('option', {
      value: id,
      selected: agent.provider === id
    }, p.name)));
    inputs[role] = {
      provider,
      model,
      prompt,
      drawModels
    };
    return h('div', {
      class: 'gen-agent'
    }, h('span', {
      class: 'gen-number'
    }, String(i + 1)), h('h3', {}, name), h('p', {
      class: 'muted small'
    }, [t("ui.copy.0233"), t("ui.sweep.31"), t("ui.copy.0234"), t("ui.copy.0235"), t("ui.copy.0236"), t("ui.copy.0237"), t("ui.copy.0238"), t("ui.copy.0239")][i]), h('label', {}, t("ui.extra.35"), provider), h('label', {}, t("ui.extra.36"), model), help, h('details', {}, h('summary', {}, t("ui.extra.37")), prompt));
  });
  const collectAgents = () => Object.fromEntries(Object.entries(inputs).map(([r, v]) => [r, {
    provider: v.provider.value,
    model: v.model.value.trim(),
    instructions: v.prompt.value
  }]));
  state.costAgents = collectAgents;
  const batches = {
    runs: {},
    plans: {}
  };
  async function submitForAccounts(kind, body) {
    if (!body.brief?.trim()) {
      brief.setAttribute('aria-invalid', 'true');
      brief.focus();
      throw uiError(t("ui.copy.0240"));
    }
    const targets = [...selected].sort();
    if (!targets.length) {
      accountPicker.open = true;
      accountPicker.querySelector('button')?.focus();
      throw uiError(t("ui.copy.0241"));
    }
    const bodies = [];
    for (const aid of targets) {
      const a = state.accounts.find(a => a.id === aid);
      const kit = a?.platform === 'instagram' ? await api('GET', `/v1/generator/accounts/${encodeURIComponent(aid)}/brand`) : {
        assets: [],
        brand_notes: ''
      };
      const assets = [...kit.assets.filter(x => x.category === 'logo').slice(0, 1), ...kit.assets.filter(x => x.category === 'visual').slice(0, 1), ...kit.assets.filter(x => x.category === 'product').slice(0, 2)];
      state.brandProfiles[aid] = kit;
      bodies.push({
        ...body,
        account_ids: [aid],
        reference_media_ids: assets.map(x => x.media_id),
        reference_roles: Object.fromEntries(assets.map(x => [x.media_id, x.category])),
        reference_notes: kit.brand_notes || ''
      });
    }
    const batch = batches[kind],
      signature = JSON.stringify(bodies);
    if (batch.signature !== signature) {
      batch.signature = signature;
      batch.id = crypto.randomUUID();
    }
    const results = [];
    try {
      for (let i = 0; i < bodies.length; i++) results.push(await api('POST', '/v1/generator/' + kind, {
        ...bodies[i],
        request_id: batch.id + '-' + i
      }));
    } catch (e) {
      throw new Error((results.length ? t("ui.copy.0242", {
        "0": results.length
      }) : '') + errMsg(e));
    }
    batch.signature = '';
    return results;
  }
  const brief = h('textarea', {
    oninput: () => {
      briefPreview.textContent = brief.value || t("ui.copy.0243");
      brief.removeAttribute('aria-invalid');
      campaignError.hidden = true;
    },
    'aria-label': t("ui.extra.38"),
    placeholder: t("ui.copy.0244"),
    maxlength: 10000,
    rows: 5
  });
  const count = h('input', {
    type: 'number',
    min: 1,
    max: 10,
    value: 1,
    'aria-label': t("ui.copy.0245")
  });
  const tomorrow = new Date(Date.now() + 864e5 + 7 * 3600000).toISOString().slice(0, 10);
  const until = new Date(Date.now() + 14 * 864e5 + 7 * 3600000).toISOString().slice(0, 10);
  const fromDate = h('input', {
    type: 'date',
    value: tomorrow,
    'aria-label': t("ui.copy.0246")
  });
  const endDate = h('input', {
    type: 'date',
    value: until,
    'aria-label': t("ui.extra.39")
  });
  const totalContents = h('input', {
    type: 'number',
    min: 1,
    max: 30,
    value: 12,
    'aria-label': t("ui.copy.0247")
  });
  const postTimes = h('input', {
    value: '12:15, 19:15',
    'aria-label': t("ui.copy.0248")
  });
  const planningMode = h('select', {
    'aria-label': t("ui.extra.40")
  }, h('option', {
    value: 'ai'
  }, t("ui.copy.0249")), h('option', {
    value: 'manual'
  }, t("ui.copy.0250")));
  const briefPreview = h('p', {
    class: 'muted small'
  }, t("ui.copy.0243"));
  const campaignError = h('p', {
    class: 'err-box',
    role: 'alert',
    hidden: true
  });
  const planButton = h('button', {
    class: 'btn primary',
    onclick: async e => {
      e.currentTarget.disabled = true;
      try {
        campaignError.hidden = true;
        const body = {
          brief: brief.value,
          content_count: Number(totalContents.value),
          slide_count: Number(count.value),
          start_date: fromDate.value,
          end_date: endDate.value,
          times: postTimes.value.split(',').map(_targetValue12 => _targetValue12.trim()).filter(Boolean),
          manual: planningMode.value === 'manual',
          produce_media: planningMode.value !== 'manual',
          confirm_cost: true,
          agents: collectAgents()
        };
        if (!body.manual && !(await askCost(t('gen.preflight.title', {
          title: sessionTitle({
            brief: brief.value
          })
        }), collectAgents()))) return;
        const results = await submitForAccounts('plans', body);
        go('/generator/drafts?' + (results.length === 1 ? 'plan=' + results[0].id : 'plans=' + results.map(r => r.id).join(',')));
      } catch (error) {
        campaignError.textContent = errMsg(error);
        campaignError.hidden = false;
      } finally {
        e.target.disabled = false;
      }
    }
  }, t("ui.copy.0251"));
  const planner = h('div', {
    class: 'gen-planner'
  }, h('p', {
    class: 'muted small'
  }, t("ui.copy.0252")), h('div', {
    class: 'gen-form-row'
  }, h('label', {}, t("ui.copy.0253"), totalContents), h('label', {}, t("ui.copy.0254"), count), h('label', {}, t("ui.copy.0255"), fromDate), h('label', {}, t("ui.copy.0256"), endDate)), h('div', {
    class: 'gen-form-row'
  }, h('label', {}, t("ui.copy.0257"), postTimes)), h('p', {
    class: 'faint small'
  }, t("ui.copy.0258")));
  const history = h('div', {
      class: 'gen-history'
    }),
    detail = h('div', {
      class: 'gen-detail'
    });
  const campaignActivity = h('div', {
      class: 'studio-campaign-activity'
    }),
    campaignOutput = h('section', {
      class: 'studio-campaign-output',
      hidden: true
    }, campaignActivity, detail);
  let workflow;
  let selectedId = new URLSearchParams(location.hash.split('?')[1] || '').get('id');
  let lastSignature = '',
    stopped = false,
    fetching = false;
  const captions = {},
    slides = {};
  const action = (text, fn, danger = false) => h('button', {
    class: `btn ${danger ? 'danger' : ''}`,
    onclick: async e => {
      e.currentTarget.disabled = true;
      try {
        await fn();
        lastSignature = '';
        await refresh();
      } catch (error) {
        toast(errMsg(error), true);
      } finally {
        e.target.disabled = false;
      }
    }
  }, text);
  function drawRun(r) {
    campaignRun = r;
    if (studio?.mode() === 'campaign') workflow?.setRun(r);
    const index = Math.min(slides[r.id] || 0, Math.max(0, r.media.length - 1));
    const image = r.media[index];
    const acc = state.accounts.find(a => a.id === r.targets[0]?.account_id);
    const caption = h('textarea', {
      'aria-label': t("ui.extra.41"),
      maxlength: 2200,
      oninput: e => {
        captions[r.id] = e.target.value;
      }
    }, captions[r.id] ?? r.caption);
    replaceContent(detail, h('div', {
      class: 'panel'
    }, h('div', {
      class: 'row'
    }, h('h2', {}, t("ui.copy.0259")), h('a', {
      class: 'btn sm',
      href: '#/generator/drafts?id=' + r.id
    }, t("ui.copy.0260")), h('span', {
      class: 'spacer'
    }), h('span', {
      class: 'pill'
    }, phaseNames[r.status])), h('p', {
      class: 'gen-brief'
    }, r.brief), agentActivity(r), h('div', {
      class: 'gen-flow'
    }, Object.entries(labels).map(([role, name]) => {
      const step = r.steps[role];
      const output = step?.output;
      return h('div', {
        class: `gen-stage ${step?.status || ''}`
      }, h('b', {}, name), h('span', {
        class: 'small muted'
      }, r.agents?.[role] ? `${r.agents[role].provider} · ${r.agents[role].model}` : t("ui.copy.0261")), h('span', {}, step?.status === 'done' ? t("draft.state.done") : step?.status === 'running' ? r.status === 'failed' ? 'Terhenti' : t("ui.copy.0135") : t("ui.copy.0004")), role === 'image' && step ? h('small', {}, `${step.completed_slides || 0}/${r.slide_count} slide`) : null, output ? h('details', {}, h('summary', {}, t("ui.copy.0262")), h('pre', {}, typeof output === 'string' ? output : JSON.stringify(output, null, 2)), step.usage ? h('pre', {
        class: 'faint small'
      }, JSON.stringify(step.usage, null, 2)) : null) : null);
    })), conceptReviewPanel(r, async concept => {
      await api('POST', `/v1/generator/runs/${r.id}/approve-concept`, {
        concept,
        confirm_cost: true
      });
      lastSignature = '';
      await refresh();
    }), r.error ? technicalError(r.error) : null, h('div', {
      class: 'row'
    }, r.status === 'failed' ? action(t("ui.copy.0263"), async () => {
      if (await askCost(t("ui.copy.0264"), r.agents)) await api('POST', `/v1/generator/runs/${r.id}/retry`);
    }) : null, ['queued', 'running', 'concept_review', 'review', 'failed'].includes(r.status) ? action(t("common.cancel"), async () => {
      if (await confirmDialog({
        title: t("ui.copy.0265"),
        body: t("dialog.danger.note"),
        tone: "danger",
        confirmLabel: t("dialog.confirm")
      })) await api('DELETE', `/v1/generator/runs/${r.id}`);
    }, true) : null)), image ? h('div', {
      class: 'gen-review-grid'
    }, h('div', {
      class: 'pv instagram gen-feed'
    }, h('div', {
      class: 'hd'
    }, acc ? avatar(acc) : null, acc?.username || t("ui.copy.0089")), h('div', {
      class: 'img'
    }, image.url ? image.type === 'video' ? h('video', {
      src: image.url,
      controls: true,
      preload: 'metadata'
    }) : h('img', {
      src: image.url,
      alt: `Slide ${index + 1}`
    }) : t("ui.copy.0164")), h('div', {
      class: 'row gen-slide-controls'
    }, action('‹', () => {
      slides[r.id] = (index + r.media.length - 1) % r.media.length;
      drawRun(r);
    }), h('span', {}, `${index + 1}/${r.media.length}`), action('›', () => {
      slides[r.id] = (index + 1) % r.media.length;
      drawRun(r);
    })), h('div', {
      class: 'cap'
    }, h('b', {}, acc?.username || ''), r.caption)), h('div', {
      class: 'panel'
    }, h('h2', {}, t("ui.extra.42")), h('p', {
      class: 'muted small'
    }, t("ui.copy.0266")), caption, r.steps.final?.output ? h('div', {
      class: 'gen-findings'
    }, r.steps.final.output) : null, r.status === 'review' ? action(t("draft.send.compose"), async () => {
      const d = await api('POST', `/v1/generator/runs/${r.id}/draft`, {
        content: caption.value
      });
      go('/compose?ai_draft=' + d.draft_id);
    }) : null, r.draft_id ? h('a', {
      class: 'btn primary',
      href: '#/compose?ai_draft=' + r.draft_id
    }, t("ui.copy.0267")) : null)) : null);
  }
  async function refresh() {
    if (stopped || fetching) return;
    fetching = true;
    try {
      const {
        data
      } = await api('GET', '/v1/generator/runs');
      if (stopped) return;
      history.replaceChildren(h('h3', {}, t("ui.extra.43")), ...data.map(r => h('button', {
        class: `gen-history-item ${selectedId === r.id ? 'on' : ''}`,
        onclick: () => {
          selectedId = r.id;
          lastSignature = '';
          refresh();
        }
      }, h('b', {}, r.brief.slice(0, 75)), h('small', {}, `${phaseNames[r.status]} · ${fmtDT(r.created_at)}`))));
      campaignRuns = data;
      studio?.setCampaignRun(campaignRun, data);
      if (studio?.mode() === 'storyline' && lastStoryJob) {
        const child = data.find(r => r.story_job_id === lastStoryJob.id);
        if (child) workflow.setRun(child);
      }
      const r = selectedId ? data.find(r => r.id === selectedId) : null;
      campaignOutput.hidden = !r;
      if (r) {
        selectedId = r.id;
        const signature = JSON.stringify(r);
        if (lastSignature !== signature) {
          lastSignature = signature;
          drawRun(r);
        }
      } else detail.replaceChildren(h('div', {
        class: 'panel empty'
      }, t("ui.copy.0268")));
    } catch (error) {
      if (!stopped) toast(errMsg(error), true);
    } finally {
      fetching = false;
    }
  }
  const briefNode = h('section', {
    class: 'gen-start'
  }, briefPreview, h('button', {
    class: 'btn',
    onclick: () => studio.editBrief()
  }, t("ui.extra.44")));
  const campaign = h('div', {
    class: 'studio-campaign'
  }, h('section', {
    class: 'panel studio-campaign-form'
  }, h('h2', {}, t("ui.copy.0269")), h('p', {
    class: 'studio-editor-description'
  }, t("ui.copy.0270")), h('label', {}, t("ui.copy.0271"), brief), campaignError, h('div', {
    class: 'studio-campaign-options'
  }, h('details', {}, h('summary', {}, t("ui.extra.45")), h('label', {}, t("ui.copy.0272"), planningMode)), h('div', {
    class: 'studio-primary-action'
  }, planButton, h('p', {
    class: 'faint small'
  }, t("ui.copy.0273"))))), campaignOutput);
  const scheduleSummary = h('span', {
    class: 'generator-schedule-summary'
  });
  const scheduleNode = h('details', {
    class: 'panel generator-schedule-picker'
  }, h('summary', {}, h('b', {}, t("compose.schedule")), scheduleSummary), planner, h('button', {
    class: 'btn sm',
    onclick: () => {
      scheduleNode.open = false;
      scheduleNode.querySelector('summary').focus();
    }
  }, t("ui.copy.0274")));
  function summarizeSchedule() {
    const date = value => value ? new Date(value + 'T00:00:00+07:00').toLocaleDateString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: 'numeric',
      month: 'short'
    }) : t("ui.copy.0275");
    scheduleSummary.textContent = t("ui.copy.0276", {
      "0": totalContents.value,
      "1": date(fromDate.value),
      "2": date(endDate.value)
    });
  }
  for (const field of [totalContents, count, fromDate, endDate, postTimes]) field.addEventListener('input', () => {
    summarizeSchedule();
    studio?.update();
  });
  summarizeSchedule();
  workflow = workflowCanvas({
    h,
    icon,
    userId: state.user.id,
    history,
    actions: [h('a', {
      class: 'btn sm',
      href: '#/settings'
    }, t("ui.copy.0277")), action(t("ui.copy.0278"), async () => {
      await loadGeminiCatalog(true);
      for (const v of Object.values(inputs)) if (v.provider.value === 'gemini') v.drawModels('gemini', v.model.value);
    }), action(t("ui.copy.0279"), async () => {
      const saved = await api('PUT', '/v1/generator/settings', {
        agents: collectAgents()
      });
      config = {
        ...saved,
        providers: config.providers
      };
      toast(t("ui.sweep.32"));
    }), h('button', {
      class: 'btn sm',
      onclick: () => workflow.focusNode('result')
    }, t("ui.extra.46")), h('a', {
      class: 'btn sm',
      href: '#/generator/drafts'
    }, t("draft.title"))],
    nodes: [{
      id: 'brief',
      title: t("ui.extra.47"),
      subtitle: t("ui.copy.0280"),
      x: 40,
      y: 80,
      width: 330,
      color: '#b899cb',
      content: briefNode
    }, {
      id: 'concept',
      role: 'concept',
      title: t("agent.concept"),
      x: 460,
      y: 80,
      width: 295,
      color: '#88b7d1',
      content: agentCards[0]
    }, {
      id: 'revision',
      role: 'revision',
      title: t("agent.revision"),
      x: 835,
      y: 80,
      width: 295,
      color: '#b7a1d1',
      content: agentCards[1]
    }, {
      id: 'visual',
      role: 'visual',
      title: t("agent.visual"),
      x: 1210,
      y: 80,
      width: 300,
      color: '#92b6b0',
      content: agentCards[7]
    }, {
      id: 'image',
      role: 'image',
      title: t("agent.image"),
      x: 1585,
      y: 80,
      width: 310,
      color: '#d0ad77',
      content: agentCards[2]
    }, {
      id: 'final',
      role: 'final',
      title: t("agent.final"),
      x: 1975,
      y: 80,
      width: 300,
      color: '#8ebd9e',
      content: agentCards[3]
    }, {
      id: 'result',
      title: t("ui.extra.48"),
      x: 2365,
      y: 80,
      width: 470,
      color: '#91b0c8',
      content: h('div', {}, h('p', {
        class: 'muted small'
      }, t("ui.copy.0281")), h('button', {
        class: 'btn',
        onclick: () => {
          studio.chooseMode('campaign');
          campaignOutput.scrollIntoView({
            block: 'start'
          });
        }
      }, t("ui.copy.0282")))
    }, {
      id: 'storyteller',
      role: 'storyteller',
      title: t("agent.storyteller"),
      subtitle: t("ui.sweep.33"),
      x: 40,
      y: 650,
      width: 330,
      color: '#aabbd9',
      content: agentCards[4]
    }, {
      id: 'manager',
      role: 'manager',
      title: t("agent.manager"),
      subtitle: t("ui.sweep.34"),
      x: 460,
      y: 650,
      width: 310,
      color: '#91bdad',
      content: agentCards[5]
    }, {
      id: 'scheduler',
      role: 'scheduler',
      title: t("agent.scheduler"),
      subtitle: t("ui.copy.0283"),
      x: 835,
      y: 650,
      width: 310,
      color: '#b9afd6',
      content: agentCards[6]
    }],
    edges: [{
      from: 'brief',
      to: 'concept'
    }, {
      from: 'concept',
      to: 'revision'
    }, {
      from: 'revision',
      to: 'visual'
    }, {
      from: 'visual',
      to: 'image'
    }, {
      from: 'image',
      to: 'final'
    }, {
      from: 'final',
      to: 'result'
    }, {
      from: 'brief',
      to: 'storyteller'
    }, {
      from: 'storyteller',
      to: 'manager'
    }, {
      from: 'manager',
      to: 'scheduler'
    }, {
      from: 'scheduler',
      to: 'concept'
    }]
  });
  await refresh();
  const showStoryWorkflow = j => {
    lastStoryJob = j;
    if (!studio || studio.mode() === 'storyline') workflow.setRun(j ? {
      ...j,
      story_job_id: j.id,
      agents: collectAgents(),
      media: []
    } : null);
  };
  const story = await storyWorkspace({
    accountPickerFactory: ui.accountPicker,
    h,
    api,
    uploadFile,
    confirmDialog,
    inputDialog,
    icon,
    errMsg,
    technicalError,
    accounts: state.accounts.filter(a => a.platform === 'instagram' && a.status === 'active'),
    mode: 'production',
    agents: collectAgents,
    dates: {
      count: totalContents,
      slides: count,
      from: fromDate,
      until: endDate,
      times: postTimes
    },
    toast,
    fmtDT,
    onContext: value => {
      storyContext = value;
      if (value.account) {
        state.brandProfiles[value.account.id] = value.profile;
        drawAccounts();
      }
      studio?.setStoryContext(value);
    },
    onJob: showStoryWorkflow
  });
  studio = generatorStudio({
    h,
    icon,
    story,
    campaign,
    accountPicker,
    schedule: scheduleNode,
    workflow,
    keyCount: config.keys.length,
    getSelected: () => state.accounts.filter(a => selected.has(a.id)),
    getSchedule: () => ({
      count: totalContents.value,
      slides: count.value,
      from: fromDate.value,
      until: endDate.value,
      times: postTimes.value
    }),
    onEditBrief: () => brief.focus(),
    onMode: mode => {
      if (mode === 'campaign') workflow.setRun(campaignRun);else showStoryWorkflow(lastStoryJob);
    }
  });
  studio.element.querySelector('.studio-agents').insertBefore(catalogNotice, workflow.element);
  if (storyContext) studio.setStoryContext(storyContext);
  studio.setCampaignRun(campaignRun, campaignRuns);
  if (new URLSearchParams(location.hash.split('?')[1] || '').has('id')) studio.chooseMode('campaign');
  const timer = setInterval(refresh, 2500);
  pageCleanup = () => {
    stopped = true;
    clearInterval(timer);
    workflow.dispose();
    story.dispose();
    studio.dispose();
  };
  return shell('/generator', h('div', {
    class: 'generator-node-page'
  }, pagehead(t("gen.title"), t("ui.copy.0284"), h('a', {
    class: 'btn',
    href: '#/generator/drafts'
  }, icon('doc'), t("draft.title"))), studio.element));
}

// ---------------- calendar ----------------
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const startOfDay = d => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const mondayOf = d => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
async function pageCalendar() {
  await loadAccounts();
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const scope = ui.scopeBar({
    page: 'calendar',
    views: [{
      id: 'month',
      label: t('view.month')
    }, {
      id: 'week',
      label: t('view.week')
    }, {
      id: '3day',
      label: t('ui.copy.0290')
    }, {
      id: "list",
      label: t("view.list")
    }],
    onChange: () => route()
  });
  const view = q.get('view') || q.get('v') || scope.view() || 'month';
  const accounts = scope.accounts(),
    allowedIds = new Set(accounts.map(a => a.id));
  const calendarUrl = (patch = {}) => {
    const next = new URLSearchParams(q);
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    return `/calendar?${next}`;
  };
  const linkAttrs = p => {
    const links = p.targets.filter(_targetValue13 => _targetValue13.status === 'published' && _targetValue13.permalink);
    if (links.length === 1) return {
      href: links[0].permalink,
      target: '_blank',
      rel: 'noopener noreferrer',
      title: t("ui.copy.0285")
    };
    if (links.length > 1) return {
      href: `#/posts/${p.id}`,
      onclick: e => {
        e.preventDefault();
        e.stopPropagation();
        const dialog = modal(t("ui.copy.0286"), h('div', {
          class: 'list'
        }, links.map(_targetValue14 => h('a', {
          class: 'item',
          href: _targetValue14.permalink,
          target: '_blank',
          rel: 'noopener noreferrer'
        }, `@${_targetValue14.username} · ${PLAT[_targetValue14.platform]} ↗`))), [h('a', {
          class: 'btn',
          href: `#/posts/${p.id}`
        }, t("ui.extra.49"))]);
        dialog.querySelector('a[href^="#"]').addEventListener('click', () => dialog.close());
      }
    };
    return {
      href: `#/posts/${p.id}`,
      title: t("ui.copy.0287")
    };
  };
  const anchor = q.get('d') ? new Date(`${q.get('d')}T00:00:00`) : new Date();
  let start, end, label;
  if (view === 'month') {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    start = mondayOf(first);
    end = addDays(start, 42);
    label = first.toLocaleDateString('id-ID', {
      timeZone: 'Asia/Jakarta',
      month: 'long',
      year: 'numeric'
    });
  } else if (view === '3day') {
    start = startOfDay(anchor);
    end = addDays(start, 3);
    label = `${start.toLocaleDateString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: 'numeric',
      month: 'short'
    })} – ${addDays(end, -1).toLocaleDateString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })}`;
  } else {
    start = mondayOf(anchor);
    end = addDays(start, 7);
    label = `${start.toLocaleDateString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: 'numeric',
      month: 'short'
    })} – ${addDays(end, -1).toLocaleDateString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })}`;
  }
  const response = await api('GET', `/v1/calendar?from=${start.toISOString()}&to=${end.toISOString()}`);
  const data = response.data.map(p => ({
    ...p,
    targets: p.targets.filter(_targetValue15 => allowedIds.has(_targetValue15.account_id))
  })).filter(p => p.targets.length);
  const step = view === 'month' ? null : view === '3day' ? 3 : 7;
  const nav = dir => {
    let d;
    if (!dir) d = new Date();else if (view === 'month') d = new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);else d = addDays(anchor, dir * step);
    go(calendarUrl({
      v: view,
      d: ymd(d)
    }));
  };
  const today = startOfDay(new Date()).getTime();
  const at = p => new Date(p.scheduled_at || p.created_at);
  const dayPosts = d => data.filter(p => startOfDay(at(p)).getTime() === d.getTime());
  const createAt = d => {
    const x = new Date(d);
    x.setHours(9, 0, 0, 0);
    if (x < new Date()) {
      x.setTime(Date.now() + 3600_000);
      x.setMinutes(0, 0, 0);
    }
    return `/compose?at=${encodeURIComponent(x.toISOString())}`;
  };
  const ev = p => h('a', {
    class: `ev ${p.status}`,
    ...linkAttrs(p),
    onclick: e => {
      e.stopPropagation();
      linkAttrs(p).onclick?.(e);
    }
  }, h('time', {}, fmtTime(at(p).toISOString())), h('span', {
    class: 't'
  }, p.content || '(media)'), h('span', {
    class: 'icons'
  }, [...new Set(p.targets.map(_targetValue16 => _targetValue16.platform))].map(icon)));
  let body;
  if (view === 'list') {
    body = data.length ? postList(data, linkAttrs) : h('div', {
      class: 'list empty'
    }, t("ui.copy.0288"));
  } else if (view === 'month') {
    const cells = [...Array(42)].map((_, i) => addDays(start, i));
    body = h('div', {
      class: 'month'
    }, ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(d => t('weekday.' + d)).map(d => h('div', {
      class: 'mh'
    }, d)), cells.map(d => {
      const ps = dayPosts(d);
      const past = d.getTime() < today;
      const other = d.getMonth() !== anchor.getMonth();
      return h('div', {
        class: `mc ${other ? 'other' : ''} ${d.getTime() === today ? 'today' : ''} ${past ? 'past' : ''}`,
        role: past ? null : 'button',
        tabindex: past ? null : 0,
        title: past ? null : t("ui.copy.0289", {
          "0": d.getDate()
        }),
        onclick: past ? null : () => go(createAt(d)),
        onkeydown: past ? null : e => {
          if (e.key === 'Enter' && e.target === e.currentTarget) go(createAt(d));
        }
      }, h('div', {
        class: 'mn'
      }, d.getDate()), ps.slice(0, 3).map(ev), ps.length > 3 ? h('a', {
        class: 'more',
        href: '#' + calendarUrl({
          v: '3day',
          d: ymd(d)
        }),
        onclick: e => e.stopPropagation()
      }, t("ui.sweep.35", {
        "0": ps.length - 3
      })) : null);
    }));
  } else {
    const days = [...Array(step)].map((_, i) => addDays(start, i));
    body = h('div', {
      class: 'cal',
      style: {
        gridTemplateColumns: `repeat(${step}, minmax(0, 1fr))`
      }
    }, days.map(d => {
      const past = d.getTime() < today;
      return h('div', {
        class: `day ${d.getTime() === today ? 'today' : ''}`
      }, h('div', {
        class: 'dh'
      }, d.toLocaleDateString('id-ID', {
        timeZone: 'Asia/Jakarta',
        weekday: 'short'
      }), h('b', {}, d.getDate()), !past ? h('a', {
        class: 'add-day',
        href: `#${createAt(d)}`,
        'aria-label': t("ui.copy.0289", {
          "0": d.getDate()
        })
      }, icon("plus")) : null), dayPosts(d).map(ev));
    }));
  }
  return shell('/calendar', h('div', {}, pagehead(t("cal.title"), label, h('button', {
    class: 'btn',
    onclick: () => nav(-1),
    'aria-label': t("ui.extra.50")
  }, icon("chevron-left")), h('button', {
    class: 'btn',
    onclick: () => nav(0)
  }, t("cal.today")), h('button', {
    class: 'btn',
    onclick: () => nav(1),
    'aria-label': t("ui.extra.51")
  }, icon("chevron-right")), h('a', {
    class: 'btn primary',
    href: '#/compose'
  }, t("ui.copy.0291"))), scope.element, body, view === 'month' ? h('p', {
    class: 'faint small',
    style: {
      marginTop: '10px'
    }
  }, t("ui.copy.0294")) : null));
}

// ---------------- inbox ----------------
async function pageInbox() {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const filter = q.get('f') || 'unreplied';
  const acc = q.get('a') || '';
  await loadAccounts();
  const scope = ui.scopeBar({
    page: 'comments',
    views: [{
      id: 'post',
      label: 'Per post'
    }, {
      id: 'latest',
      label: 'Terbaru'
    }, {
      id: 'account',
      label: 'Per akun'
    }],
    onChange: () => route()
  });
  const group = scope.view() !== 'latest';
  const setQ = (k, v) => {
    const n = new URLSearchParams(q);
    v ? n.set(k, v) : n.delete(k);
    go(`/inbox?${n}`);
  };
  const listWrap = h('div');
  async function draw() {
    const [{
      data: rawData
    }, all] = await Promise.all([api('GET', `/v1/comments?reply_status=${filter}&limit=100${acc ? `&account_id=${acc}` : ''}`), api('GET', `/v1/comments?reply_status=all&include_own=true&limit=100${acc ? `&account_id=${acc}` : ''}`)]);
    const data = rawData.filter(scope.inScope);
    const repliesOf = c => all.data.filter(x => x.parent_id === c.id && x.from_self);
    const row = c => {
      const accnt = state.accounts.find(a => a.id === c.account_id);
      const reply = h('textarea', {
        placeholder: t("ui.copy.0295", {
          "0": c.username
        }),
        'aria-label': t("ui.copy.0296", {
          "0": c.username
        }),
        onkeydown: e => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            sendBtn.click();
          }
        }
      });
      const sendBtn = h('button', {
        class: 'btn primary sm',
        onclick: async e => {
          if (!reply.value.trim()) return;
          e.currentTarget.disabled = true;
          try {
            await api('POST', `/v1/comments/${c.id}/reply`, {
              message: reply.value
            });
            toast(t("ui.copy.0297"));
            draw();
            live.refresh();
          } catch (err) {
            e.currentTarget.disabled = false;
            toast(errMsg(err), true);
          }
        }
      }, t("comments.reply"));
      const setStatus = async (st, msg, undoTo) => {
        await api('PATCH', `/v1/comments/${c.id}`, {
          reply_status: st
        });
        draw();
        live.refresh();
        if (msg) toast(msg, false, undoTo ? {
          label: 'Urungkan',
          fn: async () => {
            await api('PATCH', `/v1/comments/${c.id}`, {
              reply_status: undoTo
            });
            draw();
            live.refresh();
          }
        } : null);
      };
      return h('div', {
        class: `cmt ${c.hidden ? 'hidden' : ''}`
      }, accnt ? avatar(accnt) : null, h('div', {
        class: 'body',
        style: {
          flex: 1,
          minWidth: 0
        }
      }, h('div', {
        class: 'row'
      }, h('span', {
        class: 'who'
      }, `@${c.username}`), h('span', {
        class: 'faint small'
      }, t("ui.sweep.36", {
        "0": ago(c.commented_at),
        "1": c.account_username
      })), c.hidden ? h('span', {
        class: 'status'
      }, t("ui.extra.52")) : null, c.reply_status === 'ignored' ? h('span', {
        class: 'status'
      }, t("draft.state.done")) : null), h('div', {
        class: 'txt'
      }, c.text || ''), repliesOf(c).map(r => h('div', {
        class: 'replies'
      }, h('b', {}, t("ui.copy.0298")), r.text)), h('div', {
        class: 'reply-box'
      }, reply, sendBtn), h('div', {
        class: 'row',
        style: {
          marginTop: '6px'
        }
      }, c.reply_status !== 'ignored' ? h('button', {
        class: 'btn ghost sm',
        title: t("ui.copy.0299"),
        onclick: () => setStatus('ignored', t("ui.copy.0300"), c.reply_status)
      }, t("msg.done")) : h('button', {
        class: 'btn ghost sm',
        onclick: () => setStatus('unreplied')
      }, t("ui.copy.0301")), h('button', {
        class: 'btn ghost sm',
        onclick: async () => {
          try {
            await api('POST', `/v1/comments/${c.id}/hide`, {
              hidden: !c.hidden
            });
            toast(c.hidden ? t("ui.copy.0302") : t("ui.copy.0303"));
            draw();
          } catch (err) {
            toast(errMsg(err), true);
          }
        }
      }, c.hidden ? 'Tampilkan' : t("login.hide")), !group && c.post_id ? h('a', {
        class: 'btn ghost sm',
        href: `#/posts/${c.post_id}`
      }, t("ui.copy.0304")) : null, h('span', {
        class: 'faint small'
      }, t("ui.copy.0305")))));
    };
    if (!data.length) {
      listWrap.replaceChildren(h('div', {
        class: 'list empty'
      }, filter === 'unreplied' ? t("comments.empty") : t("ui.copy.0306")));
      return;
    }
    if (!group) {
      listWrap.replaceChildren(h('div', {
        class: 'list'
      }, data.map(row)));
      return;
    }
    const groups = new Map();
    for (const c of data) {
      const k = scope.view() === 'account' ? c.account_id : c.post_id || c.platform_media_id;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    }
    const posts = await Promise.all([...groups.keys()].map(k => k?.startsWith('p_') ? api('GET', `/v1/posts/${k}`).catch(() => null) : null));
    listWrap.replaceChildren(...[...groups.entries()].map(([k, cs], i) => {
      const p = posts[i];
      const m = p?.media?.[0];
      return h('div', {
        class: 'list',
        style: {
          marginBottom: '14px'
        }
      }, h(p ? 'a' : 'div', {
        class: 'item group-head',
        href: p ? `#/posts/${p.id}` : null
      }, m ? h('img', {
        class: 'thumb',
        src: m.url,
        alt: ''
      }) : h('div', {
        class: 'thumb'
      }), h('div', {
        class: 'body'
      }, h('div', {
        class: 'title'
      }, p?.content || t("ui.sweep.37")), h('div', {
        class: 'meta'
      }, t("ui.copy.0307", {
        "0": cs.length,
        "1": cs[0].account_username
      })))), cs.map(row));
    }));
  }
  await draw();
  const ownDispose = live.on(_targetValue17 => {
    if (_targetValue17 === 'comment.new' && document.activeElement?.tagName !== 'TEXTAREA') draw();
  });
  const rendered = shell('/inbox', h('div', {}, pagehead(t("comments.title"), t("ui.copy.0308"), h('div', {
    class: 'seg'
  }, [['unreplied', t("ui.copy.0309")], ['all', t("draft.tab.all")], ['hidden', t("ui.extra.52")]].map(([v, l]) => h('button', {
    class: filter === v ? 'on' : '',
    onclick: () => setQ('f', v)
  }, l))), h('button', {
    class: 'btn',
    onclick: async e => {
      e.currentTarget.disabled = true;
      const r = await api('POST', '/v1/comments/sync');
      toast(t("ui.copy.0310", {
        "0": r.synced
      }));
      route();
    }
  }, t("ui.copy.0311"))), listWrap));
  rendered.querySelector('.pagehead').after(scope.element);
  cleanupFor.set(rendered,ownDispose);
  return rendered;
}

// ---------------- messages (Instagram DM) ----------------
const drafts = {};
function waitBadge(c) {
  if (!c.needs_reply || c.waiting_minutes == null) return null;
  const m = c.waiting_minutes;
  const late = m >= Math.round((state.stats.overdue_threshold_seconds || 300) / 60);
  const txt = m < 1 ? t("ui.copy.0312") : m < 60 ? t("ui.sweep.1", {
    "0": m
  }) : m < 1440 ? t("ui.copy.0010", {
    "0": Math.floor(m / 60)
  }) : t("ui.copy.0339", {
    "0": Math.floor(m / 1440)
  });
  return h('span', {
    class: `wait ${late ? 'late' : ''}`,
    title: late ? t("ui.copy.0313") : t("ui.copy.0314")
  }, txt);
}
async function pageMessages(convId) {
  await loadAccounts();
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const filter = q.get('f') || 'all';
  const acc = q.get('a') || '';
  const scope = ui.scopeBar({
    page: 'messages',
    views: [],
    onChange: () => route()
  });
  const igAccounts = scope.accounts().filter(a => a.platform === 'instagram');
  let windowTimer;
  const customer = h('aside', {
    class: 'rd-customer-context'
  });
  const qs = (extra = {}) => {
    const n = new URLSearchParams(q);
    for (const [k, v] of Object.entries(extra)) v ? n.set(k, v) : n.delete(k);
    const _targetValue18 = n.toString();
    return _targetValue18 ? `?${_targetValue18}` : '';
  };
  const wrap = h('div', {
    class: `dm ${convId ? 'has-thread' : ''}`
  });
  const listEl = h('div', {
    class: 'dm-list'
  });
  const threadEl = h('div', {
    class: 'dm-thread'
  });
  const syncPanel = h('div', {
    style: {
      marginBottom: '12px'
    },
    'aria-live': 'polite'
  });
  wrap.append(listEl, threadEl, customer);
  async function drawSyncStatus() {
    try {
      const {
        data
      } = await api('GET', '/v1/messages/sync-status');
      syncPanel.replaceChildren(h('details', {
        class: 'rd-sync-details'
      }, h('summary', {}, 'Status sinkronisasi · ' + data.filter(a => scope.inScope(a) && ['error', 'empty'].includes(a.status)).length + ' akun perlu diperiksa'), h('div', {
        class: 'rd-diagnostics'
      }, ...data.filter(a => scope.inScope(a) && (!acc || a.account_id === acc)).map(a => h('div', {
        class: a.status === 'error' ? 'err-box' : 'faint small',
        style: {
          marginBottom: '6px'
        }
      }, h('b', {}, `@${a.username}: `), ['error', 'empty'].includes(a.status) ? a.message : a.last_success ? t("ui.copy.0315", {
        "0": fmtDT(a.last_success),
        "1": a.conversations_found ?? '?',
        "2": a.messages_stored ?? '?'
      }) : t("ui.copy.0316"), a.status === 'error' && ['permission_missing', 'account_expired'].includes(a.code) ? h('a', {
        class: 'btn sm',
        href: '/connect/instagram'
      }, t("ui.copy.0317")) : null)))));
    } catch (error) {
      syncPanel.replaceChildren(h('div', {
        class: 'err-box'
      }, errMsg(error)));
    }
  }
  async function drawList() {
    const {
      data: allConversations
    } = await api('GET', `/v1/conversations?filter=${filter}${acc ? `&account_id=${acc}` : ''}`);
    const data = allConversations.filter(scope.inScope);
    listEl.replaceChildren(...(data.length ? data.map(c => h('a', {
      class: `dm-row ${c.id === convId ? 'on' : ''}`,
      href: `#/messages/${c.id}${qs()}`
    }, h('span', {
      class: 'peer'
    }, initials(c.participant.username)), h('div', {
      class: 'body'
    }, h('div', {
      class: 'who'
    }, `@${c.participant.username || 'pengguna'}`), h('div', {
      class: 'prev'
    }, c.last_message.direction === 'out' ? t("ui.copy.0318") : '', c.last_message.text || ''), h('div', {
      class: 'faint small'
    }, t("ui.sweep.38", {
      "0": c.account_username
    }))), h('div', {
      style: {
        textAlign: 'right'
      }
    }, h('div', {
      class: 'faint small'
    }, ago(c.last_message.at)), waitBadge(c)))) : [h('div', {
      class: 'dm-empty'
    }, filter === 'needs_reply' ? t("ui.copy.0319") : t("ui.copy.0320"))]));
  }
  async function drawThread() {
    if (!convId) {
      threadEl.replaceChildren(h('div', {
        class: 'dm-empty'
      }, igAccounts.length ? t("ui.copy.0321") : t("ui.copy.0322")));
      return;
    }
    let c;
    try {
      c = await api('GET', `/v1/conversations/${convId}`);
    } catch (e) {
      threadEl.replaceChildren(h('div', {
        class: 'dm-empty'
      }, errMsg(e)));
      return;
    }
    if (!scope.inScope(c)) {
      threadEl.replaceChildren(h('div', {
        class: 'dm-empty'
      }, 'Percakapan di luar pilihan akun. Ubah filter untuk melihatnya.'));
      return;
    }
    const box = h('div', {
      class: 'dm-msgs'
    });
    for (const m of c.messages) {
      box.append(h('div', {
        class: `bubble ${m.direction}`
      }, m.text || (m.attachments?.length ? '[lampiran]' : '')), h('div', {
        class: `bubble-meta ${m.direction}`
      }, fmtDT(m.sent_at), m.sent_by ? ` · ${m.sent_by}` : ''));
    }
    const ta = h('textarea', {
      placeholder: t("ui.copy.0295", {
        "0": c.participant.username
      }),
      'aria-label': t("comments.reply"),
      oninput: e => {
        drafts[c.id] = e.target.value;
      },
      onkeydown: e => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          send();
        }
      }
    });
    ta.value = drafts[c.id] || '';
    const countdown = h('span', {
      class: 'ui-chip info',
      role: 'timer'
    });
    function updateWindow() {
      const left = Date.parse(c.reply_window_ends_at) - Date.now();
      const valid = Number.isFinite(left) && left > 0;
      countdown.textContent = valid ? 'Sisa balas ' + Math.floor(left / 3600000) + 'j ' + Math.floor(left % 3600000 / 60000) + 'm' : 'Jendela balas 24 jam ditutup';
      ta.disabled = !valid;
      sendBtn.disabled = !valid;
    }
    clearInterval(windowTimer);
    const sendBtn = h('button', {
      class: 'btn primary',
      onclick: () => send()
    }, t("msg.send"));
    updateWindow();
    windowTimer = setInterval(updateWindow, 30000);
    async function send() {
      const text = ta.value.trim();
      if (!text) return;
      sendBtn.disabled = true;
      try {
        await api('POST', `/v1/conversations/${c.id}/messages`, {
          text
        });
        drafts[c.id] = '';
        toast(t("ui.copy.0323"));
        await Promise.all([drawThread(), drawList()]);
        live.refresh();
      } catch (e) {
        sendBtn.disabled = false;
        toast(errMsg(e), true);
      }
    }
    threadEl.replaceChildren(h('div', {
      class: 'dm-head'
    }, h('a', {
      class: 'btn sm ghost mobile-only',
      href: `#/messages${qs()}`
    }, icon("chevron-left")), h('span', {
      class: 'peer'
    }, initials(c.participant.username)), h('div', {}, h('b', {}, `@${c.participant.username}`), h('div', {
      class: 'faint small'
    }, t("ui.sweep.39", {
      "0": c.account_username
    }))), waitBadge(c), h('span', {
      class: 'spacer'
    }), c.status === 'open' ? h('button', {
      class: 'btn sm',
      onclick: async () => {
        await api('PATCH', `/v1/conversations/${c.id}`, {
          status: 'done'
        });
        toast(t("ui.copy.0300"));
        drawList();
        drawThread();
        live.refresh();
      }
    }, t("msg.done")) : h('button', {
      class: 'btn sm',
      onclick: async () => {
        await api('PATCH', `/v1/conversations/${c.id}`, {
          status: 'open'
        });
        drawList();
        drawThread();
        live.refresh();
      }
    }, t("ui.copy.0324"))), box, c.can_reply ? h('div', {
      class: 'dm-compose'
    }, ta, sendBtn) : h('div', {
      class: 'dm-closed'
    }, t("ui.copy.0325")));
    customer.replaceChildren(h('h3', {}, c.participant.name || '@' + c.participant.username), h('p', {
      class: 'small muted'
    }, 'Melalui @' + c.account_username), h('p', {
      class: 'small muted'
    }, 'Pesan pelanggan ditampilkan apa adanya. Balasan hanya dalam 24 jam sejak pesan masuk terakhir.'));
    threadEl.querySelector('.dm-head')?.append(countdown);
    box.scrollTop = box.scrollHeight;
    if (c.can_reply && document.activeElement?.tagName !== 'TEXTAREA') ta.focus({
      preventScroll: true
    });
  }
  await Promise.all([drawList(), drawThread(), drawSyncStatus()]);
  const stopLive = live.on(_targetValue19 => {
    if (_targetValue19.startsWith('message.')) {
      drawList();
      if (document.activeElement?.tagName !== 'TEXTAREA') drawThread();
    }
  });
  const ownDispose = () => {
    stopLive();
    clearInterval(windowTimer);
  };
  const rendered = shell('/messages', h('div', {}, pagehead(t("msg.title"), t("ui.copy.0326"), h('div', {
    class: 'seg'
  }, [['needs_reply', t("ui.copy.0309")], ['all', t("draft.tab.all")], ['done', t("draft.state.done")]].map(([v, l]) => h('button', {
    class: filter === v ? 'on' : '',
    onclick: () => go(`/messages${qs({
      f: v
    })}`)
  }, l))), h('button', {
    class: 'btn',
    onclick: async e => {
      const button = e.currentTarget;
      button.disabled = true;
      try {
        const r = await api('POST', '/v1/messages/sync', acc ? {
          account_id: acc
        } : {});
        const empty = r.accounts?.filter(a => a.status === 'empty').length || 0;
        toast(r.errors?.length ? t("ui.copy.0328", {
          "0": r.errors.length
        }) : empty ? t("ui.copy.0329", {
          "0": empty
        }) : r.new_messages ? t("ui.copy.0330", {
          "0": r.new_messages
        }) : t("ui.copy.0331"), !!r.errors?.length);
        await Promise.all([drawList(), drawThread(), drawSyncStatus()]);
        live.refresh();
      } catch (error) {
        toast(errMsg(error), true);
      } finally {
        button.disabled = false;
      }
    }
  }, t("ui.copy.0311"))), syncPanel, wrap, h('p', {
    class: 'faint small',
    style: {
      marginTop: '10px'
    }
  }, t("ui.copy.0332"))));
  rendered.querySelector('.pagehead').after(scope.element);
  cleanupFor.set(rendered,ownDispose);
  return rendered;
}

// ---------------- insights ----------------
const METRIC = {
  followers_count: t("ui.copy.0078"),
  views: 'Tayangan',
  reach: 'Jangkauan',
  accounts_engaged: t("ui.copy.0333"),
  total_interactions: t("ui.copy.0334"),
  likes: 'Suka',
  comments: t("comments.title"),
  saves: 'Disimpan',
  shares: 'Dibagikan',
  replies: t("comments.reply"),
  reposts: 'Repost',
  quotes: 'Kutipan',
  clicks: t("ui.sweep.40")
};
const fmtNum = n => n == null ? '–' : Number(n).toLocaleString('id-ID');

/** Single-series line chart (SVG) with recessive grid, 2px line, hover tooltip. */
function lineChart(points, label) {
  const W = 320,
    H = 120,
    P = {
      l: 4,
      r: 4,
      t: 10,
      b: 18
    };
  const vals = points.map(p => p.v).filter(v => v != null);
  const wrap = h('div', {
    class: 'spark'
  });
  if (!vals.length) {
    wrap.append(h('div', {
      class: 'faint small spark-empty'
    }, t("ui.copy.0335")));
    return wrap;
  }
  const min = Math.min(...vals),
    max = Math.max(...vals);
  const lo = min === max ? min - 1 : min,
    hi = min === max ? max + 1 : max;
  const x = i => P.l + (points.length === 1 ? (W - P.l - P.r) / 2 : i * (W - P.l - P.r) / (points.length - 1));
  const y = v => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
  const pts = points.map((p, i) => p.v == null ? null : [x(i), y(p.v), p]);
  const path = pts.filter(Boolean).map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  const ns = 'http://www.w3.org/2000/svg';
  const el = (_targetValue20, a) => {
    const n = document.createElementNS(ns, _targetValue20);
    for (const [k, v] of Object.entries(a)) n.setAttribute(k, v);
    return n;
  };
  const svgEl = el('svg', {
    viewBox: `0 0 ${W} ${H}`,
    role: 'img',
    'aria-label': t("ui.sweep.41", {
      "0": label
    }),
    preserveAspectRatio: 'none'
  });
  for (const g of [0, 0.5, 1]) svgEl.append(el('line', {
    x1: P.l,
    x2: W - P.r,
    y1: P.t + g * (H - P.t - P.b),
    y2: P.t + g * (H - P.t - P.b),
    class: 'grid'
  }));
  svgEl.append(el('path', {
    d: path,
    class: 'line'
  }));
  const dot = el('circle', {
    r: 4.5,
    class: 'dot',
    visibility: 'hidden'
  });
  const cross = el('line', {
    y1: P.t,
    y2: H - P.b,
    class: 'cross',
    visibility: 'hidden'
  });
  svgEl.append(cross, dot);
  if (pts.filter(Boolean).length === 1) {
    const [px, py] = pts.find(Boolean);
    svgEl.append(el('circle', {
      cx: px,
      cy: py,
      r: 4,
      class: 'dot solo'
    }));
  }
  const tip = h('div', {
    class: 'tip',
    hidden: true
  });
  const hit = el('rect', {
    x: 0,
    y: 0,
    width: W,
    height: H,
    fill: 'transparent'
  });
  hit.addEventListener('mousemove', e => {
    const r = svgEl.getBoundingClientRect();
    const mx = (e.clientX - r.left) / r.width * W;
    let best = null;
    for (const p of pts) if (p && (!best || Math.abs(p[0] - mx) < Math.abs(best[0] - mx))) best = p;
    if (!best) return;
    dot.setAttribute('cx', best[0]);
    dot.setAttribute('cy', best[1]);
    dot.setAttribute('visibility', 'visible');
    cross.setAttribute('x1', best[0]);
    cross.setAttribute('x2', best[0]);
    cross.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.replaceChildren(h('b', {}, fmtNum(best[2].v)), ' ', new Date(`${best[2].d}T00:00:00`).toLocaleDateString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: 'numeric',
      month: 'short'
    }));
    tip.style.left = `${best[0] / W * 100}%`;
  });
  hit.addEventListener('mouseleave', () => {
    dot.setAttribute('visibility', 'hidden');
    cross.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  });
  svgEl.append(hit);
  const fmtD = d => new Date(`${d}T00:00:00`).toLocaleDateString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short'
  });
  wrap.append(svgEl, tip, h('div', {
    class: 'axis'
  }, h('span', {}, fmtD(points[0].d)), h('span', {}, fmtD(points.at(-1).d))));
  return wrap;
}
async function pageInsights() {
  await loadAccounts();
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const days = Number(q.get('r') || 30);
  const accId = q.get('a') || state.accounts[0]?.id;
  const setQ = (k, v) => {
    const n = new URLSearchParams(q);
    n.set(k, v);
    go(`/insights?${n}`);
  };
  if (!accId) return shell('/insights', h('div', {}, pagehead(t("insights.title")), h('div', {
    class: 'panel empty'
  }, t("ui.copy.0336"), h('br'), h('a', {
    class: 'btn',
    href: '#/accounts'
  }, t("accounts.connect")))));
  const from = new Date(Date.now() - (days - 1) * 864e5).toISOString().slice(0, 10);
  const data = await api('GET', `/v1/accounts/${accId}/insights?from=${from}`);
  const a = state.accounts.find(x => x.id === accId);
  const allDays = [...Array(days)].map((_, i) => new Date(Date.now() - (days - 1 - i) * 864e5).toISOString().slice(0, 10));
  const byDay = Object.fromEntries(data.days.map(d => [d.date, d]));
  const keys = [...new Set(data.days.flatMap(d => Object.keys(d).filter(k => k !== 'date' && METRIC[k])))];
  const order = Object.keys(METRIC).filter(k => keys.includes(k));
  const tiles = order.map(k => {
    const pts = allDays.map(d => ({
      d,
      v: byDay[d]?.[k] ?? null
    }));
    const latest = [...pts].reverse().find(p => p.v != null)?.v;
    const first = pts.find(p => p.v != null)?.v;
    const delta = latest != null && first != null && k === 'followers_count' ? latest - first : null;
    return h('div', {
      class: 'panel metric'
    }, h('div', {
      class: 'muted small'
    }, METRIC[k]), h('div', {
      class: 'big'
    }, fmtNum(latest), delta ? h('span', {
      class: `delta ${delta > 0 ? 'up' : 'down'}`
    }, `${delta > 0 ? '+' : ''}${fmtNum(delta)}`) : null), lineChart(pts, METRIC[k]));
  });
  const table = h('details', {
    class: 'panel',
    style: {
      marginTop: '16px'
    }
  }, h('summary', {}, t("ui.copy.0337")), h('div', {
    style: {
      overflowX: 'auto',
      marginTop: '10px'
    }
  }, h('table', {
    class: 'tbl'
  }, h('thead', {}, h('tr', {}, h('th', {}, t("ui.extra.53")), order.map(k => h('th', {}, METRIC[k])))), h('tbody', {}, data.days.slice().reverse().map(d => h('tr', {}, h('td', {}, d.date), order.map(k => h('td', {}, fmtNum(d[k])))))))));
  return shell('/insights', h('div', {}, pagehead(t("insights.title"), t("ui.copy.0338"), h('select', {
    style: {
      width: 'auto'
    },
    'aria-label': t("ui.copy.0222"),
    onchange: e => setQ('a', e.target.value)
  }, accountOptions(accId)), h('div', {
    class: 'seg'
  }, [7, 30, 90].map(r => h('button', {
    class: r === days ? 'on' : '',
    onclick: () => setQ('r', String(r))
  }, t("ui.copy.0339", {
    "0": r
  })))), h('button', {
    class: 'btn',
    onclick: async e => {
      e.currentTarget.disabled = true;
      try {
        await api('POST', '/v1/insights/sync');
        toast(t("ui.sweep.42"));
        route();
      } catch (err) {
        toast(errMsg(err), true);
        e.currentTarget.disabled = false;
      }
    }
  }, t("ui.copy.0311"))), a?.status === 'expired' ? h('div', {
    class: 'err-box',
    style: {
      marginBottom: '14px'
    }
  }, t("ui.copy.0340"), h('a', {
    href: `/connect/${a.platform}`
  }, t("ui.copy.0038"))) : null, tiles.length ? h('div', {
    class: 'metrics'
  }, tiles) : h('div', {
    class: 'panel empty'
  }, t("ui.copy.0341")), tiles.length ? table : null));
}

// Account-specific integration details and reusable brand setup.
async function pageAccountDetail(accountId) {
  await loadAccounts();
  const a = state.accounts.find(a => a.id === accountId);
  if (!a) throw uiError(t("ui.copy.0342"));
  const q = new URLSearchParams(location.hash.split('?')[1] || ''),
    tab = q.get('tab') === 'brand' && a.platform === 'instagram' ? 'brand' : 'integration';
  const back = isOwner() ? '/accounts' : '/generator';
  const company = state.companies.find(c => c.id === a.company_id);
  const top = h('div', {}, pagehead(a.name || '@' + a.username, t("ui.copy.0343"), h('a', {
    class: 'btn',
    href: '#' + back
  }, t("dialog.back"))), h('section', {
    class: 'panel account-detail-header'
  }, avatar(a, 'lg'), h('div', {}, h('h2', {}, '@' + a.username), h('p', {
    class: 'muted small'
  }, `${company?.name || t("ui.copy.0344")} · ${a.platform === 'instagram' ? 'Instagram' : 'Threads'}`)), status(a.status)), h('div', {
    class: 'seg account-detail-tabs'
  }, h('button', {
    class: tab === 'integration' ? 'on' : '',
    onclick: () => go('/accounts/' + encodeURIComponent(a.id))
  }, t("ui.extra.54")), a.platform === 'instagram' ? h('button', {
    class: tab === 'brand' ? 'on' : '',
    onclick: () => go('/accounts/' + encodeURIComponent(a.id) + '?tab=brand')
  }, t("ui.copy.0227")) : null));
  if (tab === 'integration') {
    top.append(h('section', {
      class: 'panel'
    }, h('h2', {}, t("ui.copy.0345")), h('p', {}, t("ui.copy.0346", {
      "0": a.name || a.username
    })), h('p', {}, `Username: @${a.username}`), h('p', {}, t("ui.sweep.43", {
      "0": a.status
    })), a.followers_count != null ? h('p', {}, t("ui.copy.0347", {
      "0": a.followers_count.toLocaleString('id-ID')
    })) : null, a.token_expires_at ? h('p', {}, t("ui.copy.0348", {
      "0": fmtDT(a.token_expires_at)
    })) : null, a.last_error ? technicalError(a.last_error) : null, h('div', {
      class: 'row'
    }, a.platform === 'instagram' ? h('a', {
      class: 'btn primary',
      href: '#/accounts/' + encodeURIComponent(a.id) + '?tab=brand'
    }, t("ui.copy.0349")) : null, isOwner() ? h('a', {
      class: 'btn',
      href: '/connect/' + a.platform
    }, t("ui.copy.0038")) : null)));
    return shell(isOwner() ? '/accounts' : '/generator', top);
  }
  const story = await storyWorkspace({
    accountPickerFactory: ui.accountPicker,
    h,
    api,
    uploadFile,
    confirmDialog,
    inputDialog,
    icon,
    errMsg,
    technicalError,
    accounts: [a],
    fixedAccount: true,
    mode: 'setup',
    toast,
    fmtDT
  });
  pageCleanup = () => story.dispose();
  top.append(story.element);
  return shell(isOwner() ? '/accounts' : '/generator', top);
}

// ---------------- accounts ----------------
async function pageAccounts() {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  if (q.get('connected')) toast(t("ui.sweep.44", {
    "0": q.get('connected')
  }));
  if (q.get('error')) toast(q.get('error'), true);
  if (q.get('connected') || q.get('error')) history.replaceState(null, '', '#/accounts');
  const [, me] = await Promise.all([loadAccounts(), api('GET', '/v1/me').catch(() => ({}))]);
  const missing = Object.entries(me.integrations || {}).filter(([, ok]) => !ok).map(([p]) => p === 'instagram' ? 'Instagram' : 'Threads');
  const selectedCompany = q.get('company') || 'all';
  function editCompany(company) {
    const name = h('input', {
      value: company?.name || '',
      maxlength: 100,
      placeholder: t("ui.copy.0350"),
      'aria-label': t("ui.copy.0350")
    });
    const dialog = modal(company ? t("ui.copy.0351") : t("accounts.addcompany"), h('label', {
      class: 'field'
    }, t("ui.copy.0350"), name), [h('button', {
      class: 'btn primary',
      onclick: async () => {
        try {
          await api(company ? 'PATCH' : 'POST', '/v1/companies' + (company ? '/' + company.id : ''), {
            name: name.value
          });
          dialog.close();
          toast(t("ui.copy.0352"));
          route();
        } catch (error) {
          toast(errMsg(error), true);
        }
      }
    }, t("common.save"))]);
    name.focus();
  }
  async function refreshProfiles(e) {
    const button = e.currentTarget;
    button.disabled = true;
    let failed = 0;
    try {
      for (const a of state.accounts.filter(a => a.status === 'active')) {
        try {
          await api('POST', `/v1/accounts/${a.id}/profile`);
        } catch {
          failed++;
        }
      }
      toast(failed ? t("ui.copy.0353", {
        "0": failed
      }) : t("ui.copy.0354"), !!failed);
      route();
    } finally {
      button.disabled = false;
    }
  }
  function accountRow(a) {
    return h('div', {
      class: 'item account-row'
    }, avatar(a, 'lg'), h('div', {
      class: 'body'
    }, h('div', {}, h('a', {
      href: '#/accounts/' + encodeURIComponent(a.id)
    }, h('b', {}, a.name || `@${a.username}`))), h('div', {
      class: 'muted small'
    }, `@${a.username}`), h('div', {
      class: 'meta'
    }, plat(a.platform), a.followers_count != null ? h('span', {}, t("ui.copy.0355", {
      "0": a.followers_count.toLocaleString('id-ID')
    })) : null, a.token_expires_at ? h('span', {}, t("ui.sweep.45", {
      "0": new Date(a.token_expires_at).toLocaleDateString('id-ID')
    })) : null), a.last_error && a.status !== 'active' ? technicalError(a.last_error) : null), status(a.status), isOwner() ? h('select', {
      'aria-label': t("ui.copy.0356", {
        "0": a.username
      }),
      style: {
        width: 'auto',
        maxWidth: '210px'
      },
      onchange: async e => {
        const select = e.currentTarget;
        try {
          await api('PUT', `/v1/accounts/${a.id}/company`, {
            company_id: select.value || null
          });
          toast(t("ui.copy.0357"));
          route();
        } catch (error) {
          select.value = a.company_id || '';
          toast(errMsg(error), true);
        }
      }
    }, h('option', {
      value: '',
      selected: !a.company_id
    }, t("scope.company.unassigned")), state.companies.map(c => h('option', {
      value: c.id,
      selected: c.id === a.company_id
    }, c.name))) : null, h('a', {
      class: 'btn sm',
      href: '#/accounts/' + encodeURIComponent(a.id)
    }, t("ui.copy.0358")), h('a', {
      class: 'btn sm',
      href: `/connect/${a.platform}`
    }, t("ui.copy.0038")), isOwner() ? h('button', {
      class: 'btn sm ghost danger',
      onclick: async () => {
        if (!(await confirmDialog({
          title: t("ui.copy.0359", {
            "0": a.username
          }),
          body: t("dialog.danger.note"),
          tone: "danger",
          confirmLabel: t("dialog.confirm")
        }))) return;
        try {
          await api('DELETE', `/v1/accounts/${a.id}`);
          toast(t("ui.sweep.46", {
            "0": a.username
          }));
          route();
        } catch (error) {
          toast(errMsg(error), true);
        }
      }
    }, t("ui.copy.0360")) : null);
  }
  const groups = companyGroups().filter(c => selectedCompany === 'all' || (c.id || 'none') === selectedCompany).filter(c => c.id || c.accounts.length);
  return shell('/accounts', h('div', {}, missing.length ? h('div', {
    class: 'banner',
    style: {
      marginBottom: '1.5rem'
    }
  }, h('div', {
    class: 'l'
  }, h('div', {
    class: 'num'
  }, '!'), h('div', {}, h('h3', {}, t("ui.copy.0361", {
    "0": missing.join(' & ')
  })), h('p', {}, isOwner() ? t("ui.copy.0362") : t("ui.copy.0363"))))) : null, pagehead(t("accounts.title"), t("ui.copy.0364"), isOwner() ? h('button', {
    class: 'btn primary',
    onclick: () => editCompany()
  }, t("accounts.addcompany")) : null, h('a', {
    class: 'btn',
    href: '/connect/instagram'
  }, icon('instagram'), state.accounts.some(a => a.platform === 'instagram') ? t("ui.copy.0365") : t("ui.copy.0366")), h('a', {
    class: 'btn',
    href: '/connect/threads'
  }, icon('threads'), t("ui.copy.0367"))), h('div', {
    class: 'company-toolbar'
  }, h('select', {
    'aria-label': t("ui.copy.0292"),
    onchange: e => go('/accounts?company=' + encodeURIComponent(e.target.value))
  }, h('option', {
    value: 'all',
    selected: selectedCompany === 'all'
  }, t("scope.company.all")), state.companies.map(c => h('option', {
    value: c.id,
    selected: selectedCompany === c.id
  }, c.name)), h('option', {
    value: 'none',
    selected: selectedCompany === 'none'
  }, t("scope.company.unassigned"))), h('button', {
    class: 'btn',
    onclick: refreshProfiles,
    disabled: !state.accounts.length
  }, icon('refresh'), t("ui.copy.0368"))), groups.map(c => h('details', {
    class: 'panel company-group',
    open: true
  }, h('summary', {}, h('strong', {}, c.name), h('span', {
    class: 'faint small'
  }, t("ui.copy.0369", {
    "0": c.accounts.length
  })), isOwner() && c.id ? h('button', {
    class: 'btn sm ghost',
    onclick: e => {
      e.preventDefault();
      editCompany(c);
    }
  }, t("ui.copy.0370")) : null), c.accounts.length ? h('div', {
    class: 'list'
  }, c.accounts.map(accountRow)) : h('p', {
    class: 'muted'
  }, t("ui.copy.0371")))), !groups.length ? h('div', {
    class: 'panel empty'
  }, t("ui.copy.0372")) : null, h('p', {
    class: 'faint small'
  }, t("ui.copy.0373"))));
}

// ---------------- media library ----------------
async function pageMedia() {
  const [{
    data
  }, use] = await Promise.all([api('GET', '/v1/media?limit=100'), api('GET', '/v1/media/usage')]);
  const prog = h('div', {
    class: 'progress'
  }, h('i'));
  const input = h('input', {
    type: 'file',
    multiple: true,
    hidden: true,
    accept: 'image/jpeg,image/png,video/mp4,video/quicktime',
    onchange: () => upload([...input.files])
  });
  async function upload(files) {
    for (const [i, f] of files.entries()) {
      try {
        await uploadFile(f, {
          onProgress: p => {
            prog.firstChild.style.width = `${(i + p) / files.length * 100}%`;
          }
        });
      } catch (e) {
        toast(`${f.name}: ${errMsg(e)}`, true);
      }
    }
    toast(t("ui.copy.0374"));
    route();
  }
  const drop = h('div', {
    class: 'drop',
    ondragover: e => {
      e.preventDefault();
      drop.classList.add('over');
    },
    ondragleave: () => drop.classList.remove('over'),
    ondrop: e => {
      e.preventDefault();
      drop.classList.remove('over');
      upload([...e.dataTransfer.files]);
    }
  }, h('p', {}, t("ui.copy.0375")), h('button', {
    class: 'btn primary',
    onclick: () => input.click()
  }, t("ui.copy.0114")), input, h('p', {
    class: 'faint small',
    style: {
      marginTop: '8px'
    }
  }, t("ui.copy.0376")), prog);
  return shell('/media', h('div', {}, pagehead('Media', t("ui.copy.0377"), h('span', {
    class: 'muted small'
  }, t("ui.copy.0378", {
    "0": fmtBytes(use.used_bytes),
    "1": use.files
  }))), drop, data.length ? h('div', {
    class: 'mgrid'
  }, data.map(m => h('div', {
    class: 'mcell'
  }, h('div', {
    class: 'pic'
  }, m.type === 'video' ? h('video', {
    src: m.url,
    muted: true,
    controls: true,
    preload: 'metadata'
  }) : h('img', {
    src: m.url,
    alt: m.alt_text || '',
    loading: 'lazy'
  })), h('div', {
    class: 'info'
  }, h('div', {}, m.type === 'video' ? t("ui.sweep.14", {
    "0": Math.round((m.duration_ms || 0) / 1000)
  }) : `${m.width}×${m.height}`, ` · ${fmtBytes(m.size_bytes)}`), h('div', {
    class: 'faint',
    title: m.id
  }, m.original_name || m.id), h('div', {
    class: 'row',
    style: {
      marginTop: '6px',
      gap: '4px'
    }
  }, h('label', {
    class: 'ui-field'
  }, t('media.alt'), h('input', {
    value: m.alt_text || '',
    'aria-label': t('media.alt'),
    onchange: async e => {
      await api('PATCH', `/v1/media/${m.id}`, {
        alt_text: e.target.value
      });
      toast(t('common.saved'));
    }
  })), h('button', {
    class: 'btn sm ghost danger',
    onclick: async () => {
      if (!(await confirmDialog({
        title: t("ui.copy.0379"),
        body: t("dialog.danger.note"),
        tone: "danger",
        confirmLabel: t("dialog.confirm")
      }))) return;
      try {
        await api('DELETE', `/v1/media/${m.id}`);
        route();
      } catch (e) {
        toast(errMsg(e), true);
      }
    }
  }, t("ui.copy.0213"))))))) : null));
}

// ---------------- developer: API keys, AI apps ----------------
async function pageDeveloper() {
  const [keys, apps] = await Promise.all([api('GET', '/v1/api-keys'), api('GET', '/v1/apps')]);
  const mcpUrl = `${location.origin}/mcp`;
  const copy = _targetValue21 => navigator.clipboard.writeText(_targetValue21).then(() => toast('Disalin'));
  const nameIn = h('input', {
    placeholder: t("ui.copy.0380"),
    style: {
      maxWidth: '320px'
    }
  });
  const scopeIn = h('select', {
    style: {
      width: 'auto'
    }
  }, h('option', {
    value: 'read'
  }, t("ui.extra.55")), h('option', {
    value: 'write'
  }, t("ui.copy.0381")));
  return shell('/developer', h('div', {}, pagehead(t("api.title"), t("ui.copy.0382")), h('div', {
    class: 'panel'
  }, h('h2', {}, t("ui.copy.0383")), h('p', {
    class: 'muted'
  }, t("ui.copy.0384")), h('div', {
    class: 'secret',
    style: {
      background: 'var(--primary-t)'
    }
  }, h('code', {}, mcpUrl), h('button', {
    class: 'btn sm',
    onclick: () => copy(mcpUrl)
  }, t("api.copy"))), h('p', {
    class: 'muted small'
  }, t("ui.extra.56")), h('div', {
    class: 'secret',
    style: {
      background: 'var(--bg-2)'
    }
  }, h('code', {}, `claude mcp add --transport http lrmsmm ${mcpUrl} --header "Authorization: Bearer lrm_live_..."`))), h('div', {
    class: 'panel'
  }, h('h2', {}, t("ui.extra.57")), h('p', {
    class: 'muted'
  }, t("ui.copy.0385")), h('div', {
    class: 'row'
  }, h('a', {
    class: 'btn',
    href: '/agent-api.md',
    target: '_blank',
    rel: 'noopener'
  }, t("ui.extra.58")), h('a', {
    class: 'btn',
    href: '/openapi.json',
    target: '_blank',
    rel: 'noopener'
  }, t("ui.extra.59")))), h('div', {
    class: 'panel'
  }, h('h2', {}, t("ui.extra.60")), h('p', {
    class: 'muted'
  }, t("ui.copy.0386"), h('code', {}, `${location.origin}/v1`), t("ui.copy.0387")), h('div', {
    class: 'row',
    style: {
      marginBottom: '12px'
    }
  }, nameIn, scopeIn, h('button', {
    class: 'btn primary',
    onclick: async () => {
      try {
        const k = await api('POST', '/v1/api-keys', {
          name: nameIn.value || t("ui.extra.60"),
          scope: scopeIn.value
        });
        modal(t("ui.copy.0388"), h('div', {}, h('p', {}, t("ui.copy.0389")), h('div', {
          class: 'secret'
        }, h('code', {}, k.key), h('button', {
          class: 'btn sm',
          onclick: () => copy(k.key)
        }, t("api.copy")))), [h('button', {
          class: 'btn primary',
          onclick: e => {
            e.target.closest('dialog').close();
            route();
          }
        }, t("common.copied"))]);
      } catch (e) {
        toast(errMsg(e), true);
      }
    }
  }, t("api.create"))), keys.data.length ? h('div', {
    class: 'list'
  }, keys.data.map(k => h('div', {
    class: 'item'
  }, h('div', {
    class: 'body'
  }, h('b', {}, k.name), h('div', {
    class: 'meta'
  }, h('code', {}, `${k.prefix}…`), h('span', {}, k.scope === 'write' ? t("ui.copy.0381") : t("ui.extra.55")), h('span', {}, k.last_used_at ? t("ui.copy.0390", {
    "0": ago(k.last_used_at)
  }) : t("ui.copy.0391")))), h('button', {
    class: 'btn sm ghost danger',
    onclick: async () => {
      if (!(await confirmDialog({
        title: t("ui.sweep.47", {
          "0": k.name
        }),
        body: t("dialog.danger.note"),
        tone: "danger",
        confirmLabel: t("dialog.confirm")
      }))) return;
      await api('DELETE', `/v1/api-keys/${k.id}`);
      toast(t("ui.sweep.48"));
      route();
    }
  }, t("api.revoke"))))) : h('p', {
    class: 'faint'
  }, t("ui.copy.0392"))), h('div', {
    class: 'panel'
  }, h('h2', {}, t("ui.copy.0393")), apps.data.length ? h('div', {
    class: 'list'
  }, apps.data.map(a => h('div', {
    class: 'item'
  }, h('div', {
    class: 'body'
  }, h('b', {}, a.client_name || 'Aplikasi'), h('div', {
    class: 'meta'
  }, h('span', {}, a.scope.includes('write') ? t("ui.copy.0381") : t("ui.extra.55")), h('span', {}, t("ui.sweep.49", {
    "0": fmtDT(a.created_at)
  })), a.last_used_at ? h('span', {}, t("ui.copy.0394", {
    "0": ago(a.last_used_at)
  })) : null)), h('button', {
    class: 'btn sm ghost danger',
    onclick: async () => {
      await api('DELETE', `/v1/apps/${a.id}`);
      toast(t("ui.copy.0395"));
      route();
    }
  }, t("api.revoke"))))) : h('p', {
    class: 'faint'
  }, t("ui.copy.0396")))));
}

// ---------------- team & user management ----------------
function accountPicker(selected = []) {
  const sel = new Set(selected);
  const box = h('div', {}, companyGroups().filter(c => c.accounts.length).map(c => h('details', {
    class: 'company-access',
    open: true
  }, h('summary', {}, c.name), h('div', {
    class: 'acc-picker'
  }, c.accounts.map(a => {
    const button = h('button', {
      type: 'button',
      class: `acc-chip ${sel.has(a.id) ? 'on' : ''}`,
      'aria-pressed': sel.has(a.id),
      onclick: () => {
        sel.has(a.id) ? sel.delete(a.id) : sel.add(a.id);
        button.classList.toggle('on');
        button.setAttribute('aria-pressed', sel.has(a.id));
      }
    }, avatar(a), a.name || `@${a.username}`, h('span', {
      class: `chip-plat ${a.platform}`
    }, icon(a.platform)));
    return button;
  })))));
  return {
    el: state.accounts.length ? box : h('p', {
      class: 'faint'
    }, t("ui.copy.0397")),
    value: () => [...sel]
  };
}
function companyPicker(selected = []) {
  const sel = new Set(selected);
  const box = h('div', {}, state.companies.map(c => h('details', {
    class: 'company-access'
  }, h('summary', {}, c.name, t("ui.copy.0369", {
    "0": state.accounts.filter(a => a.company_id === c.id).length
  })), h('label', {}, h('input', {
    type: 'checkbox',
    checked: sel.has(c.id),
    'aria-label': t("ui.copy.0398", {
      "0": c.name
    }),
    onchange: e => {
      e.currentTarget.checked ? sel.add(c.id) : sel.delete(c.id);
    }
  }), t("ui.copy.0399")), h('div', {
    class: 'acc-picker'
  }, state.accounts.filter(a => a.company_id === c.id).map(a => h('span', {
    class: 'acc-chip'
  }, avatar(a), a.name || `@${a.username}`, h('span', {
    class: 'muted small'
  }, ` @${a.username}`)))))));
  return {
    el: state.companies.length ? box : h('p', {
      class: 'faint'
    }, t("ui.copy.0400")),
    value: () => [...sel]
  };
}
async function pageTeam() {
  await loadAccounts();
  const owner = isOwner();
  const users = owner ? (await api('GET', '/v1/users')).data : [];
  const me = await api('GET', '/v1/me');
  const accName = id => {
    const a = state.accounts.find(x => x.id === id);
    return a ? `@${a.username} (${PLAT[a.platform]})` : null;
  };
  const pw = h('form', {
    onsubmit: async e => {
      e.preventDefault();
      try {
        await api('POST', '/auth/password', Object.fromEntries(new FormData(pw)));
        toast(t("ui.copy.0401"));
        pw.reset();
      } catch (err) {
        toast(errMsg(err), true);
      }
    }
  }, h('label', {
    class: 'field'
  }, h('span', {}, t("ui.extra.61")), h('input', {
    type: 'password',
    name: 'current',
    required: true,
    autocomplete: 'current-password'
  })), h('label', {
    class: 'field'
  }, h('span', {}, t("ui.copy.0402")), h('input', {
    type: 'password',
    name: 'next',
    required: true,
    minlength: 8,
    autocomplete: 'new-password'
  })), h('p', {
    class: 'faint small'
  }, t("ui.copy.0403")), h('button', {
    class: 'btn'
  }, t("ui.copy.0404")));
  function editUser(u) {
    const picker = accountPicker(u.account_ids || []);
    const companies = companyPicker(u.company_ids || []);
    const role = h('select', {
      onchange: () => {
        pickWrap.hidden = role.value === 'owner';
      }
    }, h('option', {
      value: 'rep',
      selected: u.role === 'rep'
    }, t("ui.copy.0405")), h('option', {
      value: 'owner',
      selected: u.role === 'owner'
    }, t("ui.copy.0406")));
    const name = h('input', {
      value: u.name || ''
    });
    const pass = h('input', {
      type: 'text',
      placeholder: t("ui.copy.0407"),
      minlength: 8
    });
    const pickWrap = h('div', {
      hidden: u.role === 'owner'
    }, h('div', {
      class: 'field'
    }, h('span', {}, t("ui.copy.0408")), companies.el, h('span', {}, t("ui.copy.0409")), picker.el));
    const d = modal(t("ui.sweep.50", {
      "0": u.email
    }), h('div', {}, h('label', {
      class: 'field'
    }, h('span', {}, t("ui.copy.0410")), name), h('label', {
      class: 'field'
    }, h('span', {}, t("ui.extra.62")), role), pickWrap, h('label', {
      class: 'field'
    }, h('span', {}, t("ui.extra.63")), pass)), [h('button', {
      class: 'btn',
      onclick: () => d.close()
    }, t("common.cancel")), h('button', {
      class: 'btn primary',
      onclick: async () => {
        const body = {
          name: name.value,
          role: role.value
        };
        if (role.value === 'rep') {
          body.account_ids = picker.value();
          body.company_ids = companies.value();
        }
        if (pass.value) body.password = pass.value;
        try {
          await api('PATCH', `/v1/users/${u.id}`, body);
          d.close();
          toast(t("ui.copy.0411"));
          route();
        } catch (e) {
          toast(errMsg(e), true);
        }
      }
    }, t("common.save"))]);
  }
  function addUser() {
    const picker = accountPicker([]);
    const companies = companyPicker([]);
    const f = {
      name: h('input', {
        autocomplete: 'off'
      }),
      email: h('input', {
        type: 'email',
        required: true,
        autocomplete: 'off'
      }),
      password: h('input', {
        type: 'text',
        minlength: 8,
        required: true,
        autocomplete: 'off'
      })
    };
    const role = h('select', {
      onchange: () => {
        pickWrap.hidden = role.value === 'owner';
      }
    }, h('option', {
      value: 'rep'
    }, t("ui.copy.0405")), h('option', {
      value: 'owner'
    }, t("ui.copy.0406")));
    const pickWrap = h('div', {}, h('div', {
      class: 'field'
    }, h('span', {}, t("ui.copy.0412")), companies.el, h('span', {}, t("ui.copy.0409")), picker.el));
    const d = modal(t("team.invite"), h('div', {}, h('label', {
      class: 'field'
    }, h('span', {}, t("ui.copy.0410")), f.name), h('label', {
      class: 'field'
    }, h('span', {}, t("login.email")), f.email), h('label', {
      class: 'field'
    }, h('span', {}, t("ui.extra.64")), f.password), h('label', {
      class: 'field'
    }, h('span', {}, t("ui.extra.62")), role), pickWrap), [h('button', {
      class: 'btn',
      onclick: () => d.close()
    }, t("common.cancel")), h('button', {
      class: 'btn primary',
      onclick: async () => {
        try {
          await api('POST', '/v1/users', {
            name: f.name.value,
            email: f.email.value,
            password: f.password.value,
            role: role.value,
            account_ids: role.value === 'rep' ? picker.value() : undefined,
            company_ids: role.value === 'rep' ? companies.value() : undefined
          });
          d.close();
          toast(t("ui.copy.0413"));
          route();
        } catch (e) {
          toast(errMsg(e), true);
        }
      }
    }, t("ui.copy.0414"))]);
  }
  return shell('/team', h('div', {}, pagehead(owner ? t("team.title") : t("ui.copy.0023"), owner ? t("ui.copy.0415") : null, owner ? h('button', {
    class: 'btn primary',
    onclick: addUser
  }, t("team.invite")) : null), owner ? h('div', {
    class: 'list',
    style: {
      marginBottom: '18px'
    }
  }, users.map(u => h('div', {
    class: 'item'
  }, h('span', {
    class: 'peer'
  }, initials(u.name || u.email)), h('div', {
    class: 'body'
  }, h('div', {}, h('b', {}, u.name || u.email), ' ', h('span', {
    class: `status role-${u.role}`
  }, ROLE[u.role])), h('div', {
    class: 'meta'
  }, h('span', {}, u.email), u.role === 'owner' ? h('span', {}, t("ui.copy.0416")) : h('span', {}, [...(u.company_ids || []).map(id => state.companies.find(c => c.id === id)?.name).filter(Boolean), ...(u.account_ids || []).map(accName).filter(Boolean)].join(' · ') || t("ui.copy.0417")))), h('button', {
    class: 'btn sm',
    onclick: () => editUser(u)
  }, t("cal.event.edit")), u.id !== state.user.id ? h('button', {
    class: 'btn sm ghost danger',
    onclick: async () => {
      if (!(await confirmDialog({
        title: t("ui.copy.0418", {
          "0": u.email
        }),
        body: t("dialog.danger.note"),
        tone: "danger",
        confirmLabel: t("dialog.confirm")
      }))) return;
      await api('DELETE', `/v1/users/${u.id}`);
      toast(t("ui.copy.0419"));
      route();
    }
  }, t("ui.copy.0213")) : h('span', {
    class: 'faint small'
  }, t("team.you"))))) : null, !owner ? h('div', {
    class: 'panel',
    style: {
      marginBottom: '16px'
    }
  }, h('h2', {}, t("ui.copy.0420")), state.accounts.length ? h('div', {
    class: 'acc-picker'
  }, state.accounts.map(a => h('span', {
    class: 'acc-chip on'
  }, avatar(a), `@${a.username}`, h('span', {
    class: `chip-plat ${a.platform}`
  }, icon(a.platform))))) : h('p', {
    class: 'muted'
  }, t("ui.copy.0421"))) : null, h('div', {
    class: 'panel',
    style: {
      maxWidth: '460px'
    }
  }, h('h2', {}, t("ui.copy.0404")), pw), h('p', {
    class: 'faint small',
    style: {
      marginTop: '12px'
    }
  }, t("ui.copy.0422", {
    "0": me.user.email,
    "1": ROLE[me.user.role]
  }))));
}

// ---------------- admin (Owner) ----------------
const ACTION = {
  'post.publish': t("ui.sweep.51"),
  'post.schedule': t("ui.sweep.52"),
  'post.update': t("ui.sweep.53"),
  'post.cancel': t("ui.sweep.54"),
  'post.publish_now': t("ui.sweep.55"),
  'post.retry': t("ui.sweep.56"),
  'post.remove': t("ui.copy.0423"),
  'comment.reply': t("ui.copy.0424"),
  'comment.hide': t("ui.copy.0425"),
  'comment.unhide': t("ui.copy.0426"),
  'message.send': t("ui.sweep.57"),
  'account.connect': t("ui.copy.0427"),
  'account.reconnect': t("ui.copy.0428"),
  'account.disconnect': t("ui.copy.0429"),
  'user.create': t("ui.copy.0430"),
  'user.update': t("ui.copy.0431"),
  'user.assign': t("ui.copy.0432"),
  'user.delete': t("ui.copy.0433"),
  'api_key.create': t("ui.copy.0434"),
  'api_key.revoke': t("ui.sweep.58"),
  'ai_app.revoke': t("ui.copy.0435"),
  'media.delete': t("ui.sweep.59")
};
const VIA = {
  session: 'dashboard',
  api_key: t("ui.extra.60"),
  oauth: 'AI (MCP)',
  system: 'sistem'
};
async function pageAdmin() {
  if (!isOwner()) {
    go('/');
    return shell('', h('div'));
  }
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const tab = q.get('t') || 'audit';
  const ov = await api('GET', '/v1/admin/overview');
  let body;
  if (tab === 'failed') {
    const {
      data
    } = await api('GET', '/v1/admin/failed-posts');
    body = data.length ? h('div', {
      class: 'list'
    }, data.map(f => h('a', {
      class: 'item',
      href: `#/posts/${f.post_id}`
    }, h('div', {
      class: 'body'
    }, h('div', {
      class: 'title'
    }, f.content || t("ui.extra.6")), h('div', {
      class: 'meta'
    }, plat(f.platform), h('span', {}, `@${f.username}`), h('span', {}, fmtDT(f.updated_at))), h('div', {
      class: 'err-box',
      style: {
        marginTop: '6px'
      }
    }, h('b', {}, ERR[f.error_code] || f.error_code), f.error_message ? technicalError(f.error_message, f.error_code) : null)), status('failed')))) : h('div', {
      class: 'list empty'
    }, t("ui.copy.0436"));
  } else {
    const listEl = h('div', {
      class: 'list'
    });
    const more = h('button', {
      class: 'btn',
      hidden: true
    }, t("ui.copy.0437"));
    let cursor = null;
    const load = async () => {
      const r = await api('GET', `/v1/admin/audit?limit=50${cursor ? `&cursor=${cursor}` : ''}`);
      for (const a of r.data) {
        const d = a.details || {};
        const extra = [d.accounts?.join(', '), d.username ? `@${d.username}` : null, d.to, d.email, d.text ? `“${d.text}”` : null, d.name].filter(Boolean).join(' · ');
        listEl.append(h('div', {
          class: 'item'
        }, h('div', {
          class: 'body'
        }, h('div', {}, h('b', {}, a.user_email || 'Sistem'), ' ', ACTION[a.action] || a.action), h('div', {
          class: 'meta'
        }, h('span', {}, fmtDT(a.at)), h('span', {}, `via ${VIA[a.via] || a.via}`), extra ? h('span', {}, extra) : null)), a.target_type === 'post' && a.target_id ? h('a', {
          class: 'btn sm ghost',
          href: `#/posts/${a.target_id}`
        }, t("draft.cta.done")) : null));
      }
      if (!listEl.children.length) listEl.append(h('div', {
        class: 'empty'
      }, t("ui.extra.65")));
      cursor = r.next_cursor;
      more.hidden = !cursor;
    };
    more.onclick = load;
    await load();
    body = h('div', {}, listEl, h('div', {
      class: 'row',
      style: {
        marginTop: '12px'
      }
    }, more));
  }
  return shell('/admin', h('div', {}, pagehead(t("audit.title"), t("ui.copy.0438")), h('div', {
    class: 'strip'
  }, stat('#/team', 'team', ov.users, t("ui.copy.0439"), 'Owner & Representative', 'em'), stat('#/accounts', 'users', ov.accounts, t("ui.copy.0440"), ov.accounts_expired ? t("ui.copy.0441", {
    "0": ov.accounts_expired
  }) : t("ui.copy.0442"), ov.accounts_expired ? 'ro' : 'sky', !!ov.accounts_expired), stat('#/admin?t=failed', 'send', ov.posts_24h, t("ui.copy.0443"), t("ui.copy.0444", {
    "0": ov.failed_24h
  }), ov.failed_24h ? 'ro' : 'am', !!ov.failed_24h, t("ui.copy.0445")), stat('#/media', 'img', fmtBytes(ov.storage.used_bytes), t("ui.copy.0446"), t("ui.sweep.60", {
    "0": ov.storage.files
  }), 'pu', false, t("ui.copy.0049"))), h('p', {
    class: 'small muted',
    style: {
      margin: '-10px 0 18px'
    }
  }, ov.webhooks.last_at ? 'Webhook terakhir: ' + ago(ov.webhooks.last_at) : 'Belum ada webhook masuk. Pesan dan komentar disinkron berkala.'), h('div', {
    class: 'seg',
    style: {
      marginBottom: '14px'
    }
  }, h('button', {
    class: tab === 'audit' ? 'on' : '',
    onclick: () => go('/admin')
  }, t("audit.title")), h('button', {
    class: tab === 'failed' ? 'on' : '',
    onclick: () => go('/admin?t=failed')
  }, t("ui.copy.0448"))), body));
}

// ---------------- router ----------------
let pageCleanup = null,
  navSeq = 0;
let mountedHash = location.hash || '#/';
let cleanupInFlight = null;
const cleanupFor = new WeakMap();
async function route() {
  const nav = ++navSeq;
  document.querySelectorAll('#toast>div:not([data-persistent])').forEach(n => n.remove());
  setNavigation(false);
  const path = (location.hash.slice(1) || '/').split('?')[0];
  if (pageCleanup || cleanupInFlight) {
    const cleanup = pageCleanup || cleanupInFlight.cleanup, destination = location.hash;
    const pending = cleanupInFlight || {cleanup, promise:Promise.resolve().then(()=>cleanup())};
    cleanupInFlight = pending;
    pageCleanup = null;
    try { await pending.promise; }
    catch (error) {
      if (nav !== navSeq) return;
      cleanupInFlight = null;
      pageCleanup = cleanup;
      history.replaceState(null, '', location.pathname + location.search + mountedHash);
      toast('Perubahan belum tersimpan. Halaman tetap terbuka agar data tidak hilang.', true, {label:'Coba simpan lagi',fn:()=>{history.replaceState(null,'',location.pathname+location.search+destination);route();}});
      return;
    }
    if (cleanupInFlight === pending) cleanupInFlight = null;
    if (nav !== navSeq) return;
  }
  try {
    if (!state.user) {
      const st = await api('GET', '/auth/state');
      if (nav !== navSeq) return;
      state.mock = st.mock;
      state.user = st.user;
      if (!st.user) {
        $app.replaceChildren(authPage(st.needs_setup ? 'setup' : 'login'));
        return;
      }
      await loadAccounts();
      if (nav !== navSeq) return;
      state.stats = await api('GET', '/v1/stats');
      const [plans, runs] = await Promise.all([api('GET', '/v1/generator/plans'), api('GET', '/v1/generator/runs')]);
      state.draftCount = groupSessions(plans.data, runs.data,readSessionGroups(state.user.id)).filter(s => ['action', 'plan'].includes(sessionState(s))).length;
      state.lastOverdue = 0;
    }
    if (!isOwner() && /^\/(accounts|media|developer|team|admin)(?:\/|$)/.test(path) && !/^\/accounts\/[^/]+$/.test(path)) {
      go('/compose');
      return;
    }
    live.start();
    if (path === '/login') {
      go('/');
      return;
    }
    let m, view;
    if (path === '/_ui') {
      if (!isOwner()) {
        go('/');
        return;
      }
      await loadAccounts();
      view = shell('', ui.showcase());
    } else if (path === '/') view = await redesigned('home');else if (path === '/compose') view = await pageCompose();else if (path === '/generator') {
      const account = new URLSearchParams(location.hash.split('?')[1] || '').get('account');
      if (account) {
        go('/accounts/' + encodeURIComponent(account) + '?tab=brand');
        return;
      }
      view = await redesigned('generator');
    } else if (path === '/settings') view = await pageSettings();else if (path === '/generator/drafts') view = await redesigned('drafts');else if (m = path.match(/^\/generator\/drafts\/([^/]+)$/)) view = await redesigned('session', decodeURIComponent(m[1]));else if (m = path.match(/^\/compose\/(.+)$/)) view = await pageCompose(m[1]);else if (m = path.match(/^\/posts\/(.+)$/)) view = await pagePost(m[1]);else if (path === '/calendar') view = await redesigned('calendar');else if (path === '/inbox') view = await pageInbox();else if (path === '/messages') view = await pageMessages();else if (m = path.match(/^\/messages\/(.+)$/)) view = await pageMessages(m[1]);else if (path === '/insights') view = await redesigned('insights');else if (path === '/admin') view = await redesigned('audit');else if (path === '/accounts') view = await redesigned('accounts');else if (m = path.match(/^\/accounts\/([^/]+)$/)) view = await redesigned('brand', decodeURIComponent(m[1]));else if (path === '/media') view = await redesigned('media');else if (path === '/developer') view = await pageDeveloper();else if (path === '/team') view = await redesigned('team');else view = shell('', h('div', {
      class: 'panel empty'
    }, h('h2', {}, t("notfound.title")), h('a', {
      class: 'btn',
      href: '#/'
    }, t("notfound.cta"))));
    const ownCleanup = cleanupFor.get(view);
    if (nav !== navSeq) {
      try { await ownCleanup?.(); } catch {}
      return;
    }
    pageCleanup = ownCleanup || null;
    $app.replaceChildren(view);
    mountedHash = location.hash;
    view._startClock?.();
    if (!path.startsWith('/messages/')) window.scrollTo(0, 0);
    document.querySelectorAll('.dm-msgs').forEach(b => {
      b.scrollTop = b.scrollHeight;
    });
  } catch (e) {
    if (nav !== navSeq) return;
    if (e.code === 'unauthenticated') return;
    $app.replaceChildren(shell('', h('div', {
      class: 'panel'
    }, h('h2', {}, t("ui.copy.0449")), h('p', {}, errMsg(e)), h('details', {}, h('summary', {}, t('error.technical')), h('pre', {}, String(e.message || ''))), h('button', {
      class: 'btn',
      onclick: route
    }, t("error.page.retry")))));
  }
}
window.addEventListener('hashchange', route);
route();
