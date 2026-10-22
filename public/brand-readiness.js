// Same four Brand Kit completeness slots for accounts, detail and Generator.
// Missing recommended assets never block generation; a saved seed is required.
export function brandReadiness(profile){
 const p=profile||{},assets=p.assets||[];
 const items=[{id:'identity',label:'Identity & tone',ok:!!p.seed?.trim(),required:true},{id:'logo',label:'Logo',ok:assets.some(x=>x.category==='logo')},{id:'visual',label:'Visual references',ok:assets.some(x=>x.category==='visual')},{id:'product',label:'Product photos',ok:assets.some(x=>x.category==='product')}];
 const missing=items.filter(x=>!x.ok);return {completeness:items.filter(x=>x.ok).length*25,ok:items[0].ok,items,missing,next:missing[0]||null,pending:!profile};
}
