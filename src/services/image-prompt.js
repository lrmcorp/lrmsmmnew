import {VISUAL_DESIGN_POLICY} from './visual-design-policy.js';
import {err} from '../util.js';
import {ASSET_PRESERVATION} from './brand-asset-policy.js';

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
const BRIEF_CONTEXT=700, DIRECTION_CONTEXT=2000, EPISODE_CONTEXT=400;
const clip=(value,limit)=>{const text=String(value??'');return text.length>limit?text.slice(0,limit).trimEnd()+'…':text;};
export function buildImagePrompt({instructions,direction,artDirection,accounts=[],layout,title,brief,episode,slideIndex,slideCount,slidePrompt,designReason='',revision=''}){
 const identities=accounts.map(c=>({account:c.account,identity:c.identity||{},foundation:String(c.foundation||'').slice(0,1000)}));
 const prompt=[instructions,VISUAL_DESIGN_POLICY,clip(direction,DIRECTION_CONTEXT),formatArtDirection(artDirection),'ACCOUNT IDENTITY: '+JSON.stringify(identities),
  'Use the approved visual concept below. It already incorporates this account’s story, history and product selection. Do not invent a later episode, change the selected products or introduce another brand.',
  'Campaign: '+title,'Brief: '+clip(brief,BRIEF_CONTEXT),episode?'Story episode: '+clip(episode,EPISODE_CONTEXT):'',
  `Slide ${slideIndex+1}/${slideCount}: ${slidePrompt}`,
  designReason?'DESIGN DECISION: '+designReason:'',
  revision?'The last attached image is the current slide. Preserve its composition except for the requested changes. Any logo visible there was placed by the server: use its position for layout only, do not copy or redraw it; the server will add the original again. Human revision for this slide: '+revision:'',
  layout,
  ASSET_PRESERVATION].filter(Boolean).join('\n');
 if(prompt.length>IMAGE_PROMPT_LIMIT)throw err(400,'image_prompt_too_long',`Image instructions contain ${prompt.length} characters after removing duplicated history; the limit is ${IMAGE_PROMPT_LIMIT}. Shorten the image-agent instructions or this slide’s visual prompt. Your story and completed stages are retained.`);
 return prompt;
}
