import { NextResponse } from "next/server";
import { autorizadoPorSegredoDeCron } from "@/lib/cron-auth";
import { expurgarCandidaturasVencidas, RETENCAO_DIAS } from "@/lib/wholesale-retention";

/**
 * EXPURGO DIÁRIO DAS CANDIDATURAS DE ATACADO (LGPD Art. 16).
 *
 * Mesma forma da rotina do Select: o projeto não tem agendador próprio (sem
 * cron, sem vercel.json; o deploy é Docker), então a rota existe para ser
 * chamada uma vez por dia de fora:
 *
 *   curl -X POST https://<host>/api/cron/leads \
 *        -H "Authorization: Bearer $SELECT_CRON_SECRET"
 *
 * Rota separada da do Select de propósito: são duas rotinas com donos
 * diferentes (uma é cobrança, a outra é privacidade) e falhas que não se
 * contaminam — o expurgo não deve deixar de rodar porque uma notificação do
 * Financeiro quebrou, nem o contrário.
 *
 * Idempotente: o WHERE é por data, então rodar duas vezes no mesmo dia apaga o
 * mesmo conjunto (vazio na segunda). Perder um dia não acumula dívida: o dia
 * seguinte pega tudo que venceu.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!autorizadoPorSegredoDeCron(req)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { apagados, arquivosApagados } = await expurgarCandidaturasVencidas();

  return NextResponse.json({
    ok: true,
    retencaoDias: RETENCAO_DIAS,
    candidaturasApagadas: apagados,
    arquivosApagados,
  });
}
