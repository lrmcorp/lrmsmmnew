import sharp from 'sharp';

export function protectedLayout(assets){
 const logo=assets.some(a=>a.role==='logo'),exact=assets.some(a=>a.role==='product');
 return ['REFERENCE PRIORITY: Follow uploaded visual references for mood, composition, palette and lighting.',
  logo?'The server will place the original logo as a restrained signature in the upper-right of the finished image: within the rightmost 30% of the canvas, roughly 6–17% from the top. Treat this space and any headline as one editorial header, with aligned spacing, a shared palette and a calm background that gives the supplied logo colors clear contrast. Keep lettering, faces, hands and product details out of the reserved logo space. Compose the headline and scene around it; do not generate, redraw or imitate any logo elsewhere.':'',
  exact?'Products explicitly set to EXACT CUTOUT receive an original-source overlay; reserve a clean lower area for those products.':'',
  'Products in PRODUCT MOCKUP mode must be rendered naturally in the approved scene, never as a pasted photo or catalog rectangle. Preserve recognizable product details and flag any uncertainty for review.'].filter(Boolean).join(' ');
}

// Identity assets never pass through generative repainting in the final output.
// Prepared cutout bounds/alpha are retained; only proportional resizing/positioning.
export async function composeProtectedAssets(background,assets){
 if(!assets.length)return {buffer:background,placements:[]};
 const meta=await sharp(background).metadata(),width=meta.width,height=meta.height;
 const placements=[],overlays=[];
 for(const role of ['product','logo']){
  const sources=assets.filter(a=>a.role===role),n=sources.length;if(!n)continue;
  const margin=width*.06,gap=width*.025;
  const logo=role==='logo';
  const areaLeft=logo?width*.64:margin,areaWidth=logo?width*.30:width-2*margin;
  const cell=(areaWidth-gap*(n-1))/n,top=height*(logo ? .06 : .34),boxHeight=height*(logo ? .10 : .60);
  for(const [i,source] of sources.entries()){
   const {data,info}=await sharp(source.path).rotate().resize({width:Math.max(1,Math.floor(cell)),height:Math.max(1,Math.floor(boxHeight)),fit:'inside',withoutEnlargement:true}).png().toBuffer({resolveWithObject:true});
   const left=logo&&n===1?Math.floor(width*.94-info.width):Math.round(areaLeft+i*(cell+gap)+(cell-info.width)/2),y=Math.round(top+(boxHeight-info.height)/2);
   overlays.push({input:data,left,top:y});placements.push({media_id:source.media_id,role,left,top:y,width:info.width,height:info.height});
  }
 }
 // JPEG is required for Instagram publishing. No AI alteration, cropping,
 // color filter, background removal or lettering replacement touches sources.
 return {buffer:await sharp(background).composite(overlays).flatten({background:'#fff'}).jpeg({quality:100,chromaSubsampling:'4:4:4'}).toBuffer(),placements};
}
