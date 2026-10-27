import sharp from 'sharp';

// One source of truth for the reserved brand header: the prompt promises this
// area, the collision check measures it and the composite fills it.
const LOGO_BAND={top:.06,height:.10,width:.30};
const LOGO_SLOTS={'top-left':.06,'top-center':.35,'top-right':.64};
const LOGO_AREAS={'top-left':'upper-left','top-center':'upper-centre','top-right':'upper-right'};
// Greyscale spread inside the reserved band. A calm wall, gradient or sky sits
// well below this; headline lettering, faces or product detail sit far above it.
const BUSY_STDEV=18, CLEARLY_CALMER=.75;
const pct=value=>Math.round(value*100);

export function protectedLayout(assets,hasVisualReference=false,logoPlacement='top-right'){
 const logo=assets.some(a=>a.role==='logo'),exact=assets.some(a=>a.role==='product');
 const logoArea=LOGO_AREAS[logoPlacement]||LOGO_AREAS['top-right'];
 return [hasVisualReference?'REFERENCE PRIORITY: Build the slide from the attached visual references. Match their observable palette, background treatment, subject scale and placement, typography hierarchy, spacing and lighting. Preserve that design language across the campaign while adapting content to this slide; avoid a generic product-ad layout.':'',
  logo?`The server will place the original logo in the ${logoArea} of the finished image, within a ${pct(LOGO_BAND.width)}% wide area roughly ${pct(LOGO_BAND.top)}–${pct(LOGO_BAND.top+LOGO_BAND.height)}% from the top. Treat this location and any headline as one editorial header, with aligned spacing, a shared palette and a calm background that gives the supplied logo colors clear contrast. That area must contain no lettering, headline, face, hand or product detail whatsoever: start the headline below it or place it on the opposite side, because the logo is stamped over whatever you draw there. Compose the headline and scene around it; do not generate, redraw or imitate any logo elsewhere.`:'',
  exact?'Products explicitly set to EXACT CUTOUT receive an original-source overlay; reserve a clean lower area for those products.':'',
  'Products in PRODUCT MOCKUP mode must be rendered naturally in the approved scene, never as a pasted photo or catalog rectangle. Preserve recognizable product details and flag any uncertainty for review.'].filter(Boolean).join(' ');
}

function slotBox(slot,width,height){
 const left=Math.round(width*LOGO_SLOTS[slot]),top=Math.round(height*LOGO_BAND.top);
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
export async function composeProtectedAssets(background,assets,{logoPlacement='top-right'}={}){
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
  const cell=(areaWidth-gap*(n-1))/n,top=height*(logo ? LOGO_BAND.top : .34),boxHeight=height*(logo ? LOGO_BAND.height : .60);
  for(const [i,source] of sources.entries()){
   const {data,info}=await sharp(source.path).rotate().resize({width:Math.max(1,Math.floor(cell)),height:Math.max(1,Math.floor(boxHeight)),fit:'inside',withoutEnlargement:true}).png().toBuffer({resolveWithObject:true});
   const left=logo&&n===1?(placement==='top-left'?Math.round(areaLeft):placement==='top-center'?Math.round((width-info.width)/2):Math.floor(width*.94-info.width)):Math.round(areaLeft+i*(cell+gap)+(cell-info.width)/2),y=Math.round(top+(boxHeight-info.height)/2);
   overlays.push({input:data,left,top:y});placements.push({media_id:source.media_id,role,left,top:y,width:info.width,height:info.height});
  }
 }
 // JPEG is required for Instagram publishing. No AI alteration, cropping,
 // color filter, background removal or lettering replacement touches sources.
 return {buffer:await sharp(background).composite(overlays).flatten({background:'#fff'}).jpeg({quality:100,chromaSubsampling:'4:4:4'}).toBuffer(),placements,logo:logoCheck};
}
