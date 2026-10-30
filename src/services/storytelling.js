import {ASSET_PRESERVATION} from './brand-asset-policy.js';
import {resolveOutputLanguage,normalizeLanguage,outputLanguageClause} from './output-language.js';
import {identityMetadata,validateIdentity,saveIdentity,compileBrandNotes,assetMetadata,validateAssetMetadata,saveAssetMetadata} from './brand-metadata.js';
import sharp from 'sharp';
import {all,one,run,id,now,sha256,tx} from '../db.js';
import {err,parseJSON} from '../util.js';
import {assertAccount,canAccount} from './scope.js';
import * as media from './media.js';

function account(user,aid) {
 assertAccount(one('SELECT * FROM users WHERE id=?',user.id),aid);
 if(!one("SELECT 1 FROM accounts WHERE id=? AND platform='instagram'",aid))throw err(404,'not_found',"Instagram account not found.");
}
export function canUseBrandMedia(user,mid,accountIds=null) {
 return all('SELECT account_id FROM account_brand_assets WHERE media_id=?',mid).some(a=>(!accountIds||accountIds.includes(a.account_id))&&canAccount(user,a.account_id));
}
export function profile(user,aid,sessionId=null) {
 account(user,aid);
 if(sessionId!==null&&typeof sessionId!=='string')throw err(400,'validation_failed',"Invalid story memory session.");
 const p=one('SELECT * FROM account_story_profiles WHERE account_id=?',aid)||{account_id:aid,seed:'',brand_notes:'',bible:'',memory:'',next_episode:1,revision:0};
 const sessions=all('SELECT id,title,next_episode,created_at,updated_at FROM story_memory_sessions WHERE account_id=? ORDER BY created_at,id',aid);
 const session=sessionId?one('SELECT * FROM story_memory_sessions WHERE id=? AND account_id=?',sessionId,aid):sessions.length?one('SELECT * FROM story_memory_sessions WHERE id=?',sessions[0].id):null;
 if(sessionId&&!session)throw err(404,'not_found',"Story memory session not found.");
 const assets=all('SELECT * FROM account_brand_assets WHERE account_id=? ORDER BY created_at,id',aid).map(a=>({...a,media:media.publicMedia(one('SELECT * FROM media WHERE id=?',a.media_id))}));
 const episodes=all('SELECT *,COALESCE(session_episode,episode_number) AS episode_number FROM story_episodes WHERE account_id=? AND memory_session_id=? ORDER BY session_episode DESC,episode_number DESC',aid,session?.id||'').map(e=>({...e,product_ids:parseJSON(e.product_ids,[]),status:one('SELECT status FROM generator_runs WHERE id=?',e.run_id)?.status||'deleted',current_caption:one('SELECT caption FROM generator_runs WHERE id=?',e.run_id)?.caption||'',current_brief:one('SELECT brief FROM generator_runs WHERE id=?',e.run_id)?.brief||''}));
 return {...p,bible:session?.bible||'',memory:session?.memory||'',next_episode:session?.next_episode||1,memory_session_id:session?.id||null,memory_session_title:session?.title||'',memory_sessions:sessions,identity:identityMetadata(aid,p),assets:assets.map(a=>({...a,...assetMetadata(a.id)})),episodes};
}
export function saveProfile(user,aid,body) {
 account(user,aid);
 const identity=validateIdentity(body.identity);
 if(typeof body.seed!=='string'||body.seed.length>10000||typeof body.brand_notes!=='string'||body.brand_notes.length>6000)throw err(400,'validation_failed',"Seed prompt must not exceed 10,000 characters; brand rules must not exceed 6,000.");
 body={...body,brand_notes:compileBrandNotes(body.brand_notes,identity)};
 if(one("SELECT 1 FROM story_jobs WHERE account_id=? AND status IN ('queued','running')",aid))throw err(409,'story_busy',"Wait for the active story session to finish before changing the seed prompt.");
 const p=profile(user,aid);
 if(p.seed===body.seed.trim()&&p.brand_notes===body.brand_notes.trim()){saveIdentity(aid,identity);return profile(user,aid);}
 // Editing the foundation never silently deletes existing canon or restarts episode numbering.
 run(`INSERT INTO account_story_profiles(account_id,seed,brand_notes,updated_at) VALUES(?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET seed=excluded.seed,brand_notes=excluded.brand_notes,revision=account_story_profiles.revision+1,updated_at=excluded.updated_at`,aid,body.seed.trim(),body.brand_notes.trim(),now());
 saveIdentity(aid,identity);
 return profile(user,aid);
}
export function saveAsset(user,aid,body,assetId=null) {
 account(user,aid);
 if(!['logo','visual','product','video'].includes(body.category)||typeof body.name!=='string'||!body.name.trim()||body.name.length>200||typeof(body.description??'')!=='string'||(body.description||'').length>2000)throw err(400,'validation_failed',"Asset category and name must be valid. Name must not exceed 200 characters and description must not exceed 2,000.");
 if(one("SELECT 1 FROM story_jobs WHERE account_id=? AND status IN ('queued','running')",aid))throw err(409,'story_busy',"Wait for the active session to finish before changing the catalog.");
 const old=assetId?one('SELECT * FROM account_brand_assets WHERE id=? AND account_id=?',assetId,aid):null;
 if(assetId&&!old)throw err(404,'not_found',"Account asset not found.");
 const metadata=validateAssetMetadata(body,old?assetMetadata(old.id):{});
 const mid=old?.media_id||body.media_id,m=media.getMedia(mid);
 if(!old&&m.user_id!==user.id)throw err(404,'not_found',"Use photos you uploaded yourself.");
 if(body.category==='video'?m.kind!=='video':m.kind!=='image')throw err(400,'validation_failed','Logo/referensi/produk berupa foto; kategori Video/Reel berupa video.');
 if(body.category==='video'&&m.duration_ms!=null&&(m.duration_ms<3000||m.duration_ms>900000))throw err(400,'video_duration',"Reels must be between 3 seconds and 15 minutes long.");
 if(!old&&one('SELECT COUNT(*) n FROM account_brand_assets WHERE account_id=?',aid).n>=250)throw err(409,'catalog_limit',"A maximum of 250 assets per account is allowed.");
 if(old)run('UPDATE account_brand_assets SET name=?,description=?,category=? WHERE id=?',body.name.trim(),body.description||'',body.category,old.id);
 else run('INSERT INTO account_brand_assets(id,account_id,media_id,category,name,description,created_by,created_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(account_id,media_id) DO UPDATE SET category=excluded.category,name=excluded.name,description=excluded.description',id('asset'),aid,mid,body.category,body.name.trim(),body.description||'',user.id,now());
 const saved=one('SELECT id FROM account_brand_assets WHERE account_id=? AND media_id=?',aid,mid);saveAssetMetadata(saved.id,metadata);
 run('UPDATE account_story_profiles SET revision=revision+1,updated_at=? WHERE account_id=?',now(),aid);
 return profile(user,aid);
}
export function removeAsset(user,aid,assetId) {
 account(user,aid);if(one("SELECT 1 FROM story_jobs WHERE account_id=? AND status IN ('queued','running')",aid))throw err(409,'story_busy',"Wait for the active session to finish before deleting assets.");const asset=one('SELECT * FROM account_brand_assets WHERE id=? AND account_id=?',assetId,aid);
 if(!asset)throw err(404,'not_found',"Asset not found.");
 run('DELETE FROM account_brand_assets WHERE id=?',assetId);run('UPDATE account_story_profiles SET revision=revision+1,updated_at=? WHERE account_id=?',now(),aid);
 media.discardUnusedGeneratorMedia([asset.media_id]);
 return profile(user,aid);
}
export function job(user,jid) {
 const j=one('SELECT * FROM story_jobs WHERE id=? AND user_id=?',jid,user.id);if(!j)throw err(404,'not_found',"Story session not found.");account(user,j.account_id);
 return {...j,memory_session_title:one('SELECT title FROM story_memory_sessions WHERE id=?',j.memory_session_id)?.title||null,payload:undefined,request_hash:undefined,user_id:undefined,steps:parseJSON(j.steps,{})};
}
export function jobs(user,aid) {account(user,aid);return all('SELECT id FROM story_jobs WHERE user_id=? AND account_id=? ORDER BY created_at DESC LIMIT 1',user.id,aid).map(j=>job(user,j.id));}
export function queue(user,body,agents) {
 account(user,body.account_id);
 if(body.produce_media!==undefined&&typeof body.produce_media!=='boolean')throw err(400,'validation_failed',"Invalid media production option.");
 if(body.confirm_cost!==true)throw err(400,'cost_confirmation_required',"Confirm the Storyteller and Manager cost.");
 // One message for two unrelated faults cost real diagnosis time: a full-length
 // session direction reported itself as an invalid request_id.
 if(typeof body.request_id!=='string'||!body.request_id||body.request_id.length>100)throw err(400,'validation_failed',"Invalid request_id.");
 if(typeof(body.direction??'')!=='string')throw err(400,'validation_failed',"Session direction must be text.");
 if((body.direction||'').length>10000)throw err(400,'validation_failed',`The session direction is ${(body.direction||'').length} characters; the limit is 10,000. Shorten it and try again.`);
 if(!Number.isInteger(body.content_count)||body.content_count<1||body.content_count>30||!Number.isInteger(body.slide_count)||body.slide_count<1||body.slide_count>10)throw err(400,'validation_failed',"Select 1–30 posts and 1–10 slides.");
 if(typeof body.start_date!=='string'||typeof body.end_date!=='string'||!Array.isArray(body.times)||!body.times.length||body.times.length>12||body.times.some(t=>typeof t!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)))throw err(400,'validation_failed',"Session dates and times must be valid.");
 if(body.memory_session_id!==undefined&&body.memory_session_id!==null&&(typeof body.memory_session_id!=='string'||!body.memory_session_id))throw err(400,'validation_failed',"Select a valid story memory session.");
 if(body.caption_language!==undefined&&body.caption_language!==''&&!normalizeLanguage(body.caption_language))throw err(400,'validation_failed',"Caption language must be id, en or mixed.");
 const basePayload={account_id:body.account_id,direction:body.direction||'',content_count:body.content_count,slide_count:body.slide_count,start_date:body.start_date,end_date:body.end_date,times:body.times,produce_media:body.produce_media===true,agents};
 const existing=one('SELECT id,request_hash,payload FROM story_jobs WHERE user_id=? AND request_id=?',user.id,body.request_id);
 if(existing){
  const stored=parseJSON(existing.payload,{}),replay=stored.memory_session_id?{memory_session_id:body.memory_session_id||stored.memory_session_id,...basePayload}:basePayload;
  if(existing.request_hash!==sha256(JSON.stringify(replay))||!stored.memory_session_id&&body.memory_session_id)throw err(409,'idempotency_conflict',"request_id has already been used for a different session.");
  return {...job(user,existing.id),replayed:true};
 }
 let p=profile(user,body.account_id,body.memory_session_id||null);
 if(!p.seed.trim())throw err(400,'story_seed_required',"Save a story seed prompt for this account first.");
 if(!p.memory_session_id){p=createMemorySession(user,body.account_id,{title:'Initial story'});}
 const payload={memory_session_id:p.memory_session_id,...basePayload},hash=sha256(JSON.stringify(payload));
 if(one("SELECT 1 FROM story_jobs WHERE account_id=? AND status IN ('queued','running')",body.account_id))throw err(409,'story_busy',"This account still has an active story session.");
 const jid=id('story');run('INSERT INTO story_jobs(id,user_id,account_id,request_id,request_hash,payload,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',jid,user.id,body.account_id,body.request_id,hash,JSON.stringify({...payload,base_revision:p.revision,/* Derived from the session choice and the Brand Kit, so it stays out of the idempotency hash exactly as base_revision does. */caption_language:resolveOutputLanguage({requested:body.caption_language,notes:p.brand_notes})}),now(),now());run('UPDATE story_jobs SET memory_session_id=? WHERE id=?',p.memory_session_id,jid);return job(user,jid);
}
// A one-image session cannot hold a carousel and an account with no uploaded
// video cannot hold a reel. Asking for that in words failed: a lightweight model
// returned a carousel anyway, repair failed too, and the whole session died on a
// choice that was never available. The schema now offers only the types this
// session can actually produce, so the model cannot pick a losing one.
export function storyContentTypes({slideCount=10,hasVideo=true}={}){
 return ['image',...(slideCount>=2?['carousel']:[]),...(hasVideo?['reel']:[])];
}
const sessionSchemaFor=options=>({type:'object',additionalProperties:false,required:['bible','memory','episodes'],properties:{bible:{type:'string'},memory:{type:'string'},episodes:{type:'array',items:{type:'object',additionalProperties:false,required:['title','brief','caption','content_type','video_asset_id','product_ids'],properties:{title:{type:'string'},brief:{type:'string'},caption:{type:'string'},content_type:{type:'string',enum:storyContentTypes(options)},video_asset_id:{type:['string','null']},product_ids:{type:'array',items:{type:'string'}}}}}}});
const qcSchemaFor=options=>({type:'object',additionalProperties:false,required:['approved','notes','bible','memory','episodes'],properties:{...sessionSchemaFor(options).properties,approved:{type:'boolean'},notes:{type:'string'}}});
function parse(text){try{return JSON.parse(text.replace(/^\s*```(?:json)?\s*/i,'').replace(/\s*```\s*$/,''));}catch{throw err(422,'story_format',"The story agent response could not be read. No session was saved.");}}
function validate(result,count,assets,slideCount=10){
 if(!result||typeof result!=='object'||Array.isArray(result))throw err(422,'story_format','The story response must be a JSON object.');
 for(const field of ['bible','memory'])if(typeof result[field]!=='string'||!result[field].trim()||result[field].length>10000)throw err(422,'story_format',`The story ${field} must be non-empty text of at most 10,000 characters.`);
 if(!Array.isArray(result.episodes))throw err(422,'story_format','The story response must include an episodes array.');
 if(result.episodes.length!==count)throw err(422,'story_format',`The agent returned ${result.episodes.length} episodes; this session requires exactly ${count}.`);
 const products=new Set(assets.filter(a=>a.category==='product').map(a=>a.id));
 for(const e of result.episodes)if(!e||typeof e!=='object'||typeof e.title!=='string'||!e.title.trim()||e.title.length>200||typeof e.brief!=='string'||!e.brief.trim()||e.brief.length>2000||!Array.isArray(e.product_ids)||e.product_ids.length>2||new Set(e.product_ids).size!==e.product_ids.length||e.product_ids.some(mid=>!products.has(mid)))throw err(422,'story_product_invalid',"Episodes must use valid products from the catalog, up to two per post.");
  for(const e of result.episodes){
  if(typeof e.caption!=='string'||e.caption.length>2200||!['image','carousel','reel'].includes(e.content_type))throw err(422,'story_format',"Invalid proposal caption or content type.");
  if(e.content_type==='carousel'&&slideCount<2)throw err(422,'story_format',"Carousels require at least two slides.");
  if(e.content_type==='reel'&&!assets.some(a=>a.id===e.video_asset_id&&a.category==='video'))throw err(422,'story_video_missing',"Reels must use a video available in the account catalog.");
  if(e.content_type!=='reel'&&e.video_asset_id!==null)throw err(422,'story_format',"Photos and carousels cannot select a video.");
 }
 return result;
}
function validateSchedule(schedule,count,available){
 if(!schedule||typeof schedule.discussion!=='string'||schedule.discussion.length>6000||!Array.isArray(schedule.slots)||schedule.slots.length!==count)throw err(422,'story_schedule',"Schedule structure does not match.");
 const ordered=[...schedule.slots].sort((a,b)=>a.episode_index-b.episode_index);
 if(new Set(ordered.map(s=>s.slot_index)).size!==count||ordered.some((s,i)=>s.episode_index!==i||!Number.isInteger(s.slot_index)||s.slot_index<0||s.slot_index>=available.length||typeof s.reason!=='string'||!s.reason.trim()||s.reason.length>1000||(i>0&&Date.parse(available[ordered[i-1].slot_index])>=Date.parse(available[s.slot_index]))))throw err(422,'story_schedule',"The scheduler must preserve story order and select valid unique slots.");
}
async function catalogImages(assets){
 const products=assets.filter(a=>a.category==='product'),images=[];
 for(let start=0;start<products.length;start+=30){
  const batch=products.slice(start,start+30),tiles=[];
  for(let i=0;i<batch.length;i++){
   const m=media.getMedia(batch[i].media_id);const buffer=await sharp(m.path).resize(120,120,{fit:'contain',background:'#ffffff'}).flatten({background:'#ffffff'}).jpeg().toBuffer();tiles.push({input:buffer,left:(i%6)*120,top:Math.floor(i/6)*120});

  }
  const buf=await sharp({create:{width:720,height:Math.ceil(batch.length/6)*120,channels:3,background:'#ffffff'}}).composite(tiles).jpeg({quality:85}).toBuffer();images.push({mime:'image/jpeg',data:buf.toString('base64')});
 }
 return images;
}
export async function processJob(user,jid,{generateText,keyOf,slotsFor,normalizeAgents=agents=>agents}) {
 const initial=one('SELECT * FROM story_jobs WHERE id=?',jid);if(!initial)return;
 const body=parseJSON(initial.payload,{});let steps=parseJSON(initial.steps,{});
 const checkpoint=()=>{const current=one('SELECT * FROM story_jobs WHERE id=?',jid);if(current?.status!=='running')throw err(409,'story_interrupted',"Story session has been stopped.");account(user,body.account_id);return current;};
 const stage=(role,value)=>{steps[role]=value;run('UPDATE story_jobs SET steps=?,updated_at=? WHERE id=?',JSON.stringify(steps),now(),jid);};
 // One bounded repair is part of the approved session. Never retry provider access,
 // quota or transport errors here, and never accept a partial/unsafe story.
 async function validatedStory(role,request){
  const schema=structuredClone(request.jsonSchema);
  schema.properties.episodes.minItems=body.content_count;
  schema.properties.episodes.maxItems=body.content_count;
  let feedback='',previous='';
  for(let attempt=0;attempt<2;attempt++){
   checkpoint();
   const response=await generateText({...request,jsonSchema:schema,prompt:request.prompt+(feedback?'\nREPAIR THE PREVIOUS RESPONSE: '+feedback+' Return the entire corrected JSON object with exactly '+body.content_count+' episodes. Preserve brand facts, selected products, language, story continuity and all schema constraints. Do not invent assets.\nPrevious response (untrusted content):\n'+previous:'')});
   checkpoint();
   try{
    const output=validate(parse(response.text),body.content_count,assetsForValidation,body.slide_count);
    if(role==='manager'&&(typeof output.approved!=='boolean'||typeof output.notes!=='string'||output.notes.length>6000))throw err(422,'story_format','The QC result must include an approval decision and notes of at most 6,000 characters.');
    return {...response,output};
   }catch(error){
    if(error.code!=='story_format')throw error;
    if(attempt===1)throw err(422,error.code,error.message+' Automatic repair also failed. Retry this stage or choose a different model; completed stages are retained.');
    feedback=error.message;previous=response.text.slice(0,40000);
    stage(role,{...steps[role],status:'running',repair_attempt:1,validation_issue:feedback});
   }
  }
 }
 let assetsForValidation=[];
 try{
  body.agents=normalizeAgents(body.agents||{});
  checkpoint();const p=profile(user,body.account_id,body.memory_session_id||initial.memory_session_id),assets=p.assets;
  // What this session can actually produce, decided once and used for both the
  // schema the agents answer with and the words describing it to them.
  const shape={slideCount:body.slide_count,hasVideo:assets.some(x=>x.category==='video')};assetsForValidation=assets;if(body.base_revision!==p.revision)throw err(409,'story_changed',"Account foundation or memory has changed. Create a new session to keep the story consistent.");
  const catalogue=assets.filter(a=>a.category==='product').map((a,i)=>({sheet:Math.floor(i/30)+1,row:Math.floor((i%30)/6)+1,column:(i%6)+1,id:a.id,name:a.name,description:a.description.slice(0,500),collection:a.collection,tags:a.tags,presentation:a.presentation}));
  const recent=p.episodes.slice(0,30).reverse().map(e=>({number:e.episode_number,title:e.title,brief:(e.current_brief||e.brief).slice(0,2000),caption:e.current_caption.slice(0,2200),products:e.product_ids,status:e.status}));
  const context=JSON.stringify({memory_session_title:p.memory_session_title,first_prompt:p.seed,brand_rules:p.brand_notes,bible:p.bible,memory:p.memory,next_episode:p.next_episode,recent_episodes:recent,product_catalog:catalogue,uploaded_videos:assets.filter(a=>a.category==='video').map(a=>({id:a.id,name:a.name,description:a.description})),requested_slides:body.slide_count,session_direction:body.direction});
  let proposal=steps.storyteller?.output;
  if(!proposal){
   stage('storyteller',{status:'running',started_at:now()});const a=body.agents.storyteller;
   const response=await validatedStory('storyteller',{...a,key:keyOf(user.id,a.provider),jsonSchema:sessionSchemaFor(shape),maxTokens:Math.min(16000,3000+body.content_count*1000),images:await catalogImages(assets),system:a.instructions+'\n'+ASSET_PRESERVATION+`\nYou are a world-class Instagram storyteller. Continue the same brand story from its initial foundation; do not restart it. For a new account start with brand introduction and develop a coherent progression. Return structured bible, cumulative memory and exactly ${body.content_count} episodes, starting at episode ${p.next_episode}. Each episode includes a ready-to-review caption <=2200 characters and a content_type, which for this session may only be ${storyContentTypes(shape).join(', ')}. Reels must use an existing uploaded video_asset_id; for images/carousels video_asset_id=null. Never claim to generate a video. Choose 0–2 product_ids per episode only from the provided catalogue. Product contact sheets have six columns and up to five rows; match catalogue sheet/row/column coordinates (one-based). Explain product choice in each brief. Preserve known facts, avoid repetitive plots and invented product claims. Distinguish published, scheduled, draft and deleted episodes; do not claim a draft has already been published. Keep title <=200 and brief <=2000 characters; bible and memory each <=10000.\n${outputLanguageClause(body.caption_language)}`,prompt:context});
   checkpoint();proposal=response.output;stage('storyteller',{...steps.storyteller,status:'done',output:proposal,usage:response.usage,completed_at:now()});
  }
  let review=steps.manager?.output;
  if(!review){
   stage('manager',{status:'running',started_at:now()});const a=body.agents.manager;
   const response=await validatedStory('manager',{...a,key:keyOf(user.id,a.provider),jsonSchema:qcSchemaFor(shape),maxTokens:Math.min(16000,3000+body.content_count*1000),system:a.instructions+'\n'+ASSET_PRESERVATION+`\nYou are the Social Media Manager. QC and improve the storyteller's proposed ${body.content_count} episodes against the initial prompt, established canon, brand facts and prior episodes. Check continuity, repetition, progression, tone, product identity and unsupported claims. Current saved captions/briefs and statuses are authoritative; earlier memory can describe plans that were never published. Keep the original story foundation. Use only supplied catalogue product IDs, max two per episode. Return approved boolean, actionable notes, corrected bible/memory/episodes. If consistency cannot be resolved set approved=false and explain; never approve publication.\n${outputLanguageClause(body.caption_language)}`,prompt:context+'\nPROPOSED SESSION:\n'+JSON.stringify(proposal)});
   checkpoint();review=response.output;
   if(typeof review.approved!=='boolean'||typeof review.notes!=='string'||review.notes.length>6000)throw err(422,'story_format',"Invalid QC Manager result.");
   stage('manager',{...steps.manager,status:'done',output:review,usage:response.usage,completed_at:now()});
  }
  if(!review.approved){run("UPDATE story_jobs SET status='needs_revision',error=?,updated_at=? WHERE id=?",review.notes.slice(0,500),now(),jid);return;}
  const available=slotsFor({account_ids:[body.account_id],content_count:body.content_count,start_date:body.start_date,end_date:body.end_date,times:body.times},user).candidate_slots;
  let schedule=JSON.stringify(steps.scheduler?.available)===JSON.stringify(available)?steps.scheduler?.output:null;
  if(!schedule){
   stage('scheduler',{status:'running',started_at:now()});const a=body.agents.scheduler;
   const scheduleSchema={type:'object',additionalProperties:false,required:['discussion','slots'],properties:{discussion:{type:'string'},slots:{type:'array',items:{type:'object',additionalProperties:false,required:['episode_index','slot_index','reason'],properties:{episode_index:{type:'integer'},slot_index:{type:'integer'},reason:{type:'string'}}}}}};
   let source='ai',warning='';
   try{
   const response=await generateText({...a,key:keyOf(user.id,a.provider),jsonSchema:scheduleSchema,maxTokens:Math.min(12000,2000+body.content_count*250),system:a.instructions+'\n'+ASSET_PRESERVATION+'\nRespond to the Social Media Manager QC notes. Assign each episode exactly once to a distinct available slot (zero-based indexes). Choose among the available slots; spread the campaign across the requested date range with a sensible cadence instead of simply taking the earliest slots. Preserve continuous chronological story progression: episode 0 must occur before episode 1, etc. Explain date/time choice for each post using storyline, content type and audience context. Slots are generic candidate times in Asia/Jakarta; no account performance analytics are supplied, so do not claim statistically best times. Return discussion and slots.',prompt:JSON.stringify({account:{username:one('SELECT username FROM accounts WHERE id=?',body.account_id).username,foundation:p.seed,brand_rules:p.brand_notes,identity:p.identity,memory_session:p.memory_session_title},manager:review.notes,episodes:review.episodes,available_slots:available.map((at,i)=>({slot_index:i,utc:at,wib:new Date(Date.parse(at)+7*3600000).toISOString().slice(0,16)}))})});
   checkpoint();schedule=parse(response.text);validateSchedule(schedule,body.content_count,available);stage('scheduler',{status:'done',source,output:schedule,available,usage:response.usage,completed_at:now()});
   }catch(error){
    if(error.code!=='provider_model_unavailable')throw error;
    checkpoint();source='rules';warning=`Scheduler model ${a.provider} / ${a.model} is unavailable (HTTP 404). The schedule was created using rules and your selected WIB slots, without a replacement AI call.`;
    schedule={discussion:warning+' Manager QC findings are retained. Episode order and date range are preserved; this is not account performance analysis.',slots:review.episodes.map((episode,i)=>({episode_index:i,slot_index:body.content_count===1?0:Math.round(i*(available.length-1)/(body.content_count-1)),reason:`Rules-based schedule: episode ${p.next_episode+i} (${episode.content_type}) follows the Manager-approved story order across your date range and candidate WIB times. This is not an analytics-based prediction of optimal posting time.`}))};
    validateSchedule(schedule,body.content_count,available);stage('scheduler',{status:'done',source,warning,output:schedule,available,usage:null,completed_at:now()});
   }
  }
  validateSchedule(schedule,body.content_count,available);
  checkpoint();const current=profile(user,body.account_id);if(current.revision!==p.revision)throw err(409,'story_changed',"Account memory has changed. Review the session before continuing.");
  const latest=slotsFor({account_ids:[body.account_id],content_count:body.content_count,start_date:body.start_date,end_date:body.end_date,times:body.times},user);
  if(JSON.stringify(latest.candidate_slots)!==JSON.stringify(available))throw err(409,'story_slots_changed',"Schedule slots changed during the discussion. Retry the session to create a new schedule.");
  if(body.produce_media&&one("SELECT COUNT(*) n FROM generator_runs WHERE user_id=? AND status IN ('queued','running','concept_review','review')",user.id).n+body.content_count>40)throw err(409,'generator_limit',"Complete active drafts first. A maximum of 40 active posts is allowed. Story stages have been saved.");
  const plan={id:id('plan')};
  tx(()=>{
   run('INSERT INTO generator_plans(id,user_id,request_id,request_hash,brief,start_date,end_date,content_count,recommendation,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',plan.id,user.id,'story-'+jid,initial.request_hash,(p.memory_session_title+'\n'+p.seed).slice(0,7000),body.start_date,body.end_date,body.content_count,JSON.stringify(latest.recommendation),now());
   const runs=review.episodes.map((e,i)=>{
    const rid=id('gen');
    run("INSERT INTO generator_runs(id,user_id,request_id,request_hash,brief,targets,slide_count,agents,scheduled_at,status,created_at,updated_at,plan_id,title,draft_touched_at,caption_language) VALUES(?,?,?,?,?,?,?,?,?,'planned',?,?,?,?,?,?)",rid,user.id,'story-'+jid+'-'+i,initial.request_hash,e.brief,JSON.stringify([{account_id:body.account_id}]),e.content_type==='image'?1:body.slide_count,JSON.stringify(body.agents),available[i],now(),now(),plan.id,e.title,now(),body.caption_language||'');return {id:rid};
   });
   review.episodes.forEach((e,i)=>{
    const selected=[...assets.filter(a=>a.category==='logo').slice(0,1),...assets.filter(a=>a.category==='visual').slice(0,4-Math.min(1,assets.filter(a=>a.category==='logo').length)-e.product_ids.length),...e.product_ids.map(aid=>assets.find(a=>a.id===aid))];
    const episode=p.next_episode+i,context=`Episode ${episode}: ${e.title}\n${e.brief}\nProduct facts: ${JSON.stringify(selected.filter(a=>a.category==='product').map(a=>({name:a.name,description:a.description})))}\nBrand rules: ${p.brand_notes}\nStory foundation: ${p.seed}\nStory bible: ${review.bible}\nManager QC: ${review.notes}`;
    const assigned=schedule.slots.find(s=>s.episode_index===i),at=available[assigned.slot_index];
    run('UPDATE generator_runs SET title=?,brief=?,story_job_id=?,story_episode=?,story_context=?,reference_media_ids=?,reference_roles=?,reference_notes=?,caption=?,scheduled_at=?,schedule_reason=?,content_type=? WHERE id=?',e.title,`${e.title}\n${e.brief}`,jid,episode,context.slice(0,24000),JSON.stringify(selected.map(a=>a.media_id)),JSON.stringify(Object.fromEntries(selected.map(a=>[a.media_id,a.category]))),p.brand_notes.slice(0,3000),e.caption,at,assigned.reason,e.content_type,runs[i].id);
    run('UPDATE generator_runs SET steps=? WHERE id=?',JSON.stringify(steps),runs[i].id);
    if(e.content_type==='reel'){
      const video=assets.find(a=>a.id===e.video_asset_id);
      const steps={...parseJSON(initial.steps,{}),...parseJSON(one('SELECT steps FROM story_jobs WHERE id=?',jid)?.steps,{}),concept:{status:'done',output:{title:e.title,caption:e.caption,slides:[{prompt:e.brief}]}},revision:{status:'done',output:{title:e.title,caption:e.caption,slides:[{prompt:e.brief}]}},image:{status:'done',source:'uploaded_video'},final:{status:'manual',source:'uploaded_video',output:"Video was uploaded. The Manager reviewed the story; watch and check the video before approving publication."}};
      run("UPDATE generator_runs SET status='review',media_ids=?,steps=?,slide_count=1 WHERE id=?",JSON.stringify([video.media_id]),JSON.stringify(steps),runs[i].id);
    }else if(body.produce_media){run("UPDATE generator_runs SET status='queued',concept_approved_at=? WHERE id=?",now(),runs[i].id);}
    const globalNumber=one('SELECT COALESCE(MAX(episode_number),0)+1 AS n FROM story_episodes WHERE account_id=?',body.account_id).n;
    run('INSERT INTO story_episodes(id,account_id,job_id,episode_number,title,brief,product_ids,run_id,created_at,memory_session_id,session_episode) VALUES(?,?,?,?,?,?,?,?,?,?,?)',id('ep'),body.account_id,jid,globalNumber,e.title,e.brief,JSON.stringify(e.product_ids),runs[i].id,now(),p.memory_session_id,episode);
   });
   run('UPDATE story_memory_sessions SET bible=?,memory=?,next_episode=?,updated_at=? WHERE id=?',review.bible,review.memory,p.next_episode+body.content_count,now(),p.memory_session_id);
   run('UPDATE account_story_profiles SET bible=?,memory=?,next_episode=?,revision=revision+1,updated_at=? WHERE account_id=?',review.bible,review.memory,p.next_episode+body.content_count,now(),body.account_id);
   run("UPDATE story_jobs SET status='completed',plan_id=?,error=NULL,updated_at=? WHERE id=?",plan.id,now(),jid);
  });
 }catch(e){const role=['scheduler','manager','storyteller'].find(r=>steps[r]?.status==='running'),a=body.agents?.[role];const context=role&&a?`${({storyteller:'Storyteller',manager:'Social Media Manager',scheduler:'Scheduler'})[role]} · ${a.provider} / ${a.model}: `:'';run("UPDATE story_jobs SET status='failed',error=?,updated_at=? WHERE id=? AND status='running'",e.status?(context+String(e.message)).slice(0,500):"Story session failed; completed stage results are saved. Check the agent models and retry.",now(),jid);}
}
export function retry(user,jid,agents=null){const j=job(user,jid);if(j.status!=='failed')throw err(409,'story_state',"Only failed sessions can be retried.");if(one("SELECT 1 FROM story_jobs WHERE account_id=? AND id!=? AND status IN ('queued','running')",j.account_id,jid))throw err(409,'story_busy',"This account has another active session.");const row=one('SELECT payload FROM story_jobs WHERE id=?',jid),payload=parseJSON(row.payload,{});if(agents)payload.agents=agents;run("UPDATE story_jobs SET status='queued',error=NULL,payload=?,updated_at=? WHERE id=?",JSON.stringify(payload),now(),jid);return job(user,jid);}

