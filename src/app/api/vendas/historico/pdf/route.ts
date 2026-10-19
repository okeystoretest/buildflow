import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  PDF_MAX_PEDIDOS,
  buildHistoricoWhere,
  descreverFiltros,
  filtrosDeSearchParams,
} from "@/lib/historico-vendas-query";
import { gerarHistoricoPdf } from "@/lib/historico-vendas-pdf";

/**
 * GET /api/vendas/historico/pdf
 * ---------------------------------------------------------------------------
 * Exporta o Histórico de Vendas em PDF: vendedora, número do pedido e valor.
 * Recebe os MESMOS parâmetros de query da tela (comanda, de, ate), de modo que
 * o arquivo reproduz o recorte que a pessoa está vendo — sem paginação, e
 * limitado por PDF_MAX_PEDIDOS.
 *
 * Route Handler (e não Server Action) porque a resposta é um ARQUIVO BINÁRIO:
 * o navegador baixa direto, sem trafegar base64 pelo payload do React.
 *
 * O ESCOPO É DECIDIDO AQUI, a partir da sessão, nunca da query string. Quem é
 * de VENDAS exporta apenas os próprios pedidos: sem esta linha, bastaria
 * digitar a URL da rota para levar o histórico da equipe inteira num arquivo.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (
    session.role !== "VENDAS" &&
    session.role !== "GESTAO" &&
    session.role !== "FINANCEIRO"
  ) {
    return NextResponse.json({ error: "Sem permissão para este relatório." }, { status: 403 });
  }

  try {
    const filtros = filtrosDeSearchParams(req.nextUrl.searchParams);
    const amplo = session.role === "GESTAO" || session.role === "FINANCEIRO";
    const where = buildHistoricoWhere(filtros, { sellerId: amplo ? null : session.userId });

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        select: {
          orderNumber: true,
          total: true,
          seller: { select: { name: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: PDF_MAX_PEDIDOS,
      }),
      prisma.order.count({ where }),
    ]);

    const pdf = gerarHistoricoPdf(
      // Os mesmos fallbacks da tela: registro antigo pode ter vendedora ou
      // número ausentes, e isso não pode esconder a linha do relatório.
      orders.map((o) => ({
        sellerName: o.seller?.name ?? "—",
        orderNumber: o.orderNumber ?? "—",
        total: Number(o.total ?? 0),
      })),
      {
        filtros: descreverFiltros(filtros),
        geradoPor: session.name,
        escopo: amplo ? "todas as vendedoras" : session.name,
        totalFiltro: total,
        limiteAplicado: PDF_MAX_PEDIDOS,
      },
    );

    const hoje = new Date().toISOString().slice(0, 10);
    return new NextResponse(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.byteLength),
        "Content-Disposition": `attachment; filename="historico-vendas-${hoje}.pdf"`,
        // Relatório sempre atual: nada de cache no navegador ou no Nginx.
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err) {
    console.error("[vendas/historico/pdf] falha ao gerar o relatório:", err);
    return NextResponse.json(
      { error: "Não foi possível gerar o PDF. Tente novamente." },
      { status: 500 },
    );
  }
}
