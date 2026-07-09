FROM node:20-alpine

WORKDIR /app

# Install build tools for native modules (git required for GitHub-hosted packages)
RUN apk add --no-cache python3 make g++ git

# Copy all source files (includes pre-built dist/)
COPY . .

# Step 1: Install most production packages
RUN npm install --legacy-peer-deps --ignore-scripts --no-package-lock \
    express dotenv mongoose socket.io body-parser axios \
    fs-extra chalk moment-timezone uuid yt-search ytdl-core \
    chokidar tough-cookie axios-cookiejar-support \
    youtube-search-api

# Step 2: Install better-sqlite3 (native module - needs build scripts + tools)
RUN npm install --legacy-peer-deps --no-package-lock better-sqlite3

# Step 3: Install ws3-fca from GitHub
# ws3-fca (ntkhang03) — actively maintained, replaces @dongdev/fca-unofficial
RUN npm install --legacy-peer-deps --no-package-lock github:ntkhang03/ws3-fca

# Verify critical dependencies are present
RUN node -e "require('express'); require('mongoose'); require('socket.io'); require('ws3-fca'); console.log('Core deps OK')"

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/index.js"]