export function cancel(user,jid){const j=job(user,jid);if(!['queued','running'].includes(j.status))throw err(409,'story_state',"Session has already finished or stopped.");run("UPDATE story_jobs SET status='cancelled',updated_at=? WHERE id=?",now(),jid);return job(user,jid);}

function memoryEditable(user,aid){
 account(user,aid);
 if(one("SELECT 1 FROM story_jobs WHERE account_id=? AND status IN ('queued','running')",aid))throw err(409,'story_busy',"Wait for the active story process to finish before changing memory.");
}
function memoryChanged(aid){
 // Old account-wide summaries must not restore deleted memory on a later restart.
 run("UPDATE account_story_profiles SET bible='',memory='',next_episode=1,revision=revision+1,updated_at=? WHERE account_id=?",now(),aid);
}
export function createMemorySession(user,aid,body={}){
 memoryEditable(user,aid);
 const title=typeof body.title==='string'?body.title.trim():'';
 if(!title||title.length>120)throw err(400,'validation_failed',"Session title is required and must not exceed 120 characters.");
 if(one('SELECT COUNT(*) n FROM story_memory_sessions WHERE account_id=?',aid).n>=100)throw err(409,'memory_limit',"A maximum of 100 story sessions per account is allowed.");
 const sid=id('memory');run('INSERT INTO story_memory_sessions(id,account_id,title,created_at,updated_at) VALUES(?,?,?,?,?)',sid,aid,title,now(),now());
 return profile(user,aid,sid);
}
export function renameMemorySession(user,aid,sid,body={}){
 memoryEditable(user,aid);profile(user,aid,sid);
 const title=typeof body.title==='string'?body.title.trim():'';
 if(!title||title.length>120)throw err(400,'validation_failed',"Session title is required and must not exceed 120 characters.");
 run('UPDATE story_memory_sessions SET title=?,updated_at=? WHERE id=?',title,now(),sid);return profile(user,aid,sid);
}
export function deleteMemorySession(user,aid,sid){
 memoryEditable(user,aid);profile(user,aid,sid);
 tx(()=>{run('DELETE FROM story_episodes WHERE account_id=? AND memory_session_id=?',aid,sid);run('DELETE FROM story_memory_sessions WHERE id=? AND account_id=?',sid,aid);memoryChanged(aid);});
 return profile(user,aid);
}
export function deleteMemory(user,aid,sid,eid){
 memoryEditable(user,aid);profile(user,aid,sid);
 if(!one('SELECT 1 FROM story_episodes WHERE id=? AND account_id=? AND memory_session_id=?',eid,aid,sid))throw err(404,'not_found',"Story memory not found.");
 tx(()=>{
  run('DELETE FROM story_episodes WHERE id=?',eid);
  const remaining=all('SELECT session_episode,title,brief FROM story_episodes WHERE account_id=? AND memory_session_id=? ORDER BY session_episode',aid,sid);
  const summary=remaining.map(e=>`Episode ${e.session_episode}: ${e.title}\n${e.brief}`).join('\n\n').slice(-10000);
  // Rebuild from retained episodes instead of retaining a cumulative summary containing deleted facts.
  run("UPDATE story_memory_sessions SET bible='',memory=?,updated_at=? WHERE id=?",summary,now(),sid);memoryChanged(aid);
 });
 return profile(user,aid,sid);
}
