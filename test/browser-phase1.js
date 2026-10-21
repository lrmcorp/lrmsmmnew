import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lrmsmm-qa-'));
Object.assign(process.env, { META_MOCK: '1', DATA_DIR: tmp, DISABLE_WORKER: '1' });

const { app } = await import('../src/server.js');
const { config } = await import('../src/config.js');
const { createUser } = await import('../src/auth.js');
const { run, one } = await import('../src/db.js');
const { encrypt } = await import('../src/util.js');
const { setAssignments } = await import('../src/services/scope.js');
const gen = await import('../src/services/generator.js');
const sharp = (await import('sharp')).default;

const imgBuf = await sharp({
  create: { width: 1024, height: 1024, channels: 3, background: '#38bdf8' }
}).png().toBuffer();

// Seed data
const user = createUser({ email: 'owner@lrmcorp.id', password: 'password123', name: 'Reyner Liando', role: 'owner' });

run("INSERT INTO accounts(id,platform,platform_user_id,username,token_enc) VALUES('acc-ms','instagram','p-ms','manisky.id',?)", encrypt('meta'));
run("INSERT INTO accounts(id,platform,platform_user_id,username,token_enc) VALUES('acc-mj','instagram','p-mj','moonjasmine.id',?)", encrypt('meta'));
run("INSERT INTO accounts(id,platform,platform_user_id,username,token_enc) VALUES('acc-hb','instagram','p-hb','hannabeauty.kr',?)", encrypt('meta'));
run("INSERT INTO accounts(id,platform,platform_user_id,username,token_enc) VALUES('acc-hn','instagram','p-hn','hannanails.id',?)", encrypt('meta'));
run("INSERT INTO accounts(id,platform,platform_user_id,username,token_enc) VALUES('acc-ks','threads','p-ks','kopisenja.th',?)", encrypt('meta'));

setAssignments(user.id, ['acc-ms', 'acc-mj', 'acc-hb', 'acc-hn', 'acc-ks']);
for (const p of ['openai', 'anthropic', 'gemini']) gen.saveKey(user, p, 'fixture-key');

// Upload a test image
const upMedia = await (await import('../src/services/media.js')).saveBuffer(user.id, imgBuf, {
  mime: 'image/png'
});

// Seed Session 1: Manisky Story plan only
const maniskyPlanId = 'plan-manisky-01';
run(`INSERT INTO generator_plans(id,user_id,request_id,request_hash,brief,start_date,end_date,content_count,recommendation,created_at)
     VALUES(?,?,'req-m1','hash-m1',?,'2026-10-21','2026-11-03',12,'{}','2026-10-20T22:11:00Z')`,
  maniskyPlanId, user.id, '# MANISKY — CHAPTER 01: A LITTLE BEAUTY, A LITTLE MANISKY');

const episodes = [
  { ep: 13, title: 'A Quiet Morning Ritual', brief: 'Opens Chapter 5: a calm morning routine, product not shown yet.', type: 'carousel', slides: 3, time: '2026-10-21T12:15:00+07:00', reason: 'Lunch hour, audience active' },
  { ep: 14, title: 'Shades of Blush', brief: 'Explores the soft blush and champagne palette.', type: 'single', slides: 1, time: '2026-10-22T19:15:00+07:00', reason: 'Evening downtime' },
  { ep: 15, title: 'Details That Whisper', brief: 'Close-ups of texture and shimmer.', type: 'carousel', slides: 3, time: '2026-10-24T12:15:00+07:00', reason: 'Weekend' },
  { ep: 16, title: 'Press-On in 10 Minutes', brief: 'How-to (Reel from an uploaded video).', type: 'reel', slides: 1, time: '2026-10-26T19:15:00+07:00', reason: '-' }
];
for (let i = 0; i < 12; i++) {
  const day = 21 + i;
  const fallbackTime = day <= 31 ? `2026-10-${day}T12:15:00+07:00` : `2026-11-0${day - 31}T12:15:00+07:00`;
  const e = episodes[i] || { ep: 17 + i - 4, title: `Episode ${17 + i - 4}`, brief: 'Story progression.', type: 'single', slides: 1, time: fallbackTime, reason: 'Regular slot' };
  run(`INSERT INTO generator_runs(id,user_id,request_id,request_hash,brief,targets,slide_count,agents,status,scheduled_at,plan_id,title,content_type,schedule_reason,story_episode,created_at,updated_at,draft_touched_at)
       VALUES(?,?,'req-m1-${i}','hash',?,?,?,'{}','planned',?,?,?,?,?,?,'2026-10-20T22:11:00Z','2026-10-20T22:11:00Z','2026-10-20T22:11:00Z')`,
    `run-m-${i}`, user.id, `# MANISKY — CHAPTER 01\n${e.brief}`, JSON.stringify([{ account_id: 'acc-ms' }]),
    e.slides, e.time, maniskyPlanId, e.title, e.type, e.reason, e.ep);
}

