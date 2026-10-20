// Task-first Generator layout. Provider calls remain in the existing workflows.
export function generatorStudio({h,icon,story,campaign,accountPicker,schedule,workflow,onMode,onEditBrief,getSchedule,getSelected,keyCount}) {
 let mode='storyline',storyContext=null,runs=[],lastSummarySignature='';
 const tabs={},panels={},summary=h('div',{class:'studio-session-body'});
 const canvas=h('details',{class:'studio-agents'},h('summary',{},h('span',{class:'studio-section-icon'},icon('team')),h('span',{},h('b',{},'Tim agen & model'),h('small',{},'Lihat alur kerja, pilih model, dan simpan preset')),h('span',{class:'studio-disclosure'},'Buka canvas')),workflow.element);
 const storyTarget=h('section',{class:'panel studio-story-target'},story.accountControl);
 const rail=h('ol',{class:'studio-path','aria-label':'Alur pembuatan konten'},h('li',{},h('span',{},'1'),'Akun & jadwal'),h('li',{},h('span',{},'2'),'Arahan konten'),h('li',{},h('span',{},'3'),'Review & kalender'));
 const modeTabs=h('div',{class:'studio-mode-tabs',role:'tablist','aria-label':'Mode pembuatan konten'},...['storyline','campaign'].map((id,i)=>{
  const button=h('button',{type:'button',id:'studio-tab-'+id,role:'tab','aria-controls':'studio-panel-'+id,'aria-selected':i===0?'true':'false',tabindex:i===0?0:-1,onclick:()=>chooseMode(id),onkeydown:e=>{
   if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?'storyline':e.key==='End'?'campaign':id==='storyline'?'campaign':'storyline';chooseMode(next);tabs[next].focus();
  }},icon(id==='storyline'?'sparkles':'pen'),h('span',{},h('b',{},id==='storyline'?'Storyline berkelanjutan':'Campaign baru'),h('small',{},id==='storyline'?'Lanjutkan cerita brand tersimpan':'Buat konten dari brief baru')));
  tabs[id]=button;return button;
 }));
 panels.storyline=h('div',{id:'studio-panel-storyline',role:'tabpanel','aria-labelledby':'studio-tab-storyline'},story.element);
 panels.campaign=h('div',{id:'studio-panel-campaign',role:'tabpanel','aria-labelledby':'studio-tab-campaign',hidden:true},campaign);
 const compact=matchMedia('(max-width:900px)');
 const sessionDetails=h('details',{class:'studio-session-details',open:!compact.matches},h('summary',{class:'studio-session-head'},icon('cal'),h('h2',{},'Ringkasan sesi'),h('span',{class:'studio-summary-chevron'},'⌄')),summary,h('a',{class:'btn studio-drafts-link',href:'#/generator/drafts'},'Buka Draft Konten',icon('right')));
 const adaptSummary=()=>{sessionDetails.open=!compact.matches;};compact.addEventListener('change',adaptSummary);
 const aside=h('aside',{class:'panel studio-session','aria-label':'Ringkasan sesi'},sessionDetails);
 const element=h('div',{class:'generator-studio','data-mode':mode},h('div',{class:'studio-mode-row'},modeTabs,rail),h('div',{class:'workflow-setup studio-context'},storyTarget,accountPicker,schedule),h('div',{class:'studio-editor-grid'},h('div',{class:'studio-editors'},panels.storyline,panels.campaign),aside),canvas);
 canvas.addEventListener('toggle',()=>{canvas.querySelector('.studio-disclosure').textContent=canvas.open?'Tutup canvas':'Buka canvas';});
 accountPicker.hidden=true;
 function chooseMode(next){
  mode=next;element.dataset.mode=mode;for(const id of ['storyline','campaign']){panels[id].hidden=id!==mode;tabs[id].setAttribute('aria-selected',String(id===mode));tabs[id].tabIndex=id===mode?0:-1;}
  accountPicker.hidden=mode!=='campaign';storyTarget.hidden=mode!=='storyline';onMode(mode);renderSummary();
 }
 const replace=(el,...children)=>el.replaceChildren(...children.filter(x=>x!=null&&x!==false));
 function row(label,value){return h('div',{},h('dt',{},label),h('dd',{},value));}
 const dateLabel=value=>value?new Date(value+'T00:00:00+07:00').toLocaleDateString('id-ID',{day:'numeric',month:'short',timeZone:'Asia/Jakarta'}):'Belum dipilih';
 function renderSummary(){
  const plan=getSchedule(),selected=getSelected(),profile=storyContext?.profile,account=storyContext?.account;
  const targets=mode==='storyline'?(account?['@'+account.username]:[]):selected.map(a=>'@'+a.username);
  const ready=runs.filter(r=>r.status==='review'||r.status==='concept_review').length;
  const signature=JSON.stringify({mode,plan,targets,seed:!!profile?.seed,assets:profile?.assets.map(a=>[a.category,a.id]),ready,keyCount});if(signature===lastSummarySignature)return;lastSummarySignature=signature;
  replace(summary,h('div',{class:'studio-target-summary'},h('span',{class:'studio-small-label'},mode==='storyline'?'Akun storyline':'Akun campaign'),h('b',{},targets.length?targets.join(', '):'Belum ada akun dipilih')),h('dl',{class:'studio-session-facts'},row('Rencana',`${plan.count||0} konten${mode==='campaign'?'/akun':''}`),row('Periode',dateLabel(plan.from)+' – '+dateLabel(plan.until)),row('Jam · WIB',plan.times||'Belum diatur'),row('Slide per konten',plan.slides||1)),h('button',{class:'studio-text-button',type:'button',onclick:()=>{schedule.open=true;schedule.scrollIntoView({block:'nearest'});schedule.querySelector('input')?.focus();}},'Ubah jadwal',icon('right')),
   h('div',{class:'studio-brand-summary'},h('div',{class:'studio-session-head'},icon('shield'),h('h3',{},'Brand Kit akun')),mode==='storyline'&&profile?h('div',{},h('p',{},profile.seed?'Prompt cerita tersimpan':'Prompt cerita belum diatur'),h('div',{class:'studio-brand-counts'},[['logo','Logo'],['visual','Referensi'],['product','Produk']].map(([category,label])=>h('span',{},h('b',{},profile.assets.filter(a=>a.category===category).length),' '+label))),account?h('a',{href:'#/accounts/'+encodeURIComponent(account.id)+'?tab=brand',class:'studio-text-button'},'Kelola Brand Kit',icon('right')):null):h('p',{},'Logo, referensi dan produk memakai Brand Kit masing-masing akun.')),
   h('div',{class:'studio-review-note'},icon('shield'),h('p',{},h('b',{},'Anda memegang persetujuan akhir'),h('span',{},'Konten masuk kalender setelah Anda menyetujui draft.'))),
   h('div',{class:'studio-ready-summary'},h('span',{},'Siap ditinjau'),h('b',{},ready)),keyCount?null:h('a',{href:'#/settings',class:'studio-key-warning'},'Tambahkan API key pribadi di Pengaturan AI'));
 }
 renderSummary();
 return {element,dispose(){compact.removeEventListener('change',adaptSummary);},chooseMode,mode:()=>mode,setStoryContext(value){storyContext=value;renderSummary();},setCampaignRun(value,data){runs=data;renderSummary();},update:renderSummary,showAgents(){canvas.open=true;canvas.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});},editBrief(){chooseMode('campaign');onEditBrief();}};
}
