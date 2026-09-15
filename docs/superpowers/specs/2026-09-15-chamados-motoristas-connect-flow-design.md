# Chamados de Motoristas: Build.Connect abre e acompanha, Build.Flow gerencia

Data: 2026-09-15. Vale para os dois repositórios (cópia idêntica em cada um).

## Objetivo

O chamado de Motoristas continua sendo **aberto e acompanhado no Build.Connect**
(formulário atual e "Meus Chamados", com o mapa GPS). A **gestão** — atribuir
motorista, corrida em rota, conclusão com comprovante — passa a acontecer no
**Build.Flow**, dentro do módulo Motorista, com o mesmo fluxo do Connect:
Em Aberto → Atribuído → Em Rota → Concluído.

O **Flow é o dono do registro**: o chamado nasce no Connect, é enviado ao Flow no
ato da abertura e, a partir daí, o Flow é a fonte da verdade. O Connect guarda
um espelho leve para listar e acompanhar.

Chamados de **TI (Retaguarda)** não mudam.

## Contexto que decidiu o desenho

- O Flow já tem papéis `LOGISTICA`, `GESTAO` e `MOTORISTA` (com telefone e PIX),
  comprovante por foto, aviso ao motorista por WhatsApp e push, e "tempo real"
  por polling da tabela `RealtimeEvent`.
- A entrega do Flow (`Delivery`) é presa a um pedido (`orderId` obrigatório) e
  alimenta o pagamento de motoristas no Financeiro. O chamado de transporte
  não é pedido: ganha modelo próprio, sem tocar em `Order`/`Delivery`.
- O Connect tem o GPS (`Trip`/`TripPosition`, geocodificação Nominatim,
  `use-position-broadcast`, DTO `TripTracking` do mapa). Isso é portado para o
  Flow, onde o motorista opera.
- Os dois rodam na **mesma VPS (EasyPanel)**: API e webhook conversam pela
  rede interna, sem expor rota à internet.

## 1. Modelo de dados

### Flow (dono)

```prisma
enum TransportStatus {
  ABERTO
  ATRIBUIDO
  EM_ROTA
  CONCLUIDO
  CANCELADO
}

model TransportRequest {
  id        String          @id @default(cuid())
  // Id do Ticket no Connect. Único: reenviar o mesmo chamado não duplica.
  connectId String          @unique
  // Código que a operação fala em voz alta ("o MOT-014 já foi?"). Vem do Connect.
  code      String
  status    TransportStatus @default(ABERTO)

  // Solicitante é SNAPSHOT do Connect — não existe como usuário do Flow.
  requesterConnectId String
  requesterName      String
  requesterSector    String?
  contact            String?

  serviceType String
  description String

  // Origem: unidade (rótulo) OU endereço manual. Destino: endereço.
  originUnit        String?
  originStreet      String?
  originNumber      String?
  originDistrict    String?
  destStreet        String
  destNumber        String?
  destDistrict      String?

  // Coordenadas geocodificadas UMA vez em "Iniciar rota" (nulas se falhar:
  // o mapa degrada para "só GPS ao vivo").
  originLat Float?
  originLng Float?
  destLat   Float?
  destLng   Float?

  driver   User?   @relation("TransportDriver", fields: [driverId], references: [id])
  driverId String?
  // Quem atribuiu (Logística/Gestão) — null quando o próprio motorista assumiu.
  assignedById String?

  assignedAt  DateTime?
  startedAt   DateTime?
  finishedAt  DateTime?
  distanceKm  Float?
  // Comprovante (.webp). Só o caminho, como todo arquivo do sistema.
  proofPath   String?
  cancelReason String?

  images    TransportImage[]
  positions TransportPosition[]
  history   TransportHistory[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([status])
  @@index([driverId])
  @@index([createdAt])
}

model TransportImage {     // fotos anexadas na abertura (cópia das do Connect)
  id        String @id @default(cuid())
  requestId String
  request   TransportRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  filePath  String
  order     Int    @default(0)
}

model TransportPosition {  // rastro GPS (porta de TripPosition do Connect)
  id         String   @id @default(cuid())
  requestId  String
  request    TransportRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  lat        Float
  lng        Float
  heading    Float?
  speed      Float?
  recordedAt DateTime @default(now())
  @@index([requestId, recordedAt])
}

model TransportHistory {   // linha do tempo mostrada nos dois sistemas
  id        String   @id @default(cuid())
  requestId String
  request   TransportRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  event     String   // "criado" | "atribuido" | "assumido" | "em_rota" | "concluido" | "cancelado" | "desatribuido"
  actorName String?  // nome de quem fez (motorista/gestão) ou "Build.Connect"
  note      String?
  createdAt DateTime @default(now())
  @@index([requestId, createdAt])
}
```

