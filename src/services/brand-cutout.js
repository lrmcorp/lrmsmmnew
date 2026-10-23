import fs from 'node:fs';
import path from 'node:path';
import {one} from '../db.js';
import {isolateBrandImage} from './brand-image-isolation.js';
import {config} from '../config.js';
const pending=new Map();
const roleOf=m=>one("SELECT 1 FROM account_brand_assets WHERE media_id=? AND category='logo' LIMIT 1",m.id)?'logo':'product';
export const cutoutFiles=(m,role=roleOf(m))=>{const version=role==='logo'?'v2-logo':'v1';return {image:path.join(config.mediaDir,m.id+'.cutout-'+version+'.png'),meta:path.join(config.mediaDir,m.id+'.cutout-'+version+'.json')};};
export function cutoutInfo(m,role,{legacyPreview=false}={}){
 if(!m||m.status!=='ready')return null;role??=roleOf(m);const files=cutoutFiles(m,role);
 const url=config.publicUrl+'/m/'+m.public_token+'.cutout.png?v='+encodeURIComponent(role==='logo'?'2-logo':'1');
 try{const info=JSON.parse(fs.readFileSync(files.meta,'utf8'));if(fs.existsSync(files.image))return {...info,url};}catch{}
 if(legacyPreview&&role==='logo'){
  const old=cutoutFiles(m,'product');
  try{const info=JSON.parse(fs.readFileSync(old.meta,'utf8'));if(fs.existsSync(old.image))return {...info,url};}catch{}
 }
 return null;
}
export function removeCutout(m){for(const role of ['logo','product']){const files=cutoutFiles(m,role);for(const file of Object.values(files))fs.rmSync(file,{force:true});fs.rmSync(files.image+'.tmp',{force:true});}}
export async function prepareBrandImage(m,role){
 if(m.kind!=='image')return null;role??=roleOf(m);const cached=cutoutInfo(m,role);if(cached)return cached;const key=m.id+':'+role;if(pending.has(key))return pending.get(key);
 const work=(async()=>{const prepared=await isolateBrandImage(m.source_path||m.path,{logo:role==='logo'}),files=cutoutFiles(m,role),{buffer,...info}=prepared;fs.writeFileSync(files.image+'.tmp',buffer);fs.renameSync(files.image+'.tmp',files.image);fs.writeFileSync(files.meta,JSON.stringify(info));return cutoutInfo(m,role);})();pending.set(key,work);
 try{return await work;}finally{pending.delete(key);}
}
