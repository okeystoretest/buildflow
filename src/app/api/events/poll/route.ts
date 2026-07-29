import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getEventsSince } from "@/lib/realtime/bus";

/**
 * Endpoint de POLLING do tempo real.
 *
 * O provider chama GET /api/events/poll?since=<ts> a cada poucos segundos. O
 * servidor le do Postgres os eventos ocorridos apos `since` e devolve, com o
 * `now` (proximo `since` do cliente). Requisicao curta — atravessa qualquer
 * proxy, sem conexao longa.
 *
 * `notify` por evento: true so quando o papel da sessao esta em notifyRoles
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
    events = rows.map((e) => ({
      type: e.type,
      orderId: e.orderId,
      orderNumber: e.orderNumber,
      customerName: e.customerName,
      status: e.status,
      notify: (e.notifyRoles ?? []).includes(role),
      ts: e.ts,
    }));
  } catch (err) {
    console.error("[realtime] falha ao ler eventos:", err);
    // Em caso de erro de leitura, responde vazio (o cliente tenta no proximo tick).
    events = [];
  }

  return NextResponse.json(
    { now, bootstrap: safeSince === 0, events },
    { headers: { "Cache-Control": "no-store" } },
  );
}
