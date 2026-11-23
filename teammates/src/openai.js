// Translation between the OpenAI chat shape the application speaks and the
// single prompt string the Codex CLI takes.
import crypto from 'node:crypto';

export const MODELS = (process.env.PLANS_MODELS || 'codex').split(',').map((s) => s.trim()).filter(Boolean);
export const DEFAULT_MODEL = MODELS[0] || 'codex';

export const newId = (prefix) => `${prefix}-${crypto.randomBytes(16).toString('hex')}`;

const textOf = (content) => {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  // Image parts are handled separately; only text is flattened here.
  return content.filter((p) => p?.type === 'text' || typeof p?.text === 'string').map((p) => p.text || '').join('\n');
};

/** Data-URL image parts, as { mime, buffer }, in message order. */
export function imagesOf(messages) {
  const out = [];
  for (const m of messages || []) {
    if (!Array.isArray(m?.content)) continue;
    for (const part of m.content) {
      const url = part?.image_url?.url || (part?.type === 'input_image' ? part.image_url : null);
      const match = typeof url === 'string' && /^data:([^;,]+);base64,(.+)$/s.exec(url);
      if (match) out.push({ mime: match[1], buffer: Buffer.from(match[2], 'base64') });
    }
  }
  return out;
}

/**
 * Collapse a chat array into one prompt.
 *
 * Codex keeps its own thread across `resume`, so only the newest turn is sent
 * after the first message. System messages are re-sent every turn: they carry
 * the agent's standing instructions, and a resumed thread must not drift off
 * them just because the caller set them once.
 */
export function promptFrom(messages, { resume = false } = {}) {
  const list = Array.isArray(messages) ? messages : [];
  const system = list.filter((m) => m?.role === 'system').map((m) => textOf(m.content)).filter(Boolean);
  const turns = list.filter((m) => m?.role !== 'system');
  const body = resume
    ? textOf(turns.at(-1)?.content)
    : turns.map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${textOf(m.content)}`).join('\n\n');
  return [...system, body].filter(Boolean).join('\n\n').trim();
}

/** A conversation summary used when a resume fails and the turn must restart. */
export function restartPrompt(messages) {
  const list = Array.isArray(messages) ? messages : [];
  const system = list.filter((m) => m?.role === 'system').map((m) => textOf(m.content)).filter(Boolean);
  const turns = list.filter((m) => m?.role !== 'system');
  const history = turns.slice(0, -1).map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${textOf(m.content)}`).join('\n');
  const latest = textOf(turns.at(-1)?.content);
  return [
    ...system,
    history ? `Conversation so far:\n${history}` : '',
    latest,
  ].filter(Boolean).join('\n\n').trim();
}

/** A JSON Schema from response_format, or null. */
export function schemaOf(body) {
  const f = body?.response_format;
  if (f?.type !== 'json_schema') return null;
  return f.json_schema?.schema || f.schema || null;
}

const usage = () => ({ prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 });

export function completion({ id, model, content, finish = 'stop' }) {
  return {
    id, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model,
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: finish }],
    // The plan is billed by subscription, not per token, and the CLI reports no
    // count, so these are zeros rather than an invented number.
    usage: usage(),
  };
}

export const chunk = ({ id, model, delta = {}, finish = null }) => ({
  id, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model,
  choices: [{ index: 0, delta, finish_reason: finish }],
});

export const sse = (payload) => `data: ${JSON.stringify(payload)}\n\n`;
export const SSE_DONE = 'data: [DONE]\n\n';

export const modelList = () => ({
  object: 'list',
  data: MODELS.map((id) => ({ id, object: 'model', created: 0, owned_by: 'chatgpt-plan' })),
});
