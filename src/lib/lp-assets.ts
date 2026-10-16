import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "node:crypto";

/**
 * Imagens da LP pública de atacado, trocáveis pelo dono sem deploy.
 *
 * POR QUE UM JSON NO VOLUME E NÃO UMA TABELA
 * Decisão registrada em docs/superpowers/specs/2026-10-16-lp-atacado-editor-imagens-design.md.
 * Em resumo: `prisma/schema.prisma` carrega 216 linhas não comitadas da feature
 * Select, então acrescentar um model ali e comitar arrastaria o Select para esta
 * branch; e `migrate diff` contra este banco emite hoje três ALTER COLUMN de
 * drift pré-existente do Select, que entrariam em qualquer migration que eu
 * gerasse — e um `migrate deploy` desta branch sozinha tentaria alterar tabelas
 * que o schema comitado não tem, impedindo o servidor de subir (o Dockerfile faz
 * `migrate deploy && exec node server.js`). O dado são quatro lugares com nome
 * de arquivo e texto alternativo, e mora ao lado das imagens que descreve.
 *
 * Custo aceito: sem transação. A escrita é atômica por arquivo temporário mais
 * rename, e existe um editor só.
 */

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "./uploads";

/** Pasta, dentro de uploads, que a rota de leitura pública serve. Só ela. */
export const PASTA_PUBLICA = "atacado";

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
  /** Caminho relativo DENTRO de uploads, sempre começando por "atacado/". */
  arquivo: string;
  /** Texto alternativo. Vazio = decorativa. */
  alt: string;
}

export type ManifestoDaLp = Partial<Record<LugarDeImagem, ImagemDaLp>>;

/** Teto do texto alternativo: é texto de página pública, com dono único. */
export const MAX_ALT = 160;

export function ehLugarDeImagem(valor: unknown): valor is LugarDeImagem {
  return typeof valor === "string" && (LUGARES_DE_IMAGEM as readonly string[]).includes(valor);
}

/**
 * O caminho é servível pela rota pública?
 *
 * Três exigências, e as três existem por um motivo diferente:
 * - começa por "atacado/": a rota pública serve UMA pasta, e nenhuma outra —
 *   comprovante de pagamento e nota fiscal seguem exigindo sessão;
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
 * Caminho absoluto no disco, ou null quando o resultado escaparia da pasta
 * pública. Segunda barreira: o texto já foi conferido, aqui o sistema de
 * arquivos decide.
 */
export function caminhoAbsolutoDaLp(arquivo: string): string | null {
  if (!ehCaminhoDeImagemDaLp(arquivo)) return null;
  const raiz = path.resolve(UPLOAD_DIR, PASTA_PUBLICA);
  const absoluto = path.resolve(path.resolve(UPLOAD_DIR), arquivo);
  if (absoluto !== raiz && !absoluto.startsWith(raiz + path.sep)) return null;
  return absoluto;
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

function caminhoDoManifesto(marcaSlug: string): string {
  // O slug vem da rota e já passou por `getBrandContent`; ainda assim só o
  // alfabeto do slug é aceito, porque este valor virou nome de pasta.
  const seguro = marcaSlug.replace(/[^a-z0-9-]/g, "");
  return path.resolve(UPLOAD_DIR, PASTA_PUBLICA, seguro, "manifest.json");
}

export async function lerManifesto(marcaSlug: string): Promise<ManifestoDaLp> {
  try {
    const cru = await readFile(caminhoDoManifesto(marcaSlug), "utf8");
    return normalizarManifesto(JSON.parse(cru));
  } catch {
    // Ausente, ilegível ou JSON inválido: a página mostra os espaços
    // reservados, que é o estado correto de "ainda não há foto".
    return {};
  }
}

export async function escreverManifesto(
  marcaSlug: string,
  manifesto: ManifestoDaLp,
): Promise<void> {
  const destino = caminhoDoManifesto(marcaSlug);
  await mkdir(path.dirname(destino), { recursive: true });
  // Temporário + rename: no mesmo volume o rename é atômico, então ninguém lê
  // meio manifesto. Escrever direto no destino deixaria essa janela aberta.
  const temporario = `${destino}.${randomUUID()}.tmp`;
  await writeFile(temporario, `${JSON.stringify(manifesto, null, 2)}\n`, "utf8");
  await rename(temporario, destino);
}
