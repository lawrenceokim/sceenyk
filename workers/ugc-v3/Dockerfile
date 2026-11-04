FROM node:22-trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates tini && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY tsconfig.json ./
COPY lib ./lib
COPY scripts/ugc-v3-background-worker.ts scripts/check-ugc-v3-worker-health.mjs ./scripts/
RUN mkdir -p /data/ugc-v3 && chown -R node:node /data/ugc-v3
ENV NODE_ENV=production FFMPEG_PATH=/usr/bin/ffmpeg FFPROBE_PATH=/usr/bin/ffprobe UGC_V3_RECOVERY_DIR=/data/ugc-v3
USER node
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--conditions=react-server", "--import=tsx", "scripts/ugc-v3-background-worker.ts"]
