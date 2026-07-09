FROM node:20-alpine

WORKDIR /app

# Install build tools for native modules
RUN apk add --no-cache python3 make g++ git

# Upgrade npm
RUN npm install -g npm@10.8.2

# Copy package files first for better layer caching
COPY package.json package-lock.json .npmrc ./

# Install dependencies with --ignore-scripts to avoid postinstall crashes
# then explicitly rebuild native modules
RUN npm install --legacy-peer-deps --ignore-scripts \
    && npm rebuild better-sqlite3 \
    && echo "Dependencies installed successfully"

# Copy the rest of source files
COPY . .

# Build TypeScript only if dist/ not already present (pre-built takes priority)
RUN [ -d "dist" ] && echo "Using pre-built dist/" || npm run build

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/index.js"]