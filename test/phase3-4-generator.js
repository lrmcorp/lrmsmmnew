import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { filterModelsForRole, parseStoryBible, computeBrandKitCompleteness, mapProviderError } from '../public/generator-redesign.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lrmsmm-phase3-4-'));
Object.assign(process.env, { META_MOCK: '1', DATA_DIR: tmp, DISABLE_WORKER: '1' });

const { app } = await import('../src/server.js');
const { config } = await import('../src/config.js');
const { createUser } = await import('../src/auth.js');
const { run } = await import('../src/db.js');
const { encrypt } = await import('../src/util.js');
const { setAssignments } = await import('../src/services/scope.js');
const gen = await import('../src/services/generator.js');
const storySvc = await import('../src/services/storytelling.js');

test('Unit: filterModelsForRole, parseStoryBible, computeBrandKitCompleteness, mapProviderError', () => {
  const geminiConfig = {
    textModel: 'gemini-2.5-flash',
    textModels: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.0-flash-transcribe', name: 'Gemini 2.0 Transcribe' },
      { id: 'gemini-computer-use-preview', name: 'Gemini Computer Use' },
      { id: 'imagen-3.0-generate', name: 'Imagen 3' },
    ],
    imageModel: 'gemini-2.5-flash-image-preview',
    imageModels: [
      { id: 'gemini-2.5-flash-image-preview', name: 'Gemini 2.5 Flash Image' }
    ]
  };

  const textFiltered = filterModelsForRole('scheduler', geminiConfig);
  const visibleIds = [...textFiltered.recommended, ...textFiltered.other].map(m => m.id);
  assert.ok(visibleIds.includes('gemini-2.5-flash'));
  assert.ok(!visibleIds.some(id => /transcribe|computer|imagen/i.test(id)), 'No Transcribe/Computer Use/Imagen models in text agent options');
  assert.equal(textFiltered.hidden.length, 3);

  const imageFiltered = filterModelsForRole('image', geminiConfig);
  assert.deepEqual(imageFiltered.recommended.map(m => m.id), ['gemini-2.5-flash-image-preview']);

  const parsed = parseStoryBible(`
Brand Essence: Effortless salon-grade lash clusters for beginners.
Tone of Voice: Warm, encouraging, and educational.
Chapter 1 - Foundation (Posts 1-12): Introduce daily lash comfort and quick application.
Chapter 2 - Holiday Glow (Posts 13-24): Party-ready styles and gentle removal care.
  `);
  assert.equal(parsed.fields.length, 2);
  assert.equal(parsed.chapters.length, 2);
  assert.equal(parsed.chapters[1].startPost, 13);
  assert.equal(parsed.chapters[1].endPost, 24);

  const compEmpty = computeBrandKitCompleteness('acc-1', { seed: '', brand_notes: '', assets: [] });
  assert.equal(compEmpty.percent, 0);
  assert.equal(compEmpty.readyForGenerator, false);

  const compFull = computeBrandKitCompleteness('acc-1', {
    seed: 'Complete brand story seed prompt for wellness brand',
    brand_notes: 'Do: use warm tones',
    assets: [{ category: 'logo' }, { category: 'visual' }, { category: 'product' }]
  });
  assert.equal(compFull.percent, 100);
  assert.equal(compFull.complete, true);

  assert.match(mapProviderError('HTTP 429 quota exceeded', 'OpenAI'), /quota ran out/i);
  assert.match(mapProviderError('HTTP 401 unauthorized api key', 'Anthropic'), /invalid or was revoked/i);
});

