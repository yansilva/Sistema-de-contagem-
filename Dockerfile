# ==============================================================================
# INVENTORY MANAGEMENT SYSTEM — DOCKERFILE
# Multi-stage production build packaging API and Modular Frontend
# ==============================================================================
FROM node:20-alpine AS dependencies

WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm ci --only=production

# ------------------------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3002

USER node

# Copia backend
COPY --chown=node:node --from=dependencies /app/backend/node_modules ./backend/node_modules
COPY --chown=node:node backend/package*.json ./backend/
COPY --chown=node:node backend/src ./backend/src
COPY --chown=node:node backend/sql ./backend/sql

# Copia frontend estático
COPY --chown=node:node frontend ./frontend

WORKDIR /app/backend

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3002/health || exit 1

EXPOSE 3002

CMD ["node", "src/server.js"]
