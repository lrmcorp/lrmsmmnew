// Fixed official API origins. API keys never leave the corresponding provider.
import { err } from '../util.js';

export const PROVIDERS = {
  openai: { name: 'OpenAI (ChatGPT models)', textModel: 'gpt-4.1-mini', imageModel: 'gpt-image-1', image: true },
  anthropic: { name: 'Anthropic (Claude)', textModel: 'claude-sonnet-4-5', image: false },
  gemini: { name: 'Google Gemini', textModel: 'gemini-2.5-flash', imageModel: 'gemini-2.5-flash-image', image: true },
};

async function jsonRequest(url, headers, body) {
  let res;
  try { res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(180000) }); }
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

export async function generateText({ provider, model, key, system, prompt, images = [] }) {
  let result, text;
  if (provider === 'openai') {
    const content = [{ type: 'text', text: prompt }, ...images.map(x => ({ type: 'image_url', image_url: { url: `data:${x.mime};base64,${x.data}`, detail: 'low' } }))];
    result = await jsonRequest('https://api.openai.com/v1/chat/completions', { Authorization: `Bearer ${key}` }, { model, max_completion_tokens: 2400, messages: [{ role: 'system', content: system }, { role: 'user', content }] });
    text = result.choices?.[0]?.message?.content;
  } else if (provider === 'anthropic') {
    result = await jsonRequest('https://api.anthropic.com/v1/messages', { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, { model, max_tokens: 2400, system, messages: [{ role: 'user', content: [...images.map(x => ({ type: 'image', source: { type: 'base64', media_type: x.mime, data: x.data } })), { type: 'text', text: prompt }] }] });
    text = result.content?.filter(c => c.type === 'text').map(c => c.text).join('\n');
  } else if (provider === 'gemini') {
    result = await jsonRequest(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { 'x-goog-api-key': key }, { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: prompt }, ...images.map(x => ({ inlineData: { mimeType: x.mime, data: x.data } }))] }], generationConfig: { maxOutputTokens: 4096 } });
    text = result.candidates?.[0]?.content?.parts?.filter(p => p.text).map(p => p.text).join('\n');
  } else throw err(400, 'provider_invalid', 'Provider tidak didukung.');
  if (typeof text !== 'string' || !text.trim() || text.length > 40000) throw err(502, 'provider_response_invalid', 'Provider tidak mengembalikan teks yang dapat dipakai.');
  return { text, usage: result.usage || result.usageMetadata || null };
}

export async function generateImage({ provider, model, key, prompt }) {
  let result, base64;
  if (provider === 'openai') {
    result = await jsonRequest('https://api.openai.com/v1/images/generations', { Authorization: `Bearer ${key}` }, { model, prompt, n: 1, size: '1024x1024', output_format: 'png' });
    base64 = result.data?.[0]?.b64_json;
  } else if (provider === 'gemini') {
    result = await jsonRequest(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { 'x-goog-api-key': key }, { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } });
    base64 = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.mimeType?.startsWith('image/'))?.inlineData?.data;
  } else throw err(400, 'image_provider_invalid', 'Pilih OpenAI atau Gemini untuk pembuatan gambar. Claude tidak menghasilkan gambar.');
  if (typeof base64 !== 'string' || base64.length > 12 * 1024 * 1024) throw err(502, 'provider_image_invalid', 'Provider tidak mengembalikan gambar yang valid (maksimal 8 MB).');
  return { buffer: Buffer.from(base64, 'base64'), usage: result.usage || result.usageMetadata || null };
}
