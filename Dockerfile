# Build.Flow - Dockerfile (Next 14 standalone + Prisma + sharp)
# Imagem Debian slim: casa com o engine padrao do Prisma e roda sharp bem.

# ---------- 1) deps: instala dependencias ----------
FROM node:20-slim AS deps
# openssl e necessario para o Prisma; libvips ajuda o sharp.
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ---------- 2) builder: gera prisma client + build do Next ----------
FROM node:20-slim AS builder
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Gera o Prisma Client e faz o build (next.config tem output: standalone)
RUN npx prisma generate
RUN npm run build

# ---------- 3) runner: imagem final, enxuta ----------
FROM node:20-slim AS runner
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Usuario sem privilegios
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m nextjs

# Artefatos do build standalone
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Prisma: schema, migracoes, client gerado e a CLI (para migrate/seed no deploy)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

# Pasta de uploads (sera um VOLUME no EasyPanel para persistir).
RUN mkdir -p /app/uploads && chown -R nextjs:nodejs /app/uploads

USER nextjs
EXPOSE 3000

# server.js e o entrypoint gerado pelo Next standalone.
CMD ["node", "server.js"]
