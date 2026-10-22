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
    preset = 'Seimbang',
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
      placeholder: 'Misalnya: campaign perawatan kuku menjelang akhir tahun untuk pelanggan baru.',
      'aria-label': 'Arahan konten',
      oninput: update
    }),
    captionLanguage = h('select', {
      'aria-label': 'Bahasa caption',
      onchange: update
    }, [['account', 'Sesuai Brand Kit'], ['id', 'Bahasa Indonesia'], ['en', 'English'], ['mixed', 'Campuran']].map(([value, text]) => h('option', {
      value
    }, text))),
    format = h('select', {
      'aria-label': 'Format konten',
      onchange: () => {
        slides.disabled = format.value === 'single';
        if (slides.disabled) slides.value = 1;else if (Number(slides.value) < 2) slides.value = 3;
        update();
      }
    }, [['single', 'Foto tunggal'], ['carousel', 'Carousel']].map(([value, text]) => h('option', {
      value
    }, text))),
    slides = h('input', {
      type: 'number',
      value: 1,
      min: 1,
      max: 10,
      disabled: true,
      'aria-label': 'Slide per konten',
      oninput: update
    }),
    images = h('select', {
      'aria-label': 'Sumber gambar',
      onchange: update
    }, h('option', {
      value: 'ai'
    }, 'AI membuat gambar'), h('option', {
      value: 'manual'
    }, 'Saya unggah foto sendiri'));
  const start = h('input', {
      type: 'date',
      value: new Date(Date.now() + 864e5 + 7 * 3600000).toISOString().slice(0, 10),
      min: new Date(Date.now() + 864e5 + 7 * 3600000).toISOString().slice(0, 10),
      'aria-label': 'Dari tanggal WIB',
      oninput: update
    }),
    end = h('input', {
      type: 'date',
      value: new Date(Date.now() + 14 * 864e5 + 7 * 3600000).toISOString().slice(0, 10),
      'aria-label': 'Sampai tanggal WIB',
      oninput: update
    }),
    count = h('input', {
      type: 'number',
      value: 12,
      min: 1,
      max: 30,
      'aria-label': 'Jumlah konten per akun',
      oninput: update
    }),
    times = h('input', {
      value: '12:15, 19:15',
      'aria-label': 'Jam posting WIB',
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
    'aria-label': 'Perusahaan',
    onchange: e => {
      company = e.target.value;
      selection = [];
      drawAccounts();
      update();
    }
  }, h('option', {
    value: ''
  }, 'Semua perusahaan'), state.companies.map(c => h('option', {
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
    replace(modeControl, ...[['campaign', 'Campaign baru'], ['story', 'Lanjutkan Storyline']].map(([id, text]) => B(text, () => {
      mode = id;
      selection = selection.slice(0, mode === 'story' ? 1 : selection.length);
      brief.value = '';
      brief.placeholder = mode === 'story' ? 'Opsional: arah sesi ini. Kosongkan untuk melanjutkan fondasi dan memori cerita.' : 'Misalnya: campaign produk baru, manfaat dan alasan pelanggan perlu mencobanya.';
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
      }, p?.seed ? h('div', {}, memorySessionPicker(ctx,p,next=>{state.brandProfiles[a.id]=next;drawStory();update();}),h('b', {}, `@${a.username} · Episode berikutnya ${p.next_episode || 1}`), h('p', {}, 'Cerita melanjutkan memori sesi yang dipilih. Brand Kit akun tetap menjadi fondasi bersama.'), B('Lihat Story Bible', () => storyBible(a, p), 'btn ghost sm'), storyArc(p), h('p', {
        class: 'gf-story-next'
      }, `Sesi ini melanjutkan episode ${p.next_episode || 1}–${(p.next_episode || 1) + Math.max(1, Number(count.value) || 1) - 1}. Storyteller menggunakan memori cerita yang tersimpan.`)) : h('p', {}, 'Pilih satu akun dan lengkapi fondasi brand untuk melanjutkan cerita.')));
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
    return `Write captions and on-image text in ${lang}. ${/Emoji in captions:\s*off/i.test(p?.brand_notes || '') ? 'Do not use emoji in captions, titles or on-image text.' : 'Emoji in captions are allowed when appropriate.'} Preserve every logo and product detail exactly; never redraw or alter them.`;
  }
  function readyItems() {
    const items = [];
    if(mode==='story'&&selected()[0]&&!state.brandProfiles[selected()[0].id]?.memory_session_id)items.push({text:'Buat sesi memori cerita terlebih dahulu',fix:()=>storyInfo.querySelector('button')?.focus()});
    if (!selection.length) items.push({
      text: 'Pilih minimal satu akun.',
      fix: () => accountRow.scrollIntoView({
        behavior: 'smooth'
      })
    });
    for (const a of selected()) {
      if (a.platform === 'instagram' && !brandReadiness(state.brandProfiles[a.id]).ok) items.push({
        text: `@${a.username}: fondasi Brand Kit belum diisi.`,
        fix: () => quickBrand(a),
        account: a
      });
      if (a.status && a.status !== 'active') items.push({
        text: `@${a.username}: sambungkan ulang akun.`,
        url: '/accounts/' + a.id
      });
    }
    if (mode === 'campaign' && !brief.value.trim()) items.push({
      text: 'Tulis arahan campaign.',
      fix: () => brief.focus()
    });
    const activeRoles = mode === 'story' ? ['storyteller', 'manager', 'scheduler'] : images.value === 'manual' ? [] : ['concept', 'revision'];
    for (const p of [...new Set(activeRoles.map(role => agents[role]?.provider))]) if (p && !config.keys.some(k => k.provider === p)) items.push({
      text: `Tambahkan API key ${p} di pengaturan pribadi.`,
      url: '/settings?from=generator'
    });
    const n = Number(count.value);
    if (!Number.isInteger(n) || n < 1 || n > 30) items.push({
      text: 'Pilih 1–30 konten per akun.',
      fix: () => count.focus()
    });
    if (Number(slides.value) < 1 || Number(slides.value) > 10) items.push({
      text: 'Pilih 1–10 slide.',
      fix: () => slides.focus()
    });
    if (!start.value || start.value <= today() || !end.value || end.value < start.value) items.push({
      text: 'Tanggal mulai minimal besok dan akhir tidak boleh lebih awal.',
      fix: () => start.focus()
    });
    if (Date.parse(end.value) - Date.parse(start.value) > 90 * 864e5) items.push({
      text: 'Rentang jadwal maksimal 90 hari.',
      fix: () => end.focus()
    });
    const ts = times.value.split(',').map(s => s.trim()).filter(Boolean);
    if (!ts.length || ts.length > 12 || ts.some(s => !/^([01]\d|2[0-3]):[0-5]\d$/.test(s))) items.push({
      text: 'Isi jam WIB HH:MM, pisahkan koma (maksimal 12 jam).',
      fix: () => times.focus()
    });
    return items;
  }
  function shortDate(value) {
    return value ? new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      timeZone: 'Asia/Jakarta'
    }).format(new Date(value + 'T12:00:00+07:00')) : 'Pilih tanggal';
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
      'aria-label': 'Kurangi slide'
    }), slides, B('+', () => {
      if (!slides.disabled) {
        slides.value = Math.min(10, Number(slides.value) + 1);
        update();
      }
    }, 'btn sm', {
      disabled: slides.disabled,
      'aria-label': 'Tambah slide'
    }), h('span', {
      class: 'gf-format-divider'
    }), h('span', {
      class: 'small'
    }, 'Sumber gambar'), h('div', {
      class: 'rd-tabs'
    }, [['ai', 'AI membuat'], ['manual', 'Foto saya']].map(([v, label]) => B(label, () => {
      images.value = v;
      update();
      drawFormats();
    }, 'btn sm ' + (images.value === v ? 'on' : '')))));
  }
  function drawSchedule() {
    const ts = times.value.split(',').map(x => x.trim()).filter(Boolean);
    replace(scheduleSentence, mode === 'story' ? 'Lanjutkan ' : 'Buat ', B(`${count.value || 0} ${mode === 'story' ? 'episode' : 'konten'}`, () => schedulePopover('count'), 'gf-inline'), mode === 'story' ? ' dari ' : ' per akun, dari ', B(shortDate(start.value), () => schedulePopover('start'), 'gf-inline'), ' sampai ', B(shortDate(end.value), () => schedulePopover('end'), 'gf-inline'), ', tayang jam ', ...ts.map((time, index) => h('span', {
      class: 'gf-time-token'
    }, B(time.replace(':', '.'), () => schedulePopover('times'), 'gf-inline'), B('×', () => {
      times.value = ts.filter((_, i) => i !== index).join(', ');
      update();
    }, 'gf-remove-time', {
      'aria-label': 'Hapus jam ' + time
    }))), B('+ jam', () => schedulePopover('times'), 'gf-inline'), ' WIB.');
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
        'aria-label': 'Bulan sebelumnya'
      }), h('b', {}, new Intl.DateTimeFormat('id-ID', {
        month: 'long',
        year: 'numeric',
        timeZone: 'Asia/Jakarta'
      }).format(month)), B('›', () => {
        month.setUTCMonth(month.getUTCMonth() + 1);
        refreshCalendar();
      }, 'btn ghost sm', {
        'aria-label': 'Bulan berikutnya'
      })), h('div', {
        class: 'gf-range-days'
      }, ...['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map(x => h('span', {
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
          disabled: date <= today(),
          'aria-label': date,
          'aria-pressed': String(date >= start.value && date <= end.value)
        });
      })));
      rhythm.textContent = `${count.value} konten dalam ${Math.max(1, Math.round((Date.parse(end.value) - Date.parse(start.value)) / 864e5) + 1)} hari per akun. Slot WIB: ${times.value}. Distribusi merata mengikuti urutan konten.`;
    }
    function presetRange(days, nextMonday = false) {
      let date = new Date(Date.now() + 864e5 + 7 * 3600000);
      if (nextMonday) {
        const delta = (8 - date.getUTCDay()) % 7;
        date.setUTCDate(date.getUTCDate() + delta);
      }
      start.value = date.toISOString().slice(0, 10);
      date.setUTCDate(date.getUTCDate() + days - 1);
      end.value = date.toISOString().slice(0, 10);
      month = new Date(start.value.slice(0, 7) + '-01T12:00:00+07:00');
      update();
      refreshCalendar();
    }
    const d = modal('Rencana & jadwal', h('div', {}, h('div', {
      class: 'gf-date-presets'
    }, B('2 minggu', () => presetRange(14), 'btn sm'), B('1 bulan', () => presetRange(30), 'btn sm'), B('Minggu ini', () => presetRange(Math.max(1, 7 - new Date(Date.now() + 7 * 3600000).getUTCDay())), 'btn sm'), B('Mulai Senin depan', () => presetRange(14, true), 'btn sm')), h('div', {
      class: 'gf-schedule-fields'
    }, field('Konten per akun', count), field('Dari tanggal (WIB)', start), field('Sampai tanggal (WIB)', end), field('Jam posting (WIB, pisahkan koma)', times)), calendar, rhythm), [B('Terapkan', () => {
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
    submit.textContent = submitting ? 'Menyiapkan sesi…' : mode === 'story' ? `Rencanakan ${selection.length ? n : 0} episode` : `Generate ${total} konten`;
    submit.disabled = submitting || missing.length > 0;
    mobileSubmit.textContent = submit.textContent;
    mobileSubmit.disabled = submit.disabled;
    mobileMeta.textContent = `${total} konten · ${img} gambar · ${missing.length ? 'Belum siap' : 'Siap'}`;
    teamSummary.textContent = `${preset} · ${mode === 'story' ? 8 : 5} agen`;
    briefCounter.textContent = brief.value.length.toLocaleString('id-ID') + ' / 10.000';
    replace(accountMeta, h('span', {}, `${selection.length} dari ${scoped().length} dipilih`), mode === 'campaign' ? B('Pilih semua', () => {
      selection = scoped().map(a => a.id);
      drawAccounts();
      drawStory();
      update();
    }, 'ui-text-button') : h('span', {}, 'Satu akun per sesi'));
    for(const button of accountRow.querySelectorAll('[data-account-control^="chip-"]')){const id=button.dataset.accountControl.slice(5),account=state.accounts.find(a=>a.id===id),label=button.querySelector('span:not(.ui-avatar):not(.ui-dot)');if(account&&label)label.textContent='@'+account.username+(mode==='story'&&selection.includes(id)?' · Ep. '+(state.brandProfiles[id]?.next_episode||1):'');}
    const stepReady=[selection.length>0&&selected().every(a=>!!state.brandProfiles[a.id]?.seed),mode==='story'?!!state.brandProfiles[selected()[0]?.id]?.seed:!!brief.value.trim(),!missing.some(x=>/tanggal|jam|konten per akun|slide/.test(x.text))];composer.querySelectorAll('.rd-step-number').forEach((el,i)=>{replace(el,stepReady[i]?icon('check'):String(i+1));el.classList.toggle('done',stepReady[i]);});
    drawSchedule();
    const nextStory = storyInfo.querySelector('.gf-story-next');
    if (nextStory) {
      const profile = state.brandProfiles[selected()[0]?.id];
      nextStory.textContent = `Sesi ini melanjutkan episode ${profile?.next_episode || 1}–${(profile?.next_episode || 1) + n - 1}. Storyteller menggunakan memori cerita tersimpan.`;
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
    }, h('h2', {}, 'Ringkasan sesi'), ui.chip(mode === 'story' ? 'Storyline' : 'Campaign', mode === 'story' ? 'concept' : 'info')), h('div', {
      class: 'rd-summary-total'
    }, total, h('span', {}, mode === 'story' ? 'episode' : 'konten')), h('p', {
      class: 'small muted'
    }, mode === 'story' ? a ? `@${a.username} · episode ${episode}–${episode + n - 1}` : 'Pilih akun cerita' : `${selection.length} akun × ${n} konten`), h('div', {
      class: 'gf-summary-rows'
    }, summaryRow('Format', mode === 'story' ? 'Sesuai alur cerita' : format.value === 'single' ? 'Single' : `Carousel · ${slides.value} slide`, h('span', {
      class: 'muted'
    }, `${img} gambar`)), summaryRow('Periode', `${shortDate(start.value)} – ${shortDate(end.value)}`, h('span', {
      class: 'muted'
    }, `${days} hari`)), summaryRow('Ritme', `±${(n / days).toFixed(1)} post/hari/akun`), summaryRow('Bahasa', captionLanguage.selectedOptions[0]?.textContent), summaryRow('Tim AI', teamSummary.textContent, B('Ubah', teamDrawer, 'ui-text-button'))), mode === 'story' && a ? summaryRow('Aset', `${(p?.assets || []).filter(x => x.category === 'logo').length} logo · ${(p?.assets || []).filter(x => x.category === 'visual').length} referensi · ${(p?.assets || []).filter(x => x.category === 'product').length} produk`, B('Kelola', () => quickBrand(a), 'ui-text-button')) : null, mode === 'story' && a && !(p?.assets || []).some(x => x.category === 'product') ? h('div', {
      class: 'rd-callout warn small'
    }, 'Belum ada foto produk. Storyteller belum bisa memilih produk spesifik. ', B('Tambah foto produk', () => quickBrand(a), 'ui-text-button')) : null, h('div',{class:'gf-brand-completeness'},selected().filter(a=>a.platform==='instagram').map(a=>{const ready=brandReadiness(state.brandProfiles[a.id]);return h('div',{class:'small'},B('@'+a.username+' · Brand Kit '+ready.completeness+'%',()=>quickBrand(a),'ui-text-button'),ready.ok&&ready.missing.length?h('span',{class:'muted'},' · Disarankan: '+ready.missing.map(x=>x.label).join(', ')):null);})),h('h3', {}, missing.length ? 'Yang perlu dilengkapi' : 'Siap generate'), h('div', {
      class: 'rd-readiness'
    }, ...(missing.length ? missing.map(item => h('div', {
      class: 'rd-check-item warn'
    }, icon('warn'), h('span', {}, item.text), item.fix ? B('Lengkapi', item.fix, 'ui-text-button') : link('Buka', item.url, 'ui-text-button'), item.account ? B('Lewati', () => {
      selection = selection.filter(id => id !== item.account.id);
      drawAccounts();
      update();
    }, 'ui-text-button') : null)) : [check(`${selection.length} akun, semua Brand Kit siap`), check(mode === 'story' ? 'Fondasi cerita tersimpan' : 'Arahan ditulis'), check(images.value === 'manual' && mode === 'campaign' ? 'Foto diunggah sendiri' : 'API key tim agen tersambung')])), submit, h('p', {
      class: 'small muted gf-cta-note'
    }, mode === 'story' ? 'Rencana dan proposal muncul di Draft Konten. Tidak ada biaya gambar sampai Anda menyetujui konsep.' : 'Tahap 1 hanya konsep. Gambar dibuat setelah Anda menyetujui konsep. Publikasi setelah persetujuan akhir.'));
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
        'aria-label': 'Bahasa caption akun'
      }, [['id', 'Bahasa Indonesia'], ['en', 'English'], ['mixed', 'Campuran']].map(([value, text]) => h('option', {
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
        'aria-label': 'Kategori aset'
      }, [['logo', 'Logo'], ['visual', 'Referensi visual'], ['product', 'Foto produk'], ['video', 'Video / Reel']].map(([value, text]) => h('option', {
        value
      }, text))),
      assetName = h('input', {
        'aria-label': 'Nama produk atau koleksi',
        placeholder: 'Nama / koleksi (opsional)'
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
      toast(`${file.files.length - failed} aset ditambahkan${failed ? ' · ' + failed + ' gagal' : ''}`);
      file.value = '';
    };
    const stageTabs = h('div', {
        class: 'gf-brand-steps'
      }),
      identity = h('section', {
        class: 'gf-brand-page'
      }, field('Brand ini menjual apa, untuk siapa?', seed), h('h3', {}, 'Tone bicara'), h('div', {
        class: 'gf-tone-chips'
      }, ['Ramah', 'Profesional', 'To the point', 'Playful', 'Mewah'].map(tone => B(tone, e => {
        const line = 'Tone: ' + tone;
        if (!notes.value.includes(line)) {
          notes.value += (notes.value ? '\n' : '') + line;
          saver.schedule();
        }
        toast('Tone ' + tone + ' ditambahkan ke aturan brand.');
      }, 'btn sm'))), field('Bahasa caption', language), h('label', {
        class: 'gf-notify'
      }, emoji, 'Izinkan emoji pada caption')),
      rulesPage = h('section', {
        class: 'gf-brand-page'
      }, field('Aturan: yang boleh / tidak boleh', notes), h('p', {
        class: 'small muted'
      }, 'Logo dan detail produk harus dipertahankan. Jelaskan warna, gaya bahasa dan klaim yang perlu dihindari.')),
      assetPage = h('section', {
        class: 'gf-brand-page'
      }, h('h3', {}, 'Logo, referensi visual & produk'), assets, h('div', {
        class: 'row'
      }, category, assetName, file, B('Unggah aset', () => file.click())));
    let brandStep = 0;
    const next = B('Lanjut: Aturan', () => {
      if (brandStep < 2) {
        brandStep++;
        drawBrandSteps();
      } else d.close();
    }, 'btn primary');
    function drawBrandSteps() {
      replace(stageTabs, ...['Identitas', 'Aturan', 'Aset'].map((label, i) => B(i + 1 + ' · ' + label, () => {
        brandStep = i;
        drawBrandSteps();
      }, 'btn ' + (i === brandStep ? 'on' : ''))));
      [identity, rulesPage, assetPage].forEach((el, i) => el.hidden = i !== brandStep);
      next.textContent = ['Lanjut: Aturan', 'Lanjut: Aset', 'Selesai'][brandStep];
    }
    const d = modal('Brand Kit cepat · @' + a.username, h('div', {}, h('p', {
      class: 'muted small'
    }, 'Fondasi yang sama disimpan pada akun dan dipakai untuk sesi berikutnya.'), stageTabs, identity, rulesPage, assetPage, saveStatus, h('p', {
      class: 'small muted'
    }, 'Bisa dilengkapi kapan saja di Perusahaan & Akun → Brand Kit.')), [link('Detail Brand Kit', '/accounts/' + a.id + '?tab=brand'), B('Nanti', () => d.close()), next]);
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
    })), [B('Edit fondasi brand', () => quickBrand(a))]);
  }
  async function teamDrawer() {
    const table = h('div', {
        class: 'rd-agent-table'
      }),
      description = h('p', {
        class: 'muted small'
      }, 'Pilihan model berasal dari katalog provider. Ketersediaan akhir bergantung API key dan kuota Anda.'),
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
        toast('Tambahkan API key terlebih dahulu.', true);
        return;
      }
      for (const role of Object.keys(draft)) {
        const p = role === 'image' ? imageProvider : textProvider;
        if (!p) continue;
        const list = models(p, role);
        let model = list[0];
        if (name === 'Kualitas') model = list.find(x => /opus|pro\b|gpt-4\.1$/.test(x.id)) || list.at(-1) || model;else if (name === 'Hemat') model = list.find(x => /mini|haiku|lite/.test(x.id)) || model;
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
          }, c.name + (keys.has(value) ? '' : ' · key belum diisi')))),
          model = h('select', {
            'aria-label': 'Model ' + roles[role]
          }),
          instructions = h('textarea', {
            rows: 3,
            maxlength: 4000,
            'aria-label': 'Instruksi ' + roles[role]
          }, draft[role].instructions);
        function drawModels() {
          const list = models(provider.value, role);
          if (!list.some(m => m.id === draft[role].model)) {
            if(role!=='image'&&/transcribe|computer.?use|tts|embedding|image|imagen|nano.?banana|veo|audio/i.test(draft[role].model))draft[role].model=list[0]?.id||'';
            else list.push({id:draft[role].model,name:draft[role].model+' · tersimpan'});
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
        row.append(h('h3', {}, roles[role]), provider, model, h('details', {}, h('summary', {}, 'Instruksi agen'), instructions));
        return row;
      }));
    }
    const d = modal('Tim agen & model', h('div', {}, h('div', {
      class: 'gf-presets'
    }, ['Hemat', 'Seimbang', 'Kualitas'].map(n => B(h('span', {}, h('b', {}, n), h('small', {}, {
      Hemat: 'Model ringan untuk ide dan uji coba.',
      Seimbang: 'Konsep detail, review ringan. Disarankan.',
      Kualitas: 'Model terbaik tiap tahap. Lebih lambat.'
    }[n])), () => {
      applyPreset(n);
      d.querySelectorAll('.gf-presets .btn').forEach((el, i) => el.classList.toggle('on', ['Hemat', 'Seimbang', 'Kualitas'][i] === n));
    }, 'btn ' + (n === selectedPreset ? 'on' : '')))), description, table, keys.has('gemini') ? B('Perbarui model Gemini', async () => {
      const result = await api('GET', '/v1/generator/providers/gemini/models?refresh=true');
      config.providers.gemini = {
        ...config.providers.gemini,
        ...result
      };
      draw();
    }) : null), [B('Lihat sebagai canvas',()=>{const canvas=workflowCanvas({h,icon,userId:state.user.id,nodes:activeRoles.map((role,i)=>({id:role,title:roles[role],subtitle:draft[role].provider+' / '+draft[role].model,x:(i%3)*300,y:Math.floor(i/3)*230,width:260,content:h('p',{},draft[role].instructions||'Instruksi default')})),edges:activeRoles.slice(1).map((role,i)=>({from:activeRoles[i],to:role}))});const view=modal('Alur tim agen',canvas.element||canvas);view.classList.add('gf-canvas-dialog');view.addEventListener('close',()=>canvas.dispose(),{once:true});}),B('Simpan sebagai default', async () => {
      await api('PUT', '/v1/generator/settings', {
        agents: draft
      });
      agents = structuredClone(draft);
      preset = selectedPreset;
      update();
      toast('Tim agen default tersimpan.');
    }), B('Terapkan', () => {
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
        d = modal(mode === 'story' ? `Rencanakan ${n} episode?` : `Buat ${n * chosen.length} ide konten?`, h('div', {}, ui.chip(mode === 'story' ? 'Storyline' : 'Campaign', 'info'), h('table', {
          class: 'gf-stage-table'
        }, h('thead', {}, h('tr', {}, ['Tahap', 'Jumlah', 'Kapan'].map(x => h('th', {}, x)))), h('tbody', {}, stage(mode === 'story' ? 'Storyteller + Manager + Scheduler' : 'Konsep + caption + review', `${n * chosen.length} konten`, 'Sekarang', 'ok'), stage('Gambar · ' + agents.image.model, `${n * chosen.length * Number(slides.value)} gambar`, 'Setelah konsep disetujui'), stage('Terbit', '0', 'Hanya setelah Anda setujui'))), h('div', {
          class: 'rd-callout'
        }, 'Biaya dibebankan ke API key pribadi sesuai tarif provider. Gambar memerlukan persetujuan dan konfirmasi biaya terpisah. Tidak ada publikasi otomatis.'), h('details', {}, h('summary', {}, 'Model yang dipakai sekarang'), h('ul', {}, (mode === 'story' ? ['storyteller', 'manager', 'scheduler'] : ['concept', 'revision']).map(role => h('li', {}, roles[role] + ' · ' + agents[role].provider + ' / ' + agents[role].model)))), h('label', {
          class: 'gf-notify'
        }, notify, 'Beri tahu di aplikasi saat konsep siap ditinjau')), [B('Kembali', () => d.close()), B('Mulai sesi', () => {
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
            const assets = ['logo', 'visual', 'product', 'product'].reduce((out, category) => {
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
      }, h('b', {}, `${[...batch.results.values()].filter(r => r.started || r.story || manual).length} akun siap · ${failures.length} perlu dicoba ulang`), ...failures.map(({
        a,
        e
      }) => h('p', {}, '@' + a.username + ': ' + errMsg(e))), B('Coba ulang yang gagal', generate)));else if (mode === 'campaign') {
        const results = [...batch.results.values()];
        toast(manual ? 'Rencana dibuat. Unggah media di Draft Konten.' : 'Sesi dimulai. Tinjau konsep di Draft Konten.');
        running.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      } else {
        toast('Storyline mulai disusun. Progres sesi tampil di atas.');
        running.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
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
    }, ui.chip(failed.length ? 'Terhenti' : 'Sedang dibuat', failed.length ? 'bad' : 'info'), h('h2', {}, s.title), h('span', {
      class: 'small muted'
    }, `${new Set(s.runs.flatMap(r => (r.targets || []).map(target => target.account_id))).size} akun · ${s.runs.length} konten`)), ui.progressPipeline(steps), failed.length ? h('div', {
      class: 'rd-callout warn'
    }, h('b', {}, `${failed.length} konten gagal. ${s.runs.length - failed.length} konten lain tetap aman.`), errorBox(failed[0].error || 'Tahap provider belum selesai. Coba ulang setelah memeriksa model dan kuota.')) : null, h('div', {
      class: 'gf-live-actions'
    }, concepts.length ? link(`Tinjau ${concepts.length} konsep sekarang`, '/generator/drafts/' + s.id, 'ui-text-button') : ready.length ? link(`Tinjau ${ready.length} yang berhasil`, '/generator/drafts/' + s.id, 'ui-text-button') : h('span', {
      class: 'small muted'
    }, 'Progres diperbarui otomatis.'), h('span', {
      class: 'gf-grow'
    }), failed.length ? B('Coba lagi ' + failed.length, async () => {
      if (!(await ui.confirmDialog({
        title: `Coba ulang ${failed.length} konten?`,
        tone: 'cost',
        body: 'Hanya konten gagal yang dicoba ulang. Tahap berikutnya dapat memakai API key pribadi.'
      }))) return;
      for (const r of failed) await api('POST', `/v1/generator/runs/${r.id}/retry`);
      await refresh();
    }) : B('Jeda', async () => {
      if (!(await ui.confirmDialog({
        title: 'Hentikan sesi?',
        tone: 'danger',
        body: 'Tahap yang sudah dikenakan biaya tidak dapat dibatalkan.',
        confirmLabel: 'Hentikan'
      }))) return;
      for (const r of s.runs.filter(r => ['queued', 'running'].includes(r.status))) await api('DELETE', `/v1/generator/runs/${r.id}`);
      await refresh();
    }), link('Buka sesi', '/generator/drafts/' + s.id, 'btn primary')));
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
      const draftNav=root.querySelector('.pagehead a');if(draftNav){const waiting=sessions.reduce((n,s)=>n+s.runs.filter(r=>['concept_review','review'].includes(r.status)).length,0);replace(draftNav,'Draft Konten',waiting?ui.chip(waiting+' perlu ditinjau','warn'):null);}
      for (const s of sessions) {
        const ready = s.runs.filter(r => ['concept_review', 'review'].includes(r.status)).length,
          prior = old.find(x => x.id === s.id);
        if (notifyReady && prior && ready > prior.runs.filter(r => ['concept_review', 'review'].includes(r.status)).length && !notified.has(s.id)) {
          notified.add(s.id);
          toast('Konsep sesi siap ditinjau di Draft Konten.');
        }
      }
      replace(running, ...latestJobs.filter(j => ['queued', 'running', 'failed'].includes(j.status)).map(j => h('section', {
        class: 'panel rd-live-session gf-live-card'
      }, h('h2', {}, (j.memory_session_title||'Sesi Storyline')+' · @' + (state.accounts.find(a => a.id === j.account_id)?.username || '')), ui.progressPipeline(['storyteller', 'manager', 'scheduler'].map(role => ({
        label: roles[role],
        status: j.steps?.[role]?.status || 'waiting'
      }))), j.error ? errorBox(j.error) : null, j.status === 'failed' ? B('Coba ulang sesi', async () => {
        if (!(await ui.confirmDialog({
          title: 'Coba ulang Storyline?',
          tone: 'cost',
          body: 'Tahap yang belum selesai dicoba ulang dengan API key pribadi.'
        }))) return;
        await api('POST', `/v1/generator/story-jobs/${j.id}/retry`, {
          agents,
          confirm_cost: true
        });
        await refresh();
      }) : B('Hentikan', async () => {
        if (await ui.confirmDialog({
          title: 'Hentikan sesi cerita?',
          tone: 'danger',
          body: 'Tahap yang sudah dikenakan biaya tidak dapat dibatalkan.',
          confirmLabel: 'Hentikan'
        })) {
          await api('DELETE', `/v1/generator/story-jobs/${j.id}`);
          await refresh();
        }
      }), j.plan_id ? link('Buka proposal', '/generator/drafts/' + j.plan_id) : null)), ...sessions.filter(s => workspace.stateOf(s) === 'running' || s.runs.some(r => r.status === 'failed' && Date.parse(r.updated_at || r.created_at) > Date.now() - 864e5)).slice(0, 2).map(liveCard));
      replace(recent, h('section', {
        class: 'gf-session-recent'
      }, h('header', {}, h('h2', {}, 'Sesi terakhir'), link('Semua sesi di Draft Konten', '/generator/drafts', 'ui-text-button')), ...latestJobs.filter(j => j.status === 'review' && j.plan_id).map(j => link('Tinjau proposal Storyline', '/generator/drafts/' + j.plan_id, 'btn primary')), ...sessions.slice(0, 3).map(s => h('div', {
        class: 'gf-recent-row'
      }, ui.chip({
        action: 'Perlu ditinjau',
        running: 'Sedang dibuat',
        done: 'Selesai',
        plan: 'Rencana',
        expired: 'Kedaluwarsa'
      }[workspace.stateOf(s)] || 'Perlu ditinjau', workspace.stateOf(s) === 'done' ? 'ok' : workspace.stateOf(s)==='action'?'warn':'info'), h('b', {}, s.title), h('span', {
        class: 'small muted'
      }, `${new Set(s.runs.flatMap(r => (r.targets || []).map(target => target.account_id))).size} akun · ${s.runs.length} konten`), link('Buka', '/generator/drafts/' + s.id, 'btn sm'))), !sessions.length ? h('p', {
        class: 'muted small',
        style: 'padding:16px'
      }, 'Belum ada sesi. Sesi pertama Anda muncul di sini.') : null));
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
  }, 'Ide cepat:'), ['Promo', 'Edukasi produk', 'Testimoni', 'Di balik layar'].map(x => B(x, () => {
    brief.value += (brief.value ? '\n' : '') + x + ': ';
    brief.focus();
    update();
  }, 'btn sm'))), briefCounter);
  const composer = h('section', {
    class: 'panel rd-generator-composer'
  }, step('1', 'Untuk akun mana?', h('div', {}, accountRow, h('p', {
    class: 'small muted gf-account-hint'
  }, h('span', {
    class: 'ui-dot warn'
  }), ' = Brand Kit belum ada. Detail dan cara memperbaiki ada di ringkasan sesi.')), accountMeta), step('2', 'Mau buat apa?', h('div', {}, storyInfo, field('Arahan sesi', brief), quickIdeas, formatOptions, field('Bahasa caption', captionLanguage)), modeControl), step('3', 'Kapan tayang?', h('div', {}, scheduleSentence, h('p', {
    class: 'small muted'
  }, 'Distribusi mengikuti rentang dan slot yang dipilih. Jam belum dianalisis dari performa akun.'))));
  format.classList.add('gf-native-control');
  images.classList.add('gf-native-control');
  slides.classList.add('gf-slide-count');
  formatOptions.append(format, images, formatSegments);
  drawFormats();
  const root = h('div', {
    class: 'rd-page gf-generator'
  }, h('div', {
    class: 'pagehead'
  }, h('div', {}, h('h1', {}, 'Sosmed Generator'), h('p', {}, 'Pilih akun, tulis arahan, AI menyiapkan draft untuk Anda tinjau.')), link('Draft Konten', '/generator/drafts', 'btn')), running, error, h('div', {
    class: 'rd-generator-layout'
  }, composer, summary), h('div', {
    class: 'rd-advanced'
  }, B('Tim agen & model · Lanjutan', teamDrawer, 'ui-text-button'), teamSummary), recent, mobileFooter);
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
      stopped = true;
      clearTimeout(timer);
      for (const saver of openSavers) {
        await saver.flush();
        if (saver.error) throw new Error('Brand Kit belum tersimpan. Coba simpan kembali.');
      }
      document.querySelectorAll('dialog.rd-drawer[open]').forEach(d => d.close());
    }
  };
}
