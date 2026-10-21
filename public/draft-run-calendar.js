import { t as defaultT } from './strings.en.js';

const zone = 'Asia/Jakarta';
const states = new Set(['planned', 'queued', 'running', 'concept_review', 'review', 'failed', 'approved', 'drafted', 'cancelled']);
const wibParts = iso => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
};
const monthKey = (year, month) => `${year}-${String(month).padStart(2, '0')}`;
const monthDays = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

// onMove receives the run and a YYYY-MM-DD date in Asia/Jakarta.
export function renderRunCalendar({ h, runs = [], onSelect, onMove, icon, t = defaultT } = {}) {
  const scheduled = runs.filter(run => wibParts(run.scheduled_at));
  const first = scheduled.map(run => wibParts(run.scheduled_at).date).sort()[0];
  const now = wibParts(new Date().toISOString()).date;
  const initial = first || now;
  let year = Number(initial.slice(0, 4)), month = Number(initial.slice(5, 7));
  let moving = null, dragging = null, saving = false;

  const root = h('section', { class: 'draft-run-calendar', 'aria-label': t('view.calendar') });
  const title = h('h2', { class: 'draft-run-calendar-title' });
  const grid = h('div', { class: 'draft-run-calendar-grid' });
  const feedback = h('p', { class: 'draft-run-calendar-feedback', role: 'status', 'aria-live': 'polite' });
  const moveTitle = h('h3');
  const dateInput = h('input', { type: 'date', required: true, 'aria-label': t('draft.cal.move') });
  const moveForm = h('form', { class: 'draft-run-calendar-move', hidden: true, onsubmit: async event => {
    event.preventDefault();
    if (!moving || !dateInput.value || saving) return;
    await move(moving, dateInput.value);
  } }, moveTitle, dateInput,
  h('button', { type: 'submit', class: 'btn primary' }, t('draft.cal.move.save')),
  h('button', { type: 'button', class: 'btn', onclick: closeMove }, t('draft.cal.move.cancel')));
  const previous = h('button', { type: 'button', class: 'btn sm', 'aria-label': t('draft.cal.previous'),
    onclick: () => changeMonth(-1) }, icon('chevron-left'));
  const next = h('button', { type: 'button', class: 'btn sm', 'aria-label': t('draft.cal.next'),
    onclick: () => changeMonth(1) }, icon('chevron-right'));
  root.append(h('div', { class: 'draft-run-calendar-toolbar' }, title,
    h('div', { class: 'draft-run-calendar-navigation' }, previous, next)), feedback, moveForm, grid,
    h('p', { class: 'draft-run-calendar-hint' }, t('draft.cal.hint.keyboard')));

  function closeMove() {
    const trigger = moving?.trigger;
    moving = null;
    moveForm.hidden = true;
    if (trigger?.isConnected) trigger.focus();
  }
  function openMove(run, trigger) {
    const slot = wibParts(run.scheduled_at);
    if (!slot) return;
    moving = { run, trigger };
    moveTitle.textContent = t('draft.cal.move.title', { title: run.title || run.brief || t('draft.title') });
    dateInput.value = slot.date;
    moveForm.hidden = false;
    dateInput.focus();
  }
  async function move(target, day) {
    const run = target.run || target;
    const before = wibParts(run.scheduled_at);
    if (!before || before.date === day || !onMove) { if (target.run) closeMove(); return; }
    const iso = new Date(`${day}T${before.time}:00+07:00`).toISOString();
    saving = true;
    feedback.textContent = t('autosave.saving');
    try {
      await onMove(run, day);
      run.scheduled_at = iso;
      feedback.textContent = t('draft.cal.move.saved', { date: fmtSlot(iso) });
      if (target.run) closeMove();
      year = Number(day.slice(0, 4)); month = Number(day.slice(5, 7));
      draw();
    } catch {
      feedback.textContent = t('draft.cal.move.failed');
      if (target.run) dateInput.focus();
    } finally { saving = false; }
  }
  function fmtSlot(iso) {
    return new Intl.DateTimeFormat('en-GB', { timeZone: zone, weekday: 'short', day: 'numeric',
      month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
  }
  function changeMonth(delta) {
    const changed = new Date(Date.UTC(year, month - 1 + delta, 1));
    year = changed.getUTCFullYear(); month = changed.getUTCMonth() + 1;
    draw();
    title.focus?.();
  }
  function eventNode(run) {
    const slot = wibParts(run.scheduled_at);
    const status = states.has(run.status) ? run.status : 'planned';
    const statusLabel = t('draft.cal.status.' + status);
    const label = t('draft.cal.event', { title: run.title || run.brief || t('draft.title'), status: statusLabel, time: slot.time });
    const event = h('div', { class: `draft-run-calendar-event state-${status}${run.otherSession ? ' is-other' : ''}`,
      draggable: !!onMove && !run.otherSession, 'data-run-id': run.id,
      ondragstart: e => { dragging = run.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(run.id)); },
      ondragend: () => { dragging = null; } },
      h('button', { type: 'button', class: 'draft-run-calendar-select', 'aria-label': label,
        onclick: () => onSelect?.(run) },
        h('span', { class: 'draft-run-calendar-event-time' }, slot.time),
        h('span', { class: 'draft-run-calendar-event-title' }, run.title || run.brief || t('draft.title')),
        h('span', { class: 'draft-run-calendar-event-status' }, statusLabel)),
      onMove && !run.otherSession ? h('button', { type: 'button', class: 'draft-run-calendar-move-button',
        'aria-label': `${t('draft.cal.move')}: ${run.title || run.brief || t('draft.title')}`,
        onclick: e => openMove(run, e.currentTarget) }, icon('calendar')) : null);
    return event;
  }
  function draw() {
    const monthName = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' })
      .format(new Date(Date.UTC(year, month - 1, 1)));
    title.textContent = t('draft.cal.month', { month: monthName, year });
    const byDay = new Map();
    for (const run of scheduled) {
      const day = wibParts(run.scheduled_at)?.date;
      if (day && day.startsWith(monthKey(year, month))) {
        if (!byDay.has(day)) byDay.set(day, []);
        byDay.get(day).push(run);
      }
    }
    const offset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
    const cells = Math.max(35, Math.ceil((offset + monthDays(year, month)) / 7) * 7);
    const start = Date.UTC(year, month - 1, 1 - offset);
    const weekdays = Array.from({ length: 7 }, (_, index) => {
      const value = new Date(Date.UTC(2024, 0, 1 + index));
      return h('div', { class: 'draft-run-calendar-weekday', 'aria-hidden': 'true' },
        new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(value));
    });
    const days = Array.from({ length: cells }, (_, index) => {
      const date = new Date(start + index * 86400000);
      const day = date.toISOString().slice(0, 10);
      const inMonth = date.getUTCMonth() + 1 === month;
      const events = (byDay.get(day) || []).sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)));
      return h('div', { class: `draft-run-calendar-day${inMonth ? '' : ' is-outside'}`,
        'data-date': day, 'aria-label': new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date),
        ondragover: e => { if (dragging) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } },
        ondrop: e => { e.preventDefault(); const run = runs.find(item => String(item.id) === String(dragging)); dragging = null; if (run) move(run, day); } },
        h('span', { class: 'draft-run-calendar-day-number' }, date.getUTCDate()),
        ...events.map(eventNode));
    });
    grid.replaceChildren(...weekdays, ...days);
    grid.setAttribute('aria-label', title.textContent);
  }
  draw();
  return root;
}
