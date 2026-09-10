# ==============================================================================
# STAGE 1: Base & Dependencies
# ==============================================================================
FROM node:20-alpine AS dependencies

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --only=production

# ==============================================================================
# STAGE 2: Production Image
# ==============================================================================
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production
ENV PORT=3002

# Cria usuário não-privilegiado para segurança
USER node

# Copia dependências de produção e código fonte
COPY --chown=node:node --from=dependencies /usr/src/app/node_modules ./node_modules
COPY --chown=node:node package*.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node sql ./sql

# Healthcheck do container
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3002/health || exit 1

EXPOSE 3002

CMD ["node", "src/server.js"]
