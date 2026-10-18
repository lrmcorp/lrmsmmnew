import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns/promises';
import net from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { one, all, run, id, now } from '../db.js';
import { err, randomToken, parseJSON } from '../util.js';
import { config } from '../config.js';

const exec = promisify(execFile);
const MB = 1024 * 1024;
export const LIMITS = { image: 8 * MB, video: 300 * MB, direct: 100 * MB, part: 8 * MB };

let hasFfmpeg = null;
async function ffmpegAvailable() {
  if (hasFfmpeg === null) { try { await exec('ffprobe', ['-version']); hasFfmpeg = true; } catch { hasFfmpeg = false; } }
  return hasFfmpeg;
}

export function sniff(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { kind: 'image', mime: 'image/jpeg', ext: 'jpg' };
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { kind: 'image', mime: 'image/png', ext: 'png' };
  if (buf.length >= 12 && buf.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('latin1');
    return brand.startsWith('qt') ? { kind: 'video', mime: 'video/quicktime', ext: 'mov' } : { kind: 'video', mime: 'video/mp4', ext: 'mp4' };
  }
  return null;
}

export function publicMedia(m) {
  if (!m) return null;
  return {
    id: m.id, type: m.kind, mime_type: m.mime, size_bytes: m.size_bytes, width: m.width, height: m.height,
    duration_ms: m.duration_ms, alt_text: m.alt_text, in_library: !!m.in_library, status: m.status,
    url: m.status === 'ready' ? mediaUrl(m) : null, original_name: m.original_name, created_at: m.created_at,
  };
}
export const mediaUrl = (m) => `${config.publicUrl}/m/${m.public_token}.${m.mime === 'image/jpeg' ? 'jpg' : m.mime === 'video/quicktime' ? 'mov' : m.mime === 'video/mp4' ? 'mp4' : 'png'}`;

/** Validate + normalise a file on disk and register it. */
async function finalize(mediaId, filePath) {
  const fd = fs.openSync(filePath, 'r'); const head = Buffer.alloc(16); fs.readSync(fd, head, 0, 16, 0); fs.closeSync(fd);
  const t = sniff(head);
  if (!t) { fs.rmSync(filePath, { force: true }); throw err(400, 'media_invalid_format', 'Format tidak didukung. Pakai JPEG, PNG, MP4, atau MOV.'); }
  let size = fs.statSync(filePath).size;
  let { mime, kind, ext } = t;
  let width = null, height = null, duration = null;
  let finalPath = `${filePath}.${ext}`;

  if (kind === 'image') {
    if (size > LIMITS.image) { fs.rmSync(filePath, { force: true }); throw err(400, 'image_too_large', 'Gambar terlalu besar (maksimal 8 MB)'); }
    if (mime === 'image/png') {
      // Instagram only accepts JPEG — convert once on ingest.
      finalPath = `${filePath}.jpg`;
      await sharp(filePath).flatten({ background: '#ffffff' }).jpeg({ quality: 90, mozjpeg: true }).toFile(finalPath);
      fs.rmSync(filePath, { force: true });
      mime = 'image/jpeg'; size = fs.statSync(finalPath).size;
    } else {
      fs.renameSync(filePath, finalPath);
    }
    const meta = await sharp(finalPath).metadata();
    width = meta.width; height = meta.height;
  } else {
    if (size > LIMITS.video) { fs.rmSync(filePath, { force: true }); throw err(400, 'video_too_large', 'Video terlalu besar (maksimal 300 MB)'); }
    fs.renameSync(filePath, finalPath);
    if (await ffmpegAvailable()) {
      try {
        const { stdout } = await exec('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', finalPath]);
        const j = JSON.parse(stdout);
        width = j.streams?.[0]?.width ?? null; height = j.streams?.[0]?.height ?? null;
        duration = j.format?.duration ? Math.round(Number(j.format.duration) * 1000) : null;
        // Meta requires the moov atom at the start (fast start). Remux without re-encoding.
        const fixed = `${finalPath}.fs.${ext}`;
        await exec('ffmpeg', ['-y', '-v', 'error', '-i', finalPath, '-c', 'copy', '-movflags', '+faststart', fixed]);
        fs.renameSync(fixed, finalPath); size = fs.statSync(finalPath).size;
      } catch (e) { console.warn('[media] ffprobe/ffmpeg failed:', e.message); }
    }
  }
  run(`UPDATE media SET kind=?, mime=?, path=?, size_bytes=?, width=?, height=?, duration_ms=?, status='ready' WHERE id=?`,
    kind, mime, finalPath, size, width, height, duration, mediaId);
  return publicMedia(one('SELECT * FROM media WHERE id=?', mediaId));
}

