// OAuth handoff never publishes. Only a logged-in dashboard user may approve.
import { all, one, run, id, now, sha256 } from '../db.js';
import { err, parseJSON } from '../util.js';
import { assertAccount } from './scope.js';
import * as media from './media.js';
import { config } from '../config.js';
import { downloadImage } from './ai-images.js';

function requireOAuth(auth) {
  if (auth?.via !== 'oauth' || auth.scope !== 'write') throw err(403, 'oauth_required', 'Hubungkan aplikasi AI dengan OAuth pribadi dan izin tulis. API key tidak dapat mengirim draf AI.');
}
export function getDraft(user, draftId) {
  if (typeof draftId !== 'string' || draftId.length > 100) throw err(400, 'validation_failed', 'ID draf tidak valid.');
  const draft = one('SELECT * FROM ai_drafts WHERE id=? AND user_id=?', draftId, user.id);
  if (!draft) throw err(404, 'not_found', 'Draf AI tidak ditemukan.');
  const targets = parseJSON(draft.targets, []);
  for (const target of targets) assertAccount(user, target.account_id);
  return { id: draft.id, content: draft.content, targets, media_ids: parseJSON(draft.media_ids, []),
    media: parseJSON(draft.media_ids, []).map(mid => media.publicMedia(media.getMedia(mid))),
    scheduled_at: draft.scheduled_at, created_at: draft.created_at, status: draft.status, post_id: draft.post_id,
    source: 'AI OAuth', compose_url: `${config.publicUrl}/#/compose?ai_draft=${draft.id}` };
}
export function listDrafts(user) {
  return all("SELECT id FROM ai_drafts WHERE user_id=? AND status='pending' ORDER BY created_at DESC LIMIT 50", user.id)
    .flatMap(d => { try { return [getDraft(user, d.id)]; } catch { return []; } });
}
export async function receiveDraft(auth, body) {
  requireOAuth(auth);
  if (!Array.isArray(body.targets) || !body.targets.length || body.targets.length > 20) throw err(400, 'validation_failed', 'Pilih 1–20 akun tujuan.');
  if (body.targets.some(t => !t || typeof t.account_id !== 'string')) throw err(400, 'validation_failed', 'ID akun tujuan tidak valid.');
  for (const target of body.targets) assertAccount(auth.user, target.account_id);
  if (body.targets.some(t => t.media_ids !== undefined)) throw err(400, 'validation_failed', 'Kirim gambar bersama melalui images/media_ids pada draf.');
  for (const target of body.targets) if (target.options?.cover_media_id && media.getMedia(target.options.cover_media_id).user_id !== auth.user.id) throw err(404, 'not_found', 'Cover pribadi tidak ditemukan.');
  if (body.scheduled_at && (typeof body.scheduled_at !== 'string' || !Number.isFinite(Date.parse(body.scheduled_at)))) throw err(400, 'validation_failed', 'Waktu usulan harus berupa ISO 8601.');
  if (typeof body.content !== 'string' || body.content.length > 10000) throw err(400, 'validation_failed', 'Caption wajib berupa teks, maksimal 10.000 karakter.');
  const images = body.images || [], existing = body.media_ids || [];
  if (!Array.isArray(images) || !Array.isArray(existing) || images.length + existing.length > 10) throw err(400, 'validation_failed', 'Maksimal 10 gambar/media.');
  for (const mid of existing) {
    if (typeof mid !== 'string') throw err(400, 'validation_failed', 'ID media tidak valid.');
    if (media.getMedia(mid).user_id !== auth.user.id) throw err(404, 'not_found', 'Gunakan media milik pengguna yang tersambung.');
  }
  const requestId = body.request_id;
  if (typeof requestId !== 'string' || !requestId.trim() || requestId.length > 100) throw err(400, 'validation_failed', 'request_id wajib diisi (maksimal 100 karakter).');
  const hash = sha256(JSON.stringify({ content: body.content, targets: body.targets, images, existing, scheduled_at: body.scheduled_at || null }));
  const previous = one('SELECT * FROM ai_drafts WHERE user_id=? AND request_id=?', auth.user.id, requestId);
  if (previous) {
    if (previous.request_hash !== hash) throw err(409, 'idempotency_conflict', 'request_id sudah dipakai untuk draf berbeda.');
    return { ...getDraft(auth.user, previous.id), replayed: true };
  }
  let total = 0;
  const decoded = [];
  for (const image of images) {
    if (image?.url) {
      if (image.base64) throw err(400, 'validation_failed', 'Pilih url atau base64 untuk setiap gambar.');
      const buffer = await downloadImage(image.url);
      total += buffer.length;
      if (total > 20 * 1024 * 1024 || media.sniff(buffer)?.kind !== 'image') throw err(400, 'validation_failed', 'Hanya JPEG/PNG dengan total maksimal 20 MB.');
      decoded.push(buffer);
      continue;
    }
    if (typeof image?.base64 !== 'string' || image.base64.length > 12 * 1024 * 1024) throw err(400, 'validation_failed', 'Gambar harus base64 JPEG/PNG, maksimal 8 MB.');
    const data = image.base64.replace(/^data:image\/(?:png|jpeg);base64,/, '');
    if (!data || !/^[A-Za-z0-9+/]*={0,2}$/.test(data) || data.length % 4) throw err(400, 'validation_failed', 'Base64 gambar tidak valid.');
    const buffer = Buffer.from(data, 'base64');
    total += buffer.length;
    if (buffer.length > media.LIMITS.image || total > 20 * 1024 * 1024 || media.sniff(buffer)?.kind !== 'image') throw err(400, 'validation_failed', 'Hanya JPEG/PNG, maksimal 8 MB per gambar dan 20 MB total.');
    decoded.push(buffer);
  }
  const created = [];
  try {
    for (let index = 0; index < decoded.length; index++) {
      created.push((await media.saveBuffer(auth.user.id, decoded[index], { inLibrary: false, originalName: `ai-image-${index + 1}` })).id);
    }
    // Recheck assignments after the async image import.
    for (const target of body.targets) assertAccount(auth.user, target.account_id);
    const draftId = id('ai');
    run('INSERT INTO ai_drafts(id,user_id,oauth_token_id,request_id,request_hash,content,media_ids,targets,scheduled_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
      draftId, auth.user.id, auth.credentialId, requestId, hash, body.content, JSON.stringify([...existing, ...created]), JSON.stringify(body.targets), body.scheduled_at || null, now());
    return getDraft(auth.user, draftId);
  } catch (error) {
    for (const mid of created) { try { media.deleteMedia(mid); } catch {} }
    // Concurrent retry may finish the same idempotent request first.
    const retry = one('SELECT * FROM ai_drafts WHERE user_id=? AND request_id=?', auth.user.id, requestId);
    if (retry?.request_hash === hash) return { ...getDraft(auth.user, retry.id), replayed: true };
    throw error;
  }
}
export function approvedPost(user, draftId) {
  return getDraft(user, draftId).post_id;
}
export function markApproved(user, draftId, postId) {
  run("UPDATE ai_drafts SET status='approved',post_id=? WHERE id=? AND user_id=?", postId, draftId, user.id);
}