test('Browser E2E: Content Generator G1–G10 at 1280px and 375px', async () => {
  const qaDir = path.resolve('docs/redesign/qa/phase3-4');
  fs.mkdirSync(qaDir, { recursive: true });

  const user = createUser({ email: 'phase3-4@lrmcorp.id', password: 'password123', name: 'Reyner Liando', role: 'owner' });
  run("INSERT INTO companies(id,name) VALUES('comp-lrm','LRM Beauty Group')");

  const accountsSeed = [
    ['acc-ms', 'instagram', 'manisky.id', 'Manisky Lash'],
    ['acc-mj', 'instagram', 'moonjasmine.id', 'Moon Jasmine'],
    ['acc-hb', 'instagram', 'hannabeauty.id', 'Hanna Beauty'],
    ['acc-ks', 'instagram', 'kopisenja.id', 'Kopi Senja'],
    ['acc-aj', 'instagram', 'anekajaya.asemka', 'Aneka Jaya Asemka'],
  ];
  for (const [id, plat, username, name] of accountsSeed) {
    run("INSERT INTO accounts(id,platform,platform_user_id,username,name,company_id,token_enc) VALUES(?,?,?,?,?,'comp-lrm',?)",
      id, plat, 'p-' + id, username, name, encrypt('meta'));
  }
  setAssignments(user.id, accountsSeed.map(a => a[0]));
  for (const p of ['openai', 'anthropic', 'gemini']) gen.saveKey(user, p, 'fixture-key-123456');

  // Seed Brand Kits for the first 4 accounts, leave @anekajaya.asemka without a Brand Kit
  for (const [id, , username] of accountsSeed.slice(0, 4)) {
    storySvc.saveProfile(user, id, {
      seed: `Brand Essence: ${username} verified brand seed.\nTone of Voice: Warm, friendly.\nChapter 1 - Origins (Posts 1-12): Brand introduction.\nChapter 2 - Growth (Posts 13-24): Deeper product stories.`,
      brand_notes: 'Do: Keep warm lighting\nDon\'t: Overclaim clinical results'
    });
  }
  // Set @manisky.id to next_episode = 13
  run("UPDATE account_story_profiles SET next_episode = 13 WHERE account_id = 'acc-ms'");

  // Seed a running session and a failed session to verify G5 and G6 cards
  run(`INSERT INTO generator_plans(id,user_id,request_id,request_hash,brief,start_date,end_date,content_count,recommendation,created_at)
       VALUES('plan-running',?,'req-run','hash-run','Holiday Lash Campaign','2026-11-01','2026-11-14',4,'{}',datetime('now'))`, user.id);
  run(`INSERT INTO generator_runs(id,user_id,request_id,request_hash,brief,targets,slide_count,agents,status,scheduled_at,plan_id,title,caption,media_ids,steps,created_at,updated_at)
       VALUES('run-active-1',?,'req-r1','h1','Holiday Lash Campaign','[{"account_id":"acc-ms"}]',1,'{"concept":{"provider":"openai","model":"gpt-4.1"}}','running','2026-11-01T05:15:00Z','plan-running','Post 1','Cap 1','[]','{"concept":{"status":"done"}}',datetime('now'),datetime('now'))`, user.id);
  run(`INSERT INTO generator_runs(id,user_id,request_id,request_hash,brief,targets,slide_count,agents,status,scheduled_at,plan_id,title,caption,media_ids,steps,created_at,updated_at)
       VALUES('run-active-2',?,'req-r2','h2','Holiday Lash Campaign','[{"account_id":"acc-ms"}]',1,'{"concept":{"provider":"openai","model":"gpt-4.1"}}','concept_review','2026-11-02T05:15:00Z','plan-running','Post 2','Cap 2','[]','{"concept":{"status":"done"},"revision":{"status":"done","output":{"title":"Post 2","caption":"Cap 2","slides":[{"prompt":"Slide 1"}]}}}',datetime('now'),datetime('now'))`, user.id);

  run(`INSERT INTO generator_plans(id,user_id,request_id,request_hash,brief,start_date,end_date,content_count,recommendation,created_at)
       VALUES('plan-failed',?,'req-fail','hash-fail','11.11 Flash Promo','2026-11-05','2026-11-10',2,'{}',datetime('now'))`, user.id);
  run(`INSERT INTO generator_runs(id,user_id,request_id,request_hash,brief,targets,slide_count,agents,status,scheduled_at,plan_id,title,caption,media_ids,steps,error,created_at,updated_at)
       VALUES('run-fail-1',?,'req-f1','hf1','11.11 Flash Promo','[{"account_id":"acc-mj"}]',1,'{"concept":{"provider":"openai","model":"gpt-4.1"}}','failed','2026-11-05T05:15:00Z','plan-failed','Failed Post','Cap','[]','{}','HTTP 429 rate_limit_exceeded',datetime('now'),datetime('now'))`, user.id);
  run(`INSERT INTO generator_runs(id,user_id,request_id,request_hash,brief,targets,slide_count,agents,status,scheduled_at,plan_id,title,caption,media_ids,steps,created_at,updated_at)
       VALUES('run-fail-2',?,'req-f2','hf2','11.11 Flash Promo','[{"account_id":"acc-mj"}]',1,'{"concept":{"provider":"openai","model":"gpt-4.1"}}','review','2026-11-06T05:15:00Z','plan-failed','Working Post','Cap','[]','{"concept":{"status":"done"}}',datetime('now'),datetime('now'))`, user.id);

  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  config.publicUrl = baseUrl;

  const loginRes = await fetch(baseUrl + '/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: 'password123' })
  });
  const rawSid = loginRes.headers.get('set-cookie').split(';')[0].split('=')[1];

  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-phase34-'));
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    '--remote-debugging-port=9229',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--user-data-dir=' + userDir
  ]);

  try {
    let connected = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch('http://127.0.0.1:9229/json/version');
        if (res.ok) { connected = true; break; }
      } catch {}
      await new Promise(r => setTimeout(r, 100));
    }
    assert.ok(connected, 'Chrome CDP did not start');

    const tabs = await (await fetch('http://127.0.0.1:9229/json/list')).json();
    const pageTab = tabs.find(t => t.type === 'page');
    const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    let msgId = 1;
    const callbacks = new Map();
    const pageErrors = [];
    ws.onmessage = evt => {
      const msg = JSON.parse(evt.data);
      if (msg.method === 'Runtime.exceptionThrown') {
        pageErrors.push(msg.params?.exceptionDetails?.text || 'Uncaught exception');
      }
      if (msg.id && callbacks.has(msg.id)) {
        callbacks.get(msg.id)(msg);
        callbacks.delete(msg.id);
      }
    };

    function cdp(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = msgId++;
        callbacks.set(id, resp => {
          if (resp.error) reject(new Error(JSON.stringify(resp.error)));
          else resolve(resp.result);
        });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await cdp('Page.enable');
    await cdp('Runtime.enable');
    await cdp('Network.enable');
    await cdp('Network.setCookie', { name: 'lrmsmm_sid', value: rawSid, domain: '127.0.0.1', path: '/' });

    async function evaluate(expression) {
      const res = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      return res.result?.value;
    }

    async function screenshot(filename) {
      const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(qaDir, filename), Buffer.from(data, 'base64'));
    }

    // 1. Desktop 1280px — Open Content Generator (G1, G5, G6)
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 2, mobile: false });
    await cdp('Page.navigate', { url: `${baseUrl}/#/generator` });

    for (let i = 0; i < 40; i++) {
      const ready = await evaluate(`Boolean(document.querySelector('.generator-redesign-page') && document.querySelector('#gen-step-1'))`);
      if (ready) break;
      await new Promise(r => setTimeout(r, 100));
    }

    // Verify no legacy <details> for accounts, schedule, or studio-agents
    const legacyDetailsCount = await evaluate(`document.querySelectorAll('.generator-account-picker, .generator-schedule-picker, .studio-agents').length`);
    assert.equal(legacyDetailsCount, 0, 'No legacy <details> for accounts, schedule or queue');

    // Verify 5 accounts in one row at 1280px
    const rowTops = await evaluate(`
      [...document.querySelectorAll('#gen-step-1 .account-chip:not(.more)')].map(el => Math.round(el.getBoundingClientRect().top))
    `);
    assert.equal(rowTops.length, 5);
    assert.equal(new Set(rowTops).size, 1, 'All 5 account chips fit on a single row at 1280px');

    // Select all 5 accounts to see @anekajaya.asemka checklist warning
    await evaluate(`
      [...document.querySelectorAll('#gen-step-1 button')].find(b => b.textContent.trim() === 'Select all')?.click();
    `);
    const checklistText = await evaluate(`document.querySelector('.gen-checklist')?.innerText || ''`);
    assert.match(checklistText, /@anekajaya\.asemka has no Brand Kit/i);
    assert.match(checklistText, /Set it up now/i);
    assert.match(checklistText, /skip this account/i);

    // Verify G5 Running card and G6 Failed card are rendered
    const sessionCardsInfo = await evaluate(`({
      runningCount: document.querySelectorAll('.gen-session-card.state-running').length,
      failedCount: document.querySelectorAll('.gen-session-card.state-failed').length,
      failedText: document.querySelector('.gen-session-card.state-failed')?.innerText || ''
    })`);
    assert.equal(sessionCardsInfo.runningCount, 1);
    assert.equal(sessionCardsInfo.failedCount, 1);
    assert.match(sessionCardsInfo.failedText, /quota ran out/i);

    // Append a quick-idea chip and verify totals
    await evaluate(`
      document.querySelector('.gen-idea-chip')?.click();
    `);
    const ctaText5 = await evaluate(`document.querySelector('.gen-submit-btn')?.textContent.trim()`);
    assert.equal(ctaText5, 'Generate 60 posts'); // 5 accounts * 12 posts

    await screenshot('g1-campaign-1280.png');

    // 2. Test Quick Brand Kit drawer (G3) for @anekajaya.asemka
    await evaluate(`
      [...document.querySelectorAll('.gen-checklist .link-btn')].find(b => b.textContent.includes('Set it up now'))?.click();
    `);
    for (let i = 0; i < 20; i++) {
      const open = await evaluate(`Boolean(document.querySelector('.quick-brandkit-drawer'))`);
      if (open) break;
      await new Promise(r => setTimeout(r, 100));
    }
    await screenshot('g3-quick-brandkit-1280.png');
    await evaluate(`
      document.querySelector('.quick-brandkit-drawer [aria-label="Close dialog"]')?.click();
    `);
    await new Promise(r => setTimeout(r, 150));

    // 3. Test G8 Schedule Popover
    await evaluate(`
      document.querySelector('.gen-token-btn')?.click();
    `);
    assert.equal(await evaluate(`Boolean(document.querySelector('.gen-schedule-popover'))`), true);
    await screenshot('g8-schedule-popover-1280.png');
    await evaluate(`
      document.querySelector('.gen-schedule-popover .btn.primary')?.click();
    `);

    // 4. Test G7 AI Team & Models drawer
    await evaluate(`
      document.querySelector('.gen-advanced-link')?.click();
    `);
    assert.equal(await evaluate(`Boolean(document.querySelector('.gen-agents-drawer'))`), true);
    const badModelsInSelects = await evaluate(`
      [...document.querySelectorAll('.gen-agents-drawer select[aria-label^="Model "] option')]
        .map(o => o.textContent)
        .filter(t => /transcribe|computer.?use/i.test(t))
    `);
    assert.deepEqual(badModelsInSelects, [], 'Zero Transcribe or Computer Use models in agent selects');
    await screenshot('g7-agents-drawer-1280.png');
    await evaluate(`
      document.querySelector('.gen-agents-drawer [aria-label="Close dialog"]')?.click();
    `);

    // 5. Test Story mode (G2) & Story Bible (G9) with @manisky.id (next_episode = 13)
    await evaluate(`
      [...document.querySelectorAll('.gen-mode-switch [role="tab"]')].find(b => b.textContent.includes('Continue story'))?.click();
      [...document.querySelectorAll('#gen-step-1 .account-chip')].find(b => b.textContent.includes('@manisky.id'))?.click();
    `);
    await new Promise(r => setTimeout(r, 100));
    const storyCheck = await evaluate(`({
      arcText: document.querySelector('.gen-story-arc-card')?.innerText || '',
      directionVal: document.querySelector('.gen-direction-input')?.value,
      ctaLabel: document.querySelector('.gen-submit-btn')?.textContent.trim()
    })`);
    assert.match(storyCheck.arcText, /episodes 13–24/i);
    assert.equal(storyCheck.directionVal, '', 'Story direction starts empty');
    assert.equal(storyCheck.ctaLabel, 'Plan 12 episodes');
    await screenshot('g2-story-1280.png');

    // Open Story Bible modal (G9)
    await evaluate(`
      [...document.querySelectorAll('.gen-story-arc-card button')].find(b => b.textContent.includes('View Story Bible'))?.click();
    `);
    await new Promise(r => setTimeout(r, 100));
    assert.equal(await evaluate(`Boolean(document.querySelector('.story-bible-modal'))`), true);
    await screenshot('g9-story-bible-1280.png');
    await evaluate(`
      document.querySelector('dialog[open] [aria-label="Close dialog"]')?.click();
    `);

    // 6. Test G4 Pre-flight cost dialog
    await evaluate(`
      document.querySelector('.gen-submit-btn')?.click();
    `);
    await new Promise(r => setTimeout(r, 100));
    assert.equal(await evaluate(`Boolean(document.querySelector('.gen-preflight-dialog'))`), true);
    await screenshot('g4-preflight-1280.png');
    await evaluate(`
      document.querySelector('dialog[open] [aria-label="Close dialog"]')?.click();
    `);

    // 7. Mobile 375px (G10)
    await cdp('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
    await new Promise(r => setTimeout(r, 200));
    const mobileStats = await evaluate(`({
      noOverflow: document.documentElement.scrollWidth <= window.innerWidth,
      footerVisible: getComputedStyle(document.querySelector('.gen-mobile-footer')).display !== 'none'
    })`);
    assert.equal(mobileStats.noOverflow, true, 'Zero horizontal overflow at 375px');
    assert.equal(mobileStats.footerVisible, true, 'Sticky mobile footer is visible at 375px');
    await screenshot('g10-mobile-375.png');

    assert.deepEqual(pageErrors, []);
    ws.close();
  } finally {
    chrome.kill('SIGKILL');
    await new Promise(r => server.close(r));
    fs.rmSync(userDir, { recursive: true, force: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
