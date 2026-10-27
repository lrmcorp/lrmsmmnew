import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {composeProtectedAssets,protectedLayout} from '../src/services/protected-composition.js';
test('final composition uses real source pixels, preserves complete aspect bounds and never mutates files',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'protected-'));
 try{
  const logo=await sharp({create:{width:160,height:80,channels:3,background:'#1248d0'}}).png().toBuffer(),product=await sharp({create:{width:120,height:240,channels:3,background:'#15c459'}}).png().toBuffer(),background=await sharp({create:{width:1024,height:1024,channels:3,background:'#e01010'}}).png().toBuffer();
  fs.writeFileSync(path.join(dir,'logo.png'),logo);fs.writeFileSync(path.join(dir,'product.png'),product);
  const result=await composeProtectedAssets(background,[{role:'logo',media_id:'logo',path:path.join(dir,'logo.png')},{role:'product',media_id:'product',path:path.join(dir,'product.png')}]);
  assert.equal(result.placements.length,2);const logoBox=result.placements.find(p=>p.role==='logo'),productBox=result.placements.find(p=>p.role==='product');assert.equal(logoBox.width/logoBox.height,2);assert.equal(productBox.width/productBox.height,.5);
  assert.ok(logoBox.left>=1024*.64&&logoBox.left+logoBox.width<=1024*.94,'logo is a small upper-right signature, clear of a left-aligned headline');
  assert.ok(logoBox.top>=1024*.06&&logoBox.top+logoBox.height<=1024*.16,'logo remains inside the reserved quiet area');
  const headlineSpace=await sharp(result.buffer).extract({left:80,top:80,width:1,height:1}).raw().toBuffer();assert.ok(headlineSpace[0]>200&&headlineSpace[1]<30,'upper-left artwork stays unobstructed');
  assert.match(protectedLayout([{role:'logo'}]),/upper-right/);
  assert.match(protectedLayout([{role:'logo'}],true,'top-left'),/upper-left/);
  assert.doesNotMatch(protectedLayout([{role:'logo'}]),/REFERENCE PRIORITY/,'no visual reference is claimed when none was uploaded');
  assert.match(protectedLayout([{role:'logo'}],true),/REFERENCE PRIORITY/);
  assert.doesNotMatch(protectedLayout([{role:'product'}]),/original logo/,'product-only designs do not reserve a needless logo space');
  for(const [box,rgb]of[[logoBox,[18,72,208]],[productBox,[21,196,89]]]){const pixel=await sharp(result.buffer).extract({left:box.left+Math.floor(box.width/2),top:box.top+Math.floor(box.height/2),width:1,height:1}).raw().toBuffer();rgb.forEach((value,i)=>assert.ok(Math.abs(pixel[i]-value)<=3,'source pixels replace AI background'));}
  const left=await composeProtectedAssets(background,[{role:'logo',media_id:'logo',path:path.join(dir,'logo.png')}],{logoPlacement:'top-left'});
  const center=await composeProtectedAssets(background,[{role:'logo',media_id:'logo',path:path.join(dir,'logo.png')}],{logoPlacement:'top-center'});
  assert.ok(left.placements[0].left<=1024*.07,'reference-led left placement is applied');
  assert.ok(Math.abs(center.placements[0].left+center.placements[0].width/2-512)<=1,'centre placement aligns with the canvas');
  assert.deepEqual(fs.readFileSync(path.join(dir,'logo.png')),logo);assert.deepEqual(fs.readFileSync(path.join(dir,'product.png')),product);assert.deepEqual((await composeProtectedAssets(background,[])).buffer,background);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('the original logo moves off generated headline lettering instead of being stamped over it',async()=>{
 const {resolveLogoPlacement}=await import('../src/services/protected-composition.js');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'logo-collision-'));
 try{
  const bars=Array.from({length:5},(_,i)=>({input:{create:{width:280,height:14,channels:3,background:'#3a1020'}},left:30+i*6,top:70+i*20}));
  const headline=await sharp({create:{width:1024,height:1024,channels:3,background:'#f6e7dc'}}).composite(bars).png().toBuffer();
  const moved=await resolveLogoPlacement(headline,'top-left');
  assert.equal(moved.requested,'top-left');assert.equal(moved.occupied,true,'headline lettering inside the reserved header is detected');
  assert.equal(moved.moved,true);assert.notEqual(moved.applied,'top-left');assert.equal(moved.still_occupied,false,'the logo lands in a measurably clear slot');

  const calm=await sharp({create:{width:1024,height:1024,channels:3,background:'#f4d9c8'}}).png().toBuffer();
  const kept=await resolveLogoPlacement(calm,'top-left');
  assert.deepEqual([kept.applied,kept.moved,kept.occupied],['top-left',false,false],'a reference-led slot that the model honoured is never second-guessed');

  const busy=await sharp(Buffer.from(Uint8Array.from({length:1024*1024*3},(_,i)=>(i*37+((i/97)|0)*53)%256)),{raw:{width:1024,height:1024,channels:3}}).png().toBuffer();
  const nowhere=await resolveLogoPlacement(busy,'top-left');
  assert.equal(nowhere.applied,'top-left','with no calmer slot the chosen placement stands rather than churning');
  assert.equal(nowhere.still_occupied,true,'an unresolved collision stays visible for human review instead of being hidden');

  const logo=await sharp({create:{width:160,height:80,channels:3,background:'#1248d0'}}).png().toBuffer();
  fs.writeFileSync(path.join(dir,'logo.png'),logo);
  const composed=await composeProtectedAssets(headline,[{role:'logo',media_id:'logo',path:path.join(dir,'logo.png')}],{logoPlacement:'top-left'});
  assert.equal(composed.logo.moved,true);assert.ok(composed.placements[0].left>1024*.3,'the composited original follows the corrected slot, not the requested one');
  assert.equal((await composeProtectedAssets(headline,[])).logo,null,'slides with no protected assets report no logo check');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('automatic cutouts remove white/transparent margins without overwriting source bytes and flag complex backgrounds',async()=>{
 const {isolateBrandImage}=await import('../src/services/brand-image-isolation.js');
 const mark=await sharp({create:{width:30,height:20,channels:4,background:'#142a80'}}).png().toBuffer();
 const padded=await sharp({create:{width:120,height:100,channels:4,background:'#fff'}}).composite([{input:mark,left:40,top:30}]).png().toBuffer(),original=Buffer.from(padded);
 const result=await isolateBrandImage(padded);assert.equal(result.status,'prepared');assert.equal(result.removed_background,true);assert.equal(result.width,30);assert.equal(result.height,20);assert.deepEqual(padded,original);
 const pixel=await sharp(result.buffer).raw().toBuffer();assert.deepEqual([...pixel.subarray(0,4)],[20,42,128,255]);
 const transparent=await sharp({create:{width:120,height:100,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:mark,left:40,top:30}]).png().toBuffer();
 const trimmed=await isolateBrandImage(transparent);assert.equal(trimmed.width,30);assert.equal(trimmed.height,20);assert.equal(trimmed.status,'prepared');
 const complex=await sharp({create:{width:120,height:100,channels:4,background:'#c82420'}}).composite([{input:mark,left:40,top:30}]).png().toBuffer();assert.equal((await isolateBrandImage(complex)).status,'needs_review');
 const blank=await sharp({create:{width:40,height:40,channels:3,background:'#fff'}}).png().toBuffer();assert.equal((await isolateBrandImage(blank)).status,'needs_review');
});

test('logo cutouts clear enclosed white letter counters while product cutouts keep white details',async()=>{
 const {isolateBrandImage}=await import('../src/services/brand-image-isolation.js');
 const pixels=Buffer.alloc(100*100*3,255);
 for(let y=30;y<70;y++)for(let x=30;x<70;x++){const offset=(y*100+x)*3,letterHole=x>=44&&x<56&&y>=44&&y<56;pixels.fill(letterHole?255:0,offset,offset+3);}
 const source=await sharp(pixels,{raw:{width:100,height:100,channels:3}}).png().toBuffer();
 const logo=await isolateBrandImage(source,{logo:true}),product=await isolateBrandImage(source);
 assert.equal(logo.width,40);assert.equal(logo.height,40);
 const logoPixel=await sharp(logo.buffer).extract({left:20,top:20,width:1,height:1}).raw().toBuffer();
 const productPixel=await sharp(product.buffer).extract({left:20,top:20,width:1,height:1}).raw().toBuffer();
 assert.equal(logoPixel[3],0,'white inside a logo letter must show the slide background');
 assert.equal(productPixel[3],255,'white product detail must remain opaque');
 assert.equal((await sharp(logo.buffer).extract({left:4,top:4,width:1,height:1}).raw().toBuffer())[3],255,'black logo strokes remain opaque');
 const transparentPixels=Buffer.alloc(100*100*4);
 for(let y=30;y<70;y++)for(let x=30;x<70;x++){const offset=(y*100+x)*4,letterHole=x>=44&&x<56&&y>=44&&y<56;transparentPixels.fill(letterHole?255:0,offset,offset+3);transparentPixels[offset+3]=255;}
 const transparentSource=await sharp(transparentPixels,{raw:{width:100,height:100,channels:4}}).png().toBuffer();
 const transparentLogo=await isolateBrandImage(transparentSource,{logo:true});
 assert.equal((await sharp(transparentLogo.buffer).extract({left:20,top:20,width:1,height:1}).raw().toBuffer())[3],0,'enclosed white is cleared even when the source already has transparent margins');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'logo-counter-'));
 try{
  const logoPath=path.join(dir,'logo.png');fs.writeFileSync(logoPath,logo.buffer);
  const background=await sharp({create:{width:1024,height:1024,channels:3,background:'#34b578'}}).png().toBuffer();
  const composed=await composeProtectedAssets(background,[{role:'logo',media_id:'logo',path:logoPath}]);
  const box=composed.placements[0],center=await sharp(composed.buffer).extract({left:box.left+20,top:box.top+20,width:1,height:1}).raw().toBuffer();
  assert.ok(center[1]>150&&center[0]<100,'the final JPEG shows slide color through the letter counter');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
