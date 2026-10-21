import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { conceptVerdict } from '../public/draft-sessions.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lrmsmm-phase2-d4d6-'));
Object.assign(process.env, { META_MOCK: '1', DATA_DIR: tmp, DISABLE_WORKER: '1' });

const { app } = await import('../src/server.js');
const { config } = await import('../src/config.js');
const { createUser } = await import('../src/auth.js');
const { run, one } = await import('../src/db.js');
const { encrypt } = await import('../src/util.js');
const { setAssignments } = await import('../src/services/scope.js');
const gen = await import('../src/services/generator.js');
const sharp = (await import('sharp')).default;

test('conceptVerdict classifies reviewer outputs into OK, Note, and Claim', () => {
  assert.deepEqual(conceptVerdict({ steps: { revision: { output: { reviewer: 'Concept is solid and aligned.' } } } }), {
    key: 'ok',
    label: 'OK',
    tone: 'ok'
  });

  const claimVerdict = conceptVerdict({
    steps: {
      revision: {
        output: {
          reviewer: 'Slide 2 says "removes 100% of dark spots in 3 days" — medical claim risk. Soften to "helps brighten the look of dark spots with regular use".'
        }
      }
    }
  });
  assert.equal(claimVerdict.key, 'claim');
  assert.equal(claimVerdict.label, 'Claim');
  assert.equal(claimVerdict.tone, 'bad');

  const noteVerdict = conceptVerdict({
    steps: {
      revision: {
        output: {
          reviewer: 'Suggestion: mention warm lighting on slide 1.'
        }
      }
    }
  });
  assert.equal(noteVerdict.key, 'note');
  assert.equal(noteVerdict.label, 'Note');
  assert.equal(noteVerdict.tone, 'warn');
});

