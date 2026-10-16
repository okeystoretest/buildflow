import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "node:crypto";
import {
  PASTA_PUBLICA,
  SLUG_DE_MARCA,
  ehCaminhoDeImagemDaLp,
  normalizarManifesto,
  type ManifestoDaLp,
} from "@/lib/lp-assets";

/**
 * O lado de SERVIDOR das imagens da LP: caminhos no disco e o manifesto.
 *
 * Separado de `lp-assets.ts` de propósito. `modo-edicao.tsx` é client component
 * e importa `MAX_ALT` dali; enquanto `fs/promises` morava no mesmo módulo, esse
 * import quebrava o bundle do navegador e derrubava a compilação inteira — 500
 * em toda rota, inclusive `/login`. Nada aqui pode ser importado por componente
 * de cliente.
 */

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "./uploads";

/** Raiz absoluta da pasta pública, canônica. */
function raizPublica(): string {
  return path.resolve(UPLOAD_DIR, PASTA_PUBLICA);
}

/**
 * Um caminho ABSOLUTO está contido na pasta pública?
 *
 * Separado para a rota poder reconferir o caminho REAL (depois de `realpath`,
 * que resolve link simbólico) com a mesma regra, em vez de reescrevê-la.
 */
export function ehDentroDaPastaPublica(absoluto: string): boolean {
  const raiz = raizPublica();
  return absoluto === raiz || absoluto.startsWith(raiz + path.sep);
}

/**
 * Caminho absoluto no disco, ou null quando o resultado escaparia da pasta
 * pública. Segunda barreira: o texto já foi conferido, aqui o sistema de
 * arquivos decide.
 */
export function caminhoAbsolutoDaLp(arquivo: string): string | null {
  if (!ehCaminhoDeImagemDaLp(arquivo)) return null;
  const absoluto = path.resolve(path.resolve(UPLOAD_DIR), arquivo);
  return ehDentroDaPastaPublica(absoluto) ? absoluto : null;
}

/**
 * O caminho que o manifesto guarda, derivado do absoluto que `processAndSaveImage`
 * devolveu.
 *
 * Por que não `filePath.replace(/^\/api\/uploads\//, "")`: a base pública é
 * CONFIGURÁVEL (`NEXT_PUBLIC_UPLOAD_BASE_URL`, em `image.ts`). Apontá-la para um
 * CDN ou para o legado `/uploads` fazia o replace não casar, o manifesto
 * descartar a entrada na leitura e a imagem nunca aparecer — enquanto a action
 * respondia "ok" e apagava a anterior. Derivar do caminho em disco não depende
 * de variável de ambiente nenhuma.
 */
export function caminhoRelativoDaLp(absolutePath: string): string | null {
  const relativo = path
    .relative(path.resolve(UPLOAD_DIR), absolutePath)
    .split(path.sep)
    .join("/");
  return ehCaminhoDeImagemDaLp(relativo) ? relativo : null;
}

function caminhoDoManifesto(marcaSlug: string): string {
  // RECUSA em vez de higienizar. `replace(/[^a-z0-9-]/g, "")` fazia slugs
  // distintos colapsarem na mesma pasta ("LovClub" e "lov_club" viravam
  // "ovlub"/"lovclub"), e um slug que higienizasse para vazio ("OKEY", "....")
  // punha o manifesto na RAIZ compartilhada da pasta pública, um nível acima da
  // marca. Lançar aqui faz o erro aparecer no cadastro da marca nova, não seis
  // meses depois numa pasta errada.
  if (!SLUG_DE_MARCA.test(marcaSlug)) {
    throw new Error(`Slug de marca inválido para o manifesto: ${marcaSlug}`);
  }
  return path.resolve(UPLOAD_DIR, PASTA_PUBLICA, marcaSlug, "manifest.json");
}

export async function lerManifesto(marcaSlug: string): Promise<ManifestoDaLp> {
  try {
    const cru = await readFile(caminhoDoManifesto(marcaSlug), "utf8");
    return normalizarManifesto(JSON.parse(cru));
  } catch {
    // Ausente, ilegível, JSON inválido ou slug recusado: a página mostra os
    // espaços reservados, que é o estado correto de "ainda não há foto".
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
