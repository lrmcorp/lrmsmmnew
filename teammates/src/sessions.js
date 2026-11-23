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

/**
 * Returns { cwd, resume }. `resume` is true only when a previous turn in this
 * conversation actually completed, which is exactly the first-message /
 * later-message split the turn protocol needs.
 *
 * The marker is on disk rather than in memory for two reasons: a restart must
 * not turn a continuing conversation back into a first message, and a turn that
 * failed must not leave the next one trying to resume a thread that was never
 * created.
 */
export async function workspaceFor(sessionId) {
  const cwd = dirFor(sessionId);
  await fs.mkdir(cwd, { recursive: true });
  return { cwd, resume: await hasPriorTurn(cwd) };
}

const markerIn = (cwd) => path.join(cwd, '.codex-turn');
const hasPriorTurn = (cwd) => fs.access(markerIn(cwd)).then(() => true, () => false);

/** Record that this conversation now has a thread worth resuming. */
export const markTurn = (cwd) => fs.writeFile(markerIn(cwd), '', 'utf8').catch(() => {});

/** Forget a conversation's resume state, so the next turn starts a new thread. */
export const resetWorkspace = (cwd) => fs.rm(markerIn(cwd), { force: true }).catch(() => {});

export const _dirFor = dirFor;
