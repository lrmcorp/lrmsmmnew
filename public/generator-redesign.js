// Phases 3 & 4 — Content Generator (G1–G10), Quick Brand Kit (G3), Pre-flight (G4),
// Running/Failed Session Cards (G5/G6), AI Team & Models Drawer (G7), Schedule Popover (G8), Story Bible (G9).
import { t } from './strings.en.js';
import { readContentPrefs, writeContentPrefs, contentInstruction } from './ui.js';
import { groupSessions, sessionTitle } from './draft-sessions.js';

const EXCLUDED_TEXT_MODEL_RE = /transcribe|computer.?use|tts|embedding|image|imagen|nano.?banana|veo|audio|whisper|moderation|realtime/i;
const RECOMMENDED_TEXT_MODEL_RE = /^(gpt-4\.1|gpt-4\.1-mini|gpt-4o|claude-sonnet-4|claude-3-7-sonnet|claude-3-5-sonnet|claude-3-5-haiku|gemini-2\.5-pro|gemini-2\.5-flash|gemini-fixture-flash)/i;

export function filterModelsForRole(role, providerConfig = {}, preferredModel = '') {
  if (role === 'image') {
    const list = providerConfig.imageModels || [];
    const fallback = providerConfig.imageModel;
    const items = [...list];
    if (preferredModel && !providerConfig.live && !items.some(m => m.id === preferredModel)) {
      items.push({ id: preferredModel, name: t('generator.model.saved', { model: preferredModel }) });
    } else if (fallback && !items.some(m => m.id === fallback)) {
      items.push({ id: fallback, name: fallback });
    }
    return { recommended: items, other: [], hidden: [] };
  }
  const raw = providerConfig.textModels || [];
  const recommended = [];
  const other = [];
  const hidden = [];
  for (const m of raw) {
    const label = `${m.id || ''} ${m.name || ''}`;
    if (EXCLUDED_TEXT_MODEL_RE.test(label)) {
      hidden.push(m);
    } else if (RECOMMENDED_TEXT_MODEL_RE.test(m.id || '') || m.id === providerConfig.textModel) {
      recommended.push(m);
    } else {
      other.push(m);
    }
  }
  if (preferredModel && !providerConfig.live && !recommended.some(m => m.id === preferredModel) && !other.some(m => m.id === preferredModel)) {
    if (EXCLUDED_TEXT_MODEL_RE.test(preferredModel)) hidden.push({ id: preferredModel, name: preferredModel });
    else other.push({ id: preferredModel, name: t('generator.model.saved', { model: preferredModel }) });
  }
  if (!recommended.length && other.length) {
    recommended.push(...other.splice(0, Math.min(3, other.length)));
  }
  return { recommended, other, hidden };
}

export function computePresetAgents(preset, providers = {}, savedKeys = [], baseAgents = {}) {
  const keyedTextProviders = savedKeys.map(k => k.provider).filter(p => providers[p]?.textModel || providers[p]?.textModels?.length);
  const keyedImageProviders = savedKeys.map(k => k.provider).filter(p => providers[p]?.image);
  const primaryText = keyedTextProviders[0] || (providers.openai ? 'openai' : Object.keys(providers)[0] || 'openai');
  const reviewText = keyedTextProviders.find(p => p !== primaryText) || primaryText;
  const imageProvider = keyedImageProviders[0] || Object.keys(providers).find(p => providers[p]?.image) || 'openai';

  function pickTextModel(provId, tier) {
    const p = providers[provId] || {};
    const { recommended, other } = filterModelsForRole('concept', p);
    const all = [...recommended, ...other];
    if (!all.length) return p.textModel || 'gpt-4.1-mini';
    if (tier === 'light') {
      const light = all.find(m => /mini|haiku|flash|nano/i.test(m.id));
      return light ? light.id : all[0].id;
    }
    if (tier === 'strong') {
      const strong = all.find(m => !/mini|haiku|flash|nano/i.test(m.id));
      return strong ? strong.id : all[0].id;
    }
    return p.textModel && !EXCLUDED_TEXT_MODEL_RE.test(p.textModel) ? p.textModel : all[0].id;
  }

  function pickImageModel(provId) {
    const p = providers[provId] || {};
    const list = p.imageModels || [];
    return list[0]?.id || p.imageModel || 'gpt-image-1';
  }

  const roles = ['concept', 'revision', 'visual', 'image', 'final', 'storyteller', 'manager', 'scheduler'];
  const out = {};
  for (const role of roles) {
    const prev = baseAgents[role] || {};
    if (role === 'image') {
      out[role] = { provider: imageProvider, model: pickImageModel(imageProvider), instructions: prev.instructions || '' };
      continue;
    }
    const isCreative = ['concept', 'visual', 'storyteller', 'manager'].includes(role);
    const prov = isCreative ? primaryText : reviewText;
    const tier = preset === 'economy' ? 'light' : preset === 'quality' ? 'strong' : (isCreative ? 'strong' : 'light');
    out[role] = { provider: prov, model: pickTextModel(prov, tier), instructions: prev.instructions || '' };
  }
  return out;
}

