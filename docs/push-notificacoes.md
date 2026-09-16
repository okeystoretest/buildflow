# Notificações push (navegador / PWA)

Dois mecanismos, ambos em `src/components/shared/realtime-provider.tsx`:

| Mecanismo | Quando chega | Requisitos |
| --- | --- | --- |
| Notificação em foco | Só com o app aberto (polling a `/api/events/poll` a cada 4 s; pausa com a aba oculta). | Permissão de notificação. |
| Web Push (SO) | Com o app minimizado, fechado ou em segundo plano — é o único que funciona no celular/PWA. | Permissão + Service Worker (`public/sw.js`) + inscrição salva em `PushSubscription` + chaves VAPID. |

## Variáveis

| Variável | Onde vale | Uso |
| --- | --- | --- |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | **Build** (inlinada no bundle do navegador) | Chave pública usada pelo client para assinar o push. |
| `VAPID_PRIVATE_KEY` | Runtime | Chave privada usada pelo servidor (`src/lib/push.ts`). |
| `VAPID_SUBJECT` | Runtime, opcional | `mailto:` ou URL de contato. |

Gere o par uma vez: `npx web-push generate-vapid-keys`. As chaves não mudam
entre deploys — trocar a pública invalida todas as inscrições existentes.

### Por que a pública precisa estar no build

O Next substitui `process.env.NEXT_PUBLIC_*` por valor literal durante o
`next build`. No EasyPanel, as variáveis do serviço são repassadas ao Docker
como build-args, mas só chegam ao estágio de build se o `Dockerfile` as
declarar com `ARG` — o que está feito para `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
Configurar a variável **depois** do build (só em runtime) não tem efeito:
o bundle já saiu com `undefined`, `registerPush()` desiste e nenhum
dispositivo é inscrito.

Sintoma dessa falha: desktop com a aba aberta recebe o pop-up, celular não
recebe nada, e `SELECT count(*) FROM "PushSubscription"` retorna 0.

## Requisitos por plataforma

- **HTTPS** em todos os casos.
- **Android (Chrome)**: funciona no navegador e no PWA instalado. O construtor
  `new Notification()` não existe em página no Android — a notificação em foco
  usa `registration.showNotification()` do Service Worker.
- **iOS (Safari, 16.4+)**: Web Push só para app adicionado à Tela de Início.
  No Safari solto a API nem existe; o app mostra a instrução de instalação.
- **Opt-in**: o botão "Ativar alertas" aparece para FINANCEIRO, MOTORISTA e
  VENDAS (papéis que recebem push). Cada usuário toca uma vez por dispositivo.

## Checklist de deploy

1. `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (e `VAPID_SUBJECT`)
   configuradas no serviço `web` do projeto `buildflow` **antes** de implantar.
2. Implantar (rebuild). Conferir no "Ver código-fonte" de uma página logada que
   a chave pública aparece no bundle (buscar pelos primeiros caracteres).
3. Em cada dispositivo: abrir o app (no iPhone, pela Tela de Início), tocar em
   "Ativar alertas" e aceitar. `PushSubscription` passa a ter uma linha por
   dispositivo.
4. Teste: criar um pedido / chamado e conferir o alerta com o app fechado.

## Diagnóstico

| Sintoma | Verificar |
| --- | --- |
| Botão "Ativar alertas" não aparece | Papel do usuário; HTTPS; no iPhone, se está instalado. |
| Botão aparece, aceita, mas `PushSubscription` continua vazia | Console do navegador: `[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY ausente no build` → variável não estava no build. |
| Inscrição existe, mas nada chega | Log do servidor: `[push] VAPID keys ausentes` (privada faltando) ou `[push] falha ao enviar: <status>`. 410/404 são inscrições expiradas e são limpas sozinhas. |
