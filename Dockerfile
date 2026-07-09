FROM node:20-alpine

WORKDIR /app

# Install build tools for native modules
RUN apk add --no-cache python3 make g++ git

# Copy source files (including pre-built dist/)
COPY . .

# Install ALL production dependencies explicitly - split into chunks to avoid npm crash
# Remove potentially problematic packages from first pass, install them separately
RUN npm install --legacy-peer-deps --ignore-scripts --no-package-lock \
    express dotenv mongoose socket.io body-parser axios \
    fs-extra chalk moment-timezone uuid yt-search ytdl-core \
    chokidar gradient-string tough-cookie axios-cookiejar-support \
    youtube-search-api

# Install better-sqlite3 with build support
RUN npm install --legacy-peer-deps better-sqlite3

# Install the fca package last (most likely to crash)  
RUN npm install --legacy-peer-deps --ignore-scripts @dongdev/fca-unofficial || true

# Verify critical dependency is present
RUN node -e "require('express'); console.log('express OK')"

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/index.js"]