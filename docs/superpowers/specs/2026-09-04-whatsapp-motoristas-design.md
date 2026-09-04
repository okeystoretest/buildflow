# Notificação de motoristas por WhatsApp (Baileys)

Data: 2026-09-04
Status: aprovado para planejamento

## 1. Objetivo

Avisar por WhatsApp todos os motoristas cadastrados quando um pedido fica
disponível para coleta, complementando o Web Push que já existe hoje.

## 2. Contexto do código atual

Três fatos do repositório moldam este desenho:

**O momento certo já é um conceito no sistema.** Um pedido recém-criado nasce
em `EM_ANALISE` — ainda não passou pelo Financeiro, não foi pago, separado nem
embalado. Não há pacote para entregar. O instante em que existe entrega
disponível é `status = ENVIADO` + `delivery.driverId = null` + sem
`trackingCode`, que é a coluna virtual `AGUARDANDO_ENTREGADOR` do Kanban do
Motorista (`src/app/(dashboard)/motorista/page.tsx`).

**Esse momento já tem uma costura de notificação.**
`openOrderForDrivers` (`src/lib/actions/logistics.ts`) chama
`emitOrderAvailableForDrivers` (`src/lib/realtime/emit.ts`), que hoje dispara
Web Push para o papel `MOTORISTA` via `sendPushToRole`. A função já concentra a
regra "avisar todos os motoristas, sem travar a ação de logística". O WhatsApp
entra ali, ao lado do push — nenhuma Server Action precisa mudar.

**O boot do servidor tem um ponto de extensão pronto.**
`src/instrumentation.node.ts` existe e está vazio, com
`experimental.instrumentationHook: true` no `next.config.mjs`. É onde a conexão
sobe. O container roda `node server.js` (Next standalone), ou seja, um processo
Node longevo — uma conexão WebSocket persistente é viável.

## 3. Decisões tomadas

| Decisão | Escolha | Por quê |
|---|---|---|
| Gatilho | Ao abrir o pedido para motoristas | É quando o pacote existe de fato. Disparar na criação avisaria sobre pedido não analisado, em toda venda registrada. |
| Provedor | Baileys | Definido pelo produto, ciente do risco (seção 9). |
| Sessão | Postgres | Sobrevive a deploy, recriação de container e perda de volume; não exige configurar nada no EasyPanel. |
| QR Code | Tela em Gestão | Permite reparear sem acesso ao servidor; o QR expira em ~60s e a tela renova sozinha. |
| Instância única | Linha de concessão com heartbeat | Ver 6.2. |

## 4. Escopo

**Entra:** dependência e ajuste de build; store de sessão em Postgres; conexão
com reconexão automática; módulo de envio com filtro por papel e validação de
número; gatilho no ponto existente; tela de Gestão com QR, status e
interruptor; log de envio por destinatário.

**Não entra:** substituir ou remover o Web Push atual (os dois canais convivem);
mensagens recebidas (o bot não lê nem responde); envio para clientes ou
qualquer papel que não seja `MOTORISTA`; template ou mídia — só texto.

## 5. Modelo de dados

Quatro modelos novos. Todas as migrations são aditivas.

```prisma
// Estado de autenticação do Baileys. Uma linha por chave.
// `id` = "creds" ou "<tipo>:<id>" (pre-key, session, app-state-sync-key, ...).
model WhatsappSession {
  id        String   @id
  data      String   // JSON serializado com BufferJSON (ver 6.1)
  updatedAt DateTime @updatedAt
  createdAt DateTime @default(now())
}

// Configuração do canal. Linha única ("singleton").
model WhatsappConfig {
  id        String   @id @default("singleton")
  // Interruptor de envio. Nasce FALSE: nada é enviado até alguém parear o
  // número e ligar deliberadamente na tela de Gestão.
  enabled   Boolean  @default(false)
  updatedAt DateTime @updatedAt
}

// Concessão de instância única (ver 6.2). Linha única ("singleton").
model WhatsappLock {
  id          String   @id @default("singleton")
  instanceId  String
  heartbeatAt DateTime
}

enum WhatsappSendStatus {
  ENVIADO
  FALHOU
  IGNORADO // número ausente ou inválido; não houve tentativa
}

// Log por destinatário. NUNCA guarda o número inteiro.
model WhatsappSendLog {
  id          String             @id @default(cuid())
  orderId     String?
  userId      String
  phoneSuffix String?            // 4 últimos dígitos, para conferência
  status      WhatsappSendStatus
  error       String?
  createdAt   DateTime           @default(now())

  @@index([orderId])
  @@index([userId])
  @@index([createdAt])
}
```