// Seed Session 2: 11.11 Promo Campaign (D5 Image Review)
const promoPlanId = 'plan-promo-11';
run(`INSERT INTO generator_plans(id,user_id,request_id,request_hash,brief,start_date,end_date,content_count,recommendation,created_at)
     VALUES(?,?,'req-p1','hash-p1',?,'2026-11-01','2026-11-14',36,'{}','2026-10-20T18:00:00Z')`,
  promoPlanId, user.id, '11.11 Promo: Lash clusters for beginners');

for (let i = 0; i < 36; i++) {
  const status = i < 24 ? 'review' : i < 32 ? 'approved' : i < 34 ? 'failed' : 'running';
  const targetAcc = i % 3 === 0 ? 'acc-mj' : i % 3 === 1 ? 'acc-hb' : 'acc-hn';
  const dayOffset = Math.floor(i / 4);
  const hour = i % 2 === 0 ? '12:15:00' : '19:15:00';
  const time = `2026-11-${String(1 + dayOffset).padStart(2, '0')}T${hour}+07:00`;
  const error = status === 'failed' ? 'Slide 2 failed: API quota ran out.' : null;
  const caption = status === 'failed' ? '' : `New to lash clusters? Step ${i + 1} before you head out. Check the link in bio for the 11.11 promo! #lashcluster #moonjasmine`;

  run(`INSERT INTO generator_runs(id,user_id,request_id,request_hash,brief,targets,slide_count,agents,status,scheduled_at,plan_id,title,caption,media_ids,error,created_at,updated_at,draft_touched_at)
       VALUES(?,?,'req-p1-${i}','hash',?,?,?,'{}',?,?,?,?,?,?,?,'2026-10-20T18:00:00Z','2026-10-20T18:00:00Z','2026-10-20T18:00:00Z')`,
    `run-p-${i}`, user.id, `11.11 Promo Post ${i + 1}`, JSON.stringify([{ account_id: targetAcc }]),
    3, status, time, promoPlanId, `Lash clusters tip ${i + 1}`, caption, JSON.stringify([upMedia.id]), error);
}

// Seed Session 3: Expired session (D2)
const expiredPlanId = 'plan-expired-hydra';
run(`INSERT INTO generator_plans(id,user_id,request_id,request_hash,brief,start_date,end_date,content_count,recommendation,created_at)
     VALUES(?,?,'req-exp','hash-exp',?,'2026-10-10','2026-10-17',6,'{}','2026-10-09T10:00:00Z')`,
  expiredPlanId, user.id, 'Moon & Jasmine: Summer hydration');

// Seed Session 4: Done session
const donePlanId = 'plan-done-routine';
run(`INSERT INTO generator_plans(id,user_id,request_id,request_hash,brief,start_date,end_date,content_count,recommendation,created_at)
     VALUES(?,?,'req-done','hash-done',?,'2026-10-05','2026-10-18',6,'{}','2026-10-04T10:00:00Z')`,
  donePlanId, user.id, 'Hanna Beauty: K-beauty routine');

