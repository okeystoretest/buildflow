"use server";

import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/auth";
import { actionOk, actionError, type ActionResult } from "@/types/action";
import { disconnectAndReset } from "@/lib/whatsapp/connection";
import { isLeaseExpired } from "@/lib/whatsapp/pure";

export interface WhatsappPanelState {
  state: string;
  /** QR ja renderizado como data URL. O codigo cru nunca sai daqui. */
  qrDataUrl: string | null;
  /** Numero conectado, mascarado para exibicao. */
  connectedNumber: string | null;
  enabled: boolean;
  /** Diagnostico do boot — ver o bloco "Diagnóstico" do painel. */
  diag: {
    bootAt: string | null;
    stage: string | null;
    lastError: string | null;
    /** Ha linha de concessao e ela esta viva? */
    leaseAlive: boolean;
    /** Ha quantos segundos foi o ultimo heartbeat. */
    leaseAgeSec: number | null;
  };
}

/** Mostra so os 4 ultimos digitos do numero conectado. */
function maskNumber(numero: string | null): string | null {
  if (!numero || numero.length < 4) return null;
  return `•••• ${numero.slice(-4)}`;
}



/**
 * Estado do canal para o painel.
 *
 * Le do BANCO, e nao da memoria deste processo. O Next compila o modulo da
 * conexao em bundles distintos (instrumentacao x Server Action), e com mais de
 * uma replica o painel pode nem ser servido pelo processo que detem a conexao —
 * nos dois casos a memoria local responderia "DESCONECTADO" para sempre. Foi
 * essa a causa do "QR nao aparece".
 */
export async function getWhatsappPanelState(): Promise<ActionResult<WhatsappPanelState>> {
  try {
    await requireRoleAction(["GESTAO"]);

    const [lock, cfg] = await Promise.all([
      prisma.whatsappLock.findUnique({ where: { id: "singleton" } }),
      prisma.whatsappConfig.findUnique({ where: { id: "singleton" } }),
    ]);

    // Sem linha, ou com heartbeat vencido, o dono anterior morreu: o que estiver
    // gravado ali e passado. Reportar "CONECTADO" de um processo morto seria
    // pior do que reportar desconectado.
    const vivo = lock != null && !isLeaseExpired(lock.heartbeatAt, new Date());

    const qrDataUrl =
      vivo && lock?.qr ? await QRCode.toDataURL(lock.qr, { margin: 1, width: 280 }) : null;

    // Enquanto este processo espera a concessao anterior expirar, o `state`
    // gravado no lock e o do dono ANTERIOR (tipicamente "CONECTANDO", deixado
    // pelo container que morreu no deploy). Mostrar isso enganava: parecia que
    // algo estava progredindo. A etapa corrente e a fonte de verdade aqui.
    const esperandoConcessao = cfg?.stage === "sem-lideranca";

    return actionOk({
      state: esperandoConcessao
        ? "AGUARDANDO_CONCESSAO"
        : vivo
          ? (lock?.state ?? "DESCONECTADO")
          : "DESCONECTADO",
      qrDataUrl,
      connectedNumber: vivo ? maskNumber(lock?.connectedNumber ?? null) : null,
      enabled: cfg?.enabled ?? false,
      diag: {
        bootAt: cfg?.bootAt?.toISOString() ?? null,
        stage: cfg?.stage ?? null,
        lastError: cfg?.lastError ?? null,
        leaseAlive: vivo,
        leaseAgeSec: lock
          ? Math.round((Date.now() - lock.heartbeatAt.getTime()) / 1000)
          : null,
      },
    });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao ler status do WhatsApp.");
  }
}

/** Interruptor de envio. Permite desligar sem deploy. */
export async function setWhatsappEnabled(enabled: boolean): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["GESTAO"]);
    await prisma.whatsappConfig.upsert({
      where: { id: "singleton" },
      update: { enabled },
      create: { id: "singleton", enabled },
    });
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao alterar o envio.");
  }
}

export interface WhatsappLogRow {
  id: string;
  createdAt: string;
  status: "ENVIADO" | "FALHOU" | "IGNORADO";
  /** Nome do motorista, resolvido a partir do userId gravado no log. */
  driverName: string;
  /** 4 ultimos digitos. O numero completo NUNCA sai do servidor. */
  phoneSuffix: string | null;
  orderNumber: string | null;
  error: string | null;
}

/** Quantas linhas o painel mostra por vez. */
const LOG_PAGE_SIZE = 50;

/**
 * Historico de envios, mais recentes primeiro.
 *
 * WhatsappSendLog nao tem relacao Prisma com User nem Order de proposito (para
 * nao impedir exclusoes), entao nome do motorista e numero do pedido sao
 * resolvidos aqui, em duas consultas por lote. Registro cujo usuario ou pedido
 * ja foi excluido continua aparecendo, com um rotulo generico — o historico
 * nao pode sumir junto com o cadastro.
 */
export async function getWhatsappLogs(): Promise<ActionResult<WhatsappLogRow[]>> {
  try {
    await requireRoleAction(["GESTAO"]);

    const logs = await prisma.whatsappSendLog.findMany({
      orderBy: { createdAt: "desc" },
      take: LOG_PAGE_SIZE,
    });
    if (logs.length === 0) return actionOk([]);

    const userIds = [...new Set(logs.map((l) => l.userId))];
    const orderIds = [...new Set(logs.map((l) => l.orderId).filter((v): v is string => v != null))];

    const [users, orders] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
      orderIds.length
        ? prisma.order.findMany({
            where: { id: { in: orderIds } },
            select: { id: true, orderNumber: true },
          })
        : Promise.resolve([]),
    ]);

    const nomePorId = new Map(users.map((u) => [u.id, u.name]));
    const pedidoPorId = new Map(orders.map((o) => [o.id, o.orderNumber]));

    return actionOk(
      logs.map((l) => ({
        id: l.id,
        createdAt: l.createdAt.toISOString(),
        status: l.status,
        driverName: nomePorId.get(l.userId) ?? "Usuário removido",
        phoneSuffix: l.phoneSuffix,
        orderNumber: l.orderId ? pedidoPorId.get(l.orderId) ?? "—" : null,
        error: l.error,
      })),
    );
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao ler o histórico de envios.");
  }
}

/** Desconecta e apaga a sessao, forcando novo pareamento por QR. */
export async function resetWhatsappSession(): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["GESTAO"]);
    await disconnectAndReset();
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao reiniciar a sessão.");
  }
}
