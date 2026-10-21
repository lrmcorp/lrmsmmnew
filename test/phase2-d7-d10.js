import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { findScheduleClashes, shiftClashingRuns } from '../public/draft-sessions.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lrmsmm-phase2-d7d10-'));
Object.assign(process.env, { META_MOCK: '1', DATA_DIR: tmp, DISABLE_WORKER: '1' });

const { app } = await import('../src/server.js');
const { config } = await import('../src/config.js');
const { createUser } = await import('../src/auth.js');
const { run, one } = await import('../src/db.js');
const { encrypt } = await import('../src/util.js');
const { setAssignments } = await import('../src/services/scope.js');
const gen = await import('../src/services/generator.js');
const sharp = (await import('sharp')).default;

test('findScheduleClashes and shiftClashingRuns detect 15-min same-account clashes and shift by 15 min', () => {
  const runs = [
    {
      id: 'r1',
      scheduled_at: '2026-11-03T12:15:00+07:00',
      targets: [{ account_id: 'acc-mj' }]
    },
    {
      id: 'r2',
      scheduled_at: '2026-11-04T19:15:00+07:00',
      targets: [{ account_id: 'acc-ms' }]
    }
  ];
  const existingPosts = [
    {
      id: 'post-existing-1',
      status: 'scheduled',
      scheduled_at: '2026-11-03T12:20:00+07:00',
      targets: [{ account_id: 'acc-mj' }]
    }
  ];

  const clashes = findScheduleClashes(runs, existingPosts);
  assert.equal(clashes.length, 1);
  assert.equal(clashes[0].id, 'r1');

  const shiftedCount = shiftClashingRuns(runs, existingPosts);
  assert.equal(shiftedCount, 1);
  // Shifted +15 minutes from 12:15 -> 12:30 (+07:00 = 05:30Z), wait: 12:30 is within 10 min of 12:20 so it shifts once more to 12:45 (05:45Z)!
  assert.equal(new Date(runs[0].scheduled_at).toISOString(), '2026-11-03T05:45:00.000Z');
});

