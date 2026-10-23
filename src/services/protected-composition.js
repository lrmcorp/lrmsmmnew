import sharp from 'sharp';

export const PROTECTED_LAYOUT='REFERENCE PRIORITY: Follow uploaded visual references for mood, composition, palette and lighting. For logos and exact cutouts, generate the surrounding design/background only in their reserved regions; render mockup products naturally elsewhere. Do not generate or redraw logos. Leave a clear top band for the server to place the cleaned original logo. Only products explicitly set to EXACT CUTOUT receive an original-source overlay; reserve a clean lower area for those if present. Products in PRODUCT MOCKUP mode must be rendered naturally in the approved scene, never as a pasted photo or catalog rectangle. Preserve recognizable product details and flag any uncertainty for review.';

// Identity assets never pass through generative repainting in the final output.
// Prepared cutout bounds/alpha are retained; only proportional resizing/positioning.
export async function composeProtectedAssets(background,assets){
 if(!assets.length)return {buffer:background,placements:[]};
 const meta=await sharp(background).metadata(),width=meta.width,height=meta.height;
 const placements=[],overlays=[];
 for(const role of ['product','logo']){
  const sources=assets.filter(a=>a.role===role),n=sources.length;if(!n)continue;
  const margin=width*.06,gap=width*.025,cell=(width-2*margin-gap*(n-1))/n,top=height*(role==='logo'?.05:.34),boxHeight=height*(role==='logo'?.16:.60);
  for(const [i,source] of sources.entries()){
   const {data,info}=await sharp(source.path).rotate().resize({width:Math.max(1,Math.floor(cell)),height:Math.max(1,Math.floor(boxHeight)),fit:'inside',withoutEnlargement:true}).png().toBuffer({resolveWithObject:true});
   const left=Math.round(margin+i*(cell+gap)+(cell-info.width)/2),y=Math.round(top+(boxHeight-info.height)/2);
   overlays.push({input:data,left,top:y});placements.push({media_id:source.media_id,role,left,top:y,width:info.width,height:info.height});
  }
 }
 // JPEG is required for Instagram publishing. No AI alteration, cropping,
 // color filter, background removal or lettering replacement touches sources.
 return {buffer:await sharp(background).composite(overlays).flatten({background:'#fff'}).jpeg({quality:100,chromaSubsampling:'4:4:4'}).toBuffer(),placements};
}
