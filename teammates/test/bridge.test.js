// Bridge unit + end-to-end tests. No ChatGPT account, no network, no spend:
// CODEX_BIN points at test/fake-codex.sh throughout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(here, 'fake-codex.sh');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'teammates-test-'));

process.env.CODEX_BIN = FAKE;
process.env.WORK_DIR = work;
process.env.INTERNAL_TOKEN = 'test-internal-token-0123456789';
process.env.CODEX_TIMEOUT_MS = '8000';
process.env.CODEX_KILL_GRACE_MS = '300';

const { execArgs, childEnv, runCodex, looksSignedOut } = await import('../src/codex.js');
const { promptFrom, restartPrompt, schemaOf, imagesOf, completion, chunk } = await import('../src/openai.js');
const { verifyTicket } = await import('../src/auth.js');
const crypto = await import('node:crypto');

test('codex exec argument composition', async (t) => {
  await t.test('a first message starts a session and reads the prompt from stdin', () => {
    const args = execArgs({ outFile: '/w/out.txt' });
    assert.deepEqual(args, ['exec', '--skip-git-repo-check', '-o', '/w/out.txt', '-']);
    assert.ok(!args.includes('resume'), 'the first message must not resume');
  });

  await t.test('a later message resumes the most recent thread', () => {
    const args = execArgs({ outFile: '/w/out.txt', resume: true });
    assert.deepEqual(args.slice(0, 5), ['exec', 'resume', '--last', '--skip-git-repo-check', '-o']);
    assert.equal(args.at(-1), '-', 'stdin stays the final positional argument');
  });

  await t.test('schema and images are passed through, images in the one-value form', () => {
    const args = execArgs({ outFile: '/w/o.txt', schemaFile: '/w/s.json', images: ['/w/a.png', '/w/b.png'] });
    assert.ok(args.includes('--output-schema') && args[args.indexOf('--output-schema') + 1] === '/w/s.json');
    assert.deepEqual(args.filter((a) => a.startsWith('--image=')), ['--image=/w/a.png', '--image=/w/b.png']);
    assert.ok(!args.includes('-i'), '-i takes several values and would swallow what follows it');
  });

  await t.test('the advertised "codex" name means the plan default, not -m codex', () => {
    assert.ok(!execArgs({ outFile: '/w/o.txt', model: 'codex' }).includes('-m'));
    const named = execArgs({ outFile: '/w/o.txt', model: 'gpt-5.5' });
    assert.equal(named[named.indexOf('-m') + 1], 'gpt-5.5', 'a real model id is still passed');
  });

  await t.test('the prompt is never in the argument vector', () => {
    const args = execArgs({ outFile: '/w/o.txt', model: 'codex', images: ['/w/a.png'] });
    assert.ok(!args.some((a) => /rm -rf/.test(a)));
  });
});

test('runCodex delivers the prompt on stdin verbatim', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stdin-'));
  const bin = path.join(dir, 'echo-stdin.sh');
  fs.writeFileSync(bin, '#!/usr/bin/env bash\ncat\n', { mode: 0o755 });
  const nasty = '"; rm -rf / #$(whoami)`id`\n' + 'x'.repeat(200_000);
  const r = await runCodex(['exec', '-'], { cwd: dir, bin, input: nasty });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, nasty, 'longer than one argv entry may be, and not shell-interpreted');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the child environment carries no secrets', () => {
  process.env.SHOULD_NOT_LEAK = 'super-secret-value';
  const env = childEnv();
  assert.ok(!('SHOULD_NOT_LEAK' in env), 'unrelated variables are not inherited');
  assert.ok(!('INTERNAL_TOKEN' in env), 'the bridge token never reaches Codex');
  assert.deepEqual(Object.keys(env).sort().filter((k) => !/^(https?_proxy|HTTPS_PROXY)$/.test(k)).sort(),
    ['CODEX_HOME', 'HOME', 'LANG', 'PATH', 'TERM'], 'only the minimum is passed');
  delete process.env.SHOULD_NOT_LEAK;
});

// These two need a program that hangs, not the shared Codex fixture. Writing to
// that fixture from here raced e2e.test.js, which node runs in parallel and
// which owns it: one intermittent failure in a combined run was exactly that.
// A private script keeps the shared fixture single-owner.
const hangScript = path.join(work, 'hang.sh');
fs.writeFileSync(hangScript, '#!/usr/bin/env bash\nsleep 120\n');
fs.chmodSync(hangScript, 0o755);

test('a turn that overruns its timeout is killed, not left running', async () => {
  const started = Date.now();
  const r = await runCodex([], { cwd: work, timeoutMs: 600, bin: hangScript });
  const elapsed = Date.now() - started;
  assert.equal(r.timedOut, 'timeout', 'the overrun is reported as a timeout');
  assert.ok(elapsed < 5000, `returned in ${elapsed}ms rather than waiting out the 120s sleep`);
});

