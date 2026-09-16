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

# VARIAVEIS NEXT_PUBLIC_* SAO DE BUILD, NAO DE RUNTIME
#
# O Next inlina `process.env.NEXT_PUBLIC_*` no bundle do navegador durante o
# `next build`. Configurar a variavel so no painel de runtime do EasyPanel nao
# chega ao cliente: o `.env` esta no .dockerignore e este estagio nao recebia
# nada, entao o bundle saia com `undefined`.
#
# Consequencia concreta: sem a chave VAPID publica, `registerPush()` no client
# desistia em silencio, nenhum dispositivo era inscrito e o Web Push nunca
# chegava ao celular (o PWA em segundo plano nao faz polling; so o push o
# acorda). O EasyPanel repassa as variaveis do servico como build-args, mas o
# Dockerfile precisa DECLARA-LAS com ARG para recebe-las. (Se a variavel nao
# vier, o ENV fica vazio e o client trata como "push desativado" — mesmo
# comportamento de antes, so que agora por escolha e nao por acidente.)
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY

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

# CACHE DE RUNTIME DO NEXT
#
# Os COPY acima rodam como root, entao /app/.next nasce com dono root — e o
# servidor roda como `nextjs`. Toda chamada de revalidatePath nas Server Actions
# faz o Next gravar o manifest de tags em /app/.next/cache; sem permissao, cada
# uma delas cospe no log:
#
#   Failed to update tags manifest.
#   EACCES: permission denied, mkdir '/app/.next/cache'
#
# A renderizacao continua funcionando (as paginas do Build.Flow sao dinamicas,
# nao ha nada de ISR sendo servido do disco), mas o log fica inutilizavel — e um
# log ruidoso esconde o erro seguinte, que pode ser de verdade.
#
# So o CACHE muda de dono, de proposito. O restante de /app/.next continua root
# e somente leitura para a aplicacao: um app comprometido nao reescreve o
# proprio codigo compilado.
RUN mkdir -p /app/.next/cache && chown -R nextjs:nodejs /app/.next/cache

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
