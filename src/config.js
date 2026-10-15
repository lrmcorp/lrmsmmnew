import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Minimal .env loader (no dependency)
const envFile = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const env = process.env;
const PORT = Number(env.PORT || 3000);
const PUBLIC_URL = (env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const MOCK = env.META_MOCK === '1';

if (!env.ENCRYPTION_KEY && !MOCK && env.NODE_ENV === 'production') {
  throw new Error('ENCRYPTION_KEY wajib diisi di production (64 hex char). Buat dengan: openssl rand -hex 32');
}

export const config = {
  port: PORT,
  publicUrl: PUBLIC_URL,
  dataDir: path.resolve(env.DATA_DIR || './data'),
  dbFile: path.resolve(env.DATA_DIR || './data', env.DB_FILE || 'siar.db'),
  mediaDir: path.resolve(env.DATA_DIR || './data', 'media'),
  // 32-byte key for AES-256-GCM, hex encoded
  encryptionKey: Buffer.from(env.ENCRYPTION_KEY || crypto.createHash('sha256').update('siar-dev-key').digest('hex'), 'hex'),
  allowSignup: env.ALLOW_SIGNUP === '1',
  timezone: env.APP_TIMEZONE || 'Asia/Jakarta',
  mock: MOCK,
  workerIntervalMs: Number(env.WORKER_INTERVAL_MS || 15000),
  disableWorker: env.DISABLE_WORKER === '1',

  instagram: {
    appId: env.IG_APP_ID || 'mock-ig-app',
    appSecret: env.IG_APP_SECRET || 'mock-ig-secret',
    authorizeUrl: MOCK ? `${PUBLIC_URL}/__mock/ig/oauth/authorize` : 'https://www.instagram.com/oauth/authorize',
    tokenUrl: MOCK ? `${PUBLIC_URL}/__mock/ig/oauth/access_token` : 'https://api.instagram.com/oauth/access_token',
    graph: MOCK ? `${PUBLIC_URL}/__mock/ig/graph` : 'https://graph.instagram.com',
    version: env.IG_API_VERSION || 'v23.0',
    scopes: ['instagram_business_basic', 'instagram_business_content_publish', 'instagram_business_manage_comments', 'instagram_business_manage_insights'],
  },
  threads: {
    appId: env.THREADS_APP_ID || 'mock-th-app',
    appSecret: env.THREADS_APP_SECRET || 'mock-th-secret',
    authorizeUrl: MOCK ? `${PUBLIC_URL}/__mock/th/oauth/authorize` : 'https://threads.net/oauth/authorize',
    graph: MOCK ? `${PUBLIC_URL}/__mock/th/graph` : 'https://graph.threads.net',
    version: env.THREADS_API_VERSION || 'v1.0',
    scopes: ['threads_basic', 'threads_content_publish', 'threads_read_replies', 'threads_manage_replies', 'threads_manage_insights'],
  },
  smtp: env.SMTP_URL || null,
};

fs.mkdirSync(config.mediaDir, { recursive: true });