`WhatsappSendLog` não tem relação Prisma com `Order`/`User` de propósito: é
registro histórico e não deve impedir a exclusão de um pedido ou usuário
(`deleteOrder` já remove pedidos fisicamente).

## 6. Arquitetura

Todo o código do provedor vive em `src/lib/whatsapp/`. Nada fora dessa pasta
importa Baileys — é a fronteira que permite trocar de provedor depois.

```
src/lib/whatsapp/
  auth-store.ts   // AuthenticationState sobre WhatsappSession
  connection.ts   // socket singleton, ciclo de vida, reconexão, QR
  lease.ts        // concessão de instância única
  send.ts         // API pública do módulo
  index.ts        // reexporta apenas o que é público
```

### 6.1 Store de sessão (`auth-store.ts`)

Implementa o `AuthenticationState` do Baileys em cima do Postgres, no lugar do
`useMultiFileAuthState` (que grava arquivos e não sobreviveria à recriação do
container).

- `creds` fica na linha `id = "creds"`; cada chave Signal em `"<tipo>:<id>"`
- Serialização **obrigatoriamente** com `BufferJSON.replacer` / `.reviver` do
  Baileys: o estado contém `Buffer` e `Uint8Array`, que `JSON.stringify` puro
  corromperia silenciosamente — a sessão só falharia depois, na hora de enviar
- `keys.get(type, ids)` faz uma consulta por lote (`id in`), não uma por chave
- `keys.set(data)` grava em transação; valor `null` significa remover a chave
- `saveCreds()` é chamado no evento `creds.update` do socket
- `clearSession()` apaga todas as linhas — usado pelo "desconectar/reparear"

### 6.2 Concessão de instância única (`lease.ts`)

Duas conexões com a mesma credencial se derrubam e colocam o número em risco.
Só um processo pode conectar.

`pg_advisory_lock` foi descartado: o lock do Postgres vive preso à conexão que
o tomou, e o Prisma trabalha com pool — não há como garantir que a conexão
detentora continue viva nem que seja reutilizada. Em vez disso:

- Na subida, o processo gera um `instanceId` (aleatório, em memória)
- Ele assume a liderança se a linha não existe, se já é dele, ou se o
  `heartbeatAt` está mais velho que o TTL de 90s
- Assumida a liderança, renova o `heartbeatAt` a cada 30s
- A tomada é um `updateMany` condicionado ao estado esperado, resolvendo a
  corrida no próprio banco
- Quem não consegue a liderança **não conecta** e registra o motivo uma vez.
  Nada de exceção nem de retentativa agressiva

### 6.3 Conexão (`connection.ts`)

- Socket único no módulo, iniciado por `bootstrapNodeRuntime()`
- `printQRInTerminal: false` — o QR vai para a tela, não para o log
- Logger **`pino` em nível `silent`**, passado explicitamente. O logger padrão
  do Baileys é verboso e imprime JIDs; silenciá-lo faz parte do requisito de
  não expor números (seção 8). `pino` entra como dependência direta, e não
  transitiva do Baileys
- Evento `connection.update`: guarda o `qr` corrente em memória (com validade),
  atualiza o status, e no `connection: "close"` decide entre reconectar e parar
- Reconexão com backoff exponencial de 2s a 60s, dobrando a cada tentativa,
  com jitter de até 20% para não sincronizar réplicas
