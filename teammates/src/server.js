// Plans bridge: an OpenAI-shaped API in front of the official Codex CLI.
import express from 'express';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBearer } from './auth.js';
import { attachTerminal } from './terminal.js';
import { runTurn, status } from './turn.js';
import { modelList, DEFAULT_MODEL, MODELS } from './openai.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// Unauthenticated, and deliberately says nothing but "the process is up": it is
// the container healthcheck, reachable only inside the compose network.
app.get('/teammates/healthz', (_req, res) => res.json({ ok: true }));

const api = express.Router();
api.use(express.json({ limit: '12mb' }));
api.use(requireBearer);

// Signed out is reported as an empty catalogue rather than an error, so the
// application can simply hide the provider until a plan is signed in.
api.get('/models', async (_req, res) => {
  const s = await status();
  res.json(s.signedIn ? modelList() : { object: 'list', data: [] });
});

api.get('/status', async (_req, res) => {
  const s = await status();
  res.json({ signed_in: s.signedIn, models: s.signedIn ? MODELS : [] });
});

api.post('/chat/completions', async (req, res) => {
  const body = req.body || {};
  const sessionId = String(req.get('x-lrm-session') || '').trim();
  if (!sessionId) {
    return res.status(400).json({ error: { code: 'session_required', message: 'X-LRM-Session is required: one working directory per conversation.' } });
  }
  if (!Array.isArray(body.messages) || !body.messages.length) {
    return res.status(400).json({ error: { code: 'validation_failed', message: 'messages must be a non-empty array.' } });
  }
  const model = typeof body.model === 'string' && body.model ? body.model : DEFAULT_MODEL;
  try {
    await runTurn({ body, sessionId, model, stream: body.stream === true, res, signal: req.signal });
  } catch (e) {
    const status = e?.status || 500;
    const payload = { error: { code: e?.code || 'bridge_error', message: e?.message || 'The plans bridge failed.' } };
    if (res.headersSent) { try { res.end(); } catch { /* client gone */ } return; }
    res.status(status).json(payload);
  }
});

app.use('/teammates/v1', api);
app.use('/teammates/assets', express.static(path.join(here, '..', 'public'), { maxAge: '1h' }));

const server = http.createServer(app);
attachTerminal(server);

const port = Number(process.env.PORT || 8090);
// Bound to every interface inside the container only; the compose file
// publishes no port, so the proxy is the sole way in.
server.listen(port, async () => {
  console.log(`[teammates] plans bridge on :${port}`);
  await fs.mkdir(process.env.WORK_DIR || '/work', { recursive: true }).catch(() => {});
  // The codex-home volume mounts empty on a first deploy, and the CLI refuses to
  // start when CODEX_HOME does not exist ("that path does not exist"), which
  // would make every status check and every turn fail until someone created it
  // by hand. Creating it here costs nothing and makes a fresh volume work.
  const codexHome = process.env.CODEX_HOME || path.join(process.env.HOME || '/home/codex', '.codex');
  await fs.mkdir(codexHome, { recursive: true }).catch((e) => console.error(`[teammates] could not create ${codexHome}: ${e.message}`));
});

export { app, server };
