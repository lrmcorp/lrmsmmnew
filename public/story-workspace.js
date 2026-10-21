// Persistent account story setup; provider execution stays in the server worker.
import { t } from './strings.en.js';
import { readContentPrefs, writeContentPrefs, contentInstruction } from './ui.js';
export async function storyWorkspace({h,api,uploadFile,accounts,agents,dates,toast,fmtDT,confirmDialog,errMsg=()=>t('error.unknown'),fixedAccount=false,mode="setup",onContext=()=>{},onJob=()=>{}}) {
 let stopped=false,profile=null,currentJob='',lastSignature='',dirty=false,requestId='',requestSignature='',approving=false,loadedAccount='',saveTimer=0,saveInFlight=null,uploads=0,directionChanged=false;
 const account=h('select',{'aria-label':t('legacy.brand_story_account'),onchange:async()=>{clearTimeout(saveTimer);try{if(dirty&&loadedAccount)await save(loadedAccount);await loadProfile();}catch(e){account.value=loadedAccount;generate.disabled=!profile?.seed;status.textContent=errMsg(e);throw e;}}},accounts.map(a=>h('option',{value:a.id},`@${a.username}`)));
 const requested=new URLSearchParams(location.hash.split('?')[1]||'').get('story_account');if(accounts.some(a=>a.id===requested))account.value=requested;
 const seed=h('textarea',{'aria-label':t('legacy.story_seed_prompt'),maxlength:10000,rows:5,placeholder:t('legacy.describe_the_brand_audience_goals_story_style_and_direction'),oninput:markDirty,onchange:()=>save()});
 const rules=h('textarea',{'aria-label':t('legacy.brand_rules'),maxlength:6000,rows:3,placeholder:t('story.rules.placeholder'),oninput:markDirty,onchange:()=>save()});
 const direction=h('textarea',{'aria-label':t('legacy.session_direction'),maxlength:10000,rows:3,oninput:()=>{directionChanged=true;},placeholder:t('legacy.optional_focus_for_this_session_leave_empty_to_continue_from_the_story_bible')});
 const accountLanguage=h('select',{'aria-label':t('content.language.account'),onchange:()=>writeContentPrefs(account.value,{language:accountLanguage.value})},...['id','en','mixed'].map(code=>h('option',{value:code},t('content.language.'+code))));
 const allowEmoji=h('input',{type:'checkbox',checked:true,onchange:()=>writeContentPrefs(account.value,{emoji:allowEmoji.checked})});
 const sessionLanguage=h('select',{'aria-label':t('content.language.session')},h('option',{value:''},t('content.language.default')),...['id','en','mixed'].map(code=>h('option',{value:code},t('content.language.'+code))));
 const accountPrefs=h('div',{class:'content-prefs'},h('label',{},t('content.language.account'),accountLanguage),h('label',{},allowEmoji,t('content.emoji.account')));
 const agentsForSession=()=>{const prefs=readContentPrefs(account.value),instruction=contentInstruction(sessionLanguage.value||prefs.language,prefs.emoji);return Object.fromEntries(Object.entries(agents()).map(([role,agent])=>[role,{...agent,instructions:[agent.instructions,instruction].filter(Boolean).join('\n\n')}]));};
 const editorDescription=h('p',{class:'studio-editor-description'});
 const status=h('p',{class:'story-save-status',role:'status'}),assets=h('div',{class:'brand-catalog'}),history=h('div',{class:'story-memory'}),progress=h('div',{class:'story-job-progress'}),proposals=h('div',{class:'story-proposals'});
 const replace=(el,...children)=>el.replaceChildren(...children.filter(x=>x!=null&&x!==false));
 const formatSlot=iso=>iso?new Date(iso).toLocaleString('en-GB',{timeZone:'Asia/Jakarta',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})+' WIB':'';
 const label={logo:t('legacy.account_logo'),visual:t('legacy.visual_references'),product:t('legacy.product_photos'),video:t('legacy.video_reels')};
 const button=(text,onclick,primary=false,disabled=false)=>h('button',{type:'button',class:'btn'+(primary?' primary':''),onclick,disabled},text);
 function markDirty(){dirty=true;status.textContent=t('autosave.saving');clearTimeout(saveTimer);saveTimer=setTimeout(()=>save().catch(e=>{if(!stopped)status.textContent=t('autosave.failed',{reason:errMsg(e)});}),1000);}
 async function save(aid=loadedAccount||account.value){
  clearTimeout(saveTimer);if(saveInFlight)await saveInFlight;if(!aid)throw new Error(t('legacy.choose_an_instagram_account'));
  const savedSeed=seed.value,savedRules=rules.value;
  saveInFlight=api('PUT',`/v1/generator/accounts/${aid}/brand`,{seed:savedSeed,brand_notes:savedRules});
  try{const saved=await saveInFlight;if(!stopped&&aid===account.value){profile=saved;if(seed.value===savedSeed&&rules.value===savedRules)dirty=false;status.textContent=dirty?t('autosave.saving'):t('autosave.saved',{'HH:MM':new Date(profile.updated_at).toLocaleTimeString('en-GB',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})});renderHistory();}}
  finally{saveInFlight=null;}
 }
 async function loadProfile(){
  clearTimeout(saveTimer);generate.disabled=true;if(!account.value){status.textContent=t('legacy.no_active_instagram_account_is_assigned');setupLink.hidden=true;account.disabled=true;return;}status.textContent=t('legacy.loading_account_brand_kit');
  const aid=account.value,data=await api('GET',`/v1/generator/accounts/${aid}/brand`);if(stopped||aid!==account.value)return;
  loadedAccount=aid;profile=data;onContext({account:accounts.find(a=>a.id===aid),profile:data});seed.value=data.seed||'';rules.value=data.brand_notes||'';direction.value='';sessionLanguage.value='';const prefs=readContentPrefs(aid);accountLanguage.value=prefs.language;allowEmoji.checked=prefs.emoji;directionChanged=false;dirty=false;generate.disabled=!data.seed;editorDescription.textContent=data.seed?t('story.foundation.ready'):t('story.foundation.setup');status.classList.toggle('story-needs-setup',!data.seed);currentJob='';lastSignature='';proposals.replaceChildren();
  status.textContent=data.seed?t('story.foundation.saved',{n:data.next_episode}):t('story.foundation.missing');
  if(mode==='setup'){renderAssets();renderHistory();}else{setupLink.href='#/accounts/'+encodeURIComponent(aid)+'?tab=brand';await refresh();}
 }
 function renderHistory(){replace(history,h('p',{class:'muted small'},t('story.history.next',{n:profile.next_episode})),profile.bible?h('details',{},h('summary',{},t('legacy.story_bible_and_memory')),h('p',{},profile.bible),h('p',{class:'muted small'},profile.memory)):null,
  h('details',{},h('summary',{},t('story.episodes.recent',{n:profile.episodes.length})),profile.episodes.map(e=>h('p',{class:'small'},`#${e.episode_number} · ${e.title} · ${e.status}`))));}
 function renderAssets(){
  assets.replaceChildren(...Object.entries(label).map(([category,name])=>{
   const entries=profile.assets.filter(a=>a.category===category),aid=account.value;
   const file=h('input',{type:'file',hidden:true,multiple:true,accept:category==='video'?'video/mp4,video/quicktime':'image/jpeg,image/png','aria-label':t('story.asset.upload',{name}),onchange:async()=>{
    const chosen=[...file.files];if(chosen.length>20){file.value='';throw new Error(t('legacy.choose_up_to_20_files_at_once_you_can_add_another_batch_later'));}
    uploads++;add.disabled=true;account.disabled=true;
    try{for(const f of chosen){const m=await uploadFile(f,{inLibrary:false});profile=await api('POST',`/v1/generator/accounts/${aid}/assets`,{media_id:m.id,category,name:f.name.slice(0,200),description:''});}renderAssets();toast(t('legacy.brand_asset_saved'));}finally{file.value='';add.disabled=false;uploads--;account.disabled=uploads>0;}
   }});
   const add=button(t('story.asset.add',{name}),()=>file.click());
   return h('section',{class:'brand-category'},h('div',{class:'row'},h('h3',{},`${name} (${entries.length})`),add),h('p',{class:'faint small'},category==='product'?t('legacy.up_to_250_assets_per_account_name_products_so_the_storyteller_can_choose_them_accurately'):category==='video'?t('story.video.help'):t('legacy.saved_for_future_sessions_the_first_logo_and_reference_are_used_automatically_storyteller_chooses_products')),file,
    h('div',{class:'brand-asset-grid'},entries.map(a=>h('article',{class:'brand-asset'},a.media?.type==='video'?h('video',{src:a.media.url,controls:true,preload:'metadata'}):h('img',{src:a.media?.url,alt:a.name,loading:'lazy'}),h('b',{},a.name),h('p',{class:'faint small'},a.description),h('div',{class:'row'},
     button(t('story.asset.edit'),()=>{const n=h('input',{value:a.name,maxlength:200,'aria-label':t('legacy.asset_name')}),d=h('textarea',{maxlength:2000,'aria-label':t('legacy.asset_description')},a.description);const dialog=h('dialog',{class:'modal','aria-label':t('legacy.asset_details')},h('h3',{},t('legacy.asset_details')),n,d,h('div',{class:'row'},button(t('legacy.save'),async()=>{profile=await api('PATCH',`/v1/generator/accounts/${aid}/assets/${a.id}`,{category:a.category,name:n.value,description:d.value});dialog.close();renderAssets();}),button(t('legacy.cancel'),()=>dialog.close())));document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();n.focus();}),
     button(t('story.asset.delete'),async()=>{if(!await confirmDialog({title:t('story.asset.delete.title'),body:t('story.asset.delete.body'),tone:'danger',confirmLabel:t('story.asset.delete.cta')}))return;profile=await api('DELETE',`/v1/generator/accounts/${aid}/assets/${a.id}`);renderAssets();}))))));
  }));
 }
 async function refresh(){
  if(stopped||!account.value)return;const aid=account.value;
  try{
   const {data}=await api('GET',`/v1/generator/accounts/${aid}/story-jobs`);if(stopped||aid!==account.value)return;
   const j=data.find(x=>x.id===currentJob)||data[0];if(!j){onJob(null);progress.replaceChildren(h('p',{class:'muted small'},profile?.seed?t('legacy.ready_to_continue_this_account_story'):t('legacy.set_up_the_story_bible_in_the_brand_kit_first')));return;}
   currentJob=j.id;const signature=JSON.stringify(j);if(signature!==lastSignature){lastSignature=signature;onJob(j);
    replace(progress,h('h3',{},t('legacy.story_team')),h('div',{class:'story-agent-row'},[['storyteller',t('generator.agent.storyteller')],['manager',t('generator.agent.manager')],['scheduler',t('generator.agent.scheduler')]].map(([role,name])=>{const state=j.steps[role]?.status||'waiting';return h('div',{class:`story-agent ${j.status==='running'&&state==='running'?'working':''}`},h('b',{},name),h('span',{},state==='done'?(role==='scheduler'&&j.steps.scheduler?.source==='rules'?t('legacy.done_rules'):t('status.done')):j.status==='running'&&state==='running'?t('legacy.working'):j.status==='failed'&&state==='running'?t('legacy.needs_fixing'):t('legacy.waiting')));})),
      h('p',{class:'small'},({queued:t('legacy.session_queued'),running:t('legacy.ai_in_progress'),completed:t('legacy.session_saved_proposals_are_in_drafts'),cancelled:t('legacy.session_cancelled'),failed:t('legacy.session_stopped'),needs_revision:t('legacy.manager_requested_changes')})[j.status]||j.status),j.error?h('div',{class:'err-box'},t('error.provider'),h('details',{},h('summary',{},t('error.technical')),h('pre',{},j.error))):null,
      j.steps.storyteller?.output?h('details',{open:true},h('summary',{},t('legacy.storyline_saved_by_ai')),h('p',{},j.steps.manager?.output?.bible||j.steps.storyteller.output.bible),h('div',{class:'story-output-episodes'},(j.steps.manager?.output?.episodes||j.steps.storyteller.output.episodes||[]).map((e,i)=>h('article',{class:'panel'},h('b',{},`${i+1}. ${e.title||t('story.episode')}`),h('p',{},e.brief||''),h('p',{class:'muted small'},e.caption||''))))):null,
      j.steps.manager?.output?.notes?h('details',{},h('summary',{},t('legacy.social_media_manager_review')),h('p',{},j.steps.manager.output.notes)):null,
      j.steps.scheduler?.warning?h('p',{class:'story-schedule-warning',role:'status'},j.steps.scheduler.warning):null,
      j.steps.scheduler?.output?.discussion?h('details',{},h('summary',{},t('legacy.manager_to_scheduler_discussion')),h('p',{},j.steps.scheduler.output.discussion)):null,
      j.plan_id?h('a',{class:'btn primary',href:'#/generator/drafts?status=all&plan='+j.plan_id},t('legacy.review_session_proposals')):null,
      ['queued','running'].includes(j.status)?button(t('story.job.stop'),async()=>{if(!await confirmDialog({title:t('story.job.stop.title'),body:t('story.job.stop.body'),tone:'danger',confirmLabel:t('story.job.stop')}))return;await api('DELETE',`/v1/generator/story-jobs/${j.id}`);lastSignature='';await refresh();}):null,
      j.status==='failed'?button(t('story.job.retry'),async()=>{if(!await confirmDialog({title:t('story.job.retry.title'),body:t('story.job.retry.body'),tone:'cost',confirmLabel:t('story.job.retry'),details:[[t('draft.cost.runs'),t('draft.cost.failed')],[t('draft.cost.key'),t('draft.cost.provider')]]}))return;await api('POST',`/v1/generator/story-jobs/${j.id}/retry`,{confirm_cost:true,agents:agentsForSession()});lastSignature='';await refresh();}):null,
      j.status==='needs_revision'?h('p',{class:'muted small'},t('legacy.add_a_direction_and_start_a_new_session_existing_story_memory_is_unchanged')):null);
    if(j.status==='completed'){const p=await api('GET',`/v1/generator/accounts/${aid}/brand`);if(!stopped&&aid===account.value){profile=p;onContext({account:accounts.find(a=>a.id===aid),profile:p});if(!directionChanged)direction.value=p.bible||p.seed||'';status.textContent=t('story.saved.next',{n:p.next_episode});renderHistory();}}
   }
   if(j.plan_id){const {data:runs}=await api('GET','/v1/generator/runs');if(stopped||aid!==account.value)return;const ready=runs.filter(r=>r.plan_id===j.plan_id&&r.status==='review');replace(proposals,h('div',{class:'story-proposal-grid'},runs.filter(r=>r.plan_id===j.plan_id).sort((a,b)=>(a.story_episode||0)-(b.story_episode||0)).map(r=>h('a',{class:'story-proposal',href:'#/generator/drafts?status=all&plan='+j.plan_id+'&id='+r.id},r.media?.[0]?.type==='video'?h('video',{src:r.media[0].url,controls:true,preload:'metadata'}):r.media?.[0]?.url?h('img',{src:r.media[0].url,alt:r.title}):h('div',{class:'draft-card-placeholder'},r.status==='queued'||r.status==='running'?t('legacy.media_in_progress'):t('legacy.concept_saved')),h('b',{},`#${r.story_episode} ${r.title}`),h('span',{class:'pill'},r.content_type),h('p',{class:'small'},r.caption),h('small',{},formatSlot(r.scheduled_at)),h('p',{class:'faint small'},r.schedule_reason),h('small',{},r.status)))),ready.length?button(t('story.approve.ready',{n:ready.length}),async()=>{
       if(approving)return;
       if(!await confirmDialog({title:t('story.approve.title',{n:ready.length}),body:t('story.approve.body'),confirmLabel:t('story.approve.posts',{n:ready.length})}))return;
       approving=true;let approved=0;const failed=[];
       for(const r of ready){try{await api('POST',`/v1/generator/runs/${r.id}/approve`,{});approved++;}catch(e){failed.push(r.title+': '+errMsg(e));}}
       toast(t('story.approve.added',{n:approved})+(failed.length?'; '+t('story.failed.review',{n:failed.length}):''),failed.length>0);if(failed.length)status.textContent=failed.join(' · ');approving=false;await refresh();
      },true,approving):null);}
  }catch(error){if(!stopped)status.textContent=errMsg(error);}
 }
 const generate=button(t('legacy.generate_posts'),async()=>{
  if(uploads>0)throw new Error(t('legacy.wait_for_asset_uploads_to_finish'));
  if(!profile?.seed)throw new Error(t('legacy.save_a_story_seed_prompt_in_the_brand_kit_first'));
  const approved=await confirmDialog({title:t('story.job.start.title',{n:dates.count.value}),body:t('story.job.start.body'),tone:'cost',confirmLabel:t('story.job.start.cta',{n:dates.count.value}),details:[[t('draft.cost.posts'),dates.count.value],[t('draft.cost.runs'),t('draft.cost.concept')],[t('draft.cost.images'),t('draft.cost.after')],[t('draft.cost.key'),t('draft.cost.provider')]]});
  if(!approved)return;
  const body={account_id:account.value,direction:direction.value,content_count:Number(dates.count.value),slide_count:Number(dates.slides.value),start_date:dates.from.value,end_date:dates.until.value,times:dates.times.value.split(',').map(t=>t.trim()).filter(Boolean),produce_media:true,agents:agentsForSession(),confirm_cost:true};
  const sig=JSON.stringify(body);if(sig!==requestSignature){requestId=crypto.randomUUID();requestSignature=sig;}
  const j=await api('POST','/v1/generator/story-jobs',{...body,request_id:requestId});currentJob=j.id;lastSignature='';requestSignature='';await refresh();
 },true,true);
 const setupLink=h('a',{class:'btn'},t('story.brandkit'));
 const accountControl=h('div',{class:'story-account-control'},h('label',{},t('legacy.story_account'),account),setupLink);
 const foundation=h('details',{open:true},h('summary',{},t('story.foundation.title')),h('label',{},t('story.foundation.seed'),seed),h('label',{},t('story.foundation.rules'),rules),accountPrefs,status,history);
 const element=mode==='setup'?h('section',{class:'panel story-workspace'},h('h2',{},t('legacy.story_brand_kit')),h('p',{class:'muted small'},t('legacy.the_story_seed_and_brand_rules_save_automatically_assets_and_memory_are_kept_per_account_plan_sessions_in_content_generator')),foundation,h('details',{open:true},h('summary',{},t('legacy.brand_assets_and_references')),assets),h('a',{class:'btn primary',href:'#/generator?story_account='+encodeURIComponent(account.value)},t('legacy.plan_a_session_in_content_generator'))):
 h('section',{class:'panel story-workspace story-production'},h('div',{class:'story-production-header'},h('div',{},h('h2',{},t('legacy.continue_your_brand_story')),editorDescription),status),h('div',{class:'story-production-form'},h('label',{},t('legacy.session_direction'),direction),h('label',{class:'content-pref-field'},t('content.language.session'),sessionLanguage),h('div',{class:'story-production-actions'},h('p',{class:'faint small'},t('legacy.ai_agents_prepare_concepts_visuals_and_previews_publishing_waits_for_your_approval')),generate)),progress,proposals);

 await loadProfile();const timer=mode==='production'?setInterval(refresh,3000):0;
 return {element,accountControl,async dispose(){clearInterval(timer);clearTimeout(saveTimer);if(dirty)await save().catch(e=>{status.textContent=t('autosave.failed',{reason:errMsg(e)});});stopped=true;}};
}
