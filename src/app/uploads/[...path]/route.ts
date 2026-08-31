import { NextResponse, type NextRequest } from "next/server";

/**
 * Rota LEGADA de /uploads — hoje apenas redireciona para /api/uploads.
 *
 * Antes servia o arquivo direto do disco SEM checar sessao: dependia so do
 * middleware, que valida o JWT por assinatura. Era o unico handler do app sem
 * autenticacao propria, e por isso a superficie concreta da confusao de token
 * do acompanhamento do cliente (ver src/lib/tracking-auth.ts) — bastava
 * reenviar o cookie do cliente como bf_session para baixar comprovante de
 * pagamento e nota fiscal.
 *
 * NAO da para simplesmente apagar a rota: `image.ts` gravou o `filePath` de
 * todos os registros antigos com a base publica "/uploads", e esses links
 * seguem no banco. O redirect preserva esses links e entrega o arquivo pela
 * /api/uploads, que ja exige sessao valida (com checagem de revogacao),
 * confina o caminho dentro de UPLOAD_DIR e so serve extensoes conhecidas.
 *
 * Redirecionar em vez de duplicar a logica: uma segunda copia da checagem de
 * acesso e uma copia que vai divergir.
 */
export const dynamic = "force-dynamic";

export function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  // Os segmentos chegam ja decodificados e voltam a compor uma URL, entao
  // precisam ser reencodados (nome de arquivo com espaco ou acento).
  const rel = (params.path ?? []).map(encodeURIComponent).join("/");
  // 307: preserva o metodo e nao e cacheado de forma permanente pelo navegador.
  return NextResponse.redirect(new URL(`/api/uploads/${rel}`, req.url), 307);
}
