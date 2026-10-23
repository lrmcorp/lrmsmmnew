import sharp from 'sharp';

export function protectedLayout(assets,hasVisualReference=false,logoPlacement='top-right'){
 const logo=assets.some(a=>a.role==='logo'),exact=assets.some(a=>a.role==='product');
 const logoArea={'top-left':'upper-left','top-center':'upper-centre','top-right':'upper-right'}[logoPlacement]||'upper-right';
 return [hasVisualReference?'REFERENCE PRIORITY: Build the slide from the attached visual references. Match their observable palette, background treatment, subject scale and placement, typography hierarchy, spacing and lighting. Preserve that design language across the campaign while adapting content to this slide; avoid a generic product-ad layout.':'',
  logo?`The server will place the original logo in the ${logoArea} of the finished image, within a 30% wide area roughly 6–17% from the top. Treat this location and any headline as one editorial header, with aligned spacing, a shared palette and a calm background that gives the supplied logo colors clear contrast. Keep lettering, faces, hands and product details out of the reserved logo space. Compose the headline and scene around it; do not generate, redraw or imitate any logo elsewhere.`:'',
  exact?'Products explicitly set to EXACT CUTOUT receive an original-source overlay; reserve a clean lower area for those products.':'',
  'Products in PRODUCT MOCKUP mode must be rendered naturally in the approved scene, never as a pasted photo or catalog rectangle. Preserve recognizable product details and flag any uncertainty for review.'].filter(Boolean).join(' ');
}

// Identity assets never pass through generative repainting in the final output.
// Prepared cutout bounds/alpha are retained; only proportional resizing/positioning.
export async function composeProtectedAssets(background,assets,{logoPlacement='top-right'}={}){
 if(!assets.length)return {buffer:background,placements:[]};
 const meta=await sharp(background).metadata(),width=meta.width,height=meta.height;
 const placements=[],overlays=[];
 for(const role of ['product','logo']){
  const sources=assets.filter(a=>a.role===role),n=sources.length;if(!n)continue;
  const margin=width*.06,gap=width*.025;
  const logo=role==='logo';
  const areaLeft=logo?({'top-left':width*.06,'top-center':width*.35,'top-right':width*.64}[logoPlacement]??width*.64):margin,areaWidth=logo?width*.30:width-2*margin;
  const cell=(areaWidth-gap*(n-1))/n,top=height*(logo ? .06 : .34),boxHeight=height*(logo ? .10 : .60);
  for(const [i,source] of sources.entries()){
   const {data,info}=await sharp(source.path).rotate().resize({width:Math.max(1,Math.floor(cell)),height:Math.max(1,Math.floor(boxHeight)),fit:'inside',withoutEnlargement:true}).png().toBuffer({resolveWithObject:true});
   const left=logo&&n===1?(logoPlacement==='top-left'?Math.round(areaLeft):logoPlacement==='top-center'?Math.round((width-info.width)/2):Math.floor(width*.94-info.width)):Math.round(areaLeft+i*(cell+gap)+(cell-info.width)/2),y=Math.round(top+(boxHeight-info.height)/2);
   overlays.push({input:data,left,top:y});placements.push({media_id:source.media_id,role,left,top:y,width:info.width,height:info.height});
  }
 }
 // JPEG is required for Instagram publishing. No AI alteration, cropping,
 // color filter, background removal or lettering replacement touches sources.
 return {buffer:await sharp(background).composite(overlays).flatten({background:'#fff'}).jpeg({quality:100,chromaSubsampling:'4:4:4'}).toBuffer(),placements};
}
