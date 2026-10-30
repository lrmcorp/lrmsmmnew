import test from 'node:test';
import assert from 'node:assert/strict';
import {autosave,errorReason,groupSessions,sessionState,fmtTime} from '../public/ui.js';

test('session fallback groups account-specific caption directives while explicit batches remain separate',()=>{
 const plans=[{id:'a',brief:'Brand launch\nWrite captions and on-image text in Indonesian.',start_date:'2026-11-01',end_date:'2026-11-07',content_count:2,created_at:'2026-10-21T00:00:00Z'},{id:'b',brief:'Brand launch\nWrite captions and on-image text in English.',start_date:'2026-11-01',end_date:'2026-11-07',content_count:3,created_at:'2026-10-21T00:00:01Z'}];
 const runs=[{id:'r1',plan_id:'a',status:'planned'},{id:'r2',plan_id:'b',status:'concept_review'}];
 const fallback=groupSessions(plans,runs);assert.equal(fallback.length,1);assert.equal(fallback[0].content_count,5);assert.equal(fallback[0].runs.length,2);assert.equal(sessionState(fallback[0]),'action');
 const explicit=groupSessions(plans,runs,[{ids:['a']},{ids:['b']}]);assert.equal(explicit.length,2,'independent Generate actions never merge when known');
 assert.equal(sessionState({runs:[{status:'cancelled'}]}),'done');assert.equal(sessionState({runs:[]}), 'expired');
});

test('a failed save reports what the server actually said',async()=>{
 // "Something went wrong" turned a one-line server message into a support
 // conversation three times in one week.
 assert.equal(errorReason({code:'validation_failed',status:400,message:'Caption must not exceed 2,200 characters.'}),'Caption must not exceed 2,200 characters.');
 assert.equal(errorReason({ui:true,message:'Pick a photo first.'}),'Pick a photo first.');
 assert.match(errorReason({status:500}),/HTTP 500/,'a server fault still names its status');
 assert.match(errorReason({status:409,code:'generator_state'}),/409 · generator_state/);
 assert.equal(errorReason('Offline'),'Offline');
 assert.ok(errorReason(null).length>0,'an unknown failure still says something');
 const status={textContent:''};
 const saver=autosave(async()=>{const e=new Error('Invalid proposed schedule.');e.code='validation_failed';e.status=400;throw e;},{delay:0,statusEl:status});
 saver.schedule();
 await saver.flush();
 assert.match(status.textContent,/Invalid proposed schedule\./,'the reason reaches the status line, not a generic sentence');
});
test('autosave drains edits made during an in-flight save and allows failed saves to retry',async()=>{
 let value='first',release,started,fail=false;const writes=[],status={textContent:''},gate=new Promise(r=>release=r),begin=new Promise(r=>started=r);
 const saver=autosave(async()=>{const snapshot=value;started();if(snapshot==='first')await gate;if(fail)throw new Error('offline');writes.push(snapshot);},{delay:60000,statusEl:status});
 saver.schedule();const flush=saver.flush();await begin;value='second';saver.schedule();release();await flush;assert.deepEqual(writes,['first','second']);assert.equal(saver.error,null);
 fail=true;value='third';saver.schedule();await saver.flush();assert.ok(saver.error);assert.match(status.textContent,/Could not save/);fail=false;await saver.flush();assert.deepEqual(writes,['first','second','third']);assert.equal(saver.error,null);
});

test('displayed time stays in WIB independently of browser timezone',()=>{assert.match(fmtTime('2026-11-01T05:15:00Z'),/^12[.:]15$/);});
