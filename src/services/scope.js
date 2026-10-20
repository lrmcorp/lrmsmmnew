// Access scope: Owner sees everything; Representative only the social accounts assigned to them.
import { all, one, run, tx } from '../db.js';
import { err } from '../util.js';

export const ROLES = ['owner', 'rep'];
export const isOwner = (user) => user?.role === 'owner';

/** null = unrestricted (owner); otherwise array of account ids. */
export function scopeOf(user) {
  if (!user) return [];
  if (isOwner(user)) return null;
  return all(`SELECT account_id FROM user_accounts WHERE user_id=?
    UNION SELECT a.id AS account_id FROM accounts a JOIN user_companies uc ON uc.company_id=a.company_id WHERE uc.user_id=?`, user.id, user.id).map((r) => r.account_id);
}
export function canAccount(user, accountId) {
  const s = scopeOf(user);
  return s === null || s.includes(accountId);
}
export function assertAccount(user, accountId) {
  if (!canAccount(user, accountId)) throw err(404, 'not_found', `Akun ${accountId} tidak ditemukan atau tidak ditugaskan ke kamu`, { account_id: accountId });
}
/** SQL fragment restricting a column to the user's accounts. */
export function scopeSql(user, col = 'account_id') {
  const s = scopeOf(user);
  if (s === null) return ['1=1', []];
  if (!s.length) return ['0=1', []];
  return [`${col} IN (${s.map(() => '?').join(',')})`, s];
}

/** A post is visible if any of its targets is in scope; editable only if all are. */
export function postAccess(user, postId) {
  const ids = all('SELECT account_id FROM post_targets WHERE post_id=?', postId).map((r) => r.account_id);
  const s = scopeOf(user);
  if (s === null) return { view: true, edit: true };
  const inScope = ids.filter((x) => s.includes(x)).length;
  const createdByMe = !!one('SELECT 1 FROM posts WHERE id=? AND created_by=?', postId, user.id);
  return { view: inScope > 0 || createdByMe, edit: ids.length > 0 && inScope === ids.length };
}
export function assertPostView(user, postId) {
  if (!postAccess(user, postId).view) throw err(404, 'not_found', `Post ${postId} tidak ditemukan`);
}
export function assertPostEdit(user, postId) {
  const a = postAccess(user, postId);
  if (!a.view) throw err(404, 'not_found', `Post ${postId} tidak ditemukan`);
  if (!a.edit) throw err(403, 'forbidden', 'Post ini juga menuju akun yang tidak ditugaskan ke kamu. Minta Owner untuk mengubahnya.');
}

export function assignedAccounts(userId) {
  return all('SELECT account_id FROM user_accounts WHERE user_id=?', userId).map((r) => r.account_id);
}
export function setAssignments(userId, accountIds) {
  if (!Array.isArray(accountIds)) throw err(400, 'validation_failed', 'account_ids harus array');
  for (const a of accountIds) if (!one('SELECT 1 FROM accounts WHERE id=?', a)) throw err(400, 'validation_failed', `Akun ${a} tidak ada`, { account_id: a });
  tx(() => {
    run('DELETE FROM user_accounts WHERE user_id=?', userId);
    for (const a of new Set(accountIds)) run('INSERT INTO user_accounts(user_id,account_id) VALUES(?,?)', userId, a);
  });
}
export function assignAccount(userId, accountId) {
  run('INSERT OR IGNORE INTO user_accounts(user_id,account_id) VALUES(?,?)', userId, accountId);
}

export function assignedCompanies(userId) {
  return all('SELECT company_id FROM user_companies WHERE user_id=?', userId).map(r => r.company_id);
}
export function setCompanyAssignments(userId, companyIds) {
  if (!Array.isArray(companyIds) || companyIds.some(c => typeof c !== 'string' || !one('SELECT 1 FROM companies WHERE id=?', c))) throw err(400, 'validation_failed', 'company_ids harus daftar perusahaan yang valid.');
  tx(() => {
    run('DELETE FROM user_companies WHERE user_id=?', userId);
    for (const companyId of new Set(companyIds)) run('INSERT INTO user_companies(user_id,company_id) VALUES(?,?)', userId, companyId);
  });
}

// Shared catalog assets and already-validated generator snapshots stay scoped to their account.
export function canUseAccountMedia(user, mediaId, accountId) {
  if(!user||!canAccount(user,accountId))return false;
  if(one('SELECT 1 FROM account_brand_assets WHERE account_id=? AND media_id=?',accountId,mediaId))return true;
  return all("SELECT targets FROM generator_runs WHERE user_id=? AND status IN ('review','drafted','approved') AND media_ids LIKE ?",user.id,`%"${mediaId}"%`).some(r=>{
    try{return JSON.parse(r.targets).some(t=>t.account_id===accountId);}catch{return false;}
  });
}
