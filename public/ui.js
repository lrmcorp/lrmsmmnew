import { t } from './strings.en.js';

export function readContentPrefs(accountId) {
  try {
    const saved=JSON.parse(localStorage.getItem('lrm.content.'+accountId)||'{}');
    return {language:['id','en','mixed'].includes(saved.language)?saved.language:'id',emoji:saved.emoji!==false};
  } catch { return {language:'id',emoji:true}; }
}
export function writeContentPrefs(accountId, prefs) {
  const next={...readContentPrefs(accountId),...prefs};
  try { localStorage.setItem('lrm.content.'+accountId,JSON.stringify(next)); } catch { /* private browsing */ }
  return next;
}
export function contentInstruction(language='id',emoji=true) {
  return [t('content.prompt.'+language),...(!emoji?[t('content.prompt.no_emoji')]:[])].join('\n');
}
export const hasCaptionEmoji = text => /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{FE0F}]/u.test(text||'');

// Shared, build-free UI components. Call createUI with the app's existing helpers.
export function createUI({ h, icon, avatar, state, isOwner, go, modal }) {
  const tones = new Set(['neutral', 'ok', 'warn', 'bad', 'info', 'concept', 'outline', 'selected']);
  const runStatus = {
    planned: ['status.planned', 'neutral'], queued: ['status.queued', 'info'], running: ['status.running', 'info'],
    concept_review: ['status.concept_review', 'concept'], review: ['status.review', 'warn'], failed: ['status.failed', 'bad'],
    approved: ['status.approved', 'ok'], drafted: ['status.drafted', 'ok'], cancelled: ['status.cancelled', 'neutral'],
  };
  const scopeStore = 'lrm.scope';
  const defaultScope = () => ({ companyId: null, accountIds: 'all', views: {} });
  const readStoredScope = () => {
    try { return { ...defaultScope(), ...JSON.parse(localStorage.getItem(scopeStore) || '{}') }; }
    catch { return defaultScope(); }
  };
  state.scope ||= readStoredScope();

  function readScopeFromUrl(page) {
    const q = new URLSearchParams(location.hash.split('?')[1] || '');
    if (q.has('co')) state.scope.companyId = q.get('co') || null;
    if (q.has('acc')) state.scope.accountIds = q.get('acc') ? q.get('acc').split(',').filter(Boolean) : 'all';
    if (q.has('view')) state.scope.views[page] = q.get('view');
    if (state.scope.companyId && !state.companies.some(c=>c.id===state.scope.companyId) && !(
      state.scope.companyId==='none' && state.accounts.some(a=>!a.company_id))) state.scope.companyId=null;
    if (state.scope.accountIds!=='all') {
      const allowed=new Set(scopeAccounts().map(a=>a.id));
      state.scope.accountIds=state.scope.accountIds.filter(id=>allowed.has(id));
      if (!state.scope.accountIds.length) state.scope.accountIds='all';
    }
    return state.scope;
  }
  function scopeQuery(page, path = location.hash.slice(1) || '/') {
    const [pathname, query = ''] = path.split('?');
    const q = new URLSearchParams(query);
    q.delete('company'); q.delete('account'); q.delete('v');
    if (state.scope.companyId) q.set('co', state.scope.companyId); else q.delete('co');
    if (state.scope.accountIds !== 'all' && state.scope.accountIds.length) q.set('acc', state.scope.accountIds.join(',')); else q.delete('acc');
    if (state.scope.views[page]) q.set('view', state.scope.views[page]); else q.delete('view');
    return pathname + (q.size ? '?' + q : '');
  }
  function saveScope(page, patch, onChange) {
    Object.assign(state.scope, patch);
    const available = new Set(scopeAccounts().map(a => a.id));
    if (state.scope.accountIds !== 'all') {
      state.scope.accountIds = state.scope.accountIds.filter(id => available.has(id));
      if (!state.scope.accountIds.length) state.scope.accountIds = 'all';
    }
    try { localStorage.setItem(scopeStore, JSON.stringify(state.scope)); } catch { /* private browsing */ }
    history.replaceState(null, '', '#' + scopeQuery(page));
    onChange?.();
  }
  function scopeAccounts() {
    return state.accounts.filter(a => !state.scope.companyId || (a.company_id || 'none') === state.scope.companyId);
  }
  function selectedAccounts() {
    const available = scopeAccounts();
    return state.scope.accountIds === 'all' ? available : available.filter(a => state.scope.accountIds.includes(a.id));
  }
  function inScope(item) {
    const ids = new Set(selectedAccounts().map(a => a.id));
    const targets = item.targets?.map(t => t.account_id) || item.account_ids || [item.account_id].filter(Boolean);
    return targets.some(id => ids.has(id));
  }
  function chip(label, tone = 'neutral', options = {}) {
    return h('span', { class: `ui-chip tone-${tones.has(tone) ? tone : 'neutral'}` },
      options.dot ? h('span', { class: 'ui-chip-dot' }) : null,
      options.icon ? icon(options.icon) : null, label);
  }
  const statusChip = run => {
    const [key, tone] = runStatus[run.status] || ['status.pending', 'neutral'];
    return chip(t(key), tone);
  };
  function accountChip(account, { selected = false } = {}) {
    return h('span', { class: `account-chip ${selected ? 'is-selected' : ''}`, title: account.name || account.username },
      avatar(account, 'ui-avatar'), h('span', {}, '@' + account.username), selected ? icon('check') : null);
  }
  function accountPicker({ accounts = [], selected = [], mode = 'multi', readiness, onChange, maxInline = 8, groupByCompany = false } = {}) {
    const selection = selected === 'all' ? accounts.map(a => a.id) : [...selected];
    const selectedSet = new Set(selection);
    const row = h('div', { class: 'account-picker-row', role: mode === 'single' ? 'radiogroup' : 'group',
      'aria-label': t('scope.accounts.label') });
    const host = h('div', { class: 'account-picker' }, row);
    let popover;
    const available = accounts.filter(a => !a.disabled);
    function toggle(a) {
      if (a.disabled) return;
      if (mode === 'single') onChange?.([a.id]);
      else {
        const next = new Set(selectedSet);
        next.has(a.id) ? next.delete(a.id) : next.add(a.id);
        onChange?.([...next]);
      }
    }
    function button(a) {
      const picked = selectedSet.has(a.id);
      const ready = readiness?.(a.id);
      const tip = `${a.name || a.username} · ${t('ui.followers',{n:Number(a.followers_count || 0).toLocaleString('en-GB')})}${ready?.ok==null ? '' : ' · ' + (ready.ok ? t('ui.brandkit.ready') : t('ui.brandkit.missing'))}`;
      return h('button', { type: 'button', class: `account-chip ${picked ? 'is-selected' : ''}`,
        role: mode === 'single' ? 'radio' : null, 'aria-checked': mode === 'single' ? String(picked) : null,
        'aria-pressed': mode === 'multi' ? String(picked) : null,
        title: a.disabled ? a.disabledReason || tip : tip, 'aria-label': a.disabled ? a.disabledReason || tip : tip,
        'aria-disabled': a.disabled ? 'true' : null, onclick: () => toggle(a),
        onkeydown: e => {
          if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
          e.preventDefault(); const controls = [...row.querySelectorAll('button:not([aria-disabled="true"])')];
          const i = controls.indexOf(e.currentTarget); controls[(i + (e.key === 'ArrowRight' ? 1 : -1) + controls.length) % controls.length]?.focus();
        } }, avatar(a, 'ui-avatar'), h('span', {}, '@' + a.username),
        picked ? icon('check') : null, ready?.ok===false ? h('span', { class: 'readiness-dot', title: t('picker.dot.help') }) : null);
    }
    const inline = accounts.length > maxInline ? accounts.filter(a => selectedSet.has(a.id)) : accounts;
    if(groupByCompany){
      let lastCompany=Symbol('first');
      for(const a of inline){
        if(a.company_id!==lastCompany){lastCompany=a.company_id;row.append(h('span',{class:'account-picker-group'},state.companies.find(c=>c.id===a.company_id)?.name||t('scope.company.unassigned')));}
        row.append(button(a));
      }
    }else row.append(...inline.map(button));
    function closePopover() { popover?.remove(); popover = null; document.removeEventListener('pointerdown', outside); }
    function outside(e) { if (popover && !host.contains(e.target)) closePopover(); }
    if (accounts.length > maxInline) {
      const more = h('button', { type: 'button', class: 'account-chip more', onclick: () => {
        if (popover) return closePopover();
        const search = h('input', { type: 'search', placeholder: t('picker.search'), 'aria-label': t('picker.search') });
        const list = h('div', { class: 'account-popover-list' });
        const draw = () => {
          const query = search.value.toLocaleLowerCase().trim();
          const groups = new Map();
          for (const a of accounts.filter(a => (`${a.username} ${a.name || ''}`).toLocaleLowerCase().includes(query))) {
            const company = state.companies.find(c => c.id === a.company_id)?.name || t('scope.company.unassigned');
            if (!groups.has(company)) groups.set(company, []); groups.get(company).push(a);
          }
          list.replaceChildren(...[...groups].flatMap(([name, group]) => [
            h('div', { class: 'account-popover-group' }, h('b', {}, `${name} · ${group.length}`),
              mode === 'multi' ? h('button', { type: 'button', onclick: () => onChange?.([...new Set([...selectedSet, ...group.filter(a=>!a.disabled).map(a => a.id)])]) }, t('picker.all')) : null),
            ...group.map(a => h('button', { type: 'button', class: 'account-popover-item', onclick: () => toggle(a),
              'aria-checked': String(selectedSet.has(a.id)),role:mode==='single'?'radio':'checkbox','aria-disabled':a.disabled?'true':null,
              title:a.disabled?a.disabledReason||'':null },
              h('span', {class:'account-popover-check','aria-hidden':'true'},selectedSet.has(a.id)?icon('check'):null),
              avatar(a, 'ui-avatar'), h('b', {}, '@' + a.username),
              h('small', {}, Number(a.followers_count || 0).toLocaleString('en-GB')),
              readiness?.(a.id)?.ok===false ? chip(t('ui.brandkit.missing'), 'warn') : null))]));
        };
        search.addEventListener('input', draw);
        popover = h('div', { class: 'account-popover', onkeydown: e => { if (e.key === 'Escape') { closePopover(); more.focus(); } } }, search, list);
        host.append(popover); draw(); search.focus();
        queueMicrotask(() => document.addEventListener('pointerdown', outside));
      } }, icon('search'), t('picker.more', { n: accounts.length - inline.length }));
      row.append(more);
    }
    if (mode === 'multi') row.append(h('span', { class: 'account-picker-count' },
      t('picker.count', { n: selectedSet.size, m: available.length }), ' · ',
      h('button', { type: 'button', onclick: () => onChange?.(available.map(a => a.id)) }, t('picker.all'))));
    return host;
  }
  function scopeBar({ page, views = [], accountMode = 'multi', extra, onChange } = {}) {
    readScopeFromUrl(page);
    const groups = [...state.companies.map(c => ({ id: c.id, name: c.name, accounts: state.accounts.filter(a => a.company_id === c.id) }))];
    const unassigned = state.accounts.filter(a => !a.company_id);
    if (unassigned.length) groups.push({ id: 'none', name: t('scope.company.unassigned'), accounts: unassigned });
    const name = groups.find(c => c.id === state.scope.companyId)?.name || t('scope.company.all');
    const accounts = scopeAccounts();
    if(accountMode==='single'&&state.scope.accountIds==='all'&&accounts.length)state.scope.accountIds=[accounts[0].id];
    const chosen = selectedAccounts();
    const canonical = '#' + scopeQuery(page);
    if (location.hash !== canonical) history.replaceState(null, '', canonical);
    const selectCompany = id => saveScope(page, { companyId: id, accountIds: 'all' }, onChange);
    const chooseAccounts = ids => saveScope(page, { accountIds: ids }, onChange);
    const companyOptions = (afterSelect = () => {}) => h('div', { class: 'scope-company-menu' },
      h('button', { type: 'button', onclick: () => { afterSelect(); selectCompany(null); } }, t('scope.company.all'), h('small', {}, state.accounts.length)),
      groups.map(c => h('button', { type: 'button', disabled: !c.accounts.length,
        onclick: () => { afterSelect(); selectCompany(c.id); } }, c.name, h('small', {}, t('scope.company.count', { n: c.accounts.length, s:c.accounts.length===1?'':'s' })))),
      isOwner() ? h('a', { href: '#/accounts' }, t('scope.company.manage')) : null);
    const companyControl = !isOwner()&&groups.length===1 ? h('span',{class:'scope-company-fixed'},icon('building'),name) :
      h('details', { class: 'scope-company' },h('summary', {}, icon('building'), name, icon('chevron-down')), companyOptions());
    const currentView = state.scope.views[page] || views[0]?.[0];
    const viewControl = h('div', { class: 'scope-views', role: 'group', 'aria-label': t('scope.view') },
      h('span', {}, t('scope.view')), views.map(([value, label]) => h('button', { type: 'button',
        class: value === currentView ? 'is-active' : '', 'aria-pressed': String(value === currentView),
        onclick: () => { state.scope.views[page] = value; saveScope(page, {}, onChange); } }, label)));
    const picker = accountPicker({ accounts, selected: chosen.map(a => a.id), mode: accountMode,groupByCompany:!state.scope.companyId&&groups.length>1,
      onChange: chooseAccounts });
    const desktop = h('div', { class: 'scope-desktop' }, companyControl, icon('right'), picker,
      chosen.length < accounts.length ? h('button', { type: 'button', class: 'scope-reset', onclick: () => chooseAccounts('all') }, t('scope.reset')) : null,
      extra || null, viewControl);
    const mobile = h('div', { class: 'scope-mobile' },
      h('button', { type: 'button', disabled:!isOwner()&&groups.length===1, onclick: () => { let d; d=modal(t('scope.company.label'), companyOptions(() => d.close())); } }, icon('building'), name),
      h('button', { type: 'button', onclick: () => {
        const selected = new Set(chosen.map(a => a.id));
        const applyButton=h('button',{class:'btn primary'},t('scope.accounts.sheet.cta',{n:selected.size}));
        const body = h('div', { class: 'scope-sheet-list' }, accounts.map(a => h('label', {},
          h('input', { type: accountMode === 'single' ? 'radio' : 'checkbox', name: 'scope-account', checked: selected.has(a.id), onchange: e => {
            if (accountMode === 'single') { selected.clear(); selected.add(a.id); }
            else e.target.checked ? selected.add(a.id) : selected.delete(a.id);
            applyButton.textContent=t('scope.accounts.sheet.cta',{n:selected.size});
          } }), avatar(a, 'ui-avatar'), '@' + a.username)));
        applyButton.addEventListener('click',() => {
          chooseAccounts(selected.size ? [...selected] : 'all'); d.close();
        });
        const d = modal(t('scope.accounts.sheet.title', { company: name }), body, [applyButton]);
      } }, icon('users'), t('scope.accounts.mobile', { n: chosen.length })),
      h('button', { type: 'button', onclick: () => {
        const d = modal(t('scope.view'), h('div', { class: 'scope-mobile-views' },
          views.map(([value, label]) => h('button', { type: 'button', onclick: () => {
            state.scope.views[page] = value; saveScope(page, {}, onChange); d.close();
          } }, label))));
      }, 'aria-label': t('scope.view') }, icon('grid')));
    let notice = null;
    const seenKey='lrm.scope.notice.seen';
    let noticeSeen=false;try{noticeSeen=!!localStorage.getItem(seenKey);}catch{}
    if (state.scope.companyId && !noticeSeen) {
      const companyName=groups.find(c=>c.id===state.scope.companyId)?.name||name;
      notice=h('div',{class:'scope-notice'},h('span',{},t('scope.notice',{n:chosen.length,company:companyName,list:chosen.slice(0,3).map(a=>'@'+a.username).join(', ')})),
        h('button',{type:'button',class:'btn sm',onclick:()=>selectCompany(null)},t('scope.notice.cta')),
        h('button',{type:'button',class:'btn ghost sm','aria-label':t('dialog.close'),onclick:()=>{try{localStorage.setItem(seenKey,'1');}catch{}notice.remove();}},icon('x')));
    }
    return h('div', {class:'scope-bar-host'},notice,h('div', { class: 'scope-bar' }, desktop, mobile));
  }
  const emptyState = ({ icon: symbol = 'inbox', title, body, action }) => h('div', { class: 'ui-empty' },
    icon(symbol), h('h3', {}, title), h('p', {}, body), action || null);
  function autosave(saveFn, { delay = 1000, statusEl } = {}) {
    let timer, running = Promise.resolve(), dirty = false;
    async function flush() {
      clearTimeout(timer); if (!dirty) return running; dirty = false;
      running = running.then(saveFn).then(() => {
        if (statusEl) statusEl.textContent = t('autosave.saved', { 'HH:MM': new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) });
      }).catch(e => { dirty = true; if (statusEl) statusEl.textContent = t('autosave.failed', { reason: e.message }); });
      return running;
    }
    return { mark() { dirty = true; if (statusEl) statusEl.textContent = t('autosave.saving'); clearTimeout(timer); timer = setTimeout(flush, delay); }, flush };
  }
  const bulkBar = ({ count, actions = [] }) => h('div', { class: 'ui-bulkbar' }, h('b', {}, t('draft.bulk.selected', { n: count })), ...actions);
  const progressPipeline = steps => h('div', { class: 'ui-pipeline' }, steps.map(step => h('div', { class: `step ${step.state}` }, h('b', {}, step.label), h('span', {}, step.count ?? ''))));
  const sessionCard = session => h('article', { class: 'ui-session-card' }, h('h3', {}, session.title), chip(session.state, 'info'),
    h('p', {}, session.accounts?.map(a => '@' + a.username).join(', ') || ''), session.action || null);
  function phonePreview({ account, media = [], caption = '', platform = 'instagram' }) {
    let slide=0,active=platform;
    const root=h('div',{class:'ui-phone-preview'});
    const tabs=h('div',{class:'ui-phone-tabs',role:'group','aria-label':t('draft.preview.platform')});
    const stage=h('div',{class:'ui-phone-media'}),strip=h('div',{class:'ui-phone-strip'});
    function draw(){
      root.dataset.platform=active;
      tabs.replaceChildren(...['instagram','threads'].map(value=>h('button',{type:'button',class:active===value?'on':'',onclick:()=>{active=value;draw();}},t('platform.'+value))));
      const item=media[slide];stage.replaceChildren(item?.url?(item.type==='video'?h('video',{src:item.url,controls:true,preload:'metadata'}):h('img',{src:item.url,alt:t('draft.preview.slide',{n:slide+1})})):h('div',{class:'ui-phone-no-media'},icon('photograph'),t('legacy.no_image_yet')));
      strip.replaceChildren(...media.map((m,i)=>h('button',{type:'button',class:i===slide?'on':'','aria-label':t('draft.preview.slide',{n:i+1}),onclick:()=>{slide=i;draw();}},m.url?h('img',{src:m.url,alt:''}):String(i+1))));
    }
    root.append(tabs,h('div',{class:'ui-phone-head'},account?accountChip(account):null),stage,
      h('p',{class:'ui-phone-caption'},caption),strip);
    draw();return root;
  }
  const summaryPanel = model => h('aside', { class: 'ui-summary-panel' }, h('h2', {}, t('gen.summary')),
    h('b', {}, t('gen.summary.total', { total: model.total || 0 })), model.action || null);
  const readiness = (accountId,{aiImages=true,story=false}={}) => {
    const account=state.accounts.find(a=>a.id===accountId);
    const profile=state.brandProfiles?.[accountId];
    const keys=state.providerKeys;
    const providers=state.providers||{};
    const textKey=keys?.some(k=>providers[k.provider]?.textModel||providers[k.provider]?.textModels?.length);
    const imageKey=keys?.some(k=>providers[k.provider]?.imageModel||providers[k.provider]?.imageModels?.length);
    const required=[
      {ok:!!account&&account.status==='active',text:t('readiness.active')},
      {ok:profile?!!profile.seed:null,text:t('readiness.seed')},
      {ok:keys?!!textKey:null,text:t('readiness.text.key')},
      ...(aiImages?[{ok:keys?!!imageKey:null,text:t('readiness.image.key')}]:[]),
    ];
    const assets=profile?.assets||[];
    const recommended=profile?[
      {ok:assets.some(a=>a.category==='logo'),text:t('readiness.logo'),recommended:true},
      {ok:assets.some(a=>a.category==='visual'),text:t('readiness.visual'),recommended:true},
      ...(story?[{ok:assets.some(a=>a.category==='product'),text:t('readiness.product'),recommended:true}]:[]),
    ]:[];
    return {ok:required.some(x=>x.ok===false)?false:required.some(x=>x.ok==null)?null:true,items:[...required,...recommended]};
  };
  return { chip, statusChip, accountChip, accountPicker, scopeBar, scopeAccounts, selectedAccounts, inScope,
    saveScope, readScopeFromUrl, scopeQuery, emptyState, autosave, bulkBar, progressPipeline,
    sessionCard, phonePreview, summaryPanel, readiness };
}
