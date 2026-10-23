import fs from 'node:fs';
import path from 'node:path';
import {isolateBrandImage} from './brand-image-isolation.js';
import {config} from '../config.js';
const pending=new Map();
export const cutoutFiles=m=>({image:path.join(config.mediaDir,m.id+'.cutout-v1.png'),meta:path.join(config.mediaDir,m.id+'.cutout-v1.json')});
export function cutoutInfo(m){
 if(!m||m.status!=='ready')return null;const files=cutoutFiles(m);
 try{const info=JSON.parse(fs.readFileSync(files.meta,'utf8'));return fs.existsSync(files.image)?{...info,url:config.publicUrl+'/m/'+m.public_token+'.cutout.png'}:null;}catch{return null;}
}
export function removeCutout(m){for(const file of Object.values(cutoutFiles(m)))fs.rmSync(file,{force:true});fs.rmSync(cutoutFiles(m).image+'.tmp',{force:true});}
export async function prepareBrandImage(m){
 if(m.kind!=='image')return null;const cached=cutoutInfo(m);if(cached)return cached;if(pending.has(m.id))return pending.get(m.id);
 const work=(async()=>{const prepared=await isolateBrandImage(m.source_path||m.path),files=cutoutFiles(m),{buffer,...info}=prepared;fs.writeFileSync(files.image+'.tmp',buffer);fs.renameSync(files.image+'.tmp',files.image);fs.writeFileSync(files.meta,JSON.stringify(info));return cutoutInfo(m);})();pending.set(m.id,work);
 try{return await work;}finally{pending.delete(m.id);}
}
