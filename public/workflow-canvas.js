// Original LRMsmm node workspace. Layout is editable; execution follows the app's fixed workflow.
export function workflowCanvas({ h, userId, nodes, edges, actions = [], history }) {
  const key = `lrmsmm.workflow-layout.v1.${userId}`;
  const defaults = Object.fromEntries(nodes.map(n => [n.id, { x:n.x, y:n.y }]));
  let positions = structuredClone(defaults), scale = 0.8, tx = 35, ty = 40;
  let mode = matchMedia('(max-width:767px)').matches ? 'list' : 'canvas';
  let saved;
  try { saved = JSON.parse(localStorage.getItem(key)); } catch {}
  if (saved) for (const n of nodes) { const p=saved[n.id]; if(p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x>=0 && p.y>=0 && p.x<10000 && p.y<10000)positions[n.id]=p; }
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.classList.add('workflow-wires');svg.setAttribute('aria-hidden','true');
  const plane=h('div',{class:'workflow-plane'},svg);
  const viewport=h('div',{class:'workflow-viewport',tabindex:0,'aria-label':'Kanvas workflow. Geser latar untuk pan, gunakan tombol zoom atau Ctrl dan scroll.'},plane);
  const map=document.createElementNS('http://www.w3.org/2000/svg','svg');map.classList.add('workflow-minimap');map.setAttribute('viewBox','0 0 2800 1800');map.setAttribute('aria-hidden','true');
  const elements=new Map(),states=new Map(),paths=new Map();
  let drag=null,raf=0,disposed=false;
  const zoomLabel=h('span',{class:'workflow-zoom-label'},'80%');
  const info=h('span',{class:'workflow-status',role:'status'},'Siap · 4 agen');
  const save=()=>{try{localStorage.setItem(key,JSON.stringify(positions));}catch{}};
  function transform(){if(mode==='canvas'){viewport.scrollLeft=0;viewport.scrollTop=0;}plane.style.transform=`translate(${tx}px,${ty}px) scale(${scale})`;zoomLabel.textContent=Math.round(scale*100)+'%';viewport.style.backgroundSize=`${24*scale}px ${24*scale}px`;viewport.style.backgroundPosition=`${tx}px ${ty}px`;}
  function bounds(){return {w:Math.max(...nodes.map(n=>positions[n.id].x+(elements.get(n.id)?.offsetWidth||n.width))),h:Math.max(...nodes.map(n=>positions[n.id].y+(elements.get(n.id)?.offsetHeight||400)))};}
  function draw(){
    raf=0;if(disposed)return;
    for(const n of nodes){const el=elements.get(n.id);el.style.left=positions[n.id].x+'px';el.style.top=positions[n.id].y+'px';}
    const b=bounds();plane.style.width=(b.w+400)+'px';plane.style.height=(b.h+400)+'px';svg.setAttribute('width',String(b.w+400));svg.setAttribute('height',String(b.h+400));
    for(const edge of edges){const a=elements.get(edge.from),z=elements.get(edge.to);const x=positions[edge.from].x+a.offsetWidth,y=positions[edge.from].y+57,ex=positions[edge.to].x,ey=positions[edge.to].y+57;const bend=Math.max(80,Math.abs(ex-x)*.5);paths.get(edge).setAttribute('d',`M ${x} ${y} C ${x+bend} ${y},${ex-bend} ${ey},${ex} ${ey}`);}
    map.replaceChildren();map.setAttribute('viewBox',`-20 -20 ${b.w+40} ${b.h+40}`);
    for(const n of nodes){const rect=document.createElementNS(svg.namespaceURI,'rect');rect.setAttribute('x',positions[n.id].x);rect.setAttribute('y',positions[n.id].y);rect.setAttribute('width',elements.get(n.id).offsetWidth);rect.setAttribute('height',elements.get(n.id).offsetHeight);rect.setAttribute('rx','12');rect.setAttribute('class',states.get(n.id)==='running'?'working':'');map.append(rect);}
    const view=document.createElementNS(svg.namespaceURI,'rect');view.setAttribute('class','map-view');view.setAttribute('x',String(-tx/scale));view.setAttribute('y',String(-ty/scale));view.setAttribute('width',String(viewport.clientWidth/scale));view.setAttribute('height',String(viewport.clientHeight/scale));map.append(view);
  }
  const schedule=()=>{if(!raf)raf=requestAnimationFrame(draw);};
  function fit(){if(mode==='list')return;const b=bounds();scale=Math.max(.18,Math.min(.9,(viewport.clientWidth-80)/b.w,(viewport.clientHeight-80)/b.h));tx=35;ty=35;transform();schedule();}
  function zoom(delta,cx=viewport.clientWidth/2,cy=viewport.clientHeight/2){const next=Math.max(.18,Math.min(1.5,scale*delta));tx=cx-(cx-tx)*next/scale;ty=cy-(cy-ty)*next/scale;scale=next;transform();schedule();}
  function focusNode(id,moveFocus=true){if(mode==='list'){elements.get(id)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth',block:'center'});return;}const p=positions[id],el=elements.get(id);scale=.85;tx=viewport.clientWidth/2-(p.x+el.offsetWidth/2)*scale;ty=45-p.y*scale;transform();schedule();if(moveFocus)el.focus({preventScroll:true});}
  for(const edge of edges){const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('class','workflow-wire');path.dataset.to=edge.to;svg.append(path);paths.set(edge,path);}
  for(const node of nodes){
    const badge=h('span',{class:'workflow-node-state'},node.role?'Menunggu':edges.some(e=>e.from===node.id)?'Input':'Output');
    const header=h('div',{class:'workflow-node-head',role:'button',tabindex:0,'aria-label':`Pindahkan node ${node.title}. Tombol panah untuk menggeser.`},h('i',{class:'workflow-node-dot'}),h('span',{},node.title),badge);
    const result=h('div',{class:'workflow-node-result'});
    const el=h('section',{class:'workflow-node',tabindex:-1,'data-node':node.id,style:{width:node.width+'px','--node-accent':node.color||'#7fa89c'}},header,h('span',{class:'workflow-port input','aria-hidden':'true'}),h('div',{class:'workflow-node-body'},node.subtitle?h('p',{class:'workflow-node-description'},node.subtitle):null,node.content,result),h('span',{class:'workflow-port output','aria-hidden':'true'}));
    node.badge=badge;node.result=result;elements.set(node.id,el);plane.append(el);
    header.addEventListener('pointerdown',e=>{if(mode!=='canvas'||e.button!==0)return;e.preventDefault();drag={kind:'node',id:node.id,x:e.clientX,y:e.clientY,start:{...positions[node.id]}};header.setPointerCapture(e.pointerId);el.classList.add('dragging');});
    header.addEventListener('pointermove',e=>{if(drag?.kind!=='node'||drag.id!==node.id)return;positions[node.id]={x:Math.max(0,drag.start.x+(e.clientX-drag.x)/scale),y:Math.max(0,drag.start.y+(e.clientY-drag.y)/scale)};schedule();});
    const end=()=>{if(drag?.kind==='node'&&drag.id===node.id){drag=null;el.classList.remove('dragging');save();}};
    header.addEventListener('pointerup',end);header.addEventListener('pointercancel',end);
    header.addEventListener('keydown',e=>{const moves={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};if(mode!=='canvas'||!moves[e.key])return;e.preventDefault();const [x,y]=moves[e.key],d=e.shiftKey?50:10;positions[node.id].x=Math.max(0,positions[node.id].x+x*d);positions[node.id].y=Math.max(0,positions[node.id].y+y*d);save();schedule();});
  }
  viewport.addEventListener('focusin',e=>{const node=e.target.closest('.workflow-node');if(node&&mode==='canvas')requestAnimationFrame(()=>{if(!disposed&&(viewport.scrollLeft||viewport.scrollTop))focusNode(node.dataset.node,false);});});
  viewport.addEventListener('pointerdown',e=>{if(mode!=='canvas'||e.button!==0||e.target.closest('.workflow-node'))return;drag={kind:'pan',x:e.clientX,y:e.clientY,tx,ty};viewport.setPointerCapture(e.pointerId);viewport.classList.add('panning');});
  viewport.addEventListener('pointermove',e=>{if(drag?.kind!=='pan')return;tx=drag.tx+e.clientX-drag.x;ty=drag.ty+e.clientY-drag.y;transform();schedule();});
  const stopPan=()=>{if(drag?.kind==='pan'){drag=null;viewport.classList.remove('panning');}};
  viewport.addEventListener('pointerup',stopPan);viewport.addEventListener('pointercancel',stopPan);
  viewport.addEventListener('wheel',e=>{if(mode!=='canvas'||!e.ctrlKey)return;e.preventDefault();const rect=viewport.getBoundingClientRect();zoom(e.deltaY>0?.9:1.1,e.clientX-rect.left,e.clientY-rect.top);},{passive:false});
  viewport.addEventListener('keydown',e=>{if(e.target!==viewport)return;if(e.key==='0'){e.preventDefault();fit();}if(['+','=','-'].includes(e.key)){e.preventDefault();zoom(e.key==='-'?.8:1.25);}});
  const modeButton=h('button',{class:'btn sm',onclick:()=>{mode=mode==='canvas'?'list':'canvas';root.dataset.mode=mode;modeButton.textContent=mode==='canvas'?'Tampilan daftar':'Tampilan kanvas';requestAnimationFrame(()=>{transform();schedule();});}},mode==='canvas'?'Tampilan daftar':'Tampilan kanvas');
  const root=h('div',{class:'workflow-workspace','data-mode':mode},
    h('div',{class:'workflow-toolbar'},h('div',{class:'workflow-brand'},h('b',{},'Sosmed Workflow'),info),h('div',{class:'row'},...actions,modeButton)),
    h('div',{class:'workflow-navigation'},nodes.map(n=>h('button',{class:'workflow-jump',onclick:()=>focusNode(n.id)},n.title))),
    h('div',{class:'workflow-stage'},viewport,h('div',{class:'workflow-map'},map),h('div',{class:'workflow-tools'},h('button',{class:'btn sm','aria-label':'Zoom keluar',onclick:()=>zoom(.8)},'−'),zoomLabel,h('button',{class:'btn sm','aria-label':'Zoom masuk',onclick:()=>zoom(1.25)},'+'),h('button',{class:'btn sm',onclick:fit},'Fit'),h('button',{class:'btn sm',onclick:()=>{positions=structuredClone(defaults);save();fit();}},'Reset layout'))),
    h('div',{class:'workflow-footer'},h('span',{},'Geser judul node · Geser latar untuk pan · Ctrl + scroll untuk zoom'),h('span',{},'Alur tetap: Konsep → Revisi → Gambar → Review → Draft')),
    history?h('details',{class:'workflow-history'},h('summary',{},'Antrean & riwayat campaign'),history):null);
  const observer=new ResizeObserver(schedule);for(const el of elements.values())observer.observe(el);observer.observe(viewport);
  requestAnimationFrame(()=>{transform();schedule();});
  return {element:root,focusNode,fit,
    setRun(r){info.textContent=r?`${({concept_review:'Tinjau konsep',planned:'Rencana',queued:'Antrean',running:'Agen bekerja',review:'Siap ditinjau',failed:'Perlu tindakan',cancelled:'Dibatalkan',drafted:'Draf dibuat',approved:'Disetujui'})[r.status]||r.status} · ${Object.values(r.steps).filter(s=>s.status==='done').length}/${r.story_job_id?7:4} tahap selesai`:'Siap · 4 agen';for(const n of nodes){if(!n.role){if(n.id==='result')n.badge.textContent=r?.status==='concept_review'?'Tinjau konsep':r?.status==='review'?'Siap review':r?.status==='approved'?'Disetujui':r?.media?.length?'Preview':'Menunggu hasil';continue;}const step=r?.steps[n.role];const status=step?.status==='manual'?'manual':step?.status==='done'?'done':r?.status==='running'&&step?.status==='running'?'running':r?.status==='failed'&&step?.status==='running'?'failed':'waiting';states.set(n.id,status);elements.get(n.id).dataset.state=status;n.badge.textContent=status==='manual'?'Tinjau video':status==='done'?'Selesai ✓':status==='running'?'Bekerja…':status==='failed'?'Gagal':'Menunggu';const expanded=n.result.querySelector('details')?.open; n.result.replaceChildren(...(step?.output?[h('small',{class:'workflow-run-model'},step.source==='uploaded_video'?'Video unggahan · Perlu pemeriksaan manusia':`${r.agents[n.role].provider} · ${r.agents[n.role].model}`),h('details',{open:expanded},h('summary',{},'Hasil agen'),h('pre',{},typeof step.output==='string'?step.output:JSON.stringify(step.output,null,2)))]:[]));if(n.role==='image'&&r?.media?.some(m=>m.url)){n.result.append(h('div',{class:'workflow-image-result'},r.media.filter(m=>m.url).slice(-2).map(m=>h('img',{src:m.url,alt:'Hasil Image Creator'}))));}}for(const edge of edges)paths.get(edge).classList.toggle('active',states.get(edge.to)==='running'&&(edge.from!=='reference'||r?.reference_media_ids?.length>0));schedule();},
    dispose(){disposed=true;observer.disconnect();if(raf)cancelAnimationFrame(raf);}
  };
}
