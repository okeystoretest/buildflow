import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import {
  PDF_MAX_PEDIDOS,
  carregarPendencias,
  descreverFiltros,
  filtrosDeSearchParams,
} from "@/lib/pendencias-query";
import { gerarPendenciasPdf } from "@/lib/pendencias-pdf";

/**
 * GET /api/logistica/pendencias/pdf
 * ---------------------------------------------------------------------------
 * Exporta o Relatório de Pendências em PDF. Recebe os MESMOS parâmetros de
 * query da tela (busca, situacao, de, ate), de modo que o arquivo reproduz
 * exatamente o recorte que o usuário está vendo — porém sem paginação: o PDF
 * traz todos os pedidos do filtro, limitado por PDF_MAX_PEDIDOS.
 *
 * Route Handler (e não Server Action) porque a resposta é um ARQUIVO BINÁRIO:
 * o navegador baixa direto, sem trafegar base64 pelo payload do React.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (session.role !== "LOGISTICA" && session.role !== "GESTAO") {
    return NextResponse.json({ error: "Sem permissão para este relatório." }, { status: 403 });
  }

  try {
    const filtros = filtrosDeSearchParams(req.nextUrl.searchParams);
    const { items, total } = await carregarPendencias(filtros, { take: PDF_MAX_PEDIDOS });

    const pdf = gerarPendenciasPdf(items, {
      filtros: descreverFiltros(filtros),
      geradoPor: session.name,
      totalFiltro: total,
      limiteAplicado: PDF_MAX_PEDIDOS,
    });

    const hoje = new Date().toISOString().slice(0, 10);
    return new NextResponse(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.byteLength),
        "Content-Disposition": `attachment; filename="relatorio-pendencias-${hoje}.pdf"`,
        // Relatório sempre atual: nada de cache no navegador ou no Nginx.
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err) {
    console.error("[pendencias/pdf] falha ao gerar o relatório:", err);
    return NextResponse.json(
      { error: "Não foi possível gerar o PDF. Tente novamente." },
      { status: 500 },
    );
  }
}
