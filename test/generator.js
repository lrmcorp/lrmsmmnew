import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lrmsmm-generator-'));
Object.assign(process.env, { META_MOCK: '1', DATA_DIR: tmp, DISABLE_WORKER: '1' });
const { app } = await import('../src/server.js');
const { createUser, createApiKey } = await import('../src/auth.js');
const { run, one, all } = await import('../src/db.js');
const { encrypt } = await import('../src/util.js');
const { setAssignments } = await import('../src/services/scope.js');
const gen = await import('../src/services/generator.js');
const { deleteMedia, gcMedia } = await import('../src/services/media.js');
const { generateText } = await import('../src/llm/providers.js');
const sharp = (await import('sharp')).default;
const image = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#4c8' } }).png().toBuffer();
const realFetch = globalThis.fetch;
let providerCalls = [], failImage = false, malformed = false, gate = null, blocked = null, failAfterSlide = 0, imageCalls = 0;
let catalogReads=0;
const secret = 'fixture-secret-DO-NOT-EXPOSE';
const parseJSON2 = value => { try { return JSON.parse(value); } catch { return []; } };
// Intercept only official provider origins; application HTTP still exercises Express/auth/SQLite.
globalThis.fetch = async (url, opts) => {
  const origin = new URL(url).origin;
  if (!['https://api.openai.com', 'https://api.anthropic.com', 'https://generativelanguage.googleapis.com'].includes(origin)) return realFetch(url, opts);
  if(opts?.method==='GET'&&String(url).includes('/models?')){catalogReads++;return Response.json({models:[{name:'models/gemini-fixture-flash',displayName:'Gemini Fixture Flash',supportedGenerationMethods:['generateContent']},{name:'models/gemini-fixture-image',displayName:'Gemini Fixture Image',supportedGenerationMethods:['generateContent']},{name:'models/gemini-fixture-live',supportedGenerationMethods:['bidiGenerateContent']},{name:'models/gemini-fixture-tts',supportedGenerationMethods:['generateContent']}]});}
  const body = opts.body instanceof FormData ? Object.fromEntries(opts.body.entries()) : JSON.parse(opts.body);
  providerCalls.push({ origin, url, headers: opts.headers, body, form:opts.body instanceof FormData ? opts.body : null });
  const imageRequest = (String(url).includes('/images/generations') || String(url).includes('/images/edits')) || body.generationConfig?.responseModalities;
  if (imageRequest) {
    imageCalls++;
    if (gate) { blocked?.(); await gate; }
    if (failImage || (failAfterSlide && imageCalls === failAfterSlide)) return failImage==='rejected' ? new Response(JSON.stringify({ error: { code: 'moderation_blocked', type: 'image_generation_user_error', message: secret } }), { status: 400 }) : new Response(JSON.stringify({ error: { message: secret } }), { status: 429 });
    return Response.json(origin.includes('openai') ? { data: [{ b64_json: image.toString('base64') }] } : { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: image.toString('base64') } }] } }] });
  }
  const system = body.system || body.messages?.[0]?.content || body.systemInstruction?.parts?.[0]?.text || '';
  let text = 'Visual review: inspect the CTA before publishing. No auto approval.';
  if (system.includes('distinct content ideas')) {
    const n=Number(system.match(/Exactly (\d+) distinct/)[1]);
    text=JSON.stringify({contents:Array.from({length:n},(_,i)=>({title:'Topic '+(i+1),brief:'Unique wellness angle '+(i+1)}))});
  } else if (system.includes('Return ONLY JSON')) {
    const n = Number(system.match(/Exactly (\d+) slides/)[1]);
    text = malformed==='null'?'null':malformed==='null-slide'?JSON.stringify({caption:'Valid caption',slides:[null]}):(malformed&&malformed!=='no-art-direction') ? '{malformed' : JSON.stringify({ title: 'Campaign', caption: 'Final caption', ...(system.includes('Final visual concept only')&&malformed!=='no-art-direction'?{art_direction:{palette:'Warm peach to lilac gradient with deep plum headline text',background:'Soft studio wall with a gentle arch and window light',typography:'High-contrast editorial serif headline over a small sans supporting line',composition:'One hero subject at lower right, upper half deliberately empty',lighting:'Low directional sun with long soft shadows and a glossy finish',avoid:'Flat-lay props, catalog grids and crowded surfaces'},}:{}), slides: Array.from({ length: n }, (_, i) => ({ prompt: 'Green brand image slide ' + (i + 1),...(system.includes('Final visual concept only')?{logo_placement:'top-center',logo_tint:'#7b4a86',logo_soft:true,design_reason:'The approved brand palette and subject sit around a central header.'}:{}) })) });
  }
  return Response.json(origin.includes('openai') ? { choices: [{ message: { content: text } }], usage: { total_tokens: 42 } } : origin.includes('anthropic') ? { content: [{ type: 'text', text }], usage: { input_tokens: 20, output_tokens: 22 } } : { candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { totalTokenCount: 42 } });
};
const user = createUser({ email: 'generator@test.id', password: 'fixture-password', name: 'Generator Rep', role: 'rep' });
const other = createUser({ email: 'other-generator@test.id', password: 'fixture-password', name: 'Other Rep', role: 'rep' });
run("INSERT INTO accounts(id,platform,platform_user_id,username,token_enc) VALUES('ig-generator','instagram','ig-fixture','fixturebrand',?)", encrypt('fake-meta-token'));
run("INSERT INTO accounts(id,platform,platform_user_id,username,token_enc) VALUES('ig-second','instagram','ig-second-fixture','secondbrand',?)", encrypt('fake-meta-token'));
setAssignments(user.id, ['ig-generator','ig-second']); setAssignments(other.id, ['ig-generator']);
const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
const base = 'http://127.0.0.1:' + server.address().port;
async function login(u) {
  const res = await realFetch(base + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: u.email, password: 'fixture-password' }) });
  return res.headers.get('set-cookie').split(';')[0];
}
const cookie = await login(user), otherCookie = await login(other);
async function http(method, route, body, cred = cookie, machine = false) {
  const response = await realFetch(base + '/v1/generator' + route, { method, headers: { [machine ? 'Authorization' : 'Cookie']: machine ? 'Bearer ' + cred : cred, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, json: response.status === 204 ? null : await response.json() };
}
let seq = 0;
const make = (overrides = {}) => gen.createRun(user, { request_id: 'run-' + ++seq, brief: 'Make a wellness carousel in Indonesian', account_ids: ['ig-generator'], slide_count: 2, confirm_cost: true, ...overrides });
async function execute(r) { gen.runGeneratorTick(); await gen.waitGenerator();let current=gen.getRun(user,r.id);if(current.status==='concept_review'){gen.approveConcept(user,r.id,{confirm_cost:true});gen.runGeneratorTick();await gen.waitGenerator();} return gen.getRun(user, r.id); }

test('personal credentials, provider contracts, durable pipeline and final handoff', async t => {
  try {
    await t.test('keys encrypted, no returned secrets, settings and runs are private/session-only', async () => {
      for (const provider of ['openai', 'anthropic', 'gemini']) assert.equal((await http('PUT', '/keys/' + provider, { key: secret })).status, 204);
      const row = one('SELECT secret_enc FROM generator_keys WHERE user_id=? LIMIT 1', user.id);
      assert.ok(!row.secret_enc.includes(secret));
      assert.ok(!JSON.stringify((await http('GET', '/settings')).json).includes(secret));
      assert.equal((await http('GET', '/settings', undefined, otherCookie)).json.keys.length, 0);
      const key = createApiKey(user.id, 'machine', 'write').key;
      assert.equal((await http('GET', '/settings', undefined, key, true)).status, 403);
      assert.equal((await http('POST', '/runs', { confirm_cost: true }, key, true)).status, 403);
      assert.throws(() => make({ confirm_cost: false }), /Confirm/);
      assert.throws(() => make({ account_ids: ['unassigned'] }), /not found/);
      assert.throws(() => make({ agents: { ...gen.DEFAULT_AGENTS, image: { ...gen.DEFAULT_AGENTS.image, provider: 'anthropic' } } }), /Agent provider does not support this stage/);
    });
    await t.test('planned concepts require only concept and revision keys before image approval',async()=>{
      gen.saveKey(other,'openai',secret);
      assert.ok(Object.values(gen.settings(other).agents).every(agent=>agent.provider==='openai'),'one OpenAI key covers compatible roles');
      const agents=structuredClone(gen.settings(other).agents);
      agents.concept={...agents.concept,provider:'openai',model:'gpt-4.1-mini'};
      agents.revision={...agents.revision,provider:'openai',model:'gpt-4.1-mini'};
      const date=new Date(Date.now()+2*864e5+7*3600000).toISOString().slice(0,10);
      const plan=await gen.createPlan(other,{request_id:'concept-keys-only',brief:'A concept without paying for images',account_ids:['ig-generator'],content_count:1,start_date:date,end_date:date,times:['09:15'],manual:true,agents});
      const planned=gen.listRuns(other).find(r=>r.plan_id===plan.id),before=providerCalls.length;
      assert.equal(gen.startPlanned(other,planned.id).status,'queued');
      assert.equal(providerCalls.length,before,'queue does not spend or invoke later providers');
      gen.cancelRun(other,planned.id);gen.deleteKey(other,'openai');
      run('DELETE FROM generator_runs WHERE plan_id=?',plan.id);run('DELETE FROM generator_plans WHERE id=?',plan.id);
    });
    await t.test('Codex text models use the Responses API with the OpenAI key',async()=>{
      const previous=global.fetch;
      let request;
      try{
        global.fetch=async(url,options)=>{
          request={url,options};
          return Response.json({output:[{content:[{type:'output_text',text:'{"ok":true}'}]}]});
        };
        const result=await generateText({provider:'openai',model:'gpt-5.1-codex-mini',key:secret,system:'Return JSON',prompt:'Plan content',jsonSchema:{type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false}});
        assert.equal(request.url,'https://api.openai.com/v1/responses');
        assert.equal(request.options.headers.Authorization,'Bearer '+secret);
        assert.equal(JSON.parse(request.options.body).text.format.type,'json_schema');
        assert.equal(result.text,'{"ok":true}');
      }finally{global.fetch=previous;}
    });
    await t.test('Gemini catalog uses private key metadata, isolates users, and excludes unsupported models',async()=>{
      const before=providerCalls.length,reads=catalogReads;
      const catalog=await http('GET','/providers/gemini/models');assert.equal(catalog.status,200);assert.deepEqual(catalog.json.textModels.map(m=>m.id),['gemini-fixture-flash']);assert.deepEqual(catalog.json.imageModels.map(m=>m.id),['gemini-fixture-image']);assert.equal(catalog.json.live,true);assert.ok(!JSON.stringify(catalog.json).includes(secret));
      await http('GET','/providers/gemini/models');assert.equal(catalogReads,reads+1,'metadata cached without storing raw keys');
      await http('GET','/providers/gemini/models?refresh=true');assert.equal(catalogReads,reads+2);
      const machine=createApiKey(user.id,'catalog machine','write').key;assert.equal((await http('GET','/providers/gemini/models',undefined,machine,true)).status,403);assert.equal((await http('GET','/providers/gemini/models',undefined,otherCookie)).status,400);
      gen.saveKey(other,'gemini','fixture-other-gemini-key');assert.equal((await http('GET','/providers/gemini/models',undefined,otherCookie)).status,200);assert.equal(catalogReads,reads+3,'other user key has a separate cache');gen.deleteKey(other,'gemini');assert.equal(providerCalls.length,before,'catalog does not perform paid generation calls');
    });
    await t.test('human concept gate prevents image spend and selective revision preserves other slides',async()=>{
      const r=make();const before=providerCalls.length;
      gen.runGeneratorTick();await gen.waitGenerator();
      const concept=gen.getRun(user,r.id);assert.equal(concept.status,'concept_review');assert.equal(concept.media.length,0);
      const calls=providerCalls.slice(before);assert.equal(calls.length,2);
      // Concept and revision run on Gemini, so the contract travels as a
      // response schema rather than an OpenAI json_schema or an Anthropic tool.
      for(const call of calls)assert.ok(call.body.generationConfig?.responseJsonSchema?.properties?.slides,'each stage sends its structured-output contract');
      assert.throws(()=>gen.approveConcept(user,r.id,{confirm_cost:false}),/Confirm/);
      assert.throws(()=>gen.approveConcept(other,r.id,{confirm_cost:true}),/not found/);
      const edited={...concept.steps.revision.output,caption:'Human approved concept caption'};
      gen.approveConcept(user,r.id,{confirm_cost:true,concept:edited});const ready=await execute(r);
      assert.equal(ready.status,'review');assert.equal(ready.caption,edited.caption);
      const original=[...ready.media_ids], callsBefore=providerCalls.length;
      gen.regenerateSlide(user,r.id,{request_id:'single-slide-white',slide_index:1,instruction:'Keep product; white background',confirm_cost:true});
      assert.throws(()=>gen.regenerateSlide(user,r.id,{request_id:'different-request',slide_index:1,instruction:'duplicate',confirm_cost:true}),/Slide revisions are only available/);
      const revised=await execute(r);assert.equal(revised.status,'review');assert.equal(revised.media_ids[0],original[0]);assert.notEqual(revised.media_ids[1],original[1]);
      assert.equal(revised.media_versions[0].media_id,original[1]);assert.equal(providerCalls.length-callsBefore,2);assert.equal(gen.regenerateSlide(user,r.id,{request_id:'single-slide-white',slide_index:1,instruction:'Keep product; white background',confirm_cost:true}).status,'review');assert.equal(providerCalls.length-callsBefore,2);
      assert.ok(providerCalls.slice(callsBefore).some(c=>String(c.body.prompt).includes('white background')));
      assert.throws(()=>deleteMedia(original[1]),/Media is used by a scheduled post or active draft/);
      const imagesBefore=providerCalls.length;gen.updateContent(user,r.id,{content:'Caption only edit'});assert.equal(providerCalls.length,imagesBefore);
      gen.deleteContent(user,r.id);assert.throws(()=>gen.getRun(user,r.id),/not found/);
      for(const mid of [...original,...revised.media_ids])assert.equal(one('SELECT id FROM media WHERE id=?',mid),undefined);
    });
    await t.test('seven-day unchanged drafts expire safely; changed drafts and scheduled content survive',async()=>{
      const {saveBuffer}=await import('../src/services/media.js');
      const privateAsset=await saveBuffer(user.id,image,{inLibrary:false});
      const sharedAsset=await saveBuffer(user.id,image,{inLibrary:false});
      const libraryAsset=await saveBuffer(user.id,image,{inLibrary:true});
      const expired=make({reference_media_ids:[privateAsset.id,sharedAsset.id,libraryAsset.id]});
      const survivor=make({reference_media_ids:[sharedAsset.id]});gen.cancelRun(user,survivor.id);
      gen.cancelRun(user,expired.id);
      // Shared reference remains protected by another waiting concept.
      run("UPDATE generator_runs SET status='concept_review' WHERE id=?",survivor.id);
      const old=new Date(Date.now()-8*864e5).toISOString();
      run('UPDATE generator_runs SET draft_touched_at=?,updated_at=? WHERE id=?',old,old,expired.id);
      assert.equal((await http('DELETE','/runs/'+expired.id+'/content',undefined,otherCookie)).status,404);
      gen.expireDrafts();assert.equal(one('SELECT status FROM generator_runs WHERE id=?',expired.id).status,'deleted');
      assert.equal(one('SELECT id FROM media WHERE id=?',privateAsset.id),undefined);assert.ok(one('SELECT id FROM media WHERE id=?',sharedAsset.id));assert.ok(one('SELECT id FROM media WHERE id=?',libraryAsset.id));
      assert.ok(!gen.listRuns(user).some(r=>r.id===expired.id));
      const active=make();run('UPDATE generator_runs SET draft_touched_at=? WHERE id=?',old,active.id);gen.expireDrafts();assert.equal(one('SELECT status FROM generator_runs WHERE id=?',active.id).status,'queued');gen.cancelRun(user,active.id);gen.deleteContent(user,active.id);
      const edit=make();run("UPDATE generator_runs SET status='planned',draft_touched_at=? WHERE id=?",old,edit.id);
      gen.updateContent(user,edit.id,{content:''});assert.equal(one('SELECT draft_touched_at FROM generator_runs WHERE id=?',edit.id).draft_touched_at,old,'saving unchanged content does not reset expiry');
      gen.updateContent(user,edit.id,{content:'Changed content'});assert.notEqual(one('SELECT draft_touched_at FROM generator_runs WHERE id=?',edit.id).draft_touched_at,old);gen.expireDrafts();assert.notEqual(gen.getRun(user,edit.id).status,'deleted');
      const manual=make();run("UPDATE generator_runs SET status='planned' WHERE id=?",manual.id);gen.updateContent(user,manual.id,{media_ids:[sharedAsset.id]});
      const scheduled=gen.approveContent(user,manual.id,{scheduled_at:new Date(Date.now()+864e5).toISOString()});
      run('UPDATE generator_runs SET draft_touched_at=? WHERE id=?',old,manual.id);gen.expireDrafts();assert.equal(gen.getRun(user,manual.id).status,'approved');assert.ok(one('SELECT id FROM posts WHERE id=?',scheduled.id));assert.throws(()=>gen.deleteContent(user,manual.id),/approved/);
      gen.deleteContent(user,survivor.id);gen.deleteContent(user,edit.id);
      assert.ok(one('SELECT id FROM media WHERE id=?',sharedAsset.id),'scheduled post still holds its asset');
    });
    await t.test('same-day plans accept upcoming WIB slots, skip past times and keep approval required', async () => {
      const originalNow = Date.now;
      const fixed = Date.parse('2027-01-12T10:00:00+07:00');
      Date.now = () => fixed;
      try {
        const before = one('SELECT COUNT(*) n FROM posts').n;
        const plan = await gen.createPlan(user, {request_id:'today-plan', brief:'Start content today', account_ids:['ig-generator'], content_count:1, slide_count:1, start_date:'2027-01-12', end_date:'2027-01-12', times:['09:00','10:06'], confirm_cost:true});
        assert.deepEqual(plan.slots, ['2027-01-12T03:06:00.000Z']);
        assert.equal(one('SELECT COUNT(*) n FROM posts').n, before);
        assert.equal(gen.listRuns(user).find(r => r.plan_id === plan.id).status, 'planned');
        // Chosen times that have already passed are still skipped, but the
        // session is no longer refused for it: a later time is added that day.
        const late=await gen.createPlan(user, {request_id:'today-past', brief:'Past slots', account_ids:['ig-generator'], content_count:1, slide_count:1, start_date:'2027-01-12', end_date:'2027-01-12', times:['09:00','10:05'], confirm_cost:true});
        assert.equal(late.slots.length,1);
        assert.ok(Date.parse(late.slots[0])>fixed,'the post lands in the future, never on the past time the user picked');
        assert.ok(late.posting_times.length>2,'the times the user chose were kept and more were added around them');
        for(const t of ['09:00','10:05'])assert.ok(late.posting_times.includes(t),'a chosen time is never dropped');
        await assert.rejects(() => gen.createPlan(user, {request_id:'today-impossible', brief:'No room at all', account_ids:['ig-generator'], content_count:30, slide_count:1, start_date:'2027-01-12', end_date:'2027-01-12', times:['09:00'], confirm_cost:true}), /posting slots are available/);
      } finally { Date.now = originalNow; }
    });
    await t.test('12-content date range planning, manual upload/edit and approval enter calendar only after approval', async () => {
      const date = days => new Date(Date.now()+days*864e5+7*3600000).toISOString().slice(0,10);
      const body={request_id:'plan-12',brief:'Twelve wellness posts for the campaign',account_ids:['ig-generator'],content_count:12,slide_count:1,start_date:date(10),end_date:date(15),confirm_cost:true};
      const countBefore=one('SELECT COUNT(*) n FROM posts').n;
      const plan=await gen.createPlan(user,body);
      assert.equal(plan.slots.length,12);assert.equal(new Set(plan.slots).size,12);
      assert.equal(plan.recommendation.basis,'heuristic');
      const rows=gen.listRuns(user).filter(r=>r.plan_id===plan.id);
      assert.equal(rows.length,12);assert.ok(rows.every(r=>r.status==='planned'));
      assert.equal(one('SELECT COUNT(*) n FROM posts').n,countBefore);
      assert.equal((await gen.createPlan(user,body)).id,plan.id);
      await assert.rejects(()=>gen.createPlan(user,{...body,brief:'Changed'}),/request_id/);
      await assert.rejects(()=>gen.createPlan(user,{...body,request_id:'too-many',content_count:30,start_date:date(1),end_date:date(1)}),/posting slots are available/);
      await assert.rejects(()=>gen.createPlan(user,{...body,request_id:'outside',account_ids:['outside']}),/not found/);
      await assert.rejects(()=>gen.createPlan(user,{...body,request_id:'invalid-date',start_date:'2026-02-30'}),/Invalid date range/);
      assert.equal(gen.listPlans(other).length,0);
      assert.throws(()=>gen.startPlan(other,plan.id),/not found/);
      const target=rows[0];
      const {saveBuffer}=await import('../src/services/media.js');
      const img=await saveBuffer(user.id,image,{inLibrary:false});
      assert.throws(()=>gen.approveContent(user,target.id,{}),/Complete and review the content first/);
      const edited=gen.updateContent(user,target.id,{content:'Human caption with own photo',media_ids:[img.id],brief:'Edited prompt before approval'});
      assert.equal(edited.status,'review');assert.equal(edited.steps.image.source,'manual');
      assert.equal((await http('POST','/runs/'+target.id+'/approve',{},otherCookie)).status,404);
      assert.throws(()=>gen.approveContent(user,target.id,{scheduled_at:new Date(Date.now()-1000).toISOString()}),/at least one minute/);
      const approved=gen.approveContent(user,target.id,{});
      assert.equal(approved.status,'scheduled');assert.equal(gen.getRun(user,target.id).status,'approved');
      assert.equal(gen.approveContent(user,target.id,{}).id,approved.id);
      assert.equal(one('SELECT COUNT(*) n FROM posts').n,countBefore+1);
      const calendar=await realFetch(base+'/v1/calendar?from='+date(10)+'T00:00:00%2B07:00&to='+date(16)+'T00:00:00%2B07:00',{headers:{Cookie:cookie}}).then(r=>r.json());
      assert.ok(calendar.data.some(p=>p.id===approved.id));
      assert.throws(()=>gen.updateContent(user,target.id,{content:'Too late'}),/approved/);
      assert.throws(()=>gen.reviseContent(user,target.id,{brief:'Too late'}),/can no longer be revised/);
      // Batch start is explicit. No paid jobs are launched just by creating a plan.
      const started=gen.startPlan(user,plan.id);assert.equal(started.queued,11);
      for(const r of rows.filter(r=>r.id!==target.id))gen.cancelRun(user,r.id);
      assert.equal(gen.startPlan(user,plan.id).queued,0);
      const manual=await gen.createPlan(other,{...body,request_id:'manual-no-key',content_count:1,manual:true,confirm_cost:false});
      const manualRow=gen.listRuns(other).find(r=>r.plan_id===manual.id);
      assert.equal(manualRow.status,'planned');
      assert.notEqual(manualRow.scheduled_at,approved.scheduled_at,'new plan avoids an occupied schedule');
      assert.throws(()=>gen.updateContent(other,manualRow.id,{media_ids:[img.id]}),/catalog of an assigned account/);
      gen.cancelRun(other,manualRow.id);
    });
    await t.test('prompt revisions create a new version with the same proposed slot and retain previous history', async()=>{
      const original=await execute(make({slide_count:1,scheduled_at:new Date(Date.now()+864e5).toISOString()}));
      const revision=gen.reviseContent(user,original.id,{request_id:'revision-new',brief:'Revised visual style with softer colors',confirm_cost:true});
      assert.equal(revision.parent_id,original.id);assert.equal(revision.scheduled_at,original.scheduled_at);
      assert.equal(gen.getRun(user,original.id).status,'cancelled');
      const done=await execute(revision);assert.equal(done.status,'review');assert.notEqual(done.media_ids[0],original.media_ids[0]);
      gen.cancelRun(user,revision.id);
    });
    await t.test('concept → Claude revision → OpenAI images → Claude visual review, no publishing', async () => {
      const r = make(); const postCount = one('SELECT COUNT(*) n FROM posts').n;
      const done = await execute(r);
      assert.equal(done.status, 'review'); assert.equal(done.media.length, 2);
      assert.ok(done.media.every(m => m.mime_type === 'image/jpeg' && m.url));
      for (const role of ['concept','revision','image','final']) assert.equal(done.steps[role].status, 'done');
      const final = providerCalls.findLast(c => typeof c.body.system === 'string' && c.body.system.includes('Review the actual supplied images'));
      assert.equal(final.origin, 'https://api.anthropic.com', 'final review runs on a vision model');
      assert.equal(final.body.model, 'claude-sonnet-5-5');
      assert.equal(final.body.messages[0].content.filter(p => p.type === 'image').length, 2, 'reviewer sees actual image bytes');
      assert.equal(one('SELECT COUNT(*) n FROM posts').n, postCount);
      assert.equal((await http('GET', '/runs/' + r.id, undefined, otherCookie)).status, 404);
      const row = one('SELECT path FROM media WHERE id=?', done.media_ids[0]);
      run("UPDATE media SET created_at='2000-01-01T00:00:00.000Z' WHERE id=?", done.media_ids[0]); gcMedia(); assert.ok(fs.existsSync(row.path));
      assert.throws(() => deleteMedia(done.media_ids[0]), /Media is used by a scheduled post or active draft/);
      const draft = await gen.handoff(user, r.id, { content: 'Human corrected caption' });
      assert.ok(draft.compose_url.includes('ai_draft='));
      assert.equal(one('SELECT COUNT(*) n FROM posts').n, postCount);
      assert.equal(gen.getRun(user, r.id).status, 'drafted');
      assert.equal((await gen.handoff(user, r.id, {})).draft_id, draft.draft_id);
      assert.equal(one('SELECT content FROM ai_drafts WHERE id=?', draft.draft_id).content, 'Human corrected caption');
    });
    await t.test('Gemini image generation and Claude/OpenAI vision connectors', async () => {
      const agents = structuredClone(gen.DEFAULT_AGENTS);
      agents.image = { ...agents.image, provider: 'gemini', model: 'gemini-2.5-flash-image' };
      agents.final = { ...agents.final, provider: 'anthropic', model: 'claude-sonnet-4-5' };
      const done = await execute(make({ agents, slide_count: 1 })); assert.equal(done.status, 'review');
      assert.ok(providerCalls.some(c => c.origin.includes('googleapis') && c.body.generationConfig?.responseModalities));
      assert.ok(providerCalls.some(c => c.origin.includes('anthropic') && c.body.messages[0].content.some(p => p.type === 'image')));
      await generateText({ provider: 'openai', model: 'gpt-4.1-mini', key: secret, system: 'Review', prompt: 'Review actual image', images: [{ mime: 'image/jpeg', data: 'fixture-image' }] });
      assert.ok(providerCalls.some(c => c.origin.includes('openai') && c.body.messages?.[1].content.some(p => p.type === 'image_url')));
      for (const call of providerCalls) {
        assert.equal(call.headers.Authorization || call.headers['x-api-key'] || call.headers['x-goog-api-key'], call.origin.includes('openai') ? 'Bearer ' + secret : secret);
        assert.ok(!String(call.url).includes(secret));
      }
    });
    await t.test('owned visual references reach image-edit/vision providers and survive draft cleanup', async()=>{
      const {saveBuffer}=await import('../src/services/media.js');
      const ref=await saveBuffer(user.id,image,{inLibrary:false});
      const logo=await saveBuffer(user.id,image,{inLibrary:false}),product=await saveBuffer(user.id,image,{inLibrary:false});
      const roleMap={[logo.id]:'logo',[ref.id]:'visual',[product.id]:'product'};
      const r=make({slide_count:1,reference_media_ids:[logo.id,ref.id,product.id],reference_roles:roleMap,reference_notes:'Match the warm palette and spacious layout'});
      assert.deepEqual(r.reference_media_ids,[logo.id,ref.id,product.id]);assert.deepEqual(r.reference_roles,roleMap);
      assert.throws(()=>deleteMedia(ref.id),/Media is used by a scheduled post or active draft/);
      const result=await execute(r);assert.equal(result.status,'review');
      const edit=providerCalls.findLast(c=>String(c.url).includes('/images/edits'));
      assert.ok(edit.form instanceof FormData);assert.equal(edit.form.getAll('image[]').length,2,'the image provider sees the visual and product references, but not the logo');
      assert.ok((await edit.form.get('image[]').arrayBuffer()).byteLength>0);
      assert.ok(edit.form.get('prompt').includes('warm palette'));
      for(const label of ['Image 1: visual','Image 2: product','brand logo is added by the server','packaging'])assert.ok(edit.form.get('prompt').includes(label));
      assert.ok(edit.form.get('prompt').includes('MANDATORY ASSET PRESERVATION'));
      assert.ok(edit.form.get('prompt').includes('PRODUCT MOCKUP MODE'));assert.ok(edit.form.get('prompt').includes('worn on fingers'));assert.equal(result.steps.image.product_mockup,true);assert.deepEqual(result.steps.image.protected_placements[0].map(x=>x.role),['logo'],'mockup product photos are not pasted over the scene');
      const qc=providerCalls.findLast(c=>typeof c.body.system==='string'&&c.body.system.includes('Review the actual supplied images'));assert.equal(qc.body.messages[0].content.filter(p=>p.type==='image').length,4,'reviewer receives generated slide, original logo/product and visual reference');assert.ok(qc.body.system.includes('blocking issue'));
      assert.deepEqual(gen.updateContent(user,result.id,{content:'Updated caption'}).reference_roles,roleMap);
      assert.throws(()=>make({reference_media_ids:[ref.id],reference_roles:{[ref.id]:'unknown'}}),/reference category/);
      assert.throws(()=>make({reference_media_ids:[ref.id],reference_roles:{[logo.id]:'logo'}}),/reference category/);
      const revised=gen.reviseContent(user,result.id,{request_id:'brand-assets-revise',brief:'Revised brand campaign',confirm_cost:true});assert.deepEqual(revised.reference_roles,roleMap);gen.cancelRun(user,revised.id);
      const before=providerCalls.length;
      const agents=structuredClone(gen.DEFAULT_AGENTS);agents.image={...agents.image,provider:'gemini',model:'gemini-2.5-flash-image'};
      const gem=await execute(make({slide_count:1,agents,reference_media_ids:[ref.id],reference_notes:'Soft light'}));assert.equal(gem.status,'review');
      const call=providerCalls.slice(before).find(c=>c.body.generationConfig?.responseModalities);
      assert.equal(call.body.contents[0].parts.filter(p=>p.inlineData).length,1);
      assert.throws(()=>gen.createRun(other,{request_id:'stolen-ref',brief:'Example',account_ids:['ig-generator'],slide_count:1,confirm_cost:true,reference_media_ids:[ref.id]}),/uploaded yourself/);
      assert.throws(()=>make({reference_media_ids:[ref.id,ref.id]}),/unique references/);
      run("UPDATE media SET created_at='2000-01-01T00:00:00.000Z' WHERE id=?",ref.id);gcMedia();assert.ok(one('SELECT id FROM media WHERE id=?',ref.id));
      gen.cancelRun(user,gem.id);
    });
    await t.test('image failure is safe, keeps completed slides and requires explicit retry', async () => {
      imageCalls = 0; failAfterSlide = 2;
      let r = make(); r = await execute(r);
      assert.equal(r.status, 'failed'); assert.equal(r.steps.failure.stage,'image');assert.equal(r.steps.failure.provider,'openai');assert.equal(r.steps.failure.code,'provider_error');assert.match(r.error,/Image Creator/); assert.equal(r.media.length, 1); assert.ok(!r.error.includes(secret));
      const first = r.media_ids[0], calls = providerCalls.length;
      gen.runGeneratorTick(); await gen.waitGenerator(); assert.equal(providerCalls.length, calls, 'no automatic paid retry');
      failAfterSlide = 0; gen.retryRun(user, r.id); r = await execute(r);
      assert.equal(r.status, 'review'); assert.equal(r.steps.failure,undefined); assert.equal(r.media_ids[0], first); assert.equal(r.media_ids.length, 2);
      gen.cancelRun(user, r.id);
    });
    await t.test('large account archives do not overflow GPT Image prompts or weaken original-asset protection',async()=>{
      const {buildImagePrompt}=await import('../src/services/image-prompt.js');
      const {ASSET_PRESERVATION}=await import('../src/services/brand-asset-policy.js');
      const archive={account:{username:'nails.brand'},identity:{essence:'Real nail products',dont_rules:'Never change packaging'},foundation:'Brand foundation '.repeat(1000),previous_proposals:[{brief:'Private history '.repeat(2000)}],memory_session:{bible:'Story bible '.repeat(2000)}};
      const prompt=buildImagePrompt({instructions:'Image direction '.repeat(250),direction:'Preserve references '.repeat(150),accounts:[archive],layout:'Use original product overlays',title:'Approved concept',brief:'Current product chapter',episode:3,slideIndex:0,slideCount:1,slidePrompt:'Place the unchanged product on a white background.'});
      assert.ok(prompt.length<32000);assert.match(prompt,/nails.brand/);assert.match(prompt,/Never change packaging/);assert.match(prompt,/Place the unchanged product/);assert.ok(prompt.indexOf('Use original product overlays')>prompt.indexOf('Place the unchanged product'),'reserved asset layout takes precedence over the slide direction');assert.ok(prompt.endsWith(ASSET_PRESERVATION));assert.ok(!prompt.includes('Private history'));assert.ok(!prompt.includes('Story bible'));
      {
        // Every input at its validated maximum at once. The duplicated context is
        // budgeted, so a real run cannot fail the 32k guard while the slide prompt,
        // art direction, craft policy and asset rules all arrive whole.
        const {protectedLayout}=await import('../src/services/protected-composition.js');
        const {VISUAL_DESIGN_POLICY}=await import('../src/services/visual-design-policy.js');
        const field='x'.repeat(400);
        const worst=buildImagePrompt({instructions:'i'.repeat(4000),direction:'d'.repeat(6000),
          artDirection:{palette:field,background:field,typography:field,composition:field,lighting:field,avoid:field},
          accounts:[{account:'@a',identity:{a:'y'.repeat(500)},foundation:'f'.repeat(2000)},{account:'@b',identity:{},foundation:'f'.repeat(2000)}],
          layout:protectedLayout([{role:'logo'},{role:'product'}],true,'hero-center'),
          title:'t'.repeat(300),brief:'b'.repeat(10000),episode:'e'.repeat(2000),slideIndex:0,slideCount:3,
          slidePrompt:'s'.repeat(6000),designReason:'r'.repeat(500),revision:'v'.repeat(1000)});
        assert.ok(worst.length<32000,`worst-case prompt is ${worst.length} characters and must stay under the provider limit`);
        assert.ok(worst.includes('s'.repeat(6000)),'the slide prompt is never truncated');
        assert.ok(worst.includes(VISUAL_DESIGN_POLICY)&&worst.includes(ASSET_PRESERVATION),'the craft policy and asset rules arrive whole');
        assert.ok(!worst.includes('b'.repeat(900)),'the brief the Conceptor already read travels as short context');
        assert.ok(worst.includes('d'.repeat(300))&&worst.endsWith(ASSET_PRESERVATION),'a clipped reference direction keeps both ends, since the user notes sit at its tail');
        const kept=buildImagePrompt({instructions:'x',accounts:[],slidePrompt:'s',slideIndex:0,slideCount:1,title:'t',brief:'b',direction:'HEAD'+'z'.repeat(4000)+'USER NOTES AT THE TAIL'});
        assert.ok(kept.includes('HEAD')&&kept.includes('USER NOTES AT THE TAIL'),'the deliberate direction at the end survives the budget');
      }
      assert.throws(()=>buildImagePrompt({instructions:'x'.repeat(32001),slidePrompt:'visual'}),error=>error.code==='image_prompt_too_long');
      const before=providerCalls.length;const {generateImage}=await import('../src/llm/providers.js');await assert.rejects(()=>generateImage({provider:'openai',model:'gpt-image-1',key:secret,prompt:'x'.repeat(32001)}),error=>error.code==='image_prompt_too_long');assert.equal(providerCalls.length,before,'oversized requests never reach the paid provider');
    });
    await t.test('null structured concepts are validation errors with saved stage diagnostics',async()=>{
      for(const output of ['null','null-slide']){
        malformed=output;const result=await execute(make({slide_count:1}));malformed=false;
        assert.equal(result.status,'failed');assert.equal(result.steps.failure.stage,'concept');assert.equal(result.steps.failure.code,'generator_format');assert.equal(result.steps.failure.model,'gemini-2.5-flash');assert.match(result.error,/Conceptor/);assert.equal(result.media.length,0);assert.ok(!JSON.stringify(result.steps.failure).includes(secret));gen.cancelRun(user,result.id);
      }
    });
    await t.test('input_fidelity is sent only to the models that accept it', async () => {
      const {saveBuffer}=await import('../src/services/media.js');
      const styleRef=await saveBuffer(user.id,image,{inLibrary:false});
      const imageAgent=gen.settings(user).agents.image;
      const withRef=()=>make({slide_count:1,reference_media_ids:[styleRef.id],reference_roles:{[styleRef.id]:'visual'}});
      const before=providerCalls.length;
      await execute(withRef());
      const current=providerCalls.slice(before).find(c=>String(c.url).includes('/images/edits'));
      assert.equal(current.body.model,'gpt-image-2.5-sunburst');
      assert.ok(!('input_fidelity' in current.body),'gpt-image-2.5 rejects input_fidelity outright, so it is never sent');

      gen.saveSettings(user,{agents:{...gen.settings(user).agents,image:{...imageAgent,model:'gpt-image-1.5'}}});
      const legacyFrom=providerCalls.length;
      await execute(withRef());
      const legacy=providerCalls.slice(legacyFrom).find(c=>String(c.url).includes('/images/edits'));
      assert.equal(legacy.body.input_fidelity,'high','the gpt-image-1 line still gets the fidelity it needs');
      gen.saveSettings(user,{agents:{...gen.settings(user).agents,image:imageAgent}});
    });
    await t.test('contents in one campaign are assigned different shot types', async () => {
      const d=new Date(Date.now()+5*864e5+7*3600000).toISOString().slice(0,10);
      const plan=await gen.createPlan(user,{request_id:'shot-variety',brief:'Three posts, one brand',account_ids:['ig-generator'],content_count:3,slide_count:1,start_date:d,end_date:d,times:['08:10','12:10','16:10'],manual:true});
      const runs=all("SELECT * FROM generator_runs WHERE plan_id=? ORDER BY created_at,id",plan.id);
      assert.equal(runs.length,3);
      const shots=runs.map(r=>gen.shotTypeFor(r));
      assert.ok(shots.every(Boolean),'every content in a plan is assigned a shot');
      assert.deepEqual(shots.map(s=>s.index),[0,1,2],'position is stable across the campaign');
      assert.equal(new Set(shots.map(s=>s.shot)).size,3,'three contents receive three different framings, not one repeated');
      assert.deepEqual(shots.map(s=>s.total),[3,3,3]);
      assert.equal(gen.shotTypeFor({plan_id:null,targets:'[]'}),null,'a single content outside a campaign is not forced into a rotation');
      for(const r of runs)run("UPDATE generator_runs SET status='cancelled' WHERE id=?",r.id);
    });
    await t.test('a brief at the stated limit is accepted and an oversized one says so', async () => {
      const d=new Date(Date.now()+13*864e5+7*3600000).toISOString().slice(0,10);
      // The workspace used to append its rules to the user's own text, so a
      // brief typed to the field's own maxlength went over the server limit and
      // failed the whole session under a message about request_id.
      const full='x'.repeat(10000);
      const ok=await http('POST','/plans',{request_id:'limit-ok-'+Date.now(),account_ids:['ig-generator'],brief:full,content_count:1,slide_count:1,start_date:d,end_date:d,times:['06:40'],manual:true});
      assert.equal(ok.status,201,JSON.stringify(ok.json));
      run("UPDATE generator_runs SET status='cancelled' WHERE plan_id=?",ok.json.id);
      const over=await http('POST','/plans',{request_id:'limit-over-'+Date.now(),account_ids:['ig-generator'],brief:full+'y',content_count:1,slide_count:1,start_date:d,end_date:d,times:['06:40'],manual:true});
      assert.equal(over.status,400);
      assert.match(JSON.stringify(over.json),/10001 characters; the limit is 10,000/,'the message names the real fault, not request_id');
      const noId=await http('POST','/plans',{account_ids:['ig-generator'],brief:'b',content_count:1,slide_count:1,start_date:d,end_date:d,times:['06:40'],manual:true});
      assert.match(JSON.stringify(noId.json),/Invalid request_id/,'and a missing request_id still says that');
    });
    await t.test('the count and the date range win; posting times are spread to fit', async () => {
      const {fillPostingTimes,perDayFor}=await import('../public/schedule-times.js');
      assert.equal(perDayFor(12,3),4,'twelve posts in three days is four a day');
      assert.equal(perDayFor(12,6),2);
      assert.deepEqual(fillPostingTimes(['11:19','15:00'],4),['08:40','11:19','15:00','18:00'],'the chosen times are kept and the widest gaps are filled');
      assert.deepEqual(fillPostingTimes(['11:19','15:00'],2),['11:19','15:00'],'nothing is added when the chosen times already suffice');
      assert.deepEqual(fillPostingTimes([],3),[],'no chosen time, nothing invented');
      const spread=fillPostingTimes(['09:00'],8);
      assert.equal(new Set(spread).size,spread.length,'generated times never collide');
      for(let i=1;i<spread.length;i++){
        const gap=(Number(spread[i].slice(0,2))*60+Number(spread[i].slice(3)))-(Number(spread[i-1].slice(0,2))*60+Number(spread[i-1].slice(3)));
        assert.ok(gap>=30,'generated times stay at least half an hour apart');
      }
      const originalNow=Date.now, fixed=Date.parse('2027-02-10T16:00:00+07:00');
      Date.now=()=>fixed;
      try{
        // The reported case: twelve posts over six days with two chosen times,
        // started after both of today's times had passed.
        const plan=await gen.createPlan(user,{request_id:'dense-'+fixed,brief:'Twelve posts, six days',account_ids:['ig-generator'],content_count:12,slide_count:1,start_date:'2027-02-10',end_date:'2027-02-15',times:['11:19','15:00'],manual:true});
        assert.equal(plan.slots.length,12,'all twelve are scheduled inside the range the user chose');
        assert.equal(new Set(plan.slots).size,12,'no two posts share a slot');
        for(const at of plan.slots){
          assert.ok(Date.parse(at)>fixed,'nothing is scheduled in the past');
          assert.ok(at.slice(0,10)>='2027-02-09'&&at.slice(0,10)<='2027-02-15','and nothing outside the range');
        }
        run("UPDATE generator_runs SET status='cancelled' WHERE plan_id=?",plan.id);
        // Twelve posts in three days: four a day, without the user adding times.
        const dense=await gen.createPlan(user,{request_id:'dense3-'+fixed,brief:'Twelve posts, three days',account_ids:['ig-generator'],content_count:12,slide_count:1,start_date:'2027-03-01',end_date:'2027-03-03',times:['11:19','15:00'],manual:true});
        assert.equal(dense.slots.length,12);
        assert.equal(dense.posting_times.length,4,'four times a day were derived from the two chosen');
        for(const t of ['11:19','15:00'])assert.ok(dense.posting_times.includes(t),'the chosen times are still there');
        const perDate=dense.slots.reduce((m,at)=>(m[at.slice(0,10)]=(m[at.slice(0,10)]||0)+1,m),{});
        assert.deepEqual(Object.values(perDate).sort(),[4,4,4],'four posts on each of the three days');
        run("UPDATE generator_runs SET status='cancelled' WHERE plan_id=?",dense.id);
      }finally{Date.now=originalNow;}
    });
    await t.test('every stage that writes or keeps a caption is told its shape', async () => {
      const {CAPTION_SHAPE}=await import('../src/services/caption-policy.js');
      assert.match(CAPTION_SHAPE,/separated by one blank line/);
      assert.match(CAPTION_SHAPE,/Use real newline characters/,'the contract is JSON, so the newlines have to be asked for explicitly');
      const {saveBuffer}=await import('../src/services/media.js');
      const ref=await saveBuffer(user.id,image,{inLibrary:false});
      providerCalls=[];
      const result=await execute(make({slide_count:1,produce_media:true,reference_media_ids:[ref.id],reference_roles:{[ref.id]:'visual'}}));
      assert.equal(result.status,'review');
      const systems=providerCalls.map(c=>c.body?.system||c.body?.messages?.[0]?.content||c.body?.systemInstruction?.parts?.[0]?.text||'').filter(Boolean);
      // The caption is written at concept, reviewed at revision, carried by the
      // visual stage and checked by the reviewer. A caption that gains its
      // paragraphs at one stage and loses them at the next is no better.
      assert.ok(systems.filter(x=>x.includes('CAPTION SHAPE')).length>=2,'the stages that write the caption are told the shape');
      assert.ok(systems.some(x=>x.includes('including its blank lines between paragraphs')),'the visual stage is told to carry it unchanged');
      assert.ok(systems.some(x=>x.includes('not one block of prose')),'the final reviewer checks it');
    });
    await t.test('a campaign is not twelve product photographs', async () => {
      const d=new Date(Date.now()+9*864e5+7*3600000).toISOString().slice(0,10);
      const plan=await gen.createPlan(user,{request_id:'format-mix',brief:'Twelve posts, one brand',account_ids:['ig-generator'],content_count:12,slide_count:1,start_date:d,end_date:d,times:['06:05','07:05','08:05','09:05','10:05','11:05','13:05','14:05','15:05','16:05','17:05','18:05'],manual:true});
      const formats=all("SELECT * FROM generator_runs WHERE plan_id=? ORDER BY created_at,id",plan.id).map(r=>gen.shotTypeFor(r));
      assert.equal(formats.length,12);
      const withoutProduct=formats.filter(f=>f.product===false);
      assert.equal(withoutProduct.length,2,'one content in six carries no product at all');
      for(const f of withoutProduct)assert.match(f.shot,/No product, no packaging and no hands/,'the no-product format says so plainly');
      assert.ok(formats.filter(f=>f.product===true).length===10,'the rest still lead with the product');
      assert.equal(new Set(formats.map(f=>f.shot)).size,6,'twelve contents cycle evenly through the six formats');
      run("UPDATE generator_runs SET status='cancelled' WHERE plan_id=?",plan.id);
    });
    await t.test('a no-product content never sees a product reference at any stage', async () => {
      const {saveBuffer}=await import('../src/services/media.js');
      const prod=await saveBuffer(user.id,image,{inLibrary:false}),vis=await saveBuffer(user.id,image,{inLibrary:false});
      const d=new Date(Date.now()+11*864e5+7*3600000).toISOString().slice(0,10);
      const plan=await gen.createPlan(user,{request_id:'quote-card',brief:'Four posts',account_ids:['ig-generator'],content_count:4,slide_count:1,start_date:d,end_date:d,times:['06:20','07:20','08:20','09:20'],manual:true,
        reference_media_ids:[vis.id,prod.id],reference_roles:{[vis.id]:'visual',[prod.id]:'product'}});
      const runs=all("SELECT * FROM generator_runs WHERE plan_id=? ORDER BY created_at,id",plan.id);
      const quote=runs[3];
      assert.equal(gen.shotTypeFor(quote).product,false,'the fourth content is the typographic one');
      assert.ok(parseJSON2(quote.reference_media_ids).includes(prod.id),'the product is still attached to the row');
      providerCalls=[];
      run("UPDATE generator_runs SET status='queued',concept_approved_at=? WHERE id=?",new Date().toISOString(),quote.id);
      const done=await execute({id:quote.id});
      assert.equal(done.status,'review',JSON.stringify(done.error||''));
      const visual=providerCalls.find(c=>(c.body?.system||c.body?.messages?.[0]?.content||'').includes('Final visual concept only'));
      assert.match(visual.body.system||visual.body.messages[0].content,/carries NO PRODUCT/,'the stage is told this content has no product');
      const edit=providerCalls.findLast(c=>c.form);
      assert.equal(edit.form.getAll('image[]').length,1,'only the visual reference reaches the image model, never the product');
      assert.ok(!gen.getRun(user,quote.id).steps.image.product_mockup,'no mockup mode on a content with no product');
      run("UPDATE generator_runs SET status='cancelled' WHERE plan_id=?",plan.id);
    });
    await t.test('each content in a campaign takes the next product in the catalogue', async () => {
      const {rotateProductReference}=gen;
      const refs={ids:['logo-1','vis-1','prod-a'],roles:{'logo-1':'logo','vis-1':'visual','prod-a':'product'}};
      const products=['prod-a','prod-b','prod-c'];
      const picked=[0,1,2,3].map(i=>rotateProductReference(refs,products,i));
      assert.deepEqual(picked.map(p=>p.ids.find(mid=>p.roles[mid]==='product')),['prod-a','prod-b','prod-c','prod-a'],'the catalogue is cycled, not re-picked at random');
      for(const p of picked){
        assert.ok(p.ids.includes('logo-1')&&p.ids.includes('vis-1'),"the session's own logo and visual references are kept");
        assert.ok(p.ids.length<=4,'the four-reference contract is never exceeded');
        assert.equal(p.ids.filter(mid=>p.roles[mid]==='product').length,1,'exactly one product travels with a content');
      }
      assert.deepEqual(rotateProductReference(refs,['prod-a'],1),refs,'one product in the catalogue means nothing to rotate');
      assert.deepEqual(rotateProductReference(refs,[],0),refs,'an empty catalogue changes nothing');
    });
    await t.test('a campaign gives each account its own run, slots and creative', async () => {
      const d=new Date(Date.now()+3*864e5+7*3600000).toISOString().slice(0,10);
      const plan=await gen.createPlan(user,{request_id:'per-account',brief:'Two brands, one campaign',account_ids:['ig-generator','ig-second'],content_count:2,slide_count:1,start_date:d,end_date:d,times:['09:10','11:10'],manual:true});
      const runs=all('SELECT * FROM generator_runs WHERE plan_id=? ORDER BY scheduled_at,id',plan.id);
      assert.equal(runs.length,4,'two posts per account across two accounts');
      for(const r of runs){
        const targets=JSON.parse(r.targets);
        assert.equal(targets.length,1,'a run carries exactly one account, so its creative is that account’s alone');
      }
      const byAccount=new Map();
      for(const r of runs){const aid=JSON.parse(r.targets)[0].account_id;byAccount.set(aid,[...(byAccount.get(aid)||[]),r]);}
      assert.deepEqual([...byAccount.keys()].sort(),['ig-generator','ig-second']);
      for(const [aid,rows] of byAccount){assert.equal(rows.length,2,aid+' receives the full content_count');assert.equal(new Set(rows.map(r=>r.scheduled_at)).size,2,aid+' posts at distinct times');}
      // The same wall-clock slot may serve both accounts: they are different feeds.
      assert.deepEqual([...byAccount.get('ig-generator')].map(r=>r.scheduled_at).sort(),[...byAccount.get('ig-second')].map(r=>r.scheduled_at).sort(),'an account is not blocked by another account occupying the time');
      for(const r of runs)run("UPDATE generator_runs SET status='cancelled' WHERE id=?",r.id);
    });
    await t.test('the brand name is banned from drawn lettering for whatever account owns the run', async () => {
      const {brandWords,buildImagePrompt}=await import('../src/services/image-prompt.js');
      // Longest first, so a handle is stripped before the bare name inside it.
      assert.deepEqual(brandWords([{account:{username:'manisky.id',name:'Manisky Nails'}}]),['Manisky Nails','manisky.id','manisky']);
      assert.ok(!brandWords([{account:{username:'manisky.id',name:'Manisky Nails'}}]).includes('Nails'),'a category noun a brand may legitimately write is not banned');
      assert.deepEqual(brandWords([{account:'@moonjasmine.id'}]),['moonjasmine.id','moonjasmine'],'the rule is derived per account, not hard-coded to one brand');
      assert.match(buildImagePrompt({instructions:'x',accounts:[{account:{username:'manisky.id'}}],slidePrompt:'a slide',slideIndex:0,slideCount:1,title:'t',brief:'b'}),/outranks the verbatim rule/,'the ban wins when quoted text still carries the brand');
      const prompt=buildImagePrompt({instructions:'x',accounts:[{account:{username:'hannabeauty.kr',name:'Hanna Beauty'}}],slidePrompt:'a slide',slideIndex:0,slideCount:1,title:'t',brief:'b'});
      assert.match(prompt,/BRAND NAME IS NOT ARTWORK/);
      assert.match(prompt,/"hannabeauty"/,'the actual words are named rather than described in the abstract');
      assert.match(prompt,/genuinely printed on the physical product/,'packaging lettering stays allowed');
      assert.match(prompt,/ON-IMAGE TEXT IS VERBATIM/,'quoted text must not be translated');
      assert.equal(buildImagePrompt({instructions:'x',accounts:[],slidePrompt:'a slide',slideIndex:0,slideCount:1,title:'t',brief:'b'}).includes('BRAND NAME IS NOT ARTWORK'),false,'no account, no invented ban');
    });
    await t.test('one language reaches every stage, and the Brand Kit cannot contradict it', async () => {
      const {saveBuffer}=await import('../src/services/media.js');
      const ref=await saveBuffer(user.id,image,{inLibrary:false});
      providerCalls=[];
      const notes='Match the warm palette.\n[LRM BRAND IDENTITY]\nWrite captions and on-image text in Bahasa Indonesia.\n[/LRM BRAND IDENTITY]\nCaption language: id';
      const result=await execute(make({slide_count:1,produce_media:true,caption_language:'en',reference_media_ids:[ref.id],reference_roles:{[ref.id]:'visual'},reference_notes:notes}));
      assert.equal(result.status,'review');
      const systems=providerCalls.map(c=>c.body?.system||c.body?.messages?.[0]?.content||c.body?.systemInstruction?.parts?.[0]?.text||'').filter(Boolean);
      assert.ok(systems.length>=3,'concept, revision and visual all ran');
      for(const system of systems){
        assert.match(system,/OUTPUT LANGUAGE: .*English/,'every text stage is told the resolved language');
        assert.ok(!/Write captions and on-image text in Bahasa Indonesia/.test(system),'the Brand Kit sentence no longer competes with it');
        assert.ok(!/Caption language:/.test(system),'nor does the trailing marker');
      }
      assert.ok(systems.some(x=>x.includes('Final visual concept only')&&x.includes('THE BRAND NAME IS NOT A HEADLINE')),'the Conceptor is told not to write the brand into the quoted headline');
      assert.ok(!systems.some(x=>/Write caption in the brief's language/.test(x)),"the contract no longer defers to the brief's own language");
      const prompt=providerCalls.findLast(c=>c.form)?.form.get('prompt')||providerCalls.findLast(c=>String(c.url).includes('/images/'))?.body?.prompt||'';
      assert.match(prompt,/OUTPUT LANGUAGE: .*English/,'the image model is told it too');
      assert.match(prompt,/Match the warm palette/,'the rest of the brand direction still travels');
    });
    await t.test('the brand name is removed from the headline the Conceptor quoted', async () => {
      const {stripBrandFromQuotes,brandWords}=await import('../src/services/image-prompt.js');
      const words=brandWords([{account:{username:'manisky.id',name:'Manisky Nails'}}]);
      // The real failure: a quoted headline is rendered character for character,
      // so a brand name inside it is drawn beside the composited mark.
      assert.equal(stripBrandFromQuotes('Headline reading "Manicure Cantik Tanpa Kerumitan dengan MANISKY" top left.',words),
        'Headline reading "Manicure Cantik Tanpa Kerumitan" top left.','the brand and the connector that introduced it both go');
      assert.equal(stripBrandFromQuotes('Headline "Manisky" centred.',words),'Headline centred.','a quote that was only the brand leaves nothing behind');
      assert.equal(stripBrandFromQuotes('The box is printed with the Manisky wordmark.',words),
        'The box is printed with the Manisky wordmark.','lettering described on the packaging is not quoted and is left alone');
      assert.equal(stripBrandFromQuotes('Headline "Press on, go out" and a calm wall.',words),
        'Headline "Press on, go out" and a calm wall.','a headline without the brand is untouched');
      assert.equal(stripBrandFromQuotes('Headline "Anything at all".',[]),'Headline "Anything at all".','no account, nothing stripped');
    });
    await t.test('the session language outranks the Brand Kit and the brief it was written in', async () => {
      const {resolveOutputLanguage,stripLanguageDirectives,outputLanguageClause}=await import('../src/services/output-language.js');
      const notes='Keep it warm.\n[LRM BRAND IDENTITY]\nWrite captions and on-image text in Bahasa Indonesia.\nThe Final Reviewer must flag captions in the wrong language (Bahasa Indonesia).\n[/LRM BRAND IDENTITY]\nCaption language: id';
      assert.equal(resolveOutputLanguage({requested:'en',notes}),'en','the session choice wins over the account default');
      assert.equal(resolveOutputLanguage({notes}),'id','without a session choice the Brand Kit decides');
      assert.equal(resolveOutputLanguage({requested:'nonsense',notes}),'id','an unknown value falls back rather than being passed on');
      assert.equal(resolveOutputLanguage({}),'id');
      const stripped=stripLanguageDirectives(notes);
      assert.ok(!/Bahasa Indonesia/.test(stripped),'no competing language sentence survives into the prompt');
      assert.ok(!/Caption language:/.test(stripped),'nor the trailing marker');
      assert.match(stripped,/Keep it warm\./,'the rest of the brand rules are kept');
      assert.match(outputLanguageClause('en'),/English/);
      assert.match(outputLanguageClause('en'),/overrides any other language statement/,'it is stated as outranking, not as one more opinion');
      assert.match(outputLanguageClause(''),/Bahasa Indonesia/,'an empty language still names one');
    });
    await t.test('a plan records the language its session chose', async () => {
      const body={account_ids:['ig-generator'],brief:'Campaign brief written in Indonesian',content_count:1,slide_count:1,start_date:'2026-11-02',end_date:'2026-11-02',times:['09:00'],manual:true,reference_notes:'Caption language: id'};
      const created=await http('POST','/plans',{...body,request_id:'lang-'+Date.now(),caption_language:'en'});
      assert.equal(created.status,201,JSON.stringify(created.json));
      const runs=all('SELECT caption_language FROM generator_runs WHERE plan_id=?',created.json.id);
      assert.ok(runs.length,'the plan created runs');
      for(const r of runs)assert.equal(r.caption_language,'en','the session choice is stored, not the Brand Kit default');
      run("UPDATE generator_runs SET status='cancelled' WHERE plan_id=?",created.json.id);
      const inherited=await http('POST','/plans',{...body,request_id:'lang-default-'+Date.now()});
      assert.equal(inherited.status,201,JSON.stringify(inherited.json));
      for(const r of all('SELECT caption_language FROM generator_runs WHERE plan_id=?',inherited.json.id))assert.equal(r.caption_language,'id','with no session choice the Brand Kit default is recorded');
      run("UPDATE generator_runs SET status='cancelled' WHERE plan_id=?",inherited.json.id);
      const rejected=await http('POST','/plans',{...body,request_id:'lang-bad-'+Date.now(),caption_language:'klingon'});
      assert.equal(rejected.status,400);
      assert.match(JSON.stringify(rejected.json),/id, en or mixed/);
    });
    await t.test('text-only stages run on a cheap model and a saved team can return to the defaults', async () => {
      const before=gen.settings(user).agents;
      // Only the stages that look at images or carry a story arc pay for a
      // capable model; the rest move text around and run on Gemini Flash.
      for(const role of ['concept','revision','manager','scheduler']){
        assert.equal(before[role].provider,'gemini',role+' is a text-only stage');
        assert.equal(before[role].model,'gemini-2.5-flash');
      }
      assert.equal(before.visual.provider,'anthropic','reference inspection keeps its model');
      assert.equal(before.final.provider,'anthropic','so does the reviewer that looks at the finished images');
      assert.equal(before.image.provider,'openai');
      const saved=gen.saveSettings(user,{agents:Object.fromEntries(Object.entries(before).map(([role,a])=>[role,{...a,provider:role==='image'?'openai':'openai',model:role==='image'?'gpt-image-2.5-sunburst':'gpt-4.1-mini'}]))});
      assert.equal(saved.agents.concept.model,'gpt-4.1-mini','a deliberate choice is stored and wins over the default');
      const reset=gen.resetSettings(user);
      assert.equal(reset.agents.concept.provider,'gemini','and there is a way back to the recommended team');
      assert.equal(reset.agents.storyteller.model,'claude-sonnet-5-5');
      assert.equal(one('SELECT COUNT(*) n FROM generator_settings WHERE user_id=?',user.id).n,0,'the stored row is gone, not overwritten with a copy of the defaults');
    });
    await t.test('the story roles default to a model that can actually tell a story', async () => {
      const s=gen.settings(user);
      // gpt-4.1-mini returned a content type the session could not produce and
      // wrote thin episodes; the storyteller carries the session's whole arc.
      assert.equal(s.agents.storyteller.provider,'anthropic');
      assert.equal(s.agents.storyteller.model,'claude-sonnet-5-5');
      assert.equal(s.agents.visual.model,'claude-opus-5','the visual conceptor keeps the model chosen for it');
    });
    await t.test('a retired image model never reaches the provider, from settings, a save or an older draft', async () => {
      const {PROVIDERS,currentModel}=await import('../src/llm/providers.js');
      assert.equal(PROVIDERS.openai.imageModel,'gpt-image-2.5-sunburst');
      assert.deepEqual(PROVIDERS.openai.imageModels.map(m=>m.id),['gpt-image-2.5-sunburst','gpt-image-2.5-flare'],'both current image models are offered');
      assert.equal(currentModel('gpt-image-1'),'gpt-image-2.5-sunburst');
      assert.equal(currentModel('gpt-image-2.5-flare'),'gpt-image-2.5-flare','a deliberate working choice is never rewritten');
      assert.equal(currentModel('claude-opus-4-1'),'claude-opus-5-5','a retired Claude model is replaced');
      assert.equal(currentModel('claude-sonnet-4-5'),'claude-sonnet-5-5','a Claude model with an announced retirement date is replaced ahead of it');
      assert.equal(currentModel('claude-haiku-4-5'),'claude-haiku-4-5','a model that is merely older but still Active is left alone');
      assert.equal(PROVIDERS.anthropic.textModel,'claude-sonnet-5-5');
      assert.equal(gen.settings(user).agents.revision.model,'gemini-2.5-flash','the Concept Reviewer is a text-only stage on the cheap model');
      assert.equal(gen.settings(user).agents.final.model,'claude-sonnet-5-5','the reviewer that looks at the images is not');
      assert.equal(gen.settings(user).agents.image.model,'gpt-image-2.5-sunburst','the default no longer names the retired model');

      const saved=gen.saveSettings(user,{agents:{...gen.settings(user).agents,image:{provider:'openai',model:'gpt-image-1',instructions:'Create square designs.'}}});
      assert.equal(saved.agents.image.model,'gpt-image-2.5-sunburst','a stored retired model is migrated on read');

      // A draft created before the shutdown keeps the model it was made with.
      const stale=make({slide_count:1});
      const staleAgents=JSON.parse(one('SELECT agents FROM generator_runs WHERE id=?',stale.id).agents);
      staleAgents.image.model='gpt-image-1';
      run('UPDATE generator_runs SET agents=? WHERE id=?',JSON.stringify(staleAgents),stale.id);
      const before=providerCalls.length;
      const result=await execute(stale);
      assert.equal(result.status,'review',JSON.stringify(result.steps?.failure));
      const imageCall=providerCalls.slice(before).find(c=>String(c.url).includes('/images/'));
      assert.equal(imageCall.body.model,'gpt-image-2.5-sunburst','retrying an older draft reaches a live model');
      assert.ok(!providerCalls.slice(before).some(c=>c.body.model==='gpt-image-1'),'the retired id never leaves the app');
      gen.saveSettings(user,{agents:{...gen.settings(user).agents,image:{provider:'openai',model:'gpt-image-2.5-sunburst',instructions:'Create square designs.'}}});
    });
    await t.test('a rejected image request reports the provider’s own reason without echoing its text', async () => {
      const {providerDetail}=await import('../src/llm/providers.js');
      failImage='rejected';const result=await execute(make({slide_count:1}));failImage=false;
      assert.equal(result.status,'failed');assert.equal(result.steps.failure.stage,'image');assert.equal(result.steps.failure.code,'provider_error');
      assert.match(result.steps.failure.message,/moderation_blocked/,'the actual cause replaces a guess about the model or account');
      assert.match(result.steps.failure.message,/image_generation_user_error/);
      assert.ok(!result.steps.failure.message.includes(secret),'provider free text is never stored');assert.ok(!result.error.includes(secret));
      assert.doesNotMatch(result.steps.failure.message,/Check the model and provider account/,'an unexplained guess is not presented as the reason');
      gen.cancelRun(user,result.id);
      assert.equal(providerDetail(JSON.stringify({error:{message:secret}})),'','a reason-less body yields no detail rather than leaking the message');
      assert.equal(providerDetail(JSON.stringify({error:{code:'string_above_max_length',type:'invalid_request_error'}})),'string_above_max_length / invalid_request_error');
      assert.equal(providerDetail(JSON.stringify({error:{status:'INVALID_ARGUMENT',code:400}})),'INVALID_ARGUMENT','Gemini numeric codes are ignored and its status is kept');
      assert.equal(providerDetail('<html>502 Bad Gateway</html>'),'');assert.equal(providerDetail(JSON.stringify({error:{code:'x'.repeat(99)}})),'','unbounded identifiers are refused');
    });
    await t.test('a visual concept without observed art direction is rejected before any paid image', async () => {
      const images=imageCalls;malformed='no-art-direction';const result=await execute(make({slide_count:1}));malformed=false;
      assert.equal(result.status,'failed');assert.equal(result.steps.failure.stage,'visual');assert.equal(result.steps.failure.code,'generator_format');
      assert.match(result.error,/palette, background, typography, composition, lighting, avoid/,'the error names the missing reference observations');
      assert.equal(imageCalls,images,'the image model is never paid for a slide with no art direction');
      assert.equal(result.steps.revision.status,'done','completed concept stages survive the failed visual stage');
      gen.cancelRun(user,result.id);
    });
    await t.test('idempotency, malformed output, revoked scope and cancellation during a provider call', async () => {
      const body = { request_id: 'stable', brief: 'Stable', account_ids: ['ig-generator'], slide_count: 1, confirm_cost: true };
      const a = gen.createRun(user, body); assert.equal(gen.createRun(user, body).id, a.id);
      assert.throws(() => gen.createRun(user, { ...body, brief: 'Changed' }), /request_id/);
      gen.cancelRun(user, a.id);
      malformed = true; let r = await execute(make()); assert.equal(r.status, 'failed'); assert.match(r.error, /concept response was truncated or could not be read/); malformed = false; gen.cancelRun(user, r.id);
      r = make(); setAssignments(user.id, []); gen.runGeneratorTick(); await gen.waitGenerator(); assert.equal(one('SELECT status FROM generator_runs WHERE id=?', r.id).status, 'failed');
      setAssignments(user.id, ['ig-generator']); gen.cancelRun(user, r.id);
      let release; gate = new Promise(r => { release = r; }); const started = new Promise(r => { blocked = r; });
      r = make();gen.runGeneratorTick();await gen.waitGenerator();assert.equal(gen.getRun(user,r.id).status,'concept_review');gen.approveConcept(user,r.id,{confirm_cost:true}); gen.runGeneratorTick(); await started; gen.cancelRun(user, r.id); release(); await gen.waitGenerator(); gate = null; blocked = null;
      assert.equal(gen.getRun(user, r.id).status, 'cancelled'); assert.equal(gen.getRun(user, r.id).media.length, 0);
      await assert.rejects(() => gen.handoff(user, r.id, {}), /Wait for all agents/);
      const stale = make(); const callsBefore = providerCalls.length;
      run("UPDATE generator_runs SET status='running',updated_at='2000-01-01T00:00:00.000Z' WHERE id=?", stale.id);
      gen.runGeneratorTick(); await gen.waitGenerator();
      assert.equal(gen.getRun(user, stale.id).status, 'failed'); assert.equal(providerCalls.length, callsBefore);
      gen.cancelRun(user, stale.id);
    });
  } finally { globalThis.fetch = realFetch; await gen.waitGenerator(); await new Promise(r => server.close(r)); fs.rmSync(tmp, { recursive: true, force: true }); }
});
