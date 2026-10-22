// Shared named continuity picker for Brand Kit and Generator.
export function rememberedMemory(userId,accountId){try{return localStorage.getItem('lrm.memory.'+userId+'.'+accountId)||'';}catch{return '';}}
export function memorySessionPicker(ctx,profile,onChange){
 const {h,api,ui,state,toast,errMsg}=ctx,aid=profile.account_id,base='/v1/generator/accounts/'+encodeURIComponent(aid),root=h('div',{class:'memory-session-picker'});
 const remember=p=>{try{const key='lrm.memory.'+state.user.id+'.'+aid;if(p.memory_session_id)localStorage.setItem(key,p.memory_session_id);else localStorage.removeItem(key);}catch{}};
 async function perform(fn){root.inert=true;root.setAttribute('aria-busy','true');try{const p=await fn();remember(p);await onChange(p);}catch(e){toast(errMsg?errMsg(e):e.message,true);}finally{root.inert=false;root.removeAttribute('aria-busy');}}
 const select=h('select',{'aria-label':'Sesi memori cerita',onchange:()=>perform(()=>api('GET',base+'/brand?memory_session_id='+encodeURIComponent(select.value)))},!profile.memory_sessions?.length?h('option',{value:''},'Belum ada sesi cerita'):null,(profile.memory_sessions||[]).map(s=>h('option',{value:s.id,selected:s.id===profile.memory_session_id},s.title)));
 const button=(label,onclick,cls='btn sm')=>h('button',{type:'button',class:cls,onclick},label);
 const newSession=()=>perform(async()=>{const title=await ui.inputDialog({title:'Sesi cerita baru',label:'Judul sesi',placeholder:'Misalnya: Perkenalan brand atau Campaign Ramadan',multiline:false,hint:'Sesi baru dimulai dari episode 1 dengan Brand Kit akun yang sama.'});if(title===null)return profile;return api('POST',base+'/memory-sessions',{title});});
 const rename=()=>perform(async()=>{const title=await ui.inputDialog({title:'Ubah judul sesi',label:'Judul sesi',value:profile.memory_session_title,multiline:false});if(title===null)return profile;return api('PATCH',base+'/memory-sessions/'+profile.memory_session_id,{title});});
 const remove=()=>perform(async()=>{if(!await ui.confirmDialog({title:'Hapus sesi “'+profile.memory_session_title+'”?',body:'Seluruh memori dan Story Bible sesi ini dihapus. Draft, jadwal dan post yang sudah dibuat tetap tersimpan. Tindakan ini tidak dapat dibatalkan.',tone:'danger',confirmLabel:'Hapus sesi'}))return profile;return api('DELETE',base+'/memory-sessions/'+profile.memory_session_id);});
 root.append(h('label',{class:'memory-session-label'},'Sesi memori cerita',select),h('div',{class:'memory-session-actions'},button('+ Sesi baru',newSession),...(profile.memory_session_id?[button('Ubah judul',rename),button('Hapus sesi',remove,'btn sm danger')]:[])));
 return root;
}
