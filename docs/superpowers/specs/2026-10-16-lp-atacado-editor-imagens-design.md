# Editor oculto de imagens da LP de Atacado — spec

**Data:** 16/10/2026 · **Superfície:** `/atacado/[marca]` (LP pública) ·
**Branch:** `feat/lp-atacado-analise-clientes`

## Problema

A LP é guiada por fotografia editorial e o dono não tem as fotos no
repositório. Hoje cada lugar de imagem renderiza um espaço reservado dignamente
vazio. Trocar essas imagens exige mexer no código e fazer deploy — que é
exatamente o que o dono pediu para não precisar fazer.

## Decisões do dono (respondidas em 16/10)

| # | Decisão | Alternativas à vista | Motivo |
|---|---|---|---|
| 1 | **Autoridade é a sessão do Build.Flow** (`GESTAO`) | senha própria da LP; link secreto | Zero credencial nova e zero porta de autenticação nova numa página pública. Senha que vaza entrega o texto e as fotos da marca a um estranho |
| 2 | **Só imagens são editáveis** | imagens + textos; tudo | A copy segue vinda da planilha e travada por digest sha256. Abrir texto à edição tornaria a trava decorativa: a garantia de que ninguém publica promessa que o negócio não fez vale mais que a comodidade |
| 3 | **Rota de leitura pública só para a pasta `atacado`** | gravar em `public/` | O upload continua pelo caminho endurecido (assinatura por magic bytes, sharp, webp, tetos de decodificação). Só o que o dono publicou fica legível sem sessão; o resto dos uploads segue exigindo login |

## Decisão técnica que é minha, e o motivo

**O mapa das imagens NÃO vai para o Postgres.** Vai para um manifesto JSON no
próprio volume de uploads: `<UPLOAD_DIR>/atacado/<marca>/manifest.json`.

Isto diverge do idioma do projeto, que é Prisma para tudo, e a razão é
específica desta árvore de trabalho:

1. `prisma/schema.prisma` carrega **216 linhas não comitadas** da feature Select.
   Acrescentar um model ali e comitar o arquivo arrastaria o Select para esta
   branch — exatamente a causa do risco descrito na seção 7.1 do handoff de
   14/10, onde um commit anterior já fez isso com `Order.financeApprovedAt`.
2. `prisma migrate diff` contra este banco emite hoje **três
   `ALTER COLUMN "updatedAt" DROP DEFAULT`** (SelectContract, SelectInstallment,
   SelectPlan) — o defeito pré-existente da seção 7.3. Qualquer migration que eu
   gerasse levaria essas três junto, e o `migrate deploy` desta branch sozinha
   tentaria alterar tabelas que o schema comitado não tem. O Dockerfile faz
   `migrate deploy && exec node server.js`: a migration falha e **o servidor não
   sobe**. É uma falha pior que a quebra de build que a branch já tem.
3. `prisma generate` falha com EPERM enquanto o `next dev` do dono está de pé.

O dado é minúsculo — quatro lugares por marca, cada um com nome de arquivo e
texto alternativo — e mora naturalmente ao lado das imagens que descreve, no
mesmo volume persistente. **Custo aceito:** sem transação e sem consulta; a
escrita é atômica por `write` em arquivo temporário mais `rename`, e há um
editor só (o dono). Se um dia o conteúdo da LP crescer para além de imagens,
isto vira tabela — e aí o Select já estará comitado.

## Modelo

```ts
// Quatro lugares, fixos. Nome de lugar que não está nesta lista é recusado.
type LugarDeImagem = "hero" | "motivo-1" | "motivo-2" | "motivo-3";

interface ImagemDaLp {
  /** Caminho relativo DENTRO de uploads, sempre começando por "atacado/". */
  arquivo: string;
  /** Texto alternativo. Vazio = imagem decorativa. */
  alt: string;
}

type ManifestoDaLp = Partial<Record<LugarDeImagem, ImagemDaLp>>;
```

Lugar sem entrada no manifesto cai no espaço reservado atual. É isso que faz a
página continuar correta antes de qualquer upload, e o que a mantém correta se
o manifesto for apagado.

## Fluxo de escrita

1. O dono, com sessão `GESTAO`, abre a LP e revela o editor pelo **gatilho
   oculto**: pressionar e segurar (800 ms) o nome da marca no rodapé. Não é
   segredo de segurança — a autoridade é a sessão, conferida no servidor; o
   gatilho só evita que a página pública exiba controles a quem não vai usá-los.
2. Escolhe o arquivo. O navegador encolhe com `shrinkImageToBase64` (mesmo
   caminho da lojista, inclusive a tentativa de decodificar HEIC).
3. A Server Action `salvarImagemDaLp`:
   - `requireRoleAction(["GESTAO"])` — sem isso, nada;
   - recusa lugar de imagem fora da lista;
   - `validateUploadDataUrl` (assinatura por magic bytes) e recusa PDF;
   - `processAndSaveImage` com os **tetos apertados** da LP (50 Mpx de entrada,
     64 MB de raster — a mesma guarda que fechou a bomba de descompressão);
   - grava o manifesto de forma atômica;
   - **apaga o arquivo substituído**, para a troca não acumular lixo no volume.
4. `revalidatePath` nos dois slugs da marca.

## Fluxo de leitura

`GET /api/lp/<caminho>` serve o arquivo **sem sessão**, com três guardas:

1. o caminho resolvido tem de ficar **dentro** de `<UPLOAD_DIR>/atacado`
   (canonicalização, não comparação de texto);
2. extensão só `.webp` — é o único formato que `processAndSaveImage` escreve;
3. `Content-Type` fixo em `image/webp` e `X-Content-Type-Options: nosniff`.

Nada mais do volume de uploads fica alcançável por esta rota: comprovante de
pagamento, nota fiscal e comprovante de entrega seguem exigindo sessão em
`/api/uploads`.

## O que esta spec NÃO faz

- **Não edita texto.** Decisão 2 do dono.
- **Não cria usuário nem senha nova.** Decisão 1.
- **Não versiona imagem.** Trocar substitui e apaga a anterior. Histórico de
  imagem de LP não paga o próprio custo.
- **Não resolve o aviso de privacidade** que a auditoria pediu: é texto, e texto
  é da planilha e do dono.

## Verificação

- `scripts/checks/lp-assets.ts` — parte pura: lugar inválido recusado, caminho
  que tenta escapar da pasta recusado, manifesto ausente ou corrompido lido como
  vazio em vez de lançar.
- `npx tsc --noEmit`.
- `curl` nos dois slugs, mais `/api/lp/` com um caminho de travessia
  (`..%2f..%2fcomprovantes`) esperando recusa.
- **Não verificável aqui:** a aparência do editor, o gesto de pressionar e
  segurar num celular de verdade, e o upload de ponta a ponta com sessão real.
