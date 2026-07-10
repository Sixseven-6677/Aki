FROM node:20-alpine

WORKDIR /app

# Install build tools + curl for native modules and tarball download
RUN apk add --no-cache python3 make g++ git curl

# Copy all source files (includes pre-built dist/)
COPY . .

# Step 1: Install main production packages
# ws3-fca is NOT in package.json — installed separately below via tarball
RUN npm install --legacy-peer-deps --ignore-scripts --no-package-lock \
    express dotenv mongoose socket.io body-parser axios \
    fs-extra chalk moment-timezone uuid yt-search ytdl-core \
    chokidar tough-cookie axios-cookiejar-support \
    youtube-search-api

# Step 2: Install better-sqlite3 (native — needs build scripts)
RUN npm install --legacy-peer-deps --no-package-lock better-sqlite3

# Step 3: Download ws3-fca tarball via curl (no git/SSH needed) and install locally
# GitHub archive tarballs have a top-level dir (ws3-fca-main/), --strip-components=1 removes it
RUN curl -fsSL -o /tmp/ws3-fca.tar.gz \
        https://github.com/ntkhang03/ws3-fca/archive/refs/heads/main.tar.gz \
    && mkdir -p /tmp/ws3-fca \
    && tar -xzf /tmp/ws3-fca.tar.gz -C /tmp/ws3-fca --strip-components=1 \
    && npm install --legacy-peer-deps --no-save --no-package-lock /tmp/ws3-fca \
    && rm -rf /tmp/ws3-fca /tmp/ws3-fca.tar.gz

# Verify critical dependencies are present
RUN node -e "require('express'); require('mongoose'); require('socket.io'); require('ws3-fca'); console.log('Core deps OK')"

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/index.js"]