- `DisconnectReason.loggedOut` é **terminal**: a credencial morreu, reconectar
  não resolve. Limpa a sessão e passa ao estado "aguardando QR"
- Estados expostos: `DESCONECTADO`, `AGUARDANDO_QR`, `CONECTANDO`, `CONECTADO`,
  `SEM_LIDERANCA`

### 6.4 Envio (`send.ts`)

API pública do módulo:

```ts
sendWhatsappToDrivers(args: { orderId?: string }): Promise<void>
getWhatsappStatus(): Promise<WhatsappStatus>
```

Sequência de `sendWhatsappToDrivers`:

1. Se `WhatsappConfig.enabled` é falso ou o status não é `CONECTADO`, retorna
   sem enviar (registrando o motivo uma vez, não por destinatário)
2. Carrega destinatários — **o filtro por papel é da consulta**, e não uma
   checagem posterior:
   ```ts
   prisma.user.findMany({
     where: { role: "MOTORISTA", active: true, phone: { not: null } },
     select: { id: true, phone: true },
   })
   ```
3. Para cada motorista, normaliza com `normalizePhone` e valida com
   `isValidPhone` (`src/lib/phone.ts`, já existe). Inválido vira log
   `IGNORADO`, sem tentativa
4. Monta o JID prefixando o código do país: `55 + <DDD+número>` +
   `@s.whatsapp.net`. O banco guarda o número **sem** o `55` por decisão
   anterior; a prefixação acontece aqui, na borda
5. Envia **em sequência**, com intervalo aleatório de 1s a 3s entre
   destinatários. Disparo paralelo para N números é o padrão que provoca
   bloqueio
6. `try/catch` por destinatário. Uma falha nunca interrompe as demais
7. Grava um `WhatsappSendLog` por destinatário

A função **nunca lança** — mesmo caráter fire-and-forget do `sendPushToRole`.

Texto da mensagem, exatamente como especificado:

```
Novo pacote disponível para entrega!
Acesse https://buildflowapp.com.br/login para mais informações.
```

A mensagem não carrega número do pedido nem nome de cliente. Além de ser o
texto pedido, isso evita mandar dado de cliente por um canal não-oficial.

### 6.5 Gatilho

Uma chamada em `emitOrderAvailableForDrivers` (`src/lib/realtime/emit.ts`), ao
lado do `sendPushToRole` existente, no mesmo padrão `void ... .catch(...)`:

```ts
void sendWhatsappToDrivers({ orderId: args.orderId })
  .catch((err) => console.error("[whatsapp] envio p/ motoristas falhou:", err));
```

`openOrderForDrivers` e as demais actions de logística não mudam. Como
`emitOrderAvailableForDrivers` só é chamada para pedido sem `trackingCode`, a
regra "com rastreio segue por transportadora, não chama entregador" é herdada
de graça.

### 6.6 Tela em Gestão

Nova aba `"WhatsApp"` no `TABS` de `src/app/(dashboard)/gestao/tabs-client.tsx`,
com painel próprio. Restrita a `GESTAO` — a página já usa `requireRole`, e cada
Server Action revalida com `requireRoleAction(["GESTAO"])`.

Mostra: status da conexão; QR (como data URL gerado pela lib `qrcode`) quando
`AGUARDANDO_QR`; número conectado, se houver; e o interruptor de envio.

Ações: `refreshWhatsappStatus`, `setWhatsappEnabled(boolean)`,
`disconnectWhatsapp()` (limpa a sessão e força novo pareamento).

O painel faz polling curto (~3s) apenas enquanto está aguardando QR, porque o
código expira em torno de 60s e é substituído.

## 7. Build e dependências

- `@whiskeysockets/baileys` — versão **fixada** (sem `^`): é biblioteca de
  engenharia reversa, e atualização automática é risco de quebra em produção
