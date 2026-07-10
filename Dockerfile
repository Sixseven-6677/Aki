FROM node:20-alpine

WORKDIR /app

# Install build tools for native modules
RUN apk add --no-cache python3 make g++ git

# Copy all source files (includes pre-built dist/)
COPY . .

# Step 1: Install main production packages including ws3-fca (npm registry ^3.5.2)
RUN npm install --legacy-peer-deps --ignore-scripts --no-package-lock \
    ws3-fca \
    express dotenv mongoose socket.io body-parser axios \
    fs-extra chalk moment-timezone uuid yt-search ytdl-core \
    chokidar tough-cookie axios-cookiejar-support \
    youtube-search-api

# Step 2: Install better-sqlite3 (native — needs build scripts)
RUN npm install --legacy-peer-deps --no-package-lock better-sqlite3

# Verify critical dependencies are present
RUN node -e "require('express'); require('mongoose'); require('socket.io'); require('ws3-fca'); console.log('Core deps OK')"

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/index.js"]

# trigger-redeploy: fix FB_APPSTATE mqtt reconnect