function newRow(userId, { originalName, inLibrary = true, status = 'uploading' } = {}) {
  const mid = id('m');
  run('INSERT INTO media(id,user_id,kind,mime,public_token,original_name,in_library,status) VALUES(?,?,?,?,?,?,?,?)',
    mid, userId, 'image', 'application/octet-stream', randomToken(24), originalName ? String(originalName).slice(0, 200) : null, inLibrary ? 1 : 0, status);
  return mid;
}

export async function saveBuffer(userId, buf, opts = {}) {
  if (!buf?.length) throw err(400, 'validation_failed', 'File kosong');
  if (buf.length > LIMITS.direct) throw err(400, 'validation_failed', 'Upload langsung maksimal 100 MB. Pakai upload terpotong untuk video besar.');
  const mid = newRow(userId, opts);
  const p = path.join(config.mediaDir, mid);
  fs.writeFileSync(p, buf);
  try { const m = await finalize(mid, p); if (opts.alt_text) return setAlt(mid, opts.alt_text); return m; }
  catch (e) {
    for (const suffix of ['', '.jpg', '.png', '.mp4', '.mov']) fs.rmSync(p + suffix, { force: true });
    run('DELETE FROM media WHERE id=?', mid); throw e;
  }
}

// ---- SSRF-safe fetch from a public URL ----
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const l = ip.toLowerCase();
  return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l.startsWith('::ffff:127.') || l.startsWith('::ffff:10.') || l.startsWith('::ffff:192.168.');
}

export async function fromUrl(userId, rawUrl, opts = {}) {
  let u;
  try { u = new URL(rawUrl); } catch { throw err(400, 'validation_failed', 'URL tidak valid'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw err(400, 'validation_failed', 'Hanya http/https');
  if (u.port && !['80', '443'].includes(u.port)) throw err(400, 'validation_failed', 'Hanya port 80/443');
  if (!config.mock) {
    const addrs = await dns.lookup(u.hostname, { all: true }).catch(() => []);
    if (!addrs.length) throw err(400, 'media_fetch_failed', 'Host tidak ditemukan');
    if (addrs.some((a) => isPrivateIp(a.address))) throw err(400, 'validation_failed', 'URL mengarah ke jaringan privat');
  }
  let res;
  try { res = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(120000) }); }
  catch (e) { throw err(400, 'media_fetch_failed', `Gagal mengunduh: ${e.message}`); }
  if (!res.ok) throw err(400, 'media_fetch_failed', `Gagal mengunduh (HTTP ${res.status})`);
  const len = Number(res.headers.get('content-length') || 0);
  if (len > LIMITS.video) throw err(400, 'video_too_large', 'File lebih dari 300 MB');
  const mid = newRow(userId, { originalName: path.basename(u.pathname) || 'remote', inLibrary: opts.in_library ?? true });
  const p = path.join(config.mediaDir, mid);
  const out = fs.createWriteStream(p);
  let total = 0;
  try {
    for await (const chunk of res.body) {
      total += chunk.length;
      if (total > LIMITS.video) throw err(400, 'video_too_large', 'File lebih dari 300 MB');
      if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
    }
    await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
    const m = await finalize(mid, p);
    return opts.alt_text ? setAlt(mid, opts.alt_text) : m;
  } catch (e) {
    out.destroy(); fs.rmSync(p, { force: true }); run('DELETE FROM media WHERE id=?', mid); throw e;
  }
}

// ---- chunked uploads ----
export function createUpload(userId, { mime_type, size_bytes, original_name, in_library = true }) {
  const size = Number(size_bytes);
  if (!size || size > LIMITS.video) throw err(400, 'validation_failed', 'size_bytes wajib dan maksimal 300 MB');
  if (!/^(image\/(jpeg|png)|video\/(mp4|quicktime))$/.test(String(mime_type))) throw err(400, 'media_invalid_format', 'mime_type harus image/jpeg, image/png, video/mp4, atau video/quicktime');
  const mid = newRow(userId, { originalName: original_name, inLibrary: in_library });
  const partCount = Math.ceil(size / LIMITS.part);
  run('UPDATE media SET part_size=?, part_count=?, size_bytes=? WHERE id=?', LIMITS.part, partCount, size, mid);
  fs.mkdirSync(path.join(config.mediaDir, `${mid}.parts`), { recursive: true });
  return { id: mid, part_size: LIMITS.part, part_count: partCount, status: 'uploading' };
}

