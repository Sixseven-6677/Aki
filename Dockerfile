FROM node:20-alpine

WORKDIR /app

# Install build tools for native modules
RUN apk add --no-cache python3 make g++ git

# Copy package files
COPY package.json package-lock.json .npmrc ./

# Use yarn instead of npm to avoid "Exit handler never called" npm bug
RUN corepack enable && yarn set version classic \
    && yarn install --production=false --ignore-engines --non-interactive

# Copy source files
COPY . .

# Build TypeScript only if dist/ not already present (pre-built takes priority)
RUN [ -d "dist" ] && echo "Using pre-built dist/" || yarn build

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/index.js"]