FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --chown=node:node package*.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --omit=dev --no-audit --no-fund
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
COPY --chown=node:node scripts ./scripts
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
VOLUME /data
EXPOSE 3000
USER node
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=4 CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(async r=>{const b=await r.json();if(!r.ok||b.ok!==true||b.mock!==false)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "--no-warnings", "src/server.js"]
