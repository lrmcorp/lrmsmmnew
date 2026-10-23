import {memorySessionPicker,rememberedMemory} from './story-memory.js';
import {brandReadiness} from './brand-readiness.js';
import {workflowCanvas} from './workflow-canvas.js';
import { autosave, fmtSlot, readSessionGroups } from './ui.js';
const replace = (el, ...nodes) => el.replaceChildren(...nodes.flat(Infinity).filter(x => x != null && x !== false));
export async function generatorWorkspace(ctx, workspace) {
  const {
    h,
    api,
    ui,
    state,
    icon,
    modal,
    toast,
    go,
    loadAccounts,
    uploadFile,
    errMsg
  } = ctx;
  const {
    B,
    field,
    link,
    today,
    card,
    errorBox,
    roles
  } = workspace;
  await loadAccounts();
  const config = await api('GET', '/v1/generator/settings');
  state.aiSettings = config;
  state.brandProfiles ??= {};
  const openSavers = new Set(),
    notified = new Set();
  let notifyReady = true;
  const accountMeta = h('div', {
      class: 'gf-account-meta'
    }),
    scheduleSentence = h('div', {
      class: 'gf-schedule-sentence'
    }),
    formatSegments = h('div', {
      class: 'gf-format-controls'
    }),
    briefCounter = h('span', {
      class: 'small muted gf-brief-counter'
    });
  let stopped = false,
    pollBusy = false,
    submitting = false,
    mode = 'campaign',
    preset = 'Balanced',
    agents = structuredClone(config.agents),
    selection = [],
    batch = null,
    latestJobs = [],
    sessions = [];
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  mode = q.get('story_account') ? 'story' : 'campaign';
  let company = state.scope?.companyId || '';
  try {
    selection = JSON.parse(localStorage.getItem('lrm.gen.accounts') || '[]').filter(id => state.accounts.some(a => a.id === id));
  } catch {}
  if (q.get('story_account')) {
    selection = [q.get('story_account')];
    company = state.accounts.find(a => a.id === selection[0])?.company_id || '';
  }
  if (mode === 'story') selection = selection.slice(0, 1);
  const profiles = await Promise.allSettled(state.accounts.filter(a => a.platform === 'instagram').map(async a => {
    const sid=a.id===q.get('story_account')&&q.get('memory_session_id')||rememberedMemory(state.user.id,a.id),base=`/v1/generator/accounts/${a.id}/brand`;
    let p;try{p=await api('GET',base+(sid?'?memory_session_id='+encodeURIComponent(sid):''));}catch(e){if(!sid||e.code!=='not_found')throw e;p=await api('GET',base);}return[a.id,p];
  }));
  for (const r of profiles) if (r.status === 'fulfilled') state.brandProfiles[r.value[0]] = r.value[1];
  const running = h('div', {
      class: 'rd-running',
      role: 'status'
    }),
    accountRow = h('div', {
      class: 'rd-generator-accounts'
    }),
    summary = h('aside', {
      class: 'rd-generator-summary panel'
    }),
    recent = h('div'),
    error = h('div', {
      role: 'alert'
    }),
    storyInfo = h('div'),
    formatOptions = h('div'),
    modeControl = h('div', {
      class: 'rd-tabs'
    }),
    teamSummary = h('span', {
      class: 'small muted'
    }),
    brief = h('textarea', {
      rows: 5,
      maxlength: 10000,
      placeholder: 'For example: a year-end nail care campaign for new customers.',
      'aria-label': 'Content direction',
      oninput: update
    }),
    captionLanguage = h('select', {
      'aria-label': 'Caption language',
      onchange: update
    }, [['account', 'From Brand Kit'], ['id', 'Indonesian'], ['en', 'English'], ['mixed', 'Mixed']].map(([value, text]) => h('option', {
      value
    }, text))),
    format = h('select', {
      'aria-label': 'Content format',
      onchange: () => {
        slides.disabled = format.value === 'single';
        if (slides.disabled) slides.value = 1;else if (Number(slides.value) < 2) slides.value = 3;
        update();
      }
    }, [['single', 'Single photo'], ['carousel', 'Carousel']].map(([value, text]) => h('option', {
      value
    }, text))),
    slides = h('input', {
      type: 'number',
      value: 1,
      min: 1,
      max: 10,
      disabled: true,
      'aria-label': 'Slides per post',
      oninput: update
    }),
    images = h('select', {
      'aria-label': 'Image source',
      onchange: update
    }, h('option', {
      value: 'ai'
    }, 'AI creates images'), h('option', {
      value: 'manual'
    }, 'I will upload my own photos'));
  const start = h('input', {
      type: 'date',
      value: new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10),
      min: new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10),
      'aria-label': 'Start date in WIB',
      oninput: update
    }),
    end = h('input', {
      type: 'date',
      value: new Date(Date.now() + 14 * 864e5 + 7 * 3600000).toISOString().slice(0, 10),
      'aria-label': 'End date in WIB',
      oninput: update
    }),
    count = h('input', {
      type: 'number',
      value: 12,
      min: 1,
      max: 30,
      'aria-label': 'Posts per account',
      oninput: update
    }),
    times = h('input', {
      value: '09:00, 12:15, 19:15',
      'aria-label': 'Posting times in WIB',
      oninput: update
    }),
    submit = B('Generate', generate, 'btn primary rd-generate');
  const mobileSubmit = B('Generate', generate, 'btn primary'),
    mobileMeta = h('span', {
      class: 'small'
    }),
    mobileFooter = h('div', {
      class: 'rd-generator-mobile-footer'
    }, mobileMeta, mobileSubmit);
  const draftKey = 'lrm.generator.form.' + state.user.id;
  try {
    const saved = JSON.parse(localStorage.getItem(draftKey) || 'null');
    if (saved) {
      for (const [name, input] of Object.entries({
        brief,
        start,
        end,
        count,
        times,
        slides,
        format,
        images,
        captionLanguage
      })) if (saved[name] !== undefined) input.value = saved[name];
      mode = q.get('story_account') ? 'story' : saved.mode || mode;
    }
  } catch {}
  slides.disabled = format.value === 'single';
  if (slides.disabled) slides.value = 1;
  brief.value = mode === 'story' ? '' : q.get('brief') || brief.value || '';
  const companySelect = h('select', {
    'aria-label': 'Company',
    onchange: e => {
      company = e.target.value;
      selection = [];
      drawAccounts();
      update();
    }
  }, h('option', {
    value: ''
  }, 'All companies'), state.companies.map(c => h('option', {
    value: c.id,
    selected: c.id === company
  }, c.name)));
  function scoped() {
    return state.accounts.filter(a => (!company || a.company_id === company) && (mode !== 'story' || a.platform === 'instagram'));
  }
  function selected() {
    return state.accounts.filter(a => selection.includes(a.id));
  }
  function drawAccounts() {
    const list = scoped().sort((a, b) => Number(!!state.brandProfiles[b.id]?.seed) - Number(!!state.brandProfiles[a.id]?.seed) || a.username.localeCompare(b.username));
    selection = selection.filter(id => list.some(a => a.id === id));
    replace(accountRow, companySelect, ui.accountPicker({
      accounts: list,
      selected: selection,
      mode: mode === 'story' ? 'single' : 'multi',
      readiness:id=>brandReadiness(state.brandProfiles[id]),
      onChange: ids => {
        if (mode === 'story' && ids[0] && !state.brandProfiles[ids[0]]?.seed) {
          quickBrand(state.accounts.find(a => a.id === ids[0]));
          return;
        }
        selection = ids;
        try {
          localStorage.setItem('lrm.gen.accounts', JSON.stringify(ids));
        } catch {}
        drawStory();
        update();
      }
    }).element);
  }
  function drawStory() {
    replace(modeControl, ...[['campaign', 'New campaign'], ['story', 'Continue Storyline']].map(([id, text]) => B(text, () => {
      mode = id;
      selection = selection.slice(0, mode === 'story' ? 1 : selection.length);
      brief.value = '';
      brief.placeholder = mode === 'story' ? 'Optional: direction for this session. Leave empty to continue the story foundation and memory.' : 'For example: a new product campaign, its benefits and why customers should try it.';
      drawAccounts();
      drawStory();
      update();
    }, 'btn ' + (mode === id ? 'on' : ''))));
    formatOptions.hidden = mode === 'story';
    replace(storyInfo);
    if (mode === 'story') {
      const a = selected()[0],
        p = state.brandProfiles[a?.id];
      storyInfo.append(h('div', {
        class: 'gf-story-position'
      }, p?.seed ? h('div', {}, memorySessionPicker(ctx,p,next=>{state.brandProfiles[a.id]=next;drawStory();update();}),h('b', {}, `@${a.username} · Next episode ${p.next_episode || 1}`), h('p', {}, 'The story continues the selected session memory. The account Brand Kit remains the shared foundation.'), B('View Story Bible', () => storyBible(a, p), 'btn ghost sm'), storyArc(p), h('p', {
        class: 'gf-story-next'
      }, `This session continues episodes ${p.next_episode || 1}–${(p.next_episode || 1) + Math.max(1, Number(count.value) || 1) - 1}. Storyteller uses saved story memory.`)) : h('p', {}, 'Select one account and complete its brand foundation to continue the story.')));
    }
  }
  function languageFor(a) {
    if (captionLanguage.value !== 'account') return captionLanguage.value;
    return /Caption language:\s*(id|en|mixed)/i.exec(state.brandProfiles[a.id]?.brand_notes || '')?.[1] || 'id';
  }
  function instructionsFor(a) {
    const p = state.brandProfiles[a.id],
      lang = {
        id: 'Indonesian',
        en: 'English',
        mixed: 'a natural mix of Indonesian and English'
      }[languageFor(a)];
    return `Write captions and on-image text in ${lang}. ${/Emoji in captions:\s*off/i.test(p?.brand_notes || '') ? 'Do not use emoji in captions, titles or on-image text.' : 'Emoji in captions are allowed when appropriate.'} Preserve logo identity and product appearance. Follow each product’s chosen presentation mode; AI mockups require human product-detail review.`;
  }
  function readyItems() {
    const items = [];
    if(mode==='story'&&selected()[0]&&!state.brandProfiles[selected()[0].id]?.memory_session_id)items.push({text:'Create a story memory session first',fix:()=>storyInfo.querySelector('button')?.focus()});
    if (!selection.length) items.push({
      text: 'Select at least one account.',
      fix: () => accountRow.scrollIntoView({
        behavior: 'smooth'
      })
    });
    for (const a of selected()) {
      if (a.platform === 'instagram' && !brandReadiness(state.brandProfiles[a.id]).ok) items.push({
        text: `@${a.username}: Brand Kit foundation is missing.`,
        fix: () => quickBrand(a),
        account: a
      });
      if (a.status && a.status !== 'active') items.push({
        text: `@${a.username}: reconnect the account.`,
        url: '/accounts/' + a.id
      });
    }
    if (mode === 'campaign' && !brief.value.trim()) items.push({
      text: 'Write a campaign direction.',
      fix: () => brief.focus()
    });
    const activeRoles = mode === 'story' ? ['storyteller', 'manager', 'scheduler'] : images.value === 'manual' ? [] : ['concept', 'revision'];
    for (const p of [...new Set(activeRoles.map(role => agents[role]?.provider))]) if (p && !config.keys.some(k => k.provider === p)) items.push({
      text: `Add an API key for ${p} in personal settings.`,
      url: '/settings?from=generator'
    });
    const n = Number(count.value);
    if (!Number.isInteger(n) || n < 1 || n > 30) items.push({
      text: 'Choose 1–30 posts per account.',
      fix: () => count.focus()
    });
    if (Number(slides.value) < 1 || Number(slides.value) > 10) items.push({
      text: 'Choose 1–10 slides.',
      fix: () => slides.focus()
    });
    if (!start.value || start.value < today() || !end.value || end.value < start.value) items.push({
      text: 'Start today or later; the end date cannot be earlier.',
      fix: () => start.focus()
    });
    if (Date.parse(end.value) - Date.parse(start.value) > 90 * 864e5) items.push({
      text: 'Schedule range must not exceed 90 days.',
      fix: () => end.focus()
    });
    const ts = times.value.split(',').map(s => s.trim()).filter(Boolean);
    if (!ts.length || ts.length > 12 || ts.some(s => !/^([01]\d|2[0-3]):[0-5]\d$/.test(s))) items.push({
      text: 'Enter WIB times as HH:MM, separated by commas, up to 12 times.',
      fix: () => times.focus()
    });
    const inclusiveDays = Math.floor((Date.parse(end.value) - Date.parse(start.value)) / 864e5) + 1;
    const validTimes = ts.length && ts.length <= 12 && ts.every(value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value));
    let capacity = 0;
    if (validTimes && Number.isFinite(inclusiveDays) && inclusiveDays > 0 && inclusiveDays <= 91) {
      for (let day = Date.parse(start.value + 'T00:00:00+07:00'); day <= Date.parse(end.value + 'T00:00:00+07:00'); day += 864e5) {
        const date = new Date(day + 7 * 3600000).toISOString().slice(0, 10);
        capacity += [...new Set(ts)].filter(time => Date.parse(`${date}T${time}:00+07:00`) > Date.now() + 5 * 60000).length;
      }
    }
    if (validTimes && inclusiveDays > 0 && inclusiveDays <= 91 && Number.isInteger(n) && n > capacity) items.push({
      text: `Schedule capacity is ${capacity} future posts per account, but ${n} are requested. Use Start now, add posting times, extend the dates or reduce the count.`,
      fix: () => schedulePopover('times')
    });
    return items;
  }
  function shortDate(value) {
    return value ? new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      timeZone: 'Asia/Jakarta'
    }).format(new Date(value + 'T12:00:00+07:00')) : 'Choose a date';
  }
  function storyArc(p) {
    const text = String(p.bible || ''),
      chapters = [...text.matchAll(/(?:Chapter|Bab)\s*(\d+)\s*[-:·–]?\s*([^\n]+)(?:\n([^\n]+))?/gi)].slice(0, 4);
    if (!chapters.length) return null;
    return h('div', {
      class: 'gf-story-arc'
    }, chapters.map(m => h('section', {}, h('b', {}, 'CHAPTER ' + m[1]), h('span', {}, m[2].replace(/[*#]/g, '')), h('div', {
      class: 'gf-episode-bars'
    }, [1, 2, 3].map(() => h('i'))))));
  }
  function drawFormats() {
    replace(formatSegments, h('span', {
      class: 'small'
    }, 'Format'), h('div', {
      class: 'rd-tabs'
    }, [['single', 'Single'], ['carousel', 'Carousel']].map(([v, label]) => B(label, () => {
      format.value = v;
      format.dispatchEvent(new Event('change'));
      drawFormats();
    }, 'btn sm ' + (format.value === v ? 'on' : '')))), h('span', {
      class: 'small'
    }, 'Slide'), B('−', () => {
      if (!slides.disabled) {
        slides.value = Math.max(1, Number(slides.value) - 1);
        update();
      }
    }, 'btn sm', {
      disabled: slides.disabled,
      'aria-label': 'Decrease slides'
    }), slides, B('+', () => {
      if (!slides.disabled) {
        slides.value = Math.min(10, Number(slides.value) + 1);
        update();
      }
    }, 'btn sm', {
      disabled: slides.disabled,
      'aria-label': 'Increase slides'
    }), h('span', {
      class: 'gf-format-divider'
    }), h('span', {
      class: 'small'
    }, 'Image source'), h('div', {
      class: 'rd-tabs'
    }, [['ai', 'AI creates'], ['manual', 'My photos']].map(([v, label]) => B(label, () => {
      images.value = v;
      update();
      drawFormats();
    }, 'btn sm ' + (images.value === v ? 'on' : '')))));
  }
  function drawSchedule() {
    const ts = times.value.split(',').map(x => x.trim()).filter(Boolean);
    replace(scheduleSentence, mode === 'story' ? 'Continue ' : 'Create ', B(`${count.value || 0} ${mode === 'story' ? 'episode' : 'posts'}`, () => schedulePopover('count'), 'gf-inline'), mode === 'story' ? ' from ' : ' per account, from ', B(shortDate(start.value), () => schedulePopover('start'), 'gf-inline'), ' to ', B(shortDate(end.value), () => schedulePopover('end'), 'gf-inline'), ', posting at ', ...ts.map((time, index) => h('span', {
      class: 'gf-time-token'
    }, B(time.replace(':', '.'), () => schedulePopover('times'), 'gf-inline'), B('×', () => {
      times.value = ts.filter((_, i) => i !== index).join(', ');
      update();
    }, 'gf-remove-time', {
      'aria-label': 'Remove time ' + time
    }))), B('+ time', () => schedulePopover('times'), 'gf-inline'), ' WIB.');
  }
  function schedulePopover(focus) {
    const rhythm = h('p', {
        class: 'gf-rhythm'
      }),
      calendar = h('div', {
        class: 'gf-range-calendar'
      });
    let rangeStart = true,
      month = new Date((start.value || today()).slice(0, 7) + '-01T12:00:00+07:00');
    function refreshCalendar() {
      const key = new Intl.DateTimeFormat('sv-SE', {
          timeZone: 'Asia/Jakarta',
          year: 'numeric',
          month: '2-digit'
        }).format(month),
        first = new Date(key + '-01T12:00:00+07:00'),
        offset = (first.getUTCDay() + 6) % 7,
        days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
      replace(calendar, h('div', {
        class: 'gf-month-heading'
      }, B('‹', () => {
        month.setUTCMonth(month.getUTCMonth() - 1);
        refreshCalendar();
      }, 'btn ghost sm', {
        'aria-label': 'Previous month'
      }), h('b', {}, new Intl.DateTimeFormat('en-GB', {
        month: 'long',
        year: 'numeric',
        timeZone: 'Asia/Jakarta'
      }).format(month)), B('›', () => {
        month.setUTCMonth(month.getUTCMonth() + 1);
        refreshCalendar();
      }, 'btn ghost sm', {
        'aria-label': 'Next month'
      })), h('div', {
        class: 'gf-range-days'
      }, ...['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(x => h('span', {
        class: 'small muted'
      }, x)), ...Array.from({
        length: offset
      }, () => h('span')), ...Array.from({
        length: days
      }, (_, i) => {
        const date = key + '-' + String(i + 1).padStart(2, '0');
        return B(String(i + 1), () => {
          if (rangeStart) {
            start.value = date;
            if (end.value < date) end.value = date;
          } else end.value = date < start.value ? start.value : date;
          rangeStart = !rangeStart;
          update();
          refreshCalendar();
        }, 'gf-range-day ' + (date >= start.value && date <= end.value ? 'in-range ' : '') + (date === start.value || date === end.value ? 'endpoint' : ''), {
          disabled: date < today(),
          'aria-label': date,
          'aria-pressed': String(date >= start.value && date <= end.value)
        });
      })));
      rhythm.textContent = `${count.value} posts across ${Math.max(1, Math.round((Date.parse(end.value) - Date.parse(start.value)) / 864e5) + 1)} days per account. WIB slots: ${times.value}. Content is distributed evenly in order.`;
    }
    function presetRange(days, nextMonday = false) {
      let date = new Date(Date.now() + 7 * 3600000);
      if (nextMonday) {
        const delta = (8 - date.getUTCDay()) % 7 || 7;
        date.setUTCDate(date.getUTCDate() + delta);
      }
      start.value = date.toISOString().slice(0, 10);
      date.setUTCDate(date.getUTCDate() + days - 1);
      end.value = date.toISOString().slice(0, 10);
      month = new Date(start.value.slice(0, 7) + '-01T12:00:00+07:00');
      update();
      refreshCalendar();
    }
    const d = modal('Plan & schedule', h('div', {}, h('div', {
      class: 'gf-date-presets'
    }, B('Start now', () => {
      const next = new Date(Math.ceil((Date.now() + 6 * 60000) / 60000) * 60000 + 7 * 3600000);
      start.value = next.toISOString().slice(0, 10);
      if (end.value < start.value) end.value = start.value;
      times.value = [...new Set([next.toISOString().slice(11, 16), ...times.value.split(',').map(x => x.trim()).filter(x => /^([01]\d|2[0-3]):[0-5]\d$/.test(x))])].slice(0, 12).sort().join(', ');
      month = new Date(start.value.slice(0, 7) + '-01T12:00:00+07:00');
      update();
      refreshCalendar();
    }, 'btn sm'), B('2 weeks', () => presetRange(14), 'btn sm'), B('1 month', () => presetRange(30), 'btn sm'), B('This week', () => presetRange(Math.max(1, 7 - new Date(Date.now() + 7 * 3600000).getUTCDay())), 'btn sm'), B('Start next Monday', () => presetRange(14, true), 'btn sm')), h('div', {
      class: 'gf-schedule-fields'
    }, field('Posts per account', count), field('Start date (WIB)', start), field('End date (WIB)', end), field('Posting times (WIB, comma-separated)', times)), calendar, rhythm), [B('Apply', () => {
      update();
      d.close();
    }, 'btn primary')]);
    d.classList.add('gf-schedule-popover');
    refreshCalendar();
    ({
      count,
      start,
      end,
      times
    }[focus] || count).focus();
  }
  function update() {
    try {
      localStorage.setItem(draftKey, JSON.stringify({
        mode,
        brief: brief.value,
        start: start.value,
        end: end.value,
        count: count.value,
        times: times.value,
        slides: slides.value,
        format: format.value,
        images: images.value,
        captionLanguage: captionLanguage.value
      }));
    } catch {}
    const n = Math.max(0, Number(count.value) || 0),
      total = mode === 'story' ? selection.length ? n : 0 : n * selection.length,
      img = mode === 'story' || images.value === 'ai' ? total * Number(slides.value) : 0,
      days = Math.max(1, Math.round((Date.parse(end.value) - Date.parse(start.value)) / 864e5) + 1 || 1),
      missing = readyItems();
    submit.textContent = submitting ? 'Preparing session…' : mode === 'story' ? `Plan ${selection.length ? n : 0} episode` : `Generate ${total} posts`;
    submit.disabled = submitting || missing.length > 0;
    mobileSubmit.textContent = submit.textContent;
    mobileSubmit.disabled = submit.disabled;
    mobileMeta.textContent = `${total} posts · ${img} images · ${missing.length ? 'Not ready' : 'Ready'}`;
    teamSummary.textContent = `${preset} · ${mode === 'story' ? 8 : 5} agents`;
    briefCounter.textContent = brief.value.length.toLocaleString('en-GB') + ' / 10.000';
    replace(accountMeta, h('span', {}, `${selection.length} of ${scoped().length} selected`), mode === 'campaign' ? B('Select all', () => {
      selection = scoped().map(a => a.id);
      drawAccounts();
      drawStory();
      update();
    }, 'ui-text-button') : h('span', {}, 'One account per session'));
    for(const button of accountRow.querySelectorAll('[data-account-control^="chip-"]')){const id=button.dataset.accountControl.slice(5),account=state.accounts.find(a=>a.id===id),label=button.querySelector('span:not(.ui-avatar):not(.ui-dot)');if(account&&label)label.textContent='@'+account.username+(mode==='story'&&selection.includes(id)?' · Ep. '+(state.brandProfiles[id]?.next_episode||1):'');}
    const stepReady=[selection.length>0&&selected().every(a=>!!state.brandProfiles[a.id]?.seed),mode==='story'?!!state.brandProfiles[selected()[0]?.id]?.seed:!!brief.value.trim(),!missing.some(x=>/date|time|posts per account|slide|capacity/i.test(x.text))];composer.querySelectorAll('.rd-step-number').forEach((el,i)=>{replace(el,stepReady[i]?icon('check'):String(i+1));el.classList.toggle('done',stepReady[i]);});
    drawSchedule();
    const nextStory = storyInfo.querySelector('.gf-story-next');
    if (nextStory) {
      const profile = state.brandProfiles[selected()[0]?.id];
      nextStory.textContent = `This session continues episodes ${profile?.next_episode || 1}–${(profile?.next_episode || 1) + n - 1}. Storyteller uses saved story memory.`;
    }
    const a = selected()[0],
      p = state.brandProfiles[a?.id],
      episode = p?.next_episode || 1,
      summaryRow = (label, value, extra) => h('div', {
        class: 'gf-summary-row'
      }, h('span', {
        class: 'muted'
      }, label), h('b', {}, value), extra || null),
      check = text => h('p', {
        class: 'gf-check'
      }, icon('check'), text);
    replace(summary, h('div', {
      class: 'gf-summary-header'
    }, h('h2', {}, 'Session summary'), ui.chip(mode === 'story' ? 'Storyline' : 'Campaign', mode === 'story' ? 'concept' : 'info')), h('div', {
      class: 'rd-summary-total'
    }, total, h('span', {}, mode === 'story' ? 'episode' : 'posts')), h('p', {
      class: 'small muted'
    }, mode === 'story' ? a ? `@${a.username} · episode ${episode}–${episode + n - 1}` : 'Choose a story account' : `${selection.length} accounts × ${n} posts`), h('div', {
      class: 'gf-summary-rows'
    }, summaryRow('Format', mode === 'story' ? 'Sesuai alur cerita' : format.value === 'single' ? 'Single' : `Carousel · ${slides.value} slide`, h('span', {
      class: 'muted'
    }, `${img} images`)), summaryRow('Period', `${shortDate(start.value)} – ${shortDate(end.value)}`, h('span', {
      class: 'muted'
    }, `${days} days`)), summaryRow('Rhythm', `±${(n / days).toFixed(1)} posts/day/account`), summaryRow('Language', captionLanguage.selectedOptions[0]?.textContent), summaryRow('AI team', teamSummary.textContent, B('Change', teamDrawer, 'ui-text-button'))), mode === 'story' && a ? summaryRow('Assets', `${(p?.assets || []).filter(x => x.category === 'logo').length} logo · ${(p?.assets || []).filter(x => x.category === 'visual').length} references · ${(p?.assets || []).filter(x => x.category === 'product').length} products`, B('Manage', () => quickBrand(a), 'ui-text-button')) : null, mode === 'story' && a && !(p?.assets || []).some(x => x.category === 'product') ? h('div', {
      class: 'rd-callout warn small'
    }, 'No product photos yet. Storyteller cannot select specific products. ', B('Add product photos', () => quickBrand(a), 'ui-text-button')) : null, h('div',{class:'gf-brand-completeness'},selected().filter(a=>a.platform==='instagram').map(a=>{const ready=brandReadiness(state.brandProfiles[a.id]);return h('div',{class:'small'},B('@'+a.username+' · Brand Kit '+ready.completeness+'%',()=>quickBrand(a),'ui-text-button'),ready.ok&&ready.missing.length?h('span',{class:'muted'},' · Recommended: '+ready.missing.map(x=>x.label).join(', ')):null);})),h('h3', {}, missing.length ? 'What needs attention' : 'Ready to generate'), h('div', {
      class: 'rd-readiness'
    }, ...(missing.length ? missing.map(item => h('div', {
      class: 'rd-check-item warn'
    }, icon('warn'), h('span', {}, item.text), item.fix ? B('Lengkapi', item.fix, 'ui-text-button') : link('Open', item.url, 'ui-text-button'), item.account ? B('Lewati', () => {
      selection = selection.filter(id => id !== item.account.id);
      drawAccounts();
      update();
    }, 'ui-text-button') : null)) : [check(`${selection.length} accounts, all Brand Kits ready`), check(mode === 'story' ? 'Story foundation saved' : 'Direction written'), check(images.value === 'manual' && mode === 'campaign' ? 'Photos uploaded manually' : 'Agent team API keys connected')])), submit, h('p', {
      class: 'small muted gf-cta-note'
    }, mode === 'story' ? 'Plans and proposals appear in Drafts. No image charges apply until you approve the concept.' : 'Stage 1 creates concepts only. Images follow concept approval. Publishing requires final approval.'));
  }
  async function quickBrand(a) {
    let p = state.brandProfiles[a.id] || {
      seed: '',
      brand_notes: ''
    };
    const saveStatus = h('span', {
        class: 'small muted',
        role: 'status'
      }),
      seed = h('textarea', {
        rows: 6,
        maxlength: 10000,
        'aria-label': 'Fondasi brand'
      }, p.seed),
      notes = h('textarea', {
        rows: 4,
        maxlength: 5500,
        'aria-label': 'Aturan brand'
      }, (p.brand_notes || '').replace(/\n?Caption language:.*|\n?Emoji in captions:.*/g, '')),
      language = h('select', {
        'aria-label': 'Account caption language'
      }, [['id', 'Indonesian'], ['en', 'English'], ['mixed', 'Mixed']].map(([value, text]) => h('option', {
        value,
        selected: value === languageFor(a)
      }, text))),
      emoji = h('input', {
        type: 'checkbox',
        checked: !/Emoji in captions:\s*off/i.test(p.brand_notes || '')
      }),
      assets = h('div'),
      file = h('input', {
        type: 'file',
        accept: 'image/jpeg,image/png,video/mp4,video/quicktime',
        multiple: true,
        hidden: true
      }),
      category = h('select', {
        'aria-label': 'Asset category'
      }, [['logo', 'Logo'], ['visual', 'Visual references'], ['product', 'Product photos'], ['video', 'Video / Reel']].map(([value, text]) => h('option', {
        value
      }, text))),
      assetName = h('input', {
        'aria-label': 'Product or collection name',
        placeholder: 'Name / collection (optional)'
      });
    const saver = autosave(async () => {
      p = await api('PUT', `/v1/generator/accounts/${a.id}/brand`, {
        seed: seed.value,
        brand_notes: notes.value + `\nCaption language: ${language.value}\nEmoji in captions: ${emoji.checked ? 'on' : 'off'}`
      });
      state.brandProfiles[a.id] = p;
      update();
    }, {
      statusEl: saveStatus
    });
    openSavers.add(saver);
    for (const input of [seed, notes, language, emoji]) input.addEventListener('input', saver.schedule);
    function assetsDraw() {
      replace(assets, ...(p.assets || []).map(x => h('div', {
        class: 'rd-brand-thumb'
      }, x.media?.type === 'video' ? h('video', {
        src: x.media.url,
        controls: true
      }) : h('img', {
        src: x.media?.url,
        alt: x.name
      }), h('span', {}, x.name), ui.chip(x.category))), h('p', {
        class: 'small'
      }, `${p.assets?.length || 0} / 250 aset`));
    }
    file.onchange = async () => {
      await saver.flush();
      if (saver.error) return;
      let failed = 0;
      for (const f of file.files) {
        try {
          const m = await uploadFile(f, {
            inLibrary: false
          });
          p = await api('POST', `/v1/generator/accounts/${a.id}/assets`, {
            media_id: m.id,
            category: category.value,
            name: (assetName.value || f.name.replace(/\.[^.]+$/, '').replace(/^(WhatsApp|ChatGPT) Image\s*/i, '')).slice(0, 200),
            description: ''
          });
          state.brandProfiles[a.id] = p;
        } catch (e) {
          failed++;
          toast(errMsg(e), true);
        }
      }
      assetsDraw();
      toast(`${file.files.length - failed} assets added${failed ? ' · ' + failed + ' failed' : ''}`);
      file.value = '';
    };
    const stageTabs = h('div', {
        class: 'gf-brand-steps'
      }),
      identity = h('section', {
        class: 'gf-brand-page'
      }, field('What does this brand sell, and to whom?', seed), h('h3', {}, 'Tone bicara'), h('div', {
        class: 'gf-tone-chips'
      }, ['Ramah', 'Profesional', 'To the point', 'Playful', 'Mewah'].map(tone => B(tone, e => {
        const line = 'Tone: ' + tone;
        if (!notes.value.includes(line)) {
          notes.value += (notes.value ? '\n' : '') + line;
          saver.schedule();
        }
        toast('Tone ' + tone + ' added to brand rules.');
      }, 'btn sm'))), field('Caption language', language), h('label', {
        class: 'gf-notify'
      }, emoji, 'Allow emoji in captions')),
      rulesPage = h('section', {
        class: 'gf-brand-page'
      }, field('Rules: do / do not', notes), h('p', {
        class: 'small muted'
      }, 'Preserve the logo and product details. Describe colors, tone and claims to avoid.')),
      assetPage = h('section', {
        class: 'gf-brand-page'
      }, h('h3', {}, 'Logo, visual references & products'), assets, h('div', {
        class: 'row'
      }, category, assetName, file, B('Upload assets', () => file.click())));
    let brandStep = 0;
    const next = B('Next: Rules', () => {
      if (brandStep < 2) {
        brandStep++;
        drawBrandSteps();
      } else d.close();
    }, 'btn primary');
    function drawBrandSteps() {
      replace(stageTabs, ...['Identity', 'Rules', 'Assets'].map((label, i) => B(i + 1 + ' · ' + label, () => {
        brandStep = i;
        drawBrandSteps();
      }, 'btn ' + (i === brandStep ? 'on' : ''))));
      [identity, rulesPage, assetPage].forEach((el, i) => el.hidden = i !== brandStep);
      next.textContent = ['Next: Rules', 'Next: Assets', 'Done'][brandStep];
    }
    const d = modal('Quick Brand Kit · @' + a.username, h('div', {}, h('p', {
      class: 'muted small'
    }, 'The same foundation is saved to the account and reused in future sessions.'), stageTabs, identity, rulesPage, assetPage, saveStatus, h('p', {
      class: 'small muted'
    }, 'Complete it anytime in Companies & Accounts > Brand Kit.')), [link('Brand Kit details', '/accounts/' + a.id + '?tab=brand'), B('Later', () => d.close()), next]);
    d.classList.add('rd-drawer', 'gf-brand-drawer');
    drawBrandSteps();
    const close = d.close.bind(d);
    d.close = async () => {
      await saver.flush();
      if (saver.error) return;
      const sid=rememberedMemory(state.user.id,a.id);if(sid&&sid!==p.memory_session_id&&p.memory_sessions?.some(s=>s.id===sid)){p=await api('GET',`/v1/generator/accounts/${a.id}/brand?memory_session_id=`+encodeURIComponent(sid));state.brandProfiles[a.id]=p;}
      openSavers.delete(saver);
      close();
      drawAccounts();
      drawStory();
      update();
    };
    d.addEventListener('cancel', e => {
      e.preventDefault();
      d.close();
    });
    assetsDraw();
  }
  function storyBible(a, p) {
    const blocks = String(p.bible || p.seed || '').split(/\n(?=#{1,4}\s|Chapter\s|Bab\s|Brand [A-Z])/i).filter(x => x.trim());
    modal('Story Bible · @' + a.username, h('div', {
      class: 'rd-story-bible'
    }, blocks.map(x => {
      const lines = x.replace(/^#+\s*/, '').split('\n');
      return h('section', {
        class: 'panel'
      }, h('h3', {}, lines[0].replace(/[*#]/g, '')), h('p', {
        class: 'rd-prose'
      }, lines.slice(1).join('\n').replace(/^#+\s*/gm, '')));
    })), [B('Edit brand foundation', () => quickBrand(a))]);
  }
  async function teamDrawer() {
    const table = h('div', {
        class: 'rd-agent-table'
      }),
      description = h('p', {
        class: 'muted small'
      }, 'Every agent specializes in the selected account using its Brand Kit, references and content history. Model choices come from the provider catalog; availability depends on your API key and quota.'),
      draft = structuredClone(agents),
      activeRoles = mode === 'story' ? ['storyteller', 'manager', 'scheduler', 'concept', 'revision', 'visual', 'image', 'final'] : ['concept', 'revision', 'visual', 'image', 'final'];
    let selectedPreset = preset;
    const keys = new Set(config.keys.map(k => k.provider));
    function models(p, role) {
      return (config.providers[p]?.[role === 'image' ? 'imageModels' : 'textModels'] || []).filter(m => role === 'image' || !/transcribe|computer.?use|tts|embedding|image|imagen|nano.?banana|veo|audio/i.test(m.id + ' ' + m.name));
    }
    function applyPreset(name) {
      const textProvider = keys.has('openai') ? 'openai' : keys.has('anthropic') ? 'anthropic' : keys.has('gemini') ? 'gemini' : null,
        imageProvider = keys.has('openai') ? 'openai' : keys.has('gemini') ? 'gemini' : null;
      if (!textProvider) {
        toast('Add an API key for terlebih dahulu.', true);
        return;
      }
      for (const role of Object.keys(draft)) {
        const p = role === 'image' ? imageProvider : textProvider;
        if (!p) continue;
        const list = models(p, role);
        let model = list[0];
        if (name === 'Quality') model = list.find(x => /opus|pro\b|gpt-4\.1$/.test(x.id)) || list.at(-1) || model;else if (name === 'Economy') model = list.find(x => /mini|haiku|lite/.test(x.id)) || model;
        draft[role] = {
          ...draft[role],
          provider: p,
          model: model?.id || config.providers[p][role === 'image' ? 'imageModel' : 'textModel']
        };
      }
      selectedPreset = name;
      draw();
    }
    function draw() {
      replace(table, ...activeRoles.map(role => {
        const row = h('section', {
            class: 'rd-agent-row'
          }),
          provider = h('select', {
            'aria-label': 'Provider ' + roles[role]
          }, Object.entries(config.providers).filter(([p, c]) => role !== 'image' || c.image).map(([value, c]) => h('option', {
            value,
            selected: value === draft[role].provider
          }, c.name + (keys.has(value) ? '' : ' · no key saved')))),
          model = h('select', {
            'aria-label': 'Model ' + roles[role]
          }),
          instructions = h('textarea', {
            rows: 3,
            maxlength: 4000,
            'aria-label': 'Instructions ' + roles[role]
          }, draft[role].instructions);
        function drawModels() {
          const list = models(provider.value, role);
          if (!list.some(m => m.id === draft[role].model)) {
            if(role!=='image'&&/transcribe|computer.?use|tts|embedding|image|imagen|nano.?banana|veo|audio/i.test(draft[role].model))draft[role].model=list[0]?.id||'';
            else list.push({id:draft[role].model,name:draft[role].model+' · saved'});
          }
          const groups=[['Disarankan',list.slice(0,3)],['Model lain yang sesuai',list.slice(3)]];
          replace(model,...groups.filter(([,items])=>items.length).map(([label,items])=>h('optgroup',{label},items.map(m=>h('option',{value:m.id,selected:m.id===draft[role].model},m.name)))));

        }
        provider.onchange = () => {
          draft[role].provider = provider.value;
          draft[role].model = models(provider.value, role)[0]?.id || '';
          selectedPreset = 'Kustom';
          drawModels();
        };
        model.onchange = () => {
          draft[role].model = model.value;
          selectedPreset = 'Kustom';
        };
        instructions.oninput = () => draft[role].instructions = instructions.value;
        drawModels();
        row.append(h('h3', {}, roles[role]), provider, model, h('details', {}, h('summary', {}, 'Agent instructions'), instructions));
        return row;
      }));
    }
    const d = modal('Agent team & models', h('div', {}, h('div', {
      class: 'gf-presets'
    }, ['Economy', 'Balanced', 'Quality'].map(n => B(h('span', {}, h('b', {}, n), h('small', {}, {
      Economy: 'Lightweight models for ideas and experiments.',
      Balanced: 'Detailed concepts with lightweight review. Recommended.',
      Quality: 'Higher-quality models at each stage. Slower.'
    }[n])), () => {
      applyPreset(n);
      d.querySelectorAll('.gf-presets .btn').forEach((el, i) => el.classList.toggle('on', ['Economy', 'Balanced', 'Quality'][i] === n));
    }, 'btn ' + (n === selectedPreset ? 'on' : '')))), description, table, keys.has('gemini') ? B('Refresh Gemini models', async () => {
      const result = await api('GET', '/v1/generator/providers/gemini/models?refresh=true');
      config.providers.gemini = {
        ...config.providers.gemini,
        ...result
      };
      draw();
    }) : null), [B('View as canvas',()=>{const canvas=workflowCanvas({h,icon,userId:state.user.id,nodes:activeRoles.map((role,i)=>({id:role,title:roles[role],subtitle:draft[role].provider+' / '+draft[role].model,x:(i%3)*300,y:Math.floor(i/3)*230,width:260,content:h('p',{},draft[role].instructions||'Default instructions')})),edges:activeRoles.slice(1).map((role,i)=>({from:activeRoles[i],to:role}))});const view=modal('Agent workflow',canvas.element||canvas);view.classList.add('gf-canvas-dialog');view.addEventListener('close',()=>canvas.dispose(),{once:true});}),B('Save as default', async () => {
      await api('PUT', '/v1/generator/settings', {
        agents: draft
      });
      agents = structuredClone(draft);
      preset = selectedPreset;
      update();
      toast('Default agent team saved.');
    }), B('Apply', () => {
      agents = structuredClone(draft);
      preset = selectedPreset;
      d.close();
      update();
    }, 'btn primary')]);
    d.classList.add('rd-drawer', 'gf-agent-drawer');
    draw();
  }
  async function preflight(n, chosen) {
    return new Promise(resolve => {
      let accepted = false;
      const notify = h('input', {
          type: 'checkbox',
          checked: notifyReady
        }),
        stage = (name, amount, when, tone) => h('tr', {}, h('td', {}, name), h('td', {}, amount), h('td', {}, ui.chip(when, tone))),
        d = modal(mode === 'story' ? `Plan ${n} episodes?` : `Create ${n * chosen.length} content ideas?`, h('div', {}, ui.chip(mode === 'story' ? 'Storyline' : 'Campaign', 'info'), h('table', {
          class: 'gf-stage-table'
        }, h('thead', {}, h('tr', {}, ['Stage', 'Count', 'When'].map(x => h('th', {}, x)))), h('tbody', {}, stage(mode === 'story' ? 'Storyteller + Manager + Scheduler' : 'Concept + caption + review', `${n * chosen.length} posts`, 'Now', 'ok'), stage('Images · ' + agents.image.model, `${n * chosen.length * Number(slides.value)} images`, 'After concept approval'), stage('Publish', '0', 'Only after your approval'))), h('div', {
          class: 'rd-callout'
        }, 'Charges apply to your personal API key at provider rates. Story stages may make one additional repair call if their response is invalid. Images require separate approval and cost confirmation. Nothing is published automatically.'), h('details', {}, h('summary', {}, 'Current models'), h('ul', {}, (mode === 'story' ? ['storyteller', 'manager', 'scheduler'] : ['concept', 'revision']).map(role => h('li', {}, roles[role] + ' · ' + agents[role].provider + ' / ' + agents[role].model)))), h('label', {
          class: 'gf-notify'
        }, notify, 'Notify me in the app when concepts are ready to review')), [B('Back', () => d.close()), B('Start session', () => {
          accepted = true;
          notifyReady = notify.checked;
          d.close();
        }, 'btn primary')]);
      d.classList.add('gf-preflight');
      d.addEventListener('close', () => resolve(accepted), {
        once: true
      });
    });
  }
  async function generate() {
    if (submitting || readyItems().length) return;
    const n = Number(count.value),
      chosen = selected(),
      ts = times.value.split(',').map(x => x.trim()).filter(Boolean),
      manual = mode === 'campaign' && images.value === 'manual';
    if (!manual && !(await preflight(n, chosen))) return;
    submitting = true;
    update();
    replace(error);
    const signature = JSON.stringify({
      selection,
      brief: brief.value,
      mode,
      n,
      start: start.value,
      end: end.value,
      ts,
      slides: slides.value,
      manual,
      agents,
      language: captionLanguage.value
    });
    if (!batch || batch.signature !== signature) batch = {
      signature,
      id: crypto.randomUUID(),
      results: new Map()
    };
    let failures = [];
    try {
      for (let i = 0; i < chosen.length; i++) {
        const a = chosen[i];
        if (batch.results.has(a.id)) {
          const existing = batch.results.get(a.id);
          if (!manual && !existing.story && !existing.started) {
            try {
              await api('POST', `/v1/generator/plans/${existing.id}/start`, {
                confirm_cost: true
              });
              existing.started = true;
            } catch (e) {
              failures.push({
                a,
                e
              });
            }
          }
          continue;
        }
        const p = state.brandProfiles[a.id] || {},
          rules = instructionsFor(a),
          configured = Object.fromEntries(Object.entries(agents).map(([role, v]) => [role, {
            ...v,
            instructions: (rules + '\n' + v.instructions).slice(0, 4000)
          }]));
        try {
          if (mode === 'story') {
            const result = await api('POST', '/v1/generator/story-jobs', {
              request_id: batch.id + '-' + i,
              account_id: a.id,
              memory_session_id: state.brandProfiles[a.id]?.memory_session_id,
              direction: (brief.value + '\n' + rules).trim(),
              content_count: n,
              slide_count: Number(slides.value),
              start_date: start.value,
              end_date: end.value,
              times: ts,
              agents: configured,
              produce_media: false,
              confirm_cost: true
            });
            batch.results.set(a.id, {
              ...result,
              story: true
            });
            latestJobs.push({
              ...result,
              account_id: a.id
            });
          } else {
            const assets = ['logo', 'product', 'visual', 'visual'].reduce((out, category) => {
              const x = (p.assets || []).find(x => x.category === category && x.media?.type === 'image' && !out.some(a => a.id === x.id));
              if (x) out.push(x);
              return out;
            }, []);
            const result = await api('POST', '/v1/generator/plans', {
              request_id: batch.id + '-' + i,
              account_ids: [a.id],
              brief: (brief.value + '\n' + rules).slice(0, 10000),
              content_count: n,
              slide_count: Number(slides.value),
              start_date: start.value,
              end_date: end.value,
              times: ts,
              manual,
              produce_media: false,
              agents: configured,
              ...(!manual ? {
                confirm_cost: true
              } : {}),
              reference_media_ids: assets.map(x => x.media_id),
              reference_roles: Object.fromEntries(assets.map(x => [x.media_id, x.category])),
              reference_notes: (p.brand_notes || '').slice(0, 6000)
            });
            batch.results.set(a.id, {
              ...result,
              started: manual
            });
            if (!manual) {
              await api('POST', `/v1/generator/plans/${result.id}/start`, {
                confirm_cost: true
              });
              batch.results.get(a.id).started = true;
            }
          }
        } catch (e) {
          failures.push({
            a,
            e
          });
        }
      }
      if (mode === 'campaign' && batch.results.size) {
        try {
          const ids = [...batch.results.values()].map(r => r.id),
            groups = readSessionGroups(state.user.id).filter(g => !g.ids.some(id => ids.includes(id)));
          groups.push({
            ids,
            created_at: new Date().toISOString()
          });
          localStorage.setItem('lrm.session-groups.' + state.user.id, JSON.stringify(groups.slice(-100)));
        } catch {}
      }
      if (failures.length) replace(error, h('div', {
        class: 'rd-callout warn'
      }, h('b', {}, `${[...batch.results.values()].filter(r => r.started || r.story || manual).length} accounts ready · ${failures.length} need retry`), ...failures.map(({
        a,
        e
      }) => h('p', {}, '@' + a.username + ': ' + errMsg(e))), B('Retry failed items', generate)));else {
        const result=[...batch.results.values()][0];
        if(result?.id){
          toast(mode==='story'?'Your story session is preparing in Drafts.':manual?'Plan created. Upload media in Drafts.':'Session started. Review concepts in Drafts.');
          go('/generator/drafts/'+encodeURIComponent(result.id));
          return;
        }
      }
      await refresh();
    } finally {
      submitting = false;
      update();
    }
  }
  function liveCard(s) {
    const failed = s.runs.filter(r => r.status === 'failed'),
      concepts = s.runs.filter(r => r.status === 'concept_review'),
      ready = s.runs.filter(r => ['review', 'approved', 'drafted'].includes(r.status));
    const steps = ['concept', 'revision', 'visual', 'image', 'final'].map(role => {
      const done = s.runs.filter(r => r.steps?.[role]?.status === 'done').length,
        active = s.runs.some(r => r.steps?.[role]?.status === 'running'),
        bad = failed.some(r => r.steps?.[role]?.status === 'failed');
      return {
        label: roles[role] + (done ? ' · ' + done + '/' + s.runs.length : ''),
        status: bad ? 'failed' : active ? 'running' : done === s.runs.length && done ? 'done' : 'waiting'
      };
    });
    return h('section', {
      class: 'panel gf-live-card'
    }, h('div', {
      class: 'gf-live-heading'
    }, ui.chip(failed.length ? 'Stopped' : 'Creating', failed.length ? 'bad' : 'info'), h('h2', {}, s.title), h('span', {
      class: 'small muted'
    }, `${new Set(s.runs.flatMap(r => (r.targets || []).map(target => target.account_id))).size} accounts · ${s.runs.length} posts`)), ui.progressPipeline(steps), failed.length ? h('div', {
      class: 'rd-callout warn'
    }, h('b', {}, `${failed.length} posts failed. ${s.runs.length - failed.length} other posts are unaffected.`), errorBox(failed[0].error || 'Provider stage is incomplete. Check the model and quota, then retry.')) : null, h('div', {
      class: 'gf-live-actions'
    }, concepts.length ? link(`Review ${concepts.length} concepts now`, '/generator/drafts/' + s.id, 'ui-text-button') : ready.length ? link(`Review ${ready.length} successful items`, '/generator/drafts/' + s.id, 'ui-text-button') : h('span', {
      class: 'small muted'
    }, 'Progress updates automatically.'), h('span', {
      class: 'gf-grow'
    }), failed.length ? B('Try again ' + failed.length, async () => {
      if (!(await ui.confirmDialog({
        title: `Retry ${failed.length} posts?`,
        tone: 'cost',
        body: 'Only failed content is retried. Subsequent stages may use your personal API key.'
      }))) return;
      for (const r of failed) await api('POST', `/v1/generator/runs/${r.id}/retry`);
      await refresh();
    }) : B('Pause', async () => {
      if (!(await ui.confirmDialog({
        title: 'Stop this session?',
        tone: 'danger',
        body: 'Charges for stages already run cannot be reversed.',
        confirmLabel: 'Stop'
      }))) return;
      for (const r of s.runs.filter(r => ['queued', 'running'].includes(r.status))) await api('DELETE', `/v1/generator/runs/${r.id}`);
      await refresh();
    }), link('Open session', '/generator/drafts/' + s.id, 'btn primary')));
  }
  async function refresh() {
    if (stopped || pollBusy) return;
    pollBusy = true;
    try {
      const old = sessions;
      sessions = await workspace.data();
      const account = selected()[0];
      if (mode === 'story' && account) {
        const response = await api('GET', `/v1/generator/accounts/${account.id}/story-jobs`);
        latestJobs = response.data;
      }
      if (stopped) return;
      const draftNav=root.querySelector('.pagehead a');if(draftNav){const waiting=sessions.reduce((n,s)=>n+s.runs.filter(r=>['concept_review','review'].includes(r.status)).length,0);replace(draftNav,'Drafts',waiting?ui.chip(waiting+' need review','warn'):null);}
      for (const s of sessions) {
        const ready = s.runs.filter(r => ['concept_review', 'review'].includes(r.status)).length,
          prior = old.find(x => x.id === s.id);
        if (notifyReady && prior && ready > prior.runs.filter(r => ['concept_review', 'review'].includes(r.status)).length && !notified.has(s.id)) {
          notified.add(s.id);
          toast('Session concepts are ready to review in Drafts.');
        }
      }
      replace(running, ...latestJobs.filter(j => ['queued', 'running', 'failed'].includes(j.status)).map(j => h('section', {
        class: 'panel rd-live-session gf-live-card'
      }, h('h2', {}, (j.memory_session_title||'Storyline session')+' · @' + (state.accounts.find(a => a.id === j.account_id)?.username || '')), ui.progressPipeline(['storyteller', 'manager', 'scheduler'].map(role => ({
        label: roles[role],
        status: j.steps?.[role]?.status || 'waiting'
      }))), j.error ? errorBox(j.error) : null, j.status === 'failed' ? B('Retry session', async () => {
        if (!(await ui.confirmDialog({
          title: 'Retry Storyline?',
          tone: 'cost',
          body: 'Unfinished stages will be retried using your personal API key.'
        }))) return;
        await api('POST', `/v1/generator/story-jobs/${j.id}/retry`, {
          agents,
          confirm_cost: true
        });
        await refresh();
      }) : B('Stop', async () => {
        if (await ui.confirmDialog({
          title: 'Stop this story session?',
          tone: 'danger',
          body: 'Charges for stages already run cannot be reversed.',
          confirmLabel: 'Stop'
        })) {
          await api('DELETE', `/v1/generator/story-jobs/${j.id}`);
          await refresh();
        }
      }), j.plan_id ? link('Open proposal', '/generator/drafts/' + j.plan_id) : null)), ...sessions.filter(s => workspace.stateOf(s) === 'running' || s.runs.some(r => r.status === 'failed' && Date.parse(r.updated_at || r.created_at) > Date.now() - 864e5)).slice(0, 2).map(liveCard));
      replace(recent, h('section', {
        class: 'gf-session-recent'
      }, h('header', {}, h('h2', {}, 'Recent sessions'), link('All sessions in Drafts', '/generator/drafts', 'ui-text-button')), ...latestJobs.filter(j => j.status === 'review' && j.plan_id).map(j => link('Review Storyline proposal', '/generator/drafts/' + j.plan_id, 'btn primary')), ...sessions.slice(0, 3).map(s => h('div', {
        class: 'gf-recent-row'
      }, ui.chip({
        action: 'Needs review',
        running: 'Creating',
        done: 'Done',
        plan: 'Plan',
        expired: 'Expired'
      }[workspace.stateOf(s)] || 'Needs review', workspace.stateOf(s) === 'done' ? 'ok' : workspace.stateOf(s)==='action'?'warn':'info'), h('b', {}, s.title), h('span', {
        class: 'small muted'
      }, `${new Set(s.runs.flatMap(r => (r.targets || []).map(target => target.account_id))).size} accounts · ${s.runs.length} posts`), link('Open', '/generator/drafts/' + s.id, 'btn sm'))), !sessions.length ? h('p', {
        class: 'muted small',
        style: 'padding:16px'
      }, 'No sessions yet. Your first session will appear here.') : null));
    } catch (e) {
      if (!stopped) replace(error, errorBox(e));
    } finally {
      pollBusy = false;
    }
  }
  const step = (number, title, body, aside) => h('section', {
    class: 'rd-step'
  }, h('span', {
    class: 'rd-step-number'
  }, number), h('div', {
    class: 'gf-step-body'
  }, h('div', {
    class: 'gf-step-heading'
  }, h('h2', {}, number + ' · ' + title), aside), body));
  const quickIdeas = h('div', {
    class: 'gf-brief-footer'
  }, h('div', {
    class: 'row rd-quick-ideas'
  }, h('span', {
    class: 'small muted'
  }, 'Quick ideas:'), [['Promo','Promotion'], ['Edukasi produk','Product education'], ['Testimoni','Testimonials'], ['Di balik layar','Behind the scenes']].map(([kind,x]) => B(x, async () => {
    const ids=selected().map(a=>a.id);if(!ids.length){toast('Choose accounts first so ideas reflect their Brand Kits and history.',true);return;}
    if(!await ui.confirmDialog({title:'Create prompt '+x+'?',tone:'cost',body:'Conceptor will use your personal API key to read Brand Kits, story memory and previous sessions, then prepare a detailed prompt. No images or published posts are created yet.',confirmLabel:'Create prompt'}))return;
    const before=brief.value;quickIdeas.inert=true;quickIdeas.setAttribute('aria-busy','true');const progress=h('span',{class:'small muted',role:'status'},'Conceptor is preparing a prompt…');quickIdeas.append(progress);
    try{const result=await api('POST','/v1/generator/quick-idea',{account_ids:ids,kind,direction:before,agents,memory_sessions:Object.fromEntries(ids.map(id=>[id,state.brandProfiles[id]?.memory_session_id])),confirm_cost:true});
      if(stopped)return;
      if(brief.value!==before||JSON.stringify(selected().map(a=>a.id))!==JSON.stringify(ids)){const text=h('textarea',{rows:12,'aria-label':'Prompt Conceptor'},result.prompt);const d=modal('Prompt '+x,h('div',{},h('p',{},'Direction or account selection changed during generation. Review the prompt before using it.'),text),[B('Use prompt',()=>{brief.value=text.value;d.close();update();})]);}
      else{brief.value=result.prompt;brief.focus();update();toast('A detailed Conceptor prompt is ready. You can edit it.');}
    }catch(e){toast(errMsg(e),true);}finally{quickIdeas.inert=false;quickIdeas.removeAttribute('aria-busy');progress.remove();}
  }, 'btn sm'))), briefCounter);
  const composer = h('section', {
    class: 'panel rd-generator-composer'
  }, step('1', 'Which accounts?', h('div', {}, accountRow, h('p', {
    class: 'small muted gf-account-hint'
  }, h('span', {
    class: 'ui-dot warn'
  }), ' = Brand Kit missing. See the session summary for details and fixes.')), accountMeta), step('2', 'What would you like to create?', h('div', {}, storyInfo, field('Session direction', brief), quickIdeas, formatOptions, field('Caption language', captionLanguage)), modeControl), step('3', 'When should it post?', h('div', {}, scheduleSentence, h('p', {
    class: 'small muted'
  }, 'Distribution follows the selected date range and slots. Times are not based on account performance analysis.'))));
  format.classList.add('gf-native-control');
  images.classList.add('gf-native-control');
  slides.classList.add('gf-slide-count');
  formatOptions.append(format, images, formatSegments);
  drawFormats();
  const root = h('div', {
    class: 'rd-page gf-generator'
  }, h('div', {
    class: 'pagehead'
  }, h('div', {}, h('h1', {}, 'Content Generator'), h('p', {}, 'Choose accounts and write a direction. AI prepares drafts for your review.')), link('Drafts', '/generator/drafts', 'btn')), running, error, h('div', {
    class: 'rd-generator-layout'
  }, composer, summary), h('div', {
    class: 'rd-advanced'
  }, B('Agent team & models · Advanced', teamDrawer, 'ui-text-button'), teamSummary), recent, mobileFooter);
  drawAccounts();
  drawStory();
  update();
  await refresh();
  let timer;
  function schedulePoll(){timer=setTimeout(async()=>{await refresh();if(!stopped)schedulePoll();},sessions.some(s=>s.runs.some(r=>['queued','running'].includes(r.status)))||latestJobs.some(j=>['queued','running'].includes(j.status))?2500:10000);}
  schedulePoll();
  return {
    element: root,
    dispose: async () => {
      if(quickIdeas.getAttribute('aria-busy')==='true')throw new Error('Wait for Conceptor to finish the prompt.');
      stopped = true;
      clearTimeout(timer);
      for (const saver of openSavers) {
        await saver.flush();
        if (saver.error) throw new Error('Brand Kit has not been saved. Try saving again.');
      }
      document.querySelectorAll('dialog.rd-drawer[open]').forEach(d => d.close());
    }
  };
}
