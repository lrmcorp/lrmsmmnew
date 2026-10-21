// LRMsmm dashboard — vanilla JS SPA (no build step).
import { storyWorkspace } from './story-workspace.js';
import { generatorStudio } from './generator-studio.js';
import { workflowCanvas } from './workflow-canvas.js';
import { bindInteraction } from './interactions.js';
import { HERO, PLATFORM_ICONS } from './icons.js';
import { t } from './strings.en.js';
import { createUI, readContentPrefs, contentInstruction, hasCaptionEmoji } from './ui.js';
const $app = document.getElementById('app');

// ---------------- helpers ----------------
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) bindInteraction(el, k.slice(2), v, error => toast(errMsg(error), true));
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
}
const replaceContent=(el,...children)=>el.replaceChildren(...children.filter(x=>x!=null&&x!==false));
const svg = (s) => { const t = document.createElement('template'); t.innerHTML = s.trim(); return t.content.firstChild; };
// UI icons: Heroicons v1 outline — the same set hrd.playgo.id uses
const ICO = { home: 'home', pen: 'pencil-alt', cal: 'calendar', chat: 'chat-alt-2', inbox: 'chat', chart: 'trending-up', users: 'user-group',
  img: 'photograph', key: 'code', shield: 'shield-check', team: 'users', menu: 'menu', bell: 'bell', logout: 'logout', person: 'user-circle',
  x: 'x', warn: 'exclamation', clock: 'clock', send: 'paper-airplane', upload: 'cloud-upload', lock: 'lock-closed', bolt: 'lightning-bolt',
  sparkles: 'sparkles', link: 'link', globe: 'globe-alt', plus: 'plus', right: 'chevron-right', refresh: 'refresh', cog: 'cog', doc: 'document-text', grid: 'view-grid' };
const icon = (k) => {
  if (PLATFORM_ICONS[k]) return svg(PLATFORM_ICONS[k]);
  const p = HERO[ICO[k] || k];
  return p ? svg(`<svg class="hi" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" aria-hidden="true">${p}</svg>`) : h('span');
};
const logo = (tag = 'a', attrs = {}) => h(tag, { class: 'logo', href: tag === 'a' ? '#/' : null, ...attrs },
  h('span', { class: 'word' }, 'LRM', h('span', {}, 'smm')), h('span', { class: 'tag' }, 'SMM'));
const pref = { get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } } };
const PLAT = { instagram: 'Instagram', threads: 'Threads' };
const initials = (s) => (s || '?').replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase();
const plat = (p) => h('span', { class: `plat ${p}` }, icon(p), PLAT[p] || p);
const avatar = (a, cls = '') => {
  const el = h('span', { class: `avatar ${a.platform} ${cls}`, title: a.name || `@${a.username}` }, initials(a.name || a.username));
  try {
    if (a.avatar_url && new URL(a.avatar_url).protocol === 'https:') el.replaceChildren(h('img', { src: a.avatar_url, alt: a.name || `@${a.username}`, loading: 'lazy', referrerpolicy: 'no-referrer', onerror: () => el.replaceChildren(document.createTextNode(initials(a.name || a.username))) }));
  } catch { /* Invalid or unavailable remote photo: keep initials. */ }
  return el;
};
const STATUS = Object.fromEntries(['published','scheduled','publishing','pending','failed','partial','cancelled','expired','active'].map(s=>[s,t('status.'+s)]));
const status = (s) => h('span', { class: `status ${s}` }, STATUS[s] || t('status.pending'));
const len = (s) => [...(s || '')].length;
const dateOptions = { timeZone: 'Asia/Jakarta' };
const fmtDay = iso => iso ? new Date(iso).toLocaleDateString('en-GB',{...dateOptions,weekday:'short',day:'numeric',month:'short'}) : '';
const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString('en-GB', { ...dateOptions,hour:'2-digit',minute:'2-digit',hourCycle:'h23' }) : '';
const fmtSlot = iso => iso ? `${fmtDay(iso)} · ${fmtTime(iso)}` : '';
const fmtDT = fmtSlot;
const fmtRange = (a,b) => a && b ? `${new Date(a).toLocaleDateString('en-GB',{...dateOptions,day:'numeric',month:'short'})} – ${new Date(b).toLocaleDateString('en-GB',{...dateOptions,day:'numeric',month:'short'})}` : '';
const fmtNumber = n => Number(n || 0).toLocaleString('en-GB');
const fmtBytes = (b) => b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;
const ago = (iso) => { const s = (Date.now() - new Date(iso)) / 1000; if (s < 60) return t('time.just_now'); if (s < 3600) return t('time.minutes',{n:Math.floor(s/60)}); if (s < 86400) return t('time.hours',{n:Math.floor(s/3600)}); return t('time.days',{n:Math.floor(s/86400)}); };
const ERR = {
  account_expired:t('error.account_expired'),permission_missing:t('error.permission_missing'),rate_limited:t('error.rate_limited'),
  media_fetch_failed:t('error.media_fetch_failed'),image_too_large:t('error.image_too_large'),
  aspect_ratio_invalid:t('error.aspect_ratio_invalid'),caption_too_long:t('error.caption_too_long'),publish_limit_reached:t('error.publish_limit_reached'),
  media_invalid_format:t('error.media_invalid_format'),platform_error:t('error.platform_error'),thread_partial:t('error.thread_partial'),
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
  const el = h('div', { class: `${bad ? 'bad' : ''} ${action ? 'has-action' : ''}` }, h('span',{class:'toast-message'},msg),
    action ? h('button', { class: 'toast-act', onclick: () => { el.remove(); action.fn(); } }, action.label) : null,h('button',{type:'button',class:'toast-dismiss','aria-label':t('dialog.close'),onclick:()=>el.remove()},icon('x')));
  document.getElementById('toast').append(el);
  setTimeout(() => el.remove(), action ? 6000 : bad ? 10000 : 4500);
}
const errMsg = (e) => e?.code && ERR[e.code] ? ERR[e.code] : t('error.unknown');
const technicalDetails = e => e?.message ? h('details',{},h('summary',{},t('error.technical')),h('pre',{},e.message)) : null;
const go = (p) => { location.hash = `#${p}`; };
function modal(title, body, actions = []) {
  const headingId='dialog-'+crypto.randomUUID();
  const trigger = document.activeElement;
  const d = h('dialog', { 'aria-labelledby':headingId }, h('div', { class: 'dh' }, h('h2', {id:headingId}, title), h('span', { class: 'spacer' }), h('button', { class: 'btn ghost sm', onclick: () => d.close(), 'aria-label': t('dialog.close') }, icon('x'))),
    h('div', { class: 'db' }, body), actions.length ? h('div', { class: 'df' }, actions) : null);
  d.addEventListener('click',e=>{if(e.target===d)d.close();});
  d.addEventListener('close', () => {d.remove();if(trigger?.isConnected)trigger.focus();});
  document.body.append(d); d.showModal();
  return d;
}
function confirmDialog({title,body,tone='default',details=[],confirmLabel,cancelLabel=t('dialog.cancel')}={}) {
  return new Promise(resolve=>{
    let done=false;const finish=value=>{if(done)return;done=true;d.close();resolve(value);};
    const cancel=h('button',{type:'button',class:'btn',onclick:()=>finish(false)},cancelLabel);
    const confirm=h('button',{type:'button',class:`btn ${tone==='danger'?'danger':'primary'}`,onclick:()=>finish(true)},confirmLabel||t('dialog.confirm'));
    const content=h('div',{class:`confirm-content tone-${tone}`},tone==='cost'?ui.chip(t('dialog.cost.chip'),'info'):tone==='danger'?ui.chip(t('dialog.danger.chip'),'bad'):null,
      h('p',{},body),details?.length?h('dl',{class:'dialog-details'},details.map(([label,value])=>h('div',{},h('dt',{},label),h('dd',{},value)))):null);
    const d=modal(title,content,[cancel,confirm]);
    d.addEventListener('close',()=>{if(!done){done=true;resolve(false);}});
    requestAnimationFrame(()=>(tone==='danger'?cancel:confirm).focus());
  });
}
function inputDialog({title,label,placeholder='',value='',suggestions=[],hint='',confirmLabel=t('dialog.save'),multiline=false}={}) {
  return new Promise(resolve=>{
    let done=false;const finish=result=>{if(done)return;done=true;d.close();resolve(result);};
    const input=h(multiline?'textarea':'input',{class:'dialog-input',placeholder,value,'aria-label':label||title});
    const content=h('div',{class:'input-dialog'},label?h('label',{},label,input):input,
      suggestions.length?h('div',{class:'dialog-suggestions'},suggestions.map(s=>h('button',{type:'button',class:'ui-chip',onclick:()=>{input.value+=(input.value?' ':'')+s;input.focus();}},s))):null,
      hint?h('p',{class:'muted small'},hint):null);
    const d=modal(title,content,[h('button',{type:'button',class:'btn',onclick:()=>finish(null)},t('dialog.cancel')),
      h('button',{type:'button',class:'btn primary',onclick:()=>finish(input.value.trim()||null)},confirmLabel)]);
    d.addEventListener('close',()=>{if(!done){done=true;resolve(null);}});requestAnimationFrame(()=>input.focus());
  });
}

// ---------------- state & shell ----------------
const state = { user: null, mock: false, accounts: [], companies: [], stats: {}, lastOverdue: 0, brandProfiles:{} };
const isOwner = () => state.user?.role === 'owner';
const ROLE = { owner: t('role.owner'), rep: t('role.rep') };
const ui=createUI({h,icon,avatar,state,isOwner,go,modal});
async function loadAccounts() {
  const [accounts, companies] = await Promise.all([api('GET', '/v1/accounts'), api('GET', '/v1/companies')]);
  state.accounts = accounts.data; state.companies = companies.data; return state.accounts;
}
function companyGroups() {
  return [...state.companies.map(c => ({ ...c, accounts: state.accounts.filter(a => a.company_id === c.id) })),
    { id: '', name: t('scope.company.unassigned'), accounts: state.accounts.filter(a => !a.company_id) }];
}


function accountOptions(selected, platform) {
  return companyGroups().map(company => {
    const accounts = company.accounts.filter(a => !platform || a.platform === platform);
    return accounts.length ? h('optgroup', { label: company.name }, accounts.map(a => h('option', { value: a.id, selected: a.id === selected }, `${a.name || '@' + a.username} · @${a.username} (${PLAT[a.platform]})`))) : null;
  });
}

function badgeFor(key) {
  const s = state.stats;
  if (key === 'drafts') return s.draftSessionsNeedsAction ? {n:s.draftSessionsNeedsAction,tone:'soft',title:t('draft.tab.action')} : null;
  if (key === 'messages') return s.messages_overdue ? { n: s.messages_overdue, tone: 'bad', title: `${s.messages_overdue} messages waiting more than 5 minutes` } : s.messages_waiting ? { n: s.messages_waiting, tone: 'soft', title: `${s.messages_waiting} messages waiting for a reply` } : null;
  if (key === 'comments') return s.unreplied ? { n: s.unreplied, tone: 'soft', title: `${s.unreplied} unanswered comments` } : null;
  return null;
}
function badgeEl(key) {
  const b = badgeFor(key);
  return h('span', { class: `count ${b?.tone || ''}`, 'data-badge': key, title: b?.title || '', hidden: !b }, b?.n ?? '');
}

// Navigation grouped like the HRD sidebar
function navGroups() {
  return [
    [t('nav.group.content'), [['/', 'home', t('nav.home')], ['/generator', 'sparkles', t('nav.generator')], ['/generator/drafts', 'doc', t('nav.drafts'),'drafts'], ['/compose', 'pen', t('nav.compose')], ['/calendar', 'cal', t('nav.calendar')]]],
    [t('nav.group.engagement'), [['/messages', 'chat', t('nav.messages'), 'messages'], ['/inbox', 'inbox', t('nav.comments'), 'comments'], ['/insights', 'chart', t('nav.insights')]]],
    ...(isOwner() ? [[t('nav.group.workspace'), [['/accounts', 'users', t('nav.accounts')], ['/media', 'img', t('nav.media')], ['/team', 'team', t('nav.team')], ['/developer', 'key', t('nav.developer')], ['/admin', 'shield', t('nav.audit')]]]] : []),
  ];
}
const PAGE_LABEL = () => Object.fromEntries(navGroups().flatMap(([g, items]) => items.map(([p, , l]) => [p, { label: l, group: g }])));

function openMenuSearch() {
  if (document.querySelector('.menu-command')) return;
  const items=[...navGroups().flatMap(([group,entries])=>entries.map(([path,ic,label])=>({group,path,ic,label}))),{group:t('nav.group.workspace'),path:'/settings',ic:'cog',label:t('nav.settings')},
    ...state.accounts.map(a=>({group:t('nav.accounts'),path:'/accounts/'+encodeURIComponent(a.id),ic:'person',label:`@${a.username} ${a.name||''}`}))];
  const results=h('div',{class:'command-results'});
  const input=h('input',{type:'search',placeholder:t('nav.search'),'aria-label':t('nav.search'),autocomplete:'off',oninput:draw});
  let filtered=items;
  let dialog;
  function draw(){
    const query=input.value.toLocaleLowerCase().trim();filtered=items.filter(x=>(x.label+' '+x.group).toLocaleLowerCase().includes(query));
    results.replaceChildren(...(filtered.length?filtered.map(item=>h('button',{type:'button',class:'command-item',onclick:()=>{dialog.close();go(item.path);}},icon(item.ic),h('span',{},h('b',{},item.label),h('small',{},item.group)))):[h('p',{class:'empty'},t('nav.search.empty'))]));
  }
  dialog=modal(t('nav.search.title'),h('div',{},h('div',{class:'command-search'},icon('search'),input),results,h('p',{class:'command-help'},t('nav.search.help'))));
  dialog.classList.add('menu-command');draw();input.focus();
  dialog.addEventListener('keydown',event=>{
    if(!['ArrowDown','ArrowUp'].includes(event.key))return;
    const buttons=[...results.querySelectorAll('button')];if(!buttons.length)return;
    event.preventDefault();let index=buttons.indexOf(document.activeElement);
    index=event.key==='ArrowDown'?(index+1)%buttons.length:(index-1+buttons.length)%buttons.length;buttons[index].focus();
  });
  input.addEventListener('keydown',event=>{if(event.key==='Enter'&&filtered.length){event.preventDefault();dialog.close();go(filtered[0].path);}});
  api('GET','/v1/generator/plans').then(result=>{
    for(const p of result.data||[])items.push({group:t('nav.drafts'),path:'/generator/drafts?plan='+encodeURIComponent(p.id),ic:'doc',label:(p.brief||'').replace(/^#+\s*/,'').split('\n')[0]||t('nav.drafts')});
    draw();
  }).catch(()=>{});
}
function setNavigation(open) {
  const mobile=matchMedia('(max-width:1023px)').matches;
  document.body.classList.toggle('side-open',mobile&&open);
  const aside=document.querySelector('#main-navigation'),col=document.querySelector('.col');
  if(aside)aside.inert=mobile&&!open;
  if(col)col.inert=mobile&&open;
  document.querySelector('.menu-btn')?.setAttribute('aria-expanded',String(mobile&&open));
}
window.addEventListener('resize',()=>setNavigation(false));
document.addEventListener('keydown',event=>{
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'&&state.user){
    const existing=document.querySelector('.menu-command');
    if(existing){event.preventDefault();existing.close();}
    else if(!document.querySelector('dialog[open]')){event.preventDefault();openMenuSearch();}
  }
  if(document.body.classList.contains('side-open')){
    if(event.key==='Escape'){setNavigation(false);document.querySelector('.menu-btn')?.focus();}
    if(event.key==='Tab'){
      const controls=[...document.querySelectorAll('.side a,.side button')].filter(el=>!el.disabled&&el.getClientRects().length);
      if(controls.length){const first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
    }
  }
});

let clockTimer;
function shell(active, content) {
  const info = PAGE_LABEL()[active] || (active==='/settings'?{label:t('nav.settings'),group:t('nav.group.workspace')}:{ label: 'LRMsmm', group: '' });
  content.classList.add('wrap');
  const clock = h('div', { class: 'clock', title: t('nav.time.jakarta') });
  const tick = () => { clock.textContent = `${fmtTime(new Date().toISOString())} WIB`; };
  tick(); clearInterval(clockTimer); clockTimer = setInterval(tick, 30000);
  const close = () => setNavigation(false);
  const nav = h('nav', { class: 'nav', 'aria-label': t('nav.main.menu') },
    navGroups().map(([group, items]) => h('div', { class: 'nav-group' },
      h('div', { class: 'nav-h' }, group),
      h('div', { class: 'nav-items' }, items.map(([path, symbol, label, badge]) =>
        h('a', { href: `#${path}`, class: `${active === path ? 'on' : ''} ${path === '/generator/drafts' ? 'nav-sub' : ''}`,
          'aria-current': active === path ? 'page' : null,
          onclick: () => { close(); if (active === path) queueMicrotask(route); } },
          icon(symbol), h('span', { class: 'lbl' }, label), badge ? badgeEl(badge) : null))))));
  const search = h('button', { type: 'button', class: 'side-search', onclick: openMenuSearch, 'aria-label': t('nav.search') },
    icon('search'), h('span', {}, t('nav.search')), h('kbd', {}, navigator.platform.includes('Mac') ? t('nav.search.shortcut') : 'Ctrl K'));
  const userMenu = h('details', { class: 'user-menu' },
    h('summary', { class: 'ucard' }, h('div', { class: 'who' },
      h('div', { class: 'ini' }, initials(state.user?.name || state.user?.email)),
      h('div', { style: { minWidth: 0 } }, h('div', { class: 'nm' }, state.user?.name || state.user?.email),
        h('div', { class: 'rl' }, ROLE[state.user?.role] || ''))), icon('dots-vertical')),
    h('div', { class: 'user-menu-items' },
      h('a', { href: '#/settings', onclick: close }, icon('cog'), t('nav.settings')),
      h('button', { type: 'button', onclick: async () => {
        await api('POST', '/auth/logout'); state.user = null; live.stop(); go('/login');
      } }, icon('logout'), t('nav.signout'))));
  const side = h('aside', { class: 'side', id: 'main-navigation', inert: matchMedia('(max-width:1023px)').matches ? true : null },
    h('div', {}, h('div', { class: 'side-top' }, logo(),
      h('button', { class: 'side-close', 'aria-label': t('nav.menu.close'), onclick: close }, icon('x'))), search, nav),
    h('div', { class: 'side-foot' }, userMenu));
  const breadcrumb = h('div', { class: 'crumb' },
    info.group ? h('span', {}, info.group) : null,
    info.group ? h('span', { class: 'sep' }, '/') : null,
    h('b', {}, info.label));
  const header = h('header', { class: 'hdr' }, h('div', { class: 'hdr-in' },
    h('div', { class: 'hdr-l' },
      h('button', { class: 'menu-btn', 'aria-label': t('nav.menu.open'), 'aria-controls': 'main-navigation',
        'aria-expanded': 'false', onclick: () => { setNavigation(true); document.querySelector('.side-close')?.focus(); } }, icon('menu')),
      breadcrumb),
    h('div', { class: 'hdr-r' }, clock,
      h('a', { class: 'chip', href: '#/compose' }, icon('pen'), h('span', { class: 'chip-t' }, t('nav.compose'))),
      h('a', { class: 'chip', href: '#/messages', title: t('nav.messages') }, icon('bell'), badgeEl('messages')),
      h('span', { class: 'role' }, initials(state.user?.name || state.user?.email)))));
  const main = h('main', { class: 'main' },
    state.mock ? h('div', { class: 'wrap', style: { marginBottom: '1.5rem' } },
      h('div', { class: 'mock-banner' }, icon('warn'), t('nav.mock'))) : null, content);
  return h('div', { class: 'app' }, side, h('div', { class: 'scrim', onclick: close }), h('div', { class: 'col' }, header, main));
}

// HRD-style page header: eyebrow pill + extrabold title + description, actions on the right
function pagehead(title, sub, ...actions) {
  return h('div', { class: 'pagehead' },
    h('div', {}, h('h1', {}, title), sub ? h('p', {}, sub) : null),
    h('div', { class: 'row' }, actions));
}
// HRD stat card: label, big number, icon tile, footer with link
const stat = (href, ic, value, label, foot, tone = 'em', alert = false, linkText = t('home.manage')) =>
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
    try {
      const runs=(await api('GET','/v1/generator/runs')).data||[];
      state.stats.draftSessionsNeedsAction=new Set(runs.filter(r=>['planned','concept_review','review','failed'].includes(r.status)||(r.status==='expired'&&r.expires_at&&Date.now()-new Date(r.expires_at).getTime()<86400000)).map(r=>r.plan_id||r.id)).size;
    }catch{state.stats.draftSessionsNeedsAction=0;}
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
  const el = h('div', { class: 'overdue-pop', role: 'alert' },
    h('a',{href:'#/messages',onclick:()=>el.remove()},h('b', {}, n), h('span', {}, t('legacy.messages_unanswered_for_more_than_5_minutes'))),
    h('button', { class: 'x', type:'button','aria-label': t('legacy.close'), onclick: () => el.remove() }, icon('x')));
  document.body.append(el);
}

// ---------------- auth (HRD login layout) ----------------
function authPage(mode) {
  const next = new URLSearchParams(location.hash.split('?')[1] || '').get('next');
  const setup = mode === 'setup';
  const error=h('p',{class:'auth-error',role:'alert',hidden:true});
  const password=h('input',{name:'password',type:'password',required:true,minlength:setup?8:null,
    autocomplete:setup?'new-password':'current-password',oninput:()=>{error.hidden=true;error.textContent='';}});
  const show=h('button',{type:'button',class:'auth-show',onclick:()=>{
    password.type=password.type==='password'?'text':'password';show.textContent=password.type==='password'?t('login.show'):t('login.hide');
  }},t('login.show'));
  const submit=h('button',{type:'submit',class:'btn primary auth-submit'},setup?t('login.setup.cta'):t('login.cta'));
  const field=(label,attrs)=>h('label',{class:'field'},h('span',{},label),h('input',attrs));
  let submitting=false;
  const form=h('form',{class:'auth-card',onsubmit:async e=>{
    e.preventDefault();if(submitting)return;submitting=true;submit.disabled=true;
    submit.textContent=t('login.pending');error.hidden=true;
    try{
      const r=await api('POST',setup?'/auth/register':'/auth/login',Object.fromEntries(new FormData(form)));
      state.user=r.user;document.getElementById('toast')?.replaceChildren();
      if(next)location.href=next;else go('/');
    }catch(err){const remaining=Number(err.details?.attempts_remaining??err.details?.attempts_left);error.textContent=err.code==='invalid_credentials'&&Number.isFinite(remaining)?t('login.error',{n:remaining}):!setup?t('login.tries'):errMsg(err);error.hidden=false;}
    finally{submitting=false;submit.disabled=false;submit.textContent=setup?t('login.setup.cta'):t('login.cta');}
  }},
    logo('div'),h('h1',{},setup?t('login.setup.title'):t('login.title')),
    h('p',{},setup?t('login.setup.sub'):t('login.sub')),
    setup?field(t('login.name'),{name:'name',autocomplete:'name',placeholder:t('login.name.placeholder')}):null,
    field(t('login.email'),{name:'email',type:'email',required:true,autocomplete:'email',placeholder:t('login.email.placeholder')}),
    h('label',{class:'field'},h('span',{},t('login.password')),h('span',{class:'auth-password'},password,show),error),
    submit,h('div',{class:'auth-note'},icon('lock'),t('login.secure')));
  const feat=(ic,title,body)=>h('div',{class:'feat'},h('div',{class:'ico'},icon(ic)),h('div',{},h('b',{},title),h('span',{},body)));
  return h('div', { class: 'auth' },
    h('div', { class: 'auth-bar' }, logo('div'), h('div', { class: 'clock' }, t('login.clock'))),
    h('div', { class: 'auth-main' }, form,
      h('div', { class: 'auth-side' },
        h('h2', {}, t('login.panel.title')),
        feat('sparkles',t('nav.generator'),t('login.panel.1.body')),
        feat('cal',t('login.panel.2.title'),t('login.panel.2.body')),
        feat('chat',t('login.panel.3.title'),t('login.panel.3.body')))));
}

// ---------------- home (HRD Beranda layout) ----------------
async function pageHome() {
  await loadAccounts();
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
    pagehead(t('home.greeting',{name:first?', '+first:''}), t('legacy.manage_content_and_conversations_for_every_instagram_and_threads_account'),
      h('a', { class: 'btn soft', href: '#/messages' }, icon('chat'), t('legacy.open_messages')),
      h('a', { class: 'btn primary', href: '#/compose' }, icon('plus'), t('legacy.new_post')),
      h('a', { class: 'btn', href: '#/calendar' }, icon('cal'), t('legacy.calendar'))),
    tasks ? h('div', { class: `banner ${stats.messages_overdue || expired.length ? 'red' : ''}` },
      h('div', { class: 'l' }, h('span', { class: 'num' }, tasks),
        h('div', {}, h('h3', {}, t('legacy.needs_action')),
          h('p', {}, [
            stats.messages_overdue ? `${stats.messages_overdue} messages unanswered for more than 5 minutes` : null,
            attention.length ? t('home.failed.posts',{n:attention.length}) : null,
            expired.length ? `${expired.length} accounts need reconnection` : null,
          ].filter(Boolean).join(' · ')))),
      h('div', { class: 'row' },
        stats.messages_overdue ? h('a', { class: 'btn primary sm', href: '#/messages' }, t('legacy.reply_to_messages'), icon('right')) : null,
        attention.length ? h('a', { class: 'btn sm', href: `#/posts/${attention[0].id}` }, t('legacy.review_failed_post')) : null,
        expired.length ? isOwner() ? h('a', { class: 'btn sm', href: '#/accounts' }, t('legacy.reconnect')) : h('span', {}, t('legacy.ask_the_owner_to_reconnect_this_account')) : null)) : null,
    h('div', { class: 'strip' },
      stat(isOwner() ? '#/accounts' : '#/compose', 'users', stats.accounts, t('legacy.active_social_accounts'), `${ig} Instagram · ${state.accounts.length - ig} Threads`, 'em'),
      stat('#/calendar', 'cal', stats.scheduled, t('legacy.scheduled_posts'), upcoming[0] ? t('home.next',{date:fmtDT(upcoming[0].scheduled_at)}) : t('legacy.no_schedule_yet'), 'sky', false, t('legacy.calendar')),
      stat('#/messages', 'chat', stats.messages_waiting, t('legacy.messages_waiting'), stats.messages_overdue ? t('home.overdue',{n:stats.messages_overdue}) : t('legacy.all_within_the_reply_window'), stats.messages_overdue ? 'ro' : 'am', !!stats.messages_overdue, t('home.reply')),
      stat('#/inbox', 'inbox', stats.unreplied, t('legacy.new_comments'), stats.failed_7d ? t('home.failed.week',{n:stats.failed_7d}) : t('legacy.unanswered'), 'pu', false, t('home.open'))),
    h('div', { class: 'panel' },
      h('div', { class: 'sec-h', style: { paddingBottom: '1rem', borderBottom: '1px solid var(--slate-100)', marginBottom: '1rem' } },
        h('div', {}, h('h2', {}, t('legacy.quick_actions')), h('div', { class: 'faint small', style: { fontWeight: 500 } }, t('legacy.shortcuts_for_your_daily_content_work'))),
        h('span', { class: 'mode' }, `${ROLE[state.user.role]} Mode`)),
      h('div', { class: 'quick' }, [
        ['#/compose', 'pen', t('legacy.new_post'), 'IG & Threads', 'em'], ['#/calendar', 'cal', t('legacy.calendar'), t('legacy.content_schedule'), 'sky'],
        ['#/messages', 'chat', t('legacy.messages'), 'DM Instagram', 'ro'], ['#/inbox', 'inbox', t('legacy.comments'), t('legacy.reply_and_moderate'), 'am'],
        ['#/insights', 'chart', 'Insights', t('legacy.account_insights'), 'pu'], ['#/media', 'img', t('legacy.media'), t('legacy.photo_library'), 'em'],
      ].filter(([href]) => isOwner() || href !== '#/media').map(([href, ic, t, d, tone]) => h('a', { class: `q-${tone}`, href }, h('div', { class: 'ico' }, icon(ic)), h('b', {}, t), h('small', {}, d))))),
    stats.accounts===0 && isOwner() ? h('div', { class: 'panel empty' }, h('h2', {}, t('home.onboarding.title')), h('p', {}, t('home.onboarding.body')), h('a', { class: 'btn primary', href: '#/accounts' }, t('accounts.connect'))) : null,
    attention.length ? h('div', {}, secHead('warn', t('legacy.needs_attention'), t('legacy.posts_that_failed_for_at_least_one_account'), ['#/admin?t=failed', isOwner() ? t('legacy.view_all') : '']), postList(attention)) : null,
    h('div', { class: 'grid2' },
      h('div', {}, secHead('cal', t('legacy.coming_up'), t('legacy.the_next_scheduled_posts'), ['#/calendar', t('legacy.open_calendar')]),
        upcoming.length ? postList(upcoming) : h('div', { class: 'list empty' }, t('legacy.no_scheduled_posts_yet'), h('br'), h('a', { class: 'btn primary sm', href: '#/compose' }, t('legacy.schedule_a_post')))),
      h('div', {}, secHead('send', t('legacy.recently_published'), t('legacy.latest_publishing_activity'), ['#/calendar?v=list', t('legacy.view_all')]),
        published.length ? postList(published) : h('div', { class: 'list empty' }, t('legacy.no_published_posts_yet'))))));
}

