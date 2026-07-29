import { getSession } from "@/lib/auth";
import { subscribe, type RealtimeEvent } from "@/lib/realtime/bus";

/**
 * Endpoint SSE (Server-Sent Events) do tempo real.
 *
 * - Runtime Node (nao Edge): o barramento em memoria e o Prisma vivem no mesmo
 *   processo Node das Server Actions. `force-dynamic` impede cache.
 * - Cada conexao autenticada assina o barramento e recebe TODOS os eventos de
 *   pedido; o campo `notify` diz ao cliente se deve emitir alerta ATIVO (Web
 *   Notification) para o papel dele. A reatividade (refresh) vale sempre.
 * - Heartbeat a cada 25s: mantem a conexao viva atras do Nginx/proxies.
 * - Header `X-Accel-Buffering: no`: ESSENCIAL. Sem isto o Nginx faz buffer do
 *   stream e os eventos chegam em lote (ou nunca). Ver config no README de deploy.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;

export async function GET(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session) {
    return new Response("Nao autenticado", { status: 401 });
  }
  const role = session.role;
  const encoder = new TextEncoder();

  let closed = false;
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        if (unsubscribe) unsubscribe();
        try {
          controller.close();
        } catch {
          /* ja fechado */
        }
      };

      // Evento inicial: confirma a abertura do canal.
      send(`event: ready\ndata: {"ok":true}\n\n`);

      unsubscribe = subscribe((evt: RealtimeEvent) => {
        const notify = (evt.notifyRoles ?? []).includes(role);
        const payload = JSON.stringify({
          type: evt.type,
          orderId: evt.orderId,
          orderNumber: evt.orderNumber,
          customerName: evt.customerName,
          status: evt.status,
          notify,
          ts: evt.ts,
        });
        send(`event: ${evt.type}\ndata: ${payload}\n\n`);
      });

      heartbeat = setInterval(() => send(`: ping\n\n`), HEARTBEAT_MS);

      // Fecha quando o cliente aborta a requisicao (fecha aba, navega, perde rede).
      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (unsubscribe) unsubscribe();
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
