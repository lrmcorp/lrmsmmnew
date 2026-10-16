import { all, one, run, id } from '../db.js';
import { err } from '../util.js';
import { scopeOf, assignedCompanies } from './scope.js';

export function listCompanies(user) {
  const scope = scopeOf(user);
  const assigned = scope === null ? null : assignedCompanies(user.id);
  return all('SELECT * FROM companies ORDER BY name COLLATE NOCASE').map(company => {
    const accounts = all("SELECT id FROM accounts WHERE company_id=? AND status!='disconnected'", company.id).filter(a => scope === null || scope.includes(a.id));
    return { ...company, accounts_count: accounts.length, full_access: scope === null || assigned.includes(company.id) };
  }).filter(company => scope === null || assigned.includes(company.id) || company.accounts_count > 0);
}
export function saveCompany(companyId, name) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) throw err(400, 'validation_failed', 'Nama perusahaan wajib diisi, maksimal 100 karakter.');
  if (companyId) {
    if (!one('SELECT 1 FROM companies WHERE id=?', companyId)) throw err(404, 'not_found', 'Perusahaan tidak ditemukan.');
    run('UPDATE companies SET name=? WHERE id=?', name.trim(), companyId);
  } else {
    companyId = id('co');
    run('INSERT INTO companies(id,name) VALUES(?,?)', companyId, name.trim());
  }
  return one('SELECT * FROM companies WHERE id=?', companyId);
}
export function moveAccount(accountId, companyId) {
  if (!one("SELECT 1 FROM accounts WHERE id=? AND status!='disconnected'", accountId)) throw err(404, 'not_found', 'Akun tidak ditemukan.');
  if (companyId !== null && (typeof companyId !== 'string' || !one('SELECT 1 FROM companies WHERE id=?', companyId))) throw err(400, 'validation_failed', 'Perusahaan tidak ditemukan.');
  run('UPDATE accounts SET company_id=? WHERE id=?', companyId, accountId);
}
