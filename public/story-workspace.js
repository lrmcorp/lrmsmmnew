// Persistent account story setup; provider execution stays in the server worker.
export async function storyWorkspace({h,api,uploadFile,accounts,agents,dates,toast,fmtDT,fixedAccount=false,mode="setup",onContext=()=>{},onJob=()=>{}}) {
 let stopped=false,profile=null,currentJob='',lastSignature='',dirty=false,requestId='',requestSignature='',approving=false,loadedAccount='',saveTimer=0,saveInFlight=null,uploads=0,directionChanged=false;
 const account=h('select',{'aria-label':'Akun Brand & Story',onchange:async()=>{clearTimeout(saveTimer);try{if(dirty&&loadedAccount)await save(loadedAccount);await loadProfile();}catch(e){account.value=loadedAccount;generate.disabled=!profile?.seed;status.textContent='Brand Kit belum dapat dimuat: '+e.message;throw e;}}},accounts.map(a=>h('option',{value:a.id},`@${a.username}`)));
 const requested=new URLSearchParams(location.hash.split('?')[1]||'').get('story_account');if(accounts.some(a=>a.id===requested))account.value=requested;
 const seed=h('textarea',{'aria-label':'Prompt cerita awal',maxlength:10000,rows:5,placeholder:'Ceritakan identitas brand, audiens, tujuan, gaya cerita, dan arah perkembangan akun dari awal.',oninput:markDirty,onchange:()=>save()});
 const rules=h('textarea',{'aria-label':'Aturan brand akun',maxlength:6000,rows:3,placeholder:'Warna, tone, tipografi, klaim yang diizinkan/dilarang, cara menggunakan logo dan foto produk.',oninput:markDirty,onchange:()=>save()});
 const direction=h('textarea',{'aria-label':'Arahan sesi cerita',maxlength:10000,rows:3,oninput:()=>{directionChanged=true;},placeholder:'Opsional: fokus sesi ini. Kosongkan untuk melanjutkan prompt awal dan memori cerita.'});
 const editorDescription=h('p',{class:'studio-editor-description'});
 const produce=h('input',{type:'checkbox',checked:true,'aria-label':'Produksi media proposal'});
 const status=h('p',{class:'story-save-status',role:'status'}),assets=h('div',{class:'brand-catalog'}),history=h('div',{class:'story-memory'}),progress=h('div',{class:'story-job-progress'}),proposals=h('div',{class:'story-proposals'});
 const replace=(el,...children)=>el.replaceChildren(...children.filter(x=>x!=null&&x!==false));
 const formatSlot=iso=>iso?new Date(iso).toLocaleString('id-ID',{timeZone:'Asia/Jakarta',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})+' WIB':'';
 const label={logo:'Logo akun',visual:'Referensi visual akun',product:'Foto produk',video:'Video / Reel'};
 const button=(text,onclick,primary=false,disabled=false)=>h('button',{type:'button',class:'btn'+(primary?' primary':''),onclick,disabled},text);
 function markDirty(){dirty=true;status.textContent='Menyimpan perubahan prompt…';clearTimeout(saveTimer);saveTimer=setTimeout(()=>save().catch(e=>{if(!stopped)status.textContent='Belum tersimpan: '+e.message;}),1200);}
 async function save(aid=loadedAccount||account.value){
  clearTimeout(saveTimer);if(saveInFlight)await saveInFlight;if(!aid)throw new Error('Pilih akun Instagram.');
  const savedSeed=seed.value,savedRules=rules.value;
  saveInFlight=api('PUT',`/v1/generator/accounts/${aid}/brand`,{seed:savedSeed,brand_notes:savedRules});
  try{const saved=await saveInFlight;if(!stopped&&aid===account.value){profile=saved;if(seed.value===savedSeed&&rules.value===savedRules)dirty=false;status.textContent=dirty?'Menyimpan perubahan berikutnya…':'✓ Prompt dan aturan brand tersimpan · '+fmtDT(profile.updated_at);renderHistory();}}
  finally{saveInFlight=null;}
 }
 async function loadProfile(){
  clearTimeout(saveTimer);generate.disabled=true;if(!account.value){status.textContent='Belum ada akun Instagram aktif yang ditugaskan.';setupLink.hidden=true;account.disabled=true;return;}status.textContent='Memuat Brand Kit akun…';
  const aid=account.value,data=await api('GET',`/v1/generator/accounts/${aid}/brand`);if(stopped||aid!==account.value)return;
  loadedAccount=aid;profile=data;onContext({account:accounts.find(a=>a.id===aid),profile:data});seed.value=data.seed||'';rules.value=data.brand_notes||'';direction.value=data.bible||data.seed||'';directionChanged=false;dirty=false;generate.disabled=!data.seed;editorDescription.textContent=data.seed?'Fondasi cerita dan aset brand Anda dipakai otomatis. Sesuaikan arahan untuk sesi ini.':'Simpan fondasi cerita di Brand Kit akun terlebih dahulu. Cukup diatur sekali untuk sesi berikutnya.';status.classList.toggle('story-needs-setup',!data.seed);currentJob='';lastSignature='';proposals.replaceChildren();
  status.textContent=data.seed?'✓ Prompt awal tersimpan · Lanjutkan dari episode '+data.next_episode:'Belum ada prompt cerita tersimpan.';
  if(mode==='setup'){renderAssets();renderHistory();}else{setupLink.href='#/accounts/'+encodeURIComponent(aid)+'?tab=brand';await refresh();}
 }
 function renderHistory(){replace(history,h('p',{class:'muted small'},`Episode berikutnya: ${profile.next_episode}. Cerita tersimpan per akun, terpisah dari draft yang dapat kedaluwarsa.`),profile.bible?h('details',{},h('summary',{},'Fondasi cerita & memori'),h('p',{},profile.bible),h('p',{class:'muted small'},profile.memory)):null,
  h('details',{},h('summary',{},`${profile.episodes.length} episode terakhir`),profile.episodes.map(e=>h('p',{class:'small'},`#${e.episode_number} · ${e.title} · ${e.status}`))));}
 function renderAssets(){
  assets.replaceChildren(...Object.entries(label).map(([category,name])=>{
   const entries=profile.assets.filter(a=>a.category===category),aid=account.value;
   const file=h('input',{type:'file',hidden:true,multiple:true,accept:category==='video'?'video/mp4,video/quicktime':'image/jpeg,image/png','aria-label':`Upload ${name}`,onchange:async()=>{
    const chosen=[...file.files];if(chosen.length>20){file.value='';throw new Error('Pilih maksimal 20 file sekaligus. Anda bisa menambahkan batch berikutnya.');}
    uploads++;add.disabled=true;account.disabled=true;
    try{for(const f of chosen){const m=await uploadFile(f,{inLibrary:false});profile=await api('POST',`/v1/generator/accounts/${aid}/assets`,{media_id:m.id,category,name:f.name.slice(0,200),description:''});}renderAssets();toast('Aset akun tersimpan');}finally{file.value='';add.disabled=false;uploads--;account.disabled=uploads>0;}
   }});
   const add=button('+ '+name,()=>file.click());
   return h('section',{class:'brand-category'},h('div',{class:'row'},h('h3',{},`${name} (${entries.length})`),add),h('p',{class:'faint small'},category==='product'?'Katalog besar didukung: hingga 250 aset total per akun. Beri nama/deskripsi produk agar pilihan Storyteller lebih akurat.':category==='video'?'Video unggahan dapat dipilih sebagai Reel. Agen tidak membuat video AI.':'Disimpan untuk sesi berikutnya. Logo dan referensi pertama digunakan otomatis; produk dipilih Storyteller.'),file,
    h('div',{class:'brand-asset-grid'},entries.map(a=>h('article',{class:'brand-asset'},a.media?.type==='video'?h('video',{src:a.media.url,controls:true,preload:'metadata'}):h('img',{src:a.media?.url,alt:a.name,loading:'lazy'}),h('b',{},a.name),h('p',{class:'faint small'},a.description),h('div',{class:'row'},
     button('Edit',()=>{const n=h('input',{value:a.name,maxlength:200,'aria-label':'Nama aset'}),d=h('textarea',{maxlength:2000,'aria-label':'Deskripsi aset'},a.description);const dialog=h('dialog',{class:'modal','aria-label':'Detail aset'},h('h3',{},'Detail aset'),n,d,h('div',{class:'row'},button('Simpan',async()=>{profile=await api('PATCH',`/v1/generator/accounts/${aid}/assets/${a.id}`,{category:a.category,name:n.value,description:d.value});dialog.close();renderAssets();}),button('Batal',()=>dialog.close())));document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();n.focus();}),
     button('Hapus',async()=>{if(!confirm('Hapus aset ini dari katalog akun? File yang masih dipakai draft/post tetap disimpan.'))return;profile=await api('DELETE',`/v1/generator/accounts/${aid}/assets/${a.id}`);renderAssets();}))))));
  }));
 }
 async function refresh(){
  if(stopped||!account.value)return;const aid=account.value;
  try{
   const {data}=await api('GET',`/v1/generator/accounts/${aid}/story-jobs`);if(stopped||aid!==account.value)return;
   const j=data.find(x=>x.id===currentJob)||data[0];if(!j){onJob(null);progress.replaceChildren(h('p',{class:'muted small'},profile?.seed?'Siap melanjutkan cerita akun ini.':'Simpan fondasi brand akun terlebih dahulu.'));return;}
   currentJob=j.id;const signature=JSON.stringify(j);if(signature!==lastSignature){lastSignature=signature;onJob(j);
    replace(progress,h('h3',{},'Tim Storyline'),h('div',{class:'story-agent-row'},[['storyteller','Storyteller'],['manager','Social Media Manager'],['scheduler','Scheduler']].map(([role,name])=>{const state=j.steps[role]?.status||'waiting';return h('div',{class:`story-agent ${j.status==='running'&&state==='running'?'working':''}`},h('b',{},name),h('span',{},state==='done'?(role==='scheduler'&&j.steps.scheduler?.source==='rules'?'Selesai · aturan':'Selesai ✓'):j.status==='running'&&state==='running'?'Bekerja…':j.status==='failed'&&state==='running'?'Perlu perbaikan':'Menunggu'));})),
      h('p',{class:'small'},({queued:'Sesi dalam antrean',running:'Agen bekerja',completed:'Sesi tersimpan; proposal ada di Draft Konten',cancelled:'Sesi dibatalkan',failed:'Sesi terhenti',needs_revision:'Manager meminta perbaikan'})[j.status]||j.status),j.error?h('p',{class:'err-box'},j.error):null,
      j.steps.storyteller?.output?h('details',{open:true},h('summary',{},'Storyline tersimpan dari agen'),h('p',{},j.steps.manager?.output?.bible||j.steps.storyteller.output.bible),h('div',{class:'story-output-episodes'},(j.steps.manager?.output?.episodes||j.steps.storyteller.output.episodes||[]).map((e,i)=>h('article',{class:'panel'},h('b',{},`${i+1}. ${e.title||'Episode'}`),h('p',{},e.brief||''),h('p',{class:'muted small'},e.caption||''))))):null,
      j.steps.manager?.output?.notes?h('details',{},h('summary',{},'QC Social Media Manager'),h('p',{},j.steps.manager.output.notes)):null,
      j.steps.scheduler?.warning?h('p',{class:'story-schedule-warning',role:'status'},j.steps.scheduler.warning):null,
      j.steps.scheduler?.output?.discussion?h('details',{},h('summary',{},'Diskusi Manager → Scheduler'),h('p',{},j.steps.scheduler.output.discussion)):null,
      j.plan_id?h('a',{class:'btn primary',href:'#/generator/drafts?status=all&plan='+j.plan_id},'Review proposal sesi ini'):null,
      ['queued','running'].includes(j.status)?button('Batalkan sesi',async()=>{if(!confirm('Hentikan sesi? Panggilan provider yang sudah berjalan mungkin tetap ditagihkan.'))return;await api('DELETE',`/v1/generator/story-jobs/${j.id}`);lastSignature='';await refresh();}):null,
      j.status==='failed'?button('Coba ulang sesi',async()=>{await api('POST',`/v1/generator/story-jobs/${j.id}/retry`,{confirm_cost:true,agents:agents()});lastSignature='';await refresh();}):null,
      j.status==='needs_revision'?h('p',{class:'muted small'},'Tambahkan arahan sesi lalu generate sesi baru. Memori lama belum diubah.'):null);
    if(j.status==='completed'){const p=await api('GET',`/v1/generator/accounts/${aid}/brand`);if(!stopped&&aid===account.value){profile=p;onContext({account:accounts.find(a=>a.id===aid),profile:p});if(!directionChanged)direction.value=p.bible||p.seed||'';status.textContent='✓ Cerita tersimpan · Lanjutkan dari episode '+p.next_episode;renderHistory();}}
   }
   if(j.plan_id){const {data:runs}=await api('GET','/v1/generator/runs');if(stopped||aid!==account.value)return;const ready=runs.filter(r=>r.plan_id===j.plan_id&&r.status==='review');replace(proposals,h('div',{class:'story-proposal-grid'},runs.filter(r=>r.plan_id===j.plan_id).sort((a,b)=>(a.story_episode||0)-(b.story_episode||0)).map(r=>h('a',{class:'story-proposal',href:'#/generator/drafts?status=all&plan='+j.plan_id+'&id='+r.id},r.media?.[0]?.type==='video'?h('video',{src:r.media[0].url,controls:true,preload:'metadata'}):r.media?.[0]?.url?h('img',{src:r.media[0].url,alt:r.title}):h('div',{class:'draft-card-placeholder'},r.status==='queued'||r.status==='running'?'Media sedang dibuat':'Konsep tersimpan'),h('b',{},`#${r.story_episode} ${r.title}`),h('span',{class:'pill'},r.content_type),h('p',{class:'small'},r.caption),h('small',{},formatSlot(r.scheduled_at)),h('p',{class:'faint small'},r.schedule_reason),h('small',{},r.status)))),ready.length?button(`Setujui ${ready.length} proposal siap`,async()=>{
       if(approving)return;
       if(!confirm(`Setujui ${ready.length} konten yang siap untuk terbit otomatis pada tanggal/jam yang ditampilkan?`))return;
       approving=true;let approved=0;const failed=[];
       for(const r of ready){try{await api('POST',`/v1/generator/runs/${r.id}/approve`,{});approved++;}catch(e){failed.push(r.title+': '+e.message);}}
       toast(`${approved} konten masuk Kalender Konten`+(failed.length?`; ${failed.length} perlu diperiksa`:''),failed.length>0);if(failed.length)status.textContent=failed.join(' · ');approving=false;await refresh();
      },true,approving):null);}
  }catch(error){if(!stopped)status.textContent=error.message||'Status cerita belum dapat dimuat.';}
 }
 const generate=button('Generate / Lanjutkan storyline',async()=>{
  if(uploads>0)throw new Error('Tunggu semua aset selesai diunggah dahulu.');
  if(!profile?.seed)throw new Error('Simpan prompt cerita awal di Brand Kit & Cerita akun terlebih dahulu.');
  const body={account_id:account.value,direction:direction.value,content_count:Number(dates.count.value),slide_count:Number(dates.slides.value),start_date:dates.from.value,end_date:dates.until.value,times:dates.times.value.split(',').map(t=>t.trim()).filter(Boolean),produce_media:produce.checked,agents:agents(),confirm_cost:true};
  const sig=JSON.stringify(body);if(sig!==requestSignature){requestId=crypto.randomUUID();requestSignature=sig;}
  const j=await api('POST','/v1/generator/story-jobs',{...body,request_id:requestId});currentJob=j.id;lastSignature='';requestSignature='';await refresh();
 },true,true);
 const setupLink=h('a',{class:'btn'},'Brand Kit');
 const accountControl=h('div',{class:'story-account-control'},h('label',{},'Akun storyline',account),setupLink);
 const foundation=h('details',{open:true},h('summary',{},'Fondasi cerita akun'),h('label',{},'Prompt cerita awal',seed),h('label',{},'Aturan brand & arahan penggunaan aset',rules),button('Simpan fondasi cerita',async()=>{await save();toast('Fondasi cerita tersimpan');}),status,history);
 const element=mode==='setup'?h('section',{class:'panel story-workspace'},h('h2',{},'Cerita Berkelanjutan & Brand Kit'),h('p',{class:'muted small'},'Prompt awal dan aturan brand disimpan otomatis. Aset dan memori cerita tersimpan per akun. Rencanakan dan buat sesi konten di Sosmed Generator.'),foundation,h('details',{open:true},h('summary',{},'Aset Brand & Referensi — tersimpan untuk akun ini'),assets),h('a',{class:'btn primary',href:'#/generator?story_account='+encodeURIComponent(account.value)},'Rencanakan sesi di Sosmed Generator')):
 h('section',{class:'panel story-workspace story-production'},h('div',{class:'story-production-header'},h('div',{},h('h2',{},'Lanjutkan cerita brand Anda'),editorDescription),status),h('div',{class:'story-production-form'},h('label',{},'Arahan storyline',direction),h('div',{class:'story-production-actions'},h('label',{class:'check'},produce,'Buat media setelah QC Manager'),h('p',{class:'faint small'},'Menggunakan API key pribadi dan model tim agen Anda.'),generate)),progress,proposals);

 await loadProfile();const timer=mode==='production'?setInterval(refresh,3000):0;
 return {element,accountControl,dispose(){stopped=true;clearInterval(timer);clearTimeout(saveTimer);}};
}