`User` ganha a relação `transportRequests TransportRequest[] @relation("TransportDriver")`.

`RealtimeEvent.type` passa a aceitar `"transport.created" | "transport.updated"`;
o campo `orderId` guarda o id do `TransportRequest` (o bus já é genérico por
id; só o tipo diferencia). `notifyRoles`: `LOGISTICA`, `GESTAO`, e o
`MOTORISTA` afetado.

### Connect (cliente)

`Ticket` continua existindo (é o que "Meus Chamados" lista) e ganha:

```prisma
  // Integração com o Build.Flow (só destination = MOTORISTAS).
  flowId               String?   @unique  // id do TransportRequest no Flow
  flowSyncedAt         DateTime?          // última vez que o espelho foi atualizado
  flowSyncError        String?            // último erro de envio; null = enviado
  externalAssigneeName String?            // nome do motorista, vindo do Flow
```

Mapeamento de status (Flow → Connect): `ABERTO→PENDENTE`, `ATRIBUIDO→ATRIBUIDO`,
`EM_ROTA→EM_ANDAMENTO`, `CONCLUIDO→CONCLUIDO`, `CANCELADO→CANCELADO`. Sem enum
novo no Connect.

`Trip`/`TripPosition` ficam no banco pelo histórico das corridas antigas; não
recebem mais escrita. `assigneeId` deixa de ser usado para MOTORISTAS.

## 2. API de integração (Flow expõe; Connect chama)

Base: `/api/integracao/connect`. Fora do middleware de sessão. Autenticação
por `Authorization: Bearer <CONNECT_INTEGRATION_TOKEN>`, comparação em tempo
constante (`crypto.timingSafeEqual`), rate limit por IP (reuso de
`src/lib/rate-limit.ts`). Token ausente no ambiente → 503 com mensagem clara,
nunca "aberto".

| Método | Rota | Uso |
| --- | --- | --- |
| GET | `/motoristas` | MOTORISTA ativos `{ id, name }` para o formulário do Connect. |
| POST | `/chamados` | Cria. `multipart/form-data`: campos do chamado + `images[]`. Idempotente por `connectId` (segundo POST igual devolve 200 com o mesmo `id`). |
| GET | `/chamados/:connectId` | Detalhe: status, motorista `{ id, name }`, datas, `distanceKm`, `hasProof`, histórico. |
| GET | `/chamados/:connectId/rastreamento` | DTO `TripTracking` (posição atual, rastro subamostrado, ETA, km restantes). 404 enquanto não há corrida iniciada — o front do Connect já trata. |
| GET | `/chamados/:connectId/comprovante` | Bytes do `.webp`. O Connect serve ao solicitante pela própria rota autenticada. |

Payload do `POST /chamados` (campos do `driverTicketSchema` do Connect):

```
connectId, code, requester{ connectId, name, sector }, contact,
serviceType, description,
originUnit | originStreet/originNumber/originDistrict,
destStreet, destNumber, destDistrict,
driverId?  (motorista escolhido na abertura; vazio = Em Aberto)
images[]   (fotos, mesmos limites do Connect)
```

Resposta: `{ id, status, driver: { id, name } | null }`.

## 3. Webhook (Flow avisa; Connect recebe)

A cada mudança de status (atribuído, assumido, desatribuído, em rota,
concluído, cancelado) o Flow faz `POST {CONNECT_WEBHOOK_URL}/api/integracao/flow/webhook`.

- Assinatura: cabeçalhos `X-Flow-Timestamp` (epoch ms) e `X-Flow-Signature` =
  HMAC-SHA256(`${timestamp}.${corpo}`, `CONNECT_WEBHOOK_SECRET`) em hex.
  O Connect rejeita assinatura inválida e timestamp fora de ±5 min.
- Corpo: `{ connectId, flowId, status, driverName, assignedAt, startedAt,
  finishedAt, distanceKm, cancelReason }`.
