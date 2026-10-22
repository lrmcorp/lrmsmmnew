import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {one} from '../db.js';
import {decrypt} from '../util.js';
import {assertAccount} from './scope.js';
import {recentVisuals} from '../meta/instagram.js';

// Media URLs come exclusively from Meta. Refuse redirects and non-Meta CDN hosts.
async function thumbnail(raw) {
 const u=new URL(raw);
 if(u.protocol!=='https:'||u.username||u.password||u.port||!/(^|\.)(cdninstagram\.com|fbcdn\.net)$/.test(u.hostname))throw new Error('unsupported_cdn');
 const response=await fetch(u,{redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error('thumbnail_unavailable');
 const chunks=[];let size=0;
 try{for await(const chunk of response.body){size+=chunk.length;if(size>8*1024*1024)throw new Error('thumbnail_large');chunks.push(chunk);}}
 catch(e){await response.body?.cancel().catch(()=>{});throw e;}
 const data=await sharp(Buffer.concat(chunks),{limitInputPixels:40e6}).rotate().resize({width:768,height:768,fit:'inside',withoutEnlargement:true}).flatten({background:'#fff'}).jpeg({quality:75}).toBuffer();
 return {mime:'image/jpeg',data:data.toString('base64')};
}
const cache=new Map();
export async function instagramVisualContext(user,targets) {
 const accounts=[];const images=[];
 for(const {account_id} of targets.slice(0,3)){
  assertAccount(user,account_id);
  const account=one('SELECT * FROM accounts WHERE id=?',account_id);
  if(account.platform!=='instagram')continue;
  const entry={account_id,username:account.username,status:'unavailable',posts:[]};accounts.push(entry);
  const key=createHash('sha256').update(account.id+account.token_enc).digest('hex'),cached=cache.get(key);
  if(cached?.expires>Date.now()){const offset=images.length;images.push(...cached.images);Object.assign(entry,cached.entry,{posts:cached.entry.posts.map(p=>({...p,image_index:p.image_index+offset}))});continue;}
  const offset=images.length;
  try{
   const posts=await recentVisuals(account.platform_user_id,decrypt(account.token_enc));
   for(const post of posts){
    const raw=post.media_type==='VIDEO'?post.thumbnail_url:post.media_url||post.thumbnail_url;if(!raw)continue;
    try{const image=await thumbnail(raw);images.push(image);entry.posts.push({image_index:images.length-1,caption:String(post.caption||'').slice(0,600)});}catch{/* One unavailable CDN image must not discard other references. */}
   }
   entry.status=entry.posts.length?'available':posts.length?'images_unavailable':'empty';
  }catch{/* Never persist raw Meta errors or access tokens. */}
  for(const [k,v] of cache)if(v.expires<=Date.now())cache.delete(k);if(cache.size>=40)cache.delete(cache.keys().next().value);
  cache.set(key,{expires:Date.now()+5*60000,entry:{...entry,posts:entry.posts.map(p=>({...p,image_index:p.image_index-offset}))},images:images.slice(offset)});
 }
 return {accounts,images,note:accounts.some(a=>a.status==='available')?"Instagram profile visuals are available as style references.":"Instagram profile visuals are unavailable. Using the Brand Kit and uploaded references; do not claim to have seen the feed."};
}
