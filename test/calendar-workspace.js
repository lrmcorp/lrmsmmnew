import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lrmsmm-calendar-'));Object.assign(process.env,{DATA_DIR:dir,META_MOCK:'1',DISABLE_WORKER:'1'});
const {db,run,one,all}=await import('../src/db.js'),{createUser}=await import('../src/auth.js'),{encrypt}=await import('../src/util.js'),{setAssignments}=await import('../src/services/scope.js'),gen=await import('../src/services/generator.js'),posts=await import('../src/services/posts.js'),media=await import('../src/services/media.js'),{moveCalendarItem,duplicateCalendarPost}=await import('../src/services/calendar-workspace.js');
const owner=createUser({email:'calendar-owner@fixture.id',password:'fixture-password',name:'Owner',role:'owner'}),rep=createUser({email:'calendar-rep@fixture.id',password:'fixture-password',name:'Representative',role:'rep'});
for(const id of ['a','b','c'])run('INSERT INTO accounts(id,platform,platform_user_id,username,token_enc) VALUES(?,?,?,?,?)',id,'instagram','ig-'+id,'brand-'+id,encrypt('fixture'));
setAssignments(rep.id,['a','b']);const at=new Date(Date.now()+5*864e5).toISOString(),later=new Date(Date.now()+6*864e5).toISOString(),date=at.slice(0,10);
const sharp=(await import('sharp')).default,photo=await media.saveBuffer(owner.id,await sharp({create:{width:1080,height:1350,channels:3,background:'#f0e8df'}}).jpeg().toBuffer(),{inLibrary:false});
after(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true});});
async function draft(user=owner){const plan=await gen.createPlan(user,{request_id:crypto.randomUUID(),brief:'Calendar draft',account_ids:['a'],content_count:1,start_date:date,end_date:date,times:['12:15'],manual:true});return gen.listRuns(user).find(r=>r.plan_id===plan.id);}
test('calendar moves the dragged draft destination and date atomically, with safe undo and stale-write rejection',async()=>{
 const item=await draft(rep),moved=moveCalendarItem(rep,{id:item.id,kind:'generator',scheduled_at:later,from_account_id:'a',to_account_id:'b',expected_updated_at:item.updated_at});assert.equal(moved.targets[0].account_id,'b');assert.equal(moved.scheduled_at,later);
 assert.throws(()=>moveCalendarItem(rep,{id:item.id,kind:'generator',scheduled_at:at,from_account_id:'b',to_account_id:'a',expected_updated_at:item.updated_at}),e=>e.code==='calendar_conflict');
 const undo=moveCalendarItem(rep,{id:item.id,kind:'generator',scheduled_at:item.scheduled_at,from_account_id:'b',to_account_id:'a',expected_updated_at:moved.updated_at});assert.equal(undo.targets[0].account_id,'a');assert.equal(undo.scheduled_at,item.scheduled_at);
 const before=one('SELECT * FROM generator_runs WHERE id=?',item.id);assert.throws(()=>moveCalendarItem(rep,{id:item.id,kind:'generator',scheduled_at:later,from_account_id:'a',to_account_id:'c',expected_updated_at:undo.updated_at}),e=>e.status===404);assert.deepEqual(one('SELECT * FROM generator_runs WHERE id=?',item.id),before);
 run("UPDATE generator_runs SET status='running' WHERE id=?",item.id);assert.throws(()=>moveCalendarItem(rep,{id:item.id,kind:'generator',scheduled_at:at,expected_updated_at:undo.updated_at}),e=>e.code==='calendar_state');
});
test('scheduled moves update worker run_at and reject cross-account moves or published posts',()=>{
 const {post}=posts.createPost(owner,{content:'Caption',media_ids:[photo.id],targets:[{account_id:'a',options:{}}],scheduled_at:at});
 const moved=moveCalendarItem(owner,{id:post.id,kind:'post',scheduled_at:later,expected_updated_at:post.updated_at});assert.equal(moved.scheduled_at,later);assert.equal(one('SELECT run_at FROM post_targets WHERE post_id=?',post.id).run_at,later);
 assert.throws(()=>moveCalendarItem(owner,{id:post.id,kind:'post',scheduled_at:at,from_account_id:'a',to_account_id:'b',expected_updated_at:moved.updated_at}),e=>e.code==='calendar_state');
 run("UPDATE posts SET status='published' WHERE id=?",post.id);assert.throws(()=>moveCalendarItem(owner,{id:post.id,kind:'post',scheduled_at:at,expected_updated_at:moved.updated_at}),e=>e.code==='calendar_state');
});
test('duplicate creates an idempotent private draft with separate owned media and no scheduled/publication job',()=>{
 const {post}=posts.createPost(owner,{content:'Caption asli',media_ids:[photo.id],targets:[{account_id:'a',content:'Caption akun',media_ids:[photo.id],options:{}}],scheduled_at:at});const count=one('SELECT count(*) n FROM posts').n;
 const draft=duplicateCalendarPost(rep,post.id,'duplicate-fixture');assert.equal(draft.status,'pending');assert.equal(draft.scheduled_at,null);assert.equal(draft.source,'Calendar');assert.equal(draft.targets[0].content,'Caption akun');assert.notEqual(draft.media_ids[0],photo.id);assert.equal(draft.targets[0].media_ids[0],draft.media_ids[0]);
 const copy=one('SELECT * FROM media WHERE id=?',draft.media_ids[0]);assert.equal(copy.user_id,rep.id);assert.ok(fs.existsSync(copy.path));assert.notEqual(copy.path,one('SELECT path FROM media WHERE id=?',photo.id).path);assert.equal(one('SELECT count(*) n FROM posts').n,count);assert.equal(duplicateCalendarPost(rep,post.id,'duplicate-fixture').id,draft.id);assert.throws(()=>media.deleteMedia(copy.id),e=>e.code==='media_in_use');
 const hidden=posts.createPost(owner,{content:'Private',media_ids:[photo.id],targets:[{account_id:'c',options:{}}],scheduled_at:at}).post;assert.throws(()=>duplicateCalendarPost(rep,hidden.id,'hidden'),e=>e.status===404);assert.equal(all('SELECT * FROM ai_drafts WHERE user_id=?',rep.id).length,1);
});
