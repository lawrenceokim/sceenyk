# Node 22 LTS matches the accepted worker. Trixie supplies FFmpeg/FFprobe 7.x.
FROM node:22-trixie-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# Explicit copies exclude environment files, Git data and web build artifacts.
COPY tsconfig.json ./
COPY lib ./lib
COPY scripts/media-preparation-worker.ts ./scripts/media-preparation-worker.ts

ENV NODE_ENV=production \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    FFPROBE_PATH=/usr/bin/ffprobe \
    MEDIA_PREPARATION_WORKER_HOST=0.0.0.0

USER node
EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3012)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
# Forward shutdown to Node only so its drain can finish active FFmpeg children.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--conditions=react-server", "--import=tsx", "scripts/media-preparation-worker.ts"]
