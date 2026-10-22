import { t } from "./strings.en.js";
// Persistent account story setup; provider execution stays in the server worker.
export async function storyWorkspace({
  h,
  accountPickerFactory,
  api,
  uploadFile,
  confirmDialog,
  inputDialog,
  icon,
  errMsg,
  technicalError,
  accounts,
  agents,
  canGenerateImages = true,
  dates,
  toast,
  fmtDT,
  fixedAccount = false,
  mode = "setup",
  onContext = () => {},
  onJob = () => {},
  onStarted = () => {}
}) {
  let stopped = false,
    profile = null,
    currentJob = '',
    lastSignature = '',
    dirty = false,
    requestId = '',
    requestSignature = '',
    approving = false,
    loadedAccount = '',
    saveTimer = 0,
    saveInFlight = null,
    uploads = 0,
    directionChanged = false;
  const account = h('select', {
    'aria-label': t("ui.copy.0453"),
    onchange: async () => {
      clearTimeout(saveTimer);
      try {
        if (dirty && loadedAccount) await save(loadedAccount);
        await loadProfile();
      } catch (e) {
        account.value = loadedAccount;
        generate.disabled = !profile?.seed;
        status.textContent = t("ui.copy.0454") + errMsg(e);
        throw e;
      }
    }
  }, accounts.map(a => h('option', {
    value: a.id
  }, `@${a.username}`)));
  const requested = new URLSearchParams(location.hash.split('?')[1] || '').get('story_account');
  if (accounts.some(a => a.id === requested)) account.value = requested;
  const seed = h('textarea', {
    'aria-label': t("ui.extra.66"),
    maxlength: 10000,
    rows: 5,
    placeholder: t("ui.copy.0455"),
    oninput: markDirty,
    onchange: () => save()
  });
  const rules = h('textarea', {
    'aria-label': t("ui.copy.0456"),
    maxlength: 6000,
    rows: 3,
    placeholder: t("ui.copy.0457"),
    oninput: markDirty,
    onchange: () => save()
  });
  const direction = h('textarea', {
    'aria-label': t("ui.copy.0458"),
    maxlength: 10000,
    rows: 3,
    oninput: () => {
      directionChanged = true;
    },
    placeholder: t("ui.copy.0459")
  });
  const editorDescription = h('p', {
    class: 'studio-editor-description'
  });
  const status = h('p', {
      class: 'story-save-status',
      role: 'status'
    }),
    assets = h('div', {
      class: 'brand-catalog'
    }),
    history = h('div', {
      class: 'story-memory'
    }),
    progress = h('div', {
      class: 'story-job-progress'
    }),
    proposals = h('div', {
      class: 'story-proposals'
    });
  const replace = (el, ...children) => el.replaceChildren(...children.filter(x => x != null && x !== false));
  const formatSlot=fmtDT;
  const label = {
    logo: t("ui.copy.0460"),
    visual: t("brandkit.assets.visual"),
    product: t("brandkit.assets.product"),
    video: 'Video / Reel'
  };
  const button = (text, onclick, primary = false, disabled = false) => h('button', {
    type: 'button',
    class: 'btn' + (primary ? ' primary' : ''),
    onclick,
    disabled
  }, text);
  function markDirty() {
    dirty = true;
    status.textContent = t("ui.sweep.62");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => save().catch(e => {
      if (!stopped) status.textContent = t("ui.copy.0461") + errMsg(e);
    }), 1200);
  }
  async function save(aid = loadedAccount || account.value) {
    clearTimeout(saveTimer);
    if (saveInFlight) await saveInFlight;
    if (!aid) throw new Error(t("ui.copy.0462"));
    const savedSeed = seed.value,
      savedRules = rules.value;
    saveInFlight = api('PUT', `/v1/generator/accounts/${aid}/brand`, {
      seed: savedSeed,
      brand_notes: savedRules
    });
    try {
      const saved = await saveInFlight;
      if (!stopped && aid === account.value) {
        profile = saved;
        if (seed.value === savedSeed && rules.value === savedRules) dirty = false;
        status.textContent = dirty ? t("ui.sweep.63") : t("ui.copy.0463") + fmtDT(profile.updated_at);
        renderHistory();
      }
    } finally {
      saveInFlight = null;
    }
  }
  async function loadProfile() {
    clearTimeout(saveTimer);
    generate.disabled = true;
    if (!account.value) {
      status.textContent = t("ui.copy.0464");
      setupLink.hidden = true;
      account.disabled = true;
      return;
    }
    status.textContent = t("ui.copy.0465");
    const aid = account.value,
      data = await api('GET', `/v1/generator/accounts/${aid}/brand`);
    if (stopped || aid !== account.value) return;
    loadedAccount = aid;
    profile = data;
    onContext({
      account: accounts.find(a => a.id === aid),
      profile: data
    });
    seed.value = data.seed || '';
    rules.value = data.brand_notes || '';
    direction.value = data.bible || data.seed || '';
    directionChanged = false;
    dirty = false;
    generate.disabled = !data.seed;
    editorDescription.textContent = data.seed ? t("ui.copy.0466") : t("ui.copy.0467");
    status.classList.toggle('story-needs-setup', !data.seed);
    currentJob = '';
    lastSignature = '';
    proposals.replaceChildren();
    status.textContent = data.seed ? t("ui.copy.0468") + data.next_episode : t("ui.copy.0469");
    if (mode === 'setup') {
      renderAssets();
      renderHistory();
    } else {
      setupLink.href = '#/accounts/' + encodeURIComponent(aid) + '?tab=brand';
      await refresh();
    }
  }
  function renderHistory() {
    replace(history, h('p', {
      class: 'muted small'
    }, t("ui.copy.0470", {
      "0": profile.next_episode
    })), profile.bible ? h('details', {}, h('summary', {}, t("ui.extra.67")), h('p', {}, profile.bible), h('p', {
      class: 'muted small'
    }, profile.memory)) : null, h('details', {}, h('summary', {}, t("ui.copy.0471", {
      "0": profile.episodes.length
    })), profile.episodes.map(e => h('p', {
      class: 'small'
    }, `#${e.episode_number} · ${e.title} · ${e.status}`))));
  }
  function renderAssets() {
    assets.replaceChildren(...Object.entries(label).map(([category, name]) => {
      const entries = profile.assets.filter(a => a.category === category),
        aid = account.value;
      const file = h('input', {
        type: 'file',
        hidden: true,
        multiple: true,
        accept: category === 'video' ? 'video/mp4,video/quicktime' : 'image/jpeg,image/png',
        'aria-label': `Upload ${name}`,
        onchange: async () => {
          const chosen = [...file.files];
          if (chosen.length > 20) {
            file.value = '';
            throw new Error(t("ui.copy.0472"));
          }
          uploads++;
          add.disabled = true;
          account.disabled = true;
          try {
            for (const f of chosen) {
              const m = await uploadFile(f, {
                inLibrary: false
              });
              profile = await api('POST', `/v1/generator/accounts/${aid}/assets`, {
                media_id: m.id,
                category,
                name: f.name.slice(0, 200),
                description: ''
              });
            }
            renderAssets();
            toast(t("ui.copy.0473"));
          } finally {
            file.value = '';
            add.disabled = false;
            uploads--;
            account.disabled = uploads > 0;
          }
        }
      });
      const add = button('+ ' + name, () => file.click());
      return h('section', {
        class: 'brand-category'
      }, h('div', {
        class: 'row'
      }, h('h3', {}, `${name} (${entries.length})`), add), h('p', {
        class: 'faint small'
      }, category === 'product' ? t("ui.copy.0474") : category === 'video' ? t("ui.copy.0475") : t("ui.copy.0476")), file, h('div', {
        class: 'brand-asset-grid'
      }, entries.map(a => h('article', {
        class: 'brand-asset'
      }, a.media?.type === 'video' ? h('video', {
        src: a.media.url,
        controls: true,
        preload: 'metadata'
      }) : h('img', {
        src: a.media?.url,
        alt: a.name,
        loading: 'lazy'
      }), h('b', {}, a.name), h('p', {
        class: 'faint small'
      }, a.description), h('div', {
        class: 'row'
      }, button('Edit', () => {
        const n = h('input', {
            value: a.name,
            maxlength: 200,
            'aria-label': t("ui.copy.0477")
          }),
          d = h('textarea', {
            maxlength: 2000,
            'aria-label': t("ui.extra.68")
          }, a.description);
        const dialog = h('dialog', {
          class: 'modal',
          'aria-label': t("ui.extra.69")
        }, h('h3', {}, t("ui.extra.69")), n, d, h('div', {
          class: 'row'
        }, button(t("common.save"), async () => {
          profile = await api('PATCH', `/v1/generator/accounts/${aid}/assets/${a.id}`, {
            category: a.category,
            name: n.value,
            description: d.value
          });
          dialog.close();
          renderAssets();
        }), button(t("common.cancel"), () => dialog.close())));
        document.body.append(dialog);
        dialog.addEventListener('close', () => dialog.remove(), {
          once: true
        });
        dialog.showModal();
        n.focus();
      }), button(t("ui.copy.0213"), async () => {
        if (!(await confirmDialog({
          title: t("ui.copy.0478"),
          body: t("dialog.danger.note"),
          tone: "danger",
          confirmLabel: t("dialog.confirm")
        }))) return;
        profile = await api('DELETE', `/v1/generator/accounts/${aid}/assets/${a.id}`);
        renderAssets();
      }))))));
    }));
  }
  async function refresh() {
    if (stopped || !account.value) return;
    const aid = account.value;
    try {
      const {
        data
      } = await api('GET', `/v1/generator/accounts/${aid}/story-jobs`);
      if (stopped || aid !== account.value) return;
      const j = data.find(x => x.id === currentJob) || data[0];
      if (!j) {
        onJob(null);
        progress.replaceChildren(h('p', {
          class: 'muted small'
        }, profile?.seed ? t("ui.copy.0479") : t("ui.copy.0480")));
        return;
      }
      currentJob = j.id;
      const signature = JSON.stringify(j);
      if (signature !== lastSignature) {
        lastSignature = signature;
        onJob(j);
        replace(progress, h('h3', {}, t("ui.copy.0481")), h('div', {
          class: 'story-agent-row'
        }, [['storyteller', t("agent.storyteller")], ['manager', t("agent.manager")], ['scheduler', t("agent.scheduler")]].map(([role, name]) => {
          const state = j.steps[role]?.status || 'waiting';
          return h('div', {
            class: `story-agent ${j.status === 'running' && state === 'running' ? 'working' : ''}`
          }, h('b', {}, name), h('span', {}, state === 'done' ? role === 'scheduler' && j.steps.scheduler?.source === 'rules' ? t("ui.copy.0482") : t("draft.state.done") : j.status === 'running' && state === 'running' ? t("ui.copy.0135") : j.status === 'failed' && state === 'running' ? t("draft.state.failed") : t("ui.copy.0004")));
        })), h('p', {
          class: 'small'
        }, {
          queued: t("ui.copy.0483"),
          running: t("ui.sweep.20"),
          completed: t("ui.copy.0484"),
          cancelled: t("ui.copy.0485"),
          failed: t("ui.copy.0486"),
          needs_revision: t("ui.sweep.64")
        }[j.status] || j.status), j.error ? technicalError(j.error) : null, j.steps.storyteller?.output ? h('details', {
          open: true
        }, h('summary', {}, t("ui.copy.0487")), h('p', {}, j.steps.manager?.output?.bible || j.steps.storyteller.output.bible), h('div', {
          class: 'story-output-episodes'
        }, (j.steps.manager?.output?.episodes || j.steps.storyteller.output.episodes || []).map((e, i) => h('article', {
          class: 'panel'
        }, h('b', {}, `${i + 1}. ${e.title || 'Episode'}`), h('p', {}, e.brief || ''), h('p', {
          class: 'muted small'
        }, e.caption || ''))))) : null, j.steps.manager?.output?.notes ? h('details', {}, h('summary', {}, t("ui.extra.70")), h('p', {}, j.steps.manager.output.notes)) : null, j.steps.scheduler?.warning ? h('p', {
          class: 'story-schedule-warning',
          role: 'status'
        }, j.steps.scheduler.warning) : null, j.steps.scheduler?.output?.discussion ? h('details', {}, h('summary', {}, t("ui.extra.71")), h('p', {}, j.steps.scheduler.output.discussion)) : null, j.plan_id ? h('a', {
          class: 'btn primary',
          href: '#/generator/drafts?status=all&plan=' + j.plan_id
        }, t("ui.copy.0488")) : null, ['queued', 'running'].includes(j.status) ? button(t("ui.copy.0489"), async () => {
          if (!(await confirmDialog({
            title: t("ui.copy.0490"),
            body: t("dialog.danger.note"),
            tone: "danger",
            confirmLabel: t("dialog.confirm")
          }))) return;
          await api('DELETE', `/v1/generator/story-jobs/${j.id}`);
          lastSignature = '';
          await refresh();
        }) : null, j.status === 'failed' ? button(t("ui.copy.0491"), async () => {
          if(!await confirmDialog({title:t('gen.failed.retry',{n:1}),body:t('dialog.cost.note'),tone:'cost',details:Object.entries(agents()).map(([role,a])=>[t('agent.'+role),a.provider+' / '+a.model]),confirmLabel:t('dialog.confirm')}))return;
          await api('POST', `/v1/generator/story-jobs/${j.id}/retry`, {
            confirm_cost: true,
            agents: agents()
          });
          lastSignature = '';
          await refresh();
        }) : null, j.status === 'needs_revision' ? h('p', {
          class: 'muted small'
        }, t("ui.copy.0492")) : null);
        if (j.status === 'completed') {
          const p = await api('GET', `/v1/generator/accounts/${aid}/brand`);
          if (!stopped && aid === account.value) {
            profile = p;
            onContext({
              account: accounts.find(a => a.id === aid),
              profile: p
            });
            if (!directionChanged) direction.value = p.bible || p.seed || '';
            status.textContent = t("ui.copy.0493") + p.next_episode;
            renderHistory();
          }
        }
      }
      if (j.plan_id) {
        const {
          data: runs
        } = await api('GET', '/v1/generator/runs');
        if (stopped || aid !== account.value) return;
        const ready = runs.filter(r => r.plan_id === j.plan_id && r.status === 'review');
        replace(proposals, h('div', {
          class: 'story-proposal-grid'
        }, runs.filter(r => r.plan_id === j.plan_id).sort((a, b) => (a.story_episode || 0) - (b.story_episode || 0)).map(r => h('a', {
          class: 'story-proposal',
          href: '#/generator/drafts?status=all&plan=' + j.plan_id + '&id=' + r.id
        }, r.media?.[0]?.type === 'video' ? h('video', {
          src: r.media[0].url,
          controls: true,
          preload: 'metadata'
        }) : r.media?.[0]?.url ? h('img', {
          src: r.media[0].url,
          alt: r.title
        }) : h('div', {
          class: 'draft-card-placeholder'
        }, r.status === 'queued' || r.status === 'running' ? t("ui.copy.0494") : t("ui.copy.0495")), h('b', {}, `#${r.story_episode} ${r.title}`), h('span', {
          class: 'pill'
        }, r.content_type), h('p', {
          class: 'small'
        }, r.caption), h('small', {}, formatSlot(r.scheduled_at)), h('p', {
          class: 'faint small'
        }, r.schedule_reason), h('small', {}, r.status)))), ready.length ? button(t("ui.copy.0496", {
          "0": ready.length
        }), async () => {
          if (approving) return;
          if (!(await confirmDialog({
            title: t("ui.copy.0497", {
              "0": ready.length
            }),
            body: t("draft.approve.dialog.body"),
            tone: "default",
            confirmLabel: t("dialog.confirm")
          }))) return;
          approving = true;
          let approved = 0;
          const failed = [];
          for (const r of ready) {
            try {
              await api('POST', `/v1/generator/runs/${r.id}/approve`, {});
              approved++;
            } catch (e) {
              failed.push(r.title + ': ' + errMsg(e));
            }
          }
          toast(t("ui.copy.0498", {
            "0": approved
          }) + (failed.length ? t("ui.copy.0499", {
            "0": failed.length
          }) : ''), failed.length > 0);
          if (failed.length) status.textContent = failed.join(' · ');
          approving = false;
          await refresh();
        }, true, approving) : null);
      }
    } catch (error) {
      if (!stopped) status.textContent = errMsg(error) || t("ui.copy.0500");
    }
  }
  const generate = button(t("ui.copy.0251"), async () => {
    if (uploads > 0) throw new Error(t("ui.copy.0501"));
    if (!profile?.seed) throw new Error(t("ui.copy.0502"));
    const body = {
      account_id: account.value,
      direction: direction.value,
      content_count: Number(dates.count.value),
      slide_count: Number(dates.slides.value),
      start_date: dates.from.value,
      end_date: dates.until.value,
      times: dates.times.value.split(',').map(_targetValue => _targetValue.trim()).filter(Boolean),
      produce_media: canGenerateImages,
      agents: agents(),
      confirm_cost: true
    };
    const sig = JSON.stringify(body);
    if (sig !== requestSignature) {
      requestId = crypto.randomUUID();
      requestSignature = sig;
    }
    if (!(await confirmDialog({
      title: t('gen.preflight.title', {
        title: accounts.find(a => a.id === account.value)?.username || ''
      }),
      body: t('dialog.cost.note'),
      tone: 'cost',
      details: Object.entries(agents()).map(([role, a]) => [t('agent.' + role), a.provider + ' / ' + a.model]),
      confirmLabel: t('dialog.confirm')
    }))) return;
    const j = await api('POST', '/v1/generator/story-jobs', {
      ...body,
      request_id: requestId
    });
    currentJob = j.id;
    lastSignature = '';
    requestSignature = '';
    onStarted(j);
  }, true, true);
  const setupLink = h('a', {
    class: 'btn'
  }, t("ui.extra.72"));
  const accountControl = h('div', {
    class: 'story-account-control'
  }, accountPickerFactory ? accountPickerFactory({
    accounts,
    selected: [account.value],
    mode: 'single',
    onChange: ids => {
      if (ids[0] && account.value !== ids[0]) {
        account.value = ids[0];
        account.dispatchEvent(new Event('change'));
      }
    }
  }).element : h('label', {}, t('ui.copy.0482'), account), setupLink);
  const foundation = h('details', {
    open: true
  }, h('summary', {}, t("ui.copy.0504")), h('label', {}, t("ui.extra.66"), seed), h('label', {}, t("ui.copy.0505"), rules), button(t("ui.copy.0506"), async () => {
    await save();
    toast(t("ui.copy.0507"));
  }), status, history);
  const element = mode === 'setup' ? h('section', {
    class: 'panel story-workspace'
  }, h('h2', {}, t("ui.extra.73")), h('p', {
    class: 'muted small'
  }, t("ui.copy.0508")), foundation, h('details', {
    open: true
  }, h('summary', {}, t("ui.copy.0509")), assets), h('a', {
    class: 'btn primary',
    href: '#/generator?story_account=' + encodeURIComponent(account.value)
  }, t("ui.copy.0510"))) : h('section', {
    class: 'panel story-workspace story-production'
  }, h('div', {
    class: 'story-production-header'
  }, h('div', {}, h('h2', {}, t("ui.copy.0511")), editorDescription), status), h('div', {
    class: 'story-production-form'
  }, h('label', {}, t("ui.copy.0512"), direction), h('div', {
    class: 'story-production-actions'
  }, h('p', {
    class: 'faint small'
  }, t("ui.copy.0513")), generate)), progress, proposals);
  await loadProfile();
  const timer = mode === 'production' ? setInterval(refresh, 3000) : 0;
  return {
    element,
    accountControl,
    async dispose() {
      clearInterval(timer);
      clearTimeout(saveTimer);
      if (dirty && loadedAccount) await save(loadedAccount);
      stopped = true;
    }
  };
}
