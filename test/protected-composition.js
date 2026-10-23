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
  assert.doesNotMatch(protectedLayout([{role:'product'}]),/original logo/,'product-only designs do not reserve a needless logo space');
  for(const [box,rgb]of[[logoBox,[18,72,208]],[productBox,[21,196,89]]]){const pixel=await sharp(result.buffer).extract({left:box.left+Math.floor(box.width/2),top:box.top+Math.floor(box.height/2),width:1,height:1}).raw().toBuffer();rgb.forEach((value,i)=>assert.ok(Math.abs(pixel[i]-value)<=3,'source pixels replace AI background'));}
  assert.deepEqual(fs.readFileSync(path.join(dir,'logo.png')),logo);assert.deepEqual(fs.readFileSync(path.join(dir,'product.png')),product);assert.deepEqual((await composeProtectedAssets(background,[])).buffer,background);
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
