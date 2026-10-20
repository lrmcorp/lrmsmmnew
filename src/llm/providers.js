// Fixed official API origins. API keys never leave the corresponding provider.
import { err } from '../util.js';

export const PROVIDERS = {
  openai: { name: 'OpenAI (ChatGPT models)', textModel: 'gpt-4.1-mini', imageModel: 'gpt-image-1', image: true, textModels: [{id:'gpt-4.1-mini',name:'GPT-4.1 mini · Ringan'}, {id:'gpt-4.1',name:'GPT-4.1 · Detail'}, {id:'gpt-4o',name:'GPT-4o · Multimodal'}], imageModels: [{id:'gpt-image-1',name:'GPT Image 1'}] },
  anthropic: { name: 'Anthropic (Claude)', textModel: 'claude-sonnet-4-5', image: false, textModels: [{id:'claude-sonnet-4-5',name:'Claude Sonnet 4.5'}, {id:'claude-haiku-4-5',name:'Claude Haiku 4.5 · Ringan'}, {id:'claude-opus-4-1',name:'Claude Opus 4.1 · Detail'}], imageModels: [] },
  gemini: { name: 'Google Gemini', textModel: 'gemini-2.5-flash', imageModel: 'gemini-2.5-flash-image', image: true, textModels: [{id:'gemini-2.5-flash',name:'Gemini 2.5 Flash'}, {id:'gemini-2.5-pro',name:'Gemini 2.5 Pro · Detail'}, {id:'gemini-2.5-flash-lite',name:'Gemini 2.5 Flash-Lite · Ringan'}], imageModels: [{id:'gemini-2.5-flash-image',name:'Gemini 2.5 Flash Image'}] },
};

async function jsonRequest(url, headers, body) {
  let res;
  try { res = await fetch(url, { method: 'POST', headers: { ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...headers }, body: body instanceof FormData ? body : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(180000) }); }
  catch { throw err(502, 'provider_unavailable', 'Provider tidak merespons. Periksa koneksi lalu coba ulang tahap ini.'); }
  // Do not expose raw provider responses, prompts or secrets in error messages.
  if (!res.ok) {
    await res.body?.cancel();
    const text = res.status === 401 || res.status === 403 ? 'API key atau akses model ditolak provider.' : res.status === 429 ? 'Kuota atau batas permintaan provider tercapai.' : `Permintaan provider gagal (HTTP ${res.status}). Periksa model dan akun provider.`;
    throw err(502, 'provider_error', text);
  }
  const chunks = []; let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > 24 * 1024 * 1024) throw err(502, 'provider_response_large', 'Respons provider terlalu besar.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString()); }
  catch { throw err(502, 'provider_response_invalid', 'Respons provider bukan JSON yang valid.'); }
}

export async function generateText({ provider, model, key, system, prompt, images = [], maxTokens = 2400, jsonSchema = null }) {
  let result, text;
  if (provider === 'openai') {
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
  } else throw err(400, 'provider_invalid', 'Provider tidak didukung.');
  if (typeof text !== 'string' || !text.trim() || text.length > 40000) throw err(502, 'provider_response_invalid', 'Provider tidak mengembalikan teks yang dapat dipakai.');
  return { text, usage: result.usage || result.usageMetadata || null };
}

export async function generateImage({ provider, model, key, prompt, references = [] }) {
  let result, base64;
  if (provider === 'openai') {
    if (references.length) {
      const form = new FormData();
      for (const [k,v] of Object.entries({ model, prompt, n: '1', size: '1024x1024', output_format: 'png', input_fidelity:'high' })) form.append(k,v);
      references.forEach((ref,i) => form.append('image[]',new Blob([ref.buffer],{type:ref.mime}),`reference-${i+1}.jpg`));
      result = await jsonRequest('https://api.openai.com/v1/images/edits', { Authorization: `Bearer ${key}` }, form);
    } else {
      result = await jsonRequest('https://api.openai.com/v1/images/generations', { Authorization: `Bearer ${key}` }, { model, prompt, n: 1, size: '1024x1024', output_format: 'png' });
    }
    base64 = result.data?.[0]?.b64_json;
  } else if (provider === 'gemini') {
    result = await jsonRequest(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { 'x-goog-api-key': key }, { contents: [{ role: 'user', parts: [...references.map(ref=>({inlineData:{mimeType:ref.mime,data:ref.buffer.toString('base64')}})),{ text: prompt }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } });
    base64 = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.mimeType?.startsWith('image/'))?.inlineData?.data;
  } else throw err(400, 'image_provider_invalid', 'Pilih OpenAI atau Gemini untuk pembuatan gambar. Claude tidak menghasilkan gambar.');
  if (typeof base64 !== 'string' || base64.length > 12 * 1024 * 1024) throw err(502, 'provider_image_invalid', 'Provider tidak mengembalikan gambar yang valid (maksimal 8 MB).');
  return { buffer: Buffer.from(base64, 'base64'), usage: result.usage || result.usageMetadata || null };
}
