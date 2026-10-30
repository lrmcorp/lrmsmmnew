import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'account-specialists-'));
Object.assign(process.env,{DATA_DIR:dir,META_MOCK:'1',DISABLE_WORKER:'1'});
const {db,run,one}=await import('../src/db.js'),{createUser}=await import('../src/auth.js'),{encrypt}=await import('../src/util.js'),story=await import('../src/services/storytelling.js'),gen=await import('../src/services/generator.js'),{accountSpecialistContext}=await import('../src/services/account-specialist.js'),{setAssignments}=await import('../src/services/scope.js');
const owner=createUser({email:'specialist@fixture.id',password:'fixture-password',name:'Owner',role:'owner'}),other=createUser({email:'other-specialist@fixture.id',password:'fixture-password',name:'Other',role:'rep'});
for(const aid of ['nails','coffee'])run("INSERT INTO accounts(id,platform,platform_user_id,username,token_enc) VALUES(?,'instagram',?,?,?)",aid,aid,aid,encrypt('fixture'));
setAssignments(other.id,['coffee']);story.saveProfile(owner,'nails',{seed:'Gentle nail care for beginners',brand_notes:'Quiet green palette. No medical claims.'});story.saveProfile(owner,'coffee',{seed:'Coffee and neighborhood mornings',brand_notes:'Warm amber palette.'});
function history(id,user,aid,brief){run("INSERT INTO generator_runs(id,user_id,request_id,request_hash,brief,targets,slide_count,agents,status,created_at,updated_at) VALUES(?,?,?,?,?,?,1,'{}','planned',?,?)",id,user.id,id,'fixture',brief,JSON.stringify([{account_id:aid}]),new Date().toISOString(),new Date().toISOString());}
history('nail-history',owner,'nails','Introduce the nail-care routine');history('coffee-history',owner,'coffee','PRIVATE_COFFEE_DIRECTION');history('other-history',other,'nails','PRIVATE_OTHER_USER');
after(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true});});
test('agents receive only selected account foundation and permitted private history',()=>{
 const [context]=accountSpecialistContext(owner,[{account_id:'nails'}]);assert.equal(context.account.username,'nails');assert.match(context.foundation,/Gentle nail care/);assert.equal(context.previous_proposals.length,1);assert.match(context.previous_proposals[0].brief,/nail-care/);assert.ok(!JSON.stringify(context).includes('PRIVATE_COFFEE_DIRECTION'));assert.ok(!JSON.stringify(context).includes('PRIVATE_OTHER_USER'));assert.throws(()=>accountSpecialistContext(other,[{account_id:'nails'}]),e=>e.status===404);
});
test('six episodes in two days fit without the user adding times; an impossible day still says so',()=>{
 gen.saveKey(owner,'openai','fixture-key');const p=story.createMemorySession(owner,'nails',{title:'First six episodes'}),date=n=>new Date(Date.now()+n*864e5+7*3600000).toISOString().slice(0,10),body={account_id:'nails',memory_session_id:p.memory_session_id,request_id:'six-slots',content_count:6,slide_count:1,start_date:date(40),end_date:date(41),times:['12:15','19:15'],confirm_cost:true};
 // Two chosen times over two days used to be refused with "add posting times".
 // The count and the range are the user's decision, so a third time a day is
 // derived instead and the two they chose are kept.
 const j=gen.queueStory(owner,body);assert.equal(j.status,'queued');assert.equal(j.memory_session_id,p.memory_session_id);story.cancel(owner,j.id);
 // A day cannot hold thirty posts half an hour apart, and that still says so.
 assert.throws(()=>gen.queueStory(owner,{...body,request_id:'thirty-slots',content_count:30,start_date:date(44),end_date:date(44)}),e=>{assert.equal(e.code,'schedule_capacity');assert.equal(e.details.required_slots,30);assert.ok(e.details.available_slots<30);assert.match(e.message,/Extend the date range or reduce the count/);return true;});
});

test('actual Conceptor and Revision calls carry server-owned account specialization',async()=>{
 gen.saveKey(owner,'anthropic','fixture-anthropic');const real=global.fetch,calls=[];
 global.fetch=async(url,options)=>{assert.ok(['https://api.openai.com','https://api.anthropic.com'].includes(new URL(url).origin));const body=JSON.parse(options.body);calls.push(body);const text=JSON.stringify({title:'Nail routine',caption:'Account-specific caption',slides:[{prompt:'Use this account brand palette and original product sources'}]});return Response.json(String(url).includes('anthropic')?{content:[{type:'text',text}]}:{choices:[{message:{content:text}}]});};
 try{const r=gen.createRun(owner,{request_id:'specialized-production',brief:'Continue the nail-care education',account_ids:['nails'],slide_count:1,confirm_cost:true});gen.runGeneratorTick();await gen.waitGenerator();const result=gen.getRun(owner,r.id);assert.equal(result.status,'concept_review',result.error);assert.equal(result.steps.account_specialization.accounts[0].account.username,'nails');assert.equal(calls.length,2);for(const body of calls){assert.match(JSON.stringify(body),/Gentle nail care/);assert.match(JSON.stringify(body),/dedicated specialist/);assert.ok(!JSON.stringify(body).includes('PRIVATE_COFFEE_DIRECTION'));assert.ok(!JSON.stringify(body).includes('PRIVATE_OTHER_USER'));}}
 finally{global.fetch=real;await gen.waitGenerator();}
});
