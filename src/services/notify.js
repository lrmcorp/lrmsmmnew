// Transactional notifications (email via SMTP_URL, optional). Always logged.
import nodemailer from 'nodemailer';
import { all, one } from '../db.js';
import { config } from '../config.js';

let transport = null;
if (config.smtp) transport = nodemailer.createTransport(config.smtp);
const FROM = process.env.MAIL_FROM || 'LRMsmm <no-reply@localhost>';

function recipients(account) {
  const ids = new Set(all("SELECT email FROM users WHERE role='owner'").map((u) => u.email));
  if (account?.connected_by) { const u = one('SELECT email FROM users WHERE id=?', account.connected_by); if (u) ids.add(u.email); }
  return [...ids];
}

export async function notify(kind, data) {
  let subject, text;
  if (kind === 'account_expired') {
    subject = `Akun @${data.account.username} perlu disambungkan ulang`;
    text = `Token ${data.account.platform} untuk @${data.account.username} sudah tidak berlaku. Post terjadwal ke akun ini akan gagal.\n\nSambungkan ulang: ${config.publicUrl}/#/accounts`;
  } else if (kind === 'post_failed') {
    subject = `Post gagal terbit di @${data.account?.username}`;
    text = `Alasan: ${data.code} — ${data.message}\n\nCek dan coba ulang: ${config.publicUrl}/#/posts/${data.post?.id}`;
  } else return;
  console.log(`[notify] ${subject}`);
  if (!transport) return;
  try { await transport.sendMail({ from: FROM, to: recipients(data.account), subject, text }); }
  catch (e) { console.warn('[notify] email failed:', e.message); }
}
