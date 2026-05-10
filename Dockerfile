# Use a slim, production-ready Node.js image
FROM node:20-slim

# Set environment to production
ENV NODE_ENV=production

# Install curl for the Coolify health check
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files first to leverage Docker layer caching
# This ensures 'npm install' only runs when dependencies change
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy the rest of your application code
# Structure: /public (html/js), server.js, admin.html
COPY . .

# Expose the application port
EXPOSE 3000

# Coolify-specific Health Check
# Checks if the /health endpoint returns a 200 OK every 30 seconds
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start the server
CMD ["node", "server.js"]