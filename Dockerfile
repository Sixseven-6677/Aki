FROM node:20-alpine

WORKDIR /app

# Install build tools for native modules
RUN apk add --no-cache python3 make g++ git

# Copy all source files (includes pre-built dist/)
COPY . .

# Step 1: Install most production packages with --ignore-scripts to avoid npm crash
# --no-package-lock prevents EOVERRIDE conflicts from the overrides section
RUN npm install --legacy-peer-deps --ignore-scripts --no-package-lock \
    express dotenv mongoose socket.io body-parser axios \
    fs-extra chalk moment-timezone uuid yt-search ytdl-core \
    chokidar tough-cookie axios-cookiejar-support \
    youtube-search-api

# Step 2: Install better-sqlite3 (native module - needs scripts + build tools)
# Also use --no-package-lock to avoid EOVERRIDE from gradient-string override
RUN npm install --legacy-peer-deps --no-package-lock better-sqlite3

# Step 3: Install @dongdev/fca-unofficial (allow failure - optional feature)
RUN npm install --legacy-peer-deps --ignore-scripts --no-package-lock @dongdev/fca-unofficial || true

# Verify critical dependencies are present
RUN node -e "require('express'); require('mongoose'); require('socket.io'); console.log('Core deps OK')"

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/index.js"]