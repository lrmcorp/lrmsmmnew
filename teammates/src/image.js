// One image through the plan: Codex's built-in image_gen tool, which runs on the
// ChatGPT login (no OPENAI_API_KEY) and saves what it makes under
// $CODEX_HOME/generated_images. The bridge asks for exactly one image, then
// collects the file that appeared there during the turn.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { runCodex, execArgs, readLastMessage, looksSignedOut, CodexError } from './codex.js';
import { status, cliReason } from './turn.js';

const SIGNED_OUT = 'Codex is not signed in yet. Sign in on Config → AI plans.';
const IMAGE_FILE = /\.(png|jpe?g|webp)$/i;
const MAX_BYTES = 12 * 1024 * 1024;
const codexHome = () => process.env.CODEX_HOME || path.join(process.env.HOME || '/home/codex', '.codex');
export const generatedDir = () => path.join(codexHome(), 'generated_images');
const workRoot = () => process.env.WORK_DIR || '/work';

/** Every image file under dir modified at or after `since` (ms), newest first. */
async function imagesSince(dir, since) {
  const found = [];
  const walk = async (d, depth) => {
    let entries;
    try { entries = await fs.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory() && depth < 4) await walk(p, depth + 1);
      else if (e.isFile() && IMAGE_FILE.test(e.name)) {
        const s = await fs.stat(p).catch(() => null);
        if (s && s.mtimeMs >= since) found.push({ file: p, mtimeMs: s.mtimeMs, size: s.size });
      }
    }
  };
  await walk(dir, 0);
  return found.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

export const mimeOf = (buf) => buf[0] === 0x89 && buf[1] === 0x50 ? 'image/png'
  : buf[0] === 0xff && buf[1] === 0xd8 ? 'image/jpeg'
  : buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : null;

export function imageInstruction(prompt, referenceCount) {
  return [
    'Use your built-in image_gen tool to create exactly ONE image from the brief below.',
    referenceCount ? `${referenceCount} reference image(s) are attached. Follow the brief on how to use them; keep any logo or product they show faithful to the reference.` : '',
    'Do not run shell commands, do not write code, and do not use any script, CLI or API key.',
    'When the image has been generated, reply with only the word DONE.',
    '',
    'BRIEF:',
    prompt,
  ].filter((l) => l !== '').join('\n');
}

// generated_images is shared by every turn, and the result is attributed by the
// time window it appeared in. Two images at once could each claim the other's
// file, so image turns run one at a time. A plan's own rate limit makes
// parallel generation of little use anyway.
let queue = Promise.resolve();
export function generatePlanImage(opts) {
  const run = queue.then(() => generateOnce(opts));
  queue = run.catch(() => {});
  return run;
}

async function generateOnce({ prompt, references = [], signal }) {
  const current = await status();
  if (!current.signedIn) throw new CodexError('plan_signed_out', SIGNED_OUT, { status: 409 });
  await fs.mkdir(workRoot(), { recursive: true });
  const cwd = await fs.mkdtemp(path.join(workRoot(), 'img-'));
  try {
    const refFiles = [];
    for (const [i, ref] of references.entries()) {
      const ext = /png/i.test(ref.mime) ? 'png' : /webp/i.test(ref.mime) ? 'webp' : 'jpg';
      const file = path.join(cwd, `reference-${i + 1}.${ext}`);
      await fs.writeFile(file, ref.buffer);
      refFiles.push(file);
    }
    const outFile = path.join(cwd, `.out-${crypto.randomBytes(6).toString('hex')}.txt`);
    // A second of slack: some filesystems round mtimes down.
    const since = Date.now() - 1000;
    const r = await runCodex(execArgs({ outFile, images: refFiles }), { cwd, signal, input: imageInstruction(prompt, refFiles.length) });
    const message = await readLastMessage(outFile);
    const detail = `${r.stderr || ''}${r.stdout || ''}`;
    if (r.timedOut) throw new CodexError('timeout', `Codex did not finish the image in time (${r.timedOut}).`, { status: 504 });
    if (r.spawnError) throw new CodexError('codex_unavailable', 'The Codex CLI could not be started.', { status: 503 });

    // Where the tool saved it, plus the turn's own folder in case the agent
    // copied it there.
    const candidates = [...await imagesSince(generatedDir(), since), ...await imagesSince(cwd, since)]
      .filter((c) => !refFiles.includes(c.file) && c.size > 0 && c.size <= MAX_BYTES)
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    if (!candidates.length) {
      if (looksSignedOut(detail)) throw new CodexError('plan_signed_out', SIGNED_OUT, { status: 409 });
      const reason = r.code !== 0 ? cliReason(detail) : (message || '').replace(/\s+/g, ' ').slice(0, 300);
      console.error(`[teammates] image not generated (exit ${r.code}): ${detail.replace(/\s+/g, ' ').trim().slice(-600)}`);
      throw new CodexError('image_not_generated', `Codex did not produce an image${reason ? `: ${reason}` : '.'}`, { status: 502 });
    }
    const chosen = candidates[0];
    const buffer = await fs.readFile(chosen.file);
    const mime = mimeOf(buffer);
    if (!mime) throw new CodexError('image_not_generated', 'Codex produced a file that is not a PNG, JPEG or WebP image.', { status: 502 });
    // The image now lives in the application; the volume keeps no copy.
    if (chosen.file.startsWith(generatedDir())) await fs.rm(chosen.file, { force: true }).catch(() => {});
    return { buffer, mime };
  } finally {
    await fs.rm(cwd, { recursive: true, force: true }).catch(() => {});
  }
}