test('D4 Concept Review and D6 Post Editor Drawer browser flow and autosave flush', async () => {
  const qaDir = path.resolve('docs/redesign/qa/phase2');
  fs.mkdirSync(qaDir, { recursive: true });

  const user = createUser({ email: 'phase2@lrmcorp.id', password: 'password123', name: 'Reyner Liando', role: 'owner' });
  run("INSERT INTO accounts(id,platform,platform_user_id,username,token_enc) VALUES('acc-ms','instagram','p-ms','manisky.id',?)", encrypt('meta'));
  run("INSERT INTO accounts(id,platform,platform_user_id,username,token_enc) VALUES('acc-mj','instagram','p-mj','moonjasmine.id',?)", encrypt('meta'));
  run("INSERT INTO accounts(id,platform,platform_user_id,username,token_enc) VALUES('acc-ks','threads','p-ks','kopisenja.th',?)", encrypt('meta'));
  setAssignments(user.id, ['acc-ms', 'acc-mj', 'acc-ks']);
  for (const p of ['openai', 'anthropic', 'gemini']) gen.saveKey(user, p, 'fixture-key');

  const mediaSvc = await import('../src/services/media.js');
  const img1 = await mediaSvc.saveBuffer(user.id, await sharp({ create: { width: 800, height: 1000, channels: 3, background: '#0ea5e9' } }).png().toBuffer(), { mime: 'image/png' });
  const img2 = await mediaSvc.saveBuffer(user.id, await sharp({ create: { width: 800, height: 1000, channels: 3, background: '#10b981' } }).png().toBuffer(), { mime: 'image/png' });
  const img3 = await mediaSvc.saveBuffer(user.id, await sharp({ create: { width: 800, height: 1000, channels: 3, background: '#f59e0b' } }).png().toBuffer(), { mime: 'image/png' });
  const imgOld = await mediaSvc.saveBuffer(user.id, await sharp({ create: { width: 800, height: 1000, channels: 3, background: '#64748b' } }).png().toBuffer(), { mime: 'image/png' });

  // Seed D4 Concept Review session
  const conceptPlanId = 'plan-d4-concepts';
  run(`INSERT INTO generator_plans(id,user_id,request_id,request_hash,brief,start_date,end_date,content_count,recommendation,created_at)
       VALUES(?,?,'req-d4','hash-d4',?,'2026-10-21','2026-11-03',3,'{}','2026-10-20T22:11:00Z')`,
    conceptPlanId, user.id, 'Manisky: Chapter 05, Soft Morning');

  const defaultAgents = JSON.stringify({
    concept: { provider: 'openai', model: 'gpt-4o' },
    revision: { provider: 'openai', model: 'gpt-4o' },
    visual: { provider: 'openai', model: 'gpt-4o' },
    image: { provider: 'gemini', model: 'gemini-3.1-flash-image-preview' },
    final: { provider: 'openai', model: 'gpt-4o' }
  });

  const d4Configs = [
    {
      id: 'run-d4-1',
      title: 'A Quiet Morning Ritual',
      slot: '2026-10-21T12:15:00+07:00',
      caption: 'Before the city wakes up, five quiet minutes with warm water and a soft blush palette. This is how Chapter 5 begins. #manisky #morningritual',
      slides: [
        { prompt: 'Warm morning light on a linen vanity table, ceramic cup of tea, soft blush nail set.' },
        { prompt: 'Close-up of hand holding warm mug, natural sheer pink press-on nails catching sunlight.' },
        { prompt: 'Flat-lay of the Soft Morning box with handwritten chapter card.' }
      ],
      reviewer: 'Concept is clean and on-brand.'
    },
    {
      id: 'run-d4-2',
      title: 'Shades of Blush',
      slot: '2026-10-22T19:15:00+07:00',
      caption: 'Our new serum removes 100% of dark spots in 3 days and gives a soft glow. #manisky #blush',
      suggested_caption: 'Our new serum helps brighten the look of dark spots with regular use and gives a soft glow. #manisky #blush',
      slides: [
        { prompt: 'Soft blush bottle on travertine stone.' },
        { prompt: 'Dropper releasing serum onto skin.' },
        { prompt: 'Routine order card.' }
      ],
      reviewer: 'Slide 2 says "removes 100% of dark spots in 3 days" — medical claim risk. Soften to "helps brighten the look of dark spots with regular use".'
    },
    {
      id: 'run-d4-3',
      title: 'Details That Whisper',
      slot: '2026-10-24T12:15:00+07:00',
      caption: 'Close-ups of texture and shimmer for weekend brunch. #manisky',
      slides: [
        { prompt: 'Macro shimmer shot.' }
      ],
      reviewer: 'Note: consider adding a second slide showing daylight wear.'
    }
  ];

  for (const cfg of d4Configs) {
    const revOutput = {
      title: cfg.title,
      caption: cfg.caption,
      slides: cfg.slides,
      reviewer: cfg.reviewer,
      ...(cfg.suggested_caption ? { suggested_caption: cfg.suggested_caption } : {})
    };
    const stepsObj = {
      concept: { status: 'done', output: { title: cfg.title, caption: cfg.caption, slides: cfg.slides } },
      revision: { status: 'done', output: revOutput }
    };
    run(`INSERT INTO generator_runs(id,user_id,request_id,request_hash,brief,targets,slide_count,agents,status,scheduled_at,plan_id,title,caption,steps,created_at,updated_at,draft_touched_at)
         VALUES(?,?,'req-${cfg.id}','hash',?,?,?,?,'concept_review',?,?,?,?,?,'2026-10-20T22:11:00Z','2026-10-20T22:11:00Z','2026-10-20T22:11:00Z')`,
      cfg.id, user.id, 'Manisky: Chapter 05, Soft Morning', JSON.stringify([{ account_id: 'acc-ms' }]),
      cfg.slides.length, defaultAgents, cfg.slot, conceptPlanId, cfg.title, cfg.caption, JSON.stringify(stepsObj));
  }

  // Seed D6 Post Editor Drawer session (in review state)
  const reviewPlanId = 'plan-d6-review';
  run(`INSERT INTO generator_plans(id,user_id,request_id,request_hash,brief,start_date,end_date,content_count,recommendation,created_at)
       VALUES(?,?,'req-d6','hash-d6',?,'2026-11-01','2026-11-05',2,'{}','2026-10-20T18:00:00Z')`,
    reviewPlanId, user.id, '11.11 Promo: Lash clusters for beginners');

  const d6Steps = {
    final: {
      status: 'done',
      output: 'Slide 2 text is slightly low-contrast on the top-left corner; readable, but consider regenerating if you want sharper type.'
    }
  };
  const d6Versions = [
    { slide_index: 0, media_id: imgOld.id, instruction: 'Initial generation', replaced_at: '2026-10-20T18:10:00Z' }
  ];

  run(`INSERT INTO generator_runs(id,user_id,request_id,request_hash,brief,targets,slide_count,agents,status,scheduled_at,schedule_reason,plan_id,title,caption,media_ids,media_versions,steps,created_at,updated_at,draft_touched_at)
       VALUES('run-d6-1',?,'req-d6-1','hash','11.11 Promo Post 1',?,3,?,'review','2026-11-01T12:15:00+07:00','Lunch hour, high engagement for beauty tutorials',?,'Lash clusters tip 1','New to lash clusters? Start from the outer corner, press gently for 3 seconds, and skip mascara. #lashcluster #moonjasmine',?,?,?,'2026-10-20T18:00:00Z','2026-10-20T18:00:00Z','2026-10-20T18:00:00Z')`,
    user.id, JSON.stringify([{ account_id: 'acc-mj' }]), defaultAgents, reviewPlanId,
    JSON.stringify([img1.id, img2.id, img3.id]), JSON.stringify(d6Versions), JSON.stringify(d6Steps));

  run(`INSERT INTO generator_runs(id,user_id,request_id,request_hash,brief,targets,slide_count,agents,status,scheduled_at,schedule_reason,plan_id,title,caption,media_ids,steps,created_at,updated_at,draft_touched_at)
       VALUES('run-d6-2',?,'req-d6-2','hash','11.11 Promo Post 2',?,1,?,'review','2026-11-02T19:15:00+07:00','Evening scroll peak',?,'Lash clusters tip 2','Second post caption #lashcluster',?,'{}','2026-10-20T18:00:00Z','2026-10-20T18:00:00Z','2026-10-20T18:00:00Z')`,
    user.id, JSON.stringify([{ account_id: 'acc-mj' }]), defaultAgents, reviewPlanId, JSON.stringify([img2.id]));

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

  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-d4d6-'));
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    '--remote-debugging-port=9226',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--user-data-dir=' + userDir
  ]);

  try {
    let connected = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch('http://127.0.0.1:9226/json/version');
        if (res.ok) { connected = true; break; }
      } catch {}
      await new Promise(r => setTimeout(r, 100));
    }
    assert.ok(connected, 'Chrome CDP did not start');

    const tabs = await (await fetch('http://127.0.0.1:9226/json/list')).json();
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

    async function setViewport(width, height) {
      await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: width < 600 });
    }

    async function screenshot(filename) {
      const data = await cdp('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(qaDir, filename), Buffer.from(data.data, 'base64'));
    }

    async function waitForSelector(sel, timeout = 5000) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        if (await evaluate(`!!document.querySelector('${sel}')`)) return true;
        await new Promise(r => setTimeout(r, 80));
      }
      throw new Error(`Timeout waiting for selector: ${sel}`);
    }

    // =========================================================================
    // 1. Test D4 Concept Review at 1280px and 375px
    // =========================================================================
    await setViewport(1280, 900);
    await cdp('Page.navigate', { url: `${baseUrl}/#/generator/drafts/${conceptPlanId}` });
    await waitForSelector('.draft-concept-layout');
    await new Promise(r => setTimeout(r, 300));

    // Verify stage segmented control and verdict chips
    const verdictChips = await evaluate(`Array.from(document.querySelectorAll('.draft-concept-row .ui-chip')).map(c => c.textContent.trim())`);
    assert.deepEqual(verdictChips, ['OK', 'Claim', 'Note']);

    // Select concept 2 (which has a 'Claim' reviewer verdict)
    await evaluate(`document.querySelectorAll('.draft-concept-select')[1].click()`);
    await new Promise(r => setTimeout(r, 150));

    const calloutText = await evaluate(`document.querySelector('.draft-concept-reviewer')?.textContent || ''`);
    assert.ok(calloutText.includes('medical claim risk'), 'Reviewer callout should display claim warning');

    // Click 'Apply suggestion' and verify caption updates
    await evaluate(`document.querySelector('.draft-concept-apply-btn')?.click()`);
    const updatedCaption = await evaluate(`document.querySelector('.draft-concept-caption-input')?.value || ''`);
    assert.ok(updatedCaption.includes('helps brighten the look of dark spots with regular use'), 'Apply suggestion should replace claim in caption');

    await screenshot('d4-concept-1280.png');
    assert.ok(await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`), 'No horizontal scroll on D4 at 1280px');

    // Check D4 at 375px
    await setViewport(375, 812);
    await new Promise(r => setTimeout(r, 200));
    await screenshot('d4-concept-375.png');
    assert.ok(await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`), 'No horizontal scroll on D4 at 375px');

    // Back to 1280px to test single-confirm batch approval on D4
    await setViewport(1280, 900);
    await evaluate(`document.querySelectorAll('.draft-concept-select')[0].click()`);
    await new Promise(r => setTimeout(r, 100));

    // Edit concept 1 title and click 'Approve and go to concept 2'
    await evaluate(`{
      const inp = document.querySelector('.draft-concept-title-input');
      inp.value = 'A Quiet Morning Ritual (Edited)';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('.draft-concept-approve-next').click();
    }`);
    await waitForSelector('dialog[open]');
    // Confirm cost dialog once
    await evaluate(`document.querySelector('dialog[open] [value="ok"], dialog[open] .btn.primary')?.click()`);
    await new Promise(r => setTimeout(r, 300));

    // Verify run-d4-1 is queued/running in DB with updated plan title, and editor advanced to concept 2
    const run1After = one('SELECT status, steps FROM generator_runs WHERE id=?', 'run-d4-1');
    assert.ok(['queued', 'running'].includes(run1After.status));
    assert.equal(JSON.parse(run1After.steps).revision.output.title, 'A Quiet Morning Ritual (Edited)');

    const currentConceptTitle = await evaluate(`document.querySelector('.draft-concept-title-input')?.value`);
    assert.equal(currentConceptTitle, 'Shades of Blush');

    // Approve concept 2 — should NOT open another cost confirmation dialog!
    await evaluate(`document.querySelector('.draft-concept-approve-next').click()`);
    await new Promise(r => setTimeout(r, 300));
    const dialogStillClosed = await evaluate(`!document.querySelector('dialog[open]')`);
    assert.ok(dialogStillClosed, 'Second single-concept approval in same batch should not re-open cost dialog');
    const run2After = one('SELECT status, caption FROM generator_runs WHERE id=?', 'run-d4-2');
    assert.ok(['queued', 'running'].includes(run2After.status));
    assert.ok(run2After.caption.includes('helps brighten the look of dark spots with regular use'));

    // =========================================================================
    // 2. Test D6 Post Editor Drawer at 1280px and 375px + Autosave Flush
    // =========================================================================
    await cdp('Page.navigate', { url: `${baseUrl}/#/generator/drafts/${reviewPlanId}` });
    await waitForSelector('.draft-review-layout');
    await new Promise(r => setTimeout(r, 300));

    // Open D6 via 'Full edit' button
    await evaluate(`Array.from(document.querySelectorAll('.draft-preview-quick button')).find(b => b.textContent.includes('Full edit'))?.click()`);
    await waitForSelector('.draft-editor-drawer');
    await new Promise(r => setTimeout(r, 250));

    // Verify D6 sections: header, slide badge 1/3, previous versions, final reviewer callout with Revise slide 2 button
    const drawerHeader = await evaluate(`document.querySelector('.draft-drawer-head-titles h2')?.textContent`);
    assert.ok(drawerHeader.includes('@moonjasmine.id'), 'Drawer header shows account handle');

    const slideBadge = await evaluate(`document.querySelector('.draft-drawer-preview .badge-n')?.textContent`);
    assert.equal(slideBadge, '1/3');

    const versionPillsCount = await evaluate(`document.querySelectorAll('.draft-version-item').length`);
    assert.equal(versionPillsCount, 1, 'Shows previous version item for slide 1');

    const finalCalloutBtn = await evaluate(`document.querySelector('.draft-final-callout button')?.textContent`);
    assert.equal(finalCalloutBtn, 'Revise slide 2');

    await screenshot('d6-drawer-1280.png');
    assert.ok(await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`), 'No horizontal scroll with D6 open at 1280px');

    // Test D6 at 375px
    await setViewport(375, 812);
    await new Promise(r => setTimeout(r, 200));
    await screenshot('d6-drawer-375.png');
    assert.ok(await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`), 'No horizontal scroll with D6 open at 375px');

    // Test Autosave flush on immediate Esc close (before 800ms debounce expires)
    await setViewport(1280, 900);
    await evaluate(`{
      const ta = document.querySelector('.draft-drawer-right textarea');
      ta.value = 'Flushed caption on immediate drawer close #lashcluster';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }`);
    await new Promise(r => setTimeout(r, 400));

    const drawerClosed = await evaluate(`!document.querySelector('.draft-editor-drawer')`);
    assert.ok(drawerClosed, 'Drawer closed on Escape');

    const flushedRun = one('SELECT caption FROM generator_runs WHERE id=?', 'run-d6-1');
    assert.equal(flushedRun.caption, 'Flushed caption on immediate drawer close #lashcluster');

    assert.equal(pageErrors.length, 0, 'Uncaught page errors: ' + pageErrors.join('; '));
    ws.close();
  } finally {
    chrome.kill('SIGKILL');
    server.close();
  }
});
