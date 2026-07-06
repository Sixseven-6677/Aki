FROM node:20-alpine

WORKDIR /app

# Install build tools for native modules
RUN apk add --no-cache python3 make g++ git

# Copy all source files first
COPY . .

# Install dependencies
RUN npm install --production=false

# Build TypeScript
RUN npm run build

# Remove dev dependencies
RUN npm prune --production

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/index.js"]
