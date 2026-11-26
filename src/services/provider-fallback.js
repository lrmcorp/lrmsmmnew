// Provider fallback for generator stages, in the owner's order (2026-11-24,
// extended 2026-11-26 to every provider, not only the plan):
//   text stages:  Your plans -> DeepSeek -> Gemini -> OpenAI
//   image stage:  Your plans / Gemini -> OpenAI images
// A failing stage continues with the providers after its own in that order
// (all of them, for a provider outside the order such as Anthropic), using the
// Owner's saved keys and skipping any provider without one. The plan itself is
// never a fallback target: it is the Owner's subscription and has its own quota.
// Every text stage tries DeepSeek first, including those that carry images:
// DeepSeek then answers from the text alone and is told it saw no images.
import { PROVIDERS } from '../llm/providers.js';
import { PLANS_PROVIDER } from '../llm/plans.js';
import { planContext } from '../llm/plan-context.js';
import { err } from '../util.js';

export const TEXT_ORDER = ['lrmplans', 'deepseek', 'gemini', 'openai'];
export const IMAGE_ORDER = ['lrmplans', 'gemini', 'openai'];

/** Providers to try after `primary` failed, in the owner's order. */
export function fallbacksAfter(kind, primary) {
  const order = kind === 'image' ? IMAGE_ORDER : TEXT_ORDER;
  const i = order.indexOf(primary);
  // Gemini's image tier proved unusable, so an image never falls back to it.
  return (i >= 0 ? order.slice(i + 1) : order)
    .filter((p) => p !== primary && p !== PLANS_PROVIDER && !(kind === 'image' && p === 'gemini'));
}

// Refusals that a different provider must not paper over: the plan is the
// Owner's alone, so a representative's request is refused, not rerouted.
// (Fallbacks also only ever use the requesting user's own saved keys.)
const NOT_FALLBACKABLE = new Set(['plans_owner_only']);

const modelFor = (provider, kind, opts) => kind === 'image'
  ? PROVIDERS[provider].imageModel
  : (opts.images?.length ? PROVIDERS[provider].visionModel : null) || PROVIDERS[provider].textModel;

/**
 * Wrap a provider call (generateText or generateImage) with the fallback.
 * keyFor(userId, provider) returns a saved key or null.
 */
export function withPlanFallback(call, kind, keyFor, log = console) {
  return async function fallbackCall(opts) {
    if (!opts?.provider || opts.noFallback) return call(opts);
    try {
      return await call(opts);
    } catch (first) {
      if (NOT_FALLBACKABLE.has(first?.code)) throw first;
      const { user } = planContext();
      const chain = fallbacksAfter(kind, opts.provider);
      const tried = [];
      let last = null;
      for (const provider of chain) {
        const key = user ? keyFor(user.id, provider) : null;
        if (!key) continue;
        const model = modelFor(provider, kind, opts);
        tried.push(`${provider}/${model}`);
        try {
          const result = await call({ ...opts, provider, model, key });
          log.warn?.(`[generator] ${kind} on ${opts.provider} failed (${first?.code || 'error'}); answered by ${provider}/${model}`);
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
        `${PROVIDERS[opts.provider]?.name || opts.provider} failed (${first?.message || 'error'}). Fallback ${tried.join(' then ')} also failed: ${last?.message || 'error'}`);
    }
  };
}
