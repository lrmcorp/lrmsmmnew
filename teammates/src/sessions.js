// One working directory per conversation, keyed by X-LRM-Session.
//
// `codex exec resume --last` resumes the newest session *in its working
// directory*, so conversations must not share one: two interleaved chats in the
// same folder would resume each other's thread and leak context between them.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.env.WORK_DIR || '/work';
// Caller-supplied ids never become path segments directly; a hash keeps the
// name opaque, fixed-length and free of traversal or case-collision surprises.
const dirFor = (sessionId) => path.join(ROOT, crypto.createHash('sha256').update(String(sessionId)).digest('hex').slice(0, 32));

const started = new Set();

/**
 * Returns { cwd, resume }. `resume` is false the first time a conversation is
 * seen in this process, true afterwards, which is exactly the first-message /
 * later-message split the turn protocol needs.
 */
export async function workspaceFor(sessionId) {
  const cwd = dirFor(sessionId);
  await fs.mkdir(cwd, { recursive: true });
  // A restart loses the in-memory set, but a directory that already holds Codex
  // session files has a thread to resume, so the disk is the real record.
  const resume = started.has(cwd) || await hasPriorTurn(cwd);
  started.add(cwd);
  return { cwd, resume };
}

async function hasPriorTurn(cwd) {
  try { return (await fs.readdir(cwd)).includes('.codex-turn'); } catch { return false; }
}

/** Mark a conversation as having a resumable thread. */
export const markTurn = (cwd) => fs.writeFile(path.join(cwd, '.codex-turn'), '', 'utf8').catch(() => {});

/** Forget a conversation's resume state, so the next turn starts a new thread. */
export async function resetWorkspace(cwd) {
  started.delete(cwd);
  await fs.rm(path.join(cwd, '.codex-turn'), { force: true }).catch(() => {});
}

export const _dirFor = dirFor;