export function parseStoryBible(text = '') {
  const clean = String(text || '').trim();
  if (!clean) return { fields: [], chapters: [], paragraphs: [] };
  const fields = [];
  const chapters = [];
  const paragraphs = [];

  const fieldPatterns = [
    ['Brand Essence', /brand\s+essence\s*:\s*([^\n]+)/i],
    ['Brand Personality', /brand\s+personality\s*:\s*([^\n]+)/i],
    ['Tone of Voice', /tone\s+of\s+voice\s*:\s*([^\n]+)/i],
    ['Visual Identity', /visual\s+identity(?:\s+keywords)?\s*:\s*([^\n]+)/i],
  ];
  for (const [label, re] of fieldPatterns) {
    const m = clean.match(re);
    if (m && m[1]) fields.push({ label, value: m[1].replace(/\*\*/g, '').trim() });
  }

  const chapterRe = /(?:^|\n)\s*(?:#+\s*|\*\*\s*)?(?:Chapter|Bab|Arc)\s+(\d+)\s*(?:[-–—:]\s*([^\n(*]+))?(?:\((?:Posts?|Episodes?)\s*(\d+)\s*[-–—]\s*(\d+)\))?\s*(?:\*\*)?\s*:?\s*([^\n]*)/gi;
  let m;
  while ((m = chapterRe.exec(clean)) !== null) {
    const num = Number(m[1]);
    const title = (m[2] || `Chapter ${num}`).replace(/\*\*/g, '').trim();
    const startPost = m[3] ? Number(m[3]) : (num - 1) * 4 + 1;
    const endPost = m[4] ? Number(m[4]) : num * 4;
    const summary = (m[5] || '').replace(/\*\*/g, '').trim();
    chapters.push({ number: num, title, startPost, endPost, range: `${startPost}–${endPost}`, summary });
  }

  for (const line of clean.split(/\n+/)) {
    const stripped = line.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim();
    if (!stripped) continue;
    if (/^(brand\s+essence|brand\s+personality|tone\s+of\s+voice|visual\s+identity|chapter\s+\d+|bab\s+\d+)/i.test(stripped)) continue;
    paragraphs.push(stripped);
  }

  return { fields, chapters, paragraphs };
}

export function computeBrandKitCompleteness(accountId, profile, prefs) {
  const p = profile || {};
  const assets = p.assets || [];
  const hasSeed = Boolean(p.seed && p.seed.trim().length >= 10);
  const hasRules = Boolean(p.brand_notes && p.brand_notes.trim().length >= 5);
  const hasLogo = assets.some(a => a.category === 'logo');
  const hasVisual = assets.some(a => a.category === 'visual');
  const hasProduct = assets.some(a => a.category === 'product');

  const checks = [
    { key: 'seed', label: t('brandkit.identity'), ok: hasSeed, weight: 35, nextStep: t('gen.brandkit.q1') },
    { key: 'rules', label: t('brandkit.rules'), ok: hasRules, weight: 20, nextStep: t('brandkit.rules') },
    { key: 'logo', label: t('brandkit.assets.logo'), ok: hasLogo, weight: 15, nextStep: t('readiness.logo') },
    { key: 'visual', label: t('brandkit.assets.visual'), ok: hasVisual, weight: 15, nextStep: t('readiness.visual') },
    { key: 'product', label: t('brandkit.assets.product'), ok: hasProduct, weight: 15, nextStep: t('readiness.product') },
  ];
  const score = checks.reduce((sum, c) => sum + (c.ok ? c.weight : 0), 0);
  const doneCount = checks.filter(c => c.ok).length;
  const missingFirst = checks.find(c => !c.ok);
  return {
    percent: score,
    doneCount,
    totalCount: checks.length,
    complete: hasSeed && hasRules && hasLogo && hasVisual,
    readyForGenerator: hasSeed,
    nextStep: missingFirst ? missingFirst.nextStep : null,
    missingLabel: missingFirst ? missingFirst.label : null,
    checks,
    prefs: prefs || readContentPrefs(accountId),
  };
}

export function mapProviderError(errorText = '', providerName = 'AI provider') {
  const s = String(errorText || '');
  if (/429|quota|rate.?limit|resource_exhausted/i.test(s)) return t('error.429', { provider: providerName });
  if (/401|403|invalid.*key|unauthorized|authentication|permission/i.test(s)) return t('error.401', { provider: providerName });
  if (/timeout|timed?\s*out|502|503|504|econnreset|unavailable/i.test(s)) return t('error.timeout', { provider: providerName });
  return t('error.provider');
}

export function openStoryBibleModal({ h, icon, modal, go, account, profile }) {
  const raw = [profile?.bible, profile?.seed].filter(Boolean).join('\n\n');
  const parsed = parseStoryBible(raw);
  const nextEp = Number(profile?.next_episode || 1);

  const body = h('div', { class: 'story-bible-modal' },
    h('div', { class: 'story-bible-meta' },
      h('span', { class: 'ui-chip tone-info' }, `@${account?.username || ''}`),
      h('span', { class: 'muted small' }, t('story.history.next', { n: nextEp }))
    ),
    parsed.fields.length ? h('div', { class: 'story-bible-fields' },
      parsed.fields.map(f => h('div', { class: 'story-bible-card' },
        h('span', { class: 'story-bible-card-label' }, f.label),
        h('p', {}, f.value)
      ))
    ) : null,
    parsed.chapters.length ? h('div', { class: 'story-bible-chapters' },
      h('h3', {}, t('story.arc')),
      parsed.chapters.map(ch => {
        const totalInCh = Math.max(1, ch.endPost - ch.startPost + 1);
        const doneInCh = Math.max(0, Math.min(totalInCh, nextEp - ch.startPost));
        const pct = Math.round((doneInCh / totalInCh) * 100);
        const stateLabel = doneInCh >= totalInCh ? t('status.done') : doneInCh > 0 ? t('gen.running') : t('status.planned');
        return h('div', { class: `story-chapter-tile ${doneInCh >= totalInCh ? 'is-done' : doneInCh > 0 ? 'is-active' : ''}` },
          h('div', { class: 'story-chapter-head' },
            h('b', {}, `Chapter ${ch.number} · ${ch.title}`),
            h('span', { class: 'muted small' }, `Episodes ${ch.range} · ${stateLabel}`)
          ),
          ch.summary ? h('p', { class: 'small muted' }, ch.summary) : null,
          h('div', { class: 'story-chapter-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) },
            h('i', { style: { width: `${pct}%` } })
          )
        );
      })
    ) : null,
    parsed.paragraphs.length ? h('div', { class: 'story-bible-prose' },
      parsed.paragraphs.map(p => h('p', {}, p))
    ) : (!parsed.fields.length && !parsed.chapters.length ? h('p', { class: 'muted' }, t('story.foundation.missing')) : null),
    profile?.memory ? h('div', { class: 'story-bible-memory' },
      h('h3', {}, t('brandkit.tab.memory')),
      h('p', { class: 'small muted' }, String(profile.memory).replace(/^#+\s*/gm, ''))
    ) : null
  );

  let dialog;
  dialog = modal(t('story.bible'), body, [
    h('button', { type: 'button', class: 'btn', onclick: () => dialog.close() }, t('dialog.cancel')),
    account ? h('button', { type: 'button', class: 'btn primary', onclick: () => { dialog.close(); go(`/accounts/${encodeURIComponent(account.id)}?tab=brand`); } }, icon('pen'), t('story.edit.text')) : null,
  ].filter(Boolean));
  return dialog;
}

export async function openQuickBrandKitDrawer({ h, api, ui, icon, avatar, uploadFile, toast, errMsg, confirmDialog, state, account, onSaved }) {
  document.querySelector('.quick-brandkit-drawer')?.remove();
  const aid = account.id;
  let profile = state.brandProfiles?.[aid] || await api('GET', `/v1/generator/accounts/${encodeURIComponent(aid)}/brand`);
  state.brandProfiles[aid] = profile;

  let activeStep = 'identity';
  const prefs = readContentPrefs(aid);
  let selectedTones = new Set(['Warm', 'Expert'].filter(tone => (profile.seed || '').toLowerCase().includes(tone.toLowerCase())));
  const toneOptions = ['Warm', 'Playful', 'Expert', 'Minimal', 'Bold', 'Refined'];

  const statusEl = h('span', { class: 'autosave-indicator muted small', role: 'status' },
    profile.updated_at ? t('autosave.saved', { 'HH:MM': new Date(profile.updated_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) }) : '');

  const seedInput = h('textarea', {
    rows: 4,
    maxlength: 10000,
    placeholder: t('legacy.describe_the_brand_audience_goals_story_style_and_direction'),
    'aria-label': t('gen.brandkit.q1'),
  }, profile.seed || '');

  // Parse existing rules into Do / Don't lines
  const rawNotes = String(profile.brand_notes || '');
  const doLines = [];
  const dontLines = [];
  for (const line of rawNotes.split('\n').map(l => l.trim()).filter(Boolean)) {
    if (/^(don'?t|avoid|never|no\b)/i.test(line)) dontLines.push(line.replace(/^[-•*]\s*/, '').replace(/^don'?t\s*:\s*/i, ''));
    else doLines.push(line.replace(/^[-•*]\s*/, '').replace(/^do\s*:\s*/i, ''));
  }
  const doInput = h('textarea', {
    rows: 3,
    placeholder: 'Use warm natural lighting, show verified product benefits, keep brand colours consistent.',
    'aria-label': t('brandkit.do'),
  }, doLines.join('\n'));
  const dontInput = h('textarea', {
    rows: 3,
    placeholder: 'Never invent clinical claims or guaranteed results.',
    'aria-label': t('brandkit.dont'),
  }, dontLines.join('\n'));

  const langSelect = h('select', { 'aria-label': t('gen.brandkit.lang') },
    ['id', 'en', 'mixed'].map(code => h('option', { value: code, selected: prefs.language === code }, t('content.language.' + code)))
  );
  const emojiToggle = h('input', { type: 'checkbox', checked: prefs.emoji !== false, 'aria-label': t('gen.brandkit.emoji') });

  function serializeRules() {
    const dos = doInput.value.split('\n').map(s => s.trim()).filter(Boolean).map(s => `Do: ${s}`);
    const donts = dontInput.value.split('\n').map(s => s.trim()).filter(Boolean).map(s => `Don't: ${s}`);
    return [...dos, ...donts].join('\n');
  }

  let saveTimer = null;
  async function saveNow() {
    clearTimeout(saveTimer);
    statusEl.textContent = t('autosave.saving');
    try {
      let seedVal = seedInput.value.trim();
      if (selectedTones.size && !/tone of voice:/i.test(seedVal)) {
        seedVal = `${seedVal}${seedVal ? '\n' : ''}Tone of Voice: ${[...selectedTones].join(', ')}`;
      }
      const rulesVal = serializeRules();
      writeContentPrefs(aid, { language: langSelect.value, emoji: emojiToggle.checked });
      profile = await api('PUT', `/v1/generator/accounts/${encodeURIComponent(aid)}/brand`, {
        seed: seedVal,
        brand_notes: rulesVal,
      });
      state.brandProfiles[aid] = profile;
      statusEl.textContent = t('autosave.saved', {
        'HH:MM': new Date(profile.updated_at || Date.now()).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })
      });
      onSaved?.(profile);
    } catch (e) {
      statusEl.textContent = t('autosave.failed', { reason: errMsg(e) });
    }
  }
  function scheduleSave() {
    statusEl.textContent = t('autosave.saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 700);
  }

  seedInput.addEventListener('input', scheduleSave);
  doInput.addEventListener('input', scheduleSave);
  dontInput.addEventListener('input', scheduleSave);
  langSelect.addEventListener('change', scheduleSave);
  emojiToggle.addEventListener('change', scheduleSave);

  const stepBody = h('div', { class: 'quick-brandkit-body' });
  const stepTabs = h('div', { class: 'seg quick-brandkit-tabs', role: 'tablist' });
  const footerEl = h('div', { class: 'draft-drawer-foot' });

  function cleanAssetLabel(filename = '') {
    return filename
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/^(whatsapp\s+image|chatgpt\s+image|img|dsc|screenshot)[_\-\s0-9a-z]*/i, '')
      .replace(/[_-]+/g, ' ')
      .trim() || 'Brand asset';
  }

  function renderStep() {
    const steps = [
      ['identity', '1 · Identity'],
      ['rules', '2 · Rules'],
      ['assets', '3 · Assets'],
    ];
    stepTabs.replaceChildren(...steps.map(([id, label]) =>
      h('button', {
        type: 'button',
        role: 'tab',
        class: activeStep === id ? 'on' : '',
        'aria-selected': String(activeStep === id),
        onclick: () => { activeStep = id; renderStep(); }
      }, label)
    ));

    if (activeStep === 'identity') {
      const toneRow = h('div', { class: 'quick-tone-chips' },
        toneOptions.map(tone => {
          const on = selectedTones.has(tone);
          return h('button', {
            type: 'button',
            class: `ui-chip ${on ? 'tone-selected' : 'tone-outline'}`,
            'aria-pressed': String(on),
            onclick: () => {
              on ? selectedTones.delete(tone) : selectedTones.add(tone);
              renderStep();
              scheduleSave();
            }
          }, tone);
        })
      );
      stepBody.replaceChildren(
        h('label', { class: 'field' }, h('span', {}, t('gen.brandkit.q1')), seedInput),
        h('div', { class: 'field' }, h('span', {}, t('gen.brandkit.tone')), toneRow),
        h('div', { class: 'grid2' },
          h('label', { class: 'field' }, h('span', {}, t('gen.brandkit.lang')), langSelect, h('small', { class: 'muted small' }, t('gen.lang.help'))),
          h('label', { class: 'field check-field' },
            h('span', {}, t('gen.brandkit.emoji')),
            h('label', { class: 'check' }, emojiToggle, h('span', {}, emojiToggle.checked ? t('gen.brandkit.emoji.on') : t('gen.brandkit.emoji.off')))
          )
        )
      );
      footerEl.replaceChildren(
        h('button', { type: 'button', class: 'btn', onclick: closeDrawer }, t('gen.brandkit.later')),
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn primary', onclick: async () => { await saveNow(); activeStep = 'rules'; renderStep(); } }, t('gen.brandkit.next', { step: 'Rules' }))
      );
    } else if (activeStep === 'rules') {
      stepBody.replaceChildren(
        h('label', { class: 'field' }, h('span', {}, t('brandkit.do')), doInput),
        h('label', { class: 'field' }, h('span', {}, t('brandkit.dont')), dontInput)
      );
      footerEl.replaceChildren(
        h('button', { type: 'button', class: 'btn', onclick: () => { activeStep = 'identity'; renderStep(); } }, t('dialog.back')),
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn primary', onclick: async () => { await saveNow(); activeStep = 'assets'; renderStep(); } }, t('gen.brandkit.next', { step: 'Assets' }))
      );
    } else {
      const categories = [
        ['logo', t('brandkit.assets.logo')],
        ['visual', t('brandkit.assets.visual')],
        ['product', t('brandkit.assets.product')],
      ];
      stepBody.replaceChildren(...categories.map(([cat, label]) => {
        const items = (profile.assets || []).filter(a => a.category === cat);
        const fileInput = h('input', {
          type: 'file',
          hidden: true,
          multiple: cat !== 'logo',
          accept: 'image/jpeg,image/png',
          onchange: async () => {
            const files = [...fileInput.files];
            if (!files.length) return;
            statusEl.textContent = t('autosave.saving');
            try {
              for (const f of files) {
                const m = await uploadFile(f, { inLibrary: false });
                profile = await api('POST', `/v1/generator/accounts/${encodeURIComponent(aid)}/assets`, {
                  media_id: m.id,
                  category: cat,
                  name: cleanAssetLabel(f.name).slice(0, 200),
                  description: '',
                });
              }
              state.brandProfiles[aid] = profile;
              onSaved?.(profile);
              renderStep();
              toast(t('legacy.brand_asset_saved'));
            } catch (e) {
              toast(errMsg(e), true);
            } finally {
              fileInput.value = '';
            }
          }
        });
        return h('div', { class: 'quick-asset-section' },
          h('div', { class: 'row' },
            h('b', {}, `${label} (${items.length})`),
            h('span', { class: 'spacer' }),
            h('button', { type: 'button', class: 'btn sm', onclick: () => fileInput.click() }, icon('plus'), t('media.upload'))
          ),
          fileInput,
          items.length ? h('div', { class: 'quick-asset-strip' },
            items.map(a => h('div', { class: 'quick-asset-thumb' },
              a.media?.url ? h('img', { src: a.media.url, alt: a.name }) : null,
              h('span', {}, a.name)
            ))
          ) : h('p', { class: 'muted small' }, t('posts.media.empty'))
        );
      }));
      footerEl.replaceChildren(
        h('button', { type: 'button', class: 'btn', onclick: () => { activeStep = 'rules'; renderStep(); } }, t('dialog.back')),
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn primary', onclick: async () => { await saveNow(); closeDrawer(); } }, t('dialog.save'))
      );
    }
  }

  const scrim = h('div', { class: 'draft-drawer-scrim', onclick: () => closeDrawer() });
  const drawer = h('aside', {
    class: 'draft-edit-drawer quick-brandkit-drawer',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': t('gen.brandkit.quick')
  },
    h('div', { class: 'draft-drawer-head' },
      avatar(account, 'ui-avatar'),
      h('div', {},
        h('b', {}, t('gen.brandkit.quick')),
        h('div', { class: 'muted small' }, `@${account.username}`)
      ),
      h('span', { class: 'spacer' }),
      statusEl,
      h('button', { type: 'button', class: 'btn ghost sm', 'aria-label': t('dialog.close'), onclick: () => closeDrawer() }, icon('x'))
    ),
    stepTabs,
    stepBody,
    footerEl
  );

  async function closeDrawer() {
    clearTimeout(saveTimer);
    await saveNow();
    scrim.remove();
    drawer.remove();
  }

  renderStep();
  document.body.append(scrim, drawer);
  requestAnimationFrame(() => seedInput.focus());
}

export function openAgentsDrawer({ h, api, ui, icon, modal, toast, errMsg, config, mode, currentAgents, onApply, onOpenCanvas, onRefreshGemini }) {
  document.querySelector('.gen-agents-drawer')?.remove();
  const activeRoles = mode === 'storyline'
    ? ['storyteller', 'manager', 'scheduler', 'concept', 'revision', 'visual', 'image', 'final']
    : ['concept', 'revision', 'visual', 'image', 'final'];

  const roleLabels = {
    concept: t('agent.concept'),
    revision: t('agent.revision'),
    visual: t('agent.visual'),
    image: t('agent.image'),
    final: t('agent.final'),
    storyteller: t('agent.storyteller'),
    manager: t('agent.manager'),
    scheduler: t('agent.scheduler'),
  };
  const roleDescs = {
    concept: t('generator.agent.idea'),
    revision: t('generator.agent.critique'),
    visual: t('legacy.aligns_image_directions_with_references_and_the_account_feed'),
    image: t('generator.agent.images'),
    final: t('generator.agent.review'),
    storyteller: t('legacy.continues_the_brand_story_using_its_seed_and_memory'),
    manager: t('generator.agent.brand'),
    scheduler: t('legacy.chooses_schedule_slots_and_explains_why'),
  };

  let draftAgents = structuredClone(currentAgents);
  let activePreset = detectPreset(draftAgents);

  function detectPreset(agentsMap) {
    for (const presetId of ['economy', 'balanced', 'quality']) {
      const target = computePresetAgents(presetId, config.providers, config.keys, agentsMap);
      const matches = activeRoles.every(r => agentsMap[r]?.provider === target[r]?.provider && agentsMap[r]?.model === target[r]?.model);
      if (matches) return presetId;
    }
    return 'custom';
  }

  const presetBar = h('div', { class: 'gen-preset-cards', role: 'radiogroup', 'aria-label': t('gen.agents') });
  const rowsBox = h('div', { class: 'gen-agent-table' });

  function renderDrawer() {
    const presets = [
      ['economy', 'Economy', t('gen.preset.economy')],
      ['balanced', 'Balanced', t('gen.preset.balanced')],
      ['quality', 'Quality', t('gen.preset.quality')],
      ...(activePreset === 'custom' ? [['custom', t('gen.preset.custom'), 'Custom model selection for this session.']] : []),
    ];
    presetBar.replaceChildren(...presets.map(([id, title, desc]) =>
      h('button', {
        type: 'button',
        role: 'radio',
        'aria-checked': String(activePreset === id),
        class: `gen-preset-card ${activePreset === id ? 'is-selected' : ''}`,
        onclick: () => {
          if (id === 'custom') return;
          activePreset = id;
          draftAgents = computePresetAgents(id, config.providers, config.keys, draftAgents);
          renderDrawer();
        }
      },
        h('div', { class: 'row' }, h('b', {}, title), activePreset === id ? ui.chip(t('status.active'), 'selected') : null),
        h('p', { class: 'muted small' }, desc)
      )
    ));

    rowsBox.replaceChildren(...activeRoles.map(role => {
      const name = roleLabels[role] || role;
      const cur = draftAgents[role] || { provider: 'openai', model: 'gpt-4.1-mini', instructions: '' };
      const providerEntries = Object.entries(config.providers || {}).filter(([, p]) => role !== 'image' || p.image);
      const validProvider = providerEntries.some(([id]) => id === cur.provider) ? cur.provider : (providerEntries[0]?.[0] || 'openai');
      cur.provider = validProvider;

      const { recommended, other, hidden } = filterModelsForRole(role, config.providers[validProvider], cur.model);
      const allValid = [...recommended, ...other];
      if (!allValid.some(m => m.id === cur.model) && allValid.length) {
        cur.model = allValid[0].id;
      }

      const providerSelect = h('select', {
        'aria-label': `Provider ${name}`,
        onchange: e => {
          cur.provider = e.target.value;
          const nextModels = filterModelsForRole(role, config.providers[cur.provider]);
          cur.model = nextModels.recommended[0]?.id || nextModels.other[0]?.id || '';
          activePreset = detectPreset(draftAgents);
          renderDrawer();
        }
      }, providerEntries.map(([id, p]) => h('option', { value: id, selected: id === cur.provider }, p.name)));

      const modelSelect = h('select', {
        'aria-label': `Model ${name}`,
        onchange: e => {
          cur.model = e.target.value;
          activePreset = detectPreset(draftAgents);
          renderDrawer();
        }
      },
        role === 'image'
          ? recommended.map(m => h('option', { value: m.id, selected: m.id === cur.model }, m.name))
          : [
              recommended.length ? h('optgroup', { label: t('gen.models.recommended') },
                recommended.map(m => h('option', { value: m.id, selected: m.id === cur.model }, m.name))
              ) : null,
              other.length ? h('optgroup', { label: t('gen.models.other') },
                other.map(m => h('option', { value: m.id, selected: m.id === cur.model }, m.name))
              ) : null,
            ].filter(Boolean)
      );

      const instructionsInput = h('textarea', {
        rows: 2,
        maxlength: 4000,
        'aria-label': `${t('gen.agents.instructions')} ${name}`,
        placeholder: t('gen.agents.instructions'),
        oninput: e => { cur.instructions = e.target.value; }
      }, cur.instructions || '');

      return h('div', { class: 'gen-agent-row', 'data-agent-role': role },
        h('div', { class: 'gen-agent-info' },
          h('b', {}, name),
          h('p', { class: 'muted small' }, roleDescs[role] || '')
        ),
        h('div', { class: 'gen-agent-controls' },
          h('label', {}, h('span', { class: 'small muted' }, t('generator.provider')), providerSelect),
          h('label', {}, h('span', { class: 'small muted' }, t('generator.model')), modelSelect)
        ),
        hidden.length ? h('details', { class: 'gen-agent-hidden-models' },
          h('summary', { class: 'faint small' }, `${t('gen.models.hidden')} (${hidden.length})`),
          h('p', { class: 'faint small' }, hidden.map(m => m.name || m.id).join(', '))
        ) : null,
        h('details', { class: 'gen-agent-instructions' },
          h('summary', { class: 'small' }, t('gen.agents.instructions')),
          instructionsInput
        )
      );
    }));
  }

  const scrim = h('div', { class: 'draft-drawer-scrim', onclick: () => close() });
  const drawer = h('aside', {
    class: 'draft-edit-drawer gen-agents-drawer',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': t('gen.agents')
  },
    h('div', { class: 'draft-drawer-head' },
      h('div', {},
        h('b', {}, t('gen.agents')),
        h('div', { class: 'muted small' }, t('gen.agents.sub', { mode: mode === 'storyline' ? t('draft.mode.story') : t('draft.mode.campaign') }))
      ),
      h('span', { class: 'spacer' }),
      h('button', {
        type: 'button',
        class: 'btn sm ghost',
        onclick: async () => {
          await onRefreshGemini?.();
          renderDrawer();
          toast(t('legacy.gemini_models_synced_from_your_api_key'));
        }
      }, icon('refresh'), t('legacy.refresh_gemini_models')),
      h('button', { type: 'button', class: 'btn ghost sm', 'aria-label': t('dialog.close'), onclick: () => close() }, icon('x'))
    ),
    h('div', { class: 'draft-drawer-body' },
      presetBar,
      rowsBox
    ),
    h('div', { class: 'draft-drawer-foot' },
      h('button', {
        type: 'button',
        class: 'btn',
        onclick: () => {
          onApply(draftAgents, activePreset);
          close();
          onOpenCanvas?.();
        }
      }, t('gen.agents.canvas')),
      h('span', { class: 'spacer' }),
      h('button', {
        type: 'button',
        class: 'btn',
        onclick: async () => {
          try {
            await api('PUT', '/v1/generator/settings', { agents: draftAgents });
            onApply(draftAgents, activePreset);
            toast(t('legacy.agent_preset_saved'));
          } catch (e) {
            toast(errMsg(e), true);
          }
        }
      }, t('gen.agents.default')),
      h('button', {
        type: 'button',
        class: 'btn primary',
        onclick: () => {
          onApply(draftAgents, activePreset);
          close();
        }
      }, t('gen.agents.apply'))
    )
  );

  function close() {
    scrim.remove();
    drawer.remove();
  }

  renderDrawer();
  document.body.append(scrim, drawer);
}

export async function createGeneratorPage({
  h, api, ui, icon, avatar, state, isOwner, shell, pagehead, modal, confirmDialog,
  uploadFile, workflowCanvas, toast, errMsg, go, fmtDay, fmtTime, fmtSlot, fmtRange, ago
}) {
  let stopped = false;
  let config = await api('GET', '/v1/generator/settings');
  state.providerKeys = config.keys || [];
  state.providers = config.providers || {};

  async function syncGeminiCatalog(force = false) {
    if (!config.keys?.some(k => k.provider === 'gemini')) return;
    try {
      const catalog = await api('GET', '/v1/generator/providers/gemini/models' + (force ? '?refresh=true' : ''));
      config.providers.gemini = { ...config.providers.gemini, ...catalog };
      state.providers = config.providers;
    } catch { /* ignore */ }
  }
  await syncGeminiCatalog(false);

  // Preload Brand Kit profiles for active Instagram accounts so readiness is instant
  const igAccounts = state.accounts.filter(a => a.platform === 'instagram' && a.status === 'active');
  await Promise.all(igAccounts.map(async a => {
    if (state.brandProfiles[a.id]) return;
    try {
      state.brandProfiles[a.id] = await api('GET', `/v1/generator/accounts/${encodeURIComponent(a.id)}/brand`);
    } catch { /* ignore */ }
  }));

  const query = new URLSearchParams(location.hash.split('?')[1] || '');
  const requestedStoryAcc = query.get('story_account') || '';
  const requestedBrief = query.get('brief') || '';
  const requestedMode = query.get('mode') === 'campaign' || requestedBrief ? 'campaign' : (requestedStoryAcc ? 'storyline' : 'campaign');

  let mode = requestedMode;
  let companyId = state.scope?.companyId || null;
  if (requestedStoryAcc) {
    const acc = state.accounts.find(a => a.id === requestedStoryAcc);
    if (acc) companyId = acc.company_id || null;
  }

  // Restore or initialize selected accounts
  const selected = new Set();
  if (requestedStoryAcc && state.accounts.some(a => a.id === requestedStoryAcc && a.status === 'active')) {
    selected.add(requestedStoryAcc);
  } else {
    try {
      const savedIds = JSON.parse(localStorage.getItem('lrm.gen.accounts') || '[]');
      for (const id of savedIds) {
        if (state.accounts.some(a => a.id === id && a.status === 'active')) selected.add(id);
      }
    } catch { /* ignore */ }
    if (!selected.size) {
      const companyAccounts = getVisibleAccounts(companyId, mode);
      const readyFirst = companyAccounts.filter(a => ui.readiness(a.id)?.ok !== false);
      const initialList = readyFirst.length ? readyFirst : companyAccounts;
      if (mode === 'storyline') {
        if (initialList[0]) selected.add(initialList[0].id);
      } else {
        initialList.forEach(a => selected.add(a.id));
      }
    }
  }

  function persistSelected() {
    try { localStorage.setItem('lrm.gen.accounts', JSON.stringify([...selected])); } catch { /* ignore */ }
  }

  function getVisibleAccounts(compId, currentMode) {
    return state.accounts
      .filter(a => a.status === 'active' && (currentMode !== 'storyline' || a.platform === 'instagram'))
      .filter(a => !compId || (a.company_id || 'none') === compId)
      .sort((a, b) => {
        const ra = ui.readiness(a.id)?.ok === true ? 0 : 1;
        const rb = ui.readiness(b.id)?.ok === true ? 0 : 1;
        if (ra !== rb) return ra - rb;
        return String(a.username || '').localeCompare(String(b.username || ''));
      });
  }

  // Build initial agents map using filtered models
  const allRoles = ['concept', 'revision', 'visual', 'image', 'final', 'storyteller', 'manager', 'scheduler'];
  let sessionAgents = {};
  for (const role of allRoles) {
    const saved = config.agents?.[role] || {};
    const fallbackProv = role === 'image'
      ? (Object.keys(config.providers).find(id => config.providers[id]?.image) || 'openai')
      : 'openai';
    const provId = config.providers[saved.provider] && (role !== 'image' || config.providers[saved.provider]?.image)
      ? saved.provider
      : fallbackProv;
    const { recommended, other } = filterModelsForRole(role, config.providers[provId], saved.model);
    const validModels = [...recommended, ...other];
    const modelId = validModels.some(m => m.id === saved.model)
      ? saved.model
      : (validModels[0]?.id || config.providers[provId]?.[role === 'image' ? 'imageModel' : 'textModel'] || 'gpt-4.1-mini');
    sessionAgents[role] = { provider: provId, model: modelId, instructions: saved.instructions || '' };
  }
  let currentPresetName = 'Balanced';

  // Step 2 state
  let briefText = requestedBrief.slice(0, 10000);
  let storyDirection = ''; // Starts empty per spec!
  let formatType = 'single'; // 'single' | 'carousel'
  let slideCount = 1;
  let imageSource = 'ai'; // 'ai' | 'own'
  let sessionLanguage = ''; // '' means default from Brand Kit
  let allowSchedulerAdjust = true;

  // Step 3 state
  const tomorrowIso = new Date(Date.now() + 864e5 + 7 * 3600000).toISOString().slice(0, 10);
  const twoWeeksIso = new Date(Date.now() + 14 * 864e5 + 7 * 3600000).toISOString().slice(0, 10);
  let postCount = 12;
  let startDate = tomorrowIso;
  let endDate = twoWeeksIso;
  let timesList = ['12:15', '19:15'];
  let spreadMode = 'even'; // 'even' | 'days'
  let spreadDays = new Set([1, 3, 5]); // Mon, Wed, Fri

  // DOM containers
  const draftsBadge = h('span', { class: 'count soft' }, state.stats?.draftSessionsNeedsAction || '');
  draftsBadge.hidden = !state.stats?.draftSessionsNeedsAction;

  const sessionsArea = h('div', { class: 'gen-sessions-area' });
  const step1Card = h('section', { class: 'panel gen-step-card', id: 'gen-step-1' });
  const step2Card = h('section', { class: 'panel gen-step-card', id: 'gen-step-2' });
  const step3Card = h('section', { class: 'panel gen-step-card', id: 'gen-step-3' });
  const summaryAside = h('aside', { class: 'panel gen-summary-card', id: 'gen-summary' });
  const mobileFooter = h('div', { class: 'gen-mobile-footer' });
  const advancedLinkBar = h('div', { class: 'gen-advanced-bar' });

  // Persistent inputs so typing doesn't lose focus
  const briefCounter = h('span', { class: 'muted small' }, `${briefText.length.toLocaleString('en-GB')} / 10,000`);
  const briefInput = h('textarea', {
    class: 'gen-brief-input',
    rows: 4,
    maxlength: 10000,
    placeholder: t('gen.brief.placeholder'),
    'aria-label': t('generator.brief.label'),
    oninput: e => {
      briefText = e.target.value;
      briefInput.removeAttribute('aria-invalid');
      briefCounter.textContent = `${briefText.length.toLocaleString('en-GB')} / 10,000`;
      renderSummary();
    }
  }, briefText);

  const directionInput = h('textarea', {
    class: 'gen-direction-input',
    rows: 3,
    maxlength: 10000,
    placeholder: t('gen.direction.placeholder'),
    'aria-label': t('legacy.session_direction'),
    oninput: e => {
      storyDirection = e.target.value;
      renderSummary();
    }
  }, '');

  function getEffectiveLanguageInfo() {
    const chosenAccounts = state.accounts.filter(a => selected.has(a.id));
    const accountLangs = [...new Set(chosenAccounts.map(a => readContentPrefs(a.id).language))];
    const defaultLang = accountLangs.length <= 1 ? (accountLangs[0] || 'id') : 'per_account';
    const effective = sessionLanguage || defaultLang;
    const labelMap = {
      id: t('content.language.id'),
      en: t('content.language.en'),
      mixed: t('content.language.mixed'),
      per_account: t('gen.lang.peraccount'),
    };
    return { defaultLang, effective, label: labelMap[effective] || t('content.language.id') };
  }

  function renderStep1() {
    const visible = getVisibleAccounts(companyId, mode);
    // Keep selection valid within visible accounts if switching mode
    if (mode === 'storyline') {
      const firstValid = [...selected].find(id => visible.some(a => a.id === id && ui.readiness(id)?.ok !== false))
        || visible.find(a => ui.readiness(a.id)?.ok !== false)?.id
        || [...selected][0]
        || visible[0]?.id;
      selected.clear();
      if (firstValid) selected.add(firstValid);
    }

    const groups = [
      ...state.companies.map(c => ({ id: c.id, name: c.name, count: state.accounts.filter(a => a.company_id === c.id && a.status === 'active').length })),
    ];
    const unassignedCount = state.accounts.filter(a => !a.company_id && a.status === 'active').length;
    if (unassignedCount) groups.push({ id: 'none', name: t('scope.company.unassigned'), count: unassignedCount });
    const currentCompanyName = groups.find(g => g.id === companyId)?.name || t('scope.company.all');

    const companyDropdown = h('details', { class: 'scope-company gen-company-picker' },
      h('summary', {}, icon('building'), h('span', {}, currentCompanyName), icon('chevron-down')),
      h('div', { class: 'scope-company-menu' },
        h('button', {
          type: 'button',
          onclick: () => {
            companyId = null;
            selected.clear();
            getVisibleAccounts(null, mode).forEach(a => { if (mode === 'campaign' || !selected.size) selected.add(a.id); });
            persistSelected();
            renderAll();
          }
        }, t('scope.company.all'), h('small', {}, state.accounts.filter(a => a.status === 'active').length)),
        groups.map(g => h('button', {
          type: 'button',
          disabled: !g.count,
          onclick: () => {
            companyId = g.id;
            selected.clear();
            getVisibleAccounts(g.id, mode).forEach(a => { if (mode === 'campaign' || !selected.size) selected.add(a.id); });
            persistSelected();
            renderAll();
          }
        }, g.name, h('small', {}, t('scope.company.count', { n: g.count, s: g.count === 1 ? '' : 's' }))))
      )
    );

    const pickerAccounts = visible.map(a => {
      const profile = state.brandProfiles[a.id];
      const hasBrandKit = Boolean(profile?.seed);
      if (mode === 'storyline') {
        const ep = profile?.next_episode || 1;
        return {
          ...a,
          displaySuffix: ` · Ep. ${ep}`,
          disabled: !hasBrandKit,
          disabledReason: t('picker.disabled.story'),
        };
      }
      return a;
    });

    const pickerEl = ui.accountPicker({
      accounts: pickerAccounts,
      selected: [...selected],
      mode: mode === 'storyline' ? 'single' : 'multi',
      readiness: id => ui.readiness(id, { aiImages: imageSource === 'ai', story: mode === 'storyline' }),
      onChange: ids => {
        selected.clear();
        ids.forEach(id => selected.add(id));
        persistSelected();
        renderAll();
      }
    });

    // Enhance chips for Story mode: show "· Ep. N" and let disabled chips open Quick Brand Kit G3
    if (mode === 'storyline') {
      const buttons = [...pickerEl.querySelectorAll('.account-chip:not(.more)')];
      buttons.forEach((btn, idx) => {
        const acc = pickerAccounts[idx];
        if (!acc) return;
        const ep = state.brandProfiles[acc.id]?.next_episode;
        if (ep) {
          btn.append(h('small', { class: 'gen-chip-ep' }, ` · Ep. ${ep}`));
        }
        if (acc.disabled) {
          btn.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            openQuickBrandKitDrawer({
              h, api, ui, icon, avatar, uploadFile, toast, errMsg, confirmDialog, state, account: acc,
              onSaved: () => { selected.clear(); selected.add(acc.id); renderAll(); }
            });
          });
        }
      });
    }

    const selectedInVisible = visible.filter(a => selected.has(a.id)).length;
    step1Card.replaceChildren(
      h('div', { class: 'gen-step-head' },
        h('h2', {}, mode === 'storyline' ? t('gen.step1.story') : t('gen.step1')),
        mode === 'campaign' ? h('div', { class: 'gen-step-meta' },
          h('span', { class: 'muted small' }, t('picker.count', { n: selectedInVisible, m: visible.length })),
          ' · ',
          h('button', {
            type: 'button',
            class: 'link-btn',
            onclick: () => {
              visible.forEach(a => selected.add(a.id));
              persistSelected();
              renderAll();
            }
          }, t('picker.all'))
        ) : null
      ),
      h('div', { class: 'gen-step1-row' }, companyDropdown, icon('right'), pickerEl),
      h('p', { class: 'faint small gen-dot-helper' },
        h('span', { class: 'readiness-dot-inline', 'aria-hidden': 'true' }),
        t('picker.dot.help')
      )
    );
  }

  function renderStep2() {
    const modeSwitch = h('div', { class: 'seg gen-mode-switch', role: 'tablist', 'aria-label': t('legacy.content_mode') },
      h('button', {
        type: 'button',
        role: 'tab',
        'aria-selected': String(mode === 'storyline'),
        class: mode === 'storyline' ? 'on' : '',
        onclick: () => {
          mode = 'storyline';
          allowSchedulerAdjust = true;
          renderAll();
        }
      }, t('gen.mode.story')),
      h('button', {
        type: 'button',
        role: 'tab',
        'aria-selected': String(mode === 'campaign'),
        class: mode === 'campaign' ? 'on' : '',
        onclick: () => {
          mode = 'campaign';
          allowSchedulerAdjust = false;
          renderAll();
        }
      }, t('gen.mode.campaign'))
    );

    const langInfo = getEffectiveLanguageInfo();
    const langSelect = h('select', {
      'aria-label': t('gen.lang'),
      onchange: e => {
        sessionLanguage = e.target.value;
        renderSummary();
      }
    },
      langInfo.defaultLang === 'per_account'
        ? h('option', { value: '', selected: sessionLanguage === '' }, t('gen.lang.peraccount'))
        : h('option', { value: '', selected: sessionLanguage === '' }, t('gen.lang.default', { language: t('content.language.' + langInfo.defaultLang) })),
      ['id', 'en', 'mixed'].map(code => h('option', { value: code, selected: sessionLanguage === code }, t('content.language.' + code)))
    );

    const formatRow = h('div', { class: 'gen-options-bar' },
      h('div', { class: 'gen-option-group' },
        h('span', { class: 'gen-option-label' }, t('gen.format')),
        h('div', { class: 'seg' },
          h('button', {
            type: 'button',
            class: formatType === 'single' ? 'on' : '',
            onclick: () => { formatType = 'single'; slideCount = 1; renderStep2(); renderSummary(); }
          }, t('gen.format.single')),
          h('button', {
            type: 'button',
            class: formatType === 'carousel' ? 'on' : '',
            onclick: () => { formatType = 'carousel'; if (slideCount < 2) slideCount = 3; renderStep2(); renderSummary(); }
          }, t('gen.format.carousel'))
        )
      ),
      h('div', { class: 'gen-option-group' },
        h('span', { class: 'gen-option-label' }, t('gen.slides')),
        h('div', { class: 'gen-stepper' },
          h('button', {
            type: 'button',
            class: 'btn sm',
            disabled: formatType === 'single' || slideCount <= 1,
            'aria-label': 'Decrease slides',
            onclick: () => { slideCount = Math.max(1, slideCount - 1); if (slideCount === 1) formatType = 'single'; renderStep2(); renderSummary(); }
          }, '–'),
          h('input', {
            type: 'number',
            min: 1,
            max: 10,
            value: String(slideCount),
            disabled: formatType === 'single',
            'aria-label': t('gen.slides'),
            onchange: e => {
              slideCount = Math.max(1, Math.min(10, Number(e.target.value) || 1));
              formatType = slideCount > 1 ? 'carousel' : 'single';
              renderStep2();
              renderSummary();
            }
          }),
          h('button', {
            type: 'button',
            class: 'btn sm',
            disabled: formatType === 'single' || slideCount >= 10,
            'aria-label': 'Increase slides',
            onclick: () => { slideCount = Math.min(10, slideCount + 1); renderStep2(); renderSummary(); }
          }, '+')
        )
      ),
      mode === 'campaign' ? h('div', { class: 'gen-option-group' },
        h('span', { class: 'gen-option-label' }, t('gen.source')),
        h('div', { class: 'seg' },
          h('button', {
            type: 'button',
            class: imageSource === 'ai' ? 'on' : '',
            onclick: () => { imageSource = 'ai'; renderStep2(); renderSummary(); }
          }, t('gen.source.ai')),
          h('button', {
            type: 'button',
            class: imageSource === 'own' ? 'on' : '',
            onclick: () => { imageSource = 'own'; renderStep2(); renderSummary(); }
          }, t('gen.source.own'))
        )
      ) : null,
      h('div', { class: 'gen-option-group' },
        h('label', { class: 'gen-lang-label' },
          h('span', { class: 'gen-option-label' }, t('gen.lang')),
          langSelect
        )
      )
    );

    if (mode === 'campaign') {
      const quickIdeas = [
        ['Promo', t('gen.idea.promo')],
        ['Product education', t('gen.idea.edu')],
        ['Testimonial', t('gen.idea.testi')],
        ['Behind the scenes', t('gen.idea.bts')],
      ];
      step2Card.replaceChildren(
        h('div', { class: 'gen-step-head' },
          h('h2', {}, t('gen.step2')),
          modeSwitch
        ),
        h('div', { class: 'gen-brief-wrap' },
          briefInput,
          h('div', { class: 'gen-brief-foot' },
            h('div', { class: 'gen-quick-ideas' },
              h('span', { class: 'muted small' }, t('gen.ideas')),
              quickIdeas.map(([label, sentence]) =>
                h('button', {
                  type: 'button',
                  class: 'ui-chip tone-outline gen-idea-chip',
                  onclick: () => {
                    briefText = (briefInput.value.trim() ? briefInput.value.trim() + '\n' : '') + sentence;
                    briefInput.value = briefText;
                    briefInput.removeAttribute('aria-invalid');
                    briefCounter.textContent = `${briefText.length.toLocaleString('en-GB')} / 10,000`;
                    briefInput.focus();
                    renderSummary();
                  }
                }, label)
              )
            ),
            briefCounter
          )
        ),
        formatRow
      );
    } else {
      const storyAccId = [...selected][0];
      const storyAcc = state.accounts.find(a => a.id === storyAccId);
      const profile = state.brandProfiles[storyAccId];
      const nextEp = Number(profile?.next_episode || 1);
      const endEp = nextEp + Number(postCount) - 1;
      const parsed = parseStoryBible([profile?.bible, profile?.seed].filter(Boolean).join('\n\n'));

      const storyArcCard = h('div', { class: 'gen-story-arc-card' },
        h('div', { class: 'row' },
          h('div', {},
            h('b', {}, `${t('story.arc')} · @${storyAcc?.username || 'account'}`),
            h('p', { class: 'muted small' },
              nextEp > 1
                ? t('story.arc.done', { n: nextEp - 1, a: nextEp, b: endEp })
                : `Starting episodes ${nextEp}–${endEp}`
            )
          ),
          h('span', { class: 'spacer' }),
          storyAcc ? h('button', {
            type: 'button',
            class: 'btn sm',
            onclick: () => openStoryBibleModal({ h, icon, modal, go, account: storyAcc, profile })
          }, t('story.view')) : null
        ),
        parsed.chapters.length ? h('div', { class: 'gen-chapter-strip' },
          parsed.chapters.map(ch => {
            const done = nextEp > ch.endPost;
            const current = nextEp >= ch.startPost && nextEp <= ch.endPost;
            return h('div', { class: `gen-chapter-pill ${done ? 'is-done' : current ? 'is-current' : ''}` },
              h('b', {}, `Ch. ${ch.number}: ${ch.title}`),
              h('small', {}, `Ep. ${ch.range}`)
            );
          })
        ) : null
      );

      step2Card.replaceChildren(
        h('div', { class: 'gen-step-head' },
          h('h2', {}, t('gen.step2.story')),
          modeSwitch
        ),
        storyArcCard,
        h('label', { class: 'field' },
          h('span', { class: 'sr-only' }, t('legacy.session_direction')),
          directionInput
        ),
        formatRow
      );
    }
  }

  function openSchedulePopover(anchorEl) {
    document.querySelector('.gen-schedule-popover')?.remove();
    const countInput = h('input', {
      type: 'number',
      min: 1,
      max: 30,
      value: String(postCount),
      'aria-label': t('legacy.posts_in_plan'),
      oninput: e => {
        postCount = Math.max(1, Math.min(30, Number(e.target.value) || 1));
        updateRhythm();
        renderStep3();
        renderStep2();
        renderSummary();
      }
    });
    const startInput = h('input', {
      type: 'date',
      min: tomorrowIso,
      value: startDate,
      'aria-label': t('legacy.plan_start_date'),
      onchange: e => {
        startDate = e.target.value >= tomorrowIso ? e.target.value : tomorrowIso;
        if (endDate < startDate) endDate = startDate;
        endInput.min = startDate;
        endInput.value = endDate;
        updateRhythm();
        renderStep3();
        renderSummary();
      }
    });
    const endInput = h('input', {
      type: 'date',
      min: startDate,
      value: endDate,
      'aria-label': t('legacy.plan_end_date'),
      onchange: e => {
        endDate = e.target.value >= startDate ? e.target.value : startDate;
        updateRhythm();
        renderStep3();
        renderSummary();
      }
    });

    function applyPreset(kind) {
      const base = new Date(Date.now() + 864e5 + 7 * 3600000);
      if (kind === '2w') {
        startDate = base.toISOString().slice(0, 10);
        endDate = new Date(base.getTime() + 13 * 864e5).toISOString().slice(0, 10);
      } else if (kind === '1m') {
        startDate = base.toISOString().slice(0, 10);
        endDate = new Date(base.getTime() + 29 * 864e5).toISOString().slice(0, 10);
      } else if (kind === 'week') {
        startDate = base.toISOString().slice(0, 10);
        endDate = new Date(base.getTime() + 6 * 864e5).toISOString().slice(0, 10);
      } else if (kind === 'monday') {
        const day = base.getUTCDay();
        const add = (8 - day) % 7 || 7;
        const mon = new Date(base.getTime() + add * 864e5);
        startDate = mon.toISOString().slice(0, 10);
        endDate = new Date(mon.getTime() + 13 * 864e5).toISOString().slice(0, 10);
      }
      startInput.value = startDate;
      endInput.min = startDate;
      endInput.value = endDate;
      updateRhythm();
      renderStep3();
      renderSummary();
    }

    const rhythmEl = h('p', { class: 'muted small gen-rhythm-note' });
    function updateRhythm() {
      const days = Math.max(1, Math.round((Date.parse(endDate) - Date.parse(startDate)) / 864e5) + 1);
      const every = (days / Math.max(1, postCount)).toFixed(1).replace(/\.0$/, '');
      rhythmEl.textContent = t('gen.schedule.rhythm', { n: postCount, d: days, x: every });
    }
    updateRhythm();

    const spreadWrap = h('div', { class: 'gen-spread-wrap' });
    function drawSpread() {
      const dayLabels = [
        [1, t('cal.mon')], [2, t('cal.tue')], [3, t('cal.wed')],
        [4, t('cal.thu')], [5, t('cal.fri')], [6, t('cal.sat')], [0, t('cal.sun')]
      ];
      spreadWrap.replaceChildren(
        h('div', { class: 'seg' },
          h('button', {
            type: 'button',
            class: spreadMode === 'even' ? 'on' : '',
            onclick: () => { spreadMode = 'even'; drawSpread(); }
          }, t('gen.schedule.spread.even')),
          h('button', {
            type: 'button',
            class: spreadMode === 'days' ? 'on' : '',
            onclick: () => { spreadMode = 'days'; drawSpread(); }
          }, t('gen.schedule.spread.days'))
        ),
        spreadMode === 'days' ? h('div', { class: 'gen-weekday-pills' },
          dayLabels.map(([d, lbl]) =>
            h('button', {
              type: 'button',
              class: `ui-chip ${spreadDays.has(d) ? 'tone-selected' : 'tone-outline'}`,
              onclick: () => {
                if (spreadDays.has(d) && spreadDays.size > 1) spreadDays.delete(d);
                else spreadDays.add(d);
                drawSpread();
              }
            }, lbl)
          )
        ) : null
      );
    }
    drawSpread();

    const pop = h('div', {
      class: 'gen-schedule-popover panel',
      role: 'dialog',
      'aria-label': t('gen.step3'),
      onkeydown: e => { if (e.key === 'Escape') { pop.remove(); anchorEl?.focus(); } }
    },
      h('div', { class: 'gen-preset-pills' },
        [['2w', '2 weeks'], ['1m', '1 month'], ['week', 'This week'], ['monday', 'From next Monday']].map(([k, label]) =>
          h('button', { type: 'button', class: 'ui-chip tone-outline', onclick: () => applyPreset(k) }, label)
        )
      ),
      h('div', { class: 'gen-pop-grid' },
        h('label', {}, h('span', { class: 'small muted' }, mode === 'storyline' ? 'Episodes' : 'Posts per account'), countInput),
        h('label', {}, h('span', { class: 'small muted' }, t('legacy.from_date_wib')), startInput),
        h('label', {}, h('span', { class: 'small muted' }, t('legacy.to_date_wib')), endInput)
      ),
      spreadWrap,
      rhythmEl,
      h('div', { class: 'row end' },
        h('button', { type: 'button', class: 'btn sm primary', onclick: () => { pop.remove(); anchorEl?.focus(); } }, t('dialog.confirm'))
      )
    );

    step3Card.append(pop);
    countInput.focus();
  }

  function renderStep3() {
    const fmtShortDate = ymdStr => {
      if (!ymdStr) return '';
      return new Date(ymdStr + 'T00:00:00+07:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' });
    };

    const countBtn = h('button', {
      type: 'button',
      class: 'gen-token-btn',
      onclick: e => openSchedulePopover(e.currentTarget)
    }, mode === 'storyline' ? `${postCount} episodes` : `${postCount} posts`);

    const startBtn = h('button', {
      type: 'button',
      class: 'gen-token-btn',
      onclick: e => openSchedulePopover(e.currentTarget)
    }, fmtShortDate(startDate));

    const endBtn = h('button', {
      type: 'button',
      class: 'gen-token-btn',
      onclick: e => openSchedulePopover(e.currentTarget)
    }, fmtShortDate(endDate));

    const timeChips = h('span', { class: 'gen-time-chips' },
      timesList.map((tm, idx) =>
        h('span', { class: 'gen-time-chip' },
          tm,
          timesList.length > 1 ? h('button', {
            type: 'button',
            class: 'gen-time-remove',
            'aria-label': `Remove ${tm}`,
            onclick: () => {
              timesList.splice(idx, 1);
              renderStep3();
              renderSummary();
            }
          }, icon('x')) : null
        )
      ),
      h('button', {
        type: 'button',
        class: 'gen-add-time-btn',
        onclick: async () => {
          const input = h('input', { type: 'time', value: '15:00', 'aria-label': t('generator.time.label') });
          let d;
          d = modal(t('gen.schedule.addtime'), h('label', { class: 'field' }, h('span', {}, t('generator.time.label')), input), [
            h('button', { type: 'button', class: 'btn', onclick: () => d.close() }, t('dialog.cancel')),
            h('button', {
              type: 'button',
              class: 'btn primary',
              onclick: () => {
                const v = input.value.trim();
                if (/^\d{2}:\d{2}$/.test(v) && !timesList.includes(v)) {
                  timesList.push(v);
                  timesList.sort();
                }
                d.close();
                renderStep3();
                renderSummary();
              }
            }, t('dialog.save'))
          ]);
        }
      }, t('gen.schedule.addtime'))
    );

    const sentence = mode === 'storyline'
      ? h('div', { class: 'gen-schedule-sentence' },
          'Continue with ', countBtn, ' from ', startBtn, ' to ', endBtn, ', at ', timeChips, ' WIB.'
        )
      : h('div', { class: 'gen-schedule-sentence' },
          'Create ', countBtn, ' per account, from ', startBtn, ' to ', endBtn, ', at ', timeChips, ' WIB.'
        );

    const schedulerCheckbox = h('input', {
      type: 'checkbox',
      checked: allowSchedulerAdjust,
      onchange: e => { allowSchedulerAdjust = e.target.checked; }
    });

    step3Card.replaceChildren(
      h('div', { class: 'gen-step-head' }, h('h2', {}, t('gen.step3'))),
      sentence,
      h('label', { class: 'check gen-scheduler-toggle' },
        schedulerCheckbox,
        h('span', {}, t('gen.scheduler.toggle'))
      )
    );
  }

  function getChecklistState() {
    const chosenAccounts = state.accounts.filter(a => selected.has(a.id));
    const missingBrandKitAccounts = chosenAccounts.filter(a => !state.brandProfiles[a.id]?.seed);
    const activeRoles = mode === 'storyline'
      ? ['storyteller', 'manager', 'scheduler', 'concept', 'revision', 'visual', ...(imageSource === 'ai' ? ['image'] : []), 'final']
      : ['concept', 'revision', 'visual', ...(imageSource === 'ai' ? ['image'] : []), 'final'];
    const neededProviders = [...new Set(activeRoles.map(r => sessionAgents[r]?.provider).filter(Boolean))];
    const savedKeySet = new Set((config.keys || []).map(k => k.provider));
    const missingProviders = imageSource === 'own' && mode === 'campaign'
      ? []
      : neededProviders.filter(p => !savedKeySet.has(p));

    const hasAccounts = chosenAccounts.length > 0;
    const hasDirection = mode === 'storyline' ? true : briefText.trim().length > 0;
    const storyBlockedByBrandKit = mode === 'storyline' && missingBrandKitAccounts.length > 0;
    const canSubmit = hasAccounts && hasDirection && !storyBlockedByBrandKit && missingProviders.length === 0;

    return {
      chosenAccounts,
      missingBrandKitAccounts,
      activeRoles,
      neededProviders,
      missingProviders,
      hasAccounts,
      hasDirection,
      storyBlockedByBrandKit,
      canSubmit,
    };
  }

  function renderSummary() {
    const check = getChecklistState();
    const accountCount = check.chosenAccounts.length;
    const totalPosts = mode === 'storyline' ? (accountCount ? postCount : 0) : accountCount * postCount;
    const totalImages = imageSource === 'ai' ? totalPosts * slideCount : 0;
    const days = Math.max(1, Math.round((Date.parse(endDate) - Date.parse(startDate)) / 864e5) + 1);
    const pace = (postCount / days).toFixed(1);
    const langInfo = getEffectiveLanguageInfo();

    const checklistItems = [];

    // 1. Accounts & Brand Kits
    if (!check.hasAccounts) {
      checklistItems.push(h('li', { class: 'gen-check-item is-missing' },
        icon('exclamation'),
        h('span', {}, t('gen.ready.accounts.none'))
      ));
    } else if (!check.missingBrandKitAccounts.length) {
      checklistItems.push(h('li', { class: 'gen-check-item is-ok' },
        icon('check'),
        h('span', {}, t('gen.ready.accounts.ok', { n: accountCount }))
      ));
    } else {
      for (const acc of check.missingBrandKitAccounts) {
        checklistItems.push(h('li', { class: `gen-check-item ${mode === 'storyline' ? 'is-missing' : 'is-warn'}` },
          icon('exclamation'),
          h('div', { class: 'gen-check-body' },
            h('span', {}, `@${acc.username} has no Brand Kit. `),
            h('button', {
              type: 'button',
              class: 'link-btn',
              onclick: () => openQuickBrandKitDrawer({
                h, api, ui, icon, avatar, uploadFile, toast, errMsg, confirmDialog, state, account: acc,
                onSaved: () => renderAll()
              })
            }, 'Set it up now'),
            ' or ',
            h('button', {
              type: 'button',
              class: 'link-btn',
              onclick: () => {
                selected.delete(acc.id);
                persistSelected();
                renderAll();
              }
            }, 'skip this account')
          )
        ));
      }
    }

    // 2. Direction
    if (mode === 'campaign') {
      checklistItems.push(h('li', { class: `gen-check-item ${check.hasDirection ? 'is-ok' : 'is-missing'}` },
        icon(check.hasDirection ? 'check' : 'exclamation'),
        h('span', {}, check.hasDirection ? 'Campaign direction ready' : t('gen.ready.brief.missing'))
      ));
    } else if (check.chosenAccounts[0]) {
      const acc = check.chosenAccounts[0];
      const nextEp = Number(state.brandProfiles[acc.id]?.next_episode || 1);
      checklistItems.push(h('li', { class: 'gen-check-item is-ok' },
        icon('check'),
        h('span', {}, `@${acc.username} · episodes ${nextEp}–${nextEp + postCount - 1}`)
      ));
    }

    // 3. API keys
    if (check.missingProviders.length) {
      for (const prov of check.missingProviders) {
        const provName = config.providers?.[prov]?.name || prov;
        checklistItems.push(h('li', { class: 'gen-check-item is-missing' },
          icon('exclamation'),
          h('span', {},
            `No ${provName} API key yet. Add one in `,
            h('a', { href: '#/settings?from=generator' }, t('nav.settings'))
          )
        ));
      }
    } else {
      checklistItems.push(h('li', { class: 'gen-check-item is-ok' },
        icon('check'),
        h('span', {}, 'Provider API keys ready')
      ));
    }

    const ctaLabel = mode === 'storyline'
      ? t('gen.cta.story', { n: totalPosts })
      : t('gen.cta.campaign', { total: totalPosts });

    const makeCtaButton = () => h('button', {
      type: 'button',
      class: `btn primary gen-submit-btn ${!check.canSubmit ? 'is-disabled' : ''}`,
      'aria-disabled': String(!check.canSubmit),
      onclick: () => {
        if (!check.canSubmit) {
          if (!check.hasAccounts || check.storyBlockedByBrandKit) {
            step1Card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else if (!check.hasDirection) {
            step2Card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            briefInput.setAttribute('aria-invalid', 'true');
            briefInput.focus();
          } else if (check.missingProviders.length) {
            summaryAside.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          return;
        }
        openPreflightAndStart(totalPosts, totalImages);
      }
    }, ctaLabel);

    const storyAcc = check.chosenAccounts[0];
    const nextEp = storyAcc ? Number(state.brandProfiles[storyAcc.id]?.next_episode || 1) : 1;

    summaryAside.replaceChildren(
      h('h2', {}, t('gen.summary')),
      h('div', { class: 'gen-summary-metrics' },
        h('div', { class: 'gen-metric-box' },
          h('b', { class: 'gen-metric-val' }, mode === 'storyline' ? `${totalPosts} episodes` : t('gen.summary.total', { total: totalPosts })),
          h('small', { class: 'muted small' },
            mode === 'storyline'
              ? (storyAcc ? `@${storyAcc.username} · episodes ${nextEp}–${nextEp + postCount - 1}` : t('gen.ready.accounts.none'))
              : t('gen.summary.total.sub', { a: accountCount, n: postCount })
          )
        ),
        h('div', { class: 'gen-metric-box' },
          h('b', { class: 'gen-metric-val' }, imageSource === 'ai' ? t('gen.summary.images', { n: totalImages }) : t('gen.source.own')),
          h('small', { class: 'muted small' }, `${formatType === 'carousel' ? t('gen.format.carousel') : t('gen.format.single')} · ${slideCount} ${slideCount === 1 ? 'slide' : 'slides'}`)
        ),
        h('div', { class: 'gen-metric-box' },
          h('b', { class: 'gen-metric-val' }, `${days} days`),
          h('small', { class: 'muted small' }, t('gen.summary.pace', { x: pace }))
        ),
        h('div', { class: 'gen-metric-box' },
          h('b', { class: 'gen-metric-val' }, t('gen.summary.lang', { language: langInfo.label })),
          h('small', { class: 'muted small' }, `${timesList.join(', ')} WIB`)
        )
      ),
      h('div', { class: 'gen-summary-team-row' },
        h('div', {},
          h('span', { class: 'muted small' }, t('gen.summary.team')),
          h('div', {}, h('b', {}, `${currentPresetName} · ${check.activeRoles.length} agents`))
        ),
        h('button', {
          type: 'button',
          class: 'btn sm',
          onclick: () => triggerAgentsDrawer()
        }, 'Change')
      ),
      h('div', { class: 'gen-checklist-section' },
        h('h3', { class: 'small' }, t('gen.ready')),
        h('ul', { class: 'gen-checklist' }, checklistItems)
      ),
      makeCtaButton(),
      h('p', { class: 'faint small gen-cta-note' }, mode === 'storyline' ? t('gen.cta.note.story') : t('gen.cta.note.campaign'))
    );

    mobileFooter.replaceChildren(
      h('div', { class: 'gen-mobile-footer-meta' },
        h('b', {}, `${totalPosts} posts · ${totalImages} images`),
        h('small', { class: 'muted small' }, check.canSubmit ? t('gen.ready') : t('draft.state.failed'))
      ),
      makeCtaButton()
    );

    advancedLinkBar.replaceChildren(
      h('button', {
        type: 'button',
        class: 'link-btn gen-advanced-link',
        onclick: () => triggerAgentsDrawer()
      }, `${t('gen.agents')} · Advanced`),
      h('span', { class: 'muted small' }, `Preset: ${currentPresetName} · ${check.activeRoles.length} agents`)
    );
  }

  function triggerAgentsDrawer() {
    openAgentsDrawer({
      h, api, ui, icon, modal, toast, errMsg, config, mode,
      currentAgents: sessionAgents,
      onRefreshGemini: () => syncGeminiCatalog(true),
      onApply: (updated, presetId) => {
        sessionAgents = updated;
        currentPresetName = presetId ? (presetId.charAt(0).toUpperCase() + presetId.slice(1)) : 'Custom';
        renderSummary();
      },
      onOpenCanvas: () => openCanvasModal()
    });
  }

  function openCanvasModal() {
    const activeRoles = mode === 'storyline'
      ? ['storyteller', 'manager', 'scheduler', 'concept', 'revision', 'visual', 'image', 'final']
      : ['concept', 'revision', 'visual', 'image', 'final'];
    const roleLabels = {
      concept: t('agent.concept'),
      revision: t('agent.revision'),
      visual: t('agent.visual'),
      image: t('agent.image'),
      final: t('agent.final'),
      storyteller: t('agent.storyteller'),
      manager: t('agent.manager'),
      scheduler: t('agent.scheduler'),
    };
    const nodes = activeRoles.map((role, idx) => ({
      id: role,
      role,
      title: roleLabels[role] || role,
      x: 40 + (idx % 4) * 340,
      y: 80 + Math.floor(idx / 4) * 280,
      width: 290,
      color: '#88b7d1',
      content: h('div', { class: 'small' },
        h('p', {}, `${sessionAgents[role]?.provider || 'openai'} · ${sessionAgents[role]?.model || ''}`)
      )
    }));
    const edges = activeRoles.slice(1).map((role, idx) => ({ from: activeRoles[idx], to: role }));
    const wf = workflowCanvas({
      h,
      userId: state.user.id,
      history: h('div'),
      actions: [],
      nodes,
      edges,
    });
    let d;
    d = modal(t('gen.agents.canvas'), wf.element, [
      h('button', { type: 'button', class: 'btn primary', onclick: () => { wf.dispose(); d.close(); } }, t('dialog.close'))
    ]);
  }

  // Batch submission state for idempotent retries
  const batches = { plans: {}, story: {} };

  function buildAgentsForAccount(accountId) {
    const prefs = readContentPrefs(accountId);
    const effectiveLang = sessionLanguage || prefs.language || 'id';
    const instruction = contentInstruction(effectiveLang, prefs.emoji);
    return Object.fromEntries(
      Object.entries(sessionAgents).map(([role, agent]) => [
        role,
        {
          provider: agent.provider,
          model: agent.model,
          instructions: [agent.instructions, instruction].filter(Boolean).join('\n\n'),
        }
      ])
    );
  }

  async function openPreflightAndStart(totalPosts, totalImages) {
    const chosenAccounts = state.accounts.filter(a => selected.has(a.id));
    const titlePreview = mode === 'storyline'
      ? `@${chosenAccounts[0]?.username || 'story'} · ${postCount} episodes`
      : (briefText.trim().split('\n')[0].slice(0, 48) || 'New campaign');
    const imgModel = sessionAgents.image?.model || 'gpt-image-1';
    const primaryProvider = config.providers?.[sessionAgents.concept?.provider]?.name || sessionAgents.concept?.provider || 'OpenAI';
    const notifyCheck = h('input', { type: 'checkbox', checked: true });

    const content = h('div', { class: 'confirm-content tone-cost gen-preflight-dialog' },
      ui.chip(t('dialog.cost.chip'), 'info'),
      h('table', { class: 'tbl gen-preflight-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Stage'), h('th', {}, 'Amount'), h('th', {}, 'When'))),
        h('tbody', {},
          h('tr', {},
            h('td', {}, 'Concept + caption + review'),
            h('td', {}, `${totalPosts} posts`),
            h('td', {}, 'Now')
          ),
          h('tr', {},
            h('td', {}, `Images (${imgModel})`),
            h('td', {}, imageSource === 'ai' ? `${totalImages} images` : '0 (My photos)'),
            h('td', {}, 'After concepts are approved')
          ),
          h('tr', {},
            h('td', {}, 'Publishing'),
            h('td', {}, '0'),
            h('td', {}, 'Only after you approve')
          )
        )
      ),
      h('p', { class: 'muted small' }, t('gen.preflight.cost', { provider: primaryProvider })),
      h('label', { class: 'check' }, notifyCheck, h('span', {}, t('gen.preflight.notify')))
    );

    let d;
    const confirmed = await new Promise(resolve => {
      let done = false;
      const finish = v => { if (done) return; done = true; d.close(); resolve(v); };
      d = modal(t('gen.preflight.title', { title: titlePreview }), content, [
        h('button', { type: 'button', class: 'btn', onclick: () => finish(false) }, t('dialog.cancel')),
        h('button', { type: 'button', class: 'btn primary', onclick: () => finish(true) }, t('gen.preflight.cta', { n: totalPosts }))
      ]);
      d.addEventListener('close', () => { if (!done) { done = true; resolve(false); } });
    });

    if (!confirmed) return;

    try {
      if (mode === 'storyline') {
        const aid = chosenAccounts[0].id;
        const body = {
          account_id: aid,
          direction: storyDirection.trim(),
          content_count: Number(postCount),
          slide_count: Number(slideCount),
          start_date: startDate,
          end_date: endDate,
          times: timesList,
          produce_media: true,
          agents: buildAgentsForAccount(aid),
          confirm_cost: true,
        };
        const sig = JSON.stringify(body);
        if (batches.story.sig !== sig) {
          batches.story.sig = sig;
          batches.story.id = crypto.randomUUID();
        }
        const job = await api('POST', '/v1/generator/story-jobs', { ...body, request_id: batches.story.id });
        batches.story.sig = '';
        await refreshSessions();
        toast(t('gen.started.toast'), false, {
          label: t('gen.running.open'),
          fn: () => go(job.plan_id ? `/generator/drafts/${encodeURIComponent(job.plan_id)}` : '/generator/drafts')
        });
      } else {
        const targets = chosenAccounts.map(a => a.id).sort();
        const bodies = [];
        for (const aid of targets) {
          const a = state.accounts.find(x => x.id === aid);
          const kit = a?.platform === 'instagram'
            ? (state.brandProfiles[aid] || await api('GET', `/v1/generator/accounts/${encodeURIComponent(aid)}/brand`))
            : { assets: [], brand_notes: '' };
          const assets = [
            ...(kit.assets || []).filter(x => x.category === 'logo').slice(0, 1),
            ...(kit.assets || []).filter(x => x.category === 'visual').slice(0, 1),
            ...(kit.assets || []).filter(x => x.category === 'product').slice(0, 2),
          ];
          const prefs = readContentPrefs(aid);
          const langCode = sessionLanguage || prefs.language || 'id';
          const langNote = contentInstruction(langCode, prefs.emoji);
          const effectiveBrief = sessionLanguage
            ? `${briefText.trim()}\n\n${langNote}`
            : briefText.trim();
          bodies.push({
            brief: effectiveBrief,
            content_count: Number(postCount),
            slide_count: Number(slideCount),
            start_date: startDate,
            end_date: endDate,
            times: timesList,
            manual: imageSource === 'own',
            produce_media: imageSource === 'ai',
            confirm_cost: true,
            agents: buildAgentsForAccount(aid),
            account_ids: [aid],
            reference_media_ids: assets.map(x => x.media_id),
            reference_roles: Object.fromEntries(assets.map(x => [x.media_id, x.category])),
            reference_notes: kit.brand_notes || '',
          });
        }
        const sig = JSON.stringify(bodies);
        if (batches.plans.sig !== sig) {
          batches.plans.sig = sig;
          batches.plans.id = crypto.randomUUID();
        }
        const results = [];
        for (let i = 0; i < bodies.length; i++) {
          results.push(await api('POST', '/v1/generator/plans', { ...bodies[i], request_id: `${batches.plans.id}-${i}` }));
        }
        batches.plans.sig = '';
        await refreshSessions();
        const firstPlanId = results[0]?.id;
        toast(t('gen.started.toast'), false, {
          label: t('gen.running.open'),
          fn: () => go(firstPlanId ? `/generator/drafts/${encodeURIComponent(firstPlanId)}` : '/generator/drafts')
        });
      }
    } catch (e) {
      toast(errMsg(e), true);
    }
  }

  // Track session states to trigger ready toast when transitioning from running -> concept/review
  const prevSessionStates = new Map();
  let pollTimer = null;

  function renderSessionCard(session) {
    const title = session.title || sessionTitle(session);
    const runs = session.runs || [];
    const accounts = (session.account_ids || session.accountIds || []).map(id => state.accounts.find(a => a.id === id)).filter(Boolean);
    const isRunning = runs.some(r => ['queued', 'running'].includes(r.status)) || session.state === 'running';
    const isFailed = !isRunning && (runs.some(r => r.status === 'failed') || session.state === 'failed');
    const cardState = isRunning ? 'running' : isFailed ? 'failed' : session.state;

    const stages = [
      ['concept', 'Concepts', runs.filter(r => r.steps?.concept?.status === 'done').length],
      ['concept_review', 'Concept review', runs.filter(r => ['concept_review', 'review', 'approved'].includes(r.status)).length],
      ['visual', 'Visuals', runs.filter(r => r.steps?.visual?.status === 'done').length],
      ['image', 'Images', runs.filter(r => r.steps?.image?.status === 'done').length],
      ['final', 'Final review', runs.filter(r => r.steps?.final?.status === 'done').length],
    ];

    const conceptReadyRuns = runs.filter(r => r.status === 'concept_review');
    const failedRuns = runs.filter(r => r.status === 'failed');
    const workingRuns = runs.filter(r => ['review', 'concept_review', 'approved'].includes(r.status));
    const firstFailed = failedRuns[0];
    const failedProviderId = firstFailed?.agents?.concept?.provider || 'openai';
    const failedProviderName = config.providers?.[failedProviderId]?.name || failedProviderId;
    const altProviderId = Object.keys(config.providers || {}).find(p => p !== failedProviderId) || 'anthropic';
    const altProviderName = config.providers?.[altProviderId]?.name || altProviderId;

    return h('article', { class: `panel gen-session-card state-${cardState}`, 'data-session-id': session.id },
      h('div', { class: 'gen-session-card-head' },
        h('div', { class: 'row' },
          ui.chip(isRunning ? t('gen.running') : isFailed ? t('gen.failed') : t('draft.state.' + session.state), isRunning ? 'info' : isFailed ? 'bad' : 'warn'),
          h('b', {}, title),
          accounts.map(a => ui.accountChip(a))
        ),
        h('div', { class: 'row' },
          isRunning ? h('button', {
            type: 'button',
            class: 'btn sm danger',
            onclick: async () => {
              if (!await confirmDialog({
                title: t('draft.dialog.stop'),
                body: t('draft.dialog.stop.body'),
                tone: 'danger',
                confirmLabel: t('gen.running.pause')
              })) return;
              for (const r of runs.filter(x => ['queued', 'running'].includes(x.status))) {
                await api('DELETE', `/v1/generator/runs/${r.id}`).catch(() => {});
              }
              await refreshSessions();
            }
          }, t('gen.running.pause')) : null,
          h('a', { class: 'btn sm primary', href: `#/generator/drafts/${encodeURIComponent(session.id)}` }, t('gen.running.open'))
        )
      ),
      h('div', { class: 'gen-pipeline-row' },
        stages.map(([key, label, doneCount]) => {
          const total = Math.max(1, runs.length || session.totalCount || 1);
          const stateCls = doneCount >= total ? 'done' : doneCount > 0 || isRunning ? 'working' : 'todo';
          return h('div', { class: `gen-pipeline-step ${stateCls}`, 'data-stage': key },
            h('b', {}, label),
            h('span', {}, `${doneCount}/${total}`)
          );
        })
      ),
      conceptReadyRuns.length ? h('div', { class: 'gen-session-Ready-callout' },
        h('a', { href: `#/generator/drafts/${encodeURIComponent(session.id)}` },
          t('gen.running.review.now', { n: conceptReadyRuns.length })
        )
      ) : null,
      isRunning ? h('p', { class: 'muted small' }, t('gen.running.leave')) : null,
      isFailed ? h('div', { class: 'gen-session-failed-box' },
        h('p', { class: 'gen-failed-message' }, mapProviderError(firstFailed?.error || '', failedProviderName)),
        workingRuns.length ? h('p', { class: 'muted small' }, t('gen.failed.safe', { n: workingRuns.length })) : null,
        firstFailed?.error ? h('details', { class: 'gen-failed-tech' },
          h('summary', { class: 'faint small' }, t('error.technical')),
          h('pre', {}, firstFailed.error)
        ) : null,
        h('div', { class: 'row' },
          h('button', {
            type: 'button',
            class: 'btn sm primary',
            onclick: async () => {
              if (!await confirmDialog({
                title: t('draft.dialog.retry'),
                body: t('draft.dialog.retry.body'),
                tone: 'cost',
                confirmLabel: t('gen.failed.retry', { n: failedRuns.length })
              })) return;
              for (const r of failedRuns) {
                await api('POST', `/v1/generator/runs/${r.id}/retry`, { confirm_cost: true }).catch(() => {});
              }
              await refreshSessions();
            }
          }, t('gen.failed.retry', { n: failedRuns.length })),
          h('button', {
            type: 'button',
            class: 'btn sm',
            onclick: () => {
              for (const role of Object.keys(sessionAgents)) {
                if (role !== 'image' && config.providers?.[altProviderId]) {
                  sessionAgents[role].provider = altProviderId;
                  const models = filterModelsForRole(role, config.providers[altProviderId]);
                  sessionAgents[role].model = models.recommended[0]?.id || models.other[0]?.id || sessionAgents[role].model;
                }
              }
              currentPresetName = 'Custom';
              renderSummary();
              toast(`Switched text agents to ${altProviderName}`);
            }
          }, t('gen.failed.switch', { provider: altProviderName })),
          workingRuns.length ? h('a', {
            class: 'btn sm',
            href: `#/generator/drafts/${encodeURIComponent(session.id)}`
          }, `Review the ${workingRuns.length} that worked`) : null
        )
      ) : null
    );
  }

  async function refreshSessions() {
    if (stopped) return;
    try {
      const [plansRes, runsRes] = await Promise.all([
        api('GET', '/v1/generator/plans'),
        api('GET', '/v1/generator/runs'),
      ]);
      if (stopped) return;
      const sessions = groupSessions(plansRes.data || [], runsRes.data || []);
      const needsActionCount = sessions.filter(s => ['plan', 'concept', 'review', 'failed'].includes(s.state)).length;
      state.stats.draftSessionsNeedsAction = needsActionCount;
      draftsBadge.textContent = needsActionCount ? `${needsActionCount} to review` : '';
      draftsBadge.hidden = !needsActionCount;

      for (const s of sessions) {
        const prev = prevSessionStates.get(s.id);
        if (prev === 'running' && (s.state === 'concept' || s.state === 'review')) {
          toast(t('gen.ready.toast', { title: sessionTitle(s) }), false, {
            label: t('gen.running.open'),
            fn: () => go(`/generator/drafts/${encodeURIComponent(s.id)}`)
          });
        }
        prevSessionStates.set(s.id, s.state);
      }

      const now = Date.now();
      const activeOrFailed = sessions.filter(s => {
        const hasRunning = (s.runs || []).some(r => ['queued', 'running'].includes(r.status)) || s.state === 'running';
        const hasFailed = (s.runs || []).some(r => r.status === 'failed') || s.state === 'failed';
        return hasRunning || (hasFailed && (!s.updatedAt || now - Date.parse(s.updatedAt) < 864e5));
      }).slice(0, 2);

      const recent = sessions.filter(s => !activeOrFailed.some(a => a.id === s.id)).slice(0, 3);

      sessionsArea.replaceChildren(
        ...activeOrFailed.map(renderSessionCard),
        recent.length ? h('div', { class: 'gen-recent-strip' },
          h('span', { class: 'muted small' }, t('gen.recent') + ':'),
          ...recent.map(s => h('a', {
            class: 'gen-recent-pill',
            href: `#/generator/drafts/${encodeURIComponent(s.id)}`
          },
            h('b', {}, s.title || sessionTitle(s)),
            ui.chip(t('draft.state.' + s.state), s.state === 'done' ? 'ok' : s.state === 'failed' ? 'bad' : 'warn')
          )),
          h('a', { class: 'link-btn small', href: '#/generator/drafts' }, t('gen.recent.all'))
        ) : null
      );

      clearTimeout(pollTimer);
      if (!stopped) {
        const hasRunning = sessions.some(s => (s.runs || []).some(r => ['queued', 'running'].includes(r.status)) || s.state === 'running');
        pollTimer = setTimeout(refreshSessions, hasRunning ? 2500 : 10000);
      }
    } catch { /* ignore polling error */ }
  }

  function renderAll() {
    renderStep1();
    renderStep2();
    renderStep3();
    renderSummary();
  }

  renderAll();
  await refreshSessions();

  const view = shell('/generator', h('div', { class: 'generator-redesign-page' },
    pagehead(t('gen.title'), t('gen.sub'),
      h('a', { class: 'btn', href: '#/generator/drafts' }, icon('doc'), t('nav.drafts'), draftsBadge)
    ),
    sessionsArea,
    h('div', { class: 'gen-main-grid' },
      h('div', { class: 'gen-steps-col' },
        step1Card,
        step2Card,
        step3Card,
        advancedLinkBar
      ),
      summaryAside
    ),
    mobileFooter
  ));

  return {
    view,
    cleanup() {
      stopped = true;
      clearTimeout(pollTimer);
      document.querySelector('.quick-brandkit-drawer')?.remove();
      document.querySelector('.gen-agents-drawer')?.remove();
    }
  };
}
