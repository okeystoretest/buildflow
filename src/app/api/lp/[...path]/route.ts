import { NextResponse, type NextRequest } from "next/server";
import { readFile, realpath, stat } from "node:fs/promises";
import { caminhoAbsolutoDaLp, ehDentroDaPastaPublica } from "@/lib/lp-assets-server";

/**
 * Leitura PÚBLICA das imagens da landing page de atacado — e de nada mais.
 *
 * Por que existe uma segunda rota de arquivo: `/api/uploads` exige sessão de
 * propósito, porque serve comprovante de pagamento, nota fiscal e comprovante
 * de entrega. A lojista que abre a LP não tem sessão nenhuma, então as imagens
 * da página precisam de um caminho próprio — e esse caminho serve UMA pasta.
 *
 * A pasta é `lp-publico`, e NÃO `atacado`: o formulário público grava as duas
 * fotografias de cada candidata em `<UPLOAD_DIR>/atacado/<ano>/<mês>/`, com a
 * mesma extensão `.webp`. Enquanto os dois nomes eram o mesmo, esta rota servia
 * a foto da loja de uma não-cliente sem cookie nenhum. Namespace separado é o
 * que mantém a promessa do primeiro parágrafo verdadeira.
 *
 * Guardas, cada uma por um motivo diferente:
 * 1. `caminhoAbsolutoDaLp` exige que o caminho comece por "lp-publico/", termine em
 *    ".webp" e não tenha segmento "..", e depois CANONICALIZA e confirma que o
 *    resultado ficou dentro de <UPLOAD_DIR>/lp-publico. Texto primeiro, sistema
 *    de arquivos depois: a travessia é a falha que esta rota mais convida.
 * 1b. `realpath` + `ehDentroDaPastaPublica`: `path.resolve` canonicaliza texto, e
 *    `readFile` segue link simbólico. Defesa em profundidade.
 * 2. `Content-Type` fixo em image/webp mais `nosniff`: a extensão é a única
 *    permitida e é a única que `processAndSaveImage` escreve, então não há tipo
 *    a negociar — e sem o nosniff o navegador poderia interpretar o conteúdo.
 * 3. Cache PÚBLICO aqui, ao contrário de /api/uploads: estas imagens são
 *    deliberadamente públicas, e a lojista está em dados móveis. `immutable`
 *    vale porque o nome do arquivo carrega um UUID — trocar a imagem gera nome
 *    novo, então nenhuma versão velha fica presa em cache.
 */
export const runtime = "nodejs";

export async function GET(_req: NextRequest, props: { params: Promise<{ path: string[] }> }) {
  const params = await props.params;
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
    // TERCEIRA barreira, e a que o spec do editor realmente descreve ao dizer
    // "canonicalização, não comparação de texto": `path.resolve` canonicaliza
    // TEXTO, e `stat`/`readFile` SEGUEM link simbólico. Um link dentro da pasta
    // pública apontando para fora dela seria servido sem sessão. Nada no app cria
    // symlink, então isto é defesa em profundidade — e vale a chamada porque o
    // dia em que o volume de uploads deixar de ser só do app (backup restaurado,
    // bind mount de terceiro) é um dia em que ninguém revisa esta rota.
    const real = await realpath(absoluto);
    if (!ehDentroDaPastaPublica(real)) {
      return new NextResponse("Não encontrado.", { status: 404 });
    }
    const dados = await readFile(real);
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
