import { t } from './strings.en.js';
const replace=(el,...nodes)=>el.replaceChildren(...nodes.flat(Infinity).filter(x=>x!=null&&x!==false));
export function createUI({
  h,
  icon,
  modal,
  state,
  loadAccounts,
  isOwner,
  onScopeChange = () => {}
}) {
  const chip = (text, tone = 'neutral', {
    dot = false,
    icon: ic
  } = {}) => h('span', {
    class: 'ui-chip ' + tone
  }, ic ? icon(ic) : null, dot ? h('span', {
    class: 'ui-dot',
    'aria-hidden': 'true'
  }) : null, text);
  const labels = {
    planned: 'neutral',
    queued: 'info',
    running: 'info',
    concept_review: 'concept',
    review: 'warn',
    failed: 'bad',
    approved: 'ok',
    drafted: 'ok',
    cancelled: 'neutral'
  };
  const statusChip = r => {
    const tone = labels[r.status] || 'neutral';
    return chip(t('status.' + r.status), tone);
  };
  function confirmDialog({
    title,
    body,
    tone = 'default',
    details = [],
    confirmLabel = t('dialog.confirm'),
    cancelLabel = t('dialog.cancel')
  }) {
    return new Promise(resolve => {
      let accepted = false;
      const trigger = document.activeElement;
      const content = h('div', {}, tone !== 'default' ? chip(t(tone === 'cost' ? 'dialog.cost.chip' : 'dialog.danger.chip'), tone === 'cost' ? 'info' : 'bad') : null, h('p', {}, body), details.length ? h('dl', {
        class: 'ui-dialog-details'
      }, details.map(([label, value]) => h('div', {}, h('dt', {}, label), h('dd', {}, value)))) : null);
      const cancel = h('button', {
          class: 'btn',
          onclick: () => dialog.close()
        }, cancelLabel),
        ok = h('button', {
          class: 'btn ' + (tone === 'danger' ? 'danger' : 'primary'),
          onclick: () => {
            accepted = true;
            dialog.close();
          }
        }, confirmLabel),
        dialog = modal(title, content, [cancel, ok]);
      dialog.dataset.tone = tone;
      if (tone !== 'default') {
        const toneChip = content.querySelector('.ui-chip');
        if (toneChip) {
          dialog.prepend(h('div', { class: 'ui-dialog-tone-chip' }, toneChip));
        }
      }
      dialog.addEventListener('close', () => {
        resolve(accepted);
        trigger?.isConnected && trigger.focus();
      }, {
        once: true
      });
      dialog.addEventListener('click', e => {
        if (e.target === dialog && outside(e, dialog)) dialog.close();
      });
      (tone === 'danger' ? cancel : ok).focus();
    });
  }
  function inputDialog({
    title,
    label = t('dialog.input'),
    placeholder = '',
    value = '',
    suggestions = [],
    hint = '',
    confirmLabel = t('common.save'),
    multiline = true
  }) {
    return new Promise(resolve => {
      let result = null;
      const trigger = document.activeElement,
        input = h(multiline ? 'textarea' : 'input', {
          'aria-label': label,
          placeholder,
          value: multiline ? null : value
        }, multiline ? value : null),
        dialog = modal(title, h('div', {}, h('label', {
          class: 'ui-field'
        }, label, input), h('div', {
          class: 'row'
        }, suggestions.map(text => h('button', {
          class: 'btn sm',
          onclick: () => {
            input.value += (input.value ? ' ' : '') + text;
            input.focus();
          }
        }, text))), hint ? h('p', {
          class: 'muted small'
        }, hint) : null), [h('button', {
          class: 'btn',
          onclick: () => dialog.close()
        }, t('dialog.cancel')), h('button', {
          class: 'btn primary',
          onclick: () => {
            result = input.value;
            dialog.close();
          }
        }, confirmLabel)]);
      dialog.addEventListener('close', () => {
        resolve(result);
        trigger?.isConnected && trigger.focus();
      }, {
        once: true
      });
      dialog.addEventListener('click', e => {
        if (e.target === dialog && outside(e, dialog)) dialog.close();
      });
      input.focus();
    });
  }
  function accountChip(a, {
    selected = false
  } = {}) {
    return h('span', {
      class: 'ui-account-chip ' + (selected ? 'selected' : ''),
      title: a.name || '@' + a.username
    }, photo(a), h('span', {}, '@' + a.username));
  }
  function photo(a) {
    return a.avatar_url && /^https:\/\//.test(a.avatar_url) ? h('img', {
      src: a.avatar_url,
      alt: '',
      loading: 'lazy',
      referrerpolicy: 'no-referrer',
      onerror: e => e.currentTarget.replaceWith(h('span', {
        class: 'ui-avatar'
      }, (a.username || '?').slice(0, 2).toUpperCase()))
    }) : h('span', {
      class: 'ui-avatar'
    }, (a.username || '?').slice(0, 2).toUpperCase());
  }
  let accountPickerSequence = 0;
  function accountPicker({
    accounts,
    selected = [],
    mode = 'multi',
    readiness: ready,
    onChange = () => {},
    maxInline = 8,
    groupLabels = false
  }) {
    const pickerId = 'account-picker-' + (++accountPickerSequence);
    let chosen = new Set(mode === 'single' ? selected.slice(0, 1) : selected);
    const row = h('div', {
        class: 'ui-account-row',
        role: mode === 'single' ? 'radiogroup' : 'group',
        'aria-label': t('scope.account.all')
      }),
      meta = h('span', {
        class: 'ui-picker-meta'
      }),
      el = h('div', {
        class: 'ui-account-picker'
      }, row, meta);
    let popover = null;
    const toggle = a => {
      if (a.disabled) return;
      if (mode === 'single') chosen = new Set([a.id]);else chosen.has(a.id) ? chosen.delete(a.id) : chosen.add(a.id);
      draw();
      onChange([...chosen]);
    };
    function draw() {
      const focusedControl = el.contains(document.activeElement) ? document.activeElement.dataset.accountControl : null;
      replace(row,);
      const shown = accounts.length > maxInline ? accounts.filter(a => chosen.has(a.id)) : [...accounts];
      if (matchMedia('(max-width:759px)').matches) shown.sort((a, b) => Number(chosen.has(b.id)) - Number(chosen.has(a.id)));
      let lastGroup = '';
      for (const a of shown) {
        if (groupLabels && (a.company_name || t('scope.company.unassigned')) !== lastGroup) {
          lastGroup = a.company_name || t('scope.company.unassigned');
          row.append(h('span', {
            class: 'ui-company-label'
          }, lastGroup));
        }
        const selected = chosen.has(a.id),
          r = ready?.(a.id),
          button = h('button', {
            type: 'button',
            class: 'ui-account-chip ' + (selected ? 'selected' : ''),
            role: mode === 'single' ? 'radio' : null,
            'aria-checked': mode === 'single' ? String(selected) : null,
            'aria-pressed': mode === 'multi' ? String(selected) : null,
            disabled: a.disabled,
            'data-account-control': 'chip-' + a.id,
            tabindex: row.querySelector('button') ? -1 : 0,
            title: [a.name || a.username, fmtNumber(a.followers_count ?? a.followers ?? 0), r ? r.ok ? t('gen.ready') : t('accounts.brandkit.missing') : '', a.disabled ? a.reason || t('picker.disabled.reason') : ''].filter(Boolean).join(' · '),
            onclick: () => toggle(a)
          }, photo(a), h('span', {}, '@' + a.username), selected ? icon('check') : null, r && !r.ok ? h('span', {
            class: 'ui-dot warn',
            'aria-hidden': 'true'
          }) : null);
        row.append(button);
      }
      if (accounts.length > maxInline) row.append(h('button', {
        class: 'ui-account-chip more',
        'data-account-control': 'search',
        onclick: search
      }, icon('search'), t('picker.more', {
        n: accounts.length - chosen.size
      })));
      if (!accounts.length) row.append(h('span', {
        class: 'muted small'
      }, t('scope.none')));
      replace(meta,h('span', {}, t('picker.count', {
        n: chosen.size,
        m: accounts.length
      })), mode === 'multi' ? h('button', {
        class: 'ui-text-button',
        'data-account-control': 'select-all',
        onclick: () => {
          chosen = new Set(accounts.filter(a => !a.disabled).map(a => a.id));
          draw();
          onChange([...chosen]);
        }
      }, t('picker.all')) : null);
      if (focusedControl) {
        const controls = [...el.querySelectorAll('[data-account-control]')];
        const next = controls.find(control => control.dataset.accountControl === focusedControl) || row.querySelector('button.more') || row.querySelector('button:not(:disabled)');
        if (next) {
          if (row.contains(next)) row.querySelectorAll('button').forEach(button => button.tabIndex = button === next ? 0 : -1);
          next.focus({preventScroll: true});
        }
      }
    }
    function search() {
      popover?.close();
      const list = h('div', {
          class: 'ui-account-results'
        }),
        input = h('input', {
          type: 'search',
          'aria-label': t('picker.search'),
          placeholder: t('picker.search'),
          oninput: render
        }),
        mobile = matchMedia('(max-width:759px)').matches;
      const apply = h('button', {
        class: 'btn primary',
        onclick: () => dialog.close()
      }, t('scope.accounts.sheet.cta', {
        n: chosen.size
      }));
      const dialog = modal(t('scope.accounts.sheet.title', {
        company: companyName()
      }), h('div', {}, input, list), mobile ? [apply] : []);
      dialog.classList.add(mobile ? 'ui-account-sheet' : 'ui-account-popover');
      popover = dialog;
      dialog.addEventListener('close', () => {
        const trigger = row.querySelector('button.more');
        if (trigger?.isConnected) trigger.focus({preventScroll: true});
      }, {once: true});
      function render() {
        const focusedControl = list.contains(document.activeElement) ? document.activeElement.dataset.accountControl : null;
        replace(list,);
        const visible = accounts.filter(a => (a.username + ' ' + (a.name || '')).toLowerCase().includes(input.value.toLowerCase()));
        const groups = new Map();
        for (const a of visible) {
          const name = a.company_name || t('scope.company.unassigned');
          if (!groups.has(name)) groups.set(name, []);
          groups.get(name).push(a);
        }
        for (const [name, items] of groups) {
          list.append(h('div', {
            class: 'ui-company-result-head'
          }, h('h3', {}, name + ' · ' + fmtNumber(items.length)), mode === 'multi' ? h('button', {
            class: 'ui-text-button',
            'data-account-control': 'group-' + name,
            onclick: () => {
              for (const a of items) if (!a.disabled) chosen.add(a.id);
              draw();
              onChange([...chosen]);
              render();
            }
          }, t('picker.all')) : null));
          for (const a of items) {
            const r = ready?.(a.id);
            const disabledReason = a.disabled ? a.reason || t('picker.disabled.reason') : '';
            const reasonId = pickerId + '-reason-' + accounts.indexOf(a);
            list.append(h('label', {
              class: 'ui-account-result',
              title: disabledReason || null,
              tabindex: a.disabled ? 0 : null
            }, h('input', {
              type: mode === 'single' ? 'radio' : 'checkbox',
              name: pickerId + '-choice',
              'data-account-control': 'option-' + a.id,
              checked: chosen.has(a.id),
              disabled: a.disabled,
              'aria-describedby': disabledReason ? reasonId : null,
              onchange: () => {
                toggle(a);
                render();
              }
            }), photo(a), h('span', {}, '@' + a.username), h('small', {}, fmtNumber(a.followers_count ?? a.followers ?? 0)), r ? chip(r.ok ? t('gen.ready') : t('accounts.brandkit.missing'), r.ok ? 'ok' : 'warn') : null, disabledReason ? h('small', {id: reasonId, class: 'muted'}, disabledReason) : null));
          }
        }
        if (!visible.length) list.append(h('p', {}, t('scope.none')));
        apply.textContent = t('scope.accounts.sheet.cta', {
          n: chosen.size
        });
        if (focusedControl) [...list.querySelectorAll('[data-account-control]')].find(control => control.dataset.accountControl === focusedControl)?.focus({preventScroll: true});
      }
      render();
      input.focus();
      dialog.addEventListener('click', e => {
        if (e.target === dialog && outside(e, dialog)) dialog.close();
      });
    }
    el.addEventListener('keydown', e => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      const buttons = [...row.querySelectorAll('button:not(:disabled)')];
      if (!buttons.length) return;
      e.preventDefault();
      let i = buttons.indexOf(document.activeElement);
      i = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (i + (e.key === 'ArrowLeft' ? -1 : 1) + buttons.length) % buttons.length;
      buttons.forEach((b, n) => b.tabIndex = n === i ? 0 : -1);
      buttons[i].focus();
    });
    draw();
    return {
      element: el,
      set(value) {
        chosen = new Set(value);
        draw();
      },
      open: search,
      value: () => [...chosen]
    };
  }
  function companyName() {
    return state.companies.find(c => c.id === state.scope?.companyId)?.name || t('scope.company.all');
  }
  function scopeAccounts() {
    const allowed = state.accounts.filter(a => !state.scope?.companyId || (state.scope.companyId === 'none' ? !a.company_id : a.company_id === state.scope.companyId));
    const ids = state.scope?.accountIds;
    return !Array.isArray(ids) || !ids.length ? allowed : allowed.filter(a => ids.includes(a.id));
  }
  function inScope(item) {
    const ids = new Set(scopeAccounts().map(a => a.id));
    return (item.targets?.map(t => t.account_id) || item.account_ids || (item.account_id ? [item.account_id] : [])).some(id => ids.has(id));
  }
  function readScope() {
    let stored = {};
    try {
      stored = JSON.parse(localStorage.getItem('lrm.scope') || '{}');
    } catch {}
    const q = new URLSearchParams(location.hash.split('?')[1] || '');
    state.scope = {
      companyId: stored.companyId || null,
      accountIds: stored.accountIds || 'all',
      views: stored.views || {}
    };
    if (q.has('co')) state.scope.companyId = q.get('co') || null;
    if (q.has('acc')) state.scope.accountIds = q.get('acc') ? q.get('acc').split(',') : 'all';
    sanitize();
  }
  function sanitize() {
    const company = state.scope.companyId;
    if (company && !state.accounts.some(a => (a.company_id || 'none') === company)) state.scope.companyId = null;
    const ids = new Set(state.accounts.filter(a => !state.scope.companyId || (a.company_id || 'none') === state.scope.companyId).map(a => a.id));
    if (Array.isArray(state.scope.accountIds)) {
      state.scope.accountIds = state.scope.accountIds.filter(id => ids.has(id));
      if (!state.scope.accountIds.length) state.scope.accountIds = 'all';
    }
    if (!isOwner() && state.companies.length === 1 && !state.accounts.some(a => !a.company_id)) state.scope.companyId = state.companies[0].id;
  }
  function persist(page, view) {
    sanitize();
    if (view) state.scope.views[page] = view;
    try {
      localStorage.setItem('lrm.scope', JSON.stringify(state.scope));
    } catch {}
    const q = new URLSearchParams(location.hash.split('?')[1] || '');
    q.set('co', state.scope.companyId || '');
    q.set('acc', Array.isArray(state.scope.accountIds) ? state.scope.accountIds.join(',') : '');
    if (view) q.set('view', view);
    history.replaceState(null, '', location.pathname + location.search + '#' + location.hash.slice(1).split('?')[0] + '?' + q);
    onScopeChange();
  }
  function scopeBar({
    page,
    views = [],
    accountMode = 'multi',
    extra = null,
    onChange = () => {}
  }) {
    readScope();
    let currentView = new URLSearchParams(location.hash.split('?')[1] || '').get('view') || state.scope.views[page] || views[0]?.id;
    const body = h('div', {
        class: 'ui-scopebar'
      }),
      accountArea = h('div', {
        class: 'ui-scope-accounts'
      });
    let picker;
    const change = (refreshAccounts = true) => {
      persist(page, currentView);
      if (refreshAccounts) renderAccounts();
      onChange();
    };
    const company = h('button', {
      class: 'btn ui-company',
      onclick: () => {
        const groups = [{
          id: null,
          name: t('scope.company.all'),
          accounts: state.accounts
        }, ...state.companies.map(c => ({
          ...c,
          accounts: state.accounts.filter(a => a.company_id === c.id)
        })), ...(state.accounts.some(a => !a.company_id) ? [{
          id: 'none',
          name: t('scope.company.unassigned'),
          accounts: state.accounts.filter(a => !a.company_id)
        }] : [])];
        const dialog = modal(t('scope.company.all'), h('div', {
          class: 'ui-company-options'
        }, groups.map(c => h('button', {
          class: 'btn',
          disabled: !c.accounts.length,
          onclick: () => {
            state.scope.companyId = c.id;
            state.scope.accountIds = 'all';
            dialog.close();
            change();
          }
        }, icon('building'), c.name, h('small', {}, t('scope.company.count', {
          n: c.accounts.length
        })))), isOwner() ? h('a', {
          class: 'btn',
          href: '#/accounts',
          onclick: () => dialog.close()
        }, t('scope.company.manage')) : null));
      }
    }, icon('building'), companyName(), icon('chevron-down'));
    function renderAccounts() {
      replace(company,icon('building'), companyName(), icon('chevron-down'));
      if (!isOwner() && state.companies.length === 1) company.disabled = true;
      const accounts = state.accounts.filter(a => !state.scope.companyId || (a.company_id || 'none') === state.scope.companyId);
      picker = accountPicker({
        accounts,
        selected: accountMode === 'single' ? (Array.isArray(state.scope.accountIds) ? state.scope.accountIds : accounts.map(a => a.id)).slice(0, 1) : Array.isArray(state.scope.accountIds) ? state.scope.accountIds : accounts.map(a => a.id),
        mode: accountMode,
        groupLabels: !state.scope.companyId,
        onChange: ids => {
          state.scope.accountIds = ids.length ? ids : 'all';
          change(false);
          if (!ids.length) picker.set(accounts.map(account => account.id));
          mobileAccounts.textContent = t('scope.accounts.mobile', {n: scopeAccounts().length});
        }
      });
      replace(accountArea,picker.element);
      mobileAccounts.textContent = t('scope.accounts.mobile', {
        n: scopeAccounts().length
      });
    }
    const mobileAccounts = h('button', {
      class: 'btn ui-mobile-accounts',
      onclick: () => picker.open()
    }, t('scope.accounts.mobile', {
      n: scopeAccounts().length
    }));
    const viewControl = h('div', {
      class: 'ui-view-switch',
      role: 'group',
      'aria-label': t('scope.view')
    }, views.map(v => h('button', {
      class: currentView === v.id ? 'on' : '',
      'aria-pressed': String(currentView === v.id),
      onclick: () => {
        currentView = v.id;
        change();
        for (const b of viewControl.children) {
          const on = b.dataset.view === v.id;
          b.classList.toggle('on', on);
          b.setAttribute('aria-pressed', String(on));
        }
      },
      'data-view': v.id
    }, v.label)));
    const mobileView = h('button', {
      class: 'btn ui-mobile-view',
      'aria-label': t('scope.view'),
      onclick: () => {
        const dialog = modal(t('scope.view'), h('div', {
          class: 'ui-company-options'
        }, views.map(v => h('button', {
          class: 'btn',
          onclick: () => {
            currentView = v.id;
            dialog.close();
            change();
          }
        }, icon('grid'), v.label))));
      }
    }, icon('grid'));
    renderAccounts();
    body.append(company, icon('chevron-right'), accountArea, mobileAccounts, extra || h('span'), viewControl, mobileView);
    const scoped = !!state.scope.companyId || Array.isArray(state.scope.accountIds);
    state.scopeNotices ??= new Set();
    const scopeSignature = page + ':' + state.scope.companyId + ':' + JSON.stringify(state.scope.accountIds);
    const notice = h('div', {
      class: 'ui-scope-notice',
      hidden: !scoped || state.scopeNotices.has(scopeSignature)
    }, t('scope.notice', {
      n: scopeAccounts().length,
      company: companyName(),
      list: scopeAccounts().map(a => '@' + a.username).join(', ')
    }), h('button', {
      class: 'ui-text-button',
      onclick: () => {
        state.scope.companyId = null;
        state.scope.accountIds = 'all';
        change();
        notice.hidden = true;
      }
    }, t('scope.notice.cta')));
    state.scopeNotices.add(scopeSignature);
    return {
      element: h('div', {}, body, notice),
      accounts: scopeAccounts,
      inScope,
      view: () => currentView
    };
  }
  function emptyState({
    icon: ic = 'info',
    title,
    body,
    action
  }) {
    return h('section', {
      class: 'ui-empty'
    }, icon(ic), h('h3', {}, title), h('p', {}, body), action);
  }
  function progressPipeline(steps) {
    steps=steps.map(s=>({...s,state:s.state||s.status||'waiting'}));
    return h('ol', {
      class: 'ui-pipeline'
    }, steps.map(s => h('li', {
      class: s.state
    }, s.state === 'done' ? icon('check') : s.state === 'failed' ? icon('warn') : icon('clock'), h('b', {}, s.label), h('small', {}, s.count || ''), h('progress', {
      max: 100,
      value: s.pct || 0,
      'aria-label': s.label
    }))));
  }
  function bulkBar({
    count,
    actions
  }) {
    return h('div', {
      class: 'ui-bulkbar'
    }, h('b', {}, t('draft.bulk.selected', {
      n: count
    })), ...actions);
  }
  function phonePreview({account,media=[],caption='',platform='instagram',initialIndex=0,onSlideChange=()=>{}}){
   let selected=platform,index=Math.max(0,Math.min(initialIndex,media.length-1));const body=h('div',{class:'ui-phone-body'}),root=h('article',{class:'ui-phone-preview'});
   function draw(){const item=media[index];replace(body,...[h('header',{},accountChip(account)),h('div',{class:'ui-phone-media'},item?.url?(item.type==='video'?h('video',{src:item.url,controls:true}):h('img',{src:item.url,alt:item.alt_text||account.username})):icon('image')),media.length>1?h('div',{class:'ui-carousel-dots',role:'group','aria-label':t('preview.slides')},media.map((m,i)=>h('button',{class:i===index?'on':'','aria-label':t('preview.slide',{n:i+1}),'aria-pressed':String(i===index),onclick:()=>{index=i;onSlideChange(i);draw();}}))):null,h('p',{},caption)].filter(x=>x!=null&&x!==false));root.dataset.platform=selected;}
   const toggle=h('div',{class:'ui-view-switch',role:'group','aria-label':t('preview.platform')},['instagram','threads'].map(p=>h('button',{'aria-pressed':String(p===selected),class:p===selected?'on':'',onclick:e=>{selected=p;for(const b of toggle.children){b.classList.toggle('on',b===e.currentTarget);b.setAttribute('aria-pressed',String(b===e.currentTarget));}draw();}},t('platform.'+p))));root.append(toggle,body);draw();return root;
  }
  function sessionCard(s) {
    return h('article', {
      class: 'ui-session-card'
    }, h('div', {}, ...(s.media || []).slice(0, 3).map(m => h('img', {
      src: m.url,
      alt: ''
    }))), h('h3', {}, s.title), chip(s.state || t('draft.state.plan'), 'neutral'), h('p', {}, s.description || ''), s.action);
  }
  function summaryPanel(m) {
    return h('aside', {
      class: 'ui-summary'
    }, h('h2', {}, t('gen.summary')), h('strong', {}, t('gen.summary.total', {
      total: m.total || 0
    })), h('p', {}, t('gen.summary.total.sub', {
      a: m.accounts || 0,
      n: m.count || 0
    })), ...(m.items || []).map(x => h('p', {}, icon(x.ok ? 'check' : 'warn'), x.text)), m.action);
  }
  function readiness(accountId,{images=true,storyMode=false}={}){
   const a=state.accounts.find(a=>a.id===accountId),profile=state.brandProfiles?.[accountId],settings=state.aiSettings,keys=new Set((settings?.keys||[]).map(k=>k.provider));
   const roles=storyMode?['storyteller','manager','scheduler',...(images?['concept','revision','visual','image','final']:[])]:['concept','revision',...(images?['visual','image','final']:[])];const missing=[...new Set(roles.filter(role=>{const agent=settings?.agents?.[role];return !agent||!keys.has(agent.provider)||role==='image'&&!settings?.providers?.[agent.provider]?.image;}).map(role=>settings?.agents?.[role]?.provider||'AI'))];
   const required=[{ok:!!profile?.seed?.trim(),text:t('gen.ready.brandkit.missing',{'@account':'@'+(a?.username||'')})},{ok:a?.status==='active',text:t('status.active')},{ok:missing.length===0,text:missing.length?t('gen.ready.key.missing',{provider:missing.join(', ')}):t('gen.ready')}];
   const recommended=['logo','visual',...(storyMode?['product']:[])].map(category=>({ok:profile?.assets?.some(x=>x.category===category)||false,text:t('brandkit.assets.'+category)}));return {ok:required.every(x=>x.ok),items:[...required,...recommended],completeness:Math.round(required.filter(x=>x.ok).length/3*60+recommended.filter(x=>x.ok).length/recommended.length*40),pending:!profile||!settings};
  }
  function showcase() {
    const key = name => t('ui.showcase.' + name);
    const section = (name, ...children) => h('section', {class: 'panel ui-showcase-section'}, h('h2', {}, key(name)), ...children);
    const demoAccounts = Array.from({length: 10}, (_, index) => ({
      id: 'showcase-' + index, username: 'brand.' + (index + 1),
      name: key('brand'), company_id: index < 5 ? 'showcase-a' : 'showcase-b',
      company_name: key(index < 5 ? 'companyA' : 'companyB'), followers_count: 1200 + index * 100,
      disabled: index === 9
    }));
    const demo = demoAccounts[0];
    const result = h('p', {role: 'status', 'aria-live': 'polite'}, key('noAction'));
    const action = (label, run, className = 'btn') => h('button', {class: className, onclick: run}, label);
    const finish = accepted => { result.textContent = key(accepted ? 'confirmed' : 'cancelled'); };
    const states = ['loading', 'empty', 'error', 'partial', 'success'];
    const notice = stateName => h('div', {class: 'ui-showcase-state', 'data-state': stateName},
      h('h3', {}, key(stateName)),
      chip(key(stateName), ({loading: 'info', empty: 'neutral', error: 'bad', partial: 'warn', success: 'ok'})[stateName], {icon: stateName === 'error' ? 'warn' : stateName === 'success' ? 'check' : 'info'}),
      h('p', {role: stateName === 'error' ? 'alert' : 'status'}, key(stateName + 'Body')));
    let failSave = false;
    const status = h('p', {role: 'status', 'aria-live': 'polite'}, key('autosaveIdle'));
    const save = autosave(async () => {
      await new Promise(resolve => setTimeout(resolve, 350));
      if (failSave) throw new Error(key('saveFailure'));
    }, {statusEl: status});
    const picker = (accounts, selected, mode = 'multi') => accountPicker({accounts, selected, mode,
      readiness: id => ({ok: id !== 'showcase-2', pending: false}),
      onChange: ids => { result.textContent = t('ui.showcase.selection', {count: ids.length}); }
    }).element;
    const pipeline = stateName => progressPipeline([
      {state: stateName === 'loading' ? 'working' : stateName === 'empty' ? 'todo' : 'done', label: t('agent.concept'), pct: stateName === 'loading' ? 30 : stateName === 'empty' ? 0 : 100, count: '1 / 1'},
      {state: stateName === 'error' ? 'failed' : ['loading', 'empty'].includes(stateName) ? 'todo' : 'done', label: t('agent.image'), pct: ['partial', 'success'].includes(stateName) ? 100 : 0, count: stateName === 'success' ? '12 / 12' : '0 / 12'},
      {state: stateName === 'success' ? 'done' : stateName === 'partial' ? 'working' : 'todo', label: t('agent.final'), pct: stateName === 'success' ? 100 : stateName === 'partial' ? 50 : 0, count: stateName === 'success' ? '12 / 12' : '0 / 12'}
    ]);
    return h('div', {class: 'ui-showcase'}, h('h1', {}, t('ui.title')), h('p', {}, key('intro')),
      section('chips', h('div', {class: 'row'}, ...['neutral', 'ok', 'warn', 'bad', 'info', 'concept', 'outline', 'selected'].map(tone => chip(key('tone.' + tone), tone, {dot: true}))), h('div', {class: 'row'}, ...Object.keys(labels).map(status => statusChip({status})))),
      section('dialogs', h('div', {class: 'row'},
        action(key('paid'), async () => finish(await confirmDialog({title: key('paidTitle'), body: key('paidBody'), tone: 'cost', details: [[key('now'), key('nowBody')], [key('later'), key('laterBody')], [key('provider'), key('providerBody')]]}))),
        action(key('destructive'), async () => finish(await confirmDialog({title: key('deleteTitle'), body: key('deleteBody'), tone: 'danger', confirmLabel: key('deleteAction')})), 'btn danger'),
        action(key('input'), async () => { const value = await inputDialog({title: key('inputTitle'), label: key('inputLabel'), hint: key('inputHint'), suggestions: [key('suggestion')]}); finish(value !== null); })), result),
      section('accounts', h('h3', {}, key('identity')), h('div', {class: 'row'}, accountChip(demo), accountChip(demo, {selected: true})),
        h('h3', {}, key('multiple')), picker(demoAccounts.slice(0, 4), [demo.id]),
        h('h3', {}, key('single')), picker(demoAccounts.slice(0, 4), [demo.id], 'single'),
        h('h3', {}, key('search')), picker(demoAccounts, [demo.id]), h('p', {}, key('searchHint')),
        h('h3', {}, key('empty')), picker([], []), h('p', {}, key('disabledReason'))),
      section('scope', scopeBar({page: '_ui', views: [{id: 'grid', label: t('view.grid')}, {id: 'list', label: t('view.list')}]}).element),
      section('readiness', ...[false, true].map(images => { const ready = readiness(state.accounts[0]?.id, {images, storyMode: true}); return h('div', {class: 'ui-showcase-state'}, h('h3', {}, key(images ? 'imageReadiness' : 'textReadiness')), h('strong', {}, ready.completeness + '%'), ...ready.items.map(item => h('p', {}, icon(item.ok ? 'check' : 'warn'), item.text))); })),
      section('states', ...states.map(stateName => h('div', {class: 'ui-showcase-state-group'}, notice(stateName), pipeline(stateName),
        summaryPanel({total: stateName === 'empty' ? 0 : 12, accounts: stateName === 'empty' ? 0 : 1, count: stateName === 'empty' ? 0 : 12,
          items: [{ok: stateName === 'success', text: key(stateName + 'Body')}]}),
        sessionCard({title: key('sessionTitle'), state: key(stateName), description: key(stateName + 'Body'),
          action: action(key(stateName === 'error' ? 'retry' : 'inspect'), () => { result.textContent = key('demoOnly'); })})))),
      section('emptyComponent', emptyState({title: key('emptyTitle'), body: key('emptyBody'), action: action(key('retry'), () => { result.textContent = key('demoOnly'); })})),
      section('preview', phonePreview({account: demo, caption: t('ui.caption')}), h('p', {}, key('previewHint'))),
      section('bulk', bulkBar({count: 2, actions: [action(key('deleteAction'), async () => finish(await confirmDialog({title: key('deleteTitle'), body: key('deleteBody'), tone: 'danger'})), 'btn danger'), action(key('inspect'), () => { result.textContent = key('demoOnly'); }, 'btn primary')]})),
      section('disabled', h('button', {class: 'btn primary', disabled: true, 'aria-describedby': 'showcase-disabled-reason'}, key('generate')), h('p', {id: 'showcase-disabled-reason'}, key('disabledReason'))),
      section('autosave', h('label', {class: 'ui-field'}, key('autosaveLabel'), h('input', {oninput: () => save.schedule(), onblur: () => save.flush()})),
        h('label', {}, h('input', {type: 'checkbox', onchange: event => { failSave = event.target.checked; }}), key('simulateFailure')), status,
        action(key('retrySave'), () => { failSave = false; save.schedule(); save.flush(); }), h('p', {}, key('autosaveHint'))));
  }
  return {
    chip,
    statusChip,
    confirmDialog,
    inputDialog,
    accountChip,
    accountPicker,
    scopeBar,
    scopeAccounts,
    inScope,
    readScope,
    readiness,
    emptyState,
    progressPipeline,
    bulkBar,
    phonePreview,
    sessionCard,
    summaryPanel,
    showcase
  };
}
function outside(e, node) {
  const r = node.getBoundingClientRect();
  return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
}
export const fmtNumber = n => Number(n || 0).toLocaleString('en-GB');
const date = (iso, options) => iso ? new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jakarta',
  hourCycle: 'h23',
  ...options
}).format(new Date(iso)) : '';
export const fmtDay = iso => date(iso, {
  weekday: 'short',
  day: 'numeric',
  month: 'short'
});
export const fmtTime = iso => date(iso, {
  hour: '2-digit',
  minute: '2-digit'
});
export const fmtSlot = iso => iso ? fmtDay(iso) + ' · ' + fmtTime(iso) : '';
export const fmtDT = fmtSlot;
export const fmtRange = (a, b) => date(a, {
  day: 'numeric',
  month: 'short'
}) + ' – ' + date(b, {
  day: 'numeric',
  month: 'short'
});
export function sessionTitle(plan) {
  let text = String(plan.brief || plan.title || '').split('\n').find(x => x.trim()) || '';
  text = text.replace(/^#+\s*/, '').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
  if (text === text.toUpperCase()) text = text.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  return text.length > 80 ? text.slice(0, 77).replace(/\s+\S*$/, '') + '…' : text;
}
export function readSessionGroups(userId) {
  try { const groups=JSON.parse(localStorage.getItem('lrm.session-groups.'+userId)||'[]');return Array.isArray(groups)?groups.filter(g=>Array.isArray(g.ids)&&g.ids.every(id=>typeof id==='string')):[]; } catch { return []; }
}
export function groupSessions(plans,runs,knownGroups=[]) {
  const grouped=[];
  for(const plan of [...plans].sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)))) {
    const known=knownGroups.find(g=>g.ids.includes(plan.id));
    const brief=String(plan.brief||'').split('\nWrite captions and on-image text in ')[0];
    const key=known?'batch:'+known.ids[0]:plan.session_id?'session:'+plan.session_id:[brief,plan.start_date,plan.end_date].join('\n');
    let group=grouped.find(s=>s.groupKey===key&&(known||plan.session_id||Math.abs(Date.parse(plan.created_at)-Date.parse(s.created_at))<=300000));
    if(!group){group={...plan,id:known?.ids[0]||plan.id,groupKey:key,title:sessionTitle({...plan,brief}),plan_ids:[],runs:[],content_count:0};grouped.push(group);}
    group.content_count+=Number(plan.content_count)||0;group.plan_ids.push(plan.id);group.runs.push(...runs.filter(r=>r.plan_id===plan.id));
  }
  for(const r of runs.filter(r=>!r.plan_id))grouped.push({id:r.id,title:r.title||sessionTitle(r),runs:[r],plan_ids:[],created_at:r.created_at,content_count:1});
  return grouped;
}
export function sessionState(s) {
 const runs=s.runs||[];
 if(!runs.length)return 'expired';
 if(runs.some(r=>['failed','concept_review','review'].includes(r.status)))return 'action';
 if(runs.some(r=>['running','queued'].includes(r.status)))return 'running';
 return runs.some(r=>r.status==='planned')?'plan':'done';
}
// A save that only ever says "something went wrong" turns a one-line server
// message into a support conversation. Report what the server actually said,
// and fall back to the status and code when it said nothing useful.
export function errorReason(e){
 if(!e)return t('common.error');
 if(typeof e==='string')return e;
 if(e.message&&(e.ui||e.code))return e.message;
 if(e.status)return `HTTP ${e.status}${e.code?' · '+e.code:''}${e.message?' · '+e.message:''}`;
 return e.message||t('common.error');
}
export function autosave(saveFn, {delay=1000,statusEl}={}) {
  let timer=null,pending=false,inFlight=null,error=null;
  function schedule(){pending=true;clearTimeout(timer);if(statusEl)statusEl.textContent=t('autosave.saving');timer=setTimeout(flush,delay);}
  async function flush(){
    clearTimeout(timer);
    if(inFlight){await inFlight;if(pending&&!error)return flush();return;}
    if(!pending)return;
    inFlight=(async()=>{while(pending){pending=false;try{await saveFn();error=null;if(statusEl)statusEl.textContent=t('autosave.saved',{'HH:MM':fmtTime(new Date())});}catch(e){error=e;pending=true;if(statusEl)statusEl.textContent=t('autosave.failed',{reason:errorReason(e)});break;}}})();
    try{await inFlight;}finally{inFlight=null;}
  }
  return {schedule,flush,get error(){return error;},dispose:flush};
}
