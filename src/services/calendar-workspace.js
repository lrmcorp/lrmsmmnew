import fs from 'node:fs';
import path from 'node:path';
import {one,all,run,tx,id,now,sha256} from '../db.js';
import {err,toUtcIso,parseJSON,randomToken} from '../util.js';
import {config} from '../config.js';
import {assertAccount,assertPostEdit} from './scope.js';
import {getAccount} from './accounts.js';
import * as generator from './generator.js';
import * as posts from './posts.js';
import {getDraft} from './ai-drafts.js';

// A move changes only the date and, for a private draft, its dragged destination.
// expected_updated_at rejects stale drag/undo operations instead of losing edits.
export function moveCalendarItem(user,body={}){
 if(!['post','generator'].includes(body.kind)||typeof body.id!=='string')throw err(400,'validation_failed',"Invalid calendar item.");
 const at=toUtcIso(body.scheduled_at);if(!at)throw err(400,'validation_failed',"Select a destination time.");
 if(Date.parse(at)<Date.now()-300000||Date.parse(at)>Date.now()+365*864e5)throw err(400,'validation_failed',"Schedule must be in the future and no more than one year ahead.");
 const item=body.kind==='generator'?generator.getRun(user,body.id):(assertPostEdit(user,body.id),posts.publicPost(posts.getPost(body.id)));
 const allowed=body.kind==='generator'?['planned','concept_review','review','failed']:['scheduled'];
 if(!allowed.includes(item.status))throw err(409,'calendar_state',"Item is being processed or has already been published or approved. Reload the calendar.");
 if(typeof body.expected_updated_at!=='string'||body.expected_updated_at!==item.updated_at)throw err(409,'calendar_conflict',"Content has changed. Reload before moving it.");
 const targets=structuredClone(item.targets);
 if(body.to_account_id){
  if(body.kind!=='generator'&&body.to_account_id!==body.from_account_id)throw err(409,'calendar_state',"Only drafts can be moved to another account.");
  assertAccount(user,body.to_account_id);const destination=getAccount(body.to_account_id);
  if(destination.status!=='active')throw err(409,'account_expired',"Reconnect the destination account first.");
  const target=targets.find(t=>t.account_id===body.from_account_id);if(!target)throw err(409,'calendar_conflict',"Source account has changed. Reload the calendar.");
  if(body.to_account_id!==body.from_account_id&&targets.some(t=>t.account_id===body.to_account_id))throw err(409,'calendar_conflict',"The destination account is already included in this draft.");
  target.account_id=body.to_account_id;
 }
 if(body.kind==='post'){const moved=posts.updatePost(body.id,{scheduled_at:at},user);if(moved.updated_at<=item.updated_at){run('UPDATE posts SET updated_at=? WHERE id=?',new Date(Date.parse(item.updated_at)+1).toISOString(),body.id);return posts.publicPost(posts.getPost(body.id));}return moved;}
 const stamp=new Date(Math.max(Date.now(),Date.parse(item.updated_at)+1)).toISOString();
 const changed=run("UPDATE generator_runs SET targets=?,scheduled_at=?,schedule_reason=?,draft_touched_at=?,updated_at=? WHERE id=? AND user_id=? AND updated_at=? AND status IN ('planned','concept_review','review','failed')",JSON.stringify(targets),at,'Schedule and destination edited manually in Calendar.',stamp,stamp,body.id,user.id,body.expected_updated_at);
 if(!changed.changes)throw err(409,'calendar_conflict',"Content changed while being moved. Reload the calendar.");
 return generator.getRun(user,body.id);
}

// Copy scoped media into the actor's private draft. Never schedules or publishes.
export function duplicateCalendarPost(user,postId,requestId){
 assertPostEdit(user,postId);const post=posts.publicPost(posts.getPost(postId));
 if(typeof requestId!=='string'||!requestId.trim()||requestId.length>60)throw err(400,'validation_failed',"request_id is required and must not exceed 60 characters.");
 const key='duplicate-'+requestId,hash=sha256('post:'+postId),previous=one('SELECT * FROM ai_drafts WHERE user_id=? AND request_id=?',user.id,key);
 if(previous){if(previous.request_hash!==hash)throw err(409,'idempotency_conflict',"This copy request has already been used for another post.");return{...getDraft(user,previous.id),replayed:true};}
 const ids=new Set(post.media_ids);for(const target of post.targets){for(const mid of target.media_ids||[])ids.add(mid);if(target.options?.cover_media_id)ids.add(target.options.cover_media_id);for(const part of target.options?.thread||[])if(typeof part==='object')for(const mid of part.media_ids||[])ids.add(mid);}
 const source=[...ids].map(mid=>{const media=one("SELECT * FROM media WHERE id=? AND status='ready'",mid);if(!media?.path||!fs.existsSync(media.path))throw err(409,'media_unavailable',"Original media has been cleaned up. Upload the media again before making a copy.");return media;});
 const created=[],mapping=new Map();
 try{
  for(const m of source){const mid=id('m'),file=path.join(config.mediaDir,mid);fs.copyFileSync(m.path,file,fs.constants.COPYFILE_EXCL);created.push({id:mid,path:file});mapping.set(m.id,mid);}
  const targets=post.targets.map(t=>({account_id:t.account_id,...(t.content!==null?{content:t.content}:{}),...(t.media_ids?{media_ids:t.media_ids.map(mid=>mapping.get(mid))}:{}),options:structuredClone(t.options||{})}));
  for(const target of targets){if(target.options.cover_media_id)target.options.cover_media_id=mapping.get(target.options.cover_media_id);for(const part of target.options.thread||[])if(typeof part==='object'&&part.media_ids)part.media_ids=part.media_ids.map(mid=>mapping.get(mid));}
  const draftId=id('ai');tx(()=>{for(const target of targets)assertAccount(user,target.account_id);for(let i=0;i<source.length;i++){const m=source[i],copy=created[i];run('INSERT INTO media(id,user_id,kind,mime,path,public_token,size_bytes,width,height,duration_ms,alt_text,original_name,in_library,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0,\'ready\')',copy.id,user.id,m.kind,m.mime,copy.path,randomToken(),m.size_bytes,m.width,m.height,m.duration_ms,m.alt_text,m.original_name);}
   run('INSERT INTO ai_drafts(id,user_id,request_id,request_hash,content,media_ids,targets,scheduled_at,created_at) VALUES(?,?,?,?,?,?,?,NULL,?)',draftId,user.id,key,hash,post.content,JSON.stringify(post.media_ids.map(mid=>mapping.get(mid))),JSON.stringify(targets),now());});
  return getDraft(user,draftId);
 }catch(error){for(const copy of created)fs.rmSync(copy.path,{force:true});throw error;}
}
