import { t } from './strings.en.js';
import { renderSessionCalendar } from './draft-calendar.js';
import { renderRunCalendar } from './draft-run-calendar.js';
import { readContentPrefs, hasCaptionEmoji } from './ui.js';

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

export function conceptVerdict(r) {
  const rev = r.steps?.revision?.output || {};
  const rawVerdict = String(rev.verdict || r.steps?.revision?.verdict || '').toLowerCase();
  const note = String(rev.reviewer || rev.note || r.steps?.revision?.note || r.steps?.reviewer?.output || '');
  if (rawVerdict === 'claim' || /\b(claim|overclaim|unverified|blocking)\b/i.test(note)) {
    return { key: 'claim', label: t('draft.concept.verdict.claim'), tone: 'bad' };
  }
  if (rawVerdict === 'note' || /\b(note|suggest\w*|consider|cta|shorter|tone)\b/i.test(note) || rev.suggested_caption ||
      (r.steps?.concept?.output?.caption && rev.caption && r.steps.concept.output.caption !== rev.caption)) {
    return { key: 'note', label: t('draft.concept.verdict.note'), tone: 'warn' };
  }
  return { key: 'ok', label: t('draft.concept.verdict.ok'), tone: 'ok' };
}

export function findScheduleClashes(runsToApprove = [], existingPosts = []) {
  const ownPostIds = new Set(runsToApprove.map(r => r.post_id).filter(Boolean));
  const activeExisting = existingPosts.filter(p => p && p.status !== 'cancelled' && !ownPostIds.has(p.id));
  const clashes = [];
  for (let i = 0; i < runsToApprove.length; i++) {
    const r = runsToApprove[i];
    const rTime = Date.parse(r.scheduled_at);
    if (!Number.isFinite(rTime)) continue;
    const rAccounts = new Set((r.targets || []).map(tg => tg.account_id).filter(Boolean));
    if (r.account_id) rAccounts.add(r.account_id);
    if (!rAccounts.size) continue;

    const clashesWithExisting = activeExisting.some(p => {
      const pTime = Date.parse(p.scheduled_at || p.created_at);
      if (!Number.isFinite(pTime) || Math.abs(pTime - rTime) >= 15 * 60 * 1000) return false;
      return (p.targets || []).some(tg => rAccounts.has(tg.account_id));
    });

    const clashesWithinBatch = runsToApprove.slice(0, i).some(earlier => {
      const eTime = Date.parse(earlier.scheduled_at);
      if (!Number.isFinite(eTime) || Math.abs(eTime - rTime) >= 15 * 60 * 1000) return false;
      const eAccounts = new Set((earlier.targets || []).map(tg => tg.account_id).filter(Boolean));
      if (earlier.account_id) eAccounts.add(earlier.account_id);
      for (const accId of rAccounts) {
        if (eAccounts.has(accId)) return true;
      }
      return false;
    });

    if (clashesWithExisting || clashesWithinBatch) {
      clashes.push(r);
    }
  }
  return clashes;
}

