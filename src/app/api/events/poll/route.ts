import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getEventsSince } from "@/lib/realtime/bus";

/**
 * Endpoint de POLLING do tempo real.
 *
 * O provider chama GET /api/events/poll?since=<ts> a cada poucos segundos. O
 * servidor devolve os eventos ocorridos apos `since`, mais o `now` (para o
 * client usar como proximo `since`). Requisicao curta — atravessa qualquer proxy
 * sem depender de conexao longa (o motivo de termos deixado o SSE).
 *
 * `notify` por evento: so vem true quando o papel da sessao esta em notifyRoles
 * (ex.: FINANCEIRO em pedido novo nao-Troca). Reatividade (refresh) vale sempre.
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
  const events = getEventsSince(safeSince).map((e) => ({
    type: e.type,
    orderId: e.orderId,
    orderNumber: e.orderNumber,
    customerName: e.customerName,
    status: e.status,
    notify: (e.notifyRoles ?? []).includes(role),
    ts: e.ts,
  }));

  // `bootstrap` = primeira consulta do client (since=0): ele deve apenas
  // sincronizar o relogio (guardar `now`) e NAO reagir aos eventos antigos do
  // buffer, para nao disparar refresh/notificacao de coisas ja vistas.
  return NextResponse.json(
    { now, bootstrap: safeSince === 0, events },
    { headers: { "Cache-Control": "no-store" } },
  );
}
