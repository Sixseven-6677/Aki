FROM node:20-alpine

WORKDIR /app

# Install build tools for native modules
RUN apk add --no-cache python3 make g++ git

# Upgrade npm to stable version to avoid "Exit handler never called" bug
RUN npm install -g npm@10.8.2

# Copy package files first for better layer caching
COPY package.json package-lock.json .npmrc ./

# Install all dependencies using npm ci for reliability
RUN npm ci --legacy-peer-deps

# Copy the rest of source files
COPY . .

# Build TypeScript only if dist/ not already present (pre-built takes priority)
RUN [ -d "dist" ] && echo "Using pre-built dist/" || npm run build

# Remove dev dependencies
RUN npm prune --omit=dev

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/index.js"]
