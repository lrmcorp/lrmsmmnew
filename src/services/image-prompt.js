import {VISUAL_DESIGN_POLICY} from './visual-design-policy.js';
import {err} from '../util.js';
import {ASSET_PRESERVATION} from './brand-asset-policy.js';

export const IMAGE_PROMPT_LIMIT=32000;
// Full account history/story has already informed the approved Visual Conceptor.
// Do not repeat that archive in the image API request: GPT Image has a 32k limit.
export function buildImagePrompt({instructions,direction,accounts=[],layout,title,brief,episode,slideIndex,slideCount,slidePrompt,designReason='',revision=''}){
 const identities=accounts.map(c=>({account:c.account,identity:c.identity||{},foundation:String(c.foundation||'').slice(0,1000)}));
 const prompt=[instructions,VISUAL_DESIGN_POLICY,direction,'ACCOUNT IDENTITY: '+JSON.stringify(identities),
  'Use the approved visual concept below. It already incorporates this account’s story, history and product selection. Do not invent a later episode, change the selected products or introduce another brand.',
  'Campaign: '+title,'Brief: '+brief,episode?'Story episode: '+episode:'',
  `Slide ${slideIndex+1}/${slideCount}: ${slidePrompt}`,
  designReason?'DESIGN DECISION: '+designReason:'',
  revision?'The last attached image is the current slide. Preserve its composition except for the requested changes. Any logo visible there was placed by the server: use its position for layout only, do not copy or redraw it; the server will add the original again. Human revision for this slide: '+revision:'',
  layout,
  ASSET_PRESERVATION].filter(Boolean).join('\n');
 if(prompt.length>IMAGE_PROMPT_LIMIT)throw err(400,'image_prompt_too_long',`Image instructions contain ${prompt.length} characters after removing duplicated history; the limit is ${IMAGE_PROMPT_LIMIT}. Shorten the image-agent instructions or this slide’s visual prompt. Your story and completed stages are retained.`);
 return prompt;
}