function postList(posts, linkAttrs = p => ({ href: `#/posts/${p.id}` })) {
  return h('div', { class: 'list' }, posts.map((p) => {
    const m = p.media[0];
    return h('a', { class: 'item', ...linkAttrs(p) },
      m?.url ? (m.type === 'video' ? h('video', { class: 'thumb', src: m.url, muted: true, preload: 'metadata' }) : h('img', { class: 'thumb', src: m.url, alt: '' })) : h('div', { class: 'thumb' }),
      h('div', { class: 'body' },
        h('div', { class: 'title' }, p.content || h('span', { class: 'faint' }, t('legacy.no_caption'))),
        h('div', { class: 'meta' },
          h('span', {}, p.scheduled_at ? fmtDT(p.scheduled_at) : fmtDT(p.created_at)),
          h('span', {}, p.targets.map((t) => `@${t.username}`).join(', ')),
          p.source !== 'dashboard' ? h('span', {}, p.source === 'mcp' ? t('home.ai.source') : t('home.api.source')) : null)),
      status(p.status));
  }));
}

// ---------------- composer ----------------
async function pageCompose(editId) {
  await loadAccounts();
  const query = new URLSearchParams(location.hash.split('?')[1] || '');
  const atParam = query.get('at');
  const aiId = query.get('ai_draft');
  const aiDraft = aiId && !editId ? await api('GET', '/v1/ai/drafts/' + encodeURIComponent(aiId)) : null;
  if (aiDraft?.post_id) { go('/posts/' + aiDraft.post_id); return shell('/compose', h('div')); }
  const [connection, inbox] = await Promise.all([api('GET', '/v1/ai/connection'), api('GET', '/v1/ai/drafts')]);
  const editing = editId ? await api('GET', `/v1/posts/${editId}`) : null;
  const active = state.accounts.filter((a) => a.status === 'active');
  const initial = editing || aiDraft;
  const s = {
    key: crypto.randomUUID(),
    selected: new Set(initial ? initial.targets.map((t) => t.account_id) : active.length === 1 ? [active[0].id] : []),
    content: initial?.content || '',
    media: initial ? initial.media : [],
    per: {}, // account_id -> { content?, options:{} }
    when: initial?.scheduled_at || atParam ? 'later' : 'now',
    at: initial?.scheduled_at ? toLocalInput(initial.scheduled_at) : toLocalInput(atParam || new Date(Date.now() + 3600_000).toISOString()),
  };
  if (initial) for (const t of initial.targets) s.per[t.account_id] = { content: t.content ?? undefined, options: t.options || {} };
  let composeCompany=state.accounts.find(a=>s.selected.has(a.id))?.company_id||'';
  const slides = {};
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
    const ta = h('textarea', { placeholder: t('legacy.write_a_caption'), 'aria-label': 'Caption', oninput: (e) => { s.content = e.target.value; renderPreview(); updateMeter(); } });
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
      h('h3', {}, t('compose.to')),
      state.accounts.length ? h('div',{class:'compose-account-select'},
        h('label',{},t('scope.company.label'),h('select',{value:composeCompany,onchange:e=>{composeCompany=e.target.value;s.selected.clear();render();}},
          h('option',{value:''},t('scope.company.all')),companyGroups().filter(c=>c.accounts.length).map(c=>h('option',{value:c.id},c.name)))),
        ui.accountPicker({accounts:state.accounts.filter(a=>!composeCompany||(a.company_id||'')===composeCompany).map(a=>({...a,disabled:a.status!=='active',disabledReason:t('status.expired')})),
          selected:[...s.selected],onChange:ids=>{s.selected=new Set(ids);render();}}))
        : h('p', { class: 'muted' }, t('compose.accounts.none')+' ', h('a', { href: '#/accounts' }, t('compose.accounts.connect'))),
      ta, meter,
      h('div', { class: 'media-strip' },
        s.media.map((m, i) => h('div', { class: 'tile' },
          m.type === 'video' ? h('video', { src: m.url, muted: true }) : h('img', { src: m.url, alt: m.alt_text || '' }),
          h('span', { class: 'badge' }, i + 1),
          h('button', { type: 'button', 'aria-label': t('compose.media.remove'), onclick: () => { s.media.splice(i, 1); render(); } }, icon('x')))),
        h('button', { type: 'button', class: 'add', onclick: () => pickMedia((picked) => { s.media.push(...picked); render(); }) }, icon('plus'), t('compose.media.add'))),
      sel.length ? h('div', {}, sel.map(perAccount)) : null,
      h('div', { class: 'per-acc' }, h('h3', {}, t('legacy.when')),
        h('p', { class: 'muted small' }, t('legacy.media_is_removed_from_the_server_after_it_publishes_to_every_account_keep_your_originals')),
        h('div', { class: 'when-box' },
          h('div', { class: 'seg' },
            h('button', { type: 'button', class: s.when === 'now' ? 'on' : '', onclick: () => { s.when = 'now'; render(); }, disabled: !!editing }, t('legacy.publish_now')),
            h('button', { type: 'button', class: s.when === 'later' ? 'on' : '', onclick: () => { s.when = 'later'; render(); } }, t('legacy.schedule'))),
          s.when === 'later' ? h('input', { type: 'datetime-local', value: s.at, oninput: (e) => { s.at = e.target.value; renderPreview(); }, 'aria-label': t('legacy.publish_time') }) : null)),
      h('div', { class: 'row end', style: { marginTop: '18px' } },
        editing ? h('a', { class: 'btn', href: `#/posts/${editing.id}` }, t('legacy.cancel')) : null,
        h('button', { class: 'btn primary', onclick: submit, disabled: !sel.length }, editing ? t('legacy.save_changes') : aiDraft ? (s.when === 'now' ? t('legacy.approve_and_publish') : t('legacy.approve_and_schedule')) : s.when === 'now' ? t('legacy.publish_now') : t('legacy.schedule'))),
    ];
  }

  function perAccount(a) {
    const p = per(a.id);
    const o = p.options;
    const custom = p.content !== undefined;
    const body = h('div', { class: 'inner' },
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: custom, onchange: (e) => { p.content = e.target.checked ? s.content : undefined; render(); } }), t('legacy.different_caption_for_this_account')),
      custom ? h('textarea', { style: { marginTop: '8px', minHeight: '80px' }, oninput: (e) => { p.content = e.target.value; renderPreview(); } }, p.content) : null,
      a.platform === 'instagram' ? h('div', { class: 'row', style: { marginTop: '10px' } },
        h('label', { class: 'check' }, 'Format', h('select', { style: { width: 'auto' }, onchange: (e) => { o.format = e.target.value === 'story' ? 'story' : undefined; if (o.format) p.content = ''; render(); } },
          h('option', { value: 'feed', selected: o.format !== 'story' }, t('compose.format.feed')), h('option', { value: 'story', selected: o.format === 'story' }, t('compose.format.story')))),
        s.media.length === 1 && s.media[0].type === 'video' && o.format !== 'story'
          ? h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: o.share_to_feed !== false, onchange: (e) => { o.share_to_feed = e.target.checked; } }), t('legacy.show_reels_in_feed')) : null) : null,
      a.platform === 'threads' ? threadsOptions(o) : null);
    const d = h('details', { class: 'per-acc', open: custom || Object.keys(o).length > 0 }, h('summary', {}, avatar(a), `@${a.username}`, h('span', { class: 'faint small' }, PLAT[a.platform])), body);
    return d;
  }

  function threadsOptions(o) {
    const parts = o.thread || [];
    return h('div', { style: { marginTop: '10px' } },
      h('div', { class: 'row' },
        h('label', { class: 'check' }, 'Topik', h('input', { style: { width: '140px' }, value: o.topic_tag || '', placeholder: 'mis. Kopi', oninput: (e) => { o.topic_tag = e.target.value || undefined; } })),
        h('label', { class: 'check' }, t('legacy.who_can_reply'), h('select', { style: { width: 'auto' }, onchange: (e) => { o.reply_control = e.target.value || undefined; } },
          [['', t('legacy.everyone')], ['accounts_you_follow', t('legacy.people_you_follow')], ['mentioned_only', t('legacy.mentioned_people')], ['followers_only', t('insights.followers')]].map(([v, l]) => h('option', { value: v, selected: (o.reply_control || '') === v }, l))))),
      !s.media.length ? h('label', { class: 'check', style: { marginTop: '10px' } }, h('input', { type: 'checkbox', checked: !!o.poll, onchange: (e) => { o.poll = e.target.checked ? { options: ['', ''] } : undefined; render(); } }), t('legacy.add_poll')) : null,
      o.poll ? h('div', { style: { marginTop: '8px' } }, o.poll.options.map((opt, i) => h('div', { class: 'thread-part' },
        h('input', { value: opt, maxlength: 25, placeholder: t('compose.poll.option',{n:i+1}), oninput: (e) => { o.poll.options[i] = e.target.value; renderPreview(); } }),
        o.poll.options.length > 2 ? h('button', { class: 'btn sm ghost', type: 'button','aria-label':t('legacy.remove_part'), onclick: () => { o.poll.options.splice(i, 1); render(); } }, icon('x')) : null)),
        o.poll.options.length < 4 ? h('button', { class: 'btn sm', type: 'button', onclick: () => { o.poll.options.push(''); render(); } }, t('legacy.add_option')) : null) : null,
      h('div', { style: { marginTop: '10px' } },
        parts.map((p, i) => h('div', { class: 'thread-part' },
          h('textarea', { placeholder: `Bagian ${i + 2} utas`, oninput: (e) => { parts[i] = e.target.value; renderPreview(); } }, typeof p === 'string' ? p : p.text),
          h('button', { class: 'btn sm ghost', type: 'button', 'aria-label': t('legacy.remove_part'), onclick: () => { parts.splice(i, 1); if (!parts.length) delete o.thread; render(); } }, icon('x')))),
        parts.length < 10 ? h('button', { class: 'btn sm', type: 'button', onclick: () => { o.thread = [...parts, '']; render(); } }, t('legacy.add_thread_part')) : null));
  }

  function renderPreview() {
    const sel = state.accounts.filter((a) => s.selected.has(a.id));
    const when = s.when === 'later' && s.at ? fmtDT(new Date(s.at).toISOString()) : t('compose.now');
    const cards = sel.map((a) => {
      const p = per(a.id);
      const text = p.content !== undefined ? p.content : s.content;
      const m = s.media;
      const mediaEl = (x) => x.type === 'video' ? h('video', { src: x.url, muted: true, autoplay: true, loop: true, playsinline: true }) : h('img', { src: x.url, alt: x.alt_text || '' });
      if (a.platform === 'instagram') {
        const story = p.options.format === 'story';
        const index = Math.min(slides[a.id] || 0, Math.max(0, m.length - 1));
        const item = m[index];
        const ratio = story ? '9 / 16' : m[0]?.width && m[0]?.height ? String(m[0].width / m[0].height) : '4 / 5';
        const move = (delta) => { slides[a.id] = (index + delta + m.length) % m.length; renderPreview(); };
        return h('div', { class: 'pv instagram' },
          h('div', { class: 'hd' }, avatar(a), a.username, h('span', { class: 'when' }, when)),
          h('div', { class: `img ${story ? 'story' : ''}`, style: { aspectRatio: ratio } }, item ? mediaEl(item) : t('legacy.instagram_needs_a_photo_or_video'),
            m.length > 1 ? h('span', { class: 'slide-count' }, `${index + 1}/${m.length}`) : null,
            m.length > 1 ? h('button', { type: 'button', class: 'slide-prev', 'aria-label': t('compose.previous.slide'), onclick: () => move(-1) }, icon('chevron-left')) : null,
            m.length > 1 ? h('button', { type: 'button', class: 'slide-next', 'aria-label': t('compose.next.slide'), onclick: () => move(1) }, icon('right')) : null),
           !story ? h('div', { class: 'ig-actions', 'aria-hidden': 'true' }, icon('chat'), icon('send'), h('span', {}, icon('grid'))) : null,
          m.length > 1 && !story ? h('div', { class: 'slide-dots' }, m.map((_, i) => h('button', { type: 'button', class: i === index ? 'on' : '', 'aria-label': `Slide ${i + 1}`, 'aria-pressed': String(i === index), onclick: () => { slides[a.id] = i; renderPreview(); } }))) : null,
          !story && text ? h('div', { class: 'cap' }, h('b', {}, a.username), text) : null,
          h('div', { class: 'pv-note' }, story ? t('compose.preview.story') : m.length > 1 ? t('compose.preview.carousel') : item?.type === 'video' ? t('compose.preview.reels') : t('compose.preview.feed'), ' · ',t('compose.preview.note')),
          len(text) > 2200 ? h('div', { class: 'warn' }, `Kelebihan ${len(text) - 2200} karakter`) : null);
      }
      const parts = p.options.thread || [];
      return h('div', { class: 'pv threads' },
        h('div', { class: 'hd' }, avatar(a), a.username, h('span', { class: 'when' }, when)),
        text ? h('div', { class: 'tbody' }, text) : null,
        m.length ? h('div', { class: 'tmedia' }, m.slice(0, 3).map(mediaEl)) : null,
        p.options.poll ? h('div', { class: 'poll' }, p.options.poll.options.map((x, i) => h('div', {}, x || t('compose.poll.option',{n:i+1})))) : null,
        parts.map((t) => h('div', { class: 'tpart' }, typeof t === 'string' ? t : t.text)),
        len(text) > 500 ? h('div', { class: 'warn' }, `Kelebihan ${len(text) - 500} karakter — Threads maks 500`) : null);
    });
    right.replaceChildren(h('h3', {}, t('legacy.preview_before_publishing')), h('div', { class: 'previews' }, cards.length ? cards : h('div', { class: 'pv-empty' }, t('legacy.choose_an_account_to_preview_instagram_and_threads_side_by_side'))));
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
    const body = { content: s.content, media_ids: s.media.map((m) => m.id), targets, ...(aiDraft ? { ai_draft_id: aiDraft.id } : {}) };
    if (s.when === 'later') {
      if (!s.at) return toast(t('legacy.choose_a_publish_time'), true);
      body.scheduled_at = new Date(s.at).toISOString();
    }
    btn.disabled = true;
    try {
      const p = editing ? await api('PATCH', `/v1/posts/${editing.id}`, body) : await api('POST', '/v1/posts', body, { headers: { 'Idempotency-Key': s.key } });
      toast(editing ? t('compose.change.saved') : s.when === 'now' ? t('compose.publishing') : t('compose.scheduled',{date:fmtDT(p.scheduled_at)}));
      go(`/posts/${p.id}`);
    } catch (err) {
      btn.disabled = false;
      const who = err.details?.account_id ? state.accounts.find((a) => a.id === err.details.account_id) : null;
      toast(`${who ? `@${who.username}: ` : ''}${errMsg(err)}`, true);
    }
  }

  render();
  function connectionHelp() {
    modal(t('compose.oauth.title'), h('div', {},
      h('p', {}, t('legacy.open_chatgpt_with_your_own_account_add_a_custom_mcp_connector_in_settings_apps_connectors_if_your_plan_supports_it')),
      h('p', {}, t('developer.connector.url'), h('code', {}, connection.mcp_url)),
      h('p', {}, t('legacy.choose_oauth_and_sign_in_with_your_own_lrmsmm_account_allow_read_and_draft_access_do_not_use_the_owner_account')),
      h('p', {}, t('legacy.in_chatgpt_create_images_and_a_caption_choose_accounts_and_send_a_draft_with_submit_post_draft_review_it_in_new_post_before_publishing')),
      h('p', { class: 'muted small' }, t('compose.oauth.media.help')),
      h('a', { class: 'btn primary', href: 'https://chatgpt.com/', target: '_blank', rel: 'noopener noreferrer' }, t('developer.chatgpt.open'))));
  }
  const aiPanel = h('section', { class: 'panel', 'aria-label': t('legacy.personal_ai_connections') },
    h('div', { class: 'sec-h' }, h('h2', {}, t('legacy.personal_ai_connections')), h('button', { class: 'btn', onclick: connectionHelp }, t('compose.ai.connect'))),
    h('p', { class: 'muted small' }, t('compose.ai.account',{email:state.user.email,status:connection.connected?t('compose.ai.connected'):t('compose.ai.disconnected')})),
    connection.apps.map(app => h('div', { class: 'row' }, h('span', {}, app.name || t('compose.ai.app')),
      h('button', { class: 'btn sm ghost', onclick: async () => { try { await api('DELETE', '/v1/ai/connections/' + app.id); toast(t('compose.ai.revoked')); route(); } catch(error) { toast(errMsg(error), true); } } }, t('compose.ai.revoke')))),
    h('button', { class: 'btn sm', onclick: route }, t('compose.ai.load')),
    inbox.data.length ? h('div', { class: 'list' }, inbox.data.map(draft => h('a', { class: 'item', href: '#/compose?ai_draft=' + draft.id },
      draft.media[0]?.url ? (draft.media[0].type === 'video' ? h('video', { class: 'thumb', src: draft.media[0].url, muted: true, preload: 'metadata' }) : h('img', { class: 'thumb', src: draft.media[0].url, alt: t('compose.ai.media') })) : null,
      h('div', { class: 'body' }, h('b', {}, `${draft.source} · awaiting approval`), h('p', {}, draft.content.slice(0, 160)), h('span', { class: 'faint small' }, fmtDT(draft.created_at)))))) : h('p', { class: 'faint small' }, t('legacy.no_ai_drafts_need_approval')));
  return shell('/compose', h('div', {}, pagehead(editing ? t('compose.edit') : t('legacy.new_post'), t('legacy.review_the_caption_images_and_accounts_before_final_approval')), aiPanel,
    aiDraft ? h('div', { class: 'banner' }, t('legacy.ai_draft_loaded_check_its_images_caption_accounts_and_schedule_before_publishing')) : null, root));
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
      x.onload = () => { const j = JSON.parse(x.responseText || '{}'); x.status < 300 ? res(j) : rej(Object.assign(new Error(j.error?.message || t('legacy.upload_failed')), { code: j.error?.code })); };
      x.onerror = () => rej(new Error(t('compose.connection.lost')));
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
      h('div', { class: 'info' }, m.type === 'video' ? t('media.video.duration',{n:Math.round((m.duration_ms||0)/1000)}) : `${m.width} × ${m.height}`));
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
  const d = modal(t('legacy.choose_media'), h('div', {},
    h('div', { class: 'drop' }, h('p', {}, t('posts.upload.help')), h('button', { class: 'btn', onclick: () => input.click() }, t('legacy.choose_files')), input, prog),
    lib.data.length ? grid : h('p', { class: 'muted' }, t('posts.media.empty'))),
  [h('button', { class: 'btn', onclick: () => d.close() }, t('legacy.cancel')), h('button', { class: 'btn primary', onclick: () => { d.close(); onDone(chosen); } }, t('legacy.use_selected'))]);
}

