# Integração com o Build.Connect (chamados de motoristas)

O Connect abre e acompanha; o Flow gerencia. Desenho completo em
`docs/superpowers/specs/2026-09-15-chamados-motoristas-connect-flow-design.md`.

## Variáveis de ambiente (Flow)

| Variável | Uso |
| --- | --- |
| `CONNECT_INTEGRATION_TOKEN` | Bearer aceito em `/api/integracao/connect/*`. Mesmo valor de `FLOW_API_TOKEN` no Connect. |
| `CONNECT_WEBHOOK_URL` | Base do Connect na rede interna do EasyPanel, ex.: `http://buildconnect:3000`. |
| `CONNECT_WEBHOOK_SECRET` | Chave do HMAC do webhook. Mesmo valor de `FLOW_WEBHOOK_SECRET` no Connect. |
| `GEOCODE_DEFAULT_CITY` | Opcional. Cidade acrescentada às consultas de geocodificação (ex.: `São Paulo, SP`). |

Sem as três primeiras a integração fica desligada: a API responde 503 e o
webhook só registra no log.

## Rotas (todas com `Authorization: Bearer <token>`)

- `GET  /api/integracao/connect/motoristas` — mantida no contrato; o Connect deixou de usá-la (o formulário não escolhe mais motorista: todo chamado nasce `ABERTO`).
- `POST /api/integracao/connect/chamados` — multipart: `payload` (JSON) + `images` (0..5)
- `GET  /api/integracao/connect/chamados/:connectId`
- `GET  /api/integracao/connect/chamados/:connectId/rastreamento`
- `GET  /api/integracao/connect/chamados/:connectId/comprovante`

## Webhook (Flow → Connect)

`POST {CONNECT_WEBHOOK_URL}/api/integracao/flow/webhook` com cabeçalhos
`x-flow-timestamp` e `x-flow-signature` (HMAC-SHA256 de `${timestamp}.${corpo}`,
hex). Corpo: `{ connectId, flowId, status, driverName, assignedAt, startedAt,
finishedAt, distanceKm, cancelReason }`. Três tentativas (0s, 5s, 30s).

## Checks

    npx tsx scripts/checks/transport-status.ts
    npx tsx scripts/checks/transport-tracking.ts
    npx tsx scripts/checks/integration-signature.ts
