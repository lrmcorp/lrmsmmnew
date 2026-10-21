import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { groupSessions, sessionState, sessionTitle, createDraftPages } from '../public/draft-sessions.js';
import { t } from '../public/strings.en.js';

test('sessionTitle format and clean rules', () => {
  // Test raw markdown stripping and uppercase title casing
  const title1 = sessionTitle({ brief: '# MANISKY — CHAPTER 01: A LITTLE BEAUTY, A LITTLE MANISKY' });
  assert.equal(title1, 'Manisky: Chapter 01, A Little Beauty, A Little Manisky');

  // Test already mixed case title
  const title2 = sessionTitle({ brief: '11.11 Promo: Lash clusters for beginners' });
  assert.equal(title2, '11.11 Promo: Lash clusters for beginners');

  // Test Chapter formatting
  const title3 = sessionTitle({ title: 'Manisky: Chapter 05: Soft Morning' });
  assert.equal(title3, 'Manisky: Chapter 05, Soft Morning');

  // Test long title truncation
  const longBrief = 'A very very long brief about organic vegan moisturizers that goes on and on and contains far more than eighty characters of marketing copy';
  const title4 = sessionTitle({ brief: longBrief });
  assert.ok(title4.length <= 81);
  assert.ok(title4.endsWith('…'));
});

test('sessionState resolution rules', () => {
  // 1. Expired: no runs, but plan has content_count > 0
  const expired = {
    plans: [{ id: 'p1', content_count: 12 }],
    runs: [],
    counts: { planned: 0, queued: 0, running: 0, concept_review: 0, review: 0, failed: 0, approved: 0, drafted: 0, cancelled: 0 }
  };
  assert.equal(sessionState(expired), 'expired');

  // 2. Plan only: all live runs are planned
  const planOnly = {
    plans: [{ id: 'p1', content_count: 12 }],
    runs: Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, status: 'planned' })),
    counts: { planned: 12, queued: 0, running: 0, concept_review: 0, review: 0, failed: 0, approved: 0, drafted: 0, cancelled: 0 }
  };
  assert.equal(sessionState(planOnly), 'plan');

  // 3. Concept review
  const concept = {
    plans: [{ id: 'p1', content_count: 6 }],
    runs: Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, status: 'concept_review' })),
    counts: { planned: 0, queued: 0, running: 0, concept_review: 6, review: 0, failed: 0, approved: 0, drafted: 0, cancelled: 0 }
  };
  assert.equal(sessionState(concept), 'concept');

  // 4. Image review
  const review = {
    plans: [{ id: 'p1', content_count: 36 }],
    runs: Array.from({ length: 36 }, (_, i) => ({ id: `r${i}`, status: i < 24 ? 'review' : i < 32 ? 'approved' : i < 34 ? 'failed' : 'running' })),
    counts: { planned: 0, queued: 0, running: 2, concept_review: 0, review: 24, failed: 2, approved: 8, drafted: 0, cancelled: 0 }
  };
  assert.equal(sessionState(review), 'review');

  // 5. Failed
  const failed = {
    plans: [{ id: 'p1', content_count: 2 }],
    runs: [{ id: 'r1', status: 'failed' }, { id: 'r2', status: 'failed' }],
    counts: { planned: 0, queued: 0, running: 0, concept_review: 0, review: 0, failed: 2, approved: 0, drafted: 0, cancelled: 0 }
  };
  assert.equal(sessionState(failed), 'failed');

  // 6. Running
  const running = {
    plans: [{ id: 'p1', content_count: 4 }],
    runs: [{ id: 'r1', status: 'running' }, { id: 'r2', status: 'queued' }],
    counts: { planned: 0, queued: 1, running: 1, concept_review: 0, review: 0, failed: 0, approved: 0, drafted: 0, cancelled: 0 }
  };
  assert.equal(sessionState(running), 'running');

  // 7. Done
  const done = {
    plans: [{ id: 'p1', content_count: 12 }],
    runs: Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, status: 'approved' })),
    counts: { planned: 0, queued: 0, running: 0, concept_review: 0, review: 0, failed: 0, approved: 12, drafted: 0, cancelled: 0 }
  };
  assert.equal(sessionState(done), 'done');
});

