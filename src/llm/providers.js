// Fixed official API origins. API keys never leave the corresponding provider.
import { createHash } from 'node:crypto';
import { err } from '../util.js';

export const PROVIDERS = {
  openai: { name: 'OpenAI (ChatGPT & Codex)', textModel: 'gpt-4.1-mini', imageModel: 'gpt-image-1', image: true, textModels: [{id:'gpt-4.1-mini',name:'GPT-4.1 mini · Lightweight'}, {id:'gpt-4.1',name:'GPT-4.1 · Detailed'}, {id:'gpt-4o',name:'GPT-4o · Multimodal'}, {id:'gpt-5.1-codex-mini',name:'GPT-5.1 Codex mini · Responses API'}], imageModels: [{id:'gpt-image-1',name:'GPT Image 1'}] },
  anthropic: { name: 'Anthropic (Claude)', textModel: 'claude-sonnet-4-5', image: false, textModels: [{id:'claude-sonnet-4-5',name:'Claude Sonnet 4.5'}, {id:'claude-haiku-4-5',name:'Claude Haiku 4.5 · Lightweight'}, {id:'claude-opus-4-1',name:'Claude Opus 4.1 · Detailed'}], imageModels: [] },
  gemini: { name: 'Google Gemini', textModel: 'gemini-2.5-flash', imageModel: 'gemini-2.5-flash-image', image: true, textModels: [{id:'gemini-2.5-flash',name:'Gemini 2.5 Flash'}, {id:'gemini-2.5-pro',name:'Gemini 2.5 Pro · Detailed'}, {id:'gemini-2.5-flash-lite',name:'Gemini 2.5 Flash-Lite · Lightweight'}], imageModels: [{id:'gemini-2.5-flash-image',name:'Gemini 2.5 Flash Image'}] },
};

async function jsonRequest(url, headers, body, method = 'POST') {
  let res;
  try { res = await fetch(url, { method, headers: { ...(method==='GET'||body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...headers }, body: method==='GET'?undefined:body instanceof FormData ? body : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(method==='GET'?10000:180000) }); }
  catch { throw err(502, 'provider_unavailable', "Provider did not respond. Check your connection and retry this stage."); }
  // Do not expose raw provider responses, prompts or secrets in error messages.
  if (!res.ok) {
    await res.body?.cancel();
    const text = res.status === 404 ? "Model is unavailable for this endpoint or API key (HTTP 404). Refresh the model list and select an available model." : res.status === 401 || res.status === 403 ? "The provider rejected the API key or model access." : res.status === 429 ? "Provider quota or request limit reached." : `Provider request failed (HTTP ${res.status}). Check the model and provider account.`;
    throw err(502, res.status===404?'provider_model_unavailable':'provider_error', text);
  }
  const chunks = []; let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > 24 * 1024 * 1024) throw err(502, 'provider_response_large', "Provider response is too large.");
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString()); }
  catch { throw err(502, 'provider_response_invalid', 'The provider response is not valid JSON.'); }
}

