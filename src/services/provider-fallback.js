// Fallback for stages that run on "Your plans" (the Owner's ChatGPT plan via
// the Codex CLI). If the plan cannot answer, the same request goes to the next
// provider the Owner has a saved key for:
//   text stages:  Your plans -> DeepSeek -> Gemini   (never OpenAI)
//   image stage:  Your plans -> OpenAI images
// Every text stage tries DeepSeek first, including those that carry images:
// DeepSeek then answers from the text alone and is told it saw no images.
// The order is the owner's instruction (2026-11-24, revised twice that day). A stage set to any other
// provider is never redirected: only the plan has a fallback.
import { PROVIDERS } from '../llm/providers.js';
import { PLANS_PROVIDER } from '../llm/plans.js';
import { planContext } from '../llm/plan-context.js';
import { err } from '../util.js';

export const TEXT_FALLBACK = ['deepseek', 'gemini'];
export const IMAGE_FALLBACK = ['openai'];

// Refusals that a different provider must not paper over: the plan is the
// Owner's alone, so a representative's request is refused, not rerouted.
const NOT_FALLBACKABLE = new Set(['plans_owner_only']);

const modelFor = (provider, kind, opts) => kind === 'image'
  ? PROVIDERS[provider].imageModel
  : (opts.images?.length ? PROVIDERS[provider].visionModel : null) || PROVIDERS[provider].textModel;

/**
 * Wrap a provider call (generateText or generateImage) with the plan fallback.
 * keyFor(userId, provider) returns a saved key or null.
 */
export function withPlanFallback(call, kind, keyFor, log = console) {
  return async function fallbackCall(opts) {
    if (opts?.provider !== PLANS_PROVIDER || opts.noFallback) return call(opts);
    try {
      return await call(opts);
    } catch (first) {
      if (NOT_FALLBACKABLE.has(first?.code)) throw first;
      const { user } = planContext();
      const chain = kind === 'image' ? IMAGE_FALLBACK : TEXT_FALLBACK;
      const tried = [];
      let last = null;
      for (const provider of chain) {
        const key = user ? keyFor(user.id, provider) : null;
        if (!key) continue;
        const model = modelFor(provider, kind, opts);
        tried.push(`${provider}/${model}`);
        try {
          const result = await call({ ...opts, provider, model, key });
          log.warn?.(`[generator] ${kind} on Your plans failed (${first?.code || 'error'}); answered by ${provider}/${model}`);
          // Recorded with the stage's usage, so the draft shows who answered.
          return {
            ...result,
            usage: { ...(result.usage || {}), served_by: `${provider}/${model}`, fallback_from: `${opts.provider}/${opts.model}`, fallback_reason: String(first?.code || 'error') },
          };
        } catch (e) {
          last = e;
        }
      }
      if (!tried.length) throw first;
      throw err(last?.status || 502, last?.code || first?.code || 'provider_error',
        `Your plans failed (${first?.message || 'error'}). Fallback ${tried.join(' then ')} also failed: ${last?.message || 'error'}`);
    }
  };
}