export function putPart(mediaId, n, buf) {
  const m = one("SELECT * FROM media WHERE id=? AND status='uploading'", mediaId);
  if (!m) throw err(404, 'not_found', 'Upload tidak ditemukan');
  n = Number(n);
  if (!Number.isInteger(n) || n < 1 || n > m.part_count) throw err(400, 'validation_failed', `Nomor part harus 1..${m.part_count}`);
  const last = n === m.part_count;
  const expected = last ? m.size_bytes - m.part_size * (m.part_count - 1) : m.part_size;
  if (buf.length !== expected) throw err(400, 'validation_failed', `Part ${n} harus tepat ${expected} byte (diterima ${buf.length})`);
  fs.writeFileSync(path.join(config.mediaDir, `${mediaId}.parts`, String(n)), buf);
}

export async function completeUpload(mediaId) {
  const m = one("SELECT * FROM media WHERE id=? AND status='uploading'", mediaId);
  if (!m) throw err(404, 'not_found', 'Upload tidak ditemukan');
  const dir = path.join(config.mediaDir, `${mediaId}.parts`);
  const missing = [];
  for (let i = 1; i <= m.part_count; i++) if (!fs.existsSync(path.join(dir, String(i)))) missing.push(i);
  if (missing.length) throw err(400, 'validation_failed', 'Part belum lengkap', { missing_parts: missing });
  const p = path.join(config.mediaDir, mediaId);
  const fd = fs.openSync(p, 'w');
  for (let i = 1; i <= m.part_count; i++) fs.writeSync(fd, fs.readFileSync(path.join(dir, String(i))));
  fs.closeSync(fd);
  fs.rmSync(dir, { recursive: true, force: true });
  try { return await finalize(mediaId, p); }
  catch (e) { run('DELETE FROM media WHERE id=?', mediaId); throw e; }
}

export function setAlt(mediaId, alt) {
  if (alt != null && String(alt).length > 1000) throw err(400, 'validation_failed', 'alt_text maksimal 1.000 karakter');
  if (!run('UPDATE media SET alt_text=? WHERE id=?', alt ?? null, mediaId).changes) throw err(404, 'not_found', 'Media tidak ditemukan');
  return publicMedia(one('SELECT * FROM media WHERE id=?', mediaId));
}

export function getMedia(mediaId) {
  const m = one("SELECT * FROM media WHERE id=? AND status='ready'", mediaId);
  if (!m) throw err(404, 'not_found', `Media ${mediaId} tidak ditemukan`, { media_id: mediaId });
  return m;
}

export function listMedia({ limit = 50, cursor } = {}) {
  limit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const rows = cursor
    ? all("SELECT * FROM media WHERE status='ready' AND in_library=1 AND created_at < ? ORDER BY created_at DESC LIMIT ?", cursor, limit + 1)
    : all("SELECT * FROM media WHERE status='ready' AND in_library=1 ORDER BY created_at DESC LIMIT ?", limit + 1);
  const more = rows.length > limit; const page = rows.slice(0, limit);
  return { data: page.map(publicMedia), next_cursor: more ? page.at(-1).created_at : null };
}

function mediaInActiveUse(mediaId) {
  const like = `%"${mediaId}"%`;
  if (one("SELECT 1 FROM generator_runs WHERE status IN ('planned','queued','running','review','failed') AND (media_ids LIKE ? OR reference_media_ids LIKE ?)", like, like)) return true;
  if (one("SELECT 1 FROM ai_drafts WHERE status='pending' AND media_ids LIKE ?", like)) return true;
  return !!one(`SELECT 1 FROM post_targets t JOIN posts p ON p.id=t.post_id
    WHERE t.status IN ('pending','publishing') AND (p.media_ids LIKE ? OR t.media_ids LIKE ? OR t.options LIKE ?)`, like, like, like);
}

export function deleteMedia(mediaId) {
  const m = one('SELECT * FROM media WHERE id=?', mediaId);
  if (!m) throw err(404, 'not_found', 'Media tidak ditemukan');
  if (mediaInActiveUse(mediaId)) throw err(409, 'media_in_use', 'Media dipakai post terjadwal');
  if (m.path) fs.rmSync(m.path, { force: true });
  run('DELETE FROM media WHERE id=?', mediaId);
}

