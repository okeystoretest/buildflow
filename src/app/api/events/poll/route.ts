import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getEventsSince } from "@/lib/realtime/bus";
import { BUILD_ID } from "@/lib/build-id";

/**
 * Endpoint de POLLING do tempo real.
 *
 * O provider chama GET /api/events/poll?since=<ts> a cada poucos segundos. O
 * servidor le do Postgres os eventos ocorridos apos `since` e devolve, com o
 * `now` (proximo `since` do cliente). Requisicao curta — atravessa qualquer
 * proxy, sem conexao longa.
 *
 * `notify` por evento: true so quando o papel da sessao esta em notifyRoles
 * (ex.: FINANCEIRO em pedido novo que entra em EM_ANALISE). Reatividade (refresh) vale sempre.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }
  const role = session.role;

  const url = new URL(req.url);
  const sinceRaw = url.searchParams.get("since");
  const since = sinceRaw ? Number(sinceRaw) : 0;
  const safeSince = Number.isFinite(since) && since > 0 ? since : 0;

  const now = Date.now();

  let events: Array<{
    type: string;
    orderId: string;
    orderNumber?: string;
    customerName?: string;
    status?: string;
    notify: boolean;
    ts: number;
  }> = [];

  try {
    const rows = await getEventsSince(safeSince);
    events = rows.map((e) => {
      const notify = (e.notifyRoles ?? []).includes(role);
      return {
        type: e.type,
        orderId: e.orderId,
        // NUMERO E NOME DO CLIENTE SO VAO QUANDO ESTE PAPEL VAI EXIBI-LOS.
        //
        // O cliente ja ignora os dois quando `notify` e falso (ver
        // realtime-provider: ele retorna antes de montar a mensagem), e
        // `notifyRoles` hoje e sempre ["FINANCEIRO"] ou vazio. Mandar a todo
        // papel era, portanto, vazar sem nenhum uso: um MOTORISTA — cuja
        // navegacao sao duas telas, as entregas dele e os chamados — recebia a
        // cada 4s o numero e o nome da cliente de cada pedido de cada loja.
        //
        // Omitir em vez de filtrar por lista de papeis: lista precisa ser
        // mantida a cada papel novo, e quem esquecer de atualizar reabre o
        // vazamento em silencio. Aqui a regra se amarra a quem EXIBE.
        ...(notify ? { orderNumber: e.orderNumber, customerName: e.customerName } : {}),
        status: e.status,
        notify,
        ts: e.ts,
      };
    });
  } catch (err) {
    console.error("[realtime] falha ao ler eventos:", err);
    // Em caso de erro de leitura, responde vazio (o cliente tenta no proximo tick).
    events = [];
  }

  // `rev`: qual build esta respondendo. O cliente guarda o primeiro que ve e
  // avisa quando mudar — e assim que ele descobre que foi publicada uma versao
  // nova enquanto estava com a tela aberta. Pega carona neste poll, que ja roda
  // a cada 4s em toda tela logada, em vez de uma rota nova so para isso.
  return NextResponse.json(
    { now, bootstrap: safeSince === 0, events, rev: BUILD_ID },
    { headers: { "Cache-Control": "no-store" } },
  );
}
