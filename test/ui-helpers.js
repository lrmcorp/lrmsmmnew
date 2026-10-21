import test from 'node:test';
import assert from 'node:assert/strict';
import {autosave,groupSessions,sessionState,fmtTime} from '../public/ui.js';

test('session fallback groups account-specific caption directives while explicit batches remain separate',()=>{
 const plans=[{id:'a',brief:'Brand launch\nWrite captions and on-image text in Indonesian.',start_date:'2026-11-01',end_date:'2026-11-07',content_count:2,created_at:'2026-10-21T00:00:00Z'},{id:'b',brief:'Brand launch\nWrite captions and on-image text in English.',start_date:'2026-11-01',end_date:'2026-11-07',content_count:3,created_at:'2026-10-21T00:00:01Z'}];
 const runs=[{id:'r1',plan_id:'a',status:'planned'},{id:'r2',plan_id:'b',status:'concept_review'}];
 const fallback=groupSessions(plans,runs);assert.equal(fallback.length,1);assert.equal(fallback[0].content_count,5);assert.equal(fallback[0].runs.length,2);assert.equal(sessionState(fallback[0]),'action');
 const explicit=groupSessions(plans,runs,[{ids:['a']},{ids:['b']}]);assert.equal(explicit.length,2,'independent Generate actions never merge when known');
 assert.equal(sessionState({runs:[{status:'cancelled'}]}),'done');assert.equal(sessionState({runs:[]}), 'expired');
});

test('autosave drains edits made during an in-flight save and allows failed saves to retry',async()=>{
 let value='first',release,started,fail=false;const writes=[],status={textContent:''},gate=new Promise(r=>release=r),begin=new Promise(r=>started=r);
 const saver=autosave(async()=>{const snapshot=value;started();if(snapshot==='first')await gate;if(fail)throw new Error('offline');writes.push(snapshot);},{delay:60000,statusEl:status});
 saver.schedule();const flush=saver.flush();await begin;value='second';saver.schedule();release();await flush;assert.deepEqual(writes,['first','second']);assert.equal(saver.error,null);
 fail=true;value='third';saver.schedule();await saver.flush();assert.ok(saver.error);assert.match(status.textContent,/Belum tersimpan/);fail=false;await saver.flush();assert.deepEqual(writes,['first','second','third']);assert.equal(saver.error,null);
});

test('displayed time stays in WIB independently of browser timezone',()=>{assert.match(fmtTime('2026-11-01T05:15:00Z'),/^12[.:]15$/);});
