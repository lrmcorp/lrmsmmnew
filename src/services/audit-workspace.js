// Read-only context for the Owner audit workspace. Never returns tokens or raw payloads.
import {one,all} from '../db.js';
import {listAudit} from './audit.js';
const json=(value,fallback)=>{try{return JSON.parse(value)||fallback;}catch{return fallback;}};
export function auditContext(event){
 const ids=new Set(),type=event.target_type,id=event.target_id;
 if(event.details?.account_id)ids.add(event.details.account_id);
 if(Array.isArray(event.details?.account_ids))for(const aid of event.details.account_ids)if(typeof aid==='string')ids.add(aid);
 if(type==='account'&&id)ids.add(id);
 let session=null;
 if(type==='post'&&id)for(const row of all('SELECT account_id FROM post_targets WHERE post_id=?',id))ids.add(row.account_id);
 if(type==='generator_run'&&id){const row=one('SELECT id,targets,plan_id,title FROM generator_runs WHERE id=?',id);if(row){if(!Array.isArray(event.details?.account_ids))for(const t of json(row.targets,[]))if(t.account_id)ids.add(t.account_id);session={id:row.plan_id||row.id,title:row.title||null};}}
 if(type==='generator_plan'&&id){const rows=all('SELECT targets FROM generator_runs WHERE plan_id=?',id);for(const row of rows)if(!Array.isArray(event.details?.account_ids))for(const t of json(row.targets,[]))if(t.account_id)ids.add(t.account_id);session={id,title:null};}
 if(type==='story_job'&&id){const row=one('SELECT account_id,plan_id FROM story_jobs WHERE id=?',id);if(row){ids.add(row.account_id);if(row.plan_id)session={id:row.plan_id,title:null};}}
 const actor=event.user_id?one('SELECT id,name,email FROM users WHERE id=?',event.user_id):null;
 return {...event,actor:actor?{id:actor.id,name:actor.name||actor.email}:null,account_ids:[...ids],session};
}
export function listAuditWorkspace(query={}){const page=listAudit({...query,before:query.cursor||query.before});return {...page,data:page.data.map(auditContext)};}
