# Plans bridge. Deliberately a separate image from the application: it carries a
# CLI, a compiler toolchain's output (node-pty) and a signed-in ChatGPT session,
# none of which belong in the app container.
FROM node:22-bookworm-slim AS build
WORKDIR /build
# node-pty is a native addon and has no prebuild for this base, so it is compiled
# here and only the result is copied forward. The runtime image keeps no compiler.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# ci, not install: the lockfile is committed, so the image is reproducible and
# a drifting transitive dependency cannot change what ships.
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim
# git: Codex expects a repository context for some operations and warns without it.
# ca-certificates: the CLI talks to OpenAI over TLS.
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*

# Pinned on purpose. A floating tag would change the agent behind the owner's
# plan without a deploy, and the exec/login flags this bridge depends on are
# version-specific; CODEX_VERSION is recorded in the runbook.
ARG CODEX_VERSION=0.171.0
RUN npm install -g @openai/codex@${CODEX_VERSION} && npm cache clean --force

# A fixed uid/gid so the named volume keeps working across rebuilds.
RUN groupadd -g 10001 codex && useradd -m -u 10001 -g 10001 -s /bin/bash codex
ENV HOME=/home/codex \
    CODEX_HOME=/home/codex/.codex \
    NODE_ENV=production \
    PORT=8090
WORKDIR /app
COPY --from=build --chown=codex:codex /build/node_modules ./node_modules
COPY --chown=codex:codex package.json ./
COPY --chown=codex:codex src ./src
# public/ holds nothing but the vendored terminal widget, which is generated
# here from node_modules and is therefore gitignored. Git does not track empty
# directories, so a clean checkout has no teammates/public at all and COPYing it
# failed the build. The directory is created rather than copied.
# The console loads the widget from this service, so the application image
# carries no vendored copy and the two never drift apart.
RUN mkdir -p public/vendor \
 && cp node_modules/@xterm/xterm/lib/xterm.js public/vendor/xterm.js \
 && cp node_modules/@xterm/xterm/css/xterm.css public/vendor/xterm.css \
 && chown -R codex:codex public

# Per-conversation working directories live here, not in HOME, so a wiped
# workspace never costs the login.
RUN mkdir -p /work && chown codex:codex /work
VOLUME ["/home/codex"]
USER codex
EXPOSE 8090
# tini reaps the codex processes this service spawns and kills per request.
# -s: compose runs this with `init: true`, which already puts an init at PID 1,
# so tini is then a child and warns that it cannot reap. Registering as a
# subreaper makes it correct both there and under a plain `docker run`.
ENTRYPOINT ["/usr/bin/tini", "-s", "--"]
CMD ["node", "src/server.js"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8090/teammates/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
