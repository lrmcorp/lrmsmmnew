// Audit trail of who did what (dashboard, API key, or AI app).
import { all, run } from '../db.js';

export function audit(auth, action, targetType, targetId, details) {
  try {
    run('INSERT INTO audit_log(user_id,user_email,via,action,target_type,target_id,details) VALUES(?,?,?,?,?,?,?)',
      auth?.user?.id || null, auth?.user?.email || null, auth?.via || 'system', action, targetType || null, targetId || null,
      details ? JSON.stringify(details).slice(0, 2000) : null);
  } catch (e) { console.warn('[audit]', e.message); }
}

export function listAudit({ limit = 50, before, user_id, action } = {}) {
  limit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const w = ['1=1']; const p = [];
  if (before) { w.push('id < ?'); p.push(Number(before)); }
  if (user_id) { w.push('user_id = ?'); p.push(user_id); }
  if (action) { w.push('action LIKE ?'); p.push(`${action}%`); }
  const rows = all(`SELECT * FROM audit_log WHERE ${w.join(' AND ')} ORDER BY id DESC LIMIT ?`, ...p, limit + 1);
  const more = rows.length > limit; const page = rows.slice(0, limit);
  return { data: page.map((r) => ({ ...r, details: r.details ? JSON.parse(r.details) : null })), next_cursor: more ? String(page.at(-1).id) : null };
}
