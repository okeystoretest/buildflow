import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { atorDeUsuario } from "@/lib/wholesale-actor";
import { descreverRecorte, resumoDoAtacado } from "@/lib/wholesale-dashboard";
import { gerarAnaliseClientesPdf } from "@/lib/analise-clientes-pdf";

/**
 * GET /api/vendas/analise-clientes/pdf
 * ---------------------------------------------------------------------------
 * O relatório gerencial da Análise de Clientes em PDF.
 *
 * RECEBE OS MESMOS PARÂMETROS DE QUERY DA TELA (de, ate, vendedora, brand,
 * estado, cidade) e chama o MESMO `resumoDoAtacado` que o painel chama. É o que
 * garante que o arquivo traga os números que a pessoa está vendo: um relatório
 * com consultas próprias discordaria da tela em alguma conta, e descobrir qual
 * das duas está certa custa mais que o relatório.
 *
 * STATUS, BUSCA, MOTIVO e COMPRA não entram, pela mesma razão que não entram no
 * painel: a taxa de aprovação de um recorte "só aprovadas" é sempre 100%.
 *
 * Route Handler (e não Server Action) porque a resposta é um ARQUIVO BINÁRIO: o
 * navegador baixa direto, sem trafegar base64 pelo payload do React.
 *
 * O ESCOPO É DECIDIDO AQUI, a partir da sessão, nunca da query string.
 * `atorDeUsuario` relê papel e `salesModel` do banco — o cookie não é fonte de
 * verdade para autorização — e `resumoDoAtacado` monta o `where` do escopo
 * dentro dele. Sem isso, bastaria digitar a URL da rota para levar o painel da
 * equipe inteira num arquivo.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const actor = await atorDeUsuario(session.userId);
  if (!actor) {
    return NextResponse.json(
      { error: "Sem permissão para este relatório." },
      { status: 403 },
    );
  }

  try {
    const q = req.nextUrl.searchParams;
    const ehGestao = actor.role === "GESTAO";
    // `vendedora` só vale para a Gestão — é a mesma regra de `resumoDoAtacado`,
    // repetida aqui só para resolver o NOME que vai na capa. O recorte de
    // verdade continua sendo decidido lá dentro.
    const vendedora = ehGestao ? (q.get("vendedora")?.trim() || "") : "";
    const filtros = {
      de: q.get("de")?.trim() || "",
      ate: q.get("ate")?.trim() || "",
      vendedora,
      marca: q.get("brand")?.trim() || "",
      estado: q.get("estado")?.trim() || "",
      cidade: q.get("cidade")?.trim() || "",
    };

    const [resumo, escolhida] = await Promise.all([
      resumoDoAtacado(actor, filtros),
      vendedora
        ? prisma.user.findUnique({ where: { id: vendedora }, select: { name: true } })
        : null,
    ]);

    const nomeVendedora = escolhida?.name ?? null;
    const pdf = gerarAnaliseClientesPdf(resumo, {
      filtros: descreverRecorte(filtros, nomeVendedora),
      geradoPor: session.name,
      escopo: nomeVendedora ?? (ehGestao ? "todas as vendedoras" : session.name),
    });

    const hoje = new Date().toISOString().slice(0, 10);
    return new NextResponse(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.byteLength),
        "Content-Disposition": `attachment; filename="analise-clientes-${hoje}.pdf"`,
        // Relatório sempre atual: nada de cache no navegador ou no Nginx.
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err) {
    console.error("[vendas/analise-clientes/pdf] falha ao gerar o relatório:", err);
    return NextResponse.json(
      { error: "Não foi possível gerar o PDF. Tente novamente." },
      { status: 500 },
    );
  }
}