/** Remove published uploads once every reference is finished; keep metadata for history. */
export function purgePublishedMedia() {
  let removed = 0;
  for (const m of all("SELECT * FROM media WHERE status='ready'")) {
    const like = `%"${m.id}"%`;
    if (one("SELECT 1 FROM generator_runs WHERE status IN ('planned','queued','running','review','failed') AND (media_ids LIKE ? OR reference_media_ids LIKE ?)", like, like)) continue;
    if (one("SELECT 1 FROM ai_drafts WHERE status='pending' AND media_ids LIKE ?", like)) continue;
    const uses = all(`SELECT t.status FROM post_targets t JOIN posts p ON p.id=t.post_id
      WHERE p.media_ids LIKE ? OR t.media_ids LIKE ? OR t.options LIKE ?`, like, like, like);
    if (!uses.some(u => u.status === 'published')) continue;
    if (uses.some(u => !['published', 'cancelled'].includes(u.status))) continue;
    if (m.path) fs.rmSync(m.path, { force: true });
    run("UPDATE media SET path=NULL, size_bytes=0, status='purged', in_library=0 WHERE id=?", m.id);
    removed++;
  }
  return removed;
}

/** Garbage-collect non-library media: 7 days if never used, 30 days after last use finished. */
export function gcMedia() {
  purgePublishedMedia();
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString();
  for (const m of all('SELECT * FROM media WHERE in_library=0 AND created_at < ?', weekAgo)) {
    const like = `%"${m.id}"%`;
    if (one("SELECT 1 FROM generator_runs WHERE status IN ('planned','queued','running','review','failed') AND (media_ids LIKE ? OR reference_media_ids LIKE ?)", like, like)) continue;
    if (one("SELECT 1 FROM ai_drafts WHERE status='pending' AND media_ids LIKE ?", like)) continue;
    const uses = all('SELECT t.status, t.published_at, p.updated_at FROM post_targets t JOIN posts p ON p.id=t.post_id WHERE p.media_ids LIKE ? OR t.media_ids LIKE ? OR t.options LIKE ?', like, like, like);
    const busy = uses.some((u) => ['pending', 'publishing'].includes(u.status) || (u.published_at || u.updated_at) > monthAgo);
    if (!busy) { if (m.path) fs.rmSync(m.path, { force: true }); run('DELETE FROM media WHERE id=?', m.id); }
  }
  // stale chunked uploads
  for (const m of all("SELECT * FROM media WHERE status='uploading' AND created_at < ?", new Date(Date.now() - 864e5).toISOString())) {
    fs.rmSync(path.join(config.mediaDir, `${m.id}.parts`), { recursive: true, force: true });
    run('DELETE FROM media WHERE id=?', m.id);
  }
}

export const resolveMediaList = (ids) => (ids || []).map((mid) => getMedia(mid));
export const toPublishMedia = (m) => ({ kind: m.kind, url: mediaUrl(m), alt_text: m.alt_text || undefined, width: m.width, height: m.height, duration_ms: m.duration_ms, size: m.size_bytes });
export { parseJSON };

/** Which parts of a chunked upload already arrived — lets clients resume after a dropped connection. */
export function listParts(mediaId) {
  const m = one('SELECT * FROM media WHERE id=?', mediaId);
  if (!m) throw err(404, 'not_found', 'Upload tidak ditemukan');
  if (m.status === 'ready') return { id: m.id, status: 'ready', part_size: m.part_size, part_count: m.part_count, received: [] };
  const dir = path.join(config.mediaDir, `${mediaId}.parts`);
  const received = fs.existsSync(dir) ? fs.readdirSync(dir).map(Number).filter(Boolean).sort((a, b) => a - b) : [];
  return { id: m.id, status: m.status, part_size: m.part_size, part_count: m.part_count, received };
}

export function usage() {
  const r = one("SELECT COUNT(*) files, COALESCE(SUM(size_bytes),0) bytes FROM media WHERE status='ready'");
  const lib = one("SELECT COUNT(*) files, COALESCE(SUM(size_bytes),0) bytes FROM media WHERE status='ready' AND in_library=1");
  return { files: r.files, used_bytes: r.bytes, library_files: lib.files, library_bytes: lib.bytes };
}