// ---------------- post detail ----------------
async function pagePost(id) {
  let p = await api('GET', `/v1/posts/${id}`);
  const box = h('div');
  const draw = () => {
    const editable = p.status === 'scheduled';
    box.replaceChildren(
      pagehead(p.scheduled_at ? t('draft.scheduled',{date:fmtDT(p.scheduled_at)}) : t('draft.created',{date:fmtDT(p.created_at)}), null,
        status(p.status),
        editable ? h('a', { class: 'btn', href: `#/compose/${p.id}` }, t('legacy.edit')) : null,
        editable ? h('button', { class: 'btn', onclick: () => act('publish', t('compose.publishing')) }, t('legacy.publish_now')) : null,
        editable ? h('button', { class: 'btn danger', onclick: async () => {if(await confirmDialog({title:t('post.cancel.title'),body:t('post.cancel.body'),tone:'danger',confirmLabel:t('post.cancel.cta')}))await act('cancel',t('status.cancelled'));} }, t('post.cancel')) : null,
        ['failed', 'partial'].includes(p.status) ? h('button', { class: 'btn primary', onclick: () => act('retry', t('post.retrying')) }, t('legacy.retry_failed')) : null),
      h('div', { class: 'grid2' },
        h('div', { class: 'panel' }, h('h2', {}, t('legacy.content')),
          h('p', { style: { whiteSpace: 'pre-wrap' } }, p.content || h('span', { class: 'faint' }, t('post.no.shared.text'))),
          p.media.length ? h('div', { class: 'media-strip' }, p.media.filter(m => m.url).map((m) => h('div', { class: 'tile' }, m.type === 'video' ? h('video', { src: m.url, muted: true, controls: true }) : h('img', { src: m.url, alt: m.alt_text || '' })))) : null,
          p.media.some(m => m.status === 'purged') ? h('p', { class: 'muted small' }, t('legacy.media_was_removed_from_the_server_after_publishing_use_the_post_link_to_see_it')) : null,
          h('p', { class: 'faint small' }, t('posts.source',{name:p.source==='mcp'?'AI (MCP)':p.source==='api'?'REST API':'dashboard'}))),
        h('div', { class: 'panel' }, h('h2', {}, t('legacy.status_by_account')),
          p.targets.map((dest) => h('div', { class: 'target-row' },
            plat(dest.platform), h('b', {}, `@${dest.username}`), h('span', { class: 'spacer' }), status(dest.status),
            dest.permalink ? h('a', { class: 'btn sm', href: dest.permalink, target: '_blank', rel: 'noopener' }, dest.platform === 'instagram' ? t('legacy.open_on_instagram') : t('legacy.open_on_threads')) : dest.status === 'published' ? h('span', { class: 'muted small' }, dest.options?.format === 'story' ? t('legacy.stories_do_not_have_a_permanent_post_link') : t('legacy.meta_has_not_provided_a_post_link_yet')) : null,
            dest.error_code ? h('div', { class: 'err-box' }, h('b', {}, ERR[dest.error_code] || t('error.unknown')), dest.error_message ? technicalDetails({message:dest.error_message}) : null,
              dest.error_code === 'account_expired' ? h('a', { class: 'btn sm', style: { marginTop: '6px' }, href: `/connect/${dest.platform}` }, t('accounts.reconnect')) : null) : null,
            dest.content != null ? h('div', { class: 'small muted', style: { width: '100%', whiteSpace: 'pre-wrap' } }, t('post.custom.text',{text:dest.content || t('post.custom.empty')})) : null)))),
      p.status !== 'scheduled' && !['publishing', 'cancelled'].includes(p.status) ? h('div', { class: 'row', style: { marginTop: '16px' } },
        h('button', { class: 'btn ghost danger sm', onclick: async () => { if (!await confirmDialog({title:t('post.remove.title'),body:t('post.remove.body'),tone:'danger',confirmLabel:t('post.remove.cta')})) return; await api('POST', `/v1/posts/${p.id}/remove`); toast(t('post.removed')); go('/calendar'); } }, t('post.remove.cta'))) : null);
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

function agentActivity(r) {
  const roles=[['concept',t('legacy.concept'),'KC'],['revision','Revisi','KR'],['visual',t('generator.agent.visual'),'VC'],['image',t('generator.agent.image'),'IC'],['final',t('generator.stage.final'),'FR']];
  const done=roles.filter(([role])=>r.steps[role]?.status==='done').length;
  return h('section',{class:'agent-activity','aria-label':t('generator.activity')},
    h('div',{class:'agent-activity-head'},h('b',{},t('generator.team')),h('span',{class:'muted small'},r.status==='running'?t('generator.team.running'):r.status==='queued'?t('legacy.waiting_for_the_next_stage'):r.status==='failed'?t('legacy.stopped_check_the_failed_stage'):t('generator.stages.done',{done,total:roles.length}))),
    h('div',{class:'agent-workfloor'},roles.map(([role,name,initials])=>{
      const step=r.steps[role];
      const state=step?.status==='done'?'done':step?.status==='running'&&r.status==='running'?'working':step?.status==='running'&&r.status==='failed'?'error':'waiting';
      return h('div',{class:`agent-desk ${state}`,'data-agent':role,'data-state':state},h('div',{class:'agent-orbit'},h('div',{class:'agent-face'},initials),h('i',{class:'agent-signal'})),h('b',{},name),h('span',{class:'agent-state'},step?.status==='manual'?t('legacy.review_video_manually'):state==='working'?t('generator.working'):state==='done'?t('status.done'):state==='error'?t('legacy.needs_action'):t('legacy.waiting')),role==='image'&&step?h('small',{},t('generator.images.progress',{done:step.completed_slides||0,total:r.slide_count})):null,h('div',{class:'agent-wave','aria-hidden':'true'},h('i'),h('i'),h('i'),h('i')));
    })),h('div',{class:'agent-total-progress',role:'progressbar','aria-label':t('legacy.ai_stages_completed'),'aria-valuemin':'0','aria-valuemax':String(roles.length),'aria-valuenow':String(done)},h('i',{style:{width:`${done/roles.length*100}%`}})));
}
const wibInput = iso => iso ? new Date(Date.parse(iso) + 7 * 3600000).toISOString().slice(0,16) : '';
const wibIso = value => value ? new Date(value + ':00+07:00').toISOString() : null;
function conceptReviewPanel(r,approve) {
  if(r.status!=='concept_review')return null;
  const plan=r.steps.revision?.output;if(!plan)return null;
  const title=h('input',{'aria-label':t('draft.concept.title'),value:plan.title});
  const caption=h('textarea',{'aria-label':t('draft.concept.caption'),maxlength:2200},plan.caption);
  const prompts=plan.slides.map((slide,i)=>h('textarea',{'aria-label':t('draft.visual.direction',{n:i+1}),maxlength:6000},slide.prompt));
  return h('section',{class:'panel concept-review-panel'},h('h2',{},t('legacy.review_concept_before_making_images')),
    h('p',{class:'muted small'},t('legacy.concept_and_review_are_complete_no_image_cost_yet_edit_the_concept_then_approve_to_continue')),
    h('label',{},t('draft.title'),title),h('label',{},'Caption',caption),...prompts.map((input,i)=>h('label',{},t('draft.visual.slide',{n:i+1}),input)),
    h('button',{class:'btn primary',onclick:async()=>{if(await confirmDialog({title:t('draft.dialog.images',{n:plan.slides.length}),body:t('draft.dialog.images.body'),tone:'cost',confirmLabel:t('draft.images.approve'),details:[[t('draft.cost.images'),plan.slides.length],[t('draft.cost.runs'),t('draft.images.run')],[t('draft.cost.key'),t('draft.cost.provider')]]}))await approve({title:title.value,caption:caption.value,slides:prompts.map(input=>({prompt:input.value}))});}},t('draft.images.approve')));
}
async function pageContentDrafts(nav) {
  await loadAccounts();
  ui.readScopeFromUrl('drafts');
  const query = new URLSearchParams(location.hash.split('?')[1] || '');
  const requestedPlan = query.get('plan') || '';
  const requestedPlans=(query.get('plans')||'').split(',').filter(Boolean);
  let selectedId = query.get('id') || '', last = '', stopped = false, fetching = false;
  const selectedDrafts=new Set();let visibleDrafts=[],gallerySignature='';
  const deletable=r=>['planned','concept_review','review','failed','cancelled'].includes(r.status)&&!r.post_id&&!r.draft_id;
  const edits = {}, chosenMedia = {}, previewSlides = {};
  const planSelect = h('select', { 'aria-label':t('legacy.filter_plans'), onchange:()=>{selectedId='';last='';refresh();} }, h('option',{value:''},t('legacy.all_plans')));
  const plans = (await api('GET','/v1/generator/plans')).data;
  if(requestedPlans.length)planSelect.append(h('option',{value:'session',selected:true},`This session · ${requestedPlans.length} accounts`));
  plans.forEach(p=>planSelect.append(h('option',{value:p.id,selected:p.id===requestedPlan},t('draft.plan.option',{n:p.content_count,posts:p.content_count===1?'post':'posts',range:fmtRange(p.start_date,p.end_date),brief:p.brief.slice(0,50)}))));
  const statusFilter = h('select',{'aria-label':t('legacy.draft_status'),onchange:()=>{selectedId='';last='';refresh();}},h('option',{value:'pending',selected:!query.get('status')||query.get('status')==='pending'},t('legacy.needs_approval')),h('option',{value:'all',selected:query.get('status')==='all'},t('legacy.all')),h('option',{value:'approved',selected:query.get('status')==='approved'},t('legacy.on_the_calendar')));
  const list=h('div',{class:'draft-list draft-gallery'}), detail=h('div',{class:'draft-editor'}), summary=h('p',{class:'muted small'});
  const selectedCount=h('span',{role:'status'}), selectAll=h('input',{type:'checkbox','aria-label':t('legacy.select_all_deletable_drafts'),onchange:()=>{for(const r of visibleDrafts.filter(deletable))selectAll.checked?selectedDrafts.add(r.id):selectedDrafts.delete(r.id);last='';refresh();}});
  const bulkDelete=h('button',{class:'btn danger',disabled:true,onclick:async()=>{const ids=[...selectedDrafts];if(!ids.length||!await confirmDialog({title:t('draft.delete.title',{n:ids.length}),body:t('draft.delete.body'),tone:'danger',confirmLabel:`Delete ${ids.length} drafts`}))return;bulkDelete.disabled=true;try{const result=await api('POST','/v1/generator/drafts/delete',{ids});selectedDrafts.clear();if(ids.includes(selectedId)){selectedId='';editor.close();}last='';toast(`${result.deleted} drafts deleted`);await refresh();}catch(e){toast(errMsg(e),true);bulkDelete.disabled=false;}}},t('draft.remove.selected'));
  const editor=h('dialog',{class:'draft-preview-dialog','aria-label':t('legacy.preview_and_edit_draft')},h('div',{class:'draft-dialog-head'},h('h2',{},t('legacy.preview_content')),h('button',{class:'btn',onclick:()=>editor.close(),'aria-label':t('legacy.close_draft_preview')},t('legacy.close'))),detail);
  const bulkBar=h('div',{class:'draft-bulkbar'},h('label',{class:'check'},selectAll,t('legacy.select_all')),selectedCount,h('button',{class:'btn',onclick:()=>{selectedDrafts.clear();last='';refresh();}},t('legacy.clear_selection')),bulkDelete);
  function updateSelection(){selectedCount.textContent=t('draft.selected',{n:selectedDrafts.size});selectedCount.hidden=!selectedDrafts.size;bulkDelete.hidden=!selectedDrafts.size;bulkBar.querySelector('button').hidden=!selectedDrafts.size;bulkDelete.disabled=!selectedDrafts.size;const allowed=visibleDrafts.filter(deletable);selectAll.checked=allowed.length>0&&allowed.every(r=>selectedDrafts.has(r.id));selectAll.indeterminate=allowed.some(r=>selectedDrafts.has(r.id))&&!selectAll.checked;selectAll.disabled=!allowed.length;}

  const labels={concept_review:t('legacy.review_concept'),planned:t('legacy.plan_only'),queued:t('legacy.waiting_for_ai'),running:t('legacy.ai_in_progress'),review:t('legacy.needs_approval'),failed:t('legacy.failed_can_revise'),drafted:t('legacy.in_new_post'),approved:t('legacy.scheduled'),cancelled:t('legacy.cancelled')};
  const act=(text,fn,primary=false)=>h('button',{class:`btn ${primary?'primary':''}`,onclick:async e=>{e.currentTarget.disabled=true;try{await fn();last='';await refresh();}catch(error){toast(errMsg(error),true);}finally{e.target.disabled=false;}}},text);
  function draw(r) {
    const edit=edits[r.id] ||= {content:r.caption,brief:r.brief,at:wibInput(r.scheduled_at),references:r.references||[],reference_notes:r.reference_notes||'',reference_roles:r.reference_roles||{}};
    const editable=['planned','concept_review','review','failed'].includes(r.status);
    const noEmoji=r.targets?.some(target=>!readContentPrefs(target.account_id).emoji);
    const captionWarning=ui.chip(t('content.emoji.warning'),'warn');
    captionWarning.hidden=!noEmoji||!hasCaptionEmoji(edit.content);
    const caption=h('textarea',{'aria-label':t('legacy.draft_caption'),maxlength:2200,oninput:e=>{edit.content=e.target.value;captionWarning.hidden=!noEmoji||!hasCaptionEmoji(edit.content);}},edit.content);
    const prompt=h('textarea',{'aria-label':t('legacy.draft_prompt'),maxlength:10000,oninput:e=>{edit.brief=e.target.value;}},edit.brief);
    const at=h('input',{type:'datetime-local',value:edit.at,'aria-label':t('legacy.draft_schedule_wib'),oninput:e=>{edit.at=e.target.value;}});
    const images=chosenMedia[r.id] || r.media;
    const index=Math.min(previewSlides[r.id]||0,Math.max(0,images.length-1));
    const acc=state.accounts.find(a=>a.id===r.targets[0]?.account_id);
    const save=async()=>{
      const data={content:edit.content,brief:edit.brief,scheduled_at:wibIso(edit.at)};
      if(chosenMedia[r.id]) data.media_ids=chosenMedia[r.id].map(m=>m.id);
      const updated=await api('PATCH',`/v1/generator/runs/${r.id}`,data);delete chosenMedia[r.id];return updated;
    };
    const mediaPicker=()=>pickMedia(picked=>{chosenMedia[r.id]=picked;previewSlides[r.id]=0;draw(r);});
    const image=images[index];
    detail.replaceChildren(h('div',{class:'panel'},h('div',{class:'row'},h('h2',{},r.title||t('legacy.drafts')),h('span',{class:'spacer'}),h('span',{class:'pill'},labels[r.status]||r.status)),
      ['queued','running','failed'].includes(r.status)?agentActivity(r):null,
      h('p',{class:'muted small'},r.targets.map(t=>state.accounts.find(a=>a.id===t.account_id)?.username||'').map(u=>'@'+u).join(', ')),
      r.expires_at?h('p',{class:'draft-expiry'},`Auto-deletes ${fmtDT(r.expires_at)} if unchanged for 7 days.`):null,
      conceptReviewPanel(r,async concept=>{await api('POST',`/v1/generator/runs/${r.id}/approve-concept`,{concept,confirm_cost:true});delete edits[r.id];last='';await refresh();toast(t('generator.concept.approved'));}),
      h('div',{class:'draft-review'},
        h('div',{class:'pv instagram'},h('div',{class:'hd'},acc?avatar(acc):null,acc?.username||t('legacy.instagram_preview')),h('div',{class:'img'},image?.url ? image.type==='video'?h('video',{src:image.url,controls:true,muted:true}):h('img',{src:image.url,alt:`Slide ${index+1}`}):image?.status==='purged'?t('legacy.file_removed_after_publishing'):t('legacy.no_photo_yet_create_one_with_ai_or_upload_your_own')),
          images.length>1?h('div',{class:'row gen-slide-controls'},h('button',{class:'btn','aria-label':t('compose.previous.slide'),onclick:()=>{previewSlides[r.id]=(index+images.length-1)%images.length;draw(r);}},icon('chevron-left')),h('span',{},`${index+1}/${images.length}`),h('button',{class:'btn','aria-label':t('compose.next.slide'),onclick:()=>{previewSlides[r.id]=(index+1)%images.length;draw(r);}},icon('right'))):null,
          h('div',{class:'cap'},h('b',{},acc?.username||''),edit.content)),
        h('div',{},h('label',{},'Caption',caption),captionWarning,h('label',{},t('legacy.publish_date_and_time_wib'),at),r.story_episode?h('p',{class:'pill'},`Episode ${r.story_episode} · ${r.content_type}`):null,r.schedule_reason?h('p',{class:'schedule-reason'},t('draft.schedule.reason',{reason:r.schedule_reason})):null,
          h('p',{class:'faint small'},t('legacy.suggested_times_12_15_or_19_15_wib_these_are_general_suggestions_choose_the_final_schedule')),
          r.error?h('div',{class:'err-box'},t('error.provider'),technicalDetails({message:r.error})):null,
          editable?h('div',{class:'row'},act(t('legacy.upload_or_replace_photo'),mediaPicker),act(t('legacy.save_draft'),async()=>{await save();toast(t('legacy.draft_saved_it_is_not_on_the_live_schedule'));})) : null,
          editable&&(r.status==='review'||chosenMedia[r.id]?.length)?act(t('legacy.approve_to_calendar'),async()=>{
            if(!edit.at) throw new Error(t('legacy.choose_a_publish_date_and_time_first'));
            if(!await confirmDialog({title:t('draft.dialog.approve.single'),body:t('draft.dialog.approve.single.body'),confirmLabel:t('draft.approve.one'),details:[['Account',acc?'@'+acc.username:''],['Schedule',fmtSlot(wibIso(edit.at))]]}))return;
            await save();const p=await api('POST',`/v1/generator/runs/${r.id}/approve`,{content:edit.content,scheduled_at:wibIso(edit.at)});toast(t('legacy.approved_and_added_to_content_calendar'));delete edits[r.id];
          },true):null,
          r.post_id?h('a',{class:'btn primary',href:'#/posts/'+r.post_id},t('legacy.open_scheduled_post')):null,
          r.status==='drafted'&&r.draft_id?h('a',{class:'btn',href:'#/compose?ai_draft='+r.draft_id},t('legacy.continue_in_new_post')):null)),
      editable?h('details',{},h('summary',{},t('legacy.edit_prompt_or_generate_again')),prompt,h('p',{class:'faint small'},t('legacy.assets_used_by_this_draft_are_saved_as_a_snapshot_update_the_brand_kit_for_future_posts_in_account_details')),h('div',{class:'row'},r.targets.map(t=>h('a',{class:'btn sm',href:'#/accounts/'+encodeURIComponent(t.account_id)+'?tab=brand'},t('draft.brandkit.account',{handle:state.accounts.find(a=>a.id===t.account_id)?.username||''})))),
        h('p',{class:'muted small'},t('legacy.uploading_your_own_photo_has_no_ai_cost_generating_again_reruns_the_agents_and_charges_your_provider_key')),
        h('div',{class:'row'},r.status==='planned'?act(t('draft.create.ai'),async()=>{await save();if(await confirmDialog({title:t('draft.dialog.concepts',{n:1}),body:t('draft.dialog.concepts.body'),tone:'cost',confirmLabel:t('draft.create'),details:[[t('draft.cost.slides'),r.slide_count],[t('draft.cost.runs'),t('draft.cost.concept')],[t('draft.cost.images'),t('draft.cost.after')],[t('draft.cost.key'),t('draft.cost.provider')]]}))await api('POST',`/v1/generator/runs/${r.id}/start`,{confirm_cost:true});}):null,
          act(t('draft.revise.again'),async()=>{if(!await confirmDialog({title:t('draft.dialog.revise'),body:t('draft.dialog.revise.body'),tone:'cost',confirmLabel:t('draft.revise.cta'),details:[[t('draft.cost.runs'),t('draft.cost.agent')],[t('draft.cost.key'),t('draft.cost.provider')]]}))return;await save();const next=await api('POST',`/v1/generator/runs/${r.id}/revise`,{request_id:crypto.randomUUID(),brief:edit.brief,confirm_cost:true});selectedId=next.id;}))) : null,
      r.status==='review'&&r.steps.revision?.output?.slides?.[index]?h('section',{class:'panel'},h('h3',{},t('draft.slide.only',{n:index+1})),h('p',{class:'muted small'},t('legacy.other_slides_and_the_concept_are_kept_only_this_image_and_final_review_run_again')),
        h('button',{class:'btn',onclick:async()=>{const instruction=await inputDialog({title:t('draft.slide.revise.title',{n:index+1}),label:t('draft.slide.revise'),placeholder:t('draft.dialog.slide.placeholder'),multiline:true,hint:t('draft.slide.revise.hint',{n:index+1}),confirmLabel:t('draft.dialog.slide.confirm',{n:index+1}),suggestions:[t('draft.suggestion.white'),t('draft.suggestion.brighter'),t('draft.suggestion.no_text'),t('draft.suggestion.closeup')]});if(!instruction)return;await api('POST',`/v1/generator/runs/${r.id}/slides/revise`,{request_id:crypto.randomUUID(),slide_index:index,instruction,confirm_cost:true});delete edits[r.id];last='';await refresh();}},t('draft.slide.revise'))):null,
      r.media_versions?.some(v=>v.slide_index===index)?h('details',{class:'slide-version-history'},h('summary',{},t('draft.version.previous',{n:index+1})),h('div',{class:'slide-version-grid'},r.media_versions.filter(v=>v.slide_index===index).map(v=>h('figure',{},v.media?.url?h('img',{src:v.media.url,alt:t('legacy.previous_slide_version')}):null,h('figcaption',{},v.instruction))))):null,
      ['planned','concept_review','review','failed','cancelled'].includes(r.status)&&!r.post_id&&!r.draft_id?act(t('draft.delete.single'),async()=>{if(!await confirmDialog({title:t('draft.dialog.delete.single'),body:t('draft.dialog.delete.single.body'),tone:'danger',confirmLabel:t('draft.delete.single')}))return;await api('DELETE',`/v1/generator/runs/${r.id}/content`);delete edits[r.id];selectedId='';toast(t('draft.deleted'));}):null,
      r.steps.visual?.profile_context?h('p',{class:'faint small'},r.steps.visual.profile_context.note):null,
      r.steps.final?.output?h('details',{},h('summary',{},t('legacy.reviewer_notes')),h('p',{class:'gen-findings'},r.steps.final.output)):null,
      ['queued','running'].includes(r.status)?h('a',{class:'btn',href:'#/generator?id='+r.id},t('legacy.view_ai_progress')):null));
  }
  async function refresh() {
    if(stopped||fetching)return;fetching=true;
    try {
      let {data}=await api('GET','/v1/generator/runs');if(stopped)return;
      data=data.filter(r=>(!planSelect.value||(planSelect.value==='session'?requestedPlans.includes(r.plan_id):r.plan_id===planSelect.value))&&ui.inScope(r)&&(statusFilter.value==='all'||statusFilter.value==='approved'?statusFilter.value==='all'||r.status==='approved':!['approved','cancelled'].includes(r.status)));
      if(planSelect.value)data.sort((a,b)=>String(a.scheduled_at||'').localeCompare(String(b.scheduled_at||'')));
      summary.textContent=t('draft.delete.summary',{n:data.length,posts:data.length===1?'post':'posts'});
      visibleDrafts=data;for(const id of selectedDrafts)if(!data.some(r=>r.id===id&&deletable(r)))selectedDrafts.delete(id);
      const nextGallerySignature=JSON.stringify([data,[...selectedDrafts]]);
      if(nextGallerySignature!==gallerySignature){gallerySignature=nextGallerySignature;
      list.replaceChildren(...data.map(r=>{
        const pick=h('input',{type:'checkbox','aria-label':t('legacy.select_draft')+(r.title||r.brief.slice(0,70)),checked:selectedDrafts.has(r.id),disabled:!deletable(r),onchange:()=>{pick.checked?selectedDrafts.add(r.id):selectedDrafts.delete(r.id);card.classList.toggle('is-selected',pick.checked);updateSelection();}});
        const card=h('article',{class:'draft-tile'+(selectedDrafts.has(r.id)?' is-selected':'')},h('label',{class:'draft-pick'},pick,h('span',{class:'sr-only'},t('legacy.select_draft'))),
          h('button',{class:'gen-history-item draft-thumbnail','aria-label':t('legacy.open_draft')+(r.title||r.brief.slice(0,70)),onclick:()=>{selectedId=r.id;last='';draw(r);if(!editor.open)editor.showModal();}},
          r.media?.[0]?.url?(r.media[0].type==='video'?h('video',{class:'draft-card-image',src:r.media[0].url,muted:true,preload:'metadata'}):h('img',{class:'draft-card-image',src:r.media[0].url,alt:r.title||t('legacy.preview_content'),loading:'lazy'})):h('div',{class:'draft-card-placeholder'},r.status==='concept_review'?t('legacy.concept'):t('legacy.no_image_yet')),
          h('span',{class:'draft-thumb-badge'},labels[r.status]||r.status),r.slide_count>1?h('span',{class:'draft-thumb-slides'},t('draft.slide.count',{n:r.slide_count})):null,
          h('span',{class:'draft-thumb-caption'},h('b',{},r.title||r.brief.slice(0,70)),h('small',{},r.scheduled_at?fmtDT(r.scheduled_at):t('legacy.not_scheduled')))));return card;
      }));
      if(!data.length)list.append(h('div',{class:'panel empty'},t('legacy.no_drafts_match_these_filters')));}
      updateSelection();
      const r=data.find(r=>r.id===selectedId);
      if(r){const signature=JSON.stringify(r);if(last!==signature){last=signature;draw(r);}if(!editor.open&&query.get('id')===selectedId)requestAnimationFrame(()=>{if(editor.isConnected&&!editor.open)editor.showModal();});}else if(editor.open){editor.close();selectedId='';}
    }catch(error){if(!stopped)toast(errMsg(error),true);}finally{fetching=false;}
  }
  await refresh();const timer=setInterval(refresh,5000);const cleanup=()=>{stopped=true;clearInterval(timer);};if(nav===navSeq)pageCleanup=cleanup;else cleanup();
  editor.addEventListener('close',()=>{selectedId='';query.delete('id');});
  return shell('/generator/drafts',h('div',{},pagehead(t('legacy.drafts'),t('legacy.review_previews_then_approve_them_to_the_calendar'),h('a',{class:'btn primary',href:'#/generator'},t('legacy.new_session'))),
    ui.scopeBar({page:'drafts',views:[['grid',t('view.grid')],['cards',t('view.cards')],['calendar',t('view.calendar')]],
      extra:h('div',{class:'scope-extra'},h('label',{},t('scope.filter.plan'),planSelect),h('label',{},t('scope.filter.status'),statusFilter)),onChange:route}),
    h('details',{class:'draft-options'},h('summary',{},t('draft.production.options')),h('p',{class:'muted small'},t('draft.production.expiry')),h('div',{class:'row'},act(t('draft.plan.create'),async()=>{if(!planSelect.value)throw new Error(t('draft.plan.choose'));const ids=planSelect.value==='session'?requestedPlans:[planSelect.value];if(await confirmDialog({title:t('draft.dialog.concepts',{n:ids.length}),body:t('draft.dialog.concepts.body'),tone:'cost',confirmLabel:t('draft.plan.start'),details:[[t('draft.cost.plans'),ids.length],[t('draft.cost.runs'),t('draft.cost.concept')],[t('draft.cost.images'),t('draft.cost.after')],[t('draft.cost.key'),t('draft.cost.provider')]]})){let queued=0;for(const id of ids){const result=await api('POST',`/v1/generator/plans/${id}/start`,{confirm_cost:true});queued+=result.queued;}toast(`${queued} posts queued for AI`);}}),h('a',{class:'btn',href:'#/calendar'},t('nav.calendar')))),summary,
    bulkBar,h('div',{class:'draft-workspace'},list),editor));
}

// Personal provider credentials are available to every signed-in user.
async function pageSettings() {
  const config=await api('GET','/v1/generator/settings');
  const keys = h('div', { class: 'gen-keys' });
  const keySummary = h('span', {class:'generator-key-summary'});
  function drawKeys() {
    keySummary.textContent = config.keys.length ? ` · ${config.keys.length} providers saved` : ' · '+t('api.none');
    keys.replaceChildren(...Object.entries(config.providers).map(([provider, p]) => {
      const saved = config.keys.find(k => k.provider === provider);
      const input = h('input', { type: 'password', autocomplete: 'new-password', placeholder: saved ? t('legacy.enter_replacement_api_key') : t('legacy.enter_your_api_key'), 'aria-label': `API key ${p.name}` });
      const button = (text, fn) => h('button', { type:'button', class:'btn sm', onclick:fn }, text);
      const editor = h('div', {class:'generator-key-editor', hidden:!!saved});
      const change = button(t('legacy.replace_key'), () => { editor.hidden=false; change.hidden=true; input.focus(); });
      const status = h('div', {class:`generator-key-status ${saved?'saved':''}`, role:'status'}, saved ? t('api.key.saved') : t('legacy.no_api_key_yet'));
      editor.append(input, h('div', {class:'row'}, button(saved ? t('legacy.save_replacement') : t('legacy.save_key'), async () => {
        await api('PUT', '/v1/generator/keys/' + provider, {key:input.value.trim()});
        input.value='';
        config.keys = [...config.keys.filter(k=>k.provider!==provider), {provider,updated_at:new Date().toISOString()}];
        drawKeys(); toast(`${p.name} API key saved`);
      }), saved ? button(t('legacy.cancel'), () => { input.value=''; editor.hidden=true; change.hidden=false; }) : null));
      return h('div', {class:'gen-key','data-key-provider':provider}, h('h3',{},p.name), status,
        saved ? h('p',{class:'muted small'},t('api.encrypted',{date:fmtDT(saved.updated_at)})) : null,
        saved ? h('p',{class:'faint small'},t('legacy.keys_are_never_shown_again_test_the_connection_to_check_model_access')) : null,
        editor, saved ? h('div',{class:'row'}, change,
          button(t('legacy.test_connection'),async()=>{const r=await api('POST','/v1/generator/keys/'+provider+'/test',{model:p.textModel});toast(r.note);}),
          button(t('settings.ai.remove'),async()=>{if(!await confirmDialog({title:t('api.key.remove.title'),body:t('api.key.remove.body'),tone:'danger',confirmLabel:t('settings.ai.remove')}))return;await api('DELETE','/v1/generator/keys/'+provider);config.keys=config.keys.filter(k=>k.provider!==provider);drawKeys();toast(t('api.key.provider.removed',{provider:p.name}));})) : null);
    }));
  }
  drawKeys();
  return shell('/settings',h('div',{class:'personal-settings'},pagehead(t('legacy.personal_settings'),t('api.personal.help'),h('a',{class:'btn',href:'#/generator'},t('legacy.back_to_content_generator'))),h('section',{class:'panel'},h('h2',{},t('legacy.ai_connections'),keySummary),h('p',{class:'muted small'},t('api.personal.security')),keys)));
}

// ---------------- Sosmed Generator ----------------
async function pageGenerator(nav) {
  await loadAccounts();
  let config = await api('GET', '/v1/generator/settings');
  state.providerKeys=config.keys;state.providers=config.providers;
  const catalogNotice=h('p',{class:'studio-model-catalog-note',role:'status'});
  async function loadGeminiCatalog(refresh=false){
    if(!config.keys.some(k=>k.provider==='gemini'))return;
    try{const catalog=await api('GET','/v1/generator/providers/gemini/models'+(refresh?'?refresh=true':''));config.providers.gemini={...config.providers.gemini,...catalog};catalogNotice.textContent=t('legacy.gemini_models_synced_from_your_api_key');}
    catch(e){catalogNotice.textContent=t('legacy.gemini_models_could_not_be_synced')+errMsg(e);}
  }
  await loadGeminiCatalog();
  let studio,storyContext=null,lastStoryJob=null,campaignRun=null,campaignRuns=[];
  const labels = { concept: t('legacy.concept_creator'), revision: t('generator.agent.reviewer'), image: t('generator.agent.image'), final: t('generator.agent.final'), storyteller:t('generator.agent.storyteller'),manager:t('generator.agent.manager'),scheduler:t('generator.agent.scheduler'),visual:t('legacy.visual_conceptor') };
  const phaseNames = { concept_review:t('legacy.review_concept'), planned: t('legacy.plan_only'), approved: t('legacy.on_calendar'), queued: t('legacy.waiting'), running: t('legacy.ai_in_progress'), review: t('legacy.ready_to_review'), failed: t('legacy.needs_action'), cancelled: t('legacy.cancelled'), drafted: t('legacy.in_new_post') };
  const inputs = {}, selected = new Set();
  const sessionLanguage=h('select',{'aria-label':t('content.language.session')},
    h('option',{value:''},t('content.language.default')),
    ...['id','en','mixed'].map(code=>h('option',{value:code},t('content.language.'+code))));
  const accountBox=h('div',{class:'acc-picker generator-account-row'});
  const accountSummary=h('span',{class:'generator-account-summary'});
  const accountPicker=h('div',{class:'panel generator-account-picker'},h('b',{},t('gen.step1')),accountSummary);
  const requestedAccount=new URLSearchParams(location.hash.split('?')[1]||'').get('story_account');
  if(state.accounts.some(a=>a.id===requestedAccount&&a.status==='active'))selected.add(requestedAccount);
  const company=h('select',{'aria-label':t('scope.company.label'),onchange:()=>{selected.clear();state.accounts.filter(a=>a.status==='active'&&(!company.value||(a.company_id||'none')===company.value)).forEach(a=>selected.add(a.id));drawAccounts();}},h('option',{value:''},t('scope.company.all')),companyGroups().filter(c=>c.accounts.length).map(c=>h('option',{value:c.id||'none'},c.name)));
  if(requestedAccount){const a=state.accounts.find(a=>a.id===requestedAccount);if(a)company.value=a.company_id||'none';}
  function summarizeAccounts(){
    const chosen=state.accounts.filter(a=>selected.has(a.id));
    accountSummary.textContent=chosen.length?chosen.slice(0,3).map(a=>'@'+a.username).join(', ')+(chosen.length>3?` +${chosen.length-3}`:''):t('legacy.choose_accounts');
    accountSummary.title=chosen.map(a=>'@'+a.username).join(', ');studio?.update();
  }
  function drawAccounts(){
    const visible=state.accounts.filter(a=>a.status==='active'&&(!company.value||(a.company_id||'none')===company.value));
    accountBox.replaceChildren(ui.accountPicker({accounts:visible,selected:[...selected],readiness:ui.readiness,onChange:ids=>{selected.clear();ids.forEach(id=>selected.add(id));drawAccounts();}}));
    if(!visible.length)accountBox.append(h('p',{class:'muted small'},t('generator.no.accounts')));
    summarizeAccounts();
  }
  drawAccounts();
  accountPicker.append(h('div',{class:'generator-account-controls'},h('label',{},t('scope.company.label'),company)),accountBox);
  const agentCards = Object.entries(labels).map(([role, name], i) => {
    const savedAgent=config.agents?.[role]||{};
    const fallbackProvider=role==='image'?Object.keys(config.providers).find(id=>config.providers[id].image):'openai';
    const providerId=config.providers[savedAgent.provider]&&(role!=='image'||config.providers[savedAgent.provider].image)?savedAgent.provider:fallbackProvider;
    const agent={provider:providerId,model:(savedAgent.provider===providerId?savedAgent.model:'')||config.providers[providerId][role==='image'?'imageModel':'textModel'],instructions:savedAgent.instructions||''};
    const model = h('select', { 'aria-label': `Model ${name}` });
    const help = h('p',{class:'faint small generator-model-help'});
    function drawModels(providerId,preferred) {
      const p=config.providers[providerId];
      const options=p[role==='image'?'imageModels':'textModels']||[];
      const fallback=role==='image'?p.imageModel:p.textModel;
      const available=[...options];
      if(preferred&&!p.live&&!available.some(m=>m.id===preferred))available.push({id:preferred,name:t('generator.model.saved',{model:preferred})});
      model.replaceChildren(...available.map(m=>h('option',{value:m.id,selected:m.id===(preferred||fallback)},m.name)));
      const missing=preferred&&p.live&&!available.some(m=>m.id===preferred);
      help.textContent=(missing?t('generator.model.unavailable',{model:preferred})+' ':'')+(role==='image'?t('legacy.image_model_access_depends_on_your_provider_key_and_account'):t('legacy.text_and_vision_model_access_depends_on_your_provider_key_and_account'));
    }
    drawModels(agent.provider,agent.model);
    const prompt = h('textarea', { 'aria-label': t('generator.agent.instructions.label',{name}), maxlength: 4000 }, agent.instructions);
    const provider = h('select', { 'aria-label': `Provider ${name}`, onchange: () => drawModels(provider.value) }, Object.entries(config.providers).filter(([,p]) => role !== 'image' || p.image).map(([id,p]) => h('option', { value: id, selected: agent.provider === id }, p.name)));
    inputs[role] = { provider, model, prompt, drawModels };
    return h('div', { class: 'gen-agent' }, h('span', { class: 'gen-number' }, String(i + 1)), h('h3', {}, name), h('p', { class: 'muted small' }, [t('generator.agent.idea'), t('generator.agent.critique'), t('generator.agent.images'), t('generator.agent.review'),t('legacy.continues_the_brand_story_using_its_seed_and_memory'),t('generator.agent.brand'),t('legacy.chooses_schedule_slots_and_explains_why'),t('legacy.aligns_image_directions_with_references_and_the_account_feed')][i]), h('label',{},t('generator.provider'),provider), h('label',{},t('generator.model'),model), help, h('details', {}, h('summary', {}, t('legacy.agent_instructions')), prompt));
  });
  const collectAgents = () => Object.fromEntries(Object.entries(inputs).map(([r,v]) => [r, { provider: v.provider.value, model: v.model.value.trim(), instructions: v.prompt.value }]));
  const batches={runs:{},plans:{}};
  async function submitForAccounts(kind,body){
    if(!body.brief?.trim()){brief.setAttribute('aria-invalid','true');brief.focus();throw new Error(t('legacy.write_a_campaign_direction_first'));}
    const targets=[...selected].sort();if(!targets.length){accountPicker.open=true;accountPicker.querySelector('input')?.focus();throw new Error(t('legacy.choose_an_account_first'));}
    const bodies=[];
    for(const aid of targets){
      const a=state.accounts.find(a=>a.id===aid);
      const kit=a?.platform==='instagram'?await api('GET',`/v1/generator/accounts/${encodeURIComponent(aid)}/brand`):{assets:[],brand_notes:''};
      const assets=[...kit.assets.filter(x=>x.category==='logo').slice(0,1),...kit.assets.filter(x=>x.category==='visual').slice(0,1),...kit.assets.filter(x=>x.category==='product').slice(0,2)];
      const prefs=readContentPrefs(aid),instruction=contentInstruction(sessionLanguage.value||prefs.language,prefs.emoji);
      const agents=Object.fromEntries(Object.entries(body.agents||{}).map(([role,agent])=>[role,{...agent,instructions:[agent.instructions,instruction].filter(Boolean).join('\n\n')}]));
      bodies.push({...body,agents,account_ids:[aid],reference_media_ids:assets.map(x=>x.media_id),reference_roles:Object.fromEntries(assets.map(x=>[x.media_id,x.category])),reference_notes:kit.brand_notes||''});
    }
    const batch=batches[kind],signature=JSON.stringify(bodies);
    if(batch.signature!==signature){batch.signature=signature;batch.id=crypto.randomUUID();}
    const results=[];
    try{for(let i=0;i<bodies.length;i++)results.push(await api('POST','/v1/generator/'+kind,{...bodies[i],request_id:batch.id+'-'+i}));}
    catch(e){throw new Error((results.length?`${results.length} accounts were created. Retry to continue without duplicates. `:'')+e.message);}
    batch.signature='';return results;
  }
  const brief = h('textarea', { oninput:()=>{briefPreview.textContent=brief.value||t('legacy.no_campaign_direction_yet');brief.removeAttribute('aria-invalid');campaignError.hidden=true;}, 'aria-label': t('generator.brief.label'), placeholder: t('legacy.example_make_a_3_slide_carousel_for_hanna_beauty_include_goals_audience_verified_offer_visual_style_language_cta_and_claims_to_avoid'), maxlength: 10000, rows: 5 });
  const count = h('input', { type: 'number', min: 1, max: 10, value: 1, 'aria-label': t('legacy.slide_count') });
  const tomorrow = new Date(Date.now() + 864e5 + 7 * 3600000).toISOString().slice(0,10);
  const until = new Date(Date.now() + 14 * 864e5 + 7 * 3600000).toISOString().slice(0,10);
  const fromDate = h('input',{type:'date',value:tomorrow,'aria-label':t('legacy.plan_start_date')});
  const endDate = h('input',{type:'date',value:until,'aria-label':t('legacy.plan_end_date')});
  const totalContents = h('input',{type:'number',min:1,max:30,value:12,'aria-label':t('legacy.posts_in_plan')});
  const postTimes = h('input',{value:'12:15, 19:15','aria-label':t('legacy.planned_times_wib')});
  const planningMode = h('select',{'aria-label':t('generator.planning.mode')},h('option',{value:'ai'},t('legacy.ai_plans_ideas_and_topics')),h('option',{value:'manual'},t('legacy.manual_dates_and_your_own_photos')));
  const briefPreview=h('p',{class:'muted small'},t('legacy.no_campaign_direction_yet'));
  const campaignError=h('p',{class:'err-box',role:'alert',hidden:true});
  const planButton=h('button',{class:'btn primary',onclick:async e=>{
    e.currentTarget.disabled=true;
    try {
      campaignError.hidden=true;
      const body={brief:brief.value,content_count:Number(totalContents.value),slide_count:Number(count.value),start_date:fromDate.value,end_date:endDate.value,times:postTimes.value.split(',').map(t=>t.trim()).filter(Boolean),manual:planningMode.value==='manual',produce_media:planningMode.value!=='manual',confirm_cost:true,agents:collectAgents()};
      const total=selected.size*body.content_count;
      if(!await confirmDialog({title:t('generator.cost.start.title',{n:total}),body:t('generator.cost.start.body'),tone:'cost',confirmLabel:t('generator.cost.start.cta',{n:total}),details:[[t('scope.accounts.label'),selected.size],[t('draft.cost.posts'),total],[t('draft.cost.runs'),t('draft.cost.concept')],[t('draft.cost.images'),t('draft.cost.after')],[t('draft.cost.key'),t('draft.cost.provider')]]}))return;
      const results=await submitForAccounts('plans',body);go('/generator/drafts?'+(results.length===1?'plan='+results[0].id:'plans='+results.map(r=>r.id).join(',')));
    }catch(error){campaignError.textContent=errMsg(error);campaignError.hidden=false;}finally{e.target.disabled=false;}
  }},t('legacy.generate_posts'));
  const planner=h('div',{class:'gen-planner'},
    h('p',{class:'muted small'},t('legacy.each_account_gets_its_own_plan_and_brand_assets_write_a_direction_and_choose_accounts_the_agents_prepare_drafts_for_review')),
    h('label',{class:'content-pref-field'},t('content.language.session'),sessionLanguage),
    h('div',{class:'gen-form-row'},h('label',{},t('legacy.posts_per_account'),totalContents),h('label',{},t('legacy.slides_per_post'),count),h('label',{},t('legacy.from_date_wib'),fromDate),h('label',{},t('legacy.to_date_wib'),endDate)),
    h('div',{class:'gen-form-row'},h('label',{},t('generator.time.label'),postTimes)),
    h('p',{class:'faint small'},t('legacy.suggested_times_are_12_15_and_19_15_wib_posts_are_spread_evenly_these_are_general_suggestions_not_account_performance_analysis')));
  const history = h('div', { class: 'gen-history' }), detail = h('div', { class: 'gen-detail' });
  const campaignActivity=h('div',{class:'studio-campaign-activity'}),campaignOutput=h('section',{class:'studio-campaign-output',hidden:true},campaignActivity,detail);
  let workflow;
  let selectedId = new URLSearchParams(location.hash.split('?')[1] || '').get('id');
  let lastSignature = '', stopped = false, fetching = false;
  const captions = {}, slides = {};
  const action = (text, fn, danger = false) => h('button', { class: `btn ${danger ? 'danger' : ''}`, onclick: async e => { e.currentTarget.disabled = true; try { await fn(); lastSignature = ''; await refresh(); } catch(error) { toast(errMsg(error), true); } finally { e.target.disabled = false; } } }, text);
  function drawRun(r) {
    campaignRun=r;if(studio?.mode()==='campaign')workflow?.setRun(r);
    const index = Math.min(slides[r.id] || 0, Math.max(0, r.media.length - 1));
    const image = r.media[index];
    const acc = state.accounts.find(a => a.id === r.targets[0]?.account_id);
    const caption = h('textarea', { 'aria-label': t('generator.final.caption'), maxlength: 2200, oninput: e => { captions[r.id] = e.target.value; } }, captions[r.id] ?? r.caption);
    replaceContent(detail,h('div', { class: 'panel' }, h('div', { class: 'row' }, h('h2', {}, t('generator.campaign.process')),h('a',{class:'btn sm',href:'#/generator/drafts?id='+r.id},t('legacy.open_drafts')), h('span', { class: 'spacer' }), h('span', { class: 'pill' }, phaseNames[r.status])),
      h('p', { class: 'gen-brief' }, r.brief),agentActivity(r),
      h('div', { class: 'gen-flow' }, Object.entries(labels).map(([role,name]) => {
        const step = r.steps[role];
        const output = step?.output;
        return h('div', { class: `gen-stage ${step?.status || ''}` }, h('b', {}, name), h('span', { class: 'small muted' }, r.agents?.[role]?`${r.agents[role].provider} · ${r.agents[role].model}`:t('generator.model.unknown')), h('span', {}, step?.status === 'done' ? t('status.done') : step?.status === 'running' ? (r.status === 'failed' ? t('generator.stopped') : t('generator.working')) : t('legacy.waiting')),
          role === 'image' && step ? h('small', {}, `${step.completed_slides || 0}/${r.slide_count} slide`) : null,
          output ? h('details', {}, h('summary', {}, t('generator.stage.view')), h('pre', {}, typeof output === 'string' ? output : JSON.stringify(output, null, 2)), step.usage ? h('pre', { class: 'faint small' }, JSON.stringify(step.usage, null, 2)) : null) : null);
      })),
      conceptReviewPanel(r,async concept=>{await api('POST',`/v1/generator/runs/${r.id}/approve-concept`,{concept,confirm_cost:true});lastSignature='';await refresh();}),
      r.error ? h('div', { class: 'err-box' }, t('error.provider'), technicalDetails({message:r.error})) : null,
      h('div', { class: 'row' },
        r.status === 'failed' ? action(t('generator.retry.stage'), async () => { if (await confirmDialog({title:t('draft.dialog.retry'),body:t('draft.dialog.retry.body'),tone:'cost',confirmLabel:t('generator.stage.retry'),details:[[t('draft.cost.runs'),t('draft.cost.failed')],[t('draft.cost.key'),t('draft.cost.provider')]]})) await api('POST', `/v1/generator/runs/${r.id}/retry`); }) : null,
        ['queued','running','concept_review','review','failed'].includes(r.status) ? action('Stop', async () => { if (await confirmDialog({title:t('draft.dialog.stop'),body:t('draft.dialog.stop.body'),tone:'danger',confirmLabel:t('generator.stop.run')})) await api('DELETE', `/v1/generator/runs/${r.id}`); }, true) : null)),
      image ? h('div', { class: 'gen-review-grid' },
        h('div', { class: 'pv instagram gen-feed' }, h('div', { class: 'hd' }, acc ? avatar(acc) : null, acc?.username || t('generator.preview.feed')),
          h('div', { class: 'img' }, image.url ? (image.type==='video'?h('video',{src:image.url,controls:true,preload:'metadata'}):h('img', { src: image.url, alt: `Slide ${index + 1}` })) : t('legacy.file_removed_after_publishing')),
          h('div', { class: 'row gen-slide-controls' }, h('button',{class:'btn','aria-label':t('compose.previous.slide'),onclick:()=>{slides[r.id]=(index+r.media.length-1)%r.media.length;drawRun(r);}},icon('chevron-left')),h('span', {}, `${index + 1}/${r.media.length}`),h('button',{class:'btn','aria-label':t('compose.next.slide'),onclick:()=>{slides[r.id]=(index+1)%r.media.length;drawRun(r);}},icon('right'))),
          h('div', { class: 'cap' }, h('b', {}, acc?.username || ''), r.caption)),
        h('div', { class: 'panel' }, h('h2', {}, t('generator.human.review')), h('p', { class: 'muted small' }, t('generator.human.review.help')), caption,
          r.steps.final?.output ? h('div', { class: 'gen-findings' }, r.steps.final.output) : null,
          r.status === 'review' ? action(t('generator.send.compose'), async () => { const d = await api('POST', `/v1/generator/runs/${r.id}/draft`, { content: caption.value }); go('/compose?ai_draft=' + d.draft_id); }) : null,
          r.draft_id ? h('a', { class: 'btn primary', href: '#/compose?ai_draft=' + r.draft_id }, t('generator.open.compose')) : null)) : null);
  }
  async function refresh() {
    if (stopped || fetching) return;
    fetching = true;
    try {
      const { data } = await api('GET', '/v1/generator/runs');
      if (stopped) return;
      history.replaceChildren(h('h3', {}, t('legacy.recent_campaigns')), ...data.map(r => h('button', { class: `gen-history-item ${selectedId === r.id ? 'on' : ''}`, onclick: () => { selectedId = r.id; lastSignature = ''; refresh(); } }, h('b', {}, r.brief.slice(0, 75)), h('small', {}, `${phaseNames[r.status]} · ${fmtDT(r.created_at)}`))));
      campaignRuns=data;studio?.setCampaignRun(campaignRun,data);
      if(studio?.mode()==='storyline'&&lastStoryJob){const child=data.find(r=>r.story_job_id===lastStoryJob.id);if(child)workflow.setRun(child);}
      const r = selectedId?data.find(r => r.id === selectedId):null;
      campaignOutput.hidden=!r;
      if (r) { selectedId = r.id; const signature = JSON.stringify(r); if (lastSignature !== signature) { lastSignature = signature; drawRun(r); } }
      else detail.replaceChildren(h('div', { class: 'panel empty' }, t('generator.empty.brief')));
    } catch(error) { if (!stopped) toast(errMsg(error), true); } finally { fetching = false; }
  }
  const briefNode=h('section',{class:'gen-start'},briefPreview,h('button',{class:'btn',onclick:()=>studio.editBrief()},t('legacy.edit_campaign_direction')));
  const campaign=h('div',{class:'studio-campaign'},h('section',{class:'panel studio-campaign-form'},h('h2',{},t('legacy.start_with_a_new_direction')),h('p',{class:'studio-editor-description'},t('legacy.each_account_brand_kit_is_used_automatically')),h('label',{},t('legacy.what_do_you_want_to_make'),brief),campaignError,h('div',{class:'studio-campaign-options'},h('details',{},h('summary',{},t('legacy.production_options')),h('label',{},t('legacy.how_to_plan_content'),planningMode)),h('div',{class:'studio-primary-action'},planButton,h('p',{class:'faint small'},t('legacy.concepts_visuals_images_and_reviews_are_prepared_automatically_publishing_waits_for_your_approval'))))),campaignOutput);
  const scheduleSummary=h('span',{class:'generator-schedule-summary'});
  const scheduleNode=h('details',{class:'panel generator-schedule-picker'},h('summary',{},h('b',{},t('legacy.schedule')),scheduleSummary),planner,h('button',{class:'btn sm',onclick:()=>{scheduleNode.open=false;scheduleNode.querySelector('summary').focus();}},t('legacy.done_setting_schedule')));
  function summarizeSchedule(){const date=value=>value?new Date(value+'T00:00:00+07:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'Asia/Jakarta'}):t('legacy.choose_dates');scheduleSummary.textContent=t('generator.schedule.summary',{n:totalContents.value,from:date(fromDate.value),to:date(endDate.value)});}
  for(const field of [totalContents,count,fromDate,endDate,postTimes])field.addEventListener('input',()=>{summarizeSchedule();studio?.update();});
  summarizeSchedule();
  workflow=workflowCanvas({h,userId:state.user.id,history,
    actions:[h('a',{class:'btn sm',href:'#/settings'},t('legacy.ai_settings')),action(t('legacy.refresh_gemini_models'),async()=>{await loadGeminiCatalog(true);for(const v of Object.values(inputs))if(v.provider.value==='gemini')v.drawModels('gemini',v.model.value);}),action(t('legacy.save_preset'),async()=>{const saved=await api('PUT','/v1/generator/settings',{agents:collectAgents()});config={...saved,providers:config.providers};toast(t('legacy.agent_preset_saved'));}),h('button',{class:'btn sm',onclick:()=>workflow.focusNode('result')},t('legacy.results')),h('a',{class:'btn sm',href:'#/generator/drafts'},t('legacy.drafts'))],
    nodes:[
      {id:'brief',title:t('generator.node.brief'),subtitle:t('generator.node.brief.subtitle'),x:40,y:80,width:330,color:'#b899cb',content:briefNode},
      {id:'concept',role:'concept',title:t('legacy.concept_creator'),x:460,y:80,width:295,color:'#88b7d1',content:agentCards[0]},
      {id:'revision',role:'revision',title:t('generator.agent.reviewer'),x:835,y:80,width:295,color:'#b7a1d1',content:agentCards[1]},
      {id:'visual',role:'visual',title:t('legacy.visual_conceptor'),x:1210,y:80,width:300,color:'#92b6b0',content:agentCards[7]},
      {id:'image',role:'image',title:t('generator.agent.image'),x:1585,y:80,width:310,color:'#d0ad77',content:agentCards[2]},
      {id:'final',role:'final',title:t('generator.agent.final'),x:1975,y:80,width:300,color:'#8ebd9e',content:agentCards[3]},
      {id:'result',title:t('legacy.preview_approval'),x:2365,y:80,width:470,color:'#91b0c8',content:h('div',{},h('p',{class:'muted small'},t('legacy.review_results_and_approve_them_in_the_campaign_area_or_drafts')),h('button',{class:'btn',onclick:()=>{studio.chooseMode('campaign');campaignOutput.scrollIntoView({block:'start'});}},t('generator.open.results')))},
      {id:'storyteller',role:'storyteller',title:t('generator.agent.storyteller'),subtitle:t('legacy.continue_story_mode'),x:40,y:650,width:330,color:'#aabbd9',content:agentCards[4]},
      {id:'manager',role:'manager',title:t('generator.agent.manager'),subtitle:t('generator.agent.brand'),x:460,y:650,width:310,color:'#91bdad',content:agentCards[5]},
      {id:'scheduler',role:'scheduler',title:t('generator.agent.scheduler'),subtitle:t('generator.node.scheduler.subtitle'),x:835,y:650,width:310,color:'#b9afd6',content:agentCards[6]}
    ],
    edges:[{from:'brief',to:'concept'},{from:'concept',to:'revision'},{from:'revision',to:'visual'},{from:'visual',to:'image'},{from:'image',to:'final'},{from:'final',to:'result'},{from:'brief',to:'storyteller'},{from:'storyteller',to:'manager'},{from:'manager',to:'scheduler'},{from:'scheduler',to:'concept'}]
  });
  await refresh();
  const showStoryWorkflow=j=>{lastStoryJob=j;if(!studio||studio.mode()==='storyline')workflow.setRun(j?{...j,story_job_id:j.id,agents:collectAgents(),media:[]}:null);};
  const story=await storyWorkspace({h,api,uploadFile,accounts:state.accounts.filter(a=>a.platform==='instagram'&&a.status==='active'),mode:'production',agents:collectAgents,dates:{count:totalContents,slides:count,from:fromDate,until:endDate,times:postTimes},toast,fmtDT,confirmDialog,errMsg,onContext:value=>{storyContext=value;state.brandProfiles[value.account.id]=value.profile;studio?.setStoryContext(value);},onJob:showStoryWorkflow});
  studio=generatorStudio({h,icon,story,campaign,accountPicker,schedule:scheduleNode,workflow,keyCount:config.keys.length,getSelected:()=>state.accounts.filter(a=>selected.has(a.id)),getSchedule:()=>({count:totalContents.value,slides:count.value,from:fromDate.value,until:endDate.value,times:postTimes.value}),onEditBrief:()=>brief.focus(),onMode:mode=>{if(mode==='campaign')workflow.setRun(campaignRun);else showStoryWorkflow(lastStoryJob);}});
  studio.element.querySelector('.studio-agents').insertBefore(catalogNotice,workflow.element);
  if(storyContext)studio.setStoryContext(storyContext);studio.setCampaignRun(campaignRun,campaignRuns);
  if(new URLSearchParams(location.hash.split('?')[1]||'').has('id'))studio.chooseMode('campaign');
  const timer = setInterval(refresh, 2500);
  const cleanup = async () => { stopped = true; clearInterval(timer);workflow.dispose();await story.dispose();studio.dispose(); };
  if(nav===navSeq)pageCleanup=cleanup;else await cleanup();
  return shell('/generator',h('div',{class:'generator-node-page'},pagehead(t('nav.generator'),t('legacy.turn_your_brand_story_into_drafts_ready_for_review'),h('a',{class:'btn',href:'#/generator/drafts'},icon('doc'),t('legacy.drafts'))),studio.element));
}

// ---------------- calendar ----------------
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = (d) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));

async function pageCalendar() {
  await loadAccounts();
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  ui.readScopeFromUrl('calendar');
  if(!q.has('co')&&!q.has('acc')&&(q.has('company')||q.has('account'))){
    state.scope.companyId=q.get('company')==='all'?null:q.get('company');
    state.scope.accountIds=q.get('account')?[q.get('account')]:'all';
  }
  const view = q.get('view') || q.get('v') || state.scope.views.calendar || 'month';
  state.scope.views.calendar=view;
  const allowedIds = new Set(ui.selectedAccounts().map(a => a.id));
  const calendarUrl = (patch = {}) => {
    const next = new URLSearchParams(ui.scopeQuery('calendar','/calendar?'+q).split('?')[1]||'');
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    next.set('view',patch.view||view);next.delete('v');
    return `/calendar?${next}`;
  };
  const linkAttrs = p => {
    const links = p.targets.filter(t => t.status === 'published' && t.permalink);
    if (links.length === 1) return { href: links[0].permalink, target: '_blank', rel: 'noopener noreferrer', title: t('legacy.open_published_post') };
    if (links.length > 1) return { href: `#/posts/${p.id}`, onclick: e => {
      e.preventDefault(); e.stopPropagation();
      const dialog = modal(t('legacy.choose_a_published_post'), h('div', { class: 'list' }, links.map(link => h('a', { class: 'item', href: link.permalink, target: '_blank', rel: 'noopener noreferrer' }, `@${link.username} · ${PLAT[link.platform]} `, icon('arrow-right')))), [h('a', { class: 'btn', href: `#/posts/${p.id}` }, t('legacy.post_details'))]);
      dialog.querySelector('a[href^="#"]').addEventListener('click', () => dialog.close());
    } };
    return { href: `#/posts/${p.id}`, title: t('legacy.view_post_status') };
  };

  const anchor = q.get('d') ? new Date(`${q.get('d')}T00:00:00`) : new Date();
  let start, end, label;
  if (view === 'month') {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    start = mondayOf(first); end = addDays(start, 42);
    label = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  } else if (view === '3day') {
    start = startOfDay(anchor); end = addDays(start, 3);
    label = `${start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${addDays(end, -1).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  } else {
    start = mondayOf(anchor); end = addDays(start, 7);
    label = `${start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${addDays(end, -1).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  const response = await api('GET', `/v1/calendar?from=${start.toISOString()}&to=${end.toISOString()}`);
  const data = response.data.map(p => ({ ...p, targets: p.targets.filter(t => allowedIds.has(t.account_id)) })).filter(p => p.targets.length);
  const step = view === 'month' ? null : view === '3day' ? 3 : 7;
  const nav = (dir) => {
    let d;
    if (!dir) d = new Date();
    else if (view === 'month') d = new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);
    else d = addDays(anchor, dir * step);
    go(calendarUrl({ view, d: ymd(d) }));
  };
  const today = startOfDay(new Date()).getTime();
  const at = (p) => new Date(p.scheduled_at || p.created_at);
  const dayPosts = (d) => data.filter((p) => startOfDay(at(p)).getTime() === d.getTime());
  const createAt = (d) => { const x = new Date(d); x.setHours(9, 0, 0, 0); if (x < new Date()) { x.setTime(Date.now() + 3600_000); x.setMinutes(0, 0, 0); } return `/compose?at=${encodeURIComponent(x.toISOString())}`; };
  const ev = (p) => h('a', { class: `ev ${p.status}`, ...linkAttrs(p), onclick: (e) => { e.stopPropagation(); linkAttrs(p).onclick?.(e); } },
    h('time', {}, fmtTime(at(p).toISOString())), h('span', { class: 't' }, p.content || '(media)'),
    h('span', { class: 'icons' }, [...new Set(p.targets.map((t) => t.platform))].map(icon)));

  let body;
  if (view === 'list') {
    body = data.length ? postList(data, linkAttrs) : ui.emptyState({title:t('cal.empty.title'),body:t('cal.empty.body'),action:h('a',{class:'btn',href:'#/compose'},t('nav.compose'))});
  } else if(view==='by_account'){
    body=h('div',{class:'calendar-by-account'},ui.selectedAccounts().map(a=>h('section',{class:'panel'},h('h2',{},ui.accountChip(a)),
      postList(data.filter(p=>p.targets.some(target=>target.account_id===a.id)),linkAttrs))));
  } else if (view === 'month') {
    const cells = [...Array(42)].map((_, i) => addDays(start, i));
    body = h('div', { class: 'month' },
      [t('cal.mon'),t('cal.tue'),t('cal.wed'),t('cal.thu'),t('cal.fri'),t('cal.sat'),t('cal.sun')].map((d) => h('div', { class: 'mh' }, d)),
      cells.map((d) => {
        const ps = dayPosts(d); const past = d.getTime() < today; const other = d.getMonth() !== anchor.getMonth();
        return h('div', { class: `mc ${other ? 'other' : ''} ${d.getTime() === today ? 'today' : ''} ${past ? 'past' : ''}`,
          role: past ? null : 'button', tabindex: past ? null : 0, title: past ? null : `Create a post on ${d.getDate()}`,
          onclick: past ? null : () => go(createAt(d)), onkeydown: past ? null : (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) go(createAt(d)); } },
        h('div', { class: 'mn' }, d.getDate()),
        ps.slice(0, 3).map(ev),
        ps.length > 3 ? h('a', { class: 'more', href: '#' + calendarUrl({ view: '3day', d: ymd(d) }), onclick: (e) => e.stopPropagation() }, '+'+t('cal.more',{n:ps.length-3})) : null);
      }));
  } else {
    const days = [...Array(step)].map((_, i) => addDays(start, i));
    body = h('div', { class: 'cal', style: { gridTemplateColumns: `repeat(${step}, minmax(0, 1fr))` } }, days.map((d) => {
      const past = d.getTime() < today;
      return h('div', { class: `day ${d.getTime() === today ? 'today' : ''}` },
        h('div', { class: 'dh' }, d.toLocaleDateString('en-GB', { weekday: 'short' }), h('b', {}, d.getDate()),
          !past ? h('a', { class: 'add-day', href: `#${createAt(d)}`, 'aria-label': `Create a post on ${d.getDate()}` }, '+') : null),
        dayPosts(d).map(ev));
    }));
  }
  return shell('/calendar', h('div', {},
    pagehead(t('cal.title'), label,
      h('button', { class: 'btn', onclick: () => nav(-1), 'aria-label': t('calendar.previous') }, icon('chevron-left')),
      h('button', { class: 'btn', onclick: () => nav(0) }, t('cal.today')),
      h('button', { class: 'btn', onclick: () => nav(1), 'aria-label': t('calendar.next') }, icon('right')),
      h('a', { class: 'btn primary', href: '#/compose' }, t('nav.compose'))),
    ui.scopeBar({page:'calendar',views:[['month',t('view.month')],['week',t('view.week')],['list',t('view.list')],['by_account',t('view.by_account')],['3day',t('cal.days.three')]],onChange:route}),
    body,
    view === 'month' ? h('p', { class: 'faint small', style: { marginTop: '10px' } }, t('cal.create.note')) : null));
}

// ---------------- inbox ----------------
async function pageInbox(nav) {
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
      const reply = h('textarea', { placeholder: t('comments.reply.placeholder',{handle:c.username}), 'aria-label': `Reply to @${c.username}`,
        onkeydown: (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendBtn.click(); } } });
      const sendBtn = h('button', { class: 'btn primary sm', onclick: async (e) => {
        if (!reply.value.trim()) return;
        e.currentTarget.disabled = true;
        try { await api('POST', `/v1/comments/${c.id}/reply`, { message: reply.value }); toast(t('comments.reply.sent')); draw(); live.refresh(); }
        catch (err) { e.currentTarget.disabled = false; toast(errMsg(err), true); }
      } }, t('legacy.reply'));
      const setStatus = async (st, msg, undoTo) => {
        await api('PATCH', `/v1/comments/${c.id}`, { reply_status: st }); draw(); live.refresh();
        if (msg) toast(msg, false, undoTo ? { label: 'Urungkan', fn: async () => { await api('PATCH', `/v1/comments/${c.id}`, { reply_status: undoTo }); draw(); live.refresh(); } } : null);
      };
      return h('div', { class: `cmt ${c.hidden ? 'hidden' : ''}` },
        accnt ? avatar(accnt) : null,
        h('div', { class: 'body', style: { flex: 1, minWidth: 0 } },
          h('div', { class: 'row' }, h('span', { class: 'who' }, `@${c.username}`), h('span', { class: 'faint small' }, `${ago(c.commented_at)} · ke @${c.account_username}`),
            c.hidden ? h('span', { class: 'status' }, t('legacy.hidden')) : null, c.reply_status === 'ignored' ? h('span', { class: 'status' }, t('comments.done')) : null),
          h('div', { class: 'txt' }, c.text || ''),
          repliesOf(c).map((r) => h('div', { class: 'replies' }, h('b', {}, t('legacy.your_reply')), r.text)),
          h('div', { class: 'reply-box' }, reply, sendBtn),
          h('div', { class: 'row', style: { marginTop: '6px' } },
            c.reply_status !== 'ignored'
              ? h('button', { class: 'btn ghost sm', title: t('comments.ignore.help'), onclick: () => setStatus('ignored', t('legacy.marked_as_done'), c.reply_status) }, t('legacy.mark_as_done'))
              : h('button', { class: 'btn ghost sm', onclick: () => setStatus('unreplied') }, t('legacy.mark_as_needs_reply')),
            h('button', { class: 'btn ghost sm', onclick: async () => { try { await api('POST', `/v1/comments/${c.id}/hide`, { hidden: !c.hidden }); toast(c.hidden ? t('legacy.comment_shown') : t('legacy.comment_hidden')); draw(); } catch (err) { toast(errMsg(err), true); } } }, c.hidden ? t('comments.show') : t('comments.hide')),
            !group && c.post_id ? h('a', { class: 'btn ghost sm', href: `#/posts/${c.post_id}` }, t('comments.open.post')) : null,
            h('span', { class: 'faint small' }, t('comments.reply.shortcut')))));
    };
    if (!data.length) { listWrap.replaceChildren(h('div', { class: 'list empty' }, filter === 'unreplied' ? t('legacy.all_comments_have_been_answered') : t('legacy.no_comments'))); return; }
    if (!group) { listWrap.replaceChildren(h('div', { class: 'list' }, data.map(row))); return; }
    const groups = new Map();
    for (const c of data) { const k = c.post_id || c.platform_media_id; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); }
    const posts = await Promise.all([...groups.keys()].map((k) => (k?.startsWith('p_') ? api('GET', `/v1/posts/${k}`).catch(() => null) : null)));
    listWrap.replaceChildren(...[...groups.entries()].map(([k, cs], i) => {
      const p = posts[i]; const m = p?.media?.[0];
      return h('div', { class: 'list', style: { marginBottom: '14px' } },
        h(p ? 'a' : 'div', { class: 'item group-head', href: p ? `#/posts/${p.id}` : null },
          m ? h('img', { class: 'thumb', src: m.url, alt: '' }) : h('div', { class: 'thumb' }),
          h('div', { class: 'body' }, h('div', { class: 'title' }, p?.content || t('comments.external.post')), h('div', { class: 'meta' }, `${cs.length} comments · @${cs[0].account_username}`))),
        cs.map(row));
    }));
  }
  await draw();
  const cleanup = live.on((t) => { if (t === 'comment.new' && document.activeElement?.tagName !== 'TEXTAREA') draw(); });if(nav===navSeq)pageCleanup=cleanup;else cleanup();
  return shell('/inbox', h('div', {},
    pagehead(t('legacy.comments'), t('legacy.instagram_comments_and_threads_replies_appear_here_automatically'),
      h('select', { style: { width: 'auto' }, onchange: (e) => setQ('a', e.target.value), 'aria-label': t('legacy.filter_accounts') }, h('option', { value: '' }, t('legacy.all_accounts')), accountOptions(acc)),
      h('div', { class: 'seg' }, [['unreplied', t('legacy.needs_reply')], ['all', t('legacy.all')], ['hidden', t('legacy.hidden')]].map(([v, l]) => h('button', { class: filter === v ? 'on' : '', onclick: () => setQ('f', v) }, l))),
      h('div', { class: 'seg' }, h('button', { class: !group ? 'on' : '', onclick: () => setQ('g', '') }, t('comments.latest')), h('button', { class: group ? 'on' : '', onclick: () => setQ('g', 'post') }, t('comments.by.post'))),
      h('button', { class: 'btn', onclick: async (e) => { e.currentTarget.disabled = true; const r = await api('POST', '/v1/comments/sync'); toast(`${r.synced} comments checked`); route(); } }, t('legacy.refresh'))),
    listWrap));
}

