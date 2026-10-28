import sharp from 'sharp';

// One source of truth for the reserved brand header: the prompt promises this
// area, the collision check measures it and the composite fills it.
// Each placement is a box in canvas fractions. hero-center exists because some
// brands build the whole composition around a large centred wordmark; a logo
// confined to a corner band cannot express that layout at all.
const LOGO_BOXES={
 'top-left':{left:.06,top:.06,width:.20,height:.07},
 'top-center':{left:.40,top:.06,width:.20,height:.07},
 'top-right':{left:.74,top:.06,width:.20,height:.07},
 'bottom-left':{left:.06,top:.87,width:.20,height:.07},
 'bottom-center':{left:.40,top:.87,width:.20,height:.07},
 'bottom-right':{left:.74,top:.87,width:.20,height:.07},
 'hero-center':{left:.33,top:.38,width:.34,height:.13},
};
const LOGO_AREAS={'top-left':'upper-left','top-center':'upper-centre','top-right':'upper-right','bottom-left':'lower-left','bottom-center':'lower-centre','bottom-right':'lower-right','hero-center':'centre of the frame, as the hero element'};
export const LOGO_PLACEMENTS=Object.keys(LOGO_BOXES);
const boxOf=slot=>LOGO_BOXES[slot]||LOGO_BOXES['top-right'];
// A watermark sits back from the artwork instead of being stamped on top of it.
const WATERMARK_ALPHA=.55;
export const isHex=value=>typeof value==='string'&&/^#[0-9a-fA-F]{6}$/.test(value);

