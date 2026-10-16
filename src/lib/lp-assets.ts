/**
 * Imagens da LP pública de atacado, trocáveis pelo dono sem deploy — a parte
 * PURA: constantes, tipos e as guardas de caminho.
 *
 * POR QUE ESTE ARQUIVO NÃO TOCA O SISTEMA DE ARQUIVOS
 * `modo-edicao.tsx` é client component e precisa de `MAX_ALT` e do tipo
 * `LugarDeImagem`. Enquanto a leitura e a escrita do manifesto viviam aqui, esse
 * import arrastava `fs/promises` para o bundle do navegador, o webpack não
 * resolvia o módulo e a COMPILAÇÃO INTEIRA morria — 500 em toda rota do app,
 * inclusive `/login`. O I/O mora em `lp-assets-server.ts`; aqui não entra nada
 * que só exista no Node, e é isso que impede a regressão.
 *
 * POR QUE UM JSON NO VOLUME E NÃO UMA TABELA
 * Decisão registrada em docs/superpowers/specs/2026-10-16-lp-atacado-editor-imagens-design.md.
 * Em resumo: `migrate diff` contra este banco emite hoje três ALTER COLUMN de
 * drift pré-existente do Select, que entrariam em qualquer migration gerada
 * aqui — e um `migrate deploy` desta branch sozinha tentaria alterar tabelas que
 * nenhuma migration comitada cria, impedindo o servidor de subir (o Dockerfile
 * faz `migrate deploy && exec node server.js`). O dado são quatro lugares com
 * nome de arquivo e texto alternativo, e mora ao lado das imagens que descreve.
 *
 * Custo aceito: sem transação. A escrita é atômica por arquivo temporário mais
 * rename, e existe um editor só.
 */

/**
 * Pasta, dentro de uploads, que a rota de leitura pública serve. Só ela.
 *
 * NÃO PODE SER "atacado". `actions/wholesale-apply.ts` grava as duas fotografias
 * de cada candidata a revenda em `<UPLOAD_DIR>/atacado/<ano>/<mês>/`, com a
 * MESMA extensão `.webp` — e essas exigem sessão, porque são a foto do
 * estabelecimento físico e o print da loja de alguém que não é cliente. Com os
 * dois usando o nome `atacado`, um `GET /api/lp/atacado/2026/10/loja_<uuid>.webp`
 * devolvia a foto da lojista sem cookie nenhum, e com `Cache-Control: public,
 * immutable` de um ano. Pasta pública e pasta de dado pessoal não podem ter o
 * mesmo nome: a allow-list de extensão não as distingue.
 */
export const PASTA_PUBLICA = "lp-publico";

/** Base da rota de leitura pública. */
export const BASE_PUBLICA = "/api/lp";

/**
 * Os quatro lugares de imagem da página, fixos.
 *
 * Lista fechada de propósito: o lugar chega do navegador na Server Action, e
 * aceitar nome livre deixaria o dono (ou quem forjasse a chamada) escrever
 * chaves arbitrárias no manifesto.
 */
export const LUGARES_DE_IMAGEM = ["hero", "motivo-1", "motivo-2", "motivo-3"] as const;
export type LugarDeImagem = (typeof LUGARES_DE_IMAGEM)[number];

export interface ImagemDaLp {
  /** Caminho relativo DENTRO de uploads, sempre começando por `PASTA_PUBLICA`. */
  arquivo: string;
  /** Texto alternativo. Vazio = decorativa. */
  alt: string;
}

export type ManifestoDaLp = Partial<Record<LugarDeImagem, ImagemDaLp>>;

/** Teto do texto alternativo: é texto de página pública, com dono único. */
export const MAX_ALT = 160;

/** Alfabeto do slug de marca, que vira nome de pasta. */
export const SLUG_DE_MARCA = /^[a-z0-9-]{1,40}$/;

export function ehLugarDeImagem(valor: unknown): valor is LugarDeImagem {
  return typeof valor === "string" && (LUGARES_DE_IMAGEM as readonly string[]).includes(valor);
}

/**
 * O caminho é servível pela rota pública?
 *
 * Três exigências, e as três existem por um motivo diferente:
 * - começa por `PASTA_PUBLICA`: a rota pública serve UMA pasta, e nenhuma outra.
 *   Comprovante de pagamento, nota fiscal e as FOTOGRAFIAS DAS CANDIDATAS (que
 *   `wholesale-apply.ts` grava em `atacado/<ano>/`) seguem exigindo sessão;
 * - termina em ".webp": é o único formato que `processAndSaveImage` escreve, e
 *   lista fechada de extensão é mais barata que adivinhar tipo por conteúdo;
 * - não contém segmento "..", barra invertida, nem começa por "/": travessia de
 *   caminho é a falha que esta função existe para impedir. A canonicalização em
 *   `caminhoAbsolutoDaLp` é a segunda barreira; esta é a primeira.
 */
export function ehCaminhoDeImagemDaLp(arquivo: unknown): arquivo is string {
  if (typeof arquivo !== "string" || arquivo.length === 0 || arquivo.length > 300) return false;
  if (!arquivo.startsWith(`${PASTA_PUBLICA}/`)) return false;
  if (!arquivo.endsWith(".webp")) return false;
  if (arquivo.includes("\\") || arquivo.includes("\0")) return false;
  if (arquivo.split("/").some((seg) => seg === "" || seg === "." || seg === "..")) return false;
  return true;
}

/** URL por onde o navegador busca a imagem. */
export function urlPublicaDaImagem(arquivo: string): string {
  return `${BASE_PUBLICA}/${arquivo}`;
}

/**
 * Descarta o que não é entrada válida em vez de lançar.
 *
 * O manifesto é um arquivo em disco que pode ter sido editado à mão, truncado
 * por queda de energia no meio de uma escrita antiga, ou escrito por uma versão
 * futura deste código. Em qualquer um desses casos a página pública tem de
 * continuar de pé mostrando o espaço reservado — nunca quebrar por causa de um
 * JSON torto.
 */
export function normalizarManifesto(cru: unknown): ManifestoDaLp {
  if (typeof cru !== "object" || cru === null || Array.isArray(cru)) return {};
  const fonte = cru as Record<string, unknown>;
  const limpo: ManifestoDaLp = {};
  for (const lugar of LUGARES_DE_IMAGEM) {
    const entrada = fonte[lugar];
    if (typeof entrada !== "object" || entrada === null) continue;
    const { arquivo, alt } = entrada as Record<string, unknown>;
    if (!ehCaminhoDeImagemDaLp(arquivo)) continue;
    limpo[lugar] = {
      arquivo,
      alt: typeof alt === "string" ? alt.slice(0, MAX_ALT) : "",
    };
  }
  return limpo;
}
