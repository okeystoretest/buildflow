import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { getRelatorioSemanalDetail } from "@/lib/relatorio-semanal-data";
import { gerarRelatorioSemanalPdf, nomeDoArquivoPdf } from "@/lib/relatorio-semanal-pdf";

/**
 * GET /api/marketing/relatorio-semanal/pdf?semana=<id>
 * ---------------------------------------------------------------------------
 * Exporta UMA semana em PDF, com os mesmos seis blocos da tela.
 *
 * Route Handler (e não Server Action) porque a resposta é um ARQUIVO BINÁRIO:
 * o navegador baixa direto, sem trafegar base64 pelo payload do React.
 *
 * MESMA PORTA DA FERRAMENTA (`GESTAO`), decidida aqui a partir da SESSÃO e
 * nunca da query string. Sem esta linha bastaria digitar a URL para levar a
 * semana inteira num arquivo — e o relatório traz destaque, aprendizado,
 * bloqueios e decisões, que é o conteúdo mais sensível da ferramenta.
 *
 * Fechada ou aberta, tanto faz: isto é LEITURA. O fechamento da semana impede
 * reescrever, não impede ler — e é justamente a semana fechada que alguém
 * precisa mandar para quem não entra no sistema.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (session.role !== "GESTAO") {
    return NextResponse.json({ error: "Sem permissão para este relatório." }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("semana");
  if (!id) {
    return NextResponse.json({ error: "Informe a semana." }, { status: 400 });
  }

  try {
    const detalhe = await getRelatorioSemanalDetail(id);
    if (!detalhe) {
      return NextResponse.json({ error: "Relatório não encontrado." }, { status: 404 });
    }

    const pdf = gerarRelatorioSemanalPdf(detalhe, { geradoPor: session.name });

    return new NextResponse(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.byteLength),
        "Content-Disposition": `attachment; filename="${nomeDoArquivoPdf(detalhe)}"`,
        // Relatório sempre atual: nada de cache no navegador ou no Nginx.
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err) {
    console.error("[marketing/relatorio-semanal/pdf] falha ao gerar o relatório:", err);
    return NextResponse.json(
      { error: "Não foi possível gerar o PDF. Tente novamente." },
      { status: 500 },
    );
  }
}
