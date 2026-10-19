import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { config } from './config.js';

export const db = new DatabaseSync(config.dbFile);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'rep',            -- owner | rep
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  ip TEXT, user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  key_hash TEXT UNIQUE NOT NULL,
  scope TEXT NOT NULL,                          -- read | write
  last_used_at TEXT, revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id TEXT PRIMARY KEY,
  name TEXT,
  redirect_uris TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS oauth_codes (
  code_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  scope TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  resource TEXT,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  access_hash TEXT UNIQUE NOT NULL,
  refresh_hash TEXT UNIQUE,
  access_expires_at TEXT NOT NULL,
  refresh_expires_at TEXT,
  last_used_at TEXT, revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,                       -- instagram | threads
  platform_user_id TEXT NOT NULL,
  username TEXT, name TEXT, avatar_url TEXT,
  token_enc TEXT NOT NULL,
  token_expires_at TEXT,
  token_issued_at TEXT,
  status TEXT NOT NULL DEFAULT 'active',        -- active | expired | disconnected
  last_error TEXT,
  followers_count INTEGER,
  connected_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(platform, platform_user_id)
);
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,                           -- image | video
  mime TEXT NOT NULL,
  path TEXT,
  public_token TEXT UNIQUE NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  width INTEGER, height INTEGER, duration_ms INTEGER,
  alt_text TEXT,
  original_name TEXT,
  in_library INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'ready',         -- uploading | ready
  part_size INTEGER, part_count INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  content TEXT NOT NULL DEFAULT '',
  media_ids TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,                         -- scheduled | publishing | published | partial | failed | cancelled
  scheduled_at TEXT,
  idempotency_key TEXT,
  request_hash TEXT,
  source TEXT NOT NULL DEFAULT 'dashboard',     -- dashboard | api | mcp
  removed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS posts_idem ON posts(created_by, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS posts_hash ON posts(request_hash, created_at);
CREATE TABLE IF NOT EXISTS post_targets (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  content TEXT,                                 -- per-account override (NULL = shared)
  media_ids TEXT,                               -- per-account override (NULL = shared)
  options TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',       -- pending | publishing | published | failed | cancelled
  run_at TEXT,                                  -- when the worker may pick it up
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_at TEXT,
  container_id TEXT,
  platform_post_id TEXT,
  extra_post_ids TEXT,                          -- thread parts
  permalink TEXT,
  error_code TEXT, error_message TEXT,
  published_at TEXT
);
CREATE INDEX IF NOT EXISTS targets_due ON post_targets(status, run_at);
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  target_id TEXT REFERENCES post_targets(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  platform_comment_id TEXT NOT NULL,
  platform_media_id TEXT,
  parent_platform_id TEXT,
  username TEXT, avatar_url TEXT,
  text TEXT,
  commented_at TEXT,
  hidden INTEGER NOT NULL DEFAULT 0,
  reply_status TEXT NOT NULL DEFAULT 'unreplied', -- unreplied | replied | ignored
  from_self INTEGER NOT NULL DEFAULT 0,
  fetched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(platform, platform_comment_id)
);
CREATE TABLE IF NOT EXISTS insights_daily (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  metrics TEXT NOT NULL,
  PRIMARY KEY(account_id, date)
);
CREATE TABLE IF NOT EXISTS post_insights (
  target_id TEXT PRIMARY KEY REFERENCES post_targets(id) ON DELETE CASCADE,
  metrics TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS user_accounts (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id, account_id)
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT, user_email TEXT,
  via TEXT,                                     -- session | api_key | oauth | system
  action TEXT NOT NULL,
  target_type TEXT, target_id TEXT,
  details TEXT,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS audit_at ON audit_log(at);
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  platform_conversation_id TEXT NOT NULL,
  participant_id TEXT, participant_username TEXT, participant_name TEXT,
  last_message_at TEXT, last_message_text TEXT, last_direction TEXT,
  last_inbound_at TEXT,
  status TEXT NOT NULL DEFAULT 'open',          -- open | done
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(account_id, platform_conversation_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  platform_message_id TEXT UNIQUE,
  direction TEXT NOT NULL,                      -- in | out
  text TEXT, attachments TEXT,
  sent_at TEXT NOT NULL,
  sent_by TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS messages_conv ON messages(conversation_id, sent_at);

`);

// migrations
db.exec(`CREATE TABLE IF NOT EXISTS ai_drafts (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  oauth_token_id TEXT REFERENCES oauth_tokens(id) ON DELETE SET NULL,
  request_id TEXT NOT NULL, request_hash TEXT NOT NULL,
  content TEXT NOT NULL, media_ids TEXT NOT NULL, targets TEXT NOT NULL,
  scheduled_at TEXT, status TEXT NOT NULL DEFAULT 'pending', post_id TEXT,
  created_at TEXT NOT NULL, UNIQUE(user_id, request_id)
);`);
db.exec(`CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS user_companies (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id, company_id)
);`);
if (!db.prepare('PRAGMA table_info(accounts)').all().some(c => c.name === 'company_id')) {
  db.exec('ALTER TABLE accounts ADD COLUMN company_id TEXT REFERENCES companies(id) ON DELETE SET NULL');
}
db.exec('CREATE INDEX IF NOT EXISTS accounts_company ON accounts(company_id);');
db.exec("UPDATE users SET role='owner' WHERE role='admin'; UPDATE users SET role='rep' WHERE role='member';");

export const now = () => new Date().toISOString();
export const id = (prefix) => `${prefix}_${crypto.randomBytes(9).toString('base64url')}`;
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export const one = (sql, ...p) => db.prepare(sql).get(...p);
export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);

export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

export const kvGet = (k) => one('SELECT v FROM kv WHERE k=?', k)?.v ?? null;
export const kvSet = (k, v) => run('INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', k, String(v));

// Sosmed Generator: private provider credentials and durable, bounded workflows.
db.exec(`CREATE TABLE IF NOT EXISTS generator_keys (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, secret_enc TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id,provider)
);
CREATE TABLE IF NOT EXISTS generator_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  agents TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS generator_runs (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL, request_hash TEXT NOT NULL,
  brief TEXT NOT NULL, targets TEXT NOT NULL, slide_count INTEGER NOT NULL,
  agents TEXT NOT NULL, scheduled_at TEXT, status TEXT NOT NULL DEFAULT 'queued',
  steps TEXT NOT NULL DEFAULT '{}', media_ids TEXT NOT NULL DEFAULT '[]',
  caption TEXT NOT NULL DEFAULT '', error TEXT, draft_id TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(user_id,request_id)
);`);

for (const [column, definition] of [['plan_id','TEXT'], ['title',"TEXT NOT NULL DEFAULT ''"], ['post_id','TEXT'], ['parent_id','TEXT']]) {
  if (!db.prepare('PRAGMA table_info(generator_runs)').all().some(c => c.name === column)) db.exec(`ALTER TABLE generator_runs ADD COLUMN ${column} ${definition}`);
}
db.exec(`CREATE TABLE IF NOT EXISTS generator_plans (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL, request_hash TEXT NOT NULL, brief TEXT NOT NULL,
 start_date TEXT NOT NULL, end_date TEXT NOT NULL, content_count INTEGER NOT NULL,
 recommendation TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(user_id,request_id)
);`);
for (const [column, definition] of [['reference_media_ids', "TEXT NOT NULL DEFAULT '[]'"], ['reference_notes', "TEXT NOT NULL DEFAULT ''"], ['reference_roles', "TEXT NOT NULL DEFAULT '{}'"]]) {
 if (!db.prepare('PRAGMA table_info(generator_runs)').all().some(c => c.name === column)) db.exec(`ALTER TABLE generator_runs ADD COLUMN ${column} ${definition}`);
}
