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
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) throw err(400, 'validation_failed', "Company name is required and must not exceed 100 characters.");
  if (companyId) {
    if (!one('SELECT 1 FROM companies WHERE id=?', companyId)) throw err(404, 'not_found', "Company not found.");
    run('UPDATE companies SET name=? WHERE id=?', name.trim(), companyId);
  } else {
    companyId = id('co');
    run('INSERT INTO companies(id,name) VALUES(?,?)', companyId, name.trim());
  }
  return one('SELECT * FROM companies WHERE id=?', companyId);
}
export function moveAccount(accountId, companyId) {
  if (!one("SELECT 1 FROM accounts WHERE id=? AND status!='disconnected'", accountId)) throw err(404, 'not_found', "Account not found.");
  if (companyId !== null && (typeof companyId !== 'string' || !one('SELECT 1 FROM companies WHERE id=?', companyId))) throw err(400, 'validation_failed', "Company not found.");
  run('UPDATE accounts SET company_id=? WHERE id=?', companyId, accountId);
}

export function deleteCompany(companyId) {
 if (!one('SELECT 1 FROM companies WHERE id=?',companyId)) throw err(404,'not_found',"Company not found.");
 if (one("SELECT 1 FROM accounts WHERE company_id=? AND status!='disconnected'",companyId)) throw err(409,'company_not_empty',"Move or disconnect all accounts before deleting the company.");
 run('UPDATE accounts SET company_id=NULL WHERE company_id=?',companyId);run('DELETE FROM companies WHERE id=?',companyId);
}
