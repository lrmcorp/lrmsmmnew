// Client for the plans bridge: the owner's ChatGPT subscription, reached only
// through the official Codex CLI running in the teammates container.
//
// This module never sees a ChatGPT credential. It speaks the OpenAI wire format
// to the bridge with the shared internal token, and the bridge shells out to the
// CLI, which owns the login.
import { createHmac } from 'node:crypto';
import { config } from '../config.js';
import { err } from '../util.js';
import { planContext } from './plan-context.js';

export const PLANS_PROVIDER = 'lrmplans';
const SIGNED_OUT = "Codex is not signed in yet. Sign in on Config → AI plans.";

const base = () => String(config.plans?.baseUrl || '').replace(/\/+$/, '');
export const configured = () => !!(base() && config.plans?.token);

/**
 * Only the workspace owner may spend the owner's own subscription. A
 * representative's run must never reach it, and neither must a scheduled job
 * created by anyone else: the job carries its creator, and that is who is
 * checked.
 */
export function assertOwnerMayUsePlans(user) {
  if (!user || user.role !== 'owner') {
    throw err(403, 'plans_owner_only', "Your plans are only available to the workspace Owner. Choose a provider with its own API key for this run.");
  }
}

/**
 * A short-lived statement that an Owner with a live console session asked for a
 * login terminal. Signed with the token this application already shares with
 * the bridge, so the bridge can verify it without any access to sessions here.
 */
export function mintTerminalTicket(user, { ttlMs = 120_000 } = {}) {
  assertOwnerMayUsePlans(user);
  if (!configured()) throw err(503, 'plans_not_configured', "The plans bridge is not configured on this server.");
  const body = Buffer.from(JSON.stringify({ userId: user.id, exp: Date.now() + ttlMs })).toString('base64url');
  const mac = createHmac('sha256', config.plans.token).update(body).digest('base64url');
  return `${body}.${mac}`;
}

// The model list is a process spawn on the far side, and the picker asks for it
// on every render, so it is cached briefly as the brief requires.
const TTL_MS = 60_000;
let cache = { at: 0, models: [] };

export async function listModels({ refresh = false } = {}) {
  if (!configured()) return [];
  if (!refresh && Date.now() - cache.at < TTL_MS) return cache.models;
  try {
    const r = await fetch(`${base()}/models`, {
      headers: { authorization: `Bearer ${config.plans.token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const body = await r.json();
    cache = { at: Date.now(), models: (body?.data || []).map((m) => m.id).filter((id) => typeof id === 'string') };
  } catch {
    // A bridge that is down or signed out is reported as "no plans", which is
    // what the picker needs; it is not an error the operator must act on.
    cache = { at: Date.now(), models: [] };
  }
  return cache.models;
}

export const _resetModelCache = () => { cache = { at: 0, models: [] }; };

/** True when at least one plan is signed in, so the provider may be offered. */
export const plansAvailable = async (opts) => (await listModels(opts)).length > 0;

/**
 * One completion through the plan. Mirrors generateText()'s contract so the
 * generator's stages do not need to know which provider answered.
 */
export async function planCompletion({ model, system, prompt, images = [], jsonSchema = null, maxTokens }) {
  if (!configured()) throw err(503, 'plans_not_configured', "The plans bridge is not configured on this server.");
  const { user, sessionId } = planContext();
  assertOwnerMayUsePlans(user);
  if (!sessionId) throw err(500, 'plans_session_missing', "No conversation id is in scope for this plan request.");

  const content = [
    { type: 'text', text: prompt },
    ...images.map((x) => ({ type: 'image_url', image_url: { url: `data:${x.mime};base64,${x.data}` } })),
  ];
  const body = {
    model, max_tokens: maxTokens,
    messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content }],
    ...(jsonSchema ? { response_format: { type: 'json_schema', json_schema: { name: 'content_plan', strict: true, schema: jsonSchema } } } : {}),
  };

  let r;
  try {
    r = await fetch(`${base()}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.plans.token}`,
        'content-type': 'application/json',
        // One working directory per conversation on the bridge, so two runs
        // never resume each other's Codex thread.
        'x-lrm-session': String(sessionId),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Number(config.plans.timeoutMs || 330_000)),
    });
  } catch (e) {
    throw err(504, 'plans_unreachable', `The plans bridge did not answer: ${e.message}`);
  }

  const payload = await r.json().catch(() => ({}));
  if (!r.ok) {
    const code = payload?.error?.code || 'plans_failed';
    // The bridge's own wording for a signed-out plan is the actionable one.
    if (code === 'plan_signed_out' || r.status === 409) throw err(409, 'plan_signed_out', payload?.error?.message || SIGNED_OUT);
    throw err(r.status === 504 ? 504 : 502, code, payload?.error?.message || `The plan request failed (HTTP ${r.status}).`);
  }
  const text = payload?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw err(502, 'plans_empty', "The plan returned an empty answer.");
  return text;
}
