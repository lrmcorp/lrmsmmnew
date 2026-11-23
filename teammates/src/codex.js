// Everything that shells out to the Codex CLI.
//
// The bridge never speaks to OpenAI itself and never reads the credential file:
// the CLI owns the login and the model call. That is the whole point of this
// service, so nothing here may grow an HTTP client or touch ~/.codex.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export const CODEX_BIN = process.env.CODEX_BIN || 'codex';
const DEFAULT_TIMEOUT_MS = Number(process.env.CODEX_TIMEOUT_MS || 300_000);
// How long a terminating process gets to exit on its own before it is killed.
const GRACE_MS = Number(process.env.CODEX_KILL_GRACE_MS || 5_000);

export class CodexError extends Error {
  constructor(code, message, { status = 502, stderr = '' } = {}) {
    super(message);
    this.code = code; this.status = status; this.stderr = stderr;
  }
}

/**
 * Argument vector for one turn.
 *
 * First message of a conversation starts a session; every later message resumes
 * the most recent one in that working directory. `--skip-git-repo-check` is
 * required because each conversation gets a plain directory, not a repository.
 */
export function execArgs({ prompt, outFile, model, resume = false, schemaFile = null, images = [] }) {
  const args = ['exec'];
  if (resume) args.push('resume', '--last');
  args.push('--skip-git-repo-check', '-o', outFile);
  if (model) args.push('-m', model);
  if (schemaFile) args.push('--output-schema', schemaFile);
  for (const image of images) args.push('-i', image);
  // The prompt is the final positional argument. It is passed through the
  // argument vector rather than a shell, so no quoting or escaping applies.
  args.push(prompt);
  return args;
}

// Codex inherits this and nothing else. The bridge's own bearer token, the
// application's secrets and the rest of the container's environment stay out of
// the model's reach: a prompt that talks the agent into printing its environment
// must not find anything worth printing.
export function childEnv() {
  return {
    PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
    HOME: process.env.HOME || '/home/codex',
    CODEX_HOME: process.env.CODEX_HOME || path.join(process.env.HOME || '/home/codex', '.codex'),
    TERM: 'dumb',
    LANG: process.env.LANG || 'C.UTF-8',
    ...(process.env.https_proxy ? { https_proxy: process.env.https_proxy } : {}),
    ...(process.env.HTTPS_PROXY ? { HTTPS_PROXY: process.env.HTTPS_PROXY } : {}),
  };
}

/** Run one `codex` invocation to completion, bounded in time. */
export function runCodex(args, { cwd, timeoutMs = DEFAULT_TIMEOUT_MS, signal, bin = CODEX_BIN } = {}) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      cwd, env: childEnv(), stdio: ['ignore', 'pipe', 'pipe'],
      // Its own process group, so a timeout can take down the whole tree. Codex
      // spawns helpers; killing only the parent would leave them holding the CPU.
      detached: true,
    });
    let stdout = '', stderr = '', settled = false, killTimer = null;
    const stop = (why) => {
      if (settled) return;
      try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
      killTimer = setTimeout(() => {
        try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
      }, GRACE_MS);
      killTimer.unref?.();
      timedOut = why;
    };
    let timedOut = null;
    const timer = setTimeout(() => stop('timeout'), timeoutMs);
    const onAbort = () => stop('aborted');
    signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (e) => {
      if (settled) return; settled = true;
      clearTimeout(timer); clearTimeout(killTimer); signal?.removeEventListener('abort', onAbort);
      resolve({ code: -1, stdout, stderr: String(e.message), timedOut: null, spawnError: e });
    });
    child.on('close', (code) => {
      if (settled) return; settled = true;
      clearTimeout(timer); clearTimeout(killTimer); signal?.removeEventListener('abort', onAbort);
      resolve({ code, stdout, stderr, timedOut, spawnError: null });
    });
  });
}

const NOT_SIGNED_IN = /not logged in|not signed in|sign in with chatgpt|please log ?in|unauthorized|\b401\b|authentication (failed|required)|credential/i;
/** Does this failure mean "the plan is not signed in" rather than "the turn failed"? */
export const looksSignedOut = (text) => NOT_SIGNED_IN.test(String(text || ''));

/** `codex login status` -> { signedIn, raw }. Never returns the credential. */
export async function loginStatus() {
  const r = await runCodex(['login', 'status'], { cwd: os.tmpdir(), timeoutMs: 20_000 });
  const raw = `${r.stdout}${r.stderr}`.trim();
  // The CLI prints "Not logged in" when signed out; anything else on a clean
  // exit is an account line. Treated as signed out whenever it is ambiguous.
  const signedIn = r.code === 0 && raw.length > 0 && !/not logged in/i.test(raw);
  return { signedIn, raw };
}

/** Read and remove the file `-o` wrote. Absent means Codex produced no message. */
export async function readLastMessage(outFile) {
  try {
    const text = await fs.readFile(outFile, 'utf8');
    return text.replace(/\s+$/, '');
  } catch { return null; }
  finally { fs.rm(outFile, { force: true }).catch(() => {}); }
}
