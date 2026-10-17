// Background jobs, run in-process. Single instance only (SQLite).
import { kvGet, kvSet } from './db.js';
import { config } from './config.js';
import { runPublisherTick, refreshMissingPermalinks } from './services/publisher.js';
import { syncAllComments, syncInsights } from './services/engagement.js';
import { refreshExpiringTokens, refreshAllProfiles } from './services/accounts.js';
import { gcMedia, purgePublishedMedia } from './services/media.js';
import { syncAllMessages } from './services/messages.js';

const JOBS = [
  { name: 'permalinks', everyMs: 5 * 60_000, fn: refreshMissingPermalinks },
  { name: 'profiles', everyMs: 6 * 3600_000, fn: refreshAllProfiles },
  { name: 'comments', everyMs: 10 * 60_000, fn: syncAllComments },
  { name: 'messages', everyMs: 2 * 60_000, fn: syncAllMessages },
  { name: 'insights', everyMs: 6 * 3600_000, fn: syncInsights },
  { name: 'tokens', everyMs: 12 * 3600_000, fn: refreshExpiringTokens },
  { name: 'media_gc', everyMs: 6 * 3600_000, fn: gcMedia },
];
const busy = new Set();

async function runJob(j) {
  if (busy.has(j.name)) return;
  busy.add(j.name);
  try { await j.fn(); kvSet(`job:${j.name}`, Date.now()); }
  catch (e) { console.error(`[job:${j.name}]`, e); }
  finally { busy.delete(j.name); }
}

export async function runJobNow(name) {
  const j = JOBS.find((x) => x.name === name);
  if (j) await runJob(j);
}

export function startWorker() {
  if (config.disableWorker) { console.log('[worker] disabled'); return; }
  const tick = async () => {
    try { await runPublisherTick(); purgePublishedMedia(); } catch (e) { console.error('[publisher]', e); }
    for (const j of JOBS) {
      const last = Number(kvGet(`job:${j.name}`) || 0);
      if (Date.now() - last >= j.everyMs) runJob(j);
    }
  };
  setInterval(tick, config.workerIntervalMs).unref();
  setTimeout(tick, 1000).unref();
  console.log(`[worker] started (every ${config.workerIntervalMs / 1000}s)`);
}