// ---------------- messages (Instagram DM) ----------------
const drafts = {};
function waitBadge(c) {
  if (!c.needs_reply || c.waiting_minutes == null) return null;
  const m = c.waiting_minutes;
  const late = m >= Math.round((state.stats.overdue_threshold_seconds || 300) / 60);
  const txt = m < 1 ? t('messages.just.now') : m < 60 ? t('messages.minutes',{n:m}) : m < 1440 ? t('messages.hours',{n:Math.floor(m/60)}) : t('messages.days',{n:Math.floor(m/1440)});
  return h('span', { class: `wait ${late ? 'late' : ''}`, title: late ? t('legacy.waiting_more_than_5_minutes') : t('legacy.waiting_for_reply') }, txt);
}
async function pageMessages(convId,nav) {
  await loadAccounts();
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const filter = q.get('f') || 'all';
  const acc = q.get('a') || '';
  const igAccounts = state.accounts.filter((a) => a.platform === 'instagram');
  const qs = (extra = {}) => { const n = new URLSearchParams(q); for (const [k, v] of Object.entries(extra)) v ? n.set(k, v) : n.delete(k); const t = n.toString(); return t ? `?${t}` : ''; };
  const wrap = h('div', { class: `dm ${convId ? 'has-thread' : ''}` });
  const listEl = h('div', { class: 'dm-list' });
  const threadEl = h('div', { class: 'dm-thread' });
  const syncPanel = h('div', { style: { marginBottom: '12px' }, 'aria-live': 'polite' });
  wrap.append(listEl, threadEl);

  async function drawSyncStatus() {
    try {
      const { data } = await api('GET', '/v1/messages/sync-status');
      syncPanel.replaceChildren(...data.filter(a => !acc || a.account_id === acc).map(a => h('div', { class: a.status === 'error' ? 'err-box' : 'faint small', style: { marginBottom: '6px' } },
        h('b', {}, `@${a.username}: `), ['error', 'empty'].includes(a.status) ? h('span',{},a.status==='empty'?t('messages.sync.empty'):ERR[a.code]||t('error.unknown'),a.message?technicalDetails({message:a.message}):null) : a.last_success ? `Last sync: ${fmtDT(a.last_success)} · ${a.conversations_found ?? '?'} conversations · ${a.messages_stored ?? '?'} messages saved` : t('legacy.not_synced_yet_select_refresh'),
        a.status === 'error' && ['permission_missing', 'account_expired'].includes(a.code) ? h('a', { class: 'btn sm', href: '/connect/instagram' }, t('accounts.reconnect.instagram')) : null)));
    } catch (error) { syncPanel.replaceChildren(h('div', { class: 'err-box' }, errMsg(error))); }
  }

  async function drawList() {
    const { data } = await api('GET', `/v1/conversations?filter=${filter}${acc ? `&account_id=${acc}` : ''}`);
    listEl.replaceChildren(...(data.length ? data.map((c) => h('a', { class: `dm-row ${c.id === convId ? 'on' : ''}`, href: `#/messages/${c.id}${qs()}` },
      h('span', { class: 'peer' }, initials(c.participant.username)),
      h('div', { class: 'body' },
        h('div', { class: 'who' }, `@${c.participant.username || t('comments.unknown.user')}`),
        h('div', { class: 'prev' }, c.last_message.direction === 'out' ? t('messages.you') : '', c.last_message.text || ''),
        h('div', { class: 'faint small' }, `ke @${c.account_username}`)),
      h('div', { style: { textAlign: 'right' } }, h('div', { class: 'faint small' }, ago(c.last_message.at)), waitBadge(c))))
      : [h('div', { class: 'dm-empty' }, filter === 'needs_reply' ? t('legacy.no_messages_need_a_reply_try_all_or_refresh') : t('legacy.no_conversations_yet_select_refresh_and_check_the_sync_status_above'))]));
  }
  async function drawThread() {
    if (!convId) { threadEl.replaceChildren(h('div', { class: 'dm-empty' }, igAccounts.length ? t('legacy.select_a_conversation_on_the_left') : t('legacy.connect_an_instagram_account_to_reply_to_dms'))); return; }
    let c;
    try { c = await api('GET', `/v1/conversations/${convId}`); } catch (e) { threadEl.replaceChildren(h('div', { class: 'dm-empty' }, errMsg(e))); return; }
    const box = h('div', { class: 'dm-msgs' });
    for (const m of c.messages) {
      box.append(h('div', { class: `bubble ${m.direction}` }, m.text || (m.attachments?.length ? '[lampiran]' : '')),
        h('div', { class: `bubble-meta ${m.direction}` }, fmtDT(m.sent_at), m.sent_by ? ` · ${m.sent_by}` : ''));
    }
    const ta = h('textarea', { placeholder: t('messages.reply.to',{handle:c.participant.username}), 'aria-label': t('insights.replies'), oninput: (e) => { drafts[c.id] = e.target.value; },
      onkeydown: (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } } });
    ta.value = drafts[c.id] || '';
    const sendBtn = h('button', { class: 'btn primary', onclick: () => send() }, t('messages.send'));
    async function send() {
      const text = ta.value.trim(); if (!text) return;
      sendBtn.disabled = true;
      try { await api('POST', `/v1/conversations/${c.id}/messages`, { text }); drafts[c.id] = ''; toast(t('legacy.message_sent')); await Promise.all([drawThread(), drawList()]); live.refresh(); }
      catch (e) { sendBtn.disabled = false; toast(errMsg(e), true); }
    }
    threadEl.replaceChildren(
      h('div', { class: 'dm-head' },
        h('a', { class: 'btn sm ghost mobile-only', href: `#/messages${qs()}`,'aria-label':t('legacy.back') }, icon('chevron-left')),
        h('span', { class: 'peer' }, initials(c.participant.username)),
        h('div', {}, h('b', {}, `@${c.participant.username}`), h('div', { class: 'faint small' }, `ke @${c.account_username} · Instagram`)),
        waitBadge(c), h('span', { class: 'spacer' }),
        c.status === 'open'
          ? h('button', { class: 'btn sm', onclick: async () => { await api('PATCH', `/v1/conversations/${c.id}`, { status: 'done' }); toast(t('legacy.marked_as_done')); drawList(); drawThread(); live.refresh(); } }, t('legacy.mark_as_done'))
          : h('button', { class: 'btn sm', onclick: async () => { await api('PATCH', `/v1/conversations/${c.id}`, { status: 'open' }); drawList(); drawThread(); live.refresh(); } }, t('messages.reopen'))),
      box,
      c.can_reply
        ? h('div', { class: 'dm-compose' }, ta, sendBtn)
        : h('div', { class: 'dm-closed' }, t('legacy.the_24_hour_reply_window_has_closed_reply_in_the_instagram_app')));
    box.scrollTop = box.scrollHeight;
    if (c.can_reply && document.activeElement?.tagName !== 'TEXTAREA') ta.focus({ preventScroll: true });
  }
  await Promise.all([drawList(), drawThread(), drawSyncStatus()]);
  const cleanup = live.on((t) => { if (t.startsWith('message.')) { drawList(); if (document.activeElement?.tagName !== 'TEXTAREA') drawThread(); } });if(nav===navSeq)pageCleanup=cleanup;else cleanup();
  return shell('/messages', h('div', {},
    pagehead(t('legacy.messages'), t('legacy.instagram_dms_from_your_assigned_accounts_replies_are_available_within_24_hours_of_the_last_customer_message'),
      h('select', { style: { width: 'auto' }, 'aria-label': t('legacy.filter_accounts'), onchange: (e) => go(`/messages${qs({ a: e.target.value })}`) },
        h('option', { value: '' }, t('messages.all.instagram')), accountOptions(acc, 'instagram')),
      h('div', { class: 'seg' }, [['needs_reply', t('legacy.needs_reply')], ['all', t('legacy.all')], ['done', t('comments.done')]].map(([v, l]) => h('button', { class: filter === v ? 'on' : '', onclick: () => go(`/messages${qs({ f: v })}`) }, l))),
      h('button', { class: 'btn', onclick: async (e) => {
        const button = e.currentTarget; button.disabled = true;
        try {
          const r = await api('POST', '/v1/messages/sync', acc ? { account_id: acc } : {});
          const empty = r.accounts?.filter(a => a.status === 'empty').length || 0;
          toast(r.errors?.length ? `${r.errors.length} accounts failed to sync. See details below.` : empty ? `Meta has returned no messages for ${empty} accounts. See status below.` : r.new_messages ? `${r.new_messages} new messages` : t('messages.sync.none'), !!r.errors?.length);
          await Promise.all([drawList(), drawThread(), drawSyncStatus()]); live.refresh();
        } catch (error) { toast(errMsg(error), true); }
        finally { button.disabled = false; }
      } }, t('legacy.refresh'))),
    syncPanel,
    wrap,
    h('p', { class: 'faint small', style: { marginTop: '10px' } }, t('legacy.threads_does_not_provide_a_message_api_so_only_instagram_dms_appear_here'))));
}