test('groupSessions aggregates plans and runs accurately', () => {
  const plans = [
    {
      id: 'p-manisky',
      brief: '# MANISKY — CHAPTER 01: A LITTLE BEAUTY, A LITTLE MANISKY',
      start_date: '2026-10-21',
      end_date: '2026-11-03',
      content_count: 12,
      created_at: '2026-10-20T22:11:00Z'
    },
    {
      id: 'p-campaign-1',
      brief: '11.11 Promo: Lash clusters for beginners',
      start_date: '2026-11-01',
      end_date: '2026-11-14',
      content_count: 36,
      created_at: '2026-10-20T20:00:00Z'
    }
  ];

  const runs = [
    // 12 planned runs for Manisky
    ...Array.from({ length: 12 }, (_, i) => ({
      id: `run-m-${i}`,
      plan_id: 'p-manisky',
      title: `Manisky Episode ${i + 1}`,
      story_episode: i + 1,
      scheduled_at: `2026-10-${21 + i}T12:15:00+07:00`,
      status: 'planned',
      targets: [{ account_id: 'acc-manisky' }],
      created_at: '2026-10-20T22:11:00Z',
      expires_at: '2026-10-27T22:11:00Z'
    })),
    // 36 runs for Campaign: 24 review, 8 approved, 2 failed, 2 running
    ...Array.from({ length: 36 }, (_, i) => ({
      id: `run-c-${i}`,
      plan_id: 'p-campaign-1',
      title: `Promo Post ${i + 1}`,
      scheduled_at: `2026-11-01T12:15:00+07:00`,
      status: i < 24 ? 'review' : i < 32 ? 'approved' : i < 34 ? 'failed' : 'running',
      targets: [{ account_id: 'acc-mj' }, { account_id: 'acc-hb' }],
      created_at: '2026-10-20T20:00:00Z',
      expires_at: '2026-10-27T20:00:00Z'
    })),
    // Standalone run without plan
    {
      id: 'run-solo',
      title: 'Solo Announcement',
      scheduled_at: '2026-11-05T19:15:00+07:00',
      status: 'review',
      targets: [{ account_id: 'acc-hn' }],
      created_at: '2026-10-21T08:00:00Z'
    }
  ];

  const sessions = groupSessions(plans, runs);
  assert.equal(sessions.length, 3);

  const maniskySess = sessions.find(s => s.id === 'p-manisky');
  assert.ok(maniskySess);
  assert.equal(maniskySess.title, 'Manisky: Chapter 01, A Little Beauty, A Little Manisky');
  assert.equal(maniskySess.state, 'plan');
  assert.equal(maniskySess.mode, 'story');
  assert.equal(maniskySess.runs.length, 12);
  assert.equal(maniskySess.counts.planned, 12);

  const promoSess = sessions.find(s => s.id === 'p-campaign-1');
  assert.ok(promoSess);
  assert.equal(promoSess.state, 'review');
  assert.equal(promoSess.mode, 'campaign');
  assert.equal(promoSess.counts.review, 24);
  assert.equal(promoSess.counts.approved, 8);
  assert.equal(promoSess.counts.failed, 2);
  assert.equal(promoSess.counts.running, 2);

  const soloSess = sessions.find(s => s.id === 'run-solo');
  assert.ok(soloSess);
  assert.equal(soloSess.title, 'Solo Announcement');
  assert.equal(soloSess.state, 'review');
});

test('groupSessions identifies expired sessions and links accounts from username', () => {
  const plans = [
    {
      id: 'p-expired',
      brief: '# MANISKY — CHAPTER 02: GLOSS OBSESSION\nDirection for @manisky.id',
      start_date: '2026-10-10',
      end_date: '2026-10-20',
      content_count: 12,
      created_at: '2026-10-09T10:00:00Z'
    }
  ];
  const accounts = [{ id: 'acc-manisky', username: 'manisky.id' }];
  const sessions = groupSessions(plans, [], accounts);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].state, 'expired');
  assert.deepEqual(sessions[0].account_ids, ['acc-manisky']);
});