- `qrcode` — renderiza o QR como data URL para a tela
- `pino` — logger silencioso explícito para o Baileys
- As três entram em `experimental.serverComponentsExternalPackages` no
  `next.config.mjs`, ao lado do `sharp`. O Baileys carrega protobuf e libsignal
  e não sobrevive ao empacotamento do webpack
- O `Dockerfile` não muda: as dependências vêm pelo `npm ci` e o standalone já
  copia o necessário. **Confirmar no primeiro deploy** que o Baileys foi
  incluído no `.next/standalone/node_modules` — pacotes externalizados às vezes
  precisam ser copiados à mão, como já acontece com o Prisma

## 8. Segurança e privacidade

- Números **nunca** aparecem em log: as mensagens registram id do usuário e, no
  máximo, os 4 últimos dígitos
- Credenciais de sessão nunca saem do banco: não vão para log, não são
  retornadas por Server Action, não chegam ao cliente. A tela recebe apenas
  status e QR
- O logger do Baileys fica em `silent` justamente para não vazar JIDs
- O filtro `role: "MOTORISTA"` está na consulta ao banco, antes de qualquer
  envio. Não existe caminho no código em que outro papel receba mensagem
- Todas as actions do painel exigem `GESTAO`
- `WhatsappSendLog` guarda sufixo, não o número

## 9. Riscos operacionais

- **Ban do número.** Baileys é cliente não-oficial; disparo em lote é o padrão
  que o WhatsApp mais penaliza. O risco recai sobre o número pareado. Mitigado
  por envio sequencial com intervalo e pelo interruptor de desligamento, não
  eliminado
- **Quebra por mudança de protocolo.** Atualização do WhatsApp pode derrubar a
  biblioteca. Por isso a versão é fixada e o envio nunca derruba a ação de
  logística
- **Sessão perdida.** Logout pelo aparelho ou troca de chip exige novo QR, e o
  envio para até alguém escanear. **Definir quem é o dono do número** faz parte
  da entrada em operação
- **Réplica extra.** Se o serviço for escalado, apenas um processo conecta; os
  demais ficam em `SEM_LIDERANCA` e não enviam

## 10. Critérios de aceite

1. Ao abrir um pedido para motoristas (sem rastreio), todos os usuários com
   papel `MOTORISTA`, ativos e com número válido recebem a mensagem
2. Nenhum usuário de outro papel recebe mensagem, em nenhum caminho de código
3. Falha no envio a um motorista não impede os demais
4. Existe registro de sucesso/erro por destinatário
5. A sessão sobrevive a um redeploy sem novo escaneamento
6. Queda de conexão reconecta sozinha, sem intervenção
7. Nenhum número completo nem credencial aparece em log
8. Com o interruptor desligado, nada é enviado

## 11. Verificação

O projeto não tem suíte de testes; a verificação é a que já se usa aqui:
`prisma validate`, `tsc --noEmit` e `npm run build`, mais checagem manual da
lógica pura.

Testável sem WhatsApp real (lógica pura, exercitada por script como se fez com
`src/lib/phone.ts`): seleção e filtro de destinatários; validação e montagem do
JID com prefixo `55`; isolamento de falha por destinatário; serialização
`BufferJSON` ida e volta; tomada e expiração da concessão.

Exige aparelho e número real: pareamento por QR; sobrevivência da sessão a um
redeploy; reconexão após queda; entrega da mensagem.

Estes últimos não têm como ser verificados por mim e precisam de validação
sua em homologação, com o interruptor ligado e um único motorista de teste
cadastrado, antes de liberar para a equipe toda.

## 12. Ordem de implementação sugerida

1. Migrations e modelos (5)
2. `auth-store.ts` + `lease.ts` — lógica pura, verificável por script
3. `connection.ts` + boot em `instrumentation.node.ts`
4. Tela de Gestão (QR, status, interruptor) — necessária para parear
5. `send.ts`
6. Gatilho em `emitOrderAvailableForDrivers` — por último, quando o resto já
   funciona, para não disparar mensagem antes da hora
