import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {config} from '../config.js';
const pending=new Map();
export const cutoutFiles=m=>({image:path.join(config.mediaDir,m.id+'.cutout-v1.png'),meta:path.join(config.mediaDir,m.id+'.cutout-v1.json')});
export function cutoutInfo(m){
 if(!m||m.status!=='ready')return null;const files=cutoutFiles(m);
 try{const info=JSON.parse(fs.readFileSync(files.meta,'utf8'));return fs.existsSync(files.image)?{...info,url:config.publicUrl+'/m/'+m.public_token+'.cutout.png'}:null;}catch{return null;}
}
export function removeCutout(m){for(const file of Object.values(cutoutFiles(m)))fs.rmSync(file,{force:true});fs.rmSync(cutoutFiles(m).image+'.tmp',{force:true});}
// Conservative local preparation. Only border-connected near-white background or
// existing transparent padding is removed. Original files are never overwritten.
export async function isolateBrandImage(input){
 const {data,info}=await sharp(input,{limitInputPixels:40e6}).rotate().toColourspace('srgb').resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const {width:w,height:h,channels:c}=info,n=w*h,alpha=i=>data[i*c+3],white=i=>Math.min(data[i*c],data[i*c+1],data[i*c+2])>=240&&Math.max(data[i*c],data[i*c+1],data[i*c+2])-Math.min(data[i*c],data[i*c+1],data[i*c+2])<=15;
 let transparent=false;for(let i=0;i<n;i++)if(alpha(i)<250){transparent=true;break;}
 const border=[];for(let x=0;x<w;x++){border.push(x,(h-1)*w+x);}for(let y=1;y<h-1;y++)border.push(y*w,y*w+w-1);
 const whiteBorder=border.filter(white).length/border.length,removeWhite=!transparent&&whiteBorder>=.9;
 let removed=0;
 if(removeWhite){const seen=new Uint8Array(n),queue=new Uint32Array(n);let head=0,tail=0;const add=i=>{if(!seen[i]&&white(i)){seen[i]=1;queue[tail++]=i;}};for(const i of border)add(i);
  while(head<tail){const i=queue[head++],x=i%w;data[i*c+3]=0;removed++;if(x)add(i-1);if(x<w-1)add(i+1);if(i>=w)add(i-w);if(i<n-w)add(i+w);}
 }
 let left=w,top=h,right=-1,bottom=-1;for(let i=0;i<n;i++)if(alpha(i)>8){const x=i%w,y=Math.floor(i/w);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 if(right<left)return {buffer:await sharp(input).rotate().png().toBuffer(),status:'needs_review',message:'No distinct foreground was found. Upload a transparent PNG; the original is retained.'};
 const cropped=left>0||top>0||right<w-1||bottom<h-1;
 return {buffer:await sharp(data,{raw:{width:w,height:h,channels:c}}).extract({left,top,width:right-left+1,height:bottom-top+1}).png().toBuffer(),status:transparent||removeWhite?'prepared':'needs_review',message:removeWhite?'White background removed and empty margins trimmed automatically. Review fine edges and white product details.':transparent?'Transparent margins trimmed automatically.':'Complex background: original appearance retained. Review the cutout or upload a transparent PNG.',removed_background:removed>0,trimmed:cropped,width:right-left+1,height:bottom-top+1};
}
export async function prepareBrandImage(m){
 if(m.kind!=='image')return null;const cached=cutoutInfo(m);if(cached)return cached;if(pending.has(m.id))return pending.get(m.id);
 const work=(async()=>{const prepared=await isolateBrandImage(m.source_path||m.path),files=cutoutFiles(m),{buffer,...info}=prepared;fs.writeFileSync(files.image+'.tmp',buffer);fs.renameSync(files.image+'.tmp',files.image);fs.writeFileSync(files.meta,JSON.stringify(info));return cutoutInfo(m);})();pending.set(m.id,work);
 try{return await work;}finally{pending.delete(m.id);}
}
