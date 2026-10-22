// Real SQLite round-trip and a new process; no Meta/provider requests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const reading=process.env.BRAND_METADATA_READ==='1';
const directory=reading?process.env.DATA_DIR:fs.mkdtempSync(path.join(os.tmpdir(),'brand-metadata-'));
Object.assign(process.env,{DATA_DIR:directory,META_MOCK:'1',DISABLE_WORKER:'1'});
try{
 const {db,run,one}=await import('../src/db.js');
 const story=await import('../src/services/storytelling.js');
 const {brandReadiness}=await import('../public/brand-readiness.js');
 if(reading){
  const user=one('SELECT * FROM users WHERE email=?','brand-owner@test.id'),p=story.profile(user,'brand-account');
  assert.equal(p.identity.essence,'Little details. Beautiful feelings.');assert.equal(p.identity.caption_language,'en');assert.equal(p.identity.emoji,false);
  assert.deepEqual(p.identity.tones,['Warm','Subtle']);const product=p.assets.find(x=>x.category==='product');
  assert.ok(p.brand_notes.startsWith('x'.repeat(6000)),'legacy notes survive a restart');
  assert.equal(product.collection,'Everyday');assert.deepEqual(product.tags,['pink','glossy']);assert.equal(product.description,'Pink lembut, finishing glossy');
  assert.equal(brandReadiness(p).completeness,100);assert.match(p.brand_notes,/Write captions and on-image text in English/);assert.match(p.brand_notes,/Final Reviewer must flag/);
  db.close();console.log('PASS restart persistence');
 }else{
  const {createUser}=await import('../src/auth.js'),{encrypt}=await import('../src/util.js'),media=await import('../src/services/media.js'),sharp=(await import('sharp')).default;
  const {saveCompany,deleteCompany}=await import('../src/services/companies.js');
  const user=createUser({email:'brand-owner@test.id',password:'fixture-password',name:'Owner',role:'owner'}),rep=createUser({email:'brand-rep@test.id',password:'fixture-password',name:'Representative',role:'rep'}),company=saveCompany(null,'Brand company');
  run('INSERT INTO accounts(id,platform,platform_user_id,username,name,token_enc,company_id) VALUES(?,?,?,?,?,?,?)','brand-account','instagram','brand-fixture','brand.fixture','Brand fixture',encrypt('fixture-token'),company.id);
  assert.equal(one("SELECT COUNT(*) n FROM sqlite_master WHERE name='brand_identity_metadata'").n,0,'side table is lazy');
  let p=story.saveProfile(user,'brand-account',{seed:'# Brand\n## Esensi\nLittle details. Beautiful feelings.\n## Tone\nWarm, Subtle\n## Boleh\nCahaya natural\n## Jangan\nWarna neon',brand_notes:''});
  assert.equal(p.identity.essence,'Little details. Beautiful feelings.');assert.deepEqual(p.identity.tones,['Warm','Subtle']);assert.equal(p.identity.do_rules,'Cahaya natural');assert.equal(p.identity.dont_rules,'Warna neon');
  assert.equal(brandReadiness(p).completeness,25);assert.equal(brandReadiness(p).ok,true,'seed-only generation allowed');assert.equal(brandReadiness(p).missing.length,3);
  p=story.saveProfile(user,'brand-account',{seed:p.seed,brand_notes:p.brand_notes,identity:{...p.identity,caption_language:'en',emoji:false}});
  for(const [category,color] of [['logo','#ffffff'],['visual','#dddddd'],['product','#ffb6c1']]){
   const file=await sharp({create:{width:128,height:128,channels:3,background:color}}).png().toBuffer(),m=await media.saveBuffer(user.id,file,{inLibrary:false,originalName:category+'.png'});
   p=story.saveAsset(user,'brand-account',{media_id:m.id,category,name:category==='product'?'Blush Petal':category,description:category==='product'?'Pink lembut, finishing glossy':'',collection:category==='product'?'Everyday':'',tags:category==='product'?['pink','glossy','pink']:[]});
  }
  assert.equal(brandReadiness(p).completeness,100);
  const product=p.assets.find(x=>x.category==='product');assert.deepEqual(product.tags,['pink','glossy']);
  assert.throws(()=>story.saveAsset(user,'brand-account',{category:'product',name:'',collection:'',tags:[]},product.id));
  assert.throws(()=>story.saveAsset(user,'brand-account',{category:'product',name:'Product',tags:['x'.repeat(61)]},product.id));
  assert.throws(()=>story.saveProfile(user,'brand-account',{seed:p.seed,brand_notes:'',identity:{caption_language:'unsupported'}}));
  const legacyNotes='x'.repeat(6000);
  p=story.saveProfile(user,'brand-account',{seed:p.seed,brand_notes:legacyNotes,identity:p.identity});
  assert.ok(p.brand_notes.startsWith(legacyNotes),'full legacy notes remain intact when structured identity is added');
  assert.match(p.brand_notes,/\[LRM BRAND IDENTITY\]/);
  assert.throws(()=>story.saveProfile(user,'brand-account',{seed:p.seed,brand_notes:legacyNotes+'x',identity:p.identity}),/6,000/);
  assert.throws(()=>story.profile(rep,'brand-account'),'unassigned Representative cannot read Brand Kit');
  assert.throws(()=>deleteCompany(company.id),'nonempty company cannot be deleted');const empty=saveCompany(null,'Empty company');deleteCompany(empty.id);assert.equal(one('SELECT id FROM companies WHERE id=?',empty.id),undefined);
  db.close();const restart=spawnSync(process.execPath,[fileURLToPath(import.meta.url)],{env:{...process.env,BRAND_METADATA_READ:'1'},encoding:'utf8'});assert.equal(restart.status,0,restart.stderr||restart.stdout);assert.match(restart.stdout,/PASS restart persistence/);console.log('PASS Brand metadata: lazy migration, legacy narrative, structured identity, language/emoji rules, collections/tags, recommended completeness, validation, account scope, company delete and process restart');
 }
}finally{if(!reading)fs.rmSync(directory,{recursive:true,force:true});}