// The mark's own shape, edges and proportions are never touched: only the alpha
// is scaled, and a tint replaces colour while the original alpha decides every
// pixel's coverage. Authorised by the account owner on 2026-10-28; see
// PRODUCT_RULES.md.
async function treatCutout(buffer,{tint='',opacity=1}={}){
 if(!isHex(tint)&&opacity>=1)return buffer;
 const {data,info}=await sharp(buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const rgb=isHex(tint)?[parseInt(tint.slice(1,3),16),parseInt(tint.slice(3,5),16),parseInt(tint.slice(5,7),16)]:null;
 for(let i=0;i<data.length;i+=4){
  if(rgb){data[i]=rgb[0];data[i+1]=rgb[1];data[i+2]=rgb[2];}
  if(opacity<1)data[i+3]=Math.round(data[i+3]*opacity);
 }
 return sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer();
}
// Greyscale spread inside the reserved band. A calm wall, gradient or sky sits
// well below this; headline lettering, faces or product detail sit far above it.
const BUSY_STDEV=18, CLEARLY_CALMER=.75;
const pct=value=>Math.round(value*100);

export function protectedLayout(assets,hasVisualReference=false,logoPlacement='top-right'){
 const logo=assets.some(a=>a.role==='logo'),exact=assets.some(a=>a.role==='product');
 const logoArea=LOGO_AREAS[logoPlacement]||LOGO_AREAS['top-right'];
 return [hasVisualReference?'REFERENCE PRIORITY: Build the slide from the attached visual references. Match their observable palette, background treatment, subject scale and placement, typography hierarchy, spacing and lighting. Preserve that design language across the campaign while adapting content to this slide; avoid a generic product-ad layout.':'',
  logo?`The server will place the original logo in the ${logoArea} of the finished image, within a ${pct(boxOf(logoPlacement).width)}% wide area roughly ${pct(boxOf(logoPlacement).top)}–${pct(boxOf(logoPlacement).top+boxOf(logoPlacement).height)}% from the top.${logoPlacement==='hero-center'?' This slide is built around the mark: it is the largest element and the focal point, so hold the centre of the frame completely empty for it and let the scene, light and any subject arrange themselves around that space. Any eyebrow line sits above it and any supporting line below it, both much smaller than the mark.':''} Treat this location and any headline as one editorial header, with aligned spacing, a shared palette and a calm background that gives the supplied logo colors clear contrast. That area must contain no lettering, headline, face, hand or product detail whatsoever: start the headline below it or place it on the opposite side, because the logo is stamped over whatever you draw there. Compose the headline and scene around it.
NO SECOND BRAND MARK: the server stamps the one official logo after generation, so any brand lettering you draw becomes a duplicate in the finished slide. Do not draw the brand name, a wordmark or a logo lockup anywhere as a design element: not in a corner, header, badge, watermark, caption or sign-off. The brand name may appear only where it is genuinely printed on the physical product or its packaging within the scene. The attached style references were made by this same brand and therefore show its wordmark: that is the part the server supplies, so treat the position it occupies as reserved empty space and reproduce only its placement, scale and spacing, never its lettering.`:'',
  exact?'Products explicitly set to EXACT CUTOUT receive an original-source overlay; reserve a clean lower area for those products.':'',
  'Products in PRODUCT MOCKUP mode must be rendered naturally in the approved scene, never as a pasted photo or catalog rectangle. Preserve recognizable product details and flag any uncertainty for review.'].filter(Boolean).join(' ');
}

function slotBox(slot,width,height){
 const box=boxOf(slot),left=Math.round(width*box.left),top=Math.round(height*box.top);
 return {left,top,width:Math.max(1,Math.min(Math.round(width*box.width),width-left)),height:Math.max(1,Math.min(Math.round(height*box.height),height-top))};
}

// The image model is asked to keep the reserved header clear, but generative
// models regularly fill it with the headline anyway. Measure the finished
// background before stamping the original logo over that lettering.
export async function resolveLogoPlacement(background,requested='top-right'){
 const slot=LOGO_BOXES[requested]===undefined?'top-right':requested;
 const {width,height}=await sharp(background).metadata();
 const readings={};
 for(const name of LOGO_PLACEMENTS){
  // sharp's stats() describes the input image and ignores extract(), so read
  // the cropped pixels directly instead of measuring the whole slide.
  const pixels=await sharp(background).extract(slotBox(name,width,height)).greyscale().raw().toBuffer();
  let sum=0,squares=0;
  for(const value of pixels){sum+=value;squares+=value*value;}
  const mean=sum/pixels.length;
  readings[name]=Math.round(Math.sqrt(Math.max(0,squares/pixels.length-mean*mean))*10)/10;
 }
 const calmest=Object.keys(readings).reduce((a,b)=>readings[b]<readings[a]?b:a);
 const occupied=readings[slot]>BUSY_STDEV;
 const moved=occupied&&calmest!==slot&&readings[calmest]<readings[slot]*CLEARLY_CALMER;
 const applied=moved?calmest:slot;
 // A flat reading only means the area is quiet, not that the logo's colors
 // contrast with it. Contrast stays a human review point.
 return {requested:slot,applied,moved,occupied,still_occupied:readings[applied]>BUSY_STDEV,readings};
}

// Identity assets never pass through generative repainting in the final output.
// Prepared cutout bounds/alpha are retained; only proportional resizing/positioning.
export async function composeProtectedAssets(background,assets,{logoPlacement='top-right',logoTint='',logoSoft=false}={}){
 if(!assets.length)return {buffer:background,placements:[],logo:null};
 const meta=await sharp(background).metadata(),width=meta.width,height=meta.height;
 const logoCheck=assets.some(a=>a.role==='logo')?await resolveLogoPlacement(background,logoPlacement):null;
 const placement=logoCheck?logoCheck.applied:logoPlacement;
 const placements=[],overlays=[];
 for(const role of ['product','logo']){
  const sources=assets.filter(a=>a.role===role),n=sources.length;if(!n)continue;
  const margin=width*.06,gap=width*.025;
  const logo=role==='logo';
  const box=boxOf(placement);
  const areaLeft=logo?width*box.left:margin,areaWidth=logo?width*box.width:width-2*margin;
  const cell=(areaWidth-gap*(n-1))/n,top=height*(logo ? box.top : .34),boxHeight=height*(logo ? box.height : .60);
  for(const [i,source] of sources.entries()){
   const {data,info}=await sharp(source.path).rotate().resize({width:Math.max(1,Math.floor(cell)),height:Math.max(1,Math.floor(boxHeight)),fit:'inside',withoutEnlargement:true}).png().toBuffer({resolveWithObject:true});
   const column=placement==='hero-center'?'center':String(placement).split('-')[1];
   const left=logo&&n===1?(column==='left'?Math.round(areaLeft):column==='center'?Math.round((width-info.width)/2):Math.floor(width*.94-info.width)):Math.round(areaLeft+i*(cell+gap)+(cell-info.width)/2),y=Math.round(top+(boxHeight-info.height)/2);
   const treated=logo?await treatCutout(data,{tint:logoTint,opacity:logoSoft?WATERMARK_ALPHA:1}):data;
   overlays.push({input:treated,left,top:y});placements.push({media_id:source.media_id,role,left,top:y,width:info.width,height:info.height,...(logo?{tint:isHex(logoTint)?logoTint:null,soft:!!logoSoft}:{})});
  }
 }
 // JPEG is required for Instagram publishing. No AI generation, cropping,
 // background removal or lettering replacement touches sources. A logo may be
 // set back in opacity and flattened to one authorised tint; its shape, edges
 // and proportions are the original's.
 return {buffer:await sharp(background).composite(overlays).flatten({background:'#fff'}).jpeg({quality:100,chromaSubsampling:'4:4:4'}).toBuffer(),placements,logo:logoCheck};
}