// Catalog requests do not generate content. Cache only metadata, indexed by a key digest.
const modelCatalogs=new Map();
export async function geminiModels(key,{refresh=false}={}) {
 const cacheKey=createHash('sha256').update(key).digest('hex'),cached=modelCatalogs.get(cacheKey);
 if(!refresh&&cached&&cached.expires>Date.now())return cached.value;
 const models=[];let token='';
 for(let page=0;page<8;page++){
  const query=new URLSearchParams({pageSize:'100'});if(token)query.set('pageToken',token);
  const data=await jsonRequest('https://generativelanguage.googleapis.com/v1beta/models?'+query,{'x-goog-api-key':key},undefined,'GET');
  if(!Array.isArray(data.models))throw err(502,'provider_catalog_invalid',"The Gemini model list could not be read.");
  for(const item of data.models){
   const id=typeof item.name==='string'?item.name.replace(/^models\//,''):'';
   if(!/^gemini-[A-Za-z0-9._-]{1,90}$/.test(id)||!item.supportedGenerationMethods?.includes('generateContent')||/tts|audio|robotics|deep-research/i.test(id))continue;
   models.push({id,name:typeof item.displayName==='string'?item.displayName.slice(0,120):id});
  }
  token=typeof data.nextPageToken==='string'?data.nextPageToken:'';if(!token)break;
  if(page===7)throw err(502,'provider_catalog_large',"The Gemini model list is too large.");
 }
 const unique=[...new Map(models.map(m=>[m.id,m])).values()];
 const textModels=unique.filter(m=>!m.id.includes('image')),imageModels=unique.filter(m=>m.id.includes('image'));
 if(!textModels.length)throw err(502,'provider_catalog_empty',"This API key returned no available Gemini text models.");
 // Prefer stable lightweight models over preview or reasoning-heavy presets.
 const score=m=>(/preview|exp(?:erimental)?/.test(m.id)?0:100)+(/flash/.test(m.id)?20:0)+(/lite/.test(m.id)?5:0);
 textModels.sort((a,b)=>score(b)-score(a)||b.id.localeCompare(a.id,undefined,{numeric:true}));
 const value={textModels,imageModels,textModel:textModels[0].id,imageModel:imageModels[0]?.id||'',image:imageModels.length>0,live:true};
 for(const [id,entry]of modelCatalogs)if(entry.expires<=Date.now())modelCatalogs.delete(id);
 if(modelCatalogs.size>=500)modelCatalogs.delete(modelCatalogs.keys().next().value);
 modelCatalogs.set(cacheKey,{value,expires:Date.now()+5*60_000});return value;
}

export async function generateText({ provider, model, key, system, prompt, images = [], maxTokens = 2400, jsonSchema = null }) {
  let result, text;
  if (provider === 'openai' && /codex/i.test(model)) {
    result = await jsonRequest('https://api.openai.com/v1/responses', { Authorization: `Bearer ${key}` }, { model, instructions:system, input:[{role:'user',content:[{type:'input_text',text:prompt},...images.map(x=>({type:'input_image',image_url:`data:${x.mime};base64,${x.data}`}))]}], max_output_tokens:maxTokens, ...(jsonSchema?{text:{format:{type:'json_schema',name:'content_plan',strict:true,schema:jsonSchema}}}:{}) });
    text = result.output_text || result.output?.flatMap(item=>item.content||[]).filter(part=>part.type==='output_text').map(part=>part.text).join('\n');
  } else if (provider === 'openai') {
    const content = [{ type: 'text', text: prompt }, ...images.map(x => ({ type: 'image_url', image_url: { url: `data:${x.mime};base64,${x.data}`, detail: 'low' } }))];
    result = await jsonRequest('https://api.openai.com/v1/chat/completions', { Authorization: `Bearer ${key}` }, { model, ...(jsonSchema?{response_format:{type:'json_schema',json_schema:{name:'content_plan',strict:true,schema:jsonSchema}}}:{}), max_completion_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content }] });
    text = result.choices?.[0]?.message?.content;
  } else if (provider === 'anthropic') {
    result = await jsonRequest('https://api.anthropic.com/v1/messages', { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, { model, ...(jsonSchema?{tools:[{name:'submit_content_plan',description:'Return the structured content plan.',input_schema:jsonSchema}],tool_choice:{type:'tool',name:'submit_content_plan'}}:{}), max_tokens: maxTokens, system, messages: [{ role: 'user', content: [...images.map(x => ({ type: 'image', source: { type: 'base64', media_type: x.mime, data: x.data } })), { type: 'text', text: prompt }] }] });
    const tool=jsonSchema&&result.content?.find(c=>c.type==='tool_use'&&c.name==='submit_content_plan');
    text=tool?JSON.stringify(tool.input):result.content?.filter(c => c.type === 'text').map(c => c.text).join('\n');
  } else if (provider === 'gemini') {
    result = await jsonRequest(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { 'x-goog-api-key': key }, { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: prompt }, ...images.map(x => ({ inlineData: { mimeType: x.mime, data: x.data } }))] }], generationConfig: { maxOutputTokens: Math.max(4096, maxTokens), ...(jsonSchema?{responseMimeType:'application/json',responseJsonSchema:jsonSchema}:{}) } });
    text = result.candidates?.[0]?.content?.parts?.filter(p => p.text).map(p => p.text).join('\n');
  } else throw err(400, 'provider_invalid', "Unsupported provider.");
  if (typeof text !== 'string' || !text.trim() || text.length > 40000) throw err(502, 'provider_response_invalid', "Provider did not return usable text.");
  return { text, usage: result.usage || result.usageMetadata || null };
}

export async function generateImage({ provider, model, key, prompt, references = [] }) {
  if(provider==='openai'&&typeof prompt==='string'&&prompt.length>32000)throw err(400,'image_prompt_too_long','The image prompt exceeds OpenAI’s 32,000-character limit. Shorten the image instructions before retrying.');
  let result, base64;
  if (provider === 'openai') {
    if (references.length) {
      const form = new FormData();
      for (const [k,v] of Object.entries({ model, prompt, n: '1', size: '1024x1024', output_format: 'png', input_fidelity:'high' })) form.append(k,v);
      references.forEach((ref,i) => form.append('image[]',new Blob([ref.buffer],{type:ref.mime}),`reference-${i+1}.${ref.mime==='image/png'?'png':'jpg'}`));
      result = await jsonRequest('https://api.openai.com/v1/images/edits', { Authorization: `Bearer ${key}` }, form);
    } else {
      result = await jsonRequest('https://api.openai.com/v1/images/generations', { Authorization: `Bearer ${key}` }, { model, prompt, n: 1, size: '1024x1024', output_format: 'png' });
    }
    base64 = result.data?.[0]?.b64_json;
  } else if (provider === 'gemini') {
    result = await jsonRequest(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { 'x-goog-api-key': key }, { contents: [{ role: 'user', parts: [...references.map(ref=>({inlineData:{mimeType:ref.mime,data:ref.buffer.toString('base64')}})),{ text: prompt }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } });
    base64 = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.mimeType?.startsWith('image/'))?.inlineData?.data;
  } else throw err(400, 'image_provider_invalid', "Choose OpenAI or Gemini for image generation. Claude does not generate images.");
  if (typeof base64 !== 'string' || base64.length > 12 * 1024 * 1024) throw err(502, 'provider_image_invalid', "Provider did not return a valid image, up to 8 MB.");
  return { buffer: Buffer.from(base64, 'base64'), usage: result.usage || result.usageMetadata || null };
}
