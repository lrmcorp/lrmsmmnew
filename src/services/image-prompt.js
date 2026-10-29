import {VISUAL_DESIGN_POLICY} from './visual-design-policy.js';
import {err} from '../util.js';
import {ASSET_PRESERVATION} from './brand-asset-policy.js';
import {outputLanguageClause} from './output-language.js';

export const IMAGE_PROMPT_LIMIT=32000;
export const ART_DIRECTION_FIELDS={palette:'Palette',background:'Background and setting',typography:'Typography',composition:'Composition, subject scale and negative space',lighting:'Lighting and material finish',avoid:'Would break this look'};
// The Visual Conceptor reads the references at high detail; without its findings
// written down, the image model only ever receives adjectives and falls back to
// the category default. Carry the observed traits verbatim into every slide.
export function formatArtDirection(direction){
 if(!direction||typeof direction!=='object')return '';
 const lines=Object.entries(ART_DIRECTION_FIELDS).filter(([field])=>typeof direction[field]==='string'&&direction[field].trim()).map(([field,label])=>`- ${label}: ${direction[field].trim()}`);
 return lines.length?'ART DIRECTION observed in this account’s own references. Reproduce this design language exactly; it outranks any generic idea of an attractive product image:\n'+lines.join('\n'):'';
}
// Full account history/story has already informed the approved Visual Conceptor.
// Do not repeat that archive in the image API request: GPT Image has a 32k limit.
// The same applies to anything the Conceptor has already distilled. The campaign
// brief may be 10k characters and the reference notes 6k, but both were read by
// the Conceptor and are expressed in the slide prompt and the art direction, so
// they travel here only as short context. What the image model actually needs,
// the slide prompt, the art direction, the craft policy and the asset rules, is
// never truncated; budgeting the duplicated parts is what keeps room for them.
const BRIEF_CONTEXT=500, DIRECTION_CONTEXT=1400, EPISODE_CONTEXT=300;
const clip=(value,limit)=>{const text=String(value??'');return text.length>limit?text.slice(0,limit).trimEnd()+'…':text;};
// The reference direction ends with the user's own notes, the most deliberate
// part of it, so a head-only clip would throw exactly that away. Keep both ends.
const clipMiddle=(value,limit)=>{const text=String(value??'');if(text.length<=limit)return text;const head=Math.floor(limit*.55),tail=limit-head;return text.slice(0,head).trimEnd()+' … '+text.slice(-tail).trimStart();};
// The brand name is the one word a model reproduces most readily, because every
// reference it is shown carries it. Naming the actual words is far more
// effective than asking for no wordmark in the abstract, and it generalises:
// the words come from whichever account the run belongs to.
export function brandWords(accounts=[]){
 const words=new Set();
 for(const c of accounts){
  const a=c&&typeof c.account==='object'?c.account:{};
  for(const raw of [a.username,a.name,typeof c.account==='string'?c.account:'']){
   const text=String(raw||'').replace(/^@/,'').trim();
   if(!text)continue;
   // The whole handle and name, plus the handle's distinctive first segment.
   // Splitting a display name would ban its category noun too, and "Nails" is
   // a legitimate word for a nail brand to use in a headline.
   words.add(text);
   const head=text.split(/[.\s_-]+/)[0];
   if(head&&head.length>2&&!/\s/.test(text.split(/[.]/)[0]||''))words.add(head);
  }
 }
 // Longest first, so a handle is removed before the bare name inside it.
 return [...words].filter(w=>w.length>2&&w.length<40).sort((a,b)=>b.length-a.length).slice(0,8);
}
// Connectors that only exist to introduce the brand name. Left behind, they
// turn "Manicure tanpa kerumitan dengan MANISKY" into a line ending in "dengan".
const BRAND_CONNECTORS='dengan|bersama|with|by|from|dari|oleh|and|dan|x';
const escapeRegExp=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// The slide prompt quotes the on-image text so the image model renders those
// characters verbatim. That rule and the ban on drawing the brand name are in
// direct conflict whenever the Visual Conceptor writes the brand into the
// headline, and verbatim rendering wins. Remove the brand from what is quoted
// so the two rules can no longer disagree. Only quoted spans are touched: the
// brand genuinely printed on packaging in the scene is described, not quoted.
export function stripBrandFromQuotes(prompt,words=[]){
 const text=String(prompt??'');
 if(!words.length)return text;
 const brand=new RegExp(`(?:\\b(?:${BRAND_CONNECTORS})\\s+)?\\b(?:${words.map(escapeRegExp).join('|')})\\b`,'gi');
 return text.replace(/"([^"]*)"/g,(whole,inner)=>{
  if(!brand.test(inner)){brand.lastIndex=0;return whole;}
  brand.lastIndex=0;
  const cleaned=inner.replace(brand,' ').replace(/\s{2,}/g,' ').replace(/^[\s,;:·|–—-]+|[\s,;:·|–—-]+$/g,'').trim();
  return cleaned.length>=2?`"${cleaned}"`:'';
 }).replace(/[ \t]{2,}/g,' ').trim();
}
export function buildImagePrompt({instructions,direction,artDirection,accounts=[],layout,title,brief,episode,slideIndex,slideCount,slidePrompt,designReason='',revision='',language='id'}){
 const identities=accounts.map(c=>({account:c.account,identity:c.identity||{},foundation:String(c.foundation||'').slice(0,1000)}));
 const banned=brandWords(accounts);
 const prompt=[instructions,VISUAL_DESIGN_POLICY,clipMiddle(direction,DIRECTION_CONTEXT),formatArtDirection(artDirection),'ACCOUNT IDENTITY: '+JSON.stringify(identities),
  'Use the approved visual concept below. It already incorporates this account’s story, history and product selection. Do not invent a later episode, change the selected products or introduce another brand.',
  'Campaign: '+title,'Brief: '+clip(brief,BRIEF_CONTEXT),episode?'Story episode: '+clip(episode,EPISODE_CONTEXT):'',
  `Slide ${slideIndex+1}/${slideCount}: ${slidePrompt}`,
  designReason?'DESIGN DECISION: '+designReason:'',
  revision?'The last attached image is the current slide. Preserve its composition except for the requested changes. Any logo visible there was placed by the server: use its position for layout only, do not copy or redraw it; the server will add the original again. Human revision for this slide: '+revision:'',
  layout,
  'ON-IMAGE TEXT IS VERBATIM: render any text quoted in the slide prompt exactly as written, character for character, in that same language. Never translate it, never substitute a phrase of your own and never add lines that were not asked for.',
  outputLanguageClause(language),
  banned.length?`BRAND NAME IS NOT ARTWORK: the server composites the one official mark after generation, so the brand name must appear zero times in any lettering you draw. Do not write ${banned.map(w=>JSON.stringify(w)).join(', ')} anywhere: not as a headline, a signature, a caption, a watermark, a sign-off, a "with" line, a hashtag or small print. The only exception is lettering genuinely printed on the physical product or its packaging inside the scene, which is part of the product. This outranks the verbatim rule above: if any quoted text still contains one of those words, render the rest of that line without them rather than writing them out.`:'',
  ASSET_PRESERVATION].filter(Boolean).join('\n');
 if(prompt.length>IMAGE_PROMPT_LIMIT)throw err(400,'image_prompt_too_long',`Image instructions contain ${prompt.length} characters after removing duplicated history; the limit is ${IMAGE_PROMPT_LIMIT}. Shorten the image-agent instructions or this slide’s visual prompt. Your story and completed stages are retained.`);
 return prompt;
}