- Entrega "melhor esforço": 3 tentativas (0s, 5s, 30s) em background; falha
  final vai para o log. **Sem fila persistente.**
- Rede de segurança: o Connect **reconcilia na leitura** — ao montar "Meus
  Chamados" ou o detalhe, chamados de MOTORISTAS não finais com
  `flowSyncedAt` mais velho que 60s são reconsultados em `GET /chamados/:connectId`.

O receptor no Connect é idempotente: aplica o estado recebido (não "avança"
por evento), então evento repetido ou fora de ordem não corrompe o espelho.

## 4. Fluxo ponta a ponta

1. **Abertura (Connect).** Formulário atual. A lista de motoristas do campo
   opcional vem de `GET /motoristas` (cache de 60s em memória); Flow fora do
   ar → o campo não aparece e o chamado nasce Em Aberto. O Connect grava o
   `Ticket` (fotos ficam no Connect como hoje) e chama `POST /chamados`.
   Sucesso → `flowId`, `flowSyncedAt`. Falha → `flowSyncError`; o card mostra
   "aguardando envio à Logística" e a rota de cron `/api/cron/flow-sync`
   (padrão já existente em `/api/cron/...`) reenvia a cada minuto. O
   `connectId` garante que a repetição não duplica.
2. **Gestão (Flow, módulo Motorista → ferramenta Chamados).** Kanban Em Aberto
   → Atribuído → Em Rota → Concluído. LOGISTICA/GESTAO atribuem, desatribuem e
   cancelam. Atribuir avisa o motorista por WhatsApp e push (reuso dos
   módulos existentes; textos próprios do chamado).
3. **Motorista (Flow, mesma ferramenta, visão do motorista).** Vê os chamados
   Em Aberto (pode **assumir**) e os seus. "Iniciar rota" geocodifica origem e
   destino uma vez (porta de `geocode.ts`, Nominatim, User-Agent próprio, 1
   req/s) e liga o envio de posição do navegador (porta de
   `use-position-broadcast`; throttle no cliente, `pushTransportPosition` só
   valida e grava; corrida encerrada ignora posições tardias com `ok: true`).
   "Concluir" exige a foto do comprovante (sharp → `.webp`, mesmo pipeline do
   Flow) e grava `distanceKm` calculado do rastro.
4. **Tempo real (Flow).** Cada mudança publica `RealtimeEvent` — o quadro e a
   visão do motorista atualizam sozinhos pelo provider existente.
5. **Acompanhamento (Connect).** `/api/chamados/[id]/tracking` passa a chamar
   `GET /chamados/:connectId/rastreamento` quando o ticket tem `flowId`
   (autorização do solicitante inalterada). O comprovante é servido por
   `/api/integracao/flow/comprovante/[ticketId]` (sessão do solicitante →
   busca no Flow com o token → devolve os bytes). **O mapa e o modal de "Meus
   Chamados" não mudam.**

## 5. Telas

### Flow — módulo Motorista (`/motorista`)

A página vira um módulo com **ferramentas** (abas), no visual do Flow (tokens
shadcn, paleta `motorista`, Radix Dialog/Select, lucide) e no comportamento do
Connect:

| Ferramenta | Quem vê | O que é |
| --- | --- | --- |
| Entregas | MOTORISTA, GESTAO | A página de hoje ("Minhas entregas" + Histórico). Sem mudança. |
| Chamados | MOTORISTA, LOGISTICA, GESTAO | Porta do `DriverKanbanBoard` do Connect. LOGISTICA/GESTAO: quadro completo com atribuir/desatribuir/cancelar, detalhe (fotos, endereços, contato, histórico), histórico dos concluídos. MOTORISTA: Em Aberto (assumir) + os seus, com Iniciar rota / Concluir. Concluídos somem do quadro após 15 min (mesma janela de Entregas); ficam no histórico. |
| Dashboard | LOGISTICA, GESTAO | Porta do `ItDashboard` de Motoristas: KPIs (abertos, em rota, concluídos no período, tempo médio), distribuição por status, quilometragem total, média por corrida, motoristas ativos. |

- `LOGISTICA` passa a acessar `/motorista` (item de navegação), vendo só
  Chamados e Dashboard. `requireRole` da página aceita os três papéis; cada
  ferramenta confere o seu.
