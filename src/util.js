import crypto from 'node:crypto';
import { config } from './config.js';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message || code);
    this.status = status; this.code = code; this.details = details;
  }
}
export const err = (status, code, message, details) => new ApiError(status, code, message, details);

// ---- AES-256-GCM for platform tokens ----
export function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', config.encryptionKey, iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return `v1:${iv.toString('base64url')}:${c.getAuthTag().toString('base64url')}:${enc.toString('base64url')}`;
}
export function decrypt(blob) {
  const [v, iv, tag, data] = String(blob).split(':');
  if (v !== 'v1') throw new Error('unknown cipher version');
  const d = crypto.createDecipheriv('aes-256-gcm', config.encryptionKey, Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
}

// ---- password hashing (scrypt) ----
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}
export function verifyPassword(pw, stored) {
  const [alg, salt, key] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const k = crypto.scryptSync(pw, Buffer.from(salt, 'base64url'), 64, { N: 16384, r: 8, p: 1 });
  const ref = Buffer.from(key, 'base64url');
  return ref.length === k.length && crypto.timingSafeEqual(ref, k);
}

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const parseJSON = (s, fallback) => { try { return s == null ? fallback : JSON.parse(s); } catch { return fallback; } };

export function toUtcIso(input) {
  if (input == null || input === '') return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) throw err(400, 'validation_failed', 'scheduled_at must be ISO 8601 with timezone, e.g. 2026-10-15T09:00:00+07:00', { field: 'scheduled_at' });
  if (typeof input === 'string' && !/(Z|[+-]\d{2}:?\d{2})$/.test(input.trim())) {
    throw err(400, 'validation_failed', 'scheduled_at must include a timezone offset (e.g. +07:00 or Z)', { field: 'scheduled_at' });
  }
  return d.toISOString();
}
