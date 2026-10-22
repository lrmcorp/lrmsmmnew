import sharp from 'sharp';

export const PROTECTED_LAYOUT='REFERENCE PRIORITY: Inspect uploaded visual references first. Match their layout rhythm, palette, typography style, spacing, lighting and overall visual direction as closely as possible without copying foreign logos, product identities or claims. Uploaded original logos/products override every style reference. Generate the surrounding design/background only: do not paint, redraw or invent a logo or product. Reserve the top band (x 5–95%, y 5–21%) for original logos, and the lower panel (x 6–94%, y 34–94%) for original product photographs, placed side by side. Keep text and decorations out of these protected panels. The server will insert unchanged originals into these areas after generation. Do not generate duplicates or remove/obscure any original detail.';

// Identity assets never pass through generative repainting in the final output.
// Full source bounds/alpha are retained; only proportional resizing/positioning.
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