// ---------------- insights ----------------
const METRIC = {
  followers_count: t('insights.followers'), views: t('insights.views'), reach: t('insights.reach'), accounts_engaged: t('legacy.accounts_engaged'), total_interactions: t('insights.interactions'),
  likes: t('insights.likes'), comments: t('legacy.comments'), saves: t('insights.saves'), shares: t('insights.shares'), replies: t('insights.replies'), reposts: 'Repost', quotes: t('insights.quotes'), clicks: t('insights.clicks'),
};
const fmtNum = (n) => (n == null ? '–' : Number(n).toLocaleString('en-GB'));

/** Single-series line chart (SVG) with recessive grid, 2px line, hover tooltip. */
function lineChart(points, label) {
  const W = 320, H = 120, P = { l: 4, r: 4, t: 10, b: 18 };
  const vals = points.map((p) => p.v).filter((v) => v != null);
  const wrap = h('div', { class: 'spark' });
  if (!vals.length) { wrap.append(h('div', { class: 'faint small spark-empty' }, t('legacy.no_data_yet'))); return wrap; }
  const min = Math.min(...vals), max = Math.max(...vals);
  const lo = min === max ? min - 1 : min, hi = min === max ? max + 1 : max;
  const x = (i) => P.l + (points.length === 1 ? (W - P.l - P.r) / 2 : (i * (W - P.l - P.r)) / (points.length - 1));
  const y = (v) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
  const pts = points.map((p, i) => (p.v == null ? null : [x(i), y(p.v), p]));
  const path = pts.filter(Boolean).map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  const ns = 'http://www.w3.org/2000/svg';
  const el = (t, a) => { const n = document.createElementNS(ns, t); for (const [k, v] of Object.entries(a)) n.setAttribute(k, v); return n; };
  const svgEl = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': t('comments.chart.label',{label}), preserveAspectRatio: 'none' });
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
    tip.hidden = false; tip.replaceChildren(h('b', {}, fmtNum(best[2].v)), ' ', new Date(`${best[2].d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));
    tip.style.left = `${(best[0] / W) * 100}%`;
  });
  hit.addEventListener('mouseleave', () => { dot.setAttribute('visibility', 'hidden'); cross.setAttribute('visibility', 'hidden'); tip.hidden = true; });
  svgEl.append(hit);
  const fmtD = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  wrap.append(svgEl, tip, h('div', { class: 'axis' }, h('span', {}, fmtD(points[0].d)), h('span', {}, fmtD(points.at(-1).d))));
  return wrap;
}

async function pageInsights() {
  await loadAccounts();
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const days = Number(q.get('r') || 30);
  const accId = q.get('a') || state.accounts[0]?.id;
  const setQ = (k, v) => { const n = new URLSearchParams(q); n.set(k, v); go(`/insights?${n}`); };
  if (!accId) return shell('/insights', h('div', {}, pagehead('Insights'), h('div', { class: 'panel empty' }, t('legacy.no_connected_accounts'), h('br'), h('a', { class: 'btn', href: '#/accounts' }, t('legacy.connect_account')))));
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
  const table = h('details', { class: 'panel', style: { marginTop: '16px' } }, h('summary', {}, t('legacy.view_as_table')),
    h('div', { style: { overflowX: 'auto', marginTop: '10px' } }, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, h('th', {}, t('legacy.date')), order.map((k) => h('th', {}, METRIC[k])))),
      h('tbody', {}, data.days.slice().reverse().map((d) => h('tr', {}, h('td', {}, d.date), order.map((k) => h('td', {}, fmtNum(d[k])))))))));
  return shell('/insights', h('div', {},
    pagehead('Insights', t('legacy.track_account_changes_over_time_updated_every_6_hours_meta_data_can_lag_by_48_hours'),
      h('select', { style: { width: 'auto' }, 'aria-label': t('legacy.account'), onchange: (e) => setQ('a', e.target.value) }, accountOptions(accId)),
      h('div', { class: 'seg' }, [7, 30, 90].map((r) => h('button', { class: r === days ? 'on' : '', onclick: () => setQ('r', String(r)) }, t('insights.days',{n:r})))),
      h('button', { class: 'btn', onclick: async (e) => { e.currentTarget.disabled = true; try { await api('POST', '/v1/insights/sync'); toast(t('insights.updated')); route(); } catch (err) { toast(errMsg(err), true); e.currentTarget.disabled = false; } } }, t('legacy.refresh'))),
    a?.status === 'expired' ? h('div', { class: 'err-box', style: { marginBottom: '14px' } }, t('legacy.reconnect_this_account_to_resume_insights'), h('a', { href: `/connect/${a.platform}` }, t('account.reconnect.short'))) : null,
    tiles.length ? h('div', { class: 'metrics' }, tiles) : h('div', { class: 'panel empty' }, t('legacy.no_data_for_this_period_select_refresh_or_wait_for_the_next_sync')),
    tiles.length ? table : null));
}

// Account-specific integration details and reusable brand setup.
async function pageAccountDetail(accountId,nav) {
  await loadAccounts();
  const a=state.accounts.find(a=>a.id===accountId);
  if(!a)throw new Error(t('legacy.account_not_found_or_not_assigned_to_you'));
  const q=new URLSearchParams(location.hash.split('?')[1]||''),tab=q.get('tab')==='brand'&&a.platform==='instagram'?'brand':'integration';
  const back=isOwner()?'/accounts':'/generator';
  const company=state.companies.find(c=>c.id===a.company_id);
  const top=h('div',{},pagehead(a.name||'@'+a.username,t('legacy.integration_details_and_settings_for_this_account'),h('a',{class:'btn',href:'#'+back},t('legacy.back'))),
    h('section',{class:'panel account-detail-header'},avatar(a,'lg'),h('div',{},h('h2',{},'@'+a.username),h('p',{class:'muted small'},`${company?.name||'Unassigned'} · ${a.platform==='instagram'?'Instagram':'Threads'}`)),status(a.status)),
    h('div',{class:'seg account-detail-tabs'},h('button',{class:tab==='integration'?'on':'',onclick:()=>go('/accounts/'+encodeURIComponent(a.id))},t('account.integration.tab')),a.platform==='instagram'?h('button',{class:tab==='brand'?'on':'',onclick:()=>go('/accounts/'+encodeURIComponent(a.id)+'?tab=brand')},t('legacy.brand_kit_story')):null));
  if(tab==='integration'){
    top.append(h('section',{class:'panel'},h('h2',{},t('legacy.account_summary')),h('p',{},t('account.name',{name:a.name||a.username})),h('p',{},t('account.username',{name:a.username})),h('p',{},t('account.integration.status',{status:STATUS[a.status]||a.status})),a.followers_count!=null?h('p',{},t('account.followers',{n:fmtNumber(a.followers_count)})):null,a.token_expires_at?h('p',{},t('account.token.until',{date:fmtDT(a.token_expires_at)})):null,
      a.last_error?h('div',{class:'err-box'},t('error.provider'),technicalDetails({message:a.last_error})):null,
      h('div',{class:'row'},a.platform==='instagram'?h('a',{class:'btn primary',href:'#/accounts/'+encodeURIComponent(a.id)+'?tab=brand'},t('accounts.open.brand')):null,isOwner()?h('a',{class:'btn',href:'/connect/'+a.platform},t('accounts.reconnect')):null)));
    return shell(isOwner()?'/accounts':'/generator',top);
  }
  const story=await storyWorkspace({h,api,uploadFile,accounts:[a],fixedAccount:true,mode:'setup',toast,fmtDT,confirmDialog,errMsg,onContext:value=>{state.brandProfiles[value.account.id]=value.profile;}});
  const cleanup=()=>story.dispose();if(nav===navSeq)pageCleanup=cleanup;else await cleanup();
  top.append(story.element);
  return shell(isOwner()?'/accounts':'/generator',top);
}

// ---------------- accounts ----------------
async function pageAccounts() {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  if (q.get('connected')) toast(`${q.get('connected')} tersambung`);
  if (q.get('error')) toast(q.get('error'), true);
  if (q.get('connected') || q.get('error')) history.replaceState(null, '', '#/accounts');
  const [, me] = await Promise.all([loadAccounts(), api('GET', '/v1/me').catch(() => ({}))]);
  const missing = Object.entries(me.integrations || {}).filter(([, ok]) => !ok).map(([p]) => p === 'instagram' ? 'Instagram' : 'Threads');
  const selectedCompany = q.get('company') || 'all';
  function editCompany(company) {
    const name = h('input', { value: company?.name || '', maxlength: 100, placeholder: t('legacy.company_name'), 'aria-label': t('legacy.company_name') });
    const dialog = modal(company ? t('legacy.change_company') : t('legacy.add_company'), h('label', { class: 'field' }, t('legacy.company_name'), name), [h('button', { class: 'btn primary', onclick: async () => {
      try { await api(company ? 'PATCH' : 'POST', '/v1/companies' + (company ? '/' + company.id : ''), { name: name.value }); dialog.close(); toast(t('legacy.company_saved')); route(); }
      catch (error) { toast(errMsg(error), true); }
    } }, t('legacy.save'))]);
    name.focus();
  }
  async function refreshProfiles(e) {
    const button = e.currentTarget; button.disabled = true;
    let failed = 0;
    try {
      for (const a of state.accounts.filter(a => a.status === 'active')) {
        try { await api('POST', `/v1/accounts/${a.id}/profile`); } catch { failed++; }
      }
      toast(failed ? `${failed} profiles could not be refreshed. Reconnect accounts if needed.` : t('legacy.profile_name_and_photo_refreshed_from_meta'), !!failed); route();
    } finally { button.disabled = false; }
  }
  function accountRow(a) {
    return h('div', { class: 'item account-row' }, avatar(a, 'lg'),
      h('div', { class: 'body' },
        h('div', {}, h('a',{href:'#/accounts/'+encodeURIComponent(a.id)},h('b', {}, a.name || `@${a.username}`))),
        h('div', { class: 'muted small' }, `@${a.username}`),
        h('div', { class: 'meta' }, plat(a.platform), a.followers_count != null ? h('span', {}, t('accounts.followers',{n:fmtNumber(a.followers_count)})) : null,
          a.token_expires_at ? h('span', {}, t('accounts.token.expires',{date:fmtDay(a.token_expires_at)})) : null),
        a.last_error && a.status !== 'active' ? h('div', { class: 'err-box' }, t('error.provider'), technicalDetails({message:a.last_error})) : null),
      status(a.status),
      isOwner() ? h('select', { 'aria-label': `Company for @${a.username}`, style: { width: 'auto', maxWidth: '210px' }, onchange: async e => {
        const select = e.currentTarget;
        try { await api('PUT', `/v1/accounts/${a.id}/company`, { company_id: select.value || null }); toast(t('legacy.account_company_updated')); route(); }
        catch (error) { select.value = a.company_id || ''; toast(errMsg(error), true); }
      } }, h('option', { value: '', selected: !a.company_id }, t('legacy.unassigned')), state.companies.map(c => h('option', { value: c.id, selected: c.id === a.company_id }, c.name))) : null,
      h('a',{class:'btn sm',href:'#/accounts/'+encodeURIComponent(a.id)},t('legacy.account_details')),
      h('a', { class: 'btn sm', href: `/connect/${a.platform}` }, t('accounts.reconnect')),
      isOwner() ? h('button', { class: 'btn sm ghost danger', onclick: async () => {
        if (!await confirmDialog({title:t('account.disconnect.title',{handle:a.username}),body:t('account.disconnect.body'),tone:'danger',confirmLabel:t('account.disconnect.cta')})) return;
        try { await api('DELETE', `/v1/accounts/${a.id}`); toast(t('account.disconnect.done',{handle:a.username})); route(); } catch (error) { toast(errMsg(error), true); }
      } }, t('account.disconnect.cta')) : null);
  }
  const groups = companyGroups().filter(c => selectedCompany === 'all' || (c.id || 'none') === selectedCompany).filter(c => c.id || c.accounts.length);
  return shell('/accounts', h('div', {},
    missing.length ? h('div', { class: 'banner', style: { marginBottom: '1.5rem' } }, h('div', { class: 'l' }, h('div', { class: 'num' }, '!'), h('div', {},
      h('h3', {}, t('accounts.integration.missing',{names:missing.join(' & ')})),
      h('p', {}, isOwner() ? t('accounts.credentials.owner') : t('accounts.credentials.rep'))))) : null,
    pagehead(t('legacy.companies_accounts'), t('legacy.group_instagram_and_threads_accounts_under_their_companies'),
      isOwner() ? h('button', { class: 'btn primary', onclick: () => editCompany() }, t('legacy.add_company')) : null,
      h('a', { class: 'btn', href: '/connect/instagram' }, icon('instagram'), state.accounts.some(a => a.platform === 'instagram') ? t('legacy.add_instagram_account') : t('accounts.connect.instagram')),
      h('a', { class: 'btn', href: '/connect/threads' }, icon('threads'), t('accounts.connect.threads'))),
    h('div', { class: 'company-toolbar' },
      h('select', { 'aria-label': t('legacy.filter_companies'), onchange: e => go('/accounts?company=' + encodeURIComponent(e.target.value)) },
        h('option', { value: 'all', selected: selectedCompany === 'all' }, t('legacy.all_companies')), state.companies.map(c => h('option', { value: c.id, selected: selectedCompany === c.id }, c.name)), h('option', { value: 'none', selected: selectedCompany === 'none' }, t('legacy.unassigned'))),
      h('button', { class: 'btn', onclick: refreshProfiles, disabled: !state.accounts.length }, icon('refresh'), t('accounts.refresh.profiles'))),
    groups.map(c => h('details', { class: 'panel company-group', open: true },
      h('summary', {}, h('strong', {}, c.name), h('span', { class: 'faint small' }, ` · ${c.accounts.length} accounts`),
        isOwner() && c.id ? h('button', { class: 'btn sm ghost', onclick: e => { e.preventDefault(); editCompany(c); } }, t('accounts.rename')) : null),
      c.accounts.length ? h('div', { class: 'list' }, c.accounts.map(accountRow)) : h('p', { class: 'muted' }, t('legacy.no_accounts_in_this_company_yet_move_a_connected_account_here')))),
    !groups.length ? h('div', { class: 'panel empty' }, t('legacy.no_companies_or_accounts_yet_add_a_company_and_connect_an_account_to_start')) : null,
    h('p', { class: 'faint small' }, t('accounts.meta.help'))));
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
    toast(t('legacy.upload_complete')); route();
  }
  const drop = h('div', { class: 'drop',
    ondragover: (e) => { e.preventDefault(); drop.classList.add('over'); }, ondragleave: () => drop.classList.remove('over'),
    ondrop: (e) => { e.preventDefault(); drop.classList.remove('over'); upload([...e.dataTransfer.files]); } },
  h('p', {}, t('legacy.drop_photos_or_videos_here_or')), h('button', { class: 'btn primary', onclick: () => input.click() }, t('legacy.choose_files')), input,
  h('p', { class: 'faint small', style: { marginTop: '8px' } }, t('media.upload.help')), prog);
  const cells=data.map(m=>{
    const picture=m.type==='video'?h('video',{src:m.url,muted:true,controls:true,preload:'metadata'}):h('img',{src:m.url,alt:m.alt_text||'',loading:'lazy'});
    const alt=h('label',{class:'media-alt-inline'},t('media.alt.label'),h('input',{value:m.alt_text||'',onchange:async e=>{
      await api('PATCH',`/v1/media/${m.id}`,{alt_text:e.target.value});toast(t('media.alt.saved'));
    }}));
    const remove=h('button',{class:'btn sm ghost danger',onclick:async()=>{
      if(!await confirmDialog({title:t('media.delete.title'),body:t('media.delete.body'),tone:'danger',confirmLabel:t('media.delete.cta')}))return;
      try{await api('DELETE',`/v1/media/${m.id}`);route();}catch(e){toast(errMsg(e),true);}
    }},t('media.delete.cta'));
    return h('div',{class:'mcell'},h('div',{class:'pic'},picture),h('div',{class:'info'},
      h('div',{},m.type==='video'?t('media.video.duration',{n:Math.round((m.duration_ms||0)/1000)}):`${m.width} × ${m.height}`,` · ${fmtBytes(m.size_bytes)}`),
      h('div',{class:'faint',title:m.id},m.original_name||m.id),h('div',{class:'row'},alt,remove)));
  });
  return shell('/media',h('div',{},pagehead(t('media.title'),t('media.team.intro'),
    h('span',{class:'muted small'},`${fmtBytes(use.used_bytes)} · ${use.files} files`)),drop,
    cells.length?h('div',{class:'mgrid'},cells):ui.emptyState({title:t('media.empty.title'),body:t('media.empty.body')})));
}

// ---------------- developer: API keys, AI apps ----------------
async function pageDeveloper() {
  const [keys, apps] = await Promise.all([api('GET', '/v1/api-keys'), api('GET', '/v1/apps')]);
  const mcpUrl = `${location.origin}/mcp`;
  const copy = (t) => navigator.clipboard.writeText(t).then(() => toast(t('legacy.copied')));
  const nameIn = h('input', { placeholder: t('legacy.key_name_such_as_n8n_or_claude_code'), style: { maxWidth: '320px' } });
  const scopeIn = h('select', { style: { width: 'auto' } }, h('option', { value: 'read' }, t('legacy.read_only')), h('option', { value: 'write' }, t('legacy.read_and_write')));
  return shell('/developer', h('div', {},
    pagehead('API & AI', t('developer.intro')),
    h('div', { class: 'panel' }, h('h2', {}, t('developer.setup')),
      h('p', { class: 'muted' }, t('legacy.in_claude_add_this_url_under_settings_connectors_add_custom_connector_sign_in_to_lrmsmm_and_choose_access')),
      h('div', { class: 'secret', style: { background: 'var(--primary-t)' } }, h('code', {}, mcpUrl), h('button', { class: 'btn sm', onclick: () => copy(mcpUrl) }, t('legacy.copy'))),
      h('p', { class: 'muted small' }, t('developer.claude.key')),
      h('div', { class: 'secret', style: { background: 'var(--bg-2)' } }, h('code', {}, `claude mcp add --transport http lrmsmm ${mcpUrl} --header "Authorization: Bearer lrm_live_..."`))),
    h('div', { class: 'panel' }, h('h2', {}, t('api.agent.label')),
      h('p', { class: 'muted' }, t('legacy.send_media_carousels_captions_and_schedules_through_the_rest_api_create_a_draft_for_approval_or_schedule_directly_with_a_write_key')),
      h('div', { class: 'row' }, h('a', { class: 'btn', href: '/agent-api.md', target: '_blank', rel: 'noopener' }, t('developer.api.guide')), h('a', { class: 'btn', href: '/openapi.json', target: '_blank', rel: 'noopener' }, t('developer.openapi')))),
    h('div', { class: 'panel' }, h('h2', {}, t('developer.key.title')),
      h('p', { class: 'muted' }, t('developer.key.prefix'), h('code', {}, `${location.origin}/v1`), t('developer.key.suffix')),
      h('div', { class: 'row', style: { marginBottom: '12px' } }, nameIn, scopeIn, h('button', { class: 'btn primary', onclick: async () => {
        try {
          const k = await api('POST', '/v1/api-keys', { name: nameIn.value || t('developer.key.title'), scope: scopeIn.value });
          modal(t('legacy.new_api_key'), h('div', {}, h('p', {}, t('developer.key.copy')), h('div', { class: 'secret' }, h('code', {}, k.key), h('button', { class: 'btn sm', onclick: () => copy(k.key) }, t('legacy.copy')))),
            [h('button', { class: 'btn primary', onclick: (e) => { e.target.closest('dialog').close(); route(); } }, t('legacy.copied'))]);
        } catch (e) { toast(errMsg(e), true); }
      } }, t('legacy.create_api_key'))),
      keys.data.length ? h('div', { class: 'list' }, keys.data.map((k) => h('div', { class: 'item' },
        h('div', { class: 'body' }, h('b', {}, k.name), h('div', { class: 'meta' }, h('code', {}, `${k.prefix}…`), h('span', {}, k.scope === 'write' ? t('legacy.read_and_write') : t('legacy.read_only')), h('span', {}, k.last_used_at ? t('developer.key.last',{time:ago(k.last_used_at)}) : t('legacy.never_used')))),
        h('button', { class: 'btn sm ghost danger', onclick: async () => { if (!await confirmDialog({title:t('api.revoke.title',{name:k.name}),body:t('api.revoke.body'),tone:'danger',confirmLabel:t('api.revoke')})) return; await api('DELETE', `/v1/api-keys/${k.id}`); toast(t('api.key.revoked')); route(); } }, t('api.revoke'))))) : h('p', { class: 'faint' }, t('api.key.none'))),
    h('div', { class: 'panel' }, h('h2', {}, t('legacy.connected_apps')),
      apps.data.length ? h('div', { class: 'list' }, apps.data.map((a) => h('div', { class: 'item' },
        h('div', { class: 'body' }, h('b', {}, a.client_name || t('legacy.app')), h('div', { class: 'meta' }, h('span', {}, a.scope.includes('write') ? t('legacy.read_and_write') : t('legacy.read_only')), h('span', {}, t('developer.app.authorized',{date:fmtDT(a.created_at)})), a.last_used_at ? h('span', {}, t('developer.key.last',{time:ago(a.last_used_at)})) : null)),
        h('button', { class: 'btn sm ghost danger', onclick: async () => { await api('DELETE', `/v1/apps/${a.id}`); toast(t('legacy.access_revoked')); route(); } }, t('legacy.revoke'))))) : h('p', { class: 'faint' }, t('legacy.no_ai_apps_connected_through_oauth_yet')))));
}

// ---------------- team & user management ----------------
function accountPicker(selected = []) {
  const sel = new Set(selected);
  const box = h('div', {}, companyGroups().filter(c => c.accounts.length).map(c => h('details', { class: 'company-access', open: true },
    h('summary', {}, c.name), h('div', { class: 'acc-picker' }, c.accounts.map(a => {
      const button = h('button', { type: 'button', class: `acc-chip ${sel.has(a.id) ? 'on' : ''}`, 'aria-pressed': sel.has(a.id), onclick: () => {
        sel.has(a.id) ? sel.delete(a.id) : sel.add(a.id); button.classList.toggle('on'); button.setAttribute('aria-pressed', sel.has(a.id));
      } }, avatar(a), a.name || `@${a.username}`, h('span', { class: `chip-plat ${a.platform}` }, icon(a.platform)));
      return button;
    })))));
  return { el: state.accounts.length ? box : h('p', { class: 'faint' }, t('legacy.no_connected_social_accounts')), value: () => [...sel] };
}
function companyPicker(selected = []) {
  const sel = new Set(selected);
  const box = h('div', {}, state.companies.map(c => h('details', { class: 'company-access' },
    h('summary', {}, c.name, ` · ${state.accounts.filter(a => a.company_id === c.id).length} accounts`),
    h('label', {}, h('input', { type: 'checkbox', checked: sel.has(c.id), 'aria-label': `Access all accounts in ${c.name}`, onchange: e => {
      e.currentTarget.checked ? sel.add(c.id) : sel.delete(c.id);
    } }), t('legacy.access_all_accounts_in_this_company_including_new_accounts')),
    h('div', { class: 'acc-picker' }, state.accounts.filter(a => a.company_id === c.id).map(a => h('span', { class: 'acc-chip' }, avatar(a), a.name || `@${a.username}`, h('span', { class: 'muted small' }, ` @${a.username}`)))))));
  return { el: state.companies.length ? box : h('p', { class: 'faint' }, t('legacy.add_a_company_in_companies_accounts')), value: () => [...sel] };
}

async function pageTeam() {
  await loadAccounts();
  const owner = isOwner();
  const users = owner ? (await api('GET', '/v1/users')).data : [];
  const me = (await api('GET', '/v1/me'));
  const accName = (id) => { const a = state.accounts.find((x) => x.id === id); return a ? `@${a.username} (${PLAT[a.platform]})` : null; };

  const pw = h('form', { onsubmit: async (e) => {
    e.preventDefault();
    try { await api('POST', '/auth/password', Object.fromEntries(new FormData(pw))); toast(t('legacy.password_changed_all_api_keys_and_ai_app_access_were_revoked')); pw.reset(); }
    catch (err) { toast(errMsg(err), true); }
  } },
  h('label', { class: 'field' }, h('span', {}, t('personal.password.current')), h('input', { type: 'password', name: 'current', required: true, autocomplete: 'current-password' })),
  h('label', { class: 'field' }, h('span', {}, t('legacy.new_password')), h('input', { type: 'password', name: 'next', required: true, minlength: 8, autocomplete: 'new-password' })),
  h('p', { class: 'faint small' }, t('legacy.changing_your_password_revokes_all_api_keys_and_ai_app_access')),
  h('button', { class: 'btn' }, t('personal.password.change')));

  function editUser(u) {
    const picker = accountPicker(u.account_ids || []);
    const companies = companyPicker(u.company_ids || []);
    const role = h('select', { onchange: () => { pickWrap.hidden = role.value === 'owner'; } },
      h('option', { value: 'rep', selected: u.role === 'rep' }, t('legacy.representative_assigned_companies_and_accounts')),
      h('option', { value: 'owner', selected: u.role === 'owner' }, t('legacy.owner_all_accounts_and_team_management')));
    const name = h('input', { value: u.name || '' });
    const pass = h('input', { type: 'text', placeholder: t('team.password.keep'), minlength: 8 });
    const pickWrap = h('div', { hidden: u.role === 'owner' }, h('div', { class: 'field' }, h('span', {}, t('legacy.assigned_companies')), companies.el, h('span', {}, t('legacy.additional_individual_accounts_optional')), picker.el));
    const d = modal(t('team.edit',{email:u.email}), h('div', {},
      h('label', { class: 'field' }, h('span', {}, t('team.name')), name),
      h('label', { class: 'field' }, h('span', {}, t('team.role')), role), pickWrap,
      h('label', { class: 'field' }, h('span', {}, t('team.password.reset')), pass)),
    [h('button', { class: 'btn', onclick: () => d.close() }, t('legacy.cancel')), h('button', { class: 'btn primary', onclick: async () => {
      const body = { name: name.value, role: role.value };
      if (role.value === 'rep') { body.account_ids = picker.value(); body.company_ids = companies.value(); }
      if (pass.value) body.password = pass.value;
      try { await api('PATCH', `/v1/users/${u.id}`, body); d.close(); toast(t('team.member.updated')); route(); } catch (e) { toast(errMsg(e), true); }
    } }, t('legacy.save'))]);
  }

  function addUser() {
    const picker = accountPicker([]);
    const companies = companyPicker([]);
    const f = { name: h('input', { autocomplete: 'off' }), email: h('input', { type: 'email', required: true, autocomplete: 'off' }), password: h('input', { type: 'text', minlength: 8, required: true, autocomplete: 'off' }) };
    const role = h('select', { onchange: () => { pickWrap.hidden = role.value === 'owner'; } }, h('option', { value: 'rep' }, t('legacy.representative_assigned_companies_and_accounts')), h('option', { value: 'owner' }, t('legacy.owner_all_accounts_and_team_management')));
    const pickWrap = h('div', {}, h('div', { class: 'field' }, h('span', {}, t('legacy.assigned_companies_choose_more_than_one')), companies.el, h('span', {}, t('legacy.additional_individual_accounts_optional')), picker.el));
    const d = modal(t('legacy.invite_member'), h('div', {},
      h('label', { class: 'field' }, h('span', {}, t('team.name')), f.name), h('label', { class: 'field' }, h('span', {}, t('team.email')), f.email),
      h('label', { class: 'field' }, h('span', {}, t('team.password.initial')), f.password),
      h('label', { class: 'field' }, h('span', {}, t('team.role')), role), pickWrap),
    [h('button', { class: 'btn', onclick: () => d.close() }, t('legacy.cancel')), h('button', { class: 'btn primary', onclick: async () => {
      try {
        await api('POST', '/v1/users', { name: f.name.value, email: f.email.value, password: f.password.value, role: role.value, account_ids: role.value === 'rep' ? picker.value() : undefined, company_ids: role.value === 'rep' ? companies.value() : undefined });
        d.close(); toast(t('team.member.added')); route();
      } catch (e) { toast(errMsg(e), true); }
    } }, t('team.add'))]);
  }

  return shell('/team', h('div', {},
    pagehead(owner ? t('legacy.team_access') : t('legacy.my_accounts'), owner ? t('legacy.owners_manage_all_accounts_representatives_can_post_and_reply_only_on_assigned_accounts') : null,
      owner ? h('button', { class: 'btn primary', onclick: addUser }, t('legacy.invite_member')) : null),
    owner ? h('div', { class: 'list', style: { marginBottom: '18px' } }, users.map((u) => h('div', { class: 'item' },
      h('span', { class: 'peer' }, initials(u.name || u.email)),
      h('div', { class: 'body' },
        h('div', {}, h('b', {}, u.name || u.email), ' ', h('span', { class: `status role-${u.role}` }, ROLE[u.role])),
        h('div', { class: 'meta' }, h('span', {}, u.email),
          u.role === 'owner' ? h('span', {}, t('legacy.all_companies_and_accounts')) : h('span', {}, [...(u.company_ids || []).map(id => state.companies.find(c => c.id === id)?.name).filter(Boolean), ...(u.account_ids || []).map(accName).filter(Boolean)].join(' · ') || t('legacy.no_assignments')))),
      h('button', { class: 'btn sm', onclick: () => editUser(u) }, t('legacy.edit')),
      u.id !== state.user.id ? h('button', { class: 'btn sm ghost danger', onclick: async () => { if (!await confirmDialog({title:t('team.remove.title',{email:u.email}),body:t('team.remove.body'),tone:'danger',confirmLabel:t('team.remove.cta')})) return; await api('DELETE', `/v1/users/${u.id}`); toast(t('team.member.removed')); route(); } }, t('team.remove.cta')) : h('span', { class: 'faint small' }, t('team.you'))))) : null,
    !owner ? h('div', { class: 'panel', style: { marginBottom: '16px' } }, h('h2', {}, t('legacy.your_accounts')),
      state.accounts.length ? h('div', { class: 'acc-picker' }, state.accounts.map((a) => h('span', { class: 'acc-chip on' }, avatar(a), `@${a.username}`, h('span', { class: `chip-plat ${a.platform}` }, icon(a.platform)))))
        : h('p', { class: 'muted' }, t('legacy.no_accounts_assigned_yet_ask_the_owner_to_add_one'))) : null,
    h('div', { class: 'panel', style: { maxWidth: '460px' } }, h('h2', {}, t('personal.password.change')), pw),
    h('p', { class: 'faint small', style: { marginTop: '12px' } }, `Signed in as ${me.user.email} · ${ROLE[me.user.role]}`)));
}

// ---------------- admin (Owner) ----------------
const ACTION = {
  'post.publish': t('audit.post.publish'), 'post.schedule': t('audit.post.schedule'), 'post.update': t('audit.post.update'), 'post.cancel': t('audit.post.cancel'), 'post.publish_now': t('audit.post.publish_now'),
  'post.retry': t('audit.post.retry'), 'post.remove': t('audit.post.remove'), 'comment.reply': t('legacy.replying_to_comments'), 'comment.hide': t('legacy.hiding_comment'), 'comment.unhide': t('legacy.showing_comment'),
  'message.send': t('audit.dm.reply'), 'account.connect': t('legacy.connecting_account'), 'account.reconnect': t('legacy.reconnecting_account'), 'account.disconnect': t('legacy.disconnecting_account'),
  'user.create': t('audit.user.create'), 'user.update': t('audit.user.update'), 'user.assign': t('legacy.changing_member_access'), 'user.delete': t('audit.user.delete'),
  'api_key.create': t('audit.api_key.create'), 'api_key.revoke': t('audit.api_key.revoke'), 'ai_app.revoke': t('audit.ai_app.revoke'), 'media.delete': t('audit.media.delete'),
};
const VIA = { session: 'dashboard', api_key: t('developer.key.title'), oauth: 'AI (MCP)', system: 'sistem' };
async function pageAdmin() {
  if (!isOwner()) { go('/'); return shell('', h('div')); }
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const tab = q.get('t') || 'audit';
  const ov = await api('GET', '/v1/admin/overview');
  let body;
  if (tab === 'failed') {
    const { data } = await api('GET', '/v1/admin/failed-posts');
    body = data.length ? h('div', { class: 'list' }, data.map((f) => h('a', { class: 'item', href: `#/posts/${f.post_id}` },
      h('div', { class: 'body' }, h('div', { class: 'title' }, f.content || t('legacy.no_caption')),
        h('div', { class: 'meta' }, plat(f.platform), h('span', {}, `@${f.username}`), h('span', {}, fmtDT(f.updated_at))),
        h('div', { class: 'err-box', style: { marginTop: '6px' } }, h('b', {}, ERR[f.error_code] || f.error_code), f.error_message ? ` — ${f.error_message}` : '')),
      status('failed')))) : h('div', { class: 'list empty' }, t('legacy.no_failed_posts'));
  } else {
    const listEl = h('div', { class: 'list' });
    const more = h('button', { class: 'btn', hidden: true }, t('legacy.load_more'));
    let cursor = null;
    const load = async () => {
      const r = await api('GET', `/v1/admin/audit?limit=50${cursor ? `&cursor=${cursor}` : ''}`);
      for (const a of r.data) {
        const d = a.details || {};
        const extra = [d.accounts?.join(', '), d.username ? `@${d.username}` : null, d.to, d.email, d.text ? `“${d.text}”` : null, d.name].filter(Boolean).join(' · ');
        listEl.append(h('div', { class: 'item' },
          h('div', { class: 'body' }, h('div', {}, h('b', {}, a.user_email || t('audit.system')), ' ', ACTION[a.action] || a.action),
            h('div', { class: 'meta' }, h('span', {}, fmtDT(a.at)), h('span', {}, `via ${VIA[a.via] || a.via}`), extra ? h('span', {}, extra) : null)),
          a.target_type === 'post' && a.target_id ? h('a', { class: 'btn sm ghost', href: `#/posts/${a.target_id}` }, t('audit.view')) : null));
      }
      if (!listEl.children.length) listEl.append(h('div', { class: 'empty' }, t('legacy.no_activity_yet')));
      cursor = r.next_cursor; more.hidden = !cursor;
    };
    more.onclick = load;
    await load();
    body = h('div', {}, listEl, h('div', { class: 'row', style: { marginTop: '12px' } }, more));
  }
  return shell('/admin', h('div', {},
    pagehead(t('legacy.audit_log'), t('audit.intro')),
    h('div', { class: 'strip' },
      stat('#/team', 'team', ov.users, t('audit.team.members'), t('audit.team.roles'), 'em'),
      stat('#/accounts', 'users', ov.accounts, t('legacy.social_accounts'), ov.accounts_expired ? t('audit.accounts.reconnect',{n:ov.accounts_expired}) : t('legacy.all_active'), ov.accounts_expired ? 'ro' : 'sky', !!ov.accounts_expired),
      stat('#/admin?t=failed', 'send', ov.posts_24h, t('audit.published.day'), t('home.failed.posts',{n:ov.failed_24h}), ov.failed_24h ? 'ro' : 'am', !!ov.failed_24h, t('legacy.review')),
      stat('#/media', 'img', fmtBytes(ov.storage.used_bytes), t('audit.storage'), t('audit.media.files',{n:ov.storage.files}), 'pu', false, t('home.open'))),
    h('p', { class: 'small muted', style: { margin: '-10px 0 18px' } }, `Real-time: ${ov.realtime_hint}${ov.webhooks.last_at ? t('audit.realtime.last',{time:ago(ov.webhooks.last_at)}) : ''}.`),
    h('div', { class: 'seg', style: { marginBottom: '14px' } }, h('button', { class: tab === 'audit' ? 'on' : '', onclick: () => go('/admin') }, t('audit.log.tab')), h('button', { class: tab === 'failed' ? 'on' : '', onclick: () => go('/admin?t=failed') }, t('legacy.failed_posts'))),
    body));
}

