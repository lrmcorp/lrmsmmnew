// Month view for Content Generator sessions. A bar covers every day in a
// session's date range and continues on the following week when needed.
export function renderSessionCalendar({ h, sessions = [], sessionPath, fmtRange, icon, t }) {
  const zone = 'Asia/Jakarta';
  const dateParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const dateKey = value => {
    if (!value) return '';
    const source = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(source)) return source;
    const date = new Date(source);
    if (Number.isNaN(date.getTime())) return '';
    const parts = Object.fromEntries(dateParts.formatToParts(date).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  const asDay = key => new Date(`${key}T00:00:00Z`);
  const addDays = (date, days) => new Date(date.getTime() + days * 86400000);
  const keyOf = date => date.toISOString().slice(0, 10);
  const todayKey = dateKey(new Date().toISOString());
  const upcoming = sessions.map(session => dateKey(session.start || session.createdAt))
    .filter(key => key && key >= todayKey).sort()[0];
  const initial = upcoming || todayKey;
  let year = Number(initial.slice(0, 4));
  let month = Number(initial.slice(5, 7)) - 1;

  const heading = h('h2', { class: 'draft-calendar-title' });
  const grid = h('div', { class: 'draft-calendar-grid' });
  const agenda = h('div', { class: 'draft-calendar-agenda' });
  const summary = h('p', { class: 'draft-calendar-empty', role: 'status' });
  const button = (label, symbol, action) => h('button', {
    type: 'button', class: 'btn sm', 'aria-label': label, onclick: action,
  }, icon(symbol));
  const previous = button(t('draft.calendar.previous'), 'chevron-left', () => move(-1));
  const next = button(t('draft.calendar.next'), 'chevron-right', () => move(1));
  const today = h('button', { type: 'button', class: 'btn sm', onclick: () => {
    year = Number(todayKey.slice(0, 4)); month = Number(todayKey.slice(5, 7)) - 1; draw();
  } }, t('cal.today'));
  const host = h('section', { class: 'draft-session-calendar', 'aria-label': t('draft.calendar.label') },
    h('div', { class: 'draft-calendar-toolbar' }, heading,
      h('div', { class: 'draft-calendar-controls' }, previous, today, next)), grid, agenda, summary);

  function move(delta) {
    const target = new Date(Date.UTC(year, month + delta, 1));
    year = target.getUTCFullYear(); month = target.getUTCMonth(); draw();
  }

  function draw() {
    const first = new Date(Date.UTC(year, month, 1));
    const firstWeekday = (first.getUTCDay() + 6) % 7;
    const calendarStart = addDays(first, -firstWeekday);
    const calendarEnd = addDays(calendarStart, 41);
    const monthText = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC', month: 'long', year: 'numeric',
    }).format(first);
    heading.textContent = monthText;

    const weekdays = [t('cal.mon'), t('cal.tue'), t('cal.wed'), t('cal.thu'),
      t('cal.fri'), t('cal.sat'), t('cal.sun')];
    const weeks = [];
    let shown = 0;
    for (let weekIndex = 0; weekIndex < 6; weekIndex++) {
      const weekStart = addDays(calendarStart, weekIndex * 7);
      const weekEnd = addDays(weekStart, 6);
      const weekStartKey = keyOf(weekStart), weekEndKey = keyOf(weekEnd);
      const week = h('div', { class: 'draft-calendar-week', role: 'row' });
      for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        const day = addDays(weekStart, dayIndex);
        const key = keyOf(day);
        week.append(h('div', {
          class: `draft-calendar-day${day.getUTCMonth() === month ? '' : ' is-outside'}${key === todayKey ? ' is-today' : ''}`,
          role: 'gridcell', style: { gridColumn: String(dayIndex + 1), gridRow: '1' },
          'aria-label': new Intl.DateTimeFormat('en-GB', {
            timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
          }).format(day),
        }, h('span', {}, String(day.getUTCDate()))));
      }

      const segments = sessions.flatMap(session => {
        const start = dateKey(session.start || session.createdAt);
        const end = dateKey(session.end || session.start || session.createdAt);
        if (!start || !end || end < weekStartKey || start > weekEndKey) return [];
        const clampedStart = start < weekStartKey ? weekStartKey : start;
        const clampedEnd = end > weekEndKey ? weekEndKey : end;
        const startCol = Math.round((asDay(clampedStart) - weekStart) / 86400000) + 1;
        const endCol = Math.round((asDay(clampedEnd) - weekStart) / 86400000) + 1;
        return [{ session, start, end, startCol, endCol }];
      }).sort((a, b) => a.startCol - b.startCol || b.endCol - a.endCol);
      const lanes = [];
      for (const segment of segments) {
        let lane = lanes.findIndex(lastEnd => lastEnd < segment.startCol);
        if (lane < 0) lane = lanes.length;
        lanes[lane] = segment.endCol;
        const { session } = segment;
        const range = fmtRange(session.start || session.createdAt, session.end || session.start || session.createdAt);
        const state = t(`draft.state.${session.state}`);
        const label = t('draft.calendar.session', { title: session.title, range, state });
        week.append(h('a', {
          href: '#' + sessionPath(session),
          class: `draft-calendar-bar state-${session.state || 'plan'}`,
          style: { gridColumn: `${segment.startCol} / ${segment.endCol + 1}`, gridRow: String(lane + 2) },
          title: label, 'aria-label': label,
        }, h('span', { class: 'draft-calendar-bar-title' }, session.title),
        h('span', { class: 'draft-calendar-bar-state' }, state)));
        shown++;
      }
      week.style.gridTemplateRows = `36px repeat(${Math.max(1, lanes.length)}, 30px)`;
      weeks.push(week);
    }
    grid.replaceChildren(h('div', { class: 'draft-calendar-weekdays', role: 'row' },
      weekdays.map(day => h('span', { role: 'columnheader' }, day))), ...weeks);
    const monthStart = keyOf(first);
    const monthEnd = keyOf(new Date(Date.UTC(year, month + 1, 0)));
    agenda.replaceChildren(...sessions.filter(session => {
      const start = dateKey(session.start || session.createdAt);
      const end = dateKey(session.end || session.start || session.createdAt);
      return start && end && start <= monthEnd && end >= monthStart;
    }).map(session => h('a', { class: 'draft-calendar-agenda-item', href: '#' + sessionPath(session) },
      h('b', {}, session.title),
      h('span', {}, fmtRange(session.start || session.createdAt,
        session.end || session.start || session.createdAt)), ' · ', t(`draft.state.${session.state}`))));
    summary.textContent = shown ? '' : t('draft.calendar.empty');
    summary.hidden = !!shown;
  }

  draw();
  return host;
}