export function shiftClashingRuns(runsToApprove = [], existingPosts = []) {
  const ownPostIds = new Set(runsToApprove.map(r => r.post_id).filter(Boolean));
  const activeExisting = existingPosts.filter(p => p && p.status !== 'cancelled' && !ownPostIds.has(p.id));
  let shiftedCount = 0;

  for (let i = 0; i < runsToApprove.length; i++) {
    const r = runsToApprove[i];
    let rTime = Date.parse(r.scheduled_at);
    if (!Number.isFinite(rTime)) continue;
    const rAccounts = new Set((r.targets || []).map(tg => tg.account_id).filter(Boolean));
    if (r.account_id) rAccounts.add(r.account_id);
    if (!rAccounts.size) continue;

    let shifted = false;
    let guard = 0;
    while (guard++ < 96) {
      const clashesWithExisting = activeExisting.some(p => {
        const pTime = Date.parse(p.scheduled_at || p.created_at);
        if (!Number.isFinite(pTime) || Math.abs(pTime - rTime) >= 15 * 60 * 1000) return false;
        return (p.targets || []).some(tg => rAccounts.has(tg.account_id));
      });
      const clashesWithinBatch = runsToApprove.slice(0, i).some(earlier => {
        const eTime = Date.parse(earlier.scheduled_at);
        if (!Number.isFinite(eTime) || Math.abs(eTime - rTime) >= 15 * 60 * 1000) return false;
        const eAccounts = new Set((earlier.targets || []).map(tg => tg.account_id).filter(Boolean));
        if (earlier.account_id) eAccounts.add(earlier.account_id);
        for (const accId of rAccounts) {
          if (eAccounts.has(accId)) return true;
        }
        return false;
      });
      if (!clashesWithExisting && !clashesWithinBatch) break;
      rTime += 15 * 60 * 1000;
      shifted = true;
    }
    if (shifted) {
      r.scheduled_at = new Date(rTime).toISOString();
      shiftedCount++;
    }
  }
  return shiftedCount;
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
  pickMedia, toast, errMsg, go, reload, fmtDay, fmtTime, fmtSlot, fmtRange, ago, wibInput, wibIso }) {

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
    if (legacySession) { go(sessionPath(legacySession) + (query.get('id') ? '?item=' + encodeURIComponent(query.get('id')) + '&edit=1' : '')); return { view: shell('/generator/drafts', root), cleanup: () => { stopped = true; } }; }
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

    let activeReviewApprove = null;

    const approveReadyBtn = readyRuns.length ? h('button', {
      type: 'button',
      class: 'btn primary',
      onclick: () => {
        const currentReady = s.runs.filter(r => r.status === 'review');
        if (activeReviewApprove) activeReviewApprove(currentReady);
        else openBulkApproveDialog(s, currentReady, { onComplete: reload });
      }
    }, t('draft.approve.many', { n: readyRuns.length })) : null;

    const headerActions = h('div', { class: 'draft-session-actions' },
      h('button', { class: 'btn', onclick: () => openDirection(s) }, t('draft.direction')),
      retryFailedBtn,
      approveReadyBtn,
      moreMenu
    );

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
      headerActions
    );
    root.append(header);

    const stageHost = h('div', { class: 'draft-session-stage-host' });
    root.append(stageHost);

    const urlQuery = new URLSearchParams(location.hash.split('?')[1] || '');
    const initialStage = urlQuery.get('stage') || (s.state === 'concept' ? 'concept' : 'images');

    function mountStage(stageName) {
      cleanupFns.splice(0).forEach(fn => fn());
      activeReviewApprove = null;
      if (s.state === 'expired') {
        stageHost.replaceChildren(ui.emptyState({
          title: t('draft.empty.expired.title'),
          body: t('draft.empty.expired.body'),
          action: h('a', { class: 'btn primary', href: '#/generator?brief=' + encodeURIComponent(s.plans[0]?.brief || s.fullTitle) }, t('draft.expired.open.generator'))
        }));
      } else if (s.state === 'plan') {
        stageHost.replaceChildren(planPage(s));
      } else if (stageName === 'concept' && s.runs.some(r => r.status === 'concept_review')) {
        const conceptResult = conceptPage(s, {
          headerActions,
          moreMenu,
          onSwitchStage: nextStage => {
            if (nextStage === 'approved') {
              const reviewRes = reviewPage(s, urlQuery.get('item'), { initialFilter: 'approved', addCleanup });
              activeReviewApprove = reviewRes.openBulkApprove;
              stageHost.replaceChildren(reviewRes.element);
              if (reviewRes.cleanup) addCleanup(reviewRes.cleanup);
            } else if (nextStage === 'images') {
              mountStage('images');
            }
          }
        });
        stageHost.replaceChildren(conceptResult.element);
        if (conceptResult.cleanup) addCleanup(conceptResult.cleanup);
      } else {
        headerActions.replaceChildren(...[
          h('button', { class: 'btn', onclick: () => openDirection(s) }, t('draft.direction')),
          retryFailedBtn,
          approveReadyBtn,
          moreMenu
        ].filter(Boolean));
        const reviewResult = reviewPage(s, urlQuery.get('item'), {
          initialFilter: stageName === 'approved' ? 'approved' : urlQuery.get('filter'),
          autoOpenEdit: urlQuery.get('edit') === '1',
          addCleanup
        });
        activeReviewApprove = reviewResult.openBulkApprove;
        stageHost.replaceChildren(reviewResult.element);
        if (reviewResult.cleanup) addCleanup(reviewResult.cleanup);
      }
    }

    mountStage(initialStage);

    return {
      view: shell('/generator/drafts', root),
      cleanup: async () => {
        for (const fn of cleanupFns.splice(0)) await fn();
      }
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

  function conceptPage(s, { headerActions, moreMenu, onSwitchStage } = {}) {
    const concepts = s.runs
      .filter(r => r.status === 'concept_review' && r.steps?.revision?.output)
      .sort((a, b) => String(a.scheduled_at || '').localeCompare(String(b.scheduled_at || '')));
    const selected = new Set(concepts.map(r => r.id));
    const approvedIds = new Set();
    const edits = new Map(concepts.map(r => {
      const rev = structuredClone(r.steps.revision.output);
      if (!rev.title && r.title) rev.title = r.title;
      return [r.id, rev];
    }));
    let chosen = concepts[0];
    let batchCostConfirmed = false;
    const list = h('div', { class: 'draft-concept-list', role: 'listbox', 'aria-label': t('draft.state.concept') });
    const editor = h('section', { class: 'draft-concept-editor' });
    const count = h('span', { role: 'status' });
    const provider = concepts[0]?.agents?.image;
    const imageCost = provider ? [provider.provider, provider.model].filter(Boolean).join(' · ') : t('draft.cost.provider');

    async function ensureBatchCostConfirmed(postCount, slideCount) {
      if (batchCostConfirmed) return true;
      const ok = await confirmDialog({
        title: t('draft.dialog.images', { n: slideCount }),
        body: t('draft.dialog.images.body'),
        tone: 'cost',
        confirmLabel: t('draft.concept.bulk', { n: postCount, m: slideCount }),
        details: [
          [t('draft.cost.posts'), postCount],
          [t('draft.cost.images'), slideCount],
          [t('draft.cost.key'), imageCost]
        ]
      });
      if (ok) batchCostConfirmed = true;
      return ok;
    }

    async function approveBatch(ids) {
      const pendingIds = ids.filter(id => !approvedIds.has(id));
      if (!pendingIds.length) return;
      const slides = concepts.filter(r => pendingIds.includes(r.id)).reduce((n, r) => n + (edits.get(r.id)?.slides?.length || 1), 0);
      if (!await ensureBatchCostConfirmed(pendingIds.length, slides)) return;
      let failed = 0;
      for (const id of pendingIds) {
        const plan = edits.get(id);
        const cleanConcept = {
          title: String(plan.title || '').slice(0, 300),
          caption: String(plan.caption || ''),
          slides: (plan.slides || []).map(sl => ({ prompt: String(sl.prompt || '') }))
        };
        try {
          await api('POST', '/v1/generator/runs/' + encodeURIComponent(id) + '/approve-concept', {
            concept: cleanConcept,
            confirm_cost: true
          });
          approvedIds.add(id);
          selected.delete(id);
          const runItem = s.runs.find(r => r.id === id);
          if (runItem) runItem.status = 'queued';
        } catch {
          failed++;
        }
      }
      if (failed) toast(t('draft.concept.failed', { n: failed }), true);
      const remaining = concepts.filter(r => !approvedIds.has(r.id));
      if (!remaining.length) {
        reload();
      } else {
        chosen = remaining[0];
        drawList();
        drawEditor();
      }
    }

    async function approveSingleAndAdvance(runItem) {
      if (!runItem || approvedIds.has(runItem.id)) return;
      const remainingBefore = concepts.filter(r => !approvedIds.has(r.id));
      const totalSlides = remainingBefore.reduce((n, r) => n + (edits.get(r.id)?.slides?.length || 1), 0);
      if (!await ensureBatchCostConfirmed(remainingBefore.length, totalSlides)) return;
      const plan = edits.get(runItem.id);
      const cleanConcept = {
        title: String(plan.title || '').slice(0, 300),
        caption: String(plan.caption || ''),
        slides: (plan.slides || []).map(sl => ({ prompt: String(sl.prompt || '') }))
      };
      try {
        await api('POST', '/v1/generator/runs/' + encodeURIComponent(runItem.id) + '/approve-concept', {
          concept: cleanConcept,
          confirm_cost: true
        });
        approvedIds.add(runItem.id);
        selected.delete(runItem.id);
        runItem.status = 'queued';
        const curIdx = concepts.indexOf(runItem);
        const nextUnapproved = concepts.slice(curIdx + 1).find(r => !approvedIds.has(r.id)) ||
          concepts.find(r => !approvedIds.has(r.id));
        if (nextUnapproved) {
          chosen = nextUnapproved;
          drawList();
          drawEditor();
        } else {
          reload();
        }
      } catch (err) {
        toast(errMsg(err), true);
      }
    }

    function skipCurrentAndAdvance() {
      if (!chosen) return;
      selected.delete(chosen.id);
      const curIdx = concepts.indexOf(chosen);
      const nextItem = concepts[(curIdx + 1) % concepts.length];
      if (nextItem && nextItem !== chosen) chosen = nextItem;
      drawList();
      drawEditor();
    }

    const regenAllBtn = h('button', {
      type: 'button',
      class: 'btn',
      onclick: async () => {
        const activeConcepts = concepts.filter(r => !approvedIds.has(r.id));
        if (!activeConcepts.length) return;
        if (!await confirmDialog({
          title: t('draft.concept.regen.title', { n: activeConcepts.length }),
          body: t('draft.concept.regen.body', { n: activeConcepts.length }),
          tone: 'cost',
          confirmLabel: t('draft.concept.regen'),
          details: [
            [t('draft.cost.posts'), activeConcepts.length],
            [t('draft.cost.runs'), t('draft.cost.concept')],
            [t('draft.cost.key'), t('draft.cost.provider')]
          ]
        })) return;
        let failed = 0;
        for (const r of activeConcepts) {
          try {
            await api('POST', '/v1/generator/runs/' + encodeURIComponent(r.id) + '/revise', {
              request_id: crypto.randomUUID(),
              brief: r.brief || s.fullTitle || r.title,
              confirm_cost: true
            });
          } catch {
            failed++;
          }
        }
        if (failed) toast(t('draft.concept.failed', { n: failed }), true);
        reload();
      }
    }, t('draft.concept.regen'));

    const headerBulkBtn = h('button', {
      type: 'button',
      class: 'btn primary',
      onclick: () => approveBatch([...selected])
    });
    const footerBulkBtn = h('button', {
      type: 'button',
      class: 'btn primary',
      onclick: () => approveBatch([...selected])
    });

    if (headerActions) {
      headerActions.replaceChildren(
        h('button', { class: 'btn', onclick: () => openDirection(s) }, t('draft.direction')),
        regenAllBtn,
        headerBulkBtn,
        moreMenu
      );
    }

    const stageSeg = h('div', { class: 'seg', role: 'group', 'aria-label': t('draft.tabs.label') });

    function updateStageSeg() {
      const cCount = concepts.filter(r => !approvedIds.has(r.id)).length;
      const iCount = s.runs.filter(r => ['review', 'failed', 'queued', 'running'].includes(r.status)).length;
      const aCount = s.runs.filter(r => ['approved', 'drafted'].includes(r.status)).length;
      stageSeg.replaceChildren(
        h('button', { type: 'button', class: 'on', 'aria-pressed': 'true' }, t('draft.concept.tab.concepts', { n: cCount })),
        h('button', {
          type: 'button',
          'aria-pressed': 'false',
          disabled: !iCount,
          onclick: () => onSwitchStage?.('images')
        }, t('draft.concept.tab.images', { n: iCount })),
        h('button', {
          type: 'button',
          'aria-pressed': 'false',
          disabled: !aCount,
          onclick: () => onSwitchStage?.('approved')
        }, t('draft.concept.tab.approved', { n: aCount }))
      );
    }

    function drawList() {
      const activeSelected = [...selected].filter(id => !approvedIds.has(id));
      const slidesCount = concepts
        .filter(r => activeSelected.includes(r.id))
        .reduce((n, r) => n + (edits.get(r.id)?.slides?.length || 1), 0);
      count.textContent = t('draft.selected.of', { n: activeSelected.length, m: concepts.length });
      const bulkLabel = t('draft.concept.bulk', { n: activeSelected.length, m: slidesCount });
      headerBulkBtn.textContent = bulkLabel;
      footerBulkBtn.textContent = bulkLabel;
      headerBulkBtn.disabled = footerBulkBtn.disabled = !activeSelected.length;
      updateStageSeg();

      list.replaceChildren(...concepts.map((r, i) => {
        const plan = edits.get(r.id);
        const verdict = conceptVerdict(r);
        const isApproved = approvedIds.has(r.id);
        const displayTitle = `${i + 1} · ${plan?.title || r.title || sessionTitle(r)}`;
        return h('div', {
          class: 'draft-concept-row' + (r.id === chosen?.id ? ' on' : '') + (isApproved ? ' is-approved' : ''),
          'data-run-id': r.id
        },
          h('input', {
            type: 'checkbox',
            checked: selected.has(r.id) && !isApproved,
            disabled: isApproved,
            'aria-label': t('draft.select.item', { title: plan?.title || r.title || sessionTitle(r) }),
            onchange: e => {
              if (e.target.checked) selected.add(r.id);
              else selected.delete(r.id);
              drawList();
            }
          }),
          h('button', {
            type: 'button',
            class: 'draft-concept-select',
            onclick: () => {
              chosen = r;
              drawList();
              drawEditor();
            }
          },
            h('div', { class: 'draft-concept-row-text' },
              h('b', { class: 'draft-concept-row-title' }, displayTitle),
              h('small', {}, safeSlot(r.scheduled_at))
            ),
            isApproved ? ui.chip(t('status.queued'), 'info') : ui.chip(verdict.label, verdict.tone)
          )
        );
      }));
    }

    function slideCardLabel(index, total) {
      if (total > 1 && index === 0) return t('draft.concept.slide.cover', { n: 1 });
      if (total > 1 && index === total - 1) return t('draft.concept.slide.cta', { n: index + 1 });
      return t('draft.concept.slide.item', { n: index + 1 });
    }

    function drawEditor() {
      if (!chosen) {
        editor.replaceChildren(ui.emptyState({ title: t('draft.empty.none.title') }));
        return;
      }
      const idx = concepts.indexOf(chosen);
      const plan = edits.get(chosen.id);
      const verdict = conceptVerdict(chosen);
      const revOut = chosen.steps?.revision?.output || {};
      const conceptOut = chosen.steps?.concept?.output || {};
      const reviewerNote = revOut.reviewer || revOut.note || chosen.steps?.revision?.note ||
        (conceptOut.caption && revOut.caption && conceptOut.caption !== revOut.caption
          ? t('draft.concept.reviewer.revised')
          : t('draft.concept.reviewer.ok'));
      const suggestedCaption = revOut.suggested_caption || revOut.suggestion ||
        (conceptOut.caption && revOut.caption && conceptOut.caption !== revOut.caption ? revOut.caption : null);

      const titleInput = h('input', {
        type: 'text',
        class: 'draft-concept-title-input',
        value: plan.title || chosen.title || '',
        maxlength: 300,
        'aria-label': t('draft.concept.title'),
        oninput: e => {
          plan.title = e.target.value;
          chosen.title = e.target.value;
          const rowTitle = list.querySelector(`[data-run-id="${chosen.id}"] .draft-concept-row-title`);
          if (rowTitle) rowTitle.textContent = `${idx + 1} · ${plan.title || sessionTitle(chosen)}`;
        }
      });

      const counter = h('small', { class: 'muted' }, t('draft.caption.count', { n: (plan.caption || '').length }));
      const captionInput = h('textarea', {
        class: 'draft-concept-caption-input',
        maxlength: 2200,
        rows: 4,
        'aria-label': t('draft.concept.caption'),
        oninput: e => {
          plan.caption = e.target.value;
          counter.textContent = t('draft.caption.count', { n: e.target.value.length });
        }
      }, plan.caption || '');

      const applySuggestionBtn = suggestedCaption ? h('button', {
        type: 'button',
        class: 'btn ghost sm draft-concept-apply-btn',
        onclick: () => {
          plan.caption = suggestedCaption;
          captionInput.value = suggestedCaption;
          counter.textContent = t('draft.caption.count', { n: suggestedCaption.length });
          toast(t('story.proposals.updated'));
        }
      }, t('draft.concept.apply')) : null;

      const reviewerCallout = h('div', { class: `draft-concept-reviewer tone-${verdict.tone}` },
        icon(verdict.key === 'ok' ? 'check' : verdict.key === 'claim' ? 'exclamation' : 'info'),
        h('p', {}, h('b', {}, t('draft.concept.reviewer.label') + ' '), String(reviewerNote)),
        applySuggestionBtn
      );

      const slideCards = h('div', { class: 'draft-concept-slides-grid' },
        ...(plan.slides || []).map((slide, i) => h('div', { class: 'draft-concept-slide-card' },
          h('span', { class: 'draft-concept-slide-label' }, slideCardLabel(i, plan.slides.length)),
          h('textarea', {
            maxlength: 6000,
            rows: 4,
            'aria-label': t('draft.visual.direction', { n: i + 1 }),
            oninput: e => { slide.prompt = e.target.value; }
          }, slide.prompt || '')
        ))
      );

      const reviseInput = h('input', {
        type: 'text',
        class: 'draft-concept-instruction',
        'aria-label': t('draft.concept.revise.placeholder'),
        placeholder: t('draft.concept.revise.placeholder'),
        onkeydown: async e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            await submitConceptRevision();
          }
        }
      });

      async function submitConceptRevision() {
        const text = reviseInput.value.trim();
        if (!text) return;
        if (!await confirmDialog({
          title: t('draft.dialog.revise'),
          body: t('draft.dialog.revise.body'),
          tone: 'cost',
          confirmLabel: t('draft.revise.submit'),
          details: [[t('draft.cost.posts'), 1], [t('draft.cost.runs'), t('draft.cost.concept')], [t('draft.cost.key'), t('draft.cost.provider')]]
        })) return;
        try {
          await api('POST', '/v1/generator/runs/' + encodeURIComponent(chosen.id) + '/revise', {
            request_id: crypto.randomUUID(),
            brief: `${chosen.brief || ''}\n\nRevision: ${text}`.trim(),
            confirm_cost: true
          });
          toast(t('story.proposals.updated'));
          reload();
        } catch (err) {
          toast(errMsg(err), true);
        }
      }

      const revisionBar = h('div', { class: 'draft-revision-bar' },
        icon('sparkles'),
        reviseInput,
        h('button', {
          type: 'button',
          class: 'btn sm ghost',
          'aria-label': t('draft.revise.submit'),
          onclick: submitConceptRevision
        }, icon('arrow-right'))
      );

      const prevBtn = h('button', {
        type: 'button',
        class: 'btn sm',
        disabled: idx <= 0,
        'aria-label': t('draft.drawer.prev_post'),
        onclick: () => {
          if (idx > 0) {
            chosen = concepts[idx - 1];
            drawList();
            drawEditor();
          }
        }
      }, icon('chevron-left'));

      const nextBtn = h('button', {
        type: 'button',
        class: 'btn sm',
        disabled: idx >= concepts.length - 1,
        'aria-label': t('draft.drawer.next_post'),
        onclick: () => {
          if (idx < concepts.length - 1) {
            chosen = concepts[idx + 1];
            drawList();
            drawEditor();
          }
        }
      }, icon('chevron-right'));

      const nextConceptNumber = idx + 1 < concepts.length ? idx + 2 : 1;
      const unapprovedRemaining = concepts.filter(r => !approvedIds.has(r.id) && r.id !== chosen.id).length;
      const approveNextLabel = unapprovedRemaining > 0
        ? t('draft.concept.approve.next', { n: nextConceptNumber })
        : t('draft.images.approve');

      const approveNextBtn = h('button', {
        type: 'button',
        class: 'btn primary draft-concept-approve-next',
        disabled: approvedIds.has(chosen.id),
        onclick: () => approveSingleAndAdvance(chosen)
      }, approveNextLabel);

      const skipBtn = h('button', {
        type: 'button',
        class: 'btn draft-concept-skip-btn',
        onclick: skipCurrentAndAdvance
      }, t('draft.concept.skip'));

      editor.replaceChildren(
        h('div', { class: 'draft-concept-editor-head' },
          h('div', { class: 'draft-concept-editor-title-wrap' },
            h('span', { class: 'draft-concept-step-label' }, t('draft.concept.of', { i: idx + 1, n: concepts.length })),
            titleInput
          ),
          h('div', { class: 'row' }, prevBtn, nextBtn)
        ),
        reviewerCallout,
        h('div', { class: 'draft-concept-field' },
          h('div', { class: 'between' }, h('label', {}, t('draft.concept.caption')), counter),
          captionInput
        ),
        h('div', { class: 'draft-concept-field' },
          h('span', { class: 'draft-field-label' }, t('draft.concept.slides.label')),
          slideCards
        ),
        revisionBar,
        h('div', { class: 'draft-concept-editor-actions' }, skipBtn, approveNextBtn)
      );
    }

    const handleConceptKeydown = e => {
      if (e.target?.matches?.('input, textarea, select, [contenteditable]')) return;
      if (document.querySelector('dialog[open], .draft-editor-drawer')) return;
      const idx = concepts.indexOf(chosen);
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (idx > 0) {
          chosen = concepts[idx - 1];
          drawList();
          drawEditor();
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (idx >= 0 && idx < concepts.length - 1) {
          chosen = concepts[idx + 1];
          drawList();
          drawEditor();
        }
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        approveSingleAndAdvance(chosen);
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        skipCurrentAndAdvance();
      }
    };
    window.addEventListener('keydown', handleConceptKeydown);

    drawList();
    drawEditor();

    const element = h('div', { class: 'draft-concept-page' },
      h('div', { class: 'draft-concept-top' },
        stageSeg,
        h('p', { class: 'draft-concept-stage-note' }, t('draft.concept.stage'))
      ),
      h('div', { class: 'draft-concept-layout' }, list, editor),
      h('div', { class: 'draft-session-bulk' }, count, h('span', { class: 'spacer' }), footerBulkBtn)
    );

    return {
      element,
      cleanup: () => { window.removeEventListener('keydown', handleConceptKeydown); }
    };
  }

  let activeDrawerClose = null;

  function openEditDrawer(r, onSaved, { runs = [r], addCleanup } = {}) {
    if (activeDrawerClose) activeDrawerClose();

    const trigger = document.activeElement;
    let currentRun = r;
    let currentSlide = 0;
    let media = [...(currentRun.media || [])];
    let mediaChanged = false;
    let currentSaver = null;
    let closed = false;
    let dragSlideIndex = null;

    const headingId = 'drawer-title-' + crypto.randomUUID();
    const drawer = h('aside', {
      class: 'draft-editor-drawer',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': headingId,
      tabindex: '-1'
    });
    const backdrop = h('div', {
      class: 'draft-editor-backdrop',
      onclick: e => { if (e.target === backdrop) closeDrawer(); }
    }, drawer);

    async function closeDrawer() {
      if (closed) return;
      closed = true;
      activeDrawerClose = null;
      window.removeEventListener('keydown', onDrawerKeydown);
      const flushPromise = currentSaver ? currentSaver.flush() : Promise.resolve();
      backdrop.remove();
      if (trigger?.isConnected) trigger.focus();
      await flushPromise;
    }

    activeDrawerClose = closeDrawer;
    if (addCleanup) addCleanup(() => currentSaver ? currentSaver.flush() : Promise.resolve());

    function onDrawerKeydown(e) {
      if (document.querySelector('dialog[open]')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeDrawer();
        return;
      }
      if (e.key === 'Tab') {
        const focusable = [...drawer.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')]
          .filter(el => el.getClientRects().length > 0);
        if (!focusable.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener('keydown', onDrawerKeydown);

    async function switchPost(nextRun) {
      if (!nextRun || nextRun === currentRun) return;
      if (currentSaver) await currentSaver.flush();
      currentRun = nextRun;
      currentSlide = 0;
      media = [...(currentRun.media || [])];
      mediaChanged = false;
      renderDrawerContent();
    }

    function countHashtags(text) {
      return (String(text || '').match(/#[\p{L}\p{N}_]+/gu) || []).length;
    }

    function renderDrawerContent() {
      const runIndex = Math.max(0, runs.indexOf(currentRun));
      const a = account(currentRun.targets?.[0]?.account_id || currentRun.account_id);
      const savedTime = safeTime(currentRun.updated_at || new Date().toISOString());
      const statusEl = h('span', { class: 'draft-autosave-status', role: 'status' },
        t('autosave.saved', { 'HH:MM': savedTime })
      );

      const initCap = currentRun.caption || '';
      const initTags = countHashtags(initCap);
      const counter = h('small', { class: 'muted draft-caption-counter' },
        t('draft.drawer.caption_meta', { n: initCap.length, h: initTags, s: initTags === 1 ? '' : 's' })
      );

      const noEmoji = currentRun.targets?.some(target => !readContentPrefs(target.account_id).emoji);
      const emojiWarn = ui.chip(t('content.emoji.warning'), 'warn');
      emojiWarn.hidden = !noEmoji || !hasCaptionEmoji(initCap);

      const captionInput = h('textarea', {
        class: 'draft-drawer-caption',
        maxlength: 2200,
        rows: 5,
        'aria-label': t('legacy.caption'),
        oninput: () => {
          const val = captionInput.value;
          const tags = countHashtags(val);
          counter.textContent = t('draft.drawer.caption_meta', { n: val.length, h: tags, s: tags === 1 ? '' : 's' });
          emojiWarn.hidden = !noEmoji || !hasCaptionEmoji(val);
          saver.mark();
        }
      }, initCap);

      const scheduleInput = h('input', {
        type: 'datetime-local',
        class: 'draft-drawer-schedule',
        value: safeWibInput(currentRun.scheduled_at),
        'aria-label': t('draft.drawer.schedule_wib'),
        oninput: () => saver.mark(),
        onchange: () => saver.mark()
      });

      const briefInput = h('textarea', {
        class: 'draft-drawer-brief',
        maxlength: 10000,
        rows: 3,
        'aria-label': t('draft.prompt.details'),
        oninput: () => saver.mark()
      }, currentRun.brief || currentRun.prompt || '');

      const saver = ui.autosave(async () => {
        const nextIso = wibIso(scheduleInput.value) || currentRun.scheduled_at;
        const payload = {
          content: captionInput.value,
          scheduled_at: nextIso,
          brief: briefInput.value.trim() || currentRun.brief || currentRun.title || 'Draft'
        };
        if (mediaChanged && media.length) {
          payload.media_ids = media.map(m => m.id).filter(Boolean);
        }
        await api('PATCH', '/v1/generator/runs/' + encodeURIComponent(currentRun.id), payload);
        currentRun.caption = captionInput.value;
        currentRun.scheduled_at = nextIso;
        currentRun.brief = payload.brief;
        if (mediaChanged) {
          currentRun.media = [...media];
          mediaChanged = false;
        }
        onSaved?.();
      }, { delay: 1000, statusEl });
      currentSaver = saver;

      const slideStage = h('div', { class: 'draft-drawer-preview' });
      const slideStrip = h('div', { class: 'draft-slide-strip-row' });
      const slideLabelEl = h('span', { class: 'draft-field-label' });
      const versionsCard = h('div', { class: 'draft-drawer-card draft-versions-card' });

      async function promptReviseSlide(slideIdx) {
        const text = await inputDialog({
          title: t('draft.slide.revise.title', { n: slideIdx + 1 }),
          label: t('draft.slide.revise'),
          placeholder: t('draft.dialog.slide.placeholder'),
          hint: t('draft.slide.revise.hint', { n: slideIdx + 1 }),
          confirmLabel: t('draft.slide.revise'),
          multiline: true,
          suggestions: [
            t('draft.suggestion.white'),
            t('draft.suggestion.brighter'),
            t('draft.suggestion.no_text'),
            t('draft.suggestion.closeup')
          ]
        });
        if (!text) return;
        if (!await confirmDialog({
          title: t('draft.slide.revise.title', { n: slideIdx + 1 }),
          body: t('draft.dialog.retry.body'),
          tone: 'cost',
          confirmLabel: t('draft.slide.revise'),
          details: [[t('draft.cost.images'), 1], [t('draft.cost.key'), t('draft.cost.provider')]]
        })) return;
        try {
          await api('POST', '/v1/generator/runs/' + encodeURIComponent(currentRun.id) + '/slides/revise', {
            request_id: crypto.randomUUID(),
            slide_index: slideIdx,
            instruction: text,
            confirm_cost: true
          });
          toast(t('story.proposals.updated'));
          await closeDrawer();
          reload();
        } catch (err) {
          toast(errMsg(err), true);
        }
      }

      function drawMedia() {
        const total = Math.max(1, media.length);
        if (currentSlide >= total) currentSlide = total - 1;
        const m = media[currentSlide];
        slideLabelEl.textContent = t('draft.drawer.slide_of', { i: currentSlide + 1, n: total });

        slideStage.replaceChildren(
          m?.url ? (m.type === 'video' ?
            h('video', { src: m.url, controls: true, preload: 'metadata' }) :
            h('img', { src: m.url, alt: t('draft.preview.slide', { n: currentSlide + 1 }) })) :
            h('div', { class: 'ui-phone-no-media' }, icon('photograph'), t('legacy.no_image_yet')),
          h('span', { class: 'badge-n' }, `${currentSlide + 1}/${total}`)
        );

        const addMediaBtn = media.length < 10 && pickMedia ? h('button', {
          type: 'button',
          class: 'draft-slide-thumb draft-slide-add',
          'aria-label': t('draft.drawer.add_slide'),
          title: t('draft.drawer.add_slide'),
          onclick: () => pickMedia(picked => {
            if (!picked?.length) return;
            media.push(...picked.slice(0, 10 - media.length));
            mediaChanged = true;
            currentSlide = media.length - 1;
            drawMedia();
            saver.mark();
          })
        }, '+') : null;

        slideStrip.replaceChildren(
          ...media.map((item, idx) => h('button', {
            type: 'button',
            draggable: media.length > 1 ? 'true' : null,
            class: 'draft-slide-thumb' + (idx === currentSlide ? ' on' : ''),
            'aria-label': t('draft.preview.slide', { n: idx + 1 }),
            onclick: () => { currentSlide = idx; drawMedia(); },
            ondragstart: e => {
              dragSlideIndex = idx;
              e.dataTransfer?.setData('text/plain', String(idx));
            },
            ondragover: e => {
              if (dragSlideIndex != null && dragSlideIndex !== idx) e.preventDefault();
            },
            ondrop: e => {
              e.preventDefault();
              if (dragSlideIndex == null || dragSlideIndex === idx) return;
              const [moved] = media.splice(dragSlideIndex, 1);
              media.splice(idx, 0, moved);
              dragSlideIndex = null;
              currentSlide = idx;
              mediaChanged = true;
              drawMedia();
              saver.mark();
            }
          }, item.url ? h('img', { src: item.url, alt: '' }) : String(idx + 1))),
          addMediaBtn
        );

        const slideVersions = (currentRun.media_versions || []).filter(v => (v.slide_index ?? 0) === currentSlide);
        versionsCard.replaceChildren(
          h('span', { class: 'draft-field-label' }, t('draft.slide.versions', { n: currentSlide + 1 })),
          slideVersions.length ? h('div', { class: 'draft-versions-list' },
            ...slideVersions.map(v => h('button', {
              type: 'button',
              class: 'draft-version-item',
              title: v.instruction || '',
              onclick: () => {
                if (v.media) {
                  media[currentSlide] = v.media;
                  mediaChanged = true;
                  drawMedia();
                  saver.mark();
                }
              }
            },
              v.media?.url ? h('img', { src: v.media.url, alt: '' }) : icon('photograph'),
              h('small', {}, `${v.instruction ? `"${v.instruction}" · ` : ''}${safeTime(v.replaced_at)}`)
            ))
          ) : h('small', { class: 'muted' }, t('draft.drawer.no_versions'))
        );
      }
      drawMedia();

      const reviseSlideBtn = h('button', {
        type: 'button',
        class: 'btn sm',
        onclick: () => promptReviseSlide(currentSlide)
      }, icon('refresh'), t('draft.slide.revise'));

      const replacePhotoBtn = h('button', {
        type: 'button',
        class: 'btn sm',
        onclick: () => {
          if (!pickMedia) return;
          pickMedia(picked => {
            if (!picked?.length) return;
            if (media.length) media[currentSlide] = picked[0];
            else media.push(picked[0]);
            mediaChanged = true;
            drawMedia();
            saver.mark();
          });
        }
      }, icon('upload'), t('draft.slide.replace'));

      const reorderSlideBtn = h('button', {
        type: 'button',
        class: 'btn sm',
        disabled: media.length <= 1,
        onclick: () => {
          if (media.length <= 1) return;
          const nextIdx = (currentSlide + 1) % media.length;
          const [item] = media.splice(currentSlide, 1);
          media.splice(nextIdx, 0, item);
          currentSlide = nextIdx;
          mediaChanged = true;
          drawMedia();
          saver.mark();
        }
      }, icon('move'), t('draft.slide.reorder'));

      const improveCaptionBtn = h('button', {
        type: 'button',
        class: 'btn ghost sm',
        onclick: async () => {
          const instruction = await inputDialog({
            title: t('draft.caption.improve.title'),
            label: t('draft.caption.improve'),
            placeholder: t('draft.caption.improve.placeholder'),
            confirmLabel: t('draft.caption.improve'),
            multiline: true
          });
          if (!instruction) return;
          if (!await confirmDialog({
            title: t('draft.dialog.revise'),
            body: t('draft.dialog.revise.body'),
            tone: 'cost',
            confirmLabel: t('draft.caption.improve'),
            details: [[t('draft.cost.posts'), 1], [t('draft.cost.key'), t('draft.cost.provider')]]
          })) return;
          await saver.flush();
          try {
            await api('POST', '/v1/generator/runs/' + encodeURIComponent(currentRun.id) + '/revise', {
              request_id: crypto.randomUUID(),
              brief: `${currentRun.brief || ''}\n\nCaption revision: ${instruction}`.trim(),
              confirm_cost: true
            });
            toast(t('story.proposals.updated'));
            await closeDrawer();
            reload();
          } catch (err) {
            toast(errMsg(err), true);
          }
        }
      }, icon('sparkles'), t('draft.caption.improve'));

      // [BACKEND] needed: allow updating cross-platform targets in PATCH /v1/generator/runs/:id
      const hasIg = state.accounts.some(acc => acc.platform === 'instagram');
      const hasThreads = state.accounts.some(acc => acc.platform === 'threads');
      const targetPlatforms = new Set((currentRun.targets || []).map(tg => account(tg.account_id)?.platform).filter(Boolean));
      if (!targetPlatforms.size && a?.platform) targetPlatforms.add(a.platform);

      const alsoPublishBox = h('div', { class: 'draft-drawer-field' },
        h('span', { class: 'draft-field-label' }, t('draft.alsopublish')),
        h('div', { class: 'draft-also-publish-row' },
          h('label', { class: 'check' },
            h('input', {
              type: 'checkbox',
              checked: targetPlatforms.has('instagram') || !hasThreads,
              disabled: !hasIg
            }),
            t('platform.instagram')
          ),
          h('label', { class: 'check' },
            h('input', {
              type: 'checkbox',
              checked: targetPlatforms.has('threads'),
              disabled: !hasThreads
            }),
            t('platform.threads')
          )
        )
      );

      const finalOutput = currentRun.steps?.final?.output;
      const slideMatch = typeof finalOutput === 'string' ? /slide\s*(\d+)/i.exec(finalOutput) : null;
      const namedSlideNum = slideMatch ? Number(slideMatch[1]) : null;
      const finalReviewerCallout = finalOutput ? h('div', { class: 'draft-final-callout' },
        icon('exclamation'),
        h('p', {}, h('b', {}, t('draft.drawer.final_reviewer') + ' '), String(finalOutput)),
        namedSlideNum && namedSlideNum >= 1 && namedSlideNum <= Math.max(1, media.length) ? h('button', {
          type: 'button',
          class: 'btn sm',
          onclick: () => {
            currentSlide = namedSlideNum - 1;
            drawMedia();
            promptReviseSlide(namedSlideNum - 1);
          }
        }, t('draft.drawer.revise_slide_n', { n: namedSlideNum })) : null
      ) : null;

      const detailsAccordion = h('details', { class: 'draft-drawer-details' },
        h('summary', { class: 'draft-field-label' }, t('draft.prompt.details')),
        briefInput
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
            await api('DELETE', '/v1/generator/runs/' + encodeURIComponent(currentRun.id) + '/content');
            await closeDrawer();
            reload();
          } catch (err) {
            toast(errMsg(err), true);
          }
        }
      }, icon('trash'), t('draft.delete.cta'));

      const sendDraftBtn = h('button', {
        type: 'button',
        class: 'btn',
        onclick: async () => {
          await saver.flush();
          try {
            const res = await api('POST', '/v1/generator/runs/' + encodeURIComponent(currentRun.id) + '/draft', { content: captionInput.value });
            await closeDrawer();
            go('/compose?ai_draft=' + encodeURIComponent(res.draft_id));
          } catch (err) {
            toast(errMsg(err), true);
          }
        }
      }, t('draft.send.compose'));

      const approveBtn = currentRun.status === 'review' ? h('button', {
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
            await api('POST', '/v1/generator/runs/' + encodeURIComponent(currentRun.id) + '/approve', {
              content: captionInput.value,
              scheduled_at: wibIso(scheduleInput.value) || currentRun.scheduled_at
            });
            currentRun.status = 'approved';
            await closeDrawer();
            reload();
          } catch (err) {
            toast(errMsg(err), true);
          }
        }
      }, t('draft.approve.one')) : null;

      const prevPostBtn = h('button', {
        type: 'button',
        class: 'btn sm',
        disabled: runIndex <= 0,
        'aria-label': t('draft.drawer.prev_post'),
        onclick: () => switchPost(runs[runIndex - 1])
      }, icon('chevron-left'));

      const nextPostBtn = h('button', {
        type: 'button',
        class: 'btn sm',
        disabled: runIndex >= runs.length - 1,
        'aria-label': t('draft.drawer.next_post'),
        onclick: () => switchPost(runs[runIndex + 1])
      }, icon('chevron-right'));

      const closeBtn = h('button', {
        type: 'button',
        class: 'btn sm',
        'aria-label': t('dialog.close'),
        onclick: closeDrawer
      }, icon('x'));

      drawer.replaceChildren(
        h('header', { class: 'draft-drawer-header' },
          h('div', { class: 'draft-drawer-head-meta' },
            a ? avatar(a) : null,
            h('div', { class: 'draft-drawer-head-titles' },
              h('h2', { id: headingId }, `${a ? '@' + a.username : t('draft.account.unknown')} · ${safeSlot(currentRun.scheduled_at)}`),
              h('div', { class: 'draft-drawer-sub' },
                h('span', {}, t('draft.drawer.post_of', { i: runIndex + 1, n: runs.length })),
                ' · ',
                currentRun.status === 'review' ? ui.chip(t('draft.drawer.ready_for_review'), 'warn') : ui.statusChip(currentRun)
              )
            )
          ),
          h('div', { class: 'draft-drawer-head-actions' }, prevPostBtn, nextPostBtn, closeBtn)
        ),
        h('div', { class: 'draft-drawer-body' },
          h('div', { class: 'draft-drawer-left' },
            slideStage,
            slideStrip,
            h('div', { class: 'draft-drawer-card' },
              slideLabelEl,
              h('div', { class: 'draft-slide-actions' }, reviseSlideBtn, replacePhotoBtn, reorderSlideBtn)
            ),
            versionsCard
          ),
          h('div', { class: 'draft-drawer-right' },
            h('div', { class: 'draft-drawer-field' },
              h('div', { class: 'between' },
                h('label', {}, t('legacy.caption')),
                h('div', { class: 'row' }, counter, emojiWarn, improveCaptionBtn)
              ),
              captionInput
            ),
            h('div', { class: 'draft-drawer-grid2' },
              h('div', { class: 'draft-drawer-field' },
                h('label', {}, t('draft.drawer.schedule_wib'), scheduleInput),
                h('small', { class: 'muted' }, t('draft.drawer.scheduler_note', { reason: currentRun.schedule_reason || t('draft.plan.reason.none') }))
              ),
              alsoPublishBox
            ),
            finalReviewerCallout,
            detailsAccordion,
            h('footer', { class: 'draft-drawer-footer' },
              h('div', { class: 'row' }, deleteBtn, sendDraftBtn),
              h('div', { class: 'row' }, statusEl, approveBtn)
            )
          )
        )
      );
    }

    renderDrawerContent();
    document.body.append(backdrop);
    requestAnimationFrame(() => {
      drawer.querySelector('textarea, input, button')?.focus();
    });
    return { close: closeDrawer };
  }

  async function openBulkApproveDialog(s, targetRuns, { onComplete, onSelectFailed } = {}) {
    const ready = targetRuns
      .filter(r => r.status === 'review')
      .sort((a, b) => String(a.scheduled_at || '').localeCompare(String(b.scheduled_at || '')));
    if (!ready.length) return;

    let existingPosts = [];
    const timestamps = ready.map(r => Date.parse(r.scheduled_at)).filter(Number.isFinite);
    if (timestamps.length) {
      const fromIso = new Date(Math.min(...timestamps) - 2 * 86400000).toISOString();
      const toIso = new Date(Math.max(...timestamps) + 2 * 86400000).toISOString();
      try {
        const calRes = await api('GET', `/v1/calendar?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`);
        existingPosts = calRes.data || [];
      } catch {
        existingPosts = [];
      }
    }

    const bodyHost = h('div', { class: 'draft-approve-dialog draft-approve-dialog-body' });
    const tableHost = h('div', { class: 'draft-approve-table-wrap' });
    const clashHost = h('div', { class: 'draft-approve-clash-host' });
    const progressHost = h('div', { class: 'draft-approve-progress-host', hidden: true });
    let dialog;

    function renderAccountSummary(items) {
      const byAcc = new Map();
      for (const r of items) {
        const accId = r.targets?.[0]?.account_id || r.account_id || 'unknown';
        if (!byAcc.has(accId)) byAcc.set(accId, []);
        byAcc.get(accId).push(r);
      }
      const rows = [...byAcc].map(([accId, list]) => {
        const a = account(accId);
        const sorted = [...list].sort((x, y) => String(x.scheduled_at || '').localeCompare(String(y.scheduled_at || '')));
        const firstSlot = sorted[0]?.scheduled_at ? safeSlot(sorted[0].scheduled_at) : t('draft.unscheduled');
        const lastSlot = sorted.at(-1)?.scheduled_at ? safeSlot(sorted.at(-1).scheduled_at) : t('draft.unscheduled');
        return h('tr', {},
          h('td', {}, a ? '@' + a.username : t('draft.account.unknown')),
          h('td', {}, String(list.length)),
          h('td', {}, firstSlot),
          h('td', {}, lastSlot)
        );
      });
      tableHost.replaceChildren(
        h('table', { class: 'draft-approve-table' },
          h('thead', {}, h('tr', {},
            h('th', {}, t('draft.approve.col.account')),
            h('th', {}, t('draft.approve.col.posts')),
            h('th', {}, t('draft.approve.col.first')),
            h('th', {}, t('draft.approve.col.last'))
          )),
          h('tbody', {}, ...rows)
        )
      );
    }

    function renderClashState() {
      const clashes = findScheduleClashes(ready, existingPosts);
      if (!clashes.length) {
        clashHost.replaceChildren();
        return;
      }
      const shiftBtn = h('button', {
        type: 'button',
        class: 'btn sm draft-clash-shift-btn draft-approve-shift-btn',
        onclick: async () => {
          const beforeByRun = new Map(ready.map(r => [r.id, r.scheduled_at]));
          const shifted = shiftClashingRuns(ready, existingPosts);
          for (const r of ready) {
            if (r.scheduled_at !== beforeByRun.get(r.id)) {
              try {
                await api('PATCH', '/v1/generator/runs/' + encodeURIComponent(r.id), { scheduled_at: r.scheduled_at });
              } catch (err) {
                toast(errMsg(err), true);
              }
            }
          }
          renderAccountSummary(ready);
          clashHost.replaceChildren(
            h('div', { class: 'draft-approve-clash is-resolved tone-ok' },
              icon('check'),
              h('span', {}, t('draft.approve.conflict.resolved', { n: shifted }))
            )
          );
        }
      }, t('draft.approve.conflict.shift'));

      clashHost.replaceChildren(
        h('div', { class: 'draft-approve-clash' },
          icon('exclamation'),
          h('span', {}, t('draft.approve.conflict.text', { n: clashes.length })),
          shiftBtn
        )
      );
    }

    const cancelBtn = h('button', {
      type: 'button',
      class: 'btn',
      onclick: () => dialog.close()
    }, t('dialog.cancel'));

    const confirmBtn = h('button', {
      type: 'button',
      class: 'btn primary draft-approve-confirm-btn',
      onclick: () => runSequentialApprove(ready)
    }, t('draft.approve.cta', { n: ready.length }));

    const allSucceeded = [];

    async function runSequentialApprove(batch) {
      cancelBtn.disabled = true;
      confirmBtn.disabled = true;
      progressHost.hidden = false;
      const progressText = h('p', { class: 'draft-approve-progress-text', role: 'status' },
        t('draft.approve.progress', { i: 1, n: batch.length })
      );
      const progressFill = h('i', { style: 'width:0%' });
      const progressBar = h('div', { class: 'draft-approve-progress-bar' }, progressFill);
      progressHost.replaceChildren(progressText, progressBar);

      const failedItems = [];
      for (let i = 0; i < batch.length; i++) {
        const r = batch[i];
        progressText.textContent = t('draft.approve.progress', { i: i + 1, n: batch.length });
        progressFill.style.width = `${Math.round(((i + 1) / batch.length) * 100)}%`;
        try {
          await api('POST', '/v1/generator/runs/' + encodeURIComponent(r.id) + '/approve', {
            content: r.caption,
            scheduled_at: r.scheduled_at
          });
          r.status = 'approved';
          allSucceeded.push(r);
        } catch (err) {
          failedItems.push({ run: r, error: errMsg(err) });
        }
      }

      if (failedItems.length > 0) {
        onSelectFailed?.(failedItems.map(f => f.run.id));
        const stayBtn = h('button', {
          type: 'button',
          class: 'btn',
          onclick: () => {
            dialog.close();
            onComplete?.();
          }
        }, t('draft.approve.done.stay'));

        const retryBtn = h('button', {
          type: 'button',
          class: 'btn primary draft-approve-retry-btn',
          onclick: () => runSequentialApprove(failedItems.map(f => f.run))
        }, t('draft.approve.partial.retry', { n: failedItems.length }));

        bodyHost.replaceChildren(
          h('div', { class: 'draft-approve-partial' },
            h('h3', {}, t('draft.approve.partial.title', { ok: allSucceeded.length, fail: failedItems.length })),
            h('p', { class: 'muted' }, t('draft.approve.partial.body')),
            h('ul', { class: 'draft-approve-failed-list' },
              ...failedItems.map(f => h('li', {},
                h('b', {}, f.run.title || sessionTitle(f.run)),
                ' — ',
                h('span', {}, f.error)
              ))
            )
          ),
          progressHost
        );
        progressHost.hidden = true;
        const footer = dialog.querySelector('.df');
        if (footer) footer.replaceChildren(stayBtn, retryBtn);
        return;
      }

      onSelectFailed?.([]);
      dialog.close();
      const firstApprovedSlot = allSucceeded[0]?.scheduled_at;
      const waitingCount = s.runs.filter(r => !['approved', 'drafted', 'cancelled'].includes(r.status)).length;
      let resultDialog;
      const stayBtn = h('button', {
        type: 'button',
        class: 'btn',
        onclick: () => {
          resultDialog.close();
          onComplete?.();
        }
      }, t('draft.approve.done.stay'));
      const openCalBtn = h('button', {
        type: 'button',
        class: 'btn primary',
        onclick: () => {
          resultDialog.close();
          const dateParam = firstApprovedSlot ? '?date=' + encodeURIComponent(firstApprovedSlot.slice(0, 10)) : '';
          go('/calendar' + dateParam);
        }
      }, t('draft.approve.done.open'));

      resultDialog = modal(
        t('draft.approve.done.title', { n: allSucceeded.length }),
        h('div', { class: 'draft-approve-result' },
          h('div', { class: 'draft-approve-result-icon' }, icon('check')),
          h('p', {}, t('draft.approve.done.body', {
            slot: firstApprovedSlot ? safeSlot(firstApprovedSlot) : t('draft.unscheduled'),
            rest: waitingCount
          }))
        ),
        [stayBtn, openCalBtn]
      );
      onComplete?.();
    }

    renderAccountSummary(ready);
    renderClashState();
    bodyHost.append(
      h('p', { class: 'muted' }, t('draft.approve.dialog.body')),
      tableHost,
      clashHost,
      progressHost
    );

    dialog = modal(t('draft.approve.dialog.title', { n: ready.length }), bodyHost, [cancelBtn, confirmBtn]);
    return dialog;
  }

  function reviewPage(s, itemId, { initialFilter, autoOpenEdit, addCleanup } = {}) {
    const filter = h('div', { class: 'draft-review-filters' });
    const query = new URLSearchParams(location.hash.split('?')[1] || '');
    const startFilter = initialFilter || query.get('filter');
    let current = ['all', 'ready', 'approved', 'failed', 'progress'].includes(startFilter) ? startFilter : 'all';
    let chosen = s.runs.find(r => r.id === itemId) || s.runs.find(r => r.status === 'review') || s.runs[0];
    const list = h('div', { class: 'draft-review-list' }), preview = h('aside', { class: 'draft-review-preview' });
    const selectedAccounts = new Set(s.account_ids);
    const selectedRuns = new Set();
    const chipsHost = h('div', { class: 'draft-review-accounts' });
    state.scope.views.draftSession = ['date', 'grid', 'calendar'].includes(query.get('view')) ? query.get('view') : state.scope.views.draftSession || 'date';
    const views = h('div', { class: 'scope-views' });
    const bulkHost = h('div', { class: 'draft-review-bulk-host' });
    const mobileHost = h('div', { class: 'draft-mobile-review-host', hidden: true });
    const desktopLayout = h('div', { class: 'draft-review-layout' }, list, preview);
    const toolbar = h('div', { class: 'draft-review-toolbar' }, filter, chipsHost, views);
    const mobileModeSeg = h('div', { class: 'seg draft-mobile-mode-seg' });
    let activeSlide = 0;
    let previewPlatform = 'instagram';
    let approveButton;
    let mobileOneByOne = !query.get('view') && typeof window !== 'undefined' && window.innerWidth <= 639;
    let calendarContextPosts = [];
    let calendarContextLoaded = false;

    async function ensureCalendarContext() {
      if (calendarContextLoaded) return;
      calendarContextLoaded = true;
      const timestamps = s.runs.map(r => Date.parse(r.scheduled_at)).filter(Number.isFinite);
      const baseTime = timestamps.length ? Math.min(...timestamps) : Date.now();
      const maxTime = timestamps.length ? Math.max(...timestamps) : Date.now();
      const fromIso = new Date(baseTime - 15 * 86400000).toISOString();
      const toIso = new Date(maxTime + 30 * 86400000).toISOString();
      try {
        const res = await api('GET', `/v1/calendar?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`);
        const ownPostIds = new Set(s.runs.map(r => r.post_id).filter(Boolean));
        calendarContextPosts = (res.data || [])
          .filter(p => p && !ownPostIds.has(p.id) && p.status !== 'cancelled')
          .map(p => {
            const firstTarget = p.targets?.[0];
            const a = firstTarget ? account(firstTarget.account_id) : null;
            const short = a ? a.username.slice(0, 2).toUpperCase() : (firstTarget?.username || '').slice(0, 2).toUpperCase();
            return {
              id: 'post-' + p.id,
              title: (p.content || t('draft.title')).slice(0, 40),
              accountShort: short,
              scheduled_at: p.scheduled_at || p.created_at,
              status: p.status === 'published' ? 'published' : 'scheduled',
              otherSession: true
            };
          });
        if ((state.scope.views.draftSession || 'date') === 'calendar') draw();
      } catch {
        calendarContextPosts = [];
      }
    }

    function visible() {
      return s.runs.filter(r => (!s.account_ids.length || r.targets?.some(target => selectedAccounts.has(target.account_id)) || r.account_ids?.some(id => selectedAccounts.has(id))) &&
        (current === 'all' ||
         current === 'ready' && r.status === 'review' ||
         current === 'approved' && r.status === 'approved' ||
         current === 'failed' && r.status === 'failed' ||
         current === 'progress' && ['queued', 'running'].includes(r.status)));
    }

    function openDrawerFor(r) {
      const items = visible().sort((a, b) => String(a.scheduled_at || '').localeCompare(String(b.scheduled_at || '')));
      return openEditDrawer(r, () => { draw(); drawPreview(); }, { runs: items.length ? items : [r], addCleanup });
    }

    function triggerBulkApprove(runsToApprove) {
      return openBulkApproveDialog(s, runsToApprove, {
        onSelectFailed: failedIds => {
          selectedRuns.clear();
          failedIds.forEach(id => selectedRuns.add(id));
          draw();
          drawPreview();
        },
        onComplete: () => {
          draw();
          drawPreview();
        }
      });
    }

    function wibDayParts(iso) {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return { weekday: '-', day: '-', month: '-' };
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Jakarta', weekday: 'short', day: 'numeric', month: 'short'
      }).formatToParts(d).map(p => [p.type, p.value]));
      return { weekday: parts.weekday, day: parts.day, month: parts.month };
    }

    function accountInitials(a) {
      if (!a) return '--';
      const raw = (a.name || a.username || '').replace(/[^a-zA-Z0-9]/g, '');
      return (raw.slice(0, 2) || '--').toUpperCase();
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
              await api('POST', '/v1/generator/runs/' + encodeURIComponent(chosen.id) + '/revise', {
                request_id: crypto.randomUUID(),
                brief: `${chosen.brief || ''}\n\nRevision: ${text}`.trim(),
                confirm_cost: true
              });
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
        onclick: () => openDrawerFor(chosen)
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
              request_id: crypto.randomUUID(),
              slide_index: activeSlide,
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
        class: 'draft-post-card' + (isChosen ? ' sel' : '') + (selectedRuns.has(r.id) ? ' is-checked' : '') + (isFailed ? ' is-failed' : ''),
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
            draw();
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

    function renderGridCard(r) {
      const isChosen = r.id === chosen?.id;
      const isSelected = selectedRuns.has(r.id);
      const isFailed = r.status === 'failed';
      const isProgress = ['queued', 'running'].includes(r.status);
      const isApproved = r.status === 'approved';
      const a = account(r.targets?.[0]?.account_id || r.account_id);
      const slides = r.slide_count || r.media?.length || 1;
      const handleText = a ? '@' + a.username : t('draft.title');
      const p = r.scheduled_at ? wibDayParts(r.scheduled_at) : null;
      const slotText = p && p.weekday ? `${p.weekday} ${safeTime(r.scheduled_at)}` : (r.scheduled_at ? safeTime(r.scheduled_at) : '--:--');

      return h('div', {
        class: 'draft-grid-card' + (isChosen ? ' sel' : '') + (isSelected ? ' is-checked' : '') + (isFailed ? ' is-failed' : ''),
        onclick: () => {
          chosen = r;
          activeSlide = 0;
          draw();
          drawPreview();
        }
      },
        h('div', { class: 'draft-grid-thumb' + (isFailed ? ' is-failed' : isProgress ? ' is-progress' : '') },
          h('input', {
            type: 'checkbox',
            class: 'draft-grid-check',
            checked: isSelected,
            'aria-label': t('draft.select.item', { title: r.title || sessionTitle(r) }),
            onclick: e => e.stopPropagation(),
            onchange: e => {
              if (e.target.checked) selectedRuns.add(r.id);
              else selectedRuns.delete(r.id);
              draw();
            }
          }),
          slides > 1 ? h('span', { class: 'draft-grid-slides badge-n' }, String(slides)) : null,
          isFailed ? h('div', { class: 'draft-grid-fallback' }, icon('exclamation'), h('span', {}, t('draft.status.failed'))) :
          isProgress ? h('div', { class: 'draft-grid-fallback' }, h('b', {}, `${r.steps?.image?.completed_slides || 0}/${slides}`)) :
          r.media?.[0]?.url ? h('img', { src: r.media[0].url, alt: r.title || '' }) :
          h('div', { class: 'draft-grid-fallback' }, icon('photograph'), h('span', {}, r.title || sessionTitle(r)))
        ),
        h('div', { class: 'draft-grid-meta' },
          h('span', { class: 'draft-grid-handle' }, `${handleText} · ${slotText}`),
          h('span', {
            class: 'draft-grid-dot ' + (isFailed ? 'bad' : isApproved ? 'ok' : isProgress ? 'info' : 'warn'),
            title: isFailed ? t('draft.status.failed') : isApproved ? t('draft.status.approved') : isProgress ? t('draft.status.progress') : t('draft.status.ready')
          })
        )
      );
    }

    function updateBulkBar(items) {
      for (const id of [...selectedRuns]) {
        if (!s.runs.some(r => r.id === id)) selectedRuns.delete(id);
      }
      if (!selectedRuns.size) {
        bulkHost.replaceChildren();
        return;
      }
      const selectedList = s.runs.filter(r => selectedRuns.has(r.id));
      const approvableSelected = selectedList.filter(r => r.status === 'review' || r.status === 'failed');
      const allVisibleSelected = items.length > 0 && items.every(r => selectedRuns.has(r.id));

      bulkHost.replaceChildren(
        h('div', { class: 'draft-session-bulk', role: 'region', 'aria-label': t('draft.bulk.selected', { n: selectedList.length }) },
          h('b', { class: 'draft-bulk-count' }, t('draft.bulk.selected', { n: selectedList.length })),
          !allVisibleSelected && items.length ? h('button', {
            type: 'button',
            class: 'btn ghost sm',
            onclick: () => {
              items.forEach(r => selectedRuns.add(r.id));
              draw();
            }
          }, t('draft.select.all_n', { n: items.length })) : null,
          h('button', {
            type: 'button',
            class: 'btn ghost sm',
            onclick: () => {
              selectedRuns.clear();
              draw();
            }
          }, t('draft.select.clear')),
          h('span', { class: 'spacer' }),
          h('button', {
            type: 'button',
            class: 'btn ghost sm',
            onclick: async () => {
              const raw = await inputDialog({
                title: t('draft.bulk.shift.title'),
                label: t('draft.bulk.shift.prompt'),
                value: '60',
                confirmLabel: t('draft.bulk.shift')
              });
              const min = Number(raw);
              if (!raw || !Number.isFinite(min) || min === 0) return;
              let shifted = 0;
              for (const r of selectedList) {
                const base = Date.parse(r.scheduled_at) || Date.now();
                const nextIso = new Date(base + min * 60000).toISOString();
                try {
                  await api('PATCH', '/v1/generator/runs/' + encodeURIComponent(r.id), { scheduled_at: nextIso });
                  r.scheduled_at = nextIso;
                  shifted++;
                } catch (err) {
                  toast(errMsg(err), true);
                }
              }
              if (shifted) {
                toast(t('draft.bulk.shift.done', { n: shifted, min }));
                draw();
                drawPreview();
              }
            }
          }, t('draft.bulk.shift')),
          h('button', {
            type: 'button',
            class: 'btn ghost sm',
            onclick: async () => {
              const instruction = await inputDialog({
                title: t('draft.bulk.revise'),
                label: t('draft.revision.placeholder'),
                confirmLabel: t('draft.Action.revise')
              });
              if (!instruction?.trim()) return;
              if (!await confirmDialog({
                title: t('draft.dialog.revise.title'),
                body: t('draft.dialog.revise.body'),
                tone: 'cost',
                confirmLabel: t('draft.Action.revise'),
                details: [
                  [t('draft.cost.runs'), selectedList.length],
                  [t('draft.cost.key'), t('draft.cost.provider')]
                ]
              })) return;
              for (const r of selectedList) {
                try {
                  await api('POST', '/v1/generator/runs/' + encodeURIComponent(r.id) + '/revise', {
                    instruction: instruction.trim(),
                    confirm_cost: true
                  });
                } catch (err) {
                  toast(errMsg(err), true);
                }
              }
              toast(t('story.proposals.updated'));
              reload();
            }
          }, t('draft.bulk.revise')),
          h('button', {
            type: 'button',
            class: 'btn danger sm',
            onclick: async () => {
              if (!await confirmDialog({
                title: t('draft.bulk.delete.title', { n: selectedList.length }),
                body: t('draft.bulk.delete.body'),
                tone: 'danger',
                confirmLabel: t('draft.bulk.delete')
              })) return;
              for (const r of selectedList) {
                try {
                  await api('DELETE', '/v1/generator/runs/' + encodeURIComponent(r.id));
                  const idx = s.runs.indexOf(r);
                  if (idx >= 0) s.runs.splice(idx, 1);
                  selectedRuns.delete(r.id);
                } catch (err) {
                  toast(errMsg(err), true);
                }
              }
              draw();
              drawPreview();
            }
          }, t('draft.bulk.delete')),
          h('button', {
            type: 'button',
            class: 'btn primary sm',
            disabled: !approvableSelected.length,
            onclick: () => triggerBulkApprove(approvableSelected)
          }, t('draft.bulk.approve_n', { n: approvableSelected.length }))
        )
      );
    }

    function drawMobileReview(items) {
      if (!items.length || !chosen) {
        mobileHost.replaceChildren(ui.emptyState({ title: t('draft.select.hint') }));
        return;
      }
      const idx = Math.max(0, items.indexOf(chosen));
      const a = account(chosen.targets?.[0]?.account_id || chosen.account_id);
      const handleText = a ? '@' + a.username : t('draft.title');
      const slides = Math.max(1, chosen.slide_count || chosen.media?.length || 1);
      if (activeSlide >= slides) activeSlide = 0;
      const slideMedia = chosen.media?.[activeSlide] || chosen.media?.[0];
      let mobileRevisionInput;

      const advanceNext = () => {
        const nextIdx = idx < items.length - 1 ? idx + 1 : 0;
        chosen = items[nextIdx];
        activeSlide = 0;
        draw();
        drawPreview();
      };

      mobileHost.replaceChildren(
        h('div', { class: 'draft-mobile-review' },
          h('div', { class: 'draft-mobile-top' },
            h('div', { class: 'draft-mobile-counter' },
              h('button', {
                type: 'button',
                class: 'btn ghost sm',
                disabled: idx <= 0,
                'aria-label': t('common.prev'),
                onclick: () => {
                  if (idx > 0) {
                    chosen = items[idx - 1];
                    activeSlide = 0;
                    draw();
                    drawPreview();
                  }
                }
              }, icon('chevron-left')),
              h('b', {}, t('draft.mobile.counter', { i: idx + 1, n: items.length })),
              h('button', {
                type: 'button',
                class: 'btn ghost sm',
                disabled: idx >= items.length - 1,
                'aria-label': t('common.next'),
                onclick: () => {
                  if (idx < items.length - 1) {
                    chosen = items[idx + 1];
                    activeSlide = 0;
                    draw();
                    drawPreview();
                  }
                }
              }, icon('chevron-right'))
            ),
            h('span', { class: 'draft-mobile-slot' }, chosen.scheduled_at ? safeSlot(chosen.scheduled_at) : '--:--'),
            h('button', {
              type: 'button',
              class: 'btn sm',
              onclick: () => openDrawerFor(chosen)
            }, t('draft.mobile.edit'))
          ),
          h('div', { class: 'draft-mobile-card' },
            h('div', { class: 'draft-mobile-card-head' },
              a ? avatar(a) : null,
              h('b', {}, handleText),
              h('span', { class: 'spacer' }),
              ui.statusChip(chosen)
            ),
            h('div', { class: 'draft-mobile-visual' },
              slideMedia?.url
                ? h('img', { src: slideMedia.url, alt: chosen.title || '' })
                : h('div', { class: 'draft-phone-placeholder' }, icon('photograph'), h('span', {}, chosen.title || sessionTitle(chosen))),
              h('span', { class: 'draft-phone-slide-pill' }, `${activeSlide + 1} / ${slides}`)
            ),
            slides > 1 ? h('div', { class: 'draft-slide-strip' },
              ...Array.from({ length: slides }, (_, sIdx) =>
                h('button', {
                  type: 'button',
                  class: 'draft-slide-thumb' + (sIdx === activeSlide ? ' on' : ''),
                  onclick: () => { activeSlide = sIdx; drawMobileReview(items); }
                }, String(sIdx + 1))
              )
            ) : null,
            h('div', { class: 'draft-mobile-caption' },
              h('strong', {}, handleText + ' '),
              chosen.caption || chosen.title || t('legacy.no_caption')
            ),
            h('div', { class: 'draft-revision-box' },
              mobileRevisionInput = h('input', {
                class: 'input',
                placeholder: t('draft.revision.placeholder')
              }),
              h('button', {
                type: 'button',
                class: 'btn sm',
                onclick: async () => {
                  const instruction = mobileRevisionInput.value.trim();
                  if (!instruction) return;
                  if (!await confirmDialog({
                    title: t('draft.dialog.revise.title'),
                    body: t('draft.dialog.revise.body'),
                    tone: 'cost',
                    confirmLabel: t('draft.Action.revise'),
                    details: [[t('draft.cost.runs'), 1], [t('draft.cost.key'), t('draft.cost.provider')]]
                  })) return;
                  try {
                    await api('POST', '/v1/generator/runs/' + encodeURIComponent(chosen.id) + '/revise', {
                      instruction,
                      confirm_cost: true
                    });
                    mobileRevisionInput.value = '';
                    toast(t('story.proposals.updated'));
                    reload();
                  } catch (err) {
                    toast(errMsg(err), true);
                  }
                }
              }, t('draft.Action.revise'))
            )
          ),
          h('div', { class: 'draft-mobile-bar' },
            h('button', {
              type: 'button',
              class: 'btn',
              onclick: advanceNext
            }, t('draft.mobile.skip')),
            h('button', {
              type: 'button',
              class: 'btn primary btn-pri',
              disabled: chosen.status === 'approved',
              onclick: async () => {
                try {
                  await api('POST', '/v1/generator/runs/' + encodeURIComponent(chosen.id) + '/approve', {});
                  chosen.status = 'approved';
                  toast(t('story.proposals.approved'));
                  advanceNext();
                } catch (err) {
                  toast(errMsg(err), true);
                }
              }
            }, chosen.status === 'approved' ? t('draft.status.approved') : t('draft.mobile.approve_next'))
          )
        )
      );
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

      const items = visible().sort((a, b) => String(a.scheduled_at || '').localeCompare(String(b.scheduled_at || '')));
      if (!items.includes(chosen)) chosen = items[0];

      const view = state.scope.views.draftSession || 'date';
      const allVisibleSelected = items.length > 0 && items.every(r => selectedRuns.has(r.id));

      views.replaceChildren(...[
        items.length ? h('button', {
          type: 'button',
          class: 'btn ghost sm draft-select-all-btn',
          onclick: () => {
            if (allVisibleSelected) items.forEach(r => selectedRuns.delete(r.id));
            else items.forEach(r => selectedRuns.add(r.id));
            draw();
          }
        }, allVisibleSelected ? t('draft.select.clear') : t('draft.select.all_n', { n: items.length })) : null,
        ...[['date', 'view.by_date'], ['grid', 'view.grid'], ['calendar', 'view.calendar']].map(([value, key]) =>
          h('button', {
            class: view === value ? 'on' : '',
            'aria-pressed': String(view === value),
            onclick: () => { state.scope.views.draftSession = value; draw(); }
          }, t(key))
        )
      ].filter(Boolean));

      mobileModeSeg.replaceChildren(
        h('button', {
          type: 'button',
          class: mobileOneByOne ? 'on' : '',
          'aria-pressed': String(mobileOneByOne),
          onclick: () => { mobileOneByOne = true; draw(); }
        }, t('draft.mobile.mode.one')),
        h('button', {
          type: 'button',
          class: !mobileOneByOne ? 'on' : '',
          'aria-pressed': String(!mobileOneByOne),
          onclick: () => { mobileOneByOne = false; draw(); }
        }, t('draft.mobile.mode.all'))
      );

      const isMobile = typeof window !== 'undefined' && window.innerWidth <= 639;
      if (isMobile && mobileOneByOne) {
        desktopLayout.hidden = true;
        toolbar.hidden = true;
        mobileHost.hidden = false;
        drawMobileReview(items);
      } else {
        desktopLayout.hidden = false;
        toolbar.hidden = false;
        mobileHost.hidden = true;
      }

      list.className = 'draft-review-list view-' + view;
      updateBulkBar(items);

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
      } else if (view === 'grid') {
        list.replaceChildren(h('div', { class: 'draft-grid-wrap' }, ...items.map(renderGridCard)));
      } else if (view === 'calendar') {
        ensureCalendarContext();
        for (const r of items) {
          const a = account(r.targets?.[0]?.account_id || r.account_id);
          r.accountShort = a ? a.username.slice(0, 2).toUpperCase() : '';
        }
        list.replaceChildren(renderRunCalendar({
          h,
          runs: items,
          contextPosts: calendarContextPosts,
          onSelect: r => { chosen = r; activeSlide = 0; draw(); drawPreview(); },
          onMove: async (r, date) => {
            const previousScheduledAt = r.scheduled_at;
            const wibTime = (previousScheduledAt && safeWibInput(previousScheduledAt)?.slice(11, 16)) || '12:15';
            const nextIso = new Date(`${date}T${wibTime}:00+07:00`).toISOString();
            try {
              await api('PATCH', '/v1/generator/runs/' + encodeURIComponent(r.id), { scheduled_at: nextIso });
              r.scheduled_at = nextIso;
              draw();
              drawPreview();
              toast(
                t('draft.cal.move.saved', { date: `${r.title || sessionTitle(r)} — ${safeSlot(nextIso)}` }),
                false,
                previousScheduledAt ? {
                  label: t('toast.undo'),
                  fn: async () => {
                    try {
                      await api('PATCH', '/v1/generator/runs/' + encodeURIComponent(r.id), { scheduled_at: previousScheduledAt });
                      r.scheduled_at = previousScheduledAt;
                      draw();
                      drawPreview();
                      toast(t('story.proposals.updated'));
                    } catch (err) {
                      toast(errMsg(err), true);
                    }
                  }
                } : null
              );
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
    if (autoOpenEdit && chosen) {
      openDrawerFor(chosen);
    }

    const handleKeydown = e => {
      if (e.target?.matches?.('input, textarea, select, [contenteditable]')) return;
      if (document.querySelector('dialog[open], .draft-editor-drawer')) return;
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
        if (chosen) openDrawerFor(chosen);
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
      element: h('div', { class: 'draft-review-root' },
        mobileModeSeg,
        toolbar,
        mobileHost,
        desktopLayout,
        bulkHost
      ),
      cleanup: () => { window.removeEventListener('keydown', handleKeydown); },
      openBulkApprove: triggerBulkApprove
    };
  }

  return { list, session, load };
}