// ---------------- router ----------------
let pageCleanup = null;
let navSeq = 0;
async function route() {
  const nav = ++navSeq;
  setNavigation(false);
  const path = (location.hash.slice(1) || '/').split('?')[0];
  if (pageCleanup) { const cleanup=pageCleanup; pageCleanup=null; await cleanup(); if(nav!==navSeq)return; }
  document.querySelectorAll('#toast > div:not(.has-action)').forEach(el=>el.remove());
  try {
    if (!state.user) {
      const st = await api('GET', '/auth/state');
      if(nav!==navSeq)return;
      state.mock = st.mock; state.user = st.user;
      if (!st.user) { $app.replaceChildren(authPage(st.needs_setup ? 'setup' : 'login')); return; }
      await loadAccounts();
      if(nav!==navSeq)return;
      state.stats = await api('GET', '/v1/stats');
      if(nav!==navSeq)return;
      state.lastOverdue = 0;
    }
    if (!isOwner() && /^\/(accounts|media|developer|team|admin|_ui)(?:\/|$)/.test(path) && !/^\/accounts\/[^/]+$/.test(path)) { go('/compose'); return; }
    live.start();
    if (path === '/login') { go('/'); return; }
    let m, view;
    if (path === '/') view = await pageHome();
    else if (path === '/compose') view = await pageCompose();
    else if (path === '/generator') {const account=new URLSearchParams(location.hash.split('?')[1]||'').get('account');if(account){go('/accounts/'+encodeURIComponent(account)+'?tab=brand');return;}view=await pageGenerator(nav);}
    else if (path === '/settings') view=await pageSettings();
    else if (path === '/generator/drafts') view = await pageContentDrafts(nav);
    else if ((m = path.match(/^\/compose\/(.+)$/))) view = await pageCompose(m[1]);
    else if ((m = path.match(/^\/posts\/(.+)$/))) view = await pagePost(m[1]);
    else if (path === '/calendar') view = await pageCalendar();
    else if (path === '/inbox') view = await pageInbox(nav);
    else if (path === '/messages') view = await pageMessages(undefined,nav);
    else if ((m = path.match(/^\/messages\/(.+)$/))) view = await pageMessages(m[1],nav);
    else if (path === '/insights') view = await pageInsights();
    else if (path === '/admin') view = await pageAdmin();
    else if (path === '/accounts') view = await pageAccounts();
    else if ((m=path.match(/^\/accounts\/([^/]+)$/))) view=await pageAccountDetail(decodeURIComponent(m[1]),nav);
    else if (path === '/media') view = await pageMedia();
    else if (path === '/developer') view = await pageDeveloper();
    else if (path === '/team') view = await pageTeam();
    else if (path === '/_ui') view = pageUIShowcase();
    else view = shell('', h('div', { class: 'panel empty' }, h('h2', {}, t('notfound.title')), h('a', { class: 'btn', href: '#/' }, t('notfound.cta'))));
    if(nav!==navSeq)return;
    $app.replaceChildren(view);
    if (!path.startsWith('/messages/')) window.scrollTo(0, 0);
    document.querySelectorAll('.dm-msgs').forEach((b) => { b.scrollTop = b.scrollHeight; });
  } catch (e) {
    if(nav!==navSeq)return;
    if (e.code === 'unauthenticated') return;
    $app.replaceChildren(shell('', h('div', { class: 'panel' }, h('h2', {}, t('error.page',{reason:errMsg(e)})),technicalDetails(e),h('button', { class: 'btn', onclick: route }, t('error.page.retry')))));
  }
}
function pageUIShowcase(){
  const base=state.accounts.slice(0,12);
  const sample=base.length ? [...base] : [{id:'sample-1',username:'sample',name:'Sample',platform:'instagram',company_id:null,status:'active'}];
  for(let i=sample.length;i<10;i++){const a=base[i%Math.max(1,base.length)]||sample[0];sample.push({...a,id:'sample-'+(i+1),username:a.username+'_'+(i+1),disabled:i===9,disabledReason:t('ui.showcase.disabled')});}
  const section=(title,...children)=>h('section',{class:'panel ui-showcase-section'},h('h2',{},title),...children);
  return shell('',h('div',{},pagehead(t('ui.showcase.title'),t('ui.showcase.subtitle')),
    section(t('ui.showcase.status'),...['planned','queued','running','concept_review','review','failed','approved','drafted','cancelled'].map(status=>ui.statusChip({status}))),
    section(t('ui.showcase.accounts'),h('p',{class:'muted small'},t('ui.showcase.multi')),
      ui.accountPicker({accounts:sample,selected:sample.slice(0,2).map(a=>a.id),readiness:id=>({ok:id!==sample[1].id}),onChange:()=>{}}),
      h('p',{class:'muted small'},t('ui.showcase.single')),
      ui.accountPicker({accounts:sample.slice(0,3),selected:[sample[0].id],mode:'single',onChange:()=>{}})),
    section(t('ui.showcase.scope'),ui.scopeBar({page:'_ui',views:[['month',t('view.month')],['list',t('view.list')]],onChange:route})),
    section(t('ui.showcase.dialogs'),h('button',{class:'btn',onclick:()=>confirmDialog({title:t('ui.showcase.cost.title'),body:t('ui.showcase.cost.body'),tone:'cost',confirmLabel:t('ui.showcase.cost.cta'),details:[[t('ui.showcase.posts'),'12'],[t('ui.showcase.provider'),t('dialog.cost.chip')]]})},t('ui.showcase.cost')),
      h('button',{class:'btn danger',onclick:()=>confirmDialog({title:t('ui.showcase.danger.title'),body:t('draft.delete.body'),tone:'danger',confirmLabel:t('ui.showcase.danger.cta')})},t('ui.showcase.danger')),
      h('button',{class:'btn',onclick:()=>inputDialog({title:t('draft.slide.revise.title',{n:2}),label:t('draft.slide.revise'),multiline:true,suggestions:[t('draft.dialog.slide.placeholder')]})},t('ui.showcase.input'))),
    section(t('ui.showcase.other'),ui.emptyState({title:t('draft.empty.none.title'),body:t('draft.empty.none.body'),action:h('a',{href:'#/generator',class:'btn primary'},t('draft.empty.none.cta'))}),
      ui.progressPipeline([{label:t('legacy.concept'),state:'done',count:12},{label:t('ui.showcase.images'),state:'working',count:5},{label:t('legacy.review'),state:'todo',count:0}]),
      ui.bulkBar({count:3,actions:[h('button',{class:'btn primary'},t('ui.showcase.approve'))]}),
      h('h3',{},t('ui.showcase.autosave')),...['saving','saved','failed'].map(key=>ui.chip(t('ui.showcase.'+key),key==='failed'?'bad':'neutral'))),
    section(t('ui.showcase.previews'),ui.sessionCard({title:t('ui.showcase.session'),state:t('ui.showcase.session.state'),accounts:sample.slice(0,2),action:h('button',{class:'btn'},t('ui.showcase.session.action'))}),
      ui.phonePreview({account:sample[0],caption:t('ui.showcase.caption')}),ui.summaryPanel({total:12,action:h('button',{class:'btn primary'},t('ui.showcase.cost.cta'))}))));
}
window.addEventListener('hashchange', route);
route();
