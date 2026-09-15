import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime/bus";
import { sendPushToRole, sendPushToUser } from "@/lib/push";
import { sendWhatsappToDrivers } from "@/lib/whatsapp";
import { sendConnectWebhook } from "@/lib/integration/webhook";
import { toConnectStatus } from "./status";

/**
 * Efeitos de uma mudanca no chamado: tempo real (quadro), aviso ativo
 * (push/WhatsApp) e webhook ao Connect. Fire-and-forget em tudo — aviso nunca
 * derruba a acao que o causou.
 */

export type TransportEventKind =
  | "criado"
  | "atribuido"
  | "assumido"
  | "desatribuido"
  | "em_rota"
  | "concluido"
  | "cancelado";

const MSG_CHAMADO_ATRIBUIDO =
  "Um chamado de transporte foi atribuído a você no Build.Flow. Abra o módulo Motorista para ver os detalhes.";
const MSG_CHAMADO_ABERTO =
  "Há um novo chamado de transporte em aberto no Build.Flow. Quem assumir primeiro leva.";

export function afterTransportChange(requestId: string, kind: TransportEventKind): void {
  void (async () => {
    const r = await prisma.transportRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        connectId: true,
        code: true,
        status: true,
        driverId: true,
        driver: { select: { name: true } },
        assignedAt: true,
        startedAt: true,
        finishedAt: true,
        distanceKm: true,
        cancelReason: true,
      },
    });
    if (!r) return;

    // 1) Quadro (todos que estao olhando) — e aviso em foco para o motorista
    //    afetado, via notifyRoles.
    publish({
      type: kind === "criado" ? "transport.created" : "transport.updated",
      orderId: r.id,
      orderNumber: r.code,
      status: r.status,
      notifyRoles: kind === "criado" && !r.driverId ? ["MOTORISTA"] : [],
    });

    // 2) Aviso ativo ao motorista.
    if (kind === "atribuido" && r.driverId) {
      void sendPushToUser(r.driverId, {
        title: "Chamado de transporte atribuído",
        body: `${r.code} foi atribuído a você.`,
        url: "/motorista/chamados",
        tag: `transport-${r.id}`,
      }).catch((err) => console.error("[push] chamado p/ motorista falhou:", err));
      void sendWhatsappToDrivers({ driverId: r.driverId, text: MSG_CHAMADO_ATRIBUIDO }).catch(
        (err) => console.error("[whatsapp] chamado p/ motorista falhou:", err),
      );
    } else if (kind === "criado" && !r.driverId) {
      void sendPushToRole("MOTORISTA", {
        title: "Chamado de transporte em aberto",
        body: `${r.code} aguardando motorista.`,
        url: "/motorista/chamados",
        tag: `transport-${r.id}`,
      }).catch((err) => console.error("[push] chamado aberto falhou:", err));
      void sendWhatsappToDrivers({ text: MSG_CHAMADO_ABERTO }).catch((err) =>
        console.error("[whatsapp] chamado aberto falhou:", err),
      );
    }

    // 3) Connect. "criado" nao avisa: quem criou foi o proprio Connect.
    if (kind !== "criado") {
      await sendConnectWebhook({
        connectId: r.connectId,
        flowId: r.id,
        status: toConnectStatus(r.status),
        driverName: r.driver?.name ?? null,
        assignedAt: r.assignedAt?.toISOString() ?? null,
        startedAt: r.startedAt?.toISOString() ?? null,
        finishedAt: r.finishedAt?.toISOString() ?? null,
        distanceKm: r.distanceKm,
        cancelReason: r.cancelReason,
      });
    }
  })().catch((err) => console.error("[transporte] pos-mudanca falhou:", err));
}
