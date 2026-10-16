import { NextResponse, type NextRequest } from "next/server";
import { readFile, stat } from "node:fs/promises";
import { caminhoAbsolutoDaLp } from "@/lib/lp-assets";

/**
 * Leitura PÚBLICA das imagens da landing page de atacado — e de nada mais.
 *
 * Por que existe uma segunda rota de arquivo: `/api/uploads` exige sessão de
 * propósito, porque serve comprovante de pagamento, nota fiscal e comprovante
 * de entrega. A lojista que abre a LP não tem sessão nenhuma, então as imagens
 * da página precisam de um caminho próprio — e esse caminho serve UMA pasta.
 *
 * Três guardas, cada uma por um motivo diferente:
 * 1. `caminhoAbsolutoDaLp` exige que o caminho comece por "atacado/", termine em
 *    ".webp" e não tenha segmento "..", e depois CANONICALIZA e confirma que o
 *    resultado ficou dentro de <UPLOAD_DIR>/atacado. Texto primeiro, sistema de
 *    arquivos depois: a travessia é a falha que esta rota mais convida.
 * 2. `Content-Type` fixo em image/webp mais `nosniff`: a extensão é a única
 *    permitida e é a única que `processAndSaveImage` escreve, então não há tipo
 *    a negociar — e sem o nosniff o navegador poderia interpretar o conteúdo.
 * 3. Cache PÚBLICO aqui, ao contrário de /api/uploads: estas imagens são
 *    deliberadamente públicas, e a lojista está em dados móveis. `immutable`
 *    vale porque o nome do arquivo carrega um UUID — trocar a imagem gera nome
 *    novo, então nenhuma versão velha fica presa em cache.
 */
export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: { path: string[] } }) {
  const relativo = (params.path ?? []).join("/");
  const absoluto = caminhoAbsolutoDaLp(relativo);
  if (!absoluto) {
    return new NextResponse("Caminho inválido.", { status: 400 });
  }

  try {
    const info = await stat(absoluto);
    if (!info.isFile()) {
      return new NextResponse("Não encontrado.", { status: 404 });
    }
    const dados = await readFile(absoluto);
    return new NextResponse(dados, {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(info.size),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Não encontrado.", { status: 404 });
  }
}
