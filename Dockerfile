FROM node:20-alpine

WORKDIR /app

# Install build tools for native modules
RUN apk add --no-cache python3 make g++ git

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install --production=false

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Remove dev dependencies
RUN npm prune --production

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/index.js"]
