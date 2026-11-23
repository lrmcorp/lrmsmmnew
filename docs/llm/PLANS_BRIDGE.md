# Your plans: the owner's ChatGPT subscription as a provider

A separate container (`teammates/`) runs the **official OpenAI Codex CLI**,
signed in to the owner's own ChatGPT plan, and exposes an OpenAI-shaped API that
the application calls like any other provider.

The rule that shapes every decision here: **this project never implements the
subscription login and never handles a ChatGPT credential.** It does not mint its
own OAuth, does not read `~/.codex`, and does not call ChatGPT endpoints. The CLI
owns the login and the model call; the bridge only shells out to it.

## Shape

```
console  ──/teammates/terminal (WebSocket)──▶  pty: codex login --device-auth
  app    ──/teammates/v1/chat/completions──▶  codex exec … -o <file>  ──▶  answer
```

| Piece | Where |
|---|---|
| Bridge service | `teammates/src/server.js` |
| Codex invocation, timeouts, kill | `teammates/src/codex.js` |
| One working directory per conversation | `teammates/src/sessions.js` |
| OpenAI ⇄ Codex translation | `teammates/src/openai.js` |
| Login terminal (pty + WebSocket) | `teammates/src/terminal.js` |
| Application client | `src/llm/plans.js` |
| Run/conversation context | `src/llm/plan-context.js` |
| Console page | `public/ai-plans.js` (Settings → AI plans, Owner only) |

## Turn protocol

The first message of a conversation starts a session; later messages resume it:

    codex exec --skip-git-repo-check -o <file> [-m <model>] [--output-schema <file>] "<prompt>"
    codex exec resume --last --skip-git-repo-check -o <file> "<message>"

The answer is the contents of the `-o` file, returned as `chat.completion`, or as
SSE when `stream=true`. If a resume fails immediately (the volume was cleared,
the thread was pruned) the turn is retried as a first message carrying a summary
of the conversation, so the caller sees continuity rather than an error.

`response_format: json_schema` becomes `--output-schema`, which matters because
every generator stage asks for structured JSON.

## Who may use it

Only the workspace **Owner**, whose personal subscription it spends. Enforced in
three places, so no single mistake opens it: the provider is withheld from the
picker (`availableProviders`), saving a configuration that names it is refused
(`cleanAgents`), and the request itself is refused (`assertOwnerMayUsePlans`)
before any call leaves the process. Representatives keep their own API keys.

## Boundaries worth keeping

- **Codex runs with a minimal environment.** Only `PATH`, `HOME`, `CODEX_HOME`,
  `TERM`, `LANG` and a proxy variable. The bridge's own token is not in it, so a
  prompt that talks the agent into printing its environment finds nothing. There
  is a test for this.
- **One conversation, one directory.** `resume --last` resumes the newest thread
  *in its working directory*; sharing one would cross two conversations.
- **Timeouts kill the process group.** Codex spawns helpers; `SIGTERM` then
  `SIGKILL` after a grace period, to the group, not just the parent.
- **The login terminal is not a shell.** It will only ever spawn `codex login
  --device-auth`, `codex login status` or `codex logout`, from a fixed table.
  It requires a same-origin upgrade, an HMAC ticket minted only for an Owner with
  a live console session, and allows at most three terminals at once.
- **No published port.** The only way in is the reverse proxy at `/teammates/`.

## Signing in

Settings → **AI plans** → Sign in. The terminal prints a link and a one-time code
that expires in 15 minutes. If it reports that device codes are off, enable
*device code authorization for Codex* in ChatGPT → Settings → Security.

The session lives on the `codex-home` volume, so a redeploy does not sign the
owner out. Per-conversation working directories are deliberately **not** on that
volume: clearing them costs nothing, losing the login costs a sign-in.

## Deploying

The service is opt-in, so an existing deployment is untouched until it is asked
for:

    PLANS_BRIDGE_TOKEN=$(openssl rand -hex 32)   # in .env, shared by both
    docker compose --profile plans up -d

`PLANS_BRIDGE_TOKEN` is the application↔bridge token. It is **not** a ChatGPT
credential, and rotating it signs nobody out.

Building and publishing the second image is not yet wired into
`.github/workflows/deploy.yml`, which builds and promotes one image. That is the
remaining deployment step.

## What is verified, and what is not

Verified here, against the real CLI at the pinned version:

- `codex login --device-auth`, `login status`, `exec resume --last`,
  `--skip-git-repo-check`, `-o/--output-last-message`, `-m`, `--output-schema`,
  `-i/--image` all exist in `@openai/codex@0.171.0`.
- `codex login status` reports `Not logged in` through the bridge's runner, and a
  missing `CODEX_HOME` is created at startup — without that, a fresh volume makes
  every call fail with *"that path does not exist"*.
- 34 bridge tests and 18 application tests, against a fake `codex` binary and a
  stubbed bridge. No ChatGPT account, no network, no spend.

**Not** verified, and not claimed:

- The container image has never been built: no Docker daemon was available.
- No real sign-in, and no real model answer. Whether Codex's output satisfies
  each generator stage's JSON schema in practice is unknown until a plan is
  signed in.
- **Image generation.** The CLI binary contains image machinery (`imagegen`,
  `image_gen.generation`, an `imagegen_premium` feature flag, `gpt-image-1/1.5/2`
  model ids), but whether any of it is reachable from `codex exec`, on a given
  plan, and able to write an image file the bridge could return, could not be
  tested without a signed-in account. The provider is therefore registered with
  `image: false`, and image stages stay on an API-key provider. Resolve this by
  testing with a signed-in plan before changing that flag.
