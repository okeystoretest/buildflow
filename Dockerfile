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
# Atalho executavel do CLI. Sem ele, `npx prisma ...` dentro do container
# responde "prisma: not found" — o pacote esta na imagem, mas o PATH procura
# por node_modules/.bin/prisma. E um symlink relativo p/ ../prisma/build/index.js,
# cujo alvo ja foi copiado na linha acima.
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

# Pasta de uploads (sera um VOLUME no EasyPanel para persistir).
RUN mkdir -p /app/uploads && chown -R nextjs:nodejs /app/uploads

USER nextjs
EXPOSE 3000

# MIGRACOES AUTOMATICAS NO DEPLOY
#
# Todo "Implantar" do EasyPanel recria o container e executa este CMD, entao as
# migrations pendentes sao aplicadas ANTES do servidor aceitar a primeira
# requisicao. Isso fecha a janela em que o codigo novo ja esta no ar consultando
# uma coluna que a migration ainda nao criou.
#
# `migrate deploy` (nunca `migrate dev`): so aplica o que esta em
# prisma/migrations, nao gera arquivo novo nem pede confirmacao, e e idempotente
# — reimplantar sem migration pendente e um no-op. Com varias replicas subindo
# juntas, o lock consultivo do Prisma na _prisma_migrations serializa a execucao.
#
# O `&&` e proposital: se a migration falhar, o servidor NAO sobe. E melhor o
# container reiniciar com o erro visivel no log do que servir um app cujo
# schema esperado nao existe no banco.
#
# `exec` no final: o node vira PID 1 e recebe o SIGTERM do EasyPanel, permitindo
# o encerramento limpo (sem isso, o shell segura o sinal e o stop vira kill).
#
# server.js e o entrypoint gerado pelo Next standalone.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && exec node server.js"]
