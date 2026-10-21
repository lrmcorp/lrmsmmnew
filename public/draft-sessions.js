import { t } from './strings.en.js';
import { renderSessionCalendar } from './draft-calendar.js';
import { renderRunCalendar } from './draft-run-calendar.js';

const pending = new Set(['planned', 'queued', 'running', 'concept_review', 'review', 'failed']);
const noExpiry = new Set(['approved', 'drafted']);
const countKeys = ['planned', 'queued', 'running', 'concept_review', 'review', 'failed', 'approved', 'drafted', 'cancelled'];

export function sessionTitle(source) {
  const raw = String(source?.brief || source?.title || '').split('\n').map(line => line.trim()).find(Boolean) || t('draft.title');
  let title = raw.replace(/^#+\s*/, '').replace(/[\*_\x60]/g, '').replace(/\s+/g, ' ').trim();
  if (title === title.toUpperCase()) title = title.toLocaleLowerCase('en-GB').replace(/\b\p{L}/gu, letter => letter.toLocaleUpperCase('en-GB'));
  title = title.replace(/\s+[—–]\s+/, ': ');
  title = title.replace(/Chapter (\d+):/i, 'Chapter $1,');
  if (title.length > 80) title = title.slice(0, 80).replace(/\s+\S*$/, '') + '…';
  return title;
}

export function sessionState(session) {
  const c = session.counts;
  const live = c.planned + c.queued + c.running + c.concept_review + c.review + c.failed;
  if (!session.runs.length && session.plans.some(plan => plan.content_count > 0)) return 'expired';
  if (c.concept_review) return 'concept';
  if (c.review) return 'review';
  if (c.failed) return 'failed';
  if (c.queued + c.running) return 'running';
  if (c.planned && c.planned === live) return 'plan';
  return 'done';
}

export function groupSessions(plans = [], runs = [], knownAccounts = []) {
  const groups = [], byPlan = new Map();
  const ordered = [...plans].sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  for (const plan of ordered) {
    let group = groups.find(g => plan.session_id && g.session_id === plan.session_id);
    if (!group && !plan.session_id && plan.created_at && Number.isFinite(Date.parse(plan.created_at))) group = groups.find(g => !g.session_id && g.plans.length && g.plans[0].created_at &&
      g.plans[0].brief === plan.brief && g.plans[0].start_date === plan.start_date &&
      g.plans[0].end_date === plan.end_date &&
      Math.abs(Date.parse(g.plans[0].created_at) - Date.parse(plan.created_at)) <= 300000);
    if (!group) { group = { id: plan.session_id || plan.id, session_id: plan.session_id, plans: [], runs: [] }; groups.push(group); }
    group.plans.push(plan); byPlan.set(plan.id, group);
  }
  for (const run of runs) {
    let group = run.plan_id && byPlan.get(run.plan_id);
    if (!group) { group = { id: run.id, plans: [], runs: [] }; groups.push(group); }
    group.runs.push(run);
  }
  return groups.map(group => {
    const dates = group.runs.map(r => r.scheduled_at).filter(Boolean).sort();
    const first = group.plans[0] || group.runs[0] || {};
    const accounts = [...new Set([
      ...group.runs.flatMap(r => r.targets?.map(target => target.account_id) || r.account_ids || [r.account_id].filter(Boolean)),
      ...group.plans.flatMap(p => p.account_ids || p.targets?.map(target => target.account_id) || [p.account_id].filter(Boolean))
    ].filter(Boolean))];
    if (!accounts.length && Array.isArray(knownAccounts) && knownAccounts.length) {
      const text = `${first.brief || ''} ${first.title || ''}`;
      for (const a of knownAccounts) {
        if (a.username && text.includes(a.username)) accounts.push(a.id);
      }
    }
    const counts = Object.fromEntries(countKeys.map(key => [key, group.runs.filter(r => r.status === key).length]));
    const expires = group.runs.filter(r => !noExpiry.has(r.status)).map(r => r.expires_at).filter(Boolean).sort();
    const session = { ...group, title: sessionTitle(first), fullTitle: String(first.brief || first.title || ''),
      account_ids: accounts, counts, mode: group.runs.some(r => r.story_episode || r.story_job_id) || group.plans.some(p => p.mode === 'story' || p.story_job_id || /\bchapter\b/i.test(p.brief || '')) ? 'story' : 'campaign',
      start: first.start_date || dates[0], end: first.end_date || dates.at(-1),
      createdAt: first.created_at || group.runs[0]?.created_at,
      updatedAt: group.runs.map(r => r.updated_at).filter(Boolean).sort().at(-1) || first.created_at,
      expiresAt: expires[0] || null };
    session.state = sessionState(session);
    return session;
  }).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export function createDraftPages({ h, api, ui, icon, avatar, state, isOwner, shell, pagehead, modal, confirmDialog, inputDialog,
  toast, errMsg, go, reload, fmtDay, fmtTime, fmtSlot, fmtRange, ago, wibInput, wibIso }) {

  const load = async () => {
    const [plans, runs] = await Promise.all([api('GET', '/v1/generator/plans'), api('GET', '/v1/generator/runs')]);
    return groupSessions(plans.data || [], runs.data || [], state.accounts || []);
  };

  const safeSlot = iso => {
    try {
      if (!iso || isNaN(Date.parse(iso))) return t('draft.unscheduled');
      return fmtSlot(iso);
    } catch {
      return t('draft.unscheduled');
    }
  };
  const safeDay = iso => {
    try {
      if (!iso || isNaN(Date.parse(iso))) return t('draft.unscheduled');
      return fmtDay(iso);
    } catch {
      return t('draft.unscheduled');
    }
  };
  const safeTime = iso => {
    try {
      if (!iso || isNaN(Date.parse(iso))) return '--:--';
      return fmtTime(iso);
    } catch {
      return '--:--';
    }
  };
  const safeWibInput = iso => {
    try {
      if (!iso || isNaN(Date.parse(iso))) return '';
      return wibInput(iso);
    } catch {
      return '';
    }
  };

  const account = id => state.accounts.find(a => a.id === id);
  const sessionPath = s => '/generator/drafts/' + encodeURIComponent(s.id);
  const stateLabel = s => t('draft.state.' + s.state);
  const stateTone = s => ({plan:'neutral',concept:'concept',review:'warn',failed:'bad',running:'info',done:'ok',expired:'bad'})[s.state];

  function tabMatches(s, tab) {
    if (tab === 'all') return true;
    if (tab === 'action') {
      if (['plan', 'concept', 'review', 'failed'].includes(s.state)) return true;
      if (s.state === 'expired') {
        const time = s.expiresAt ? Date.parse(s.expiresAt) : s.updatedAt ? Date.parse(s.updatedAt) : 0;
        return Number.isFinite(time) && (Date.now() - time) <= 864e5;
      }
      return false;
    }
    if (tab === 'running') return s.state === 'running';
    if (tab === 'done') return s.state === 'done';
    return false;
  }

  const countsLine = s => {
    if (s.state === 'expired') return t('draft.state.expired');
    const parts = countKeys.filter(key => s.counts[key]).map(key => t('draft.count.' + key, { n: s.counts[key] }));
    return parts.join(' · ') || t('draft.empty.none.title');
  };

  const actionLabel = s => {
    if (s.state === 'expired') return t('draft.cta.expired');
    if (s.state === 'plan') return t('draft.cta.plan', { n: s.runs.filter(r => r.status === 'planned').length || s.plans.reduce((sum, p) => sum + (p.content_count || 0), 0) });
    if (s.state === 'review') return t('draft.cta.review', { n: s.counts.review });
    if (s.state === 'failed') return t('draft.cta.failed', { n: s.counts.failed });
    return t('draft.cta.' + s.state, { n: s.runs.length });
  };

  const openDirection = s => {
    const readable = value => String(value || '').replace(/^\s*#{1,6}\s*/gm, '').replace(/[\*_\x60]/g, '').trim();
    const d = modal(t('draft.direction'), h('div', { class: 'draft-direction' }, s.plans.map(p => h('p', {}, readable(p.brief))), !s.plans.length ? h('p', {}, readable(s.fullTitle)) : null));
    return d;
  };

  const expiry = s => {
    if (!s.expiresAt || isNaN(Date.parse(s.expiresAt))) return s.state === 'done' ? ui.chip(t('draft.noexpiry'), 'ok') : null;
    const remaining = Date.parse(s.expiresAt) - Date.now();
    if (remaining <= 864e5) return ui.chip(t(remaining > 0 ? 'draft.expiry.today' : 'draft.expiry.past', { 'HH:MM': safeTime(s.expiresAt) }), 'bad');
    if (remaining <= 2 * 864e5) return ui.chip(t('draft.expiry.soon', { 'HH:MM': safeTime(s.expiresAt) }), 'warn');
    return ui.chip(t('draft.expiry', { n: Math.ceil(remaining / 864e5) }), 'neutral');
  };

  const beginPlan = async (s, ids = s.runs.filter(r => r.status === 'planned').map(r => r.id)) => {
    if (!ids.length) { go('/generator?brief=' + encodeURIComponent(s.plans[0]?.brief || s.fullTitle)); return; }
    const all = ids.length === s.runs.filter(r => r.status === 'planned').length &&
      s.plans.reduce((count, plan) => count + Number(plan.content_count || 0), 0) === ids.length;
    if (!await confirmDialog({
      title: t('draft.dialog.concepts', { n: ids.length }),
      body: t('draft.dialog.concepts.body'),
      tone: 'cost',
      confirmLabel: t('draft.cta.plan', { n: ids.length }),
      details: [
        [t('draft.cost.posts'), ids.length],
        [t('draft.cost.runs'), t('draft.cost.concept')],
        [t('draft.cost.images'), t('draft.cost.after')],
        [t('draft.cost.key'), t('draft.cost.provider')]
      ]
    })) return;

    if (all && s.plans.length) {
      for (const plan of s.plans) await api('POST', '/v1/generator/plans/' + encodeURIComponent(plan.id) + '/start', { confirm_cost: true });
    } else {
      for (const id of ids) await api('POST', '/v1/generator/runs/' + encodeURIComponent(id) + '/start', { confirm_cost: true });
    }
    toast(t('draft.queued', { n: ids.length }));
  };

  const action = async s => {
    if (s.state === 'plan') { await beginPlan(s); return; }
    if (s.state === 'expired') { go('/generator?brief=' + encodeURIComponent(s.plans[0]?.brief || s.fullTitle)); return; }
    go(sessionPath(s));
  };

  function thumbnails(s) {
    const sources = s.runs.filter(r => r.media?.[0]?.url).slice(0, 3);
    return h('div', { class: 'draft-session-thumbs', 'aria-hidden': 'true' },
      ...Array.from({ length: 3 }, (_, i) => h('span', { class: 'draft-session-thumb' }, sources[i]?.media?.[0]?.url ?
        h('img', { src: sources[i].media[0].url, alt: '' }) : icon('photograph'))));
  }

  function sessionCard(s, onRefresh) {
    const path = sessionPath(s);
    const accounts = s.account_ids.map(account).filter(Boolean);
    const barTotal = Math.max(1, s.runs.length);
    const intro = h('div', { class: 'draft-session-intro' }, h('b', { title: s.fullTitle }, s.title),
      h('div', { class: 'draft-session-meta' }, ...accounts.slice(0, 3).map(a => avatar(a)),
        accounts.length ? accounts.map(a => '@' + a.username).join(', ') : t('draft.account.unknown'),
        ui.chip(t('draft.mode.' + s.mode), s.mode === 'story' ? 'concept' : 'info'),
        s.start && s.end ? h('span', {}, fmtRange(s.start, s.end)) : null,
        s.createdAt ? h('span', {}, t('draft.meta.created', { date: safeDay(s.createdAt) })) : null));
    const stateBlock = h('div', { class: 'draft-session-state' }, ui.chip(stateLabel(s), stateTone(s)), h('span', {}, countsLine(s)),
      h('div', { class: 'draft-status-bar', role: 'img', 'aria-label': countsLine(s) },
        ...countKeys.filter(key => s.counts[key]).map(key => h('span', { class: 'state-' + key, style: { width: (s.counts[key] / barTotal * 100) + '%' } }))),
      expiry(s) || h('small', {}, s.updatedAt ? t('draft.meta.edited', { relative: ago(s.updatedAt) }) : ''));
    const button = h('button', {
      type: 'button', class: 'btn ' + (['plan', 'concept', 'review', 'failed'].includes(s.state) ? 'primary' : ''),
      onclick: async e => {
        e.stopPropagation();
        e.currentTarget.disabled = true;
        try {
          await action(s);
          if (s.state === 'plan') await onRefresh();
        } catch (error) {
          toast(errMsg(error), true);
        } finally {
          e.currentTarget.disabled = false;
        }
      }
    }, actionLabel(s));
    return h('article', { class: 'draft-session-card' }, h('a', { class: 'draft-session-main', href: '#' + path }, thumbnails(s), intro, stateBlock), button);
  }

  async function list() {
    ui.readScopeFromUrl('drafts');
    const root = h('div', {}, pagehead(t('draft.page.title'), t('draft.sub'), h('a', { class: 'btn primary', href: '#/generator' }, t('draft.new'))));
    const scope = ui.scopeBar({ page: 'drafts', views: [['list', t('view.list')], ['cards', t('view.cards')], ['calendar', t('view.calendar')]], onChange: () => { state.draftSearch = search.value; reload(); } });
    root.append(scope);
    const tabs = h('div', { class: 'draft-session-tabs', 'aria-label': t('draft.tabs.label') });
    const search = h('input', { type: 'search', value: state.draftSearch || '', placeholder: t('draft.search'), 'aria-label': t('draft.search'), oninput: () => { state.draftSearch = search.value; draw(); } });
    const sort = h('select', { 'aria-label': t('draft.sort.label'), onchange: () => draw() },
      ...[['newest', 'draft.sort.newest'], ['next', 'draft.sort.next'], ['expiry', 'draft.sort.expiry']].map(([value, key]) => h('option', { value }, t(key))));
    const content = h('div', { class: 'draft-session-results' });
    root.append(h('div', { class: 'draft-session-tools' }, tabs, h('div', { class: 'draft-session-search' }, search, sort)), content);
    let sessions = await load(), stopped = false, timer, fetching = false;
    const query = new URLSearchParams(location.hash.split('?')[1] || '');
    const requestedIds = (query.get('plans') || '').split(',').filter(Boolean);
    const legacySession = sessions.find(s => s.plans.some(p => p.id === query.get('plan') || requestedIds.includes(p.id)) ||
      s.runs.some(r => r.id === query.get('id')));
    if (legacySession) { go(sessionPath(legacySession) + (query.get('id') ? '?item=' + encodeURIComponent(query.get('id')) : '')); return { view: shell('/generator/drafts', root), cleanup: () => { stopped = true; } }; }
    let tab;
    try { tab = localStorage.getItem('lrm.drafts.tab') || 'action'; } catch { tab = 'action'; }
    function setTab(value) { tab = value; try { localStorage.setItem('lrm.drafts.tab', value); } catch {} draw(); }

    function draw() {
      const inScope = sessions.filter(s => !s.account_ids.length ? state.scope.accountIds === 'all' : s.account_ids.some(id => ui.selectedAccounts().some(a => a.id === id)));
      tabs.replaceChildren(...[['action', 'draft.tab.action'], ['running', 'draft.tab.running'], ['done', 'draft.tab.done'], ['all', 'draft.tab.all']].map(([value, key]) => {
        const n = inScope.filter(s => tabMatches(s, value)).length;
        return h('button', { type: 'button', 'aria-pressed': String(tab === value), class: tab === value ? 'on' : '', onclick: () => setTab(value) }, t(key), h('b', {}, n));
      }));
      let visible = inScope.filter(s => tabMatches(s, tab));
      const term = search.value.trim().toLocaleLowerCase();
      if (term) visible = visible.filter(s => s.title.toLocaleLowerCase().includes(term));
      visible.sort((a, b) => sort.value === 'next' ? String(a.start || '~').localeCompare(String(b.start || '~')) : sort.value === 'expiry' ?
        String(a.expiresAt || '~').localeCompare(String(b.expiresAt || '~')) : String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      const view = state.scope.views.drafts || 'list';
      content.className = 'draft-session-results view-' + view;
      if (!sessions.length) {
        content.replaceChildren(ui.emptyState({
          title: t('draft.empty.none.title'),
          body: t('draft.empty.none.body'),
          action: h('a', { class: 'btn primary', href: '#/generator' }, t('draft.empty.none.cta'))
        }));
      } else if (!visible.length) {
        const otherTab = ['action', 'running', 'done'].find(candidate => candidate !== tab && inScope.some(s => tabMatches(s, candidate)));
        const otherCount = otherTab ? inScope.filter(s => tabMatches(s, otherTab)).length : 0;
        const bodyText = otherTab ? t('draft.filter.tab_count', { n: otherCount, tab: t('draft.tab.' + otherTab) }) : t('draft.empty.filter.body', { n: inScope.length });
        const actions = [
          otherTab ? h('button', { class: 'btn', onclick: () => setTab(otherTab) }, t('draft.tab.open', { tab: t('draft.tab.' + otherTab) })) : null,
          h('button', { class: 'btn ghost', onclick: () => { search.value = ''; setTab('all'); } }, t('draft.empty.filter.cta'))
        ].filter(Boolean);
        content.replaceChildren(ui.emptyState({
          title: t('draft.empty.filter', { filter: term || (ui.selectedAccounts()[0] ? '@' + ui.selectedAccounts()[0].username : t('scope.accounts.label')), tab: t('draft.tab.' + tab) }),
          body: bodyText,
          action: h('div', { class: 'row', style: 'justify-content:center;gap:8px;' }, ...actions)
        }));
      } else if (view === 'calendar') {
        content.replaceChildren(renderSessionCalendar({ h, sessions: visible, sessionPath, fmtRange, icon, t }));
      } else {
        content.replaceChildren(...visible.map(s => sessionCard(s, refresh)));
      }
    }

    async function refresh() {
      if (stopped || fetching) return;
      fetching = true;
      try {
        sessions = await load();
        if (!stopped) draw();
      } catch (error) {
        if (!stopped) content.replaceChildren(ui.emptyState({
          title: t('error.page', { reason: errMsg(error) }),
          action: h('button', { class: 'btn', onclick: refresh }, t('error.page.retry'))
        }));
      } finally {
        fetching = false;
      }
    }

    draw();
    timer = setInterval(refresh, sessions.some(s => s.state === 'running') ? 5000 : 15000);
    return { view: shell('/generator/drafts', root), cleanup: () => { stopped = true; clearInterval(timer); } };
  }

  async function session(sessionId) {
    const sessions = await load();
    const s = sessions.find(item => item.id === sessionId || item.plans.some(p => p.id === sessionId) || item.runs.some(r => r.id === sessionId));
    if (!s) return { view: shell('/generator/drafts', ui.emptyState({ title: t('notfound.title'), action: h('a', { href: '#/generator/drafts', class: 'btn' }, t('draft.title')) })), cleanup: () => {} };

    let cleanupFns = [];
    const addCleanup = fn => cleanupFns.push(fn);

    const root = h('div', { class: 'draft-session-page' },
      h('div', { class: 'draft-session-breadcrumb' },
        h('a', { href: '#/generator/drafts' }, t('draft.page.title')),
        icon('chevron-right'),
        h('span', {}, s.title)
      )
    );

    const accounts = s.account_ids.map(account).filter(Boolean);
    const failedRuns = s.runs.filter(r => r.status === 'failed');
    const readyRuns = s.runs.filter(r => r.status === 'review');

    const moreMenu = h('details', { class: 'draft-more-menu' },
      h('summary', { class: 'btn sm', 'aria-label': t('legacy.actions') }, icon('dots-vertical')),
      h('div', { class: 'draft-more-dropdown' },
        h('button', {
          type: 'button',
          onclick: () => {
            moreMenu.open = false;
            go('/generator?brief=' + encodeURIComponent(s.plans[0]?.brief || s.fullTitle));
          }
        }, icon('sparkles'), t('draft.more.duplicate')),
        h('button', {
          type: 'button',
          class: 'is-danger',
          onclick: async () => {
            moreMenu.open = false;
            if (!await confirmDialog({
              title: t('draft.delete.session.title'),
              body: t('draft.delete.session.body'),
              tone: 'danger',
              confirmLabel: t('draft.delete.session.confirm')
            })) return;
            const ids = s.runs.map(r => r.id);
            if (ids.length) {
              await api('POST', '/v1/generator/drafts/delete', { ids });
            }
            toast(t('story.cancel.cancelled'));
            go('/generator/drafts');
          }
        }, icon('trash'), t('draft.more.delete'))
      )
    );

    const retryFailedBtn = failedRuns.length ? h('button', {
      type: 'button',
      class: 'btn',
      onclick: async () => {
        if (!await confirmDialog({
          title: t('draft.retry.failed', { n: failedRuns.length }),
          body: t('draft.dialog.retry.body'),
          tone: 'cost',
          confirmLabel: t('draft.retry.failed', { n: failedRuns.length }),
          details: [[t('draft.cost.runs'), failedRuns.length], [t('draft.cost.key'), t('draft.cost.provider')]]
        })) return;
        let failedCount = 0;
        for (const r of failedRuns) {
          try {
            await api('POST', '/v1/generator/runs/' + encodeURIComponent(r.id) + '/retry', {});
          } catch {
            failedCount++;
          }
        }
        reload();
        if (failedCount) toast(t('draft.retry.failed', { n: failedCount }), true);
      }
    }, t('draft.retry.failed', { n: failedRuns.length })) : null;

    const approveReadyBtn = readyRuns.length ? h('button', {
      type: 'button',
      class: 'btn primary',
      onclick: async () => {
        if (!await confirmDialog({
          title: t('draft.approve.dialog.title', { n: readyRuns.length }),
          body: t('draft.approve.dialog.body'),
          confirmLabel: t('draft.approve.many', { n: readyRuns.length })
        })) return;
        const progressEl = h('p', { class: 'muted' }, t('draft.batch.approving', { i: 0, n: readyRuns.length }));
        const diag = modal(t('draft.approving.wait'), progressEl);
        let succeeded = 0, failed = 0;
        for (let i = 0; i < readyRuns.length; i++) {
          const r = readyRuns[i];
          progressEl.textContent = t('draft.batch.approving', { i: i + 1, n: readyRuns.length });
          try {
            await api('POST', '/v1/generator/runs/' + encodeURIComponent(r.id) + '/approve', {
              content: r.caption,
              scheduled_at: r.scheduled_at
            });
            succeeded++;
          } catch {
            failed++;
          }
        }
        diag.close();
        if (succeeded) {
          modal(t('draft.approve.done.title', { n: succeeded }), h('div', { class: 'confirm-content' },
            h('p', {}, t('draft.approve.done.body', { slot: safeSlot(readyRuns[0]?.scheduled_at), rest: failed })),
            h('div', { class: 'row', style: 'justify-content:flex-end;gap:8px;' },
              h('button', { class: 'btn', onclick: () => reload() }, t('draft.approve.done.stay')),
              h('a', { class: 'btn primary', href: '#/calendar' }, t('draft.approve.done.open'))
            )
          ));
        } else {
          reload();
        }
      }
    }, t('draft.approve.many', { n: readyRuns.length })) : null;

    const header = h('div', { class: 'draft-session-header' },
      h('div', {},
        h('h1', {}, s.title),
        h('div', { class: 'draft-session-meta' },
          ui.chip(t('draft.mode.' + s.mode), s.mode === 'story' ? 'concept' : 'info'),
          ...accounts.map(a => ui.accountChip(a)),
          s.start && s.end ? h('span', {}, fmtRange(s.start, s.end)) : null,
          ui.chip(t('draft.count.posts', { n: s.runs.length, s: s.runs.length === 1 ? '' : 's' }), 'neutral'),
          expiry(s),
          h('span', { class: 'draft-autosave-tag' }, icon('check'), t('autosave.saved_automatically'))
        )
      ),
      h('div', { class: 'draft-session-actions' },
        h('button', { class: 'btn', onclick: () => openDirection(s) }, t('draft.direction')),
        retryFailedBtn,
        approveReadyBtn,
        moreMenu
      )
    );
    root.append(header);

    if (s.state === 'expired') {
      root.append(ui.emptyState({
        title: t('draft.empty.expired.title'),
        body: t('draft.empty.expired.body'),
        action: h('a', { class: 'btn primary', href: '#/generator?brief=' + encodeURIComponent(s.plans[0]?.brief || s.fullTitle) }, t('draft.expired.open.generator'))
      }));
    } else if (s.state === 'plan') {
      root.append(planPage(s));
    } else if (s.state === 'concept') {
      root.append(conceptPage(s));
    } else {
      const reviewResult = reviewPage(s, new URLSearchParams(location.hash.split('?')[1] || '').get('item'));
      root.append(reviewResult.element);
      if (reviewResult.cleanup) addCleanup(reviewResult.cleanup);
    }

    return {
      view: shell('/generator/drafts', root),
      cleanup: () => { cleanupFns.forEach(fn => fn()); }
    };
  }

  function planPage(s) {
    const planned = s.runs.filter(r => r.status === 'planned').sort((a, b) => String(a.scheduled_at || '').localeCompare(String(b.scheduled_at || '')));
    const picked = new Set(planned.map(r => r.id)), status = h('span', { role: 'status' });
    const create = h('button', {
      class: 'btn primary',
      onclick: async () => {
        create.disabled = true;
        try {
          await beginPlan(s, [...picked]);
          reload();
        } catch (error) {
          toast(errMsg(error), true);
        } finally {
          create.disabled = false;
        }
      }
    });
    const calloutCreate = h('button', { class: 'btn primary', onclick: () => create.click() });

    let selectAll;
    function update() {
      create.textContent = calloutCreate.textContent = t('draft.cta.plan', { n: picked.size });
      create.disabled = calloutCreate.disabled = !picked.size;
      status.textContent = t('draft.selected.of', { n: picked.size, m: planned.length });
      if (selectAll) {
        selectAll.checked = picked.size === planned.length;
        selectAll.indeterminate = picked.size > 0 && picked.size < planned.length;
      }
    }

    const callout = h('div', { class: 'draft-plan-callout' },
      icon('info'),
      h('p', {}, t('draft.plan.callout')),
      calloutCreate
    );

    const table = h('div', { class: 'draft-plan-table' }, h('table', {},
      h('thead', {}, h('tr', {},
        h('th', {}, selectAll = h('input', {
          type: 'checkbox', checked: true, 'aria-label': t('draft.select.all'),
          onchange: e => {
            if (e.target.checked) planned.forEach(r => picked.add(r.id));
            else picked.clear();
            table.querySelectorAll('tbody input[type=checkbox]').forEach(input => input.checked = e.target.checked);
            update();
          }
        })),
        ...['draft.plan.col.episode', 'draft.plan.col.title', 'draft.plan.col.type', 'draft.plan.col.schedule', 'draft.plan.col.reason'].map(key => h('th', {}, t(key)))
      )),
      h('tbody', {}, planned.map((r, i) => h('tr', {},
        h('td', {}, h('input', {
          type: 'checkbox', checked: true, 'aria-label': t('draft.select.item', { title: r.title || sessionTitle(r) }),
          onchange: e => {
            if (e.target.checked) picked.add(r.id);
            else picked.delete(r.id);
            update();
          }
        })),
        h('td', {}, r.story_episode || i + 1),
        h('td', {}, h('b', {}, r.title || sessionTitle(r)), h('small', {}, String(r.brief || '').split('\n').at(-1))),
        h('td', {}, ui.chip(r.content_type || t('gen.format.single'), 'neutral'), r.content_type === 'reel' && !r.media?.some(m => m.type === 'video') ? ui.chip(t('draft.plan.needsvideo'), 'warn') : null),
        h('td', {},
          h('input', {
            type: 'datetime-local', value: safeWibInput(r.scheduled_at), 'aria-label': t('draft.schedule.item', { title: r.title || sessionTitle(r) }),
            onchange: async e => {
              const previous = r.scheduled_at;
              const input = e.target;
              try {
                const next = wibIso(input.value);
                await api('PATCH', '/v1/generator/runs/' + encodeURIComponent(r.id), { scheduled_at: next });
                r.scheduled_at = next;
                input.nextElementSibling.textContent = safeSlot(next);
                toast(t('draft.schedule.saved'));
              } catch (error) {
                input.value = safeWibInput(previous);
                toast(errMsg(error), true);
              }
            }
          }),
          h('small', {}, safeSlot(r.scheduled_at))
        ),
        h('td', {}, r.schedule_reason || t('draft.plan.reason.none'))
      )))
    ));

    update();

    const shift = h('button', {
      class: 'btn',
      onclick: async () => {
        const input = h('input', { type: 'number', min: -365, max: 365, value: 1, 'aria-label': t('draft.shift.days') });
        const dialog = modal(t('draft.plan.shift'), h('label', {}, t('draft.shift.days'), input), [
          h('button', {
            class: 'btn primary',
            onclick: async e => {
              e.currentTarget.disabled = true;
              let failed = 0;
              for (const r of planned.filter(r => picked.has(r.id))) {
                try {
                  const at = new Date(r.scheduled_at);
                  at.setUTCDate(at.getUTCDate() + Number(input.value || 0));
                  await api('PATCH', '/v1/generator/runs/' + encodeURIComponent(r.id), { scheduled_at: at.toISOString() });
                } catch {
                  failed++;
                }
              }
              dialog.close();
              reload();
              if (failed) toast(t('draft.shift.failed', { n: failed }), true);
            }
          }, t('draft.plan.shift'))
        ]);
        input.focus();
      }
    }, t('draft.plan.shift'));

    const deletePlanBtn = h('button', {
      class: 'btn danger',
      onclick: async () => {
        if (!await confirmDialog({
          title: t('draft.delete.plan.title'),
          body: t('draft.delete.plan.body'),
          tone: 'danger',
          confirmLabel: t('draft.delete.plan.confirm')
        })) return;
        const ids = planned.map(r => r.id);
        if (ids.length) {
          await api('POST', '/v1/generator/drafts/delete', { ids });
        }
        toast(t('story.cancel.cancelled'));
        go('/generator/drafts');
      }
    }, t('draft.plan.delete'));

    return h('div', {}, callout, table, h('div', { class: 'draft-session-bulk' }, status, h('span', { class: 'spacer' }), shift, deletePlanBtn, create));
  }

  function conceptPage(s) {
    const concepts = s.runs.filter(r => r.status === 'concept_review' && r.steps?.revision?.output);
    const selected = new Set(concepts.map(r => r.id));
    const edits = new Map(concepts.map(r => [r.id, structuredClone(r.steps.revision.output)]));
    let chosen = concepts[0];
    const list = h('div', { class: 'draft-concept-list' }), editor = h('section', { class: 'draft-concept-editor' }), count = h('span', { role: 'status' });
    const provider = concepts[0]?.agents?.image;
    const imageCost = provider ? [provider.provider, provider.model].filter(Boolean).join(' · ') : t('draft.cost.provider');

    async function approve(ids) {
      const slides = concepts.filter(r => ids.includes(r.id)).reduce((n, r) => n + edits.get(r.id).slides.length, 0);
      if (!ids.length) return;
      if (!await confirmDialog({
        title: t('draft.dialog.images', { n: slides }),
        body: t('draft.dialog.images.body'),
        tone: 'cost',
        confirmLabel: t('draft.concept.bulk', { n: ids.length, m: slides }),
        details: [[t('draft.cost.posts'), ids.length], [t('draft.cost.images'), slides], [t('draft.cost.key'), imageCost]]
      })) return;
      let failed = 0;
      for (const id of ids) {
        try {
          await api('POST', '/v1/generator/runs/' + encodeURIComponent(id) + '/approve-concept', { concept: edits.get(id), confirm_cost: true });
        } catch {
          failed++;
        }
      }
      reload();
      if (failed) toast(t('draft.concept.failed', { n: failed }), true);
    }

    const bulk = h('button', { class: 'btn primary', onclick: () => approve([...selected]) });

    function drawList() {
      count.textContent = t('draft.selected.of', { n: selected.size, m: concepts.length });
      bulk.textContent = t('draft.concept.bulk', { n: selected.size, m: concepts.filter(r => selected.has(r.id)).reduce((n, r) => n + edits.get(r.id).slides.length, 0) });
      bulk.disabled = !selected.size;
      list.replaceChildren(...concepts.map((r, i) => h('div', { class: 'draft-concept-row' + (r.id === chosen?.id ? ' on' : '') },
        h('input', { type: 'checkbox', checked: selected.has(r.id), 'aria-label': t('draft.select.item', { title: r.title || sessionTitle(r) }), onchange: e => { e.target.checked ? selected.add(r.id) : selected.delete(r.id); drawList(); } }),
        h('button', { type: 'button', onclick: () => { chosen = r; drawList(); drawEditor(); } }, h('b', {}, r.title || edits.get(r.id).title || sessionTitle(r)),
          h('small', {}, safeSlot(r.scheduled_at)), ui.chip(t('draft.concept.verdict'), 'neutral')))));
    }

    function drawEditor() {
      if (!chosen) { editor.replaceChildren(ui.emptyState({ title: t('draft.empty.none.title') })); return; }
      const plan = edits.get(chosen.id);
      const title = h('input', { value: plan.title || '', maxlength: 300, 'aria-label': t('draft.concept.title'), oninput: e => { plan.title = e.target.value; } });
      const caption = h('textarea', { maxlength: 2200, 'aria-label': t('draft.concept.caption'), oninput: e => { plan.caption = e.target.value; counter.textContent = t('draft.caption.count', { n: e.target.value.length }); } }, plan.caption || '');
      const counter = h('small', {}, t('draft.caption.count', { n: (plan.caption || '').length }));
      const reviewer = chosen.steps?.revision?.output?.reviewer || chosen.steps?.revision?.note;
      editor.replaceChildren(
        h('h2', {}, t('draft.concept.stage')),
        reviewer ? h('div', { class: 'draft-concept-reviewer' }, icon('info'), h('p', {}, String(reviewer))) : null,
        h('label', {}, t('draft.concept.title'), title),
        h('label', {}, t('draft.concept.caption'), caption, counter),
        ...plan.slides.map((slide, i) => h('label', {}, t('draft.visual.slide', { n: i + 1 }), h('textarea', { maxlength: 6000, 'aria-label': t('draft.visual.direction', { n: i + 1 }), oninput: e => { slide.prompt = e.target.value; } }, slide.prompt))),
        h('label', {}, t('draft.revise.placeholder'), h('textarea', { class: 'draft-concept-instruction', 'aria-label': t('draft.revise.placeholder'), placeholder: t('draft.revise.placeholder') })),
        h('div', { class: 'draft-concept-editor-actions' },
          h('button', { class: 'btn', onclick: () => { selected.delete(chosen.id); drawList(); } }, t('draft.concept.skip')),
          h('button', { class: 'btn primary', onclick: () => approve([chosen.id]) }, t('draft.images.approve'))
        )
      );
    }

    drawList(); drawEditor();
    return h('div', { class: 'draft-concept-page' },
      h('div', { class: 'draft-concept-top' }, h('p', {}, t('draft.concept.stage')), bulk),
      h('div', { class: 'draft-concept-layout' }, list, editor),
      h('div', { class: 'draft-session-bulk' }, count, h('span', { class: 'spacer' }), bulk.cloneNode(true))
    );
  }

  function openEditDrawer(r, onSaved) {
    let currentSlide = 0;
    const media = r.media || [];
    const statusEl = h('span', { class: 'draft-autosave-status' });
    const captionInput = h('textarea', {
      maxlength: 2200,
      rows: 5,
      'aria-label': t('legacy.caption'),
      oninput: () => {
        counter.textContent = t('draft.caption.count', { n: captionInput.value.length });
        saver.mark();
      }
    }, r.caption || '');
    const counter = h('small', { class: 'muted' }, t('draft.caption.count', { n: (r.caption || '').length }));
    const scheduleInput = h('input', {
      type: 'datetime-local',
      value: safeWibInput(r.scheduled_at),
      'aria-label': t('compose.when.schedule'),
      onchange: () => saver.mark()
    });

    const saver = ui.autosave(async () => {
      const nextIso = wibIso(scheduleInput.value);
      await api('PATCH', '/v1/generator/runs/' + encodeURIComponent(r.id), {
        content: captionInput.value,
        scheduled_at: nextIso
      });
      r.caption = captionInput.value;
      r.scheduled_at = nextIso;
      onSaved?.();
    }, { delay: 800, statusEl });

    const slideStage = h('div', { class: 'draft-phone-viewport', style: 'border-radius:10px;' });
    const slideStrip = h('div', { class: 'draft-slide-strip-row' });

    function drawMedia() {
      const m = media[currentSlide];
      slideStage.replaceChildren(m?.url ? (m.type === 'video' ?
        h('video', { src: m.url, controls: true, preload: 'metadata' }) :
        h('img', { src: m.url, alt: t('draft.preview.slide', { n: currentSlide + 1 }) })) :
        h('div', { class: 'ui-phone-no-media' }, icon('photograph'), t('legacy.no_image_yet')));

      slideStrip.replaceChildren(...media.map((item, idx) => h('button', {
        type: 'button',
        class: 'draft-slide-thumb' + (idx === currentSlide ? ' on' : ''),
        onclick: () => { currentSlide = idx; drawMedia(); }
      }, item.url ? h('img', { src: item.url, alt: '' }) : String(idx + 1))));
    }
    drawMedia();

    const reviseSlideBtn = h('button', {
      type: 'button',
      class: 'btn sm',
      onclick: async () => {
        const text = await inputDialog({
          title: t('draft.slide.revise.title', { n: currentSlide + 1 }),
          body: t('draft.slide.revise.hint'),
          confirmLabel: t('draft.slide.revise')
        });
        if (!text) return;
        if (!await confirmDialog({
          title: t('draft.slide.revise.title', { n: currentSlide + 1 }),
          body: t('draft.dialog.retry.body'),
          tone: 'cost',
          confirmLabel: t('draft.slide.revise'),
          details: [[t('draft.cost.images'), 1], [t('draft.cost.key'), t('draft.cost.provider')]]
        })) return;
        try {
          await api('POST', '/v1/generator/runs/' + encodeURIComponent(r.id) + '/slides/revise', {
            slide: currentSlide,
            instruction: text,
            confirm_cost: true
          });
          toast(t('story.proposals.updated'));
          reload();
        } catch (err) {
          toast(errMsg(err), true);
        }
      }
    }, icon('refresh'), t('draft.slide.revise'));

    const detailsAccordion = h('details', { style: 'margin-top:10px;' },
      h('summary', { style: 'font-size:12px;color:var(--c-muted);' }, t('draft.prompt.details')),
      h('p', { class: 'small muted', style: 'white-space:pre-wrap;margin-top:8px;' }, r.brief || r.prompt || '-')
    );

    const deleteBtn = h('button', {
      type: 'button',
      class: 'btn danger',
      onclick: async () => {
        if (!await confirmDialog({
          title: t('draft.delete.draft.title'),
          body: t('draft.delete.draft.body'),
          tone: 'danger',
          confirmLabel: t('draft.delete.draft.confirm')
        })) return;
        try {
          await api('DELETE', '/v1/generator/runs/' + encodeURIComponent(r.id) + '/content');
          dialog.close();
          reload();
        } catch (err) {
          toast(errMsg(err), true);
        }
      }
    }, icon('trash'), t('draft.plan.delete'));

    const sendDraftBtn = h('button', {
      type: 'button',
      class: 'btn',
      onclick: async () => {
        await saver.flush();
        try {
          const res = await api('POST', '/v1/generator/runs/' + encodeURIComponent(r.id) + '/draft', { content: r.caption });
          dialog.close();
          go('/compose?ai_draft=' + encodeURIComponent(res.draft_id));
        } catch (err) {
          toast(errMsg(err), true);
        }
      }
    }, t('draft.send.compose'));

    const approveBtn = r.status === 'review' ? h('button', {
      type: 'button',
      class: 'btn primary',
      onclick: async () => {
        await saver.flush();
        if (!await confirmDialog({
          title: t('draft.dialog.approve.single'),
          body: t('draft.dialog.approve.single.body'),
          confirmLabel: t('draft.approve.one')
        })) return;
        try {
          await api('POST', '/v1/generator/runs/' + encodeURIComponent(r.id) + '/approve', {
            content: r.caption,
            scheduled_at: r.scheduled_at
          });
          dialog.close();
          reload();
        } catch (err) {
          toast(errMsg(err), true);
        }
      }
    }, t('draft.approve.one')) : null;

    const body = h('div', { class: 'draft-drawer-layout' },
      h('div', { class: 'col s' },
        slideStage,
        slideStrip,
        reviseSlideBtn
      ),
      h('div', { class: 'col s' },
        h('label', {}, t('legacy.caption'), captionInput, counter),
        h('label', {}, t('compose.when.schedule'), scheduleInput),
        detailsAccordion
      )
    );

    const dialog = modal(t('draft.drawer.edit'), body, [
      deleteBtn,
      sendDraftBtn,
      statusEl,
      approveBtn
    ].filter(Boolean));

    dialog.addEventListener('close', () => { saver.flush(); }, { once: true });
  }

  function reviewPage(s, itemId) {
    const filter = h('div', { class: 'draft-review-filters' });
    const query = new URLSearchParams(location.hash.split('?')[1] || '');
    let current = ['all', 'ready', 'approved', 'failed', 'progress'].includes(query.get('filter')) ? query.get('filter') : 'all';
    let chosen = s.runs.find(r => r.id === itemId) || s.runs.find(r => r.status === 'review') || s.runs[0];
    const list = h('div', { class: 'draft-review-list' }), preview = h('aside', { class: 'draft-review-preview' });
    const selectedAccounts = new Set(s.account_ids);
    const selectedRuns = new Set();
    const chipsHost = h('div', { class: 'draft-review-accounts' });
    state.scope.views.draftSession = ['date', 'grid', 'calendar'].includes(query.get('view')) ? query.get('view') : state.scope.views.draftSession || 'date';
    const views = h('div', { class: 'scope-views' });
    let activeSlide = 0;
    let previewPlatform = 'instagram';
    let approveButton;

    function visible() {
      return s.runs.filter(r => (!s.account_ids.length || r.targets?.some(target => selectedAccounts.has(target.account_id)) || r.account_ids?.some(id => selectedAccounts.has(id))) &&
        (current === 'all' ||
         current === 'ready' && r.status === 'review' ||
         current === 'approved' && r.status === 'approved' ||
         current === 'failed' && r.status === 'failed' ||
         current === 'progress' && ['queued', 'running'].includes(r.status)));
    }

    function wibDayParts(iso) {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return { weekday: '-', day: '-', month: '-' };
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Jakarta', weekday: 'short', day: 'numeric', month: 'short'
      }).formatToParts(d).map(p => [p.type, p.value]));
      return { weekday: parts.weekday, day: parts.day, month: parts.month };
    }

    function drawPreview() {
      if (!chosen) {
        preview.replaceChildren(ui.emptyState({ title: t('draft.empty.filter', { filter: t('scope.accounts.label'), tab: t('draft.tab.all') }) }));
        return;
      }
      const a = account(chosen.targets?.[0]?.account_id || chosen.account_id);
      const media = chosen.media || [];
      const totalSlides = Math.max(1, chosen.slide_count || media.length);
      const curMedia = media[activeSlide];

      const platformTabs = h('div', { class: 'seg', role: 'group', 'aria-label': t('draft.preview.platform') },
        ...['instagram', 'threads'].map(val => h('button', {
          type: 'button',
          class: previewPlatform === val ? 'on' : '',
          onclick: () => { previewPlatform = val; drawPreview(); }
        }, t('platform.' + val)))
      );

      const dots = totalSlides > 1 ? h('div', { class: 'draft-carousel-dots' },
        ...Array.from({ length: totalSlides }, (_, i) => h('span', { class: 'draft-carousel-dot' + (i === activeSlide ? ' on' : '') }))
      ) : null;

      const viewport = h('div', { class: 'draft-phone-viewport' },
        curMedia?.url ? (curMedia.type === 'video' ?
          h('video', { src: curMedia.url, controls: true, preload: 'metadata' }) :
          h('img', { src: curMedia.url, alt: t('draft.preview.slide', { n: activeSlide + 1 }) })) :
          h('div', { class: 'ui-phone-no-media' }, icon('photograph'), t('legacy.no_image_yet')),
        dots
      );

      const formattedCaption = h('div', { class: 'draft-phone-body' });
      if (a?.username) formattedCaption.append(h('b', {}, a.username), ' ');
      const words = String(chosen.caption || chosen.title || t('legacy.no_caption')).split(/(\s+)/);
      for (const w of words) {
        if (w.startsWith('#') || w.startsWith('@')) formattedCaption.append(h('span', { class: 'tag-highlight' }, w));
        else formattedCaption.append(w);
      }

      const phoneFrame = h('div', { class: 'draft-phone-frame' },
        h('div', { class: 'draft-phone-top' },
          a ? avatar(a) : null,
          h('span', {}, a ? a.username : t('draft.account.unknown')),
          h('span', { class: 'draft-phone-slot' }, chosen.scheduled_at ? safeSlot(chosen.scheduled_at) : '')
        ),
        viewport,
        formattedCaption
      );

      const slideStrip = media.length > 1 ? h('div', { class: 'draft-slide-strip-row' },
        ...media.map((item, idx) => h('button', {
          type: 'button',
          class: 'draft-slide-thumb' + (idx === activeSlide ? ' on' : ''),
          'aria-label': t('draft.preview.slide', { n: idx + 1 }),
          onclick: () => { activeSlide = idx; drawPreview(); }
        }, item.url ? h('img', { src: item.url, alt: '' }) : String(idx + 1))),
        h('span', { class: 'sub xs', style: 'margin-left:auto;' }, t('draft.slides.count', { n: totalSlides }))
      ) : null;

      const revisionInput = h('input', {
        type: 'text',
        placeholder: t('draft.revise.placeholder'),
        'aria-label': t('draft.revise.placeholder'),
        onkeydown: async e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const text = revisionInput.value.trim();
            if (!text) return;
            if (!await confirmDialog({
              title: t('draft.bulk.revise'),
              body: t('draft.dialog.retry.body'),
              tone: 'cost',
              confirmLabel: t('draft.revise.submit'),
              details: [[t('draft.cost.posts'), 1], [t('draft.cost.key'), t('draft.cost.provider')]]
            })) return;
            try {
              await api('POST', '/v1/generator/runs/' + encodeURIComponent(chosen.id) + '/revise', { instruction: text, confirm_cost: true });
              toast(t('story.proposals.updated'));
              reload();
            } catch (err) {
              toast(errMsg(err), true);
            }
          }
        }
      });
      const revisionBox = h('div', { class: 'draft-revision-bar' },
        icon('sparkles'),
        revisionInput,
        h('button', {
          type: 'button',
          class: 'btn sm ghost',
          onclick: () => revisionInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
        }, icon('arrow-right'))
      );

      const fullEditBtn = h('button', {
        type: 'button',
        class: 'btn sm',
        onclick: () => openEditDrawer(chosen, () => { draw(); drawPreview(); })
      }, icon('pencil-alt'), t('draft.full.edit'));

      const reviseSlideBtn = h('button', {
        type: 'button',
        class: 'btn sm',
        onclick: async () => {
          const text = await inputDialog({
            title: t('draft.slide.revise.title', { n: activeSlide + 1 }),
            body: t('draft.slide.revise.hint'),
            confirmLabel: t('draft.slide.revise')
          });
          if (!text) return;
          if (!await confirmDialog({
            title: t('draft.slide.revise.title', { n: activeSlide + 1 }),
            body: t('draft.dialog.retry.body'),
            tone: 'cost',
            confirmLabel: t('draft.slide.revise'),
            details: [[t('draft.cost.images'), 1], [t('draft.cost.key'), t('draft.cost.provider')]]
          })) return;
          try {
            await api('POST', '/v1/generator/runs/' + encodeURIComponent(chosen.id) + '/slides/revise', {
              slide: activeSlide,
              instruction: text,
              confirm_cost: true
            });
            toast(t('story.proposals.updated'));
            reload();
          } catch (err) {
            toast(errMsg(err), true);
          }
        }
      }, icon('refresh'), t('draft.slide.revise'));

      const scheduleBtn = h('button', {
        type: 'button',
        class: 'btn sm',
        onclick: async () => {
          const input = h('input', { type: 'datetime-local', value: safeWibInput(chosen.scheduled_at) });
          const diag = modal(t('compose.when.schedule'), h('label', {}, t('compose.when.schedule'), input), [
            h('button', {
              class: 'btn primary',
              onclick: async () => {
                const next = wibIso(input.value);
                try {
                  await api('PATCH', '/v1/generator/runs/' + encodeURIComponent(chosen.id), { scheduled_at: next });
                  chosen.scheduled_at = next;
                  diag.close();
                  draw();
                  drawPreview();
                  toast(t('draft.schedule.saved'));
                } catch (err) {
                  toast(errMsg(err), true);
                }
              }
            }, t('legacy.save'))
          ]);
        }
      }, icon('calendar'), chosen.scheduled_at ? safeSlot(chosen.scheduled_at) : t('draft.unscheduled'));

      const quickActions = h('div', { class: 'draft-preview-quick' }, fullEditBtn, reviseSlideBtn, scheduleBtn);

      const isReviewable = chosen.status === 'review';
      const approveCalendarBtn = h('button', {
        type: 'button',
        class: 'btn primary lg',
        style: 'width:100%;min-height:44px;',
        disabled: !isReviewable,
        onclick: async () => {
          if (!await confirmDialog({
            title: t('draft.dialog.approve.single'),
            body: t('draft.dialog.approve.single.body'),
            confirmLabel: t('draft.approve.one')
          })) return;
          try {
            await api('POST', '/v1/generator/runs/' + encodeURIComponent(chosen.id) + '/approve', {
              content: chosen.caption,
              scheduled_at: chosen.scheduled_at
            });
            chosen.status = 'approved';
            toast(t('story.approve.added', { n: 1 }));
            const items = visible();
            const nextReview = items.find(r => r.status === 'review' && r.id !== chosen.id);
            if (nextReview) chosen = nextReview;
            draw();
            drawPreview();
          } catch (err) {
            toast(errMsg(err), true);
          }
        }
      }, chosen.status === 'approved' ? t('draft.status.approved') : t('draft.approve.one'));
      approveButton = approveCalendarBtn;

      const shortcutsHint = h('div', { class: 'draft-shortcuts-hint' },
        h('span', { class: 'kbd' }, 'Left'),
        h('span', { class: 'kbd' }, 'Right'), ' move · ',
        h('span', { class: 'kbd' }, 'A'), ' approve · ',
        h('span', { class: 'kbd' }, 'E'), ' edit · ',
        h('span', { class: 'kbd' }, 'X'), ' select'
      );

      preview.replaceChildren(
        h('div', { class: 'draft-preview-head' },
          h('h3', {}, t('draft.preview')),
          platformTabs
        ),
        phoneFrame,
        slideStrip,
        revisionBox,
        quickActions,
        approveCalendarBtn,
        shortcutsHint
      );
    }

    function renderPostCard(r) {
      const isChosen = r.id === chosen?.id;
      const isFailed = r.status === 'failed';
      const isProgress = ['queued', 'running'].includes(r.status);
      const isApproved = r.status === 'approved';
      const a = account(r.targets?.[0]?.account_id || r.account_id);
      const slides = r.slide_count || r.media?.length || 1;

      const thumb = h('div', { class: 'draft-post-thumb' + (isFailed ? ' is-failed' : isProgress ? ' is-progress' : '') },
        isFailed ? icon('exclamation') :
        isProgress ? h('span', {}, `${r.steps?.image?.completed_slides || 0}/${slides}`) :
        r.media?.[0]?.url ? h('img', { src: r.media[0].url, alt: '' }) :
        icon('photograph'),
        slides > 1 && !isFailed && !isProgress ? h('span', { class: 'badge-n' }, String(slides)) : null
      );

      const statusChip = isFailed ? ui.chip(t('draft.status.failed'), 'bad') :
        isProgress ? ui.chip(t('draft.status.progress'), 'info') :
        isApproved ? ui.chip(t('draft.status.approved'), 'ok') :
        r.status === 'review' ? ui.chip(t('draft.status.ready'), 'warn') :
        ui.statusChip(r);

      const capText = isFailed ? (r.error || t('legacy.generation_failed')) :
        isProgress ? t('generator.images.progress', { done: r.steps?.image?.completed_slides || 0, total: slides }) :
        (r.caption || r.title || t('legacy.no_caption'));

      const retryLink = isFailed ? h('button', {
        type: 'button',
        class: 'btn-link',
        onclick: async e => {
          e.stopPropagation();
          if (!await confirmDialog({
            title: t('draft.retry.failed', { n: 1 }),
            body: t('draft.dialog.retry.body'),
            tone: 'cost',
            confirmLabel: t('draft.retry.one'),
            details: [[t('draft.cost.runs'), 1], [t('draft.cost.key'), t('draft.cost.provider')]]
          })) return;
          try {
            await api('POST', '/v1/generator/runs/' + encodeURIComponent(r.id) + '/retry', {});
            reload();
          } catch (err) {
            toast(errMsg(err), true);
          }
        }
      }, t('draft.retry.one')) : null;

      const card = h('div', {
        class: 'draft-post-card' + (isChosen ? ' sel' : '') + (isFailed ? ' is-failed' : ''),
        onclick: () => {
          chosen = r;
          activeSlide = 0;
          draw();
          drawPreview();
        }
      },
        h('input', {
          type: 'checkbox',
          checked: selectedRuns.has(r.id),
          'aria-label': t('draft.select.item', { title: r.title || sessionTitle(r) }),
          onclick: e => e.stopPropagation(),
          onchange: e => {
            if (e.target.checked) selectedRuns.add(r.id);
            else selectedRuns.delete(r.id);
          }
        }),
        thumb,
        h('div', { class: 'draft-post-info' },
          h('div', { class: 'draft-post-meta' },
            a ? avatar(a) : null,
            h('b', {}, r.scheduled_at ? safeTime(r.scheduled_at) : '--:--'),
            statusChip
          ),
          h('div', { class: 'draft-post-cap' }, capText),
          retryLink
        )
      );
      return card;
    }

    function draw() {
      const scoped = s.runs.filter(r => !s.account_ids.length || r.targets?.some(target => selectedAccounts.has(target.account_id)) || r.account_ids?.some(id => selectedAccounts.has(id)));
      const counts = {
        all: scoped.length,
        ready: scoped.filter(r => r.status === 'review').length,
        approved: scoped.filter(r => r.status === 'approved').length,
        failed: scoped.filter(r => r.status === 'failed').length,
        progress: scoped.filter(r => ['queued', 'running'].includes(r.status)).length
      };

      chipsHost.replaceChildren(ui.accountPicker({
        accounts: s.account_ids.map(account).filter(Boolean),
        selected: [...selectedAccounts],
        onChange: ids => {
          selectedAccounts.clear();
          ids.forEach(id => selectedAccounts.add(id));
          draw();
          drawPreview();
        }
      }));

      filter.replaceChildren(...[['all', 'draft.tab.all'], ['ready', 'draft.status.ready'], ['approved', 'draft.filter.approved'], ['failed', 'draft.status.failed'], ['progress', 'draft.status.progress']].map(([value, key]) =>
        h('button', {
          class: current === value ? 'on' : '',
          'aria-pressed': String(current === value),
          onclick: () => { current = value; draw(); drawPreview(); }
        }, t(key), h('b', {}, counts[value]))
      ));

      views.replaceChildren(...[['date', 'view.by_date'], ['grid', 'view.grid'], ['calendar', 'view.calendar']].map(([value, key]) =>
        h('button', {
          class: (state.scope.views.draftSession || 'date') === value ? 'on' : '',
          'aria-pressed': String((state.scope.views.draftSession || 'date') === value),
          onclick: () => { state.scope.views.draftSession = value; draw(); }
        }, t(key))
      ));

      const items = visible().sort((a, b) => String(a.scheduled_at || '').localeCompare(String(b.scheduled_at || '')));
      if (!items.includes(chosen)) chosen = items[0];

      const view = state.scope.views.draftSession || 'date';
      list.className = 'draft-review-list view-' + view;

      if (!items.length) {
        list.replaceChildren(ui.emptyState({
          title: t('draft.empty.filter', { filter: t('scope.accounts.label'), tab: t('draft.status.' + current) || t('draft.tab.all') })
        }));
      } else if (view === 'date') {
        const groups = new Map();
        for (const r of items) {
          const dateKey = r.scheduled_at ? r.scheduled_at.slice(0, 10) : 'unscheduled';
          if (!groups.has(dateKey)) groups.set(dateKey, []);
          groups.get(dateKey).push(r);
        }
        const dayNodes = [...groups].map(([dKey, dayRuns]) => {
          const p = dKey !== 'unscheduled' ? wibDayParts(dayRuns[0].scheduled_at) : { weekday: '', day: '?', month: t('draft.unscheduled') };
          return h('div', { class: 'draft-day-group' },
            h('div', { class: 'draft-day-dl' },
              p.weekday,
              h('b', {}, p.day),
              p.month
            ),
            h('div', { class: 'draft-posts-grid' }, ...dayRuns.map(renderPostCard))
          );
        });
        list.replaceChildren(h('div', { class: 'draft-review-day-wrap' }, ...dayNodes));
      } else if (view === 'calendar') {
        list.replaceChildren(renderRunCalendar({
          h, runs: items,
          onSelect: r => { chosen = r; activeSlide = 0; draw(); drawPreview(); },
          onMove: async (r, date) => {
            const original = r.scheduled_at;
            const time = original ? original.slice(10) : 'T12:00:00+07:00';
            try {
              await api('PATCH', '/v1/generator/runs/' + encodeURIComponent(r.id), { scheduled_at: date + time });
              r.scheduled_at = date + time;
              draw();
              drawPreview();
              toast(t('draft.cal.move.saved', { date: safeSlot(r.scheduled_at) }));
            } catch (error) {
              toast(errMsg(error), true);
              throw error;
            }
          },
          icon, t
        }));
      } else {
        list.replaceChildren(...items.map(renderPostCard));
      }
    }

    draw();
    drawPreview();

    const handleKeydown = e => {
      if (e.target?.matches?.('input, textarea, select, [contenteditable]')) return;
      if (document.querySelector('dialog[open]')) return;
      const items = visible().sort((a, b) => String(a.scheduled_at || '').localeCompare(String(b.scheduled_at || '')));
      const currentIndex = items.indexOf(chosen);
      if (e.key === 'ArrowLeft') {
        if (currentIndex > 0) {
          chosen = items[currentIndex - 1];
          activeSlide = 0;
          draw();
          drawPreview();
        }
      } else if (e.key === 'ArrowRight') {
        if (currentIndex >= 0 && currentIndex < items.length - 1) {
          chosen = items[currentIndex + 1];
          activeSlide = 0;
          draw();
          drawPreview();
        }
      } else if (e.key === 'a' || e.key === 'A') {
        if (chosen?.status === 'review') approveButton?.click();
      } else if (e.key === 'e' || e.key === 'E') {
        if (chosen) openEditDrawer(chosen, () => { draw(); drawPreview(); });
      } else if (e.key === 'x' || e.key === 'X') {
        if (chosen) {
          if (selectedRuns.has(chosen.id)) selectedRuns.delete(chosen.id);
          else selectedRuns.add(chosen.id);
          draw();
        }
      }
    };
    window.addEventListener('keydown', handleKeydown);

    return {
      element: h('div', {},
        h('div', { class: 'draft-review-toolbar' }, filter, chipsHost, views),
        h('div', { class: 'draft-review-layout' }, list, preview)
      ),
      cleanup: () => { window.removeEventListener('keydown', handleKeydown); }
    };
  }

  return { list, session, load };
}