test('server endpoints support Phase 1 plan and draft actions', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lrmsmm-phase1-'));
  Object.assign(process.env, { META_MOCK: '1', DATA_DIR: tmp, DISABLE_WORKER: '1' });
  const { app } = await import('../src/server.js');
  const { createUser } = await import('../src/auth.js');
  const { run } = await import('../src/db.js');
  const { encrypt } = await import('../src/util.js');
  const { setAssignments } = await import('../src/services/scope.js');
  const gen = await import('../src/services/generator.js');

  const u = createUser({ email: 'phase1-test@fixture.id', password: 'fixture-password', name: 'Phase 1 Tester', role: 'rep' });
  run("INSERT INTO accounts(id,platform,platform_user_id,username,token_enc) VALUES('acc-p1','instagram','fixture-p1','p1brand',?)", encrypt('fixture-meta'));
  setAssignments(u.id, ['acc-p1']);
  for (const provider of ['openai', 'anthropic', 'gemini']) gen.saveKey(u, provider, 'fixture-key');

  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port;

  const loginRes = await fetch(base + '/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: u.email, password: 'fixture-password' })
  });
  const cookie = loginRes.headers.get('set-cookie').split(';')[0];
  const authHeaders = { 'cookie': cookie, 'content-type': 'application/json' };

  try {
    // 1. Create a manual plan
    const planRes = await fetch(base + '/v1/generator/plans', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        brief: 'Manual Autumn Routine',
        request_id: 'p1-req-001',
        account_ids: ['acc-p1'],
        start_date: '2026-11-01',
        end_date: '2026-11-05',
        content_count: 2,
        manual: true,
        slide_count: 1
      })
    });
    assert.equal(planRes.status, 201);
    const plan = await planRes.json();
    assert.equal(plan.content_count, 2);

    // 2. Fetch plans & runs
    const getPlans = await (await fetch(base + '/v1/generator/plans', { headers: authHeaders })).json();
    const getRuns = await (await fetch(base + '/v1/generator/runs', { headers: authHeaders })).json();
    assert.ok(getPlans.data.some(p => p.id === plan.id));
    const plannedRuns = getRuns.data.filter(r => r.plan_id === plan.id);
    assert.equal(plannedRuns.length, 2);
    assert.equal(plannedRuns[0].status, 'planned');

    // 3. Test autosave PATCH on scheduled_at and content
    const patchRes = await fetch(base + '/v1/generator/runs/' + plannedRuns[0].id, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        scheduled_at: '2026-11-02T19:15:00+07:00',
        content: 'Updated caption by user'
      })
    });
    assert.equal(patchRes.status, 200);
    const patched = await patchRes.json();
    assert.equal(patched.caption, 'Updated caption by user');
    assert.equal(patched.scheduled_at, '2026-11-02T19:15:00+07:00');

    // 4. Test startPlanned requires confirm_cost: true
    const unconfirmedStart = await fetch(base + '/v1/generator/runs/' + plannedRuns[0].id + '/start', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({})
    });
    assert.equal(unconfirmedStart.status, 400);

    // 5. Test startPlanned with confirm_cost: true
    const confirmedStart = await fetch(base + '/v1/generator/runs/' + plannedRuns[0].id + '/start', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ confirm_cost: true })
    });
    assert.equal(confirmedStart.status, 200);
    const queuedRun = await confirmedStart.json();
    assert.equal(queuedRun.status, 'queued');

    // 6. Test retry endpoint
    run("UPDATE generator_runs SET status='failed', error='Provider timeout' WHERE id=?", plannedRuns[0].id);
    const retryRes = await fetch(base + '/v1/generator/runs/' + plannedRuns[0].id + '/retry', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({})
    });
    assert.equal(retryRes.status, 200);
    const retriedRun = await retryRes.json();
    assert.equal(retriedRun.status, 'queued');
    assert.equal(retriedRun.error, null);

    // 7. Test approveContent moves to approved status
    const sharp = (await import('sharp')).default;
    const imgBuf = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#4c8' } }).png().toBuffer();
    const upRes = await fetch(base + '/v1/media/upload', {
      method: 'POST',
      headers: { cookie: cookie, 'content-type': 'image/png' },
      body: imgBuf
    });
    const mediaObj = await upRes.json();
    run("UPDATE generator_runs SET status='review', caption='Final proposal caption', media_ids=? WHERE id=?", JSON.stringify([mediaObj.id]), plannedRuns[0].id);

    const futureSlot = new Date(Date.now() + 86400000).toISOString();
    const approveRes = await fetch(base + '/v1/generator/runs/' + plannedRuns[0].id + '/approve', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        content: 'Final proposal caption',
        scheduled_at: futureSlot
      })
    });
    assert.equal(approveRes.status, 200);
    const approvedRun = await (await fetch(base + '/v1/generator/runs/' + plannedRuns[0].id, { headers: authHeaders })).json();
    assert.equal(approvedRun.status, 'approved');

    // 8. Test bulk delete
    const deleteRes = await fetch(base + '/v1/generator/drafts/delete', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ ids: [plannedRuns[1].id] })
    });
    assert.equal(deleteRes.status, 200);
    const delResult = await deleteRes.json();
    assert.equal(delResult.deleted, 1);
  } finally {
    server.close();
  }
});