for (let i = 0; i < 6; i++) {
  run(`INSERT INTO generator_runs(id,user_id,request_id,request_hash,brief,targets,slide_count,agents,status,scheduled_at,plan_id,title,caption,media_ids,created_at,updated_at)
       VALUES(?,?,'req-done-${i}','hash',?,?,?,'{}','approved','2026-10-10T12:15:00+07:00',?,?,?,?,'2026-10-04T10:00:00Z','2026-10-04T10:00:00Z')`,
    `run-d-${i}`, user.id, 'K-beauty Routine', JSON.stringify([{ account_id: 'acc-hb' }]),
    1, donePlanId, `K-beauty Step ${i + 1}`, 'Routine post', JSON.stringify([upMedia.id]));
}

// Start HTTP server
const server = app.listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const port = server.address().port;
const baseUrl = `http://127.0.0.1:${port}`;
config.publicUrl = baseUrl;

// Authenticate session cookie
const loginRes = await fetch(baseUrl + '/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: user.email, password: 'password123' })
});
const rawSid = loginRes.headers.get('set-cookie').split(';')[0].split('=')[1];

test('Browser QA at 1280px and 375px via Headless Chrome', async t => {
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-prof-'));
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    '--remote-debugging-port=9224',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--user-data-dir=' + userDir
  ]);

  try {
    // Wait for Chrome CDP port
    let connected = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch('http://127.0.0.1:9224/json/version');
        if (res.ok) { connected = true; break; }
      } catch {}
      await new Promise(r => setTimeout(r, 100));
    }
    assert.ok(connected, 'Chrome CDP did not start');

    const tabsRes = await fetch('http://127.0.0.1:9224/json/list');
    const tabs = await tabsRes.json();
    const pageTab = tabs.find(t => t.type === 'page');
    assert.ok(pageTab, 'No page tab found in Chrome');
    const wsUrl = pageTab.webSocketDebuggerUrl;

    const ws = new WebSocket(wsUrl);
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

    // Set cookie
    await cdp('Network.setCookie', {
      name: 'lrmsmm_sid',
      value: rawSid,
      domain: '127.0.0.1',
      path: '/'
    });

    async function evaluate(expression) {
      const res = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      return res.result?.value;
    }

    async function setViewport(width, height) {
      await cdp('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 2,
        mobile: width < 600
      });
    }

    async function screenshot(filename) {
      const data = await cdp('Page.captureScreenshot', { format: 'png' });
      const outPath = path.resolve('docs/redesign/qa/phase1', filename);
      fs.writeFileSync(outPath, Buffer.from(data.data, 'base64'));
    }

    async function gotoHash(h) {
      await evaluate(`location.hash = '${h}'`);
    }

    async function waitForSelector(sel, timeout = 5000) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const found = await evaluate(`!!document.querySelector('${sel}')`);
        if (found) return true;
        await new Promise(r => setTimeout(r, 100));
      }
      throw new Error(`Timeout waiting for selector: ${sel}`);
    }

    // -------------------------------------------------------------
    // Test 1: Desktop (1280px) - Session List (D1)
    // -------------------------------------------------------------
    await setViewport(1280, 800);
    await cdp('Page.navigate', { url: `${baseUrl}/#/generator/drafts` });
    await waitForSelector('.draft-session-results');
    await new Promise(r => setTimeout(r, 500));

    // Verify Title & Header
    const pageTitle = await evaluate(`document.querySelector('.pagehead h1')?.textContent`);
    assert.equal(pageTitle, 'Drafts');

    // Verify No horizontal scroll at 1280px
    const scrollOk1280 = await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`);
    assert.ok(scrollOk1280, 'Horizontal scroll detected at 1280px');

    // Verify Tab counts
    const tabCounts = await evaluate(`Array.from(document.querySelectorAll('.draft-session-tabs button')).map(b => b.textContent)`);
    assert.ok(tabCounts.some(t => t.includes('Needs action')));
    assert.ok(tabCounts.some(t => t.includes('Done')));

    // Verify Manisky Session Card exists with clean title (no #)
    const cardTitles = await evaluate(`Array.from(document.querySelectorAll('.draft-session-intro b')).map(b => b.textContent)`);
    assert.ok(cardTitles.includes('Manisky: Chapter 01, A Little Beauty, A Little Manisky'));
    assert.ok(cardTitles.includes('11.11 Promo: Lash clusters for beginners'));

    // Capture D1 Screenshot
    await screenshot('drafts-list-1280.png');

    // -------------------------------------------------------------
    // Test 2: Desktop (1280px) - Session Page Plan Only (D3)
    // -------------------------------------------------------------
    await gotoHash(`#/generator/drafts/${maniskyPlanId}`);
    await waitForSelector('.draft-plan-table');
    await new Promise(r => setTimeout(r, 500));

    // Verify Title & Meta
    const sessionHeadTitle = await evaluate(`document.querySelector('.draft-session-header h1')?.textContent`);
    assert.equal(sessionHeadTitle, 'Manisky: Chapter 01, A Little Beauty, A Little Manisky');

    // Verify callout and table rows
    const calloutPresent = await evaluate(`!!document.querySelector('.draft-plan-callout')`);
    assert.ok(calloutPresent);

    const episodeRowCount = await evaluate(`document.querySelectorAll('.draft-plan-table tbody tr').length`);
    assert.equal(episodeRowCount, 12);

    // Verify bulk bar
    const bulkBarPresent = await evaluate(`!!document.querySelector('.draft-session-bulk')`);
    assert.ok(bulkBarPresent);

    // Verify no horizontal scroll at 1280px on D3
    const scrollOkD3 = await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`);
    assert.ok(scrollOkD3, 'Horizontal scroll detected on D3 at 1280px');

    await screenshot('draft-session-plan-1280.png');

    // -------------------------------------------------------------
    // Test 3: Desktop (1280px) - Session Page Image Review (D5)
    // -------------------------------------------------------------
    await gotoHash(`#/generator/drafts/${promoPlanId}`);
    await waitForSelector('.draft-review-layout');
    await new Promise(r => setTimeout(r, 500));

    // Verify D5 toolbar chips
    const filterButtons = await evaluate(`Array.from(document.querySelectorAll('.draft-review-filters button')).map(b => b.textContent)`);
    assert.ok(filterButtons.some(b => b.includes('All')));
    assert.ok(filterButtons.some(b => b.includes('Ready')));
    assert.ok(filterButtons.some(b => b.includes('Approved')));
    assert.ok(filterButtons.some(b => b.includes('Failed')));

    // Verify Day Group exists
    const dayGroupsCount = await evaluate(`document.querySelectorAll('.draft-day-group').length`);
    assert.ok(dayGroupsCount > 0, 'No day groups rendered in By date view');

    // Verify Post cards render
    const postCardsCount = await evaluate(`document.querySelectorAll('.draft-post-card').length`);
    assert.ok(postCardsCount > 0, 'No post cards rendered');

    // Verify Preview panel rendered with phone frame and buttons
    const previewPresent = await evaluate(`!!document.querySelector('.draft-phone-frame')`);
    assert.ok(previewPresent, 'Phone frame preview missing');

    const approveButtonText = await evaluate(`document.querySelector('.draft-review-preview .btn.primary.lg')?.textContent`);
    assert.ok(approveButtonText?.includes('Approve to calendar'), 'Approve button label incorrect');

    // Verify no horizontal scroll at 1280px on D5
    const scrollOkD5 = await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`);
    assert.ok(scrollOkD5, 'Horizontal scroll detected on D5 at 1280px');

    await screenshot('draft-session-review-1280.png');

    // Verify Keyboard navigation (ArrowRight moves to next card, E opens drawer)
    const firstSelectedCap = await evaluate(`document.querySelector('.draft-post-card.sel .draft-post-cap')?.textContent`);
    await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`);
    await new Promise(r => setTimeout(r, 200));
    const secondSelectedCap = await evaluate(`document.querySelector('.draft-post-card.sel .draft-post-cap')?.textContent`);
    assert.notEqual(firstSelectedCap, secondSelectedCap, 'ArrowRight did not move selection in D5');
    await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'A', bubbles: true }))`);
    await waitForSelector('dialog[open]');
    const approvalPrompt = await evaluate(`document.querySelector('dialog[open]')?.textContent`);
    assert.ok(approvalPrompt?.includes('Approve'), 'A shortcut skipped the approval confirmation');
    await evaluate(`document.querySelector('dialog[open]')?.close()`);
    await evaluate(`Array.from(document.querySelectorAll('.draft-session-actions button')).find(b => b.textContent.includes('Retry failed'))?.click()`);
    await waitForSelector('dialog[open]');
    const retryPrompt = await evaluate(`document.querySelector('dialog[open]')?.textContent`);
    assert.ok(retryPrompt?.includes('Retry failed'), 'Retry skipped the cost confirmation');
    await evaluate(`document.querySelector('dialog[open]')?.close()`);

    // Verify D2 Expired Session Page at 1280px
    await gotoHash(`#/generator/drafts/${expiredPlanId}`);
    await waitForSelector('.draft-session-header');
    await new Promise(r => setTimeout(r, 300));
    const expiredTitle = await evaluate(`document.querySelector('.ui-empty h3')?.textContent`);
    assert.equal(expiredTitle, 'Drafts deleted');
    await screenshot('draft-session-expired-1280.png');

    // -------------------------------------------------------------
    // Test 4: Mobile (375px) - Session List (D10 / G10)
    // -------------------------------------------------------------
    await setViewport(375, 812);
    await gotoHash('#/generator/drafts');
    await waitForSelector('.draft-session-results');
    await new Promise(r => setTimeout(r, 500));

    const scrollOkMobileList = await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`);
    assert.ok(scrollOkMobileList, 'Horizontal scroll detected on session list at 375px');
    await screenshot('drafts-list-375.png');

    // -------------------------------------------------------------
    // Test 5: Mobile (375px) - Session Page Plan Only (D3 at 375px)
    // -------------------------------------------------------------
    await gotoHash(`#/generator/drafts/${maniskyPlanId}`);
    await waitForSelector('.draft-plan-table');
    await new Promise(r => setTimeout(r, 500));

    const scrollOkMobilePlan = await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`);
    assert.ok(scrollOkMobilePlan, 'Horizontal scroll detected on plan page at 375px');
    await screenshot('draft-session-plan-375.png');

    // -------------------------------------------------------------
    // Test 6: Mobile (375px) - Session Page Image Review (D5 at 375px)
    // -------------------------------------------------------------
    await gotoHash(`#/generator/drafts/${promoPlanId}`);
    await waitForSelector('.draft-review-layout');
    await new Promise(r => setTimeout(r, 500));

    const scrollOkMobileReview = await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`);
    assert.ok(scrollOkMobileReview, 'Horizontal scroll detected on image review at 375px');
    await screenshot('draft-session-review-375.png');

    // -------------------------------------------------------------
    // Test 7: Backward Compatibility Links
    // -------------------------------------------------------------
    // ?plan=<id> redirect
    await gotoHash(`#/generator/drafts?plan=${maniskyPlanId}`);
    await waitForSelector('.draft-plan-table');
    const redirectedUrl = await evaluate(`location.hash`);
    assert.ok(redirectedUrl.includes(maniskyPlanId), `Legacy ?plan link did not redirect: ${redirectedUrl}`);

    // ?id=<run_id> redirect
    await gotoHash(`#/generator/drafts?id=run-p-0`);
    await waitForSelector('.draft-review-layout');
    const redirectedRunUrl = await evaluate(`location.hash`);
    assert.ok(redirectedRunUrl.includes(promoPlanId) && redirectedRunUrl.includes('item=run-p-0'), `Legacy ?id link did not redirect: ${redirectedRunUrl}`);

    assert.equal(pageErrors.length, 0, `Uncaught page exceptions: ${pageErrors.join('; ')}`);

    ws.close();
  } finally {
    chrome.kill();
    server.close();
  }
});
