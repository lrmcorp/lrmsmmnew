import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lrmsmm-audit-'));
Object.assign(process.env,{DATA_DIR:dir,META_MOCK:'1',DISABLE_WORKER:'1'});
const {db,run}=await import('../src/db.js');
const {auditContext,listAuditWorkspace}=await import('../src/services/audit-workspace.js');
after(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true});});
test('audit enrichment resolves only actual users, target accounts and sessions without exposing credentials',()=>{
 run("INSERT INTO users(id,email,name,password_hash) VALUES('u','owner@fixture.id','Owner','secret-hash')");
 run("INSERT INTO accounts(id,platform,platform_user_id,username,token_enc) VALUES('a','instagram','1','brand','secret-token')");
 run("INSERT INTO generator_runs(id,user_id,request_id,request_hash,brief,targets,slide_count,agents,created_at,updated_at,plan_id) VALUES('r','u','req','hash','brief',?,1,'{}','2026-10-20','2026-10-20','p')",JSON.stringify([{account_id:'a'}]));
 const event=auditContext({user_id:'u',target_type:'generator_run',target_id:'r',details:null});
 assert.deepEqual(event.account_ids,['a']);assert.deepEqual(event.actor,{id:'u',name:'Owner'});assert.equal(event.session.id,'p');
 assert.ok(!JSON.stringify(event).includes('secret-'));
 const missing=auditContext({user_id:'deleted',target_type:'generator_run',target_id:'deleted',details:null});assert.equal(missing.actor,null);assert.deepEqual(missing.account_ids,[]);assert.equal(missing.session,null);
});
test('audit pagination preserves contract and saved account links',()=>{
 for(let i=0;i<3;i++)run("INSERT INTO audit_log(user_id,action,target_type,target_id,details) VALUES('u','brand.save','account','a',NULL)");
 const first=listAuditWorkspace({limit:2});assert.equal(first.data.length,2);assert.ok(first.next_cursor);assert.deepEqual(first.data[0].account_ids,['a']);
 const next=listAuditWorkspace({limit:2,cursor:first.next_cursor});assert.equal(next.data.length,1);assert.equal(next.next_cursor,null);
});