test('D7 Grid+Bulk, D8 Bulk Approve+Clash+Partial Failure, D9 Session Calendar+Undo, and D10 Mobile Review', async () => {
  const qaDir = path.resolve('docs/redesign/qa/phase2');
  fs.mkdirSync(qaDir, { recursive: true });

  const user = createUser({ email: 'phase2-d7@lrmcorp.id', password: 'password123', name: 'Reyner Liando', role: 'owner' });
  run("INSERT INTO accounts(id,platform,platform_user_id,username,token_enc) VALUES('acc-ms','instagram','p-ms','manisky.id',?)", encrypt('meta'));
  run("INSERT INTO accounts(id,platform,platform_user_id,username,token_enc) VALUES('acc-mj','instagram','p-mj','moonjasmine.id',?)", encrypt('meta'));
  run("INSERT INTO accounts(id,platform,platform_user_id,username,token_enc) VALUES('acc-ks','threads','p-ks','kopisenja.th',?)", encrypt('meta'));
  setAssignments(user.id, ['acc-ms', 'acc-mj', 'acc-ks']);
  for (const p of ['openai', 'anthropic', 'gemini']) gen.saveKey(user, p, 'fixture-key');

  const mediaSvc = await import('../src/services/media.js');
  const img1 = await mediaSvc.saveBuffer(user.id, await sharp({ create: { width: 800, height: 1000, channels: 3, background: '#0ea5e9' } }).png().toBuffer(), { mime: 'image/png' });
  const img2 = await mediaSvc.saveBuffer(user.id, await sharp({ create: { width: 800, height: 1000, channels: 3, background: '#10b981' } }).png().toBuffer(), { mime: 'image/png' });
  const img3 = await mediaSvc.saveBuffer(user.id, await sharp({ create: { width: 800, height: 1000, channels: 3, background: '#8b5cf6' } }).png().toBuffer(), { mime: 'image/png' });
  const img4 = await mediaSvc.saveBuffer(user.id, await sharp({ create: { width: 800, height: 1000, channels: 3, background: '#f59e0b' } }).png().toBuffer(), { mime: 'image/png' });

  // Seed an existing scheduled post from another session on @moonjasmine.id at 2026-11-03T12:15:00+07:00 (05:15:00.000Z)
  // so D8 clash check detects it AND D9 session calendar renders it as a context post!
  run(`INSERT INTO posts(id,created_by,content,media_ids,scheduled_at,status,created_at)
       VALUES('post-other-1',?,'Existing Promo Teaser on Moon Jasmine','[]','2026-11-03T05:15:00.000Z','scheduled','2026-10-19T10:00:00Z')`,
    user.id);
  run(`INSERT INTO post_targets(id,post_id,account_id,platform,status,run_at)
       VALUES('pt-other-1','post-other-1','acc-mj','instagram','pending','2026-11-03T05:15:00.000Z')`);

  run(`INSERT INTO posts(id,created_by,content,media_ids,scheduled_at,status,created_at)
       VALUES('post-other-2',?,'Published Morning Story on Manisky','[]','2026-11-01T02:00:00.000Z','published','2026-10-18T09:00:00Z')`,
    user.id);
  run(`INSERT INTO post_targets(id,post_id,account_id,platform,status,run_at)
       VALUES('pt-other-2','post-other-2','acc-ms','instagram','published','2026-11-01T02:00:00.000Z')`);

  const planId = 'plan-d7-bulk';
  run(`INSERT INTO generator_plans(id,user_id,request_id,request_hash,brief,start_date,end_date,content_count,recommendation,created_at)
       VALUES(?,?,'req-d7','hash-d7',?,'2026-11-02','2026-11-08',6,'{}','2026-10-20T18:00:00Z')`,
    planId, user.id, '11.11 Promo: Lash clusters for beginners');

  const defaultAgents = JSON.stringify({
    concept: { provider: 'openai', model: 'gpt-4o' },
    revision: { provider: 'openai', model: 'gpt-4o' },
    visual: { provider: 'openai', model: 'gpt-4o' },
    image: { provider: 'gemini', model: 'gemini-3.1-flash-image-preview' },
    final: { provider: 'openai', model: 'gpt-4o' }
  });

  const seededRuns = [
    {
      id: 'run-d7-1',
      account_id: 'acc-ms',
      slides: 4,
      media: [img1.id, img2.id, img3.id, img4.id],
      status: 'review',
      slot: '2026-11-02T12:15:00+07:00',
      title: 'Soft Morning Look 1',
      caption: 'Four-step morning routine for effortless lash clusters. #manisky'
    },
    {
      id: 'run-d7-2',
      account_id: 'acc-mj',
      slides: 3,
      media: [img2.id, img3.id, img4.id],
      status: 'review',
      // Clashes with post-other-1 on acc-mj at 2026-11-03T12:15:00+07:00!
      slot: '2026-11-03T12:15:00+07:00',
      title: 'Outer Corner Placement',
      caption: 'Start from the outer corner and press gently for 3 seconds. #moonjasmine'
    },
    {
      id: 'run-d7-3',
      account_id: 'acc-ms',
      slides: 2,
      media: [img3.id, img1.id],
      status: 'review',
      slot: '2026-11-04T19:15:00+07:00',
      title: 'Evening Removal Care',
      caption: 'Oil-based remover dissolves bond without pulling natural lashes. #manisky'
    },
    {
      id: 'run-d7-4',
      account_id: 'acc-ks',
      slides: 1,
      media: [img4.id],
      status: 'review',
      slot: '2026-11-05T08:30:00+07:00',
      title: 'Coffee & Confidence',
      caption: 'Quick morning routine before your first espresso. #kopisenja'
    },
    {
      id: 'run-d7-5',
      account_id: 'acc-mj',
      slides: 3,
      media: [img1.id, img4.id, img2.id],
      status: 'approved',
      slot: '2026-11-06T12:15:00+07:00',
      title: 'Weekend Bundle Preview',
      caption: '11.11 bundle preview already approved to calendar. #moonjasmine'
    },
    {
      id: 'run-d7-fail',
      account_id: 'acc-mj',
      slides: 2,
      // Empty media_ids on a 'review' run causes POST /approve to fail with 400 so we can test partial failure!
      media: [],
      status: 'review',
      slot: '2026-11-07T19:15:00+07:00',
      title: 'Incomplete Bundle Card',
      caption: 'Draft missing media to exercise partial bulk approval failure.'
    }
  ];

  for (const r of seededRuns) {
    run(`INSERT INTO generator_runs(id,user_id,request_id,request_hash,brief,targets,slide_count,agents,status,scheduled_at,plan_id,title,caption,media_ids,steps,created_at,updated_at,draft_touched_at)
         VALUES(?,?,'req-${r.id}','hash','11.11 Promo',?,?,?, ?,?,?,?,?,?,'{}','2026-10-20T18:00:00Z','2026-10-20T18:00:00Z','2026-10-20T18:00:00Z')`,
      r.id, user.id, JSON.stringify([{ account_id: r.account_id }]), r.slides, defaultAgents,
      r.status, r.slot, planId, r.title, r.caption, JSON.stringify(r.media));
  }

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

  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-d7d10-'));
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    '--remote-debugging-port=9227',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--user-data-dir=' + userDir
  ]);

  try {
    let connected = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch('http://127.0.0.1:9227/json/version');
        if (res.ok) { connected = true; break; }
      } catch {}
      await new Promise(r => setTimeout(r, 100));
    }
    assert.ok(connected, 'Chrome CDP did not start');

    const tabs = await (await fetch('http://127.0.0.1:9227/json/list')).json();
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
    // 1. D7 Grid + Bulk Selection at 1280px & 375px
    // =========================================================================
    await setViewport(1280, 900);
    await cdp('Page.navigate', { url: `${baseUrl}/#/generator/drafts/${planId}?view=grid` });
    await waitForSelector('.draft-grid-wrap');
    await new Promise(r => setTimeout(r, 300));

    const gridCardCount = await evaluate(`document.querySelectorAll('.draft-grid-card').length`);
    assert.equal(gridCardCount, 6, 'Grid view renders all 6 runs');

    // Select first 3 cards via checkbox
    await evaluate(`{
      document.querySelectorAll('.draft-grid-check')[0].click();
      document.querySelectorAll('.draft-grid-check')[1].click();
      document.querySelectorAll('.draft-grid-check')[2].click();
    }`);
    await waitForSelector('.draft-session-bulk');
    const bulkCountText = await evaluate(`document.querySelector('.draft-bulk-count')?.textContent`);
    assert.equal(bulkCountText, '3 selected');

    await screenshot('d7-grid-bulk-1280.png');
    assert.ok(await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`), 'No horizontal scroll on D7 at 1280px');

    await setViewport(375, 812);
    await new Promise(r => setTimeout(r, 200));
    await screenshot('d7-grid-bulk-375.png');
    assert.ok(await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`), 'No horizontal scroll on D7 at 375px');

    // =========================================================================
    // 2. D8 Bulk Approve Dialog + Clash Handling + 15-min Shift + Partial Failure
    // =========================================================================
    await setViewport(1280, 900);
    await new Promise(r => setTimeout(r, 150));

    // Select all 6 items (5 ready, including 1 clashing and 1 missing media)
    await evaluate(`document.querySelector('.draft-select-all-btn')?.click()`);
    await new Promise(r => setTimeout(r, 100));

    // Click 'Approve 5 to calendar' in bulk bar
    await evaluate(`Array.from(document.querySelectorAll('.draft-session-bulk button')).find(b => b.textContent.includes('Approve'))?.click()`);
    await waitForSelector('.draft-approve-dialog');
    await new Promise(r => setTimeout(r, 300));

    // Verify account summary table and clash warning
    const tableText = await evaluate(`document.querySelector('.draft-approve-table')?.textContent || ''`);
    assert.ok(tableText.includes('@moonjasmine.id'), 'Account breakdown table includes @moonjasmine.id');
    const clashText = await evaluate(`document.querySelector('.draft-approve-clash')?.textContent || ''`);
    assert.ok(clashText.includes('15 minutes'), 'Clash callout warns about 15-minute proximity');

    await screenshot('d8-bulk-approve-1280.png');
    assert.ok(await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`), 'No horizontal scroll on D8 at 1280px');

    await setViewport(375, 812);
    await new Promise(r => setTimeout(r, 200));
    await screenshot('d8-bulk-approve-375.png');
    assert.ok(await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`), 'No horizontal scroll on D8 at 375px');

    await setViewport(1280, 900);
    await new Promise(r => setTimeout(r, 150));

    // Click 'Shift by 15 minutes' and verify clash resolves and DB updates run-d7-2
    await evaluate(`document.querySelector('.draft-approve-shift-btn')?.click()`);
    await new Promise(r => setTimeout(r, 350));

    const postShiftClashText = await evaluate(`document.querySelector('.draft-approve-clash.tone-ok')?.textContent || ''`);
    assert.ok(postShiftClashText.includes('by 15 minutes'), 'Clash resolved after 15-minute shift');

    const shiftedRunInDb = one('SELECT scheduled_at FROM generator_runs WHERE id=?', 'run-d7-2');
    assert.equal(new Date(shiftedRunInDb.scheduled_at).toISOString(), '2026-11-03T05:30:00.000Z');

    // Click 'Approve to calendar' -> 4 succeed, 1 (run-d7-fail) fails due to missing media
    await evaluate(`document.querySelector('.draft-approve-confirm-btn')?.click()`);
    await waitForSelector('.draft-approve-partial');
    await new Promise(r => setTimeout(r, 300));

    const partialText = await evaluate(`document.querySelector('.draft-approve-partial h3')?.textContent || ''`);
    assert.ok(partialText.includes('4 approved · 1 failed'), 'Partial failure banner shows 4 approved · 1 failed');

    // Close dialog via 'Stay in session' and verify only the 1 failed run remains selected in the grid
    await evaluate(`document.querySelector('dialog[open] .df .btn:not(.primary)')?.click()`);
    await new Promise(r => setTimeout(r, 200));
    const remainingSelected = await evaluate(`document.querySelector('.draft-bulk-count')?.textContent || ''`);
    assert.equal(remainingSelected, '1 selected', 'Failed run stays selected after partial failure');

    // Give run-d7-fail media in DB and retry bulk approve to verify the full success Result dialog
    run('UPDATE generator_runs SET media_ids=? WHERE id=?', JSON.stringify([img1.id]), 'run-d7-fail');
    await evaluate(`location.reload()`);
    await waitForSelector('.draft-grid-wrap');
    await new Promise(r => setTimeout(r, 350));

    // Click header 'Approve 1 ready' button
    await evaluate(`document.querySelector('.draft-session-actions .btn.primary')?.click()`);
    await waitForSelector('.draft-approve-confirm-btn');
    await new Promise(r => setTimeout(r, 250));
    await evaluate(`document.querySelector('.draft-approve-confirm-btn')?.click()`);
    await waitForSelector('.draft-approve-result');
    await new Promise(r => setTimeout(r, 200));

    const resultHeader = await evaluate(`document.querySelector('dialog[open] .dh h2')?.textContent || ''`);
    assert.ok(resultHeader.includes('1 posts added to the calendar'), 'Result dialog confirms posts added to calendar');

    // Click 'Stay in session'
    await evaluate(`document.querySelector('dialog[open] .df .btn:not(.primary)')?.click()`);
    await new Promise(r => setTimeout(r, 200));

    // =========================================================================
    // 3. D9 Session Calendar + Context Posts + Reschedule + Undo
    // =========================================================================
    // Keep run-d7-1 and run-d7-2 in 'review' state so calendar shows Draft + Approved + Published (other session)
    run("UPDATE generator_runs SET status='review', post_id=NULL WHERE id IN ('run-d7-1','run-d7-2')");
    await evaluate(`location.reload()`);
    await waitForSelector('.draft-grid-wrap');
    await new Promise(r => setTimeout(r, 300));

    await evaluate(`Array.from(document.querySelectorAll('.scope-views button')).find(b => b.textContent.trim() === 'Calendar')?.click()`);
    await waitForSelector('.draft-run-calendar');
    await new Promise(r => setTimeout(r, 400));

    // Verify legend items and other-session context post pills
    const legendItems = await evaluate(`Array.from(document.querySelectorAll('.draft-cal-legend-item')).map(el => el.textContent.trim())`);
    assert.deepEqual(legendItems, ['Draft', 'Approved', 'Published (other session)', 'Failed']);

    const publishedContextPills = await evaluate(`document.querySelectorAll('.draft-run-event.state-published').length`);
    assert.ok(publishedContextPills >= 1, 'Session calendar displays other-session scheduled/published context posts');

    await screenshot('d9-calendar-1280.png');
    assert.ok(await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`), 'No horizontal scroll on D9 at 1280px');

    await setViewport(375, 812);
    await new Promise(r => setTimeout(r, 200));
    await screenshot('d9-calendar-375.png');
    assert.ok(await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`), 'No horizontal scroll on D9 at 375px');

    await setViewport(1280, 900);
    await new Promise(r => setTimeout(r, 150));

    // Reschedule first session run event by +1 day via Alt+ArrowRight
    const beforeMoveIso = one('SELECT scheduled_at FROM generator_runs WHERE id=?', 'run-d7-1').scheduled_at;
    await evaluate(`{
      const pill = Array.from(document.querySelectorAll('.draft-run-event:not(.state-published)'))[0];
      pill.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true }));
    }`);
    await waitForSelector('#toast .toast-act');
    await new Promise(r => setTimeout(r, 250));

    const movedIso = one('SELECT scheduled_at FROM generator_runs WHERE id=?', 'run-d7-1').scheduled_at;
    assert.equal(new Date(movedIso).toISOString(), '2026-11-03T05:15:00.000Z', 'Moved +1 day preserving 12:15 WIB (05:15Z)');

    // Click Undo in toast and verify original scheduled_at is restored
    await evaluate(`document.querySelector('#toast .toast-act')?.click()`);
    await new Promise(r => setTimeout(r, 300));
    const restoredIso = one('SELECT scheduled_at FROM generator_runs WHERE id=?', 'run-d7-1').scheduled_at;
    assert.equal(new Date(restoredIso).toISOString(), new Date(beforeMoveIso).toISOString(), 'Undo restored original scheduled_at');

    // =========================================================================
    // 4. D10 Mobile One-at-a-Time Review at 375px
    // =========================================================================
    // Set one run back to 'review' so we can test 'Approve and next' on mobile
    run("UPDATE generator_runs SET status='review' WHERE id='run-d7-1'");
    await setViewport(375, 812);
    await cdp('Page.navigate', { url: `${baseUrl}/#/generator/drafts/${planId}` });
    await waitForSelector('.draft-mobile-review');
    await new Promise(r => setTimeout(r, 350));

    const counterText = await evaluate(`document.querySelector('.draft-mobile-counter b')?.textContent`);
    assert.equal(counterText, '1 / 6');

    const stickyBarButtons = await evaluate(`Array.from(document.querySelectorAll('.draft-mobile-bar button')).map(b => b.textContent.trim())`);
    assert.deepEqual(stickyBarButtons, ['Skip', 'Approve and next']);

    await screenshot('d10-mobile-review-375.png');
    assert.ok(await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`), 'No horizontal scroll on D10 at 375px');

    // Click 'Approve and next' on mobile card 1 -> approves run-d7-1 and advances to 2 / 6
    await evaluate(`document.querySelector('.draft-mobile-bar .btn-pri')?.click()`);
    await new Promise(r => setTimeout(r, 350));

    const nextCounterText = await evaluate(`document.querySelector('.draft-mobile-counter b')?.textContent`);
    assert.equal(nextCounterText, '2 / 6', 'Mobile review advanced to 2 / 6 after Approve and next');
    const mobileApprovedRun = one('SELECT status FROM generator_runs WHERE id=?', 'run-d7-1');
    assert.equal(mobileApprovedRun.status, 'approved');

    assert.equal(pageErrors.length, 0, 'Uncaught page errors: ' + pageErrors.join('; '));
    ws.close();
  } finally {
    chrome.kill('SIGKILL');
    server.close();
  }
});
