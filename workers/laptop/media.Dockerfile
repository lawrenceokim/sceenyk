# syntax=docker/dockerfile:1
FROM node:22-trixie-slim@sha256:68c76cfad89921b927eae28ba21407475e29d0ce450afcdbe70c1532db042b64 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY tsconfig.json ./
COPY lib ./lib
COPY scripts/docker-worker-cycle.ts ./scripts/
COPY workers/laptop/build.mjs ./workers/laptop/
RUN node workers/laptop/build.mjs

FROM node:22-trixie-slim@sha256:68c76cfad89921b927eae28ba21407475e29d0ce450afcdbe70c1532db042b64
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates util-linux tini && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/workers/laptop/runtime ./runtime
COPY workers/laptop/supervisor.mjs workers/laptop/healthcheck.mjs ./workers/laptop/
RUN mkdir -p /data/ugc-v3 && chown -R node:node /data
ENV NODE_ENV=production FFMPEG_PATH=/usr/bin/ffmpeg FFPROBE_PATH=/usr/bin/ffprobe UGC_V3_RECOVERY_DIR=/data/ugc-v3
USER node
ENTRYPOINT ["/usr/bin/tini", "-g", "--", "node", "/app/workers/laptop/supervisor.mjs"]
CMD ["media"]
