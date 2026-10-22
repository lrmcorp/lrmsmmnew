import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'lrmsmm-story-'));
Object.assign(process.env,{DATA_DIR:tmp,META_MOCK:'1',DISABLE_WORKER:'1'});
const {app}=await import('../src/server.js');
const {run,one,all}=await import('../src/db.js');
const {createUser,createApiKey}=await import('../src/auth.js');
const {encrypt}=await import('../src/util.js');
const {setAssignments}=await import('../src/services/scope.js');
const gen=await import('../src/services/generator.js'),story=await import('../src/services/storytelling.js'),media=await import('../src/services/media.js');
const sharp=(await import('sharp')).default;
const image=await sharp({create:{width:1024,height:1024,channels:3,background:'#bcd'}}).png().toBuffer();
const user=createUser({email:'story@fixture.id',password:'fixture-password',name:'Story member',role:'rep'}),other=createUser({email:'other-story@fixture.id',password:'fixture-password',name:'Other',role:'rep'});
for(const aid of ['story-account','outside-account'])run("INSERT INTO accounts(id,platform,platform_user_id,username,token_enc) VALUES(?,'instagram',?,?,?)",aid,aid,aid,encrypt('fixture-token'));
setAssignments(user.id,['story-account']);setAssignments(other.id,[]);
for(const provider of ['openai','anthropic','gemini'])gen.saveKey(user,provider,'fixture-story-private-key');
const real=global.fetch;let calls=[],rejectManager=false,badProduct=false,badSchedule=false,shortStoryOnce=false,schedulerHttp=0,hold=null,entered=null;
global.fetch=async(url,opts)=>{
 if(!['https://api.openai.com','https://api.anthropic.com','https://generativelanguage.googleapis.com'].includes(new URL(url).origin))return real(url,opts);
 const body=opts.body instanceof FormData?Object.fromEntries(opts.body.entries()):JSON.parse(opts.body);calls.push({url,body});
 if(String(url).includes('/images/')||body.generationConfig?.responseModalities)return Response.json(body.generationConfig?{candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:image.toString('base64')}}]}}]}:{data:[{b64_json:image.toString('base64')}]});
 const schema=body.response_format?.json_schema?.schema||body.tools?.[0]?.input_schema||body.generationConfig?.responseJsonSchema;
 const content=body.messages?.find(m=>m.role==='user')?.content;const prompt=Array.isArray(content)?content.find(p=>p.type==='text')?.text:body.contents?.[0]?.parts?.[0]?.text||content;
 const system=body.system||body.messages?.[0]?.content||body.systemInstruction?.parts?.[0]?.text||'';
 let result;
 if(schema?.properties?.bible&&!schema.properties.approved){
  if(hold){entered?.();await hold;}
  const context=JSON.parse(prompt),n=Number(system.match(/exactly (\d+) episodes/)?.[1]||1),product=context.product_catalog[0]?.id;
  const returnedCount=shortStoryOnce?n-1:n;shortStoryOnce=false;
  result={bible:context.bible||'Brand foundation: quiet confidence',memory:'Cumulative story through episode '+(context.next_episode+n-1),episodes:Array.from({length:returnedCount},(_,i)=>({title:'Episode '+(context.next_episode+i),brief:'Introduce the real product and build on the previous chapter.',caption:'Ready caption '+(context.next_episode+i),content_type:context.uploaded_videos.length&&i===n-1?'reel':'image',video_asset_id:context.uploaded_videos.length&&i===n-1?context.uploaded_videos[0].id:null,product_ids:badProduct?['not-in-catalog']:product?[product]:[]}))};
 }else if(schema?.properties?.approved){result={...JSON.parse(prompt.split('\nPROPOSED SESSION:\n')[1]),approved:!rejectManager,notes:rejectManager?'Story is inconsistent; revise the foundation.':'Continuity and brand facts checked.'};}
 else if(schema?.properties?.slots){if(schedulerHttp)return Response.json({error:{message:'PRIVATE provider details'}},{status:schedulerHttp});const context=JSON.parse(prompt);result={discussion:'Manager continuity notes accepted; keep chronological order. Timing is a contextual suggestion, not measured account analytics.',slots:context.episodes.map((e,i)=>({episode_index:i,slot_index:badSchedule?0:i,reason:'Chapter '+(i+1)+' follows the previous episode at an available audience-friendly WIB slot.'}))};}
 else if(schema?.properties?.slides){const n=Number(system.match(/Exactly (\d+) slides/)?.[1]||1);result={title:'Production concept',caption:'Production caption',slides:Array.from({length:n},()=>({prompt:'Product on white background'}))};}
 else result='Numbered slide checklist: verify brand and claims.';
 const text=typeof result==='string'?result:JSON.stringify(result);
 return Response.json(String(url).includes('anthropic')?{content:[{type:'text',text}]}:String(url).includes('googleapis')?{candidates:[{content:{parts:[{text}]}}]}:{choices:[{message:{content:text}}]});
};
const date=days=>new Date(Date.now()+days*864e5+7*3600000).toISOString().slice(0,10);
let seq=0;const body=extra=>({account_id:'story-account',request_id:'story-'+(++seq),content_count:2,slide_count:2,start_date:date(1),end_date:date(14),times:['12:15','19:15'],confirm_cost:true,produce_media:false,...extra});
async function execute(j){gen.runGeneratorTick();await gen.waitGenerator();return story.job(user,j.id);}
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
async function cookie(u){return (await real(base+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:u.email,password:'fixture-password'})})).headers.get('set-cookie').split(';')[0];}
const sid=await cookie(user),otherSid=await cookie(other);
async function http(method,url,data,credential=sid){return real(base+'/v1/generator'+url,{method,headers:{cookie:credential,'content-type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});}
test('persistent brand kit, story continuity, manager and scheduler',async t=>{try{
 await t.test('account scoped assets survive GC and private keys stay private',async()=>{
  story.saveProfile(user,'story-account',{seed:'Start from zero: tell a truthful wellness story that evolves every episode.',brand_notes:'Use green and cream. Never invent benefits.'});
  for(const [category,name] of [['logo','Brand logo'],['visual','Soft palette'],['product','Serum product']]){const m=await media.saveBuffer(user.id,image,{inLibrary:false});story.saveAsset(user,'story-account',{media_id:m.id,category,name,description:'Real '+name});}
  const p=story.profile(user,'story-account');assert.equal(p.assets.length,3);
  for(const a of p.assets){run("UPDATE media SET created_at='2000-01-01T00:00:00.000Z' WHERE id=?",a.media_id);assert.throws(()=>media.deleteMedia(a.media_id),/dipakai/);}
  media.gcMedia();assert.ok(p.assets.every(a=>one('SELECT id FROM media WHERE id=?',a.media_id)));
  assert.equal((await http('GET','/accounts/story-account/brand',undefined,otherSid)).status,404);
  assert.throws(()=>story.saveProfile(user,'outside-account',{seed:'No',brand_notes:''}),/tidak ditemukan/);
  const m=await media.saveBuffer(other.id,image,{inLibrary:false});assert.throws(()=>story.saveAsset(user,'story-account',{media_id:m.id,category:'product',name:'Stolen'}),/unggah sendiri/);
  const key=createApiKey(user.id,'machine','write').key;const denied=await real(base+'/v1/generator/accounts/story-account/brand',{headers:{authorization:'Bearer '+key}});assert.equal(denied.status,403);
 });
 await t.test('three agents select catalog products and continue stored seed without another prompt',async()=>{
  const request=body({});const queued=gen.queueStory(user,request);assert.equal(gen.queueStory(user,request).id,queued.id);assert.throws(()=>gen.queueStory(user,body({})),/aktif/);
  const done=await execute(queued);assert.equal(done.status,'completed',done.error);assert.equal(Object.values(done.steps).filter(s=>s.status==='done').length,3);for(const call of calls){const system=call.body.system||call.body.messages?.[0]?.content||call.body.systemInstruction?.parts?.[0]?.text||'';if(system)assert.match(system,/MANDATORY ASSET PRESERVATION/,'all planning agents preserve originals');}
  const p=story.profile(user,'story-account');assert.equal(p.next_episode,3);assert.equal(p.episodes.length,2);assert.ok(p.memory.includes('2'));
  const rows=gen.listRuns(user).filter(r=>r.story_job_id===done.id);assert.equal(rows.length,2);assert.ok(rows.every(r=>r.status==='planned'&&r.schedule_reason&&r.caption&&r.reference_media_ids.length===3));assert.equal(one('SELECT COUNT(*) n FROM posts').n,0);
  const before=calls.length;assert.equal(gen.queueStory(user,request).id,queued.id);assert.equal(calls.length,before);
  const second=await execute(gen.queueStory(user,body({})));assert.equal(second.status,'completed',second.error);assert.equal(story.profile(user,'story-account').next_episode,5);
  const storytellerCall=calls.slice(before).find(c=>c.body.response_format?.json_schema?.schema.properties.bible&&!c.body.response_format.json_schema.schema.properties.approved);
  const context=JSON.parse(storytellerCall.body.messages[1].content[0].text);assert.ok(context.first_prompt.includes('Start from zero'));assert.equal(context.next_episode,3);assert.equal(context.recent_episodes.length,2);assert.ok(context.memory.includes('2'));assert.ok(storytellerCall.body.messages[1].content.some(p=>p.type==='image_url'));
  assert.ok(!JSON.stringify(story.profile(user,'story-account')).includes('fixture-story-private-key'));
 });
 await t.test('manager rejection, invalid products and invalid schedules never advance memory',async()=>{
  const episode=story.profile(user,'story-account').next_episode,plans=one('SELECT COUNT(*) n FROM generator_plans').n;
  rejectManager=true;const refused=await execute(gen.queueStory(user,body({})));assert.equal(refused.status,'needs_revision');rejectManager=false;
  badProduct=true;const invalid=await execute(gen.queueStory(user,body({})));assert.equal(invalid.status,'failed');badProduct=false;
  badSchedule=true;const bad=await execute(gen.queueStory(user,body({})));assert.equal(bad.status,'failed');badSchedule=false;
  assert.equal(story.profile(user,'story-account').next_episode,episode);assert.equal(one('SELECT COUNT(*) n FROM generator_plans').n,plans);
  const callsBefore=calls.length;story.retry(user,bad.id);assert.equal((await execute(bad)).status,'completed');assert.equal(calls.length-callsBefore,1,'retry preserves storyteller and manager output');
 });
 await t.test('incomplete six-episode Storyteller response is retried before creating drafts',async()=>{
  shortStoryOnce=true;const before=calls.length;
  const queued=gen.queueStory(user,body({content_count:6}));const done=await execute(queued);
  assert.equal(done.status,'completed',done.error);
  assert.equal(gen.listRuns(user).filter(r=>r.story_job_id===queued.id).length,6);
  const attempts=calls.slice(before).filter(c=>c.body.response_format?.json_schema?.schema?.properties?.bible&&!c.body.response_format.json_schema.schema.properties.approved);
  assert.equal(attempts.length,2,'only the invalid Storyteller reply is retried');
  assert.ok(attempts[1].body.messages[0].content.includes('previous response failed validation'));
 });
 await t.test('Gemini Scheduler 404 uses a transparent valid rules schedule and preserves completed QC on retry',async()=>{
  const preset=structuredClone(gen.DEFAULT_AGENTS);preset.scheduler={...preset.scheduler,provider:'gemini',model:'gemini-2.5-flash'};
  const before=calls.length,start=story.profile(user,'story-account').next_episode;
  schedulerHttp=429;const queued=gen.queueStory(user,body({agents:preset}));const failed=await execute(queued);assert.equal(failed.status,'failed');assert.ok(failed.error.includes('Scheduler'));assert.equal(failed.steps.storyteller.status,'done');assert.equal(failed.steps.manager.status,'done');assert.equal(story.profile(user,'story-account').next_episode,start);
  const afterQc=calls.length;schedulerHttp=404;gen.retryStory(user,queued.id,{agents:preset});const done=await execute(queued);schedulerHttp=0;
  assert.equal(done.status,'completed',done.error);assert.equal(calls.length-afterQc,1,'retry calls only Scheduler; completed concept and manager are not billed twice');assert.equal(done.steps.scheduler.source,'rules');assert.ok(done.steps.scheduler.warning.includes('HTTP 404'));assert.ok(!JSON.stringify(done).includes('PRIVATE provider details'));
  const rows=gen.listRuns(user).filter(r=>r.story_job_id===queued.id).sort((a,b)=>a.story_episode-b.story_episode);assert.equal(rows.length,2);assert.ok(rows.every(r=>r.schedule_reason.includes('berbasis aturan')));assert.ok(Date.parse(rows[0].scheduled_at)<Date.parse(rows[1].scheduled_at));assert.equal(story.profile(user,'story-account').next_episode,start+2);assert.equal(one('SELECT COUNT(*) n FROM posts').n,0);
  const direct=await execute(gen.queueStory(user,body({agents:preset,content_count:1})));assert.equal(direct.status,'completed',direct.error);
 });
 await t.test('legacy sessions restore missing agent presets without undefined access',async()=>{
  const j=gen.queueStory(user,body({}));const payload=JSON.parse(one('SELECT payload FROM story_jobs WHERE id=?',j.id).payload);
  delete payload.agents.scheduler;run('UPDATE story_jobs SET payload=? WHERE id=?',JSON.stringify(payload),j.id);
  const done=await execute(j);assert.equal(done.status,'completed',done.error);assert.equal(done.steps.scheduler.status,'done');
 });
 await t.test('saved assets shared within assigned account; media proposals stay unposted until human approval',async()=>{
  const videoPath=path.join(tmp,'reel.mp4');execFileSync('ffmpeg',['-y','-loglevel','error','-f','lavfi','-i','color=c=blue:s=480x640:d=3.2','-c:v','libx264','-pix_fmt','yuv420p',videoPath]);
  const video=await media.saveBuffer(user.id,fs.readFileSync(videoPath),{inLibrary:false});story.saveAsset(user,'story-account',{media_id:video.id,category:'video',name:'Product introduction reel',description:'Real product introduction.'});
  setAssignments(other.id,['story-account']);assert.ok(story.profile(other,'story-account').assets.some(a=>a.media_id===video.id));
  const proposal=await execute(gen.queueStory(user,body({produce_media:true})));assert.equal(proposal.status,'completed',proposal.error);
  gen.runGeneratorTick();await gen.waitGenerator();
  const rows=gen.listRuns(user).filter(r=>r.story_job_id===proposal.id);assert.ok(rows.every(r=>r.status==='review'),JSON.stringify(rows.map(r=>({status:r.status,error:r.error}))));
  const reel=rows.find(r=>r.content_type==='reel');assert.equal(reel.media[0].type,'video');assert.equal(one('SELECT COUNT(*) n FROM posts').n,0);
  const post=gen.approveContent(user,reel.id,{});assert.equal(post.status,'scheduled');assert.equal(gen.approveContent(user,reel.id,{}).id,post.id);
  const imageRow=rows.find(r=>r.content_type!=='reel');gen.deleteContent(user,imageRow.id);assert.ok(story.profile(user,'story-account').bible);assert.ok(story.profile(user,'story-account').assets.every(a=>one('SELECT id FROM media WHERE id=?',a.media_id)));
  for(const provider of ['openai','anthropic','gemini'])gen.saveKey(other,provider,'fixture-other-personal-key');
  const shared=gen.queueStory(other,body({produce_media:true}));gen.runGeneratorTick();await gen.waitGenerator();assert.equal(story.job(other,shared.id).status,'completed');gen.runGeneratorTick();await gen.waitGenerator();
  const sharedReel=gen.listRuns(other).find(r=>r.story_job_id===shared.id&&r.content_type==='reel');assert.equal(sharedReel.status,'review');gen.updateContent(other,sharedReel.id,{content:'Caption edited by assigned member'});
  const videoAsset=story.profile(user,'story-account').assets.find(a=>a.media_id===video.id);story.removeAsset(user,'story-account',videoAsset.id);assert.ok(one('SELECT id FROM media WHERE id=?',video.id));
  assert.equal(gen.approveContent(other,sharedReel.id,{}).status,'scheduled','validated shared video remains usable by assigned creator after catalog unlink');

 });
 await t.test('cancelled queued sessions do not spend tokens or advance history',async()=>{const before=calls.length,episode=story.profile(user,'story-account').next_episode;const j=gen.queueStory(user,body({}));story.cancel(user,j.id);gen.runGeneratorTick();await gen.waitGenerator();assert.equal(story.job(user,j.id).status,'cancelled');assert.equal(story.profile(user,'story-account').next_episode,episode);assert.equal(calls.length,before);});
 await t.test('named memory sessions isolate continuity, support selection and delete memory without deleting content',async()=>{
  const original=story.profile(user,'story-account'),first=original.memory_session_id;
  const created=await http('POST','/accounts/story-account/memory-sessions',{title:'Ramadan campaign'});assert.equal(created.status,201);const second=await created.json();assert.equal(second.next_episode,1);assert.equal(second.memory,'');assert.equal(second.episodes.length,0);
  assert.equal((await http('PATCH','/accounts/story-account/memory-sessions/'+second.memory_session_id,{title:'Season two'})).status,200);
  assert.throws(()=>story.profile(user,'outside-account',second.memory_session_id),e=>e.status===404);
  const request=body({memory_session_id:second.memory_session_id,content_count:1,start_date:date(40),end_date:date(43),times:['08:15']});const result=await execute(gen.queueStory(user,request));assert.equal(result.status,'completed',result.error);
  const context=JSON.parse(calls.filter(c=>c.body.response_format?.json_schema?.schema?.properties?.bible&&!c.body.response_format.json_schema.schema.properties.approved).at(-1).body.messages[1].content[0].text);assert.equal(context.memory,'');assert.equal(context.recent_episodes.length,0);assert.equal(context.next_episode,1);
  const updated=story.profile(user,'story-account',second.memory_session_id);assert.equal(updated.next_episode,2);assert.equal(updated.episodes[0].episode_number,1);assert.equal(story.profile(user,'story-account',first).memory,original.memory);assert.equal(story.profile(user,'story-account',first).next_episode,original.next_episode);
  const memory=updated.episodes[0],contentId=memory.run_id;
  assert.throws(()=>story.deleteMemory(user,'story-account',first,memory.id),e=>e.status===404);
  const removed=await http('DELETE','/accounts/story-account/memory-sessions/'+second.memory_session_id+'/memories/'+memory.id);assert.equal(removed.status,200);const cleared=await removed.json();assert.equal(cleared.memory,'');assert.equal(cleared.bible,'');assert.equal(cleared.episodes.length,0);assert.equal(cleared.next_episode,2,'deleted episode numbers are not silently reused');assert.ok(one('SELECT id FROM generator_runs WHERE id=?',contentId));
  assert.equal((await http('DELETE','/accounts/story-account/memory-sessions/'+second.memory_session_id)).status,200);assert.throws(()=>story.profile(user,'story-account',second.memory_session_id),e=>e.status===404);assert.equal(story.profile(user,'story-account',first).memory,original.memory);assert.ok(one('SELECT id FROM generator_runs WHERE id=?',contentId));assert.equal(gen.queueStory(user,request).id,result.id,'replaying a completed request does not recreate deleted memory');assert.throws(()=>gen.queueStory(user,{...request,memory_session_id:first}),e=>e.code==='idempotency_conflict');
  assert.equal((await http('POST','/accounts/outside-account/memory-sessions',{title:'Not assigned'})).status,404);
 });
 await t.test('account lock and revoked grants checked across paid calls',async()=>{
  let release;hold=new Promise(r=>release=r);const started=new Promise(r=>entered=r);
  const j=gen.queueStory(user,body({}));gen.runGeneratorTick();await started;
  assert.throws(()=>story.saveProfile(user,'story-account',{seed:'Changed',brand_notes:''}),/Tunggu/);assert.throws(()=>story.deleteMemorySession(user,'story-account',story.profile(user,'story-account').memory_session_id),/Tunggu/);
  setAssignments(user.id,[]);release();await gen.waitGenerator();hold=null;entered=null;setAssignments(user.id,['story-account']);assert.equal(story.job(user,j.id).status,'failed');
 });
}finally{hold=null;global.fetch=real;await gen.waitGenerator();await new Promise(r=>server.close(r));fs.rmSync(tmp,{recursive:true,force:true});}});
