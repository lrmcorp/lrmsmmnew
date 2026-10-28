import sharp from 'sharp';

// One source of truth for the reserved brand header: the prompt promises this
// area, the collision check measures it and the composite fills it.
const LOGO_BAND={height:.10,width:.30};
const LOGO_SLOTS={'top-left':.06,'top-center':.35,'top-right':.64,'bottom-left':.06,'bottom-center':.35,'bottom-right':.64};
const LOGO_ROWS={top:.06,bottom:.84};
const LOGO_AREAS={'top-left':'upper-left','top-center':'upper-centre','top-right':'upper-right','bottom-left':'lower-left','bottom-center':'lower-centre','bottom-right':'lower-right'};
export const LOGO_PLACEMENTS=Object.keys(LOGO_SLOTS);
// A watermark sits back from the artwork instead of being stamped on top of it.
const WATERMARK_ALPHA=.55;
const bandTop=slot=>LOGO_ROWS[String(slot).startsWith('bottom')?'bottom':'top'];
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
  logo?`The server will place the original logo in the ${logoArea} of the finished image, within a ${pct(LOGO_BAND.width)}% wide area roughly ${pct(bandTop(logoPlacement))}–${pct(bandTop(logoPlacement)+LOGO_BAND.height)}% from the top. Treat this location and any headline as one editorial header, with aligned spacing, a shared palette and a calm background that gives the supplied logo colors clear contrast. That area must contain no lettering, headline, face, hand or product detail whatsoever: start the headline below it or place it on the opposite side, because the logo is stamped over whatever you draw there. Compose the headline and scene around it.
NO SECOND BRAND MARK: the server stamps the one official logo after generation, so any brand lettering you draw becomes a duplicate in the finished slide. Do not draw the brand name, a wordmark or a logo lockup anywhere as a design element: not in a corner, header, badge, watermark, caption or sign-off. The brand name may appear only where it is genuinely printed on the physical product or its packaging within the scene. The attached style references were made by this same brand and therefore show its wordmark: that is the part the server supplies, so treat the position it occupies as reserved empty space and reproduce only its placement, scale and spacing, never its lettering.`:'',
  exact?'Products explicitly set to EXACT CUTOUT receive an original-source overlay; reserve a clean lower area for those products.':'',
  'Products in PRODUCT MOCKUP mode must be rendered naturally in the approved scene, never as a pasted photo or catalog rectangle. Preserve recognizable product details and flag any uncertainty for review.'].filter(Boolean).join(' ');
}

function slotBox(slot,width,height){
 const left=Math.round(width*LOGO_SLOTS[slot]),top=Math.round(height*bandTop(slot));
 return {left,top,width:Math.max(1,Math.min(Math.round(width*LOGO_BAND.width),width-left)),height:Math.max(1,Math.min(Math.round(height*LOGO_BAND.height),height-top))};
}

// The image model is asked to keep the reserved header clear, but generative
// models regularly fill it with the headline anyway. Measure the finished
// background before stamping the original logo over that lettering.
export async function resolveLogoPlacement(background,requested='top-right'){
 const slot=LOGO_SLOTS[requested]===undefined?'top-right':requested;
 const {width,height}=await sharp(background).metadata();
 const readings={};
 for(const name of Object.keys(LOGO_SLOTS)){
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
  const areaLeft=logo?(width*(LOGO_SLOTS[placement]??LOGO_SLOTS['top-right'])):margin,areaWidth=logo?width*LOGO_BAND.width:width-2*margin;
  const cell=(areaWidth-gap*(n-1))/n,top=height*(logo ? bandTop(placement) : .34),boxHeight=height*(logo ? LOGO_BAND.height : .60);
  for(const [i,source] of sources.entries()){
   const {data,info}=await sharp(source.path).rotate().resize({width:Math.max(1,Math.floor(cell)),height:Math.max(1,Math.floor(boxHeight)),fit:'inside',withoutEnlargement:true}).png().toBuffer({resolveWithObject:true});
   const column=String(placement).split('-')[1];
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
