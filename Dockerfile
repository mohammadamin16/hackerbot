# Use Node.js LTS as base image
FROM node:20-slim

# Set working directory
WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm@9.15.4

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install

# Copy source code
COPY . .

# Build TypeScript code
RUN pnpm build

# Set environment variables
ENV NODE_ENV=production

# Start the application
CMD ["node", "dist/bot.js"]