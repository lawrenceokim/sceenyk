# Optional isolated renderer. Existing deployment may host the same modules.
FROM node:22-trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates tini libnss3 libdbus-1-3 libatk1.0-0t64 libatk-bridge2.0-0t64 libx11-xcb1 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libxkbcommon0 libdrm2 libgbm1 libpango-1.0-0 libcairo2 libasound2t64 libcups2t64 fonts-liberation && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY tsconfig.json ./
COPY lib ./lib
COPY scripts/build-renderer.mjs ./scripts/build-renderer.mjs
COPY workers/final-render ./workers/final-render
RUN node scripts/build-renderer.mjs && node -e "import('@remotion/renderer').then(m=>m.ensureBrowser({logLevel:'error'}))"
ENV NODE_ENV=production FFMPEG_PATH=/usr/bin/ffmpeg FFPROBE_PATH=/usr/bin/ffprobe
USER node
EXPOSE 10000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--conditions=react-server", "--import=tsx", "workers/final-render/server.ts"]
