// One chat turn: prepare a workspace, run Codex, return its last message.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { runCodex, execArgs, readLastMessage, loginStatus, looksSignedOut, CodexError } from './codex.js';
import { workspaceFor, markTurn, resetWorkspace } from './sessions.js';
import { promptFrom, restartPrompt, imagesOf, schemaOf, completion, chunk, sse, SSE_DONE, newId } from './openai.js';

const SIGNED_OUT = 'Codex is not signed in yet. Sign in on Config → AI plans.';
// Login state changes rarely and `codex login status` spawns a process, so it is
// cached briefly. Short enough that signing in shows up without a restart.
const STATUS_TTL_MS = 15_000;
let cached = { at: 0, value: null };

export async function status({ force = false } = {}) {
  if (!force && cached.value && Date.now() - cached.at < STATUS_TTL_MS) return cached.value;
  const value = await loginStatus();
  cached = { at: Date.now(), value };
  return value;
}
export const _resetStatusCache = () => { cached = { at: 0, value: null }; };

async function writeTemp(cwd, name, data) {
  const file = path.join(cwd, name);
  await fs.writeFile(file, data);
  return file;
}

/** Run Codex once and return its last message, or throw a CodexError. */
async function attempt({ cwd, prompt, model, resume, schema, images, signal }) {
  const stamp = crypto.randomBytes(8).toString('hex');
  const outFile = path.join(cwd, `.out-${stamp}.txt`);
  const schemaFile = schema ? await writeTemp(cwd, `.schema-${stamp}.json`, JSON.stringify(schema)) : null;
  const imageFiles = [];
  for (const [i, img] of images.entries()) {
    const ext = /png/i.test(img.mime) ? 'png' : /webp/i.test(img.mime) ? 'webp' : 'jpg';
    imageFiles.push(await writeTemp(cwd, `.img-${stamp}-${i}.${ext}`, img.buffer));
  }
  try {
    const args = execArgs({ prompt, outFile, model, resume, schemaFile, images: imageFiles });
    const r = await runCodex(args, { cwd, signal });
    const message = await readLastMessage(outFile);
    if (r.timedOut) throw new CodexError('timeout', `Codex did not finish in time (${r.timedOut}).`, { status: 504, stderr: r.stderr });
    if (r.spawnError) throw new CodexError('codex_unavailable', 'The Codex CLI could not be started.', { status: 503, stderr: r.stderr });
    if (r.code !== 0 || message === null) {
      const detail = `${r.stderr || ''}${r.stdout || ''}`;
      if (looksSignedOut(detail)) throw new CodexError('plan_signed_out', SIGNED_OUT, { status: 409, stderr: detail });
      throw new CodexError('codex_failed', `Codex exited with ${r.code}.`, { status: 502, stderr: detail });
    }
    return message;
  } finally {
    for (const f of [schemaFile, ...imageFiles]) if (f) fs.rm(f, { force: true }).catch(() => {});
  }
}

export async function runTurn({ body, sessionId, model, stream, res, signal }) {
  const current = await status();
  if (!current.signedIn) throw new CodexError('plan_signed_out', SIGNED_OUT, { status: 409 });

  const { cwd, resume } = await workspaceFor(sessionId);
  const schema = schemaOf(body);
  const images = imagesOf(body.messages);
  const id = newId('chatcmpl');

  let content;
  try {
    content = await attempt({ cwd, prompt: promptFrom(body.messages, { resume }), model, resume, schema, images, signal });
  } catch (e) {
    // A thread can be gone: the volume was cleared, the session expired, or the
    // CLI pruned it. Resuming then fails immediately, and the turn is retried
    // as a first message carrying the conversation so far, so the caller sees a
    // continuous conversation rather than an error it cannot act on.
    if (resume && e instanceof CodexError && e.code !== 'plan_signed_out' && e.code !== 'timeout') {
      await resetWorkspace(cwd);
      content = await attempt({ cwd, prompt: restartPrompt(body.messages), model, resume: false, schema, images, signal });
    } else throw e;
  }
  await markTurn(cwd);
  // Signing out mid-conversation only shows up as a failed turn, so a success
  // is also the signal that the cached status is still good.
  if (!stream) return res.json(completion({ id, model, content }));

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  // Codex reports its final message only when the turn ends, so there is no
  // partial output to forward. The stream is shaped correctly but arrives at
  // once: a well-formed single delta rather than a fake typing effect.
  res.write(sse(chunk({ id, model, delta: { role: 'assistant', content: '' } })));
  res.write(sse(chunk({ id, model, delta: { content } })));
  res.write(sse(chunk({ id, model, delta: {}, finish: 'stop' })));
  res.write(SSE_DONE);
  res.end();
}