test('a caller that gives up aborts the turn', async () => {
  const abort = new AbortController();
  const started = Date.now();
  setTimeout(() => abort.abort(), 300);
  const r = await runCodex([], { cwd: work, timeoutMs: 60_000, signal: abort.signal, bin: hangScript });
  const elapsed = Date.now() - started;
  assert.equal(r.timedOut, 'aborted', 'the turn ends because the caller left');
  assert.ok(elapsed < 5000, `returned in ${elapsed}ms rather than holding the 60s timeout`);
});

test('signed-out detection', () => {
  assert.ok(looksSignedOut('error: not logged in'));
  assert.ok(looksSignedOut('HTTP 401 unauthorized'));
  assert.ok(!looksSignedOut('rate limit exceeded'), 'an unrelated failure is not a sign-out');
});

test('OpenAI request translation', async (t) => {
  const messages = [
    { role: 'system', content: 'You are terse.' },
    { role: 'user', content: 'first' },
    { role: 'assistant', content: 'ok' },
    { role: 'user', content: 'second' },
  ];

  await t.test('a first message carries the whole conversation', () => {
    const p = promptFrom(messages, { resume: false });
    assert.match(p, /You are terse\./);
    assert.match(p, /User: first/);
    assert.match(p, /Assistant: ok/);
    assert.match(p, /User: second/);
  });

  await t.test('a resumed message sends only the newest turn, with the system prompt', () => {
    const p = promptFrom(messages, { resume: true });
    assert.match(p, /You are terse\./, 'standing instructions are re-sent every turn');
    assert.equal(p.includes('User: first'), false, 'Codex already holds the earlier turns');
    assert.match(p, /second$/);
  });

  await t.test('a restart after a failed resume carries a summary', () => {
    const p = restartPrompt(messages);
    assert.match(p, /Conversation so far:/);
    assert.match(p, /first/); assert.match(p, /ok/); assert.match(p, /second/);
  });

  await t.test('response_format yields a JSON Schema', () => {
    assert.equal(schemaOf({}), null);
    const schema = { type: 'object', properties: { a: { type: 'string' } } };
    assert.deepEqual(schemaOf({ response_format: { type: 'json_schema', json_schema: { name: 'x', schema } } }), schema);
  });

  await t.test('data-url images are extracted in order', () => {
    const png = Buffer.from('fake-png');
    const imgs = imagesOf([{ role: 'user', content: [
      { type: 'text', text: 'look' },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${png.toString('base64')}` } },
    ] }]);
    assert.equal(imgs.length, 1);
    assert.equal(imgs[0].mime, 'image/png');
    assert.equal(imgs[0].buffer.toString(), 'fake-png');
  });
});

test('OpenAI response shapes', async (t) => {
  await t.test('non-stream is a chat.completion', () => {
    const c = completion({ id: 'chatcmpl-1', model: 'codex', content: 'hi' });
    assert.equal(c.object, 'chat.completion');
    assert.equal(c.choices[0].message.role, 'assistant');
    assert.equal(c.choices[0].message.content, 'hi');
    assert.equal(c.choices[0].finish_reason, 'stop');
    assert.equal(typeof c.created, 'number');
    assert.deepEqual(c.usage, { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 });
  });

  await t.test('stream chunks are chat.completion.chunk', () => {
    const k = chunk({ id: 'chatcmpl-1', model: 'codex', delta: { content: 'hi' } });
    assert.equal(k.object, 'chat.completion.chunk');
    assert.equal(k.choices[0].delta.content, 'hi');
    assert.equal(k.choices[0].finish_reason, null);
    assert.equal(chunk({ id: 'x', model: 'codex', delta: {}, finish: 'stop' }).choices[0].finish_reason, 'stop');
  });
});

test('terminal tickets', async (t) => {
  const mint = (payload, token = process.env.INTERNAL_TOKEN) => {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${crypto.createHmac('sha256', token).update(body).digest('base64url')}`;
  };

  await t.test('a valid ticket verifies', () => {
    const t1 = mint({ userId: 'u1', exp: Date.now() + 60_000 });
    assert.equal(verifyTicket(t1)?.userId, 'u1');
  });
  await t.test('an expired ticket is refused', () => {
    assert.equal(verifyTicket(mint({ userId: 'u1', exp: Date.now() - 1 })), null);
  });
  await t.test('a ticket signed with another key is refused', () => {
    assert.equal(verifyTicket(mint({ userId: 'u1', exp: Date.now() + 60_000 }, 'another-key-entirely')), null);
  });
  await t.test('a tampered payload is refused', () => {
    const good = mint({ userId: 'u1', exp: Date.now() + 60_000 });
    const forged = Buffer.from(JSON.stringify({ userId: 'owner', exp: Date.now() + 60_000 })).toString('base64url');
    assert.equal(verifyTicket(`${forged}.${good.split('.')[1]}`), null);
  });
});