- Componentes novos ficam em `src/app/(dashboard)/motorista/chamados/` e
  `.../dashboard/`, com a lógica de domínio em `src/lib/transport/`
  (`actions.ts`, `tracking.ts`, `geocode.ts`, `status.ts`).

### Connect

- `/setores/motoristas`: **saem** as abas Chamados e Dashboard e o código de
  gestão que só elas usavam (`DriverKanbanBoard`, `driver-ticket-card`,
  `getDriverTickets`, `getDriverDashboard`, `getDriverLogistics`, `startTrip`,
  `pushTripPosition`, `use-position-broadcast`, atribuição para MOTORISTAS).
  Ficam Documentos, Avaliações, Aplicativos e o vídeo do setor.
- "Meus Chamados" (`/chamados`): igual, mais o estado "aguardando envio à
  Logística" e o nome do motorista vindo de `externalAssigneeName`.
- `deleteUser`: o cascade local continua; o Flow guarda só o snapshot do
  solicitante, nada a apagar lá.

## 6. Configuração

| Onde | Variável | Uso |
| --- | --- | --- |
| Flow | `CONNECT_INTEGRATION_TOKEN` | Bearer aceito na API de integração. |
| Flow | `CONNECT_WEBHOOK_URL` | Base do Connect na rede interna (ex.: `http://buildconnect:3000`). |
| Flow | `CONNECT_WEBHOOK_SECRET` | Chave do HMAC do webhook. |
| Connect | `FLOW_API_URL` | Base do Flow na rede interna (ex.: `http://buildflow:3000`). |
| Connect | `FLOW_API_TOKEN` | Mesmo valor de `CONNECT_INTEGRATION_TOKEN`. |
| Connect | `FLOW_WEBHOOK_SECRET` | Mesmo valor de `CONNECT_WEBHOOK_SECRET`. |

Variável ausente → a integração fica **desligada com erro explícito** (log na
subida + mensagem na tela ao tentar abrir chamado de Motoristas), nunca
silenciosa. Os `.env.example` dos dois projetos documentam as seis.

## 7. Erros e casos de borda

- Flow fora do ar na abertura: chamado gravado no Connect, reenvio pelo cron.
- Webhook perdido: reconciliação na leitura (60s).
- Evento repetido/fora de ordem: receptor aplica estado, não transição.
- Geocodificação falha: sem pino, "só GPS ao vivo" (comportamento atual).
- Motorista escolhido na abertura foi desativado no Flow: `POST /chamados`
  cria Em Aberto e devolve `driver: null`; o Connect mostra Em Aberto.
- Token/secret errados: 401 na API, webhook rejeitado — ambos logados.
- Chamados de MOTORISTAS anteriores à integração (sem `flowId`): continuam
  legíveis no Connect com o tracking antigo (`Trip`), sem ações.

## 8. Testes

- **Flow** (`scripts/checks/*.ts`, puros): assinatura HMAC (gera/verifica),
  mapeamento de status, DTO de rastreamento (ETA/km/subamostragem),
  idempotência por `connectId` (lógica de upsert isolada).
- **Connect** (`node:test`): verificação do webhook (assinatura, janela de
  tempo, corpo), mapeamento Flow→Connect, decisão de reconciliar, cliente da
  API (erro/timeout → `flowSyncError`).
- **Ponta a ponta manual** com os dois rodando local: abrir no Connect →
  aparecer no Flow → atribuir → iniciar rota (posição simulada) → mapa no
  Connect → concluir com foto → comprovante no Connect.
- `tsc --noEmit` + `next build` nos dois; `eslint` + `npm test` no Connect.

## 9. Ordem de entrega

1. **Flow**: modelo + migration, `src/lib/transport/`, API de integração,
   ferramentas Chamados e Dashboard, GPS, webhook, checks. Testável sozinho
   (com `curl`) antes de ligar os fios.
2. **Connect**: cliente da API, envio na abertura + cron de reenvio, receptor
   do webhook, tracking e comprovante via Flow, limpeza do setor Motoristas,
   testes.
3. Configuração das variáveis nos dois serviços do EasyPanel e teste ponta a
   ponta em produção com um chamado real.

## Fora do escopo

- Pagamento de motoristas por chamado (o `DriverPayment` do Flow é por pedido).
- Abrir chamado de dentro do Flow.
- Qualquer mudança nos chamados de TI.
