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
}

/** Mostra so os 4 ultimos digitos do numero conectado. */
function maskNumber(numero: string | null): string | null {
  if (!numero || numero.length < 4) return null;
  return `•••• ${numero.slice(-4)}`;
}

async function readEnabled(): Promise<boolean> {
  const cfg = await prisma.whatsappConfig.findUnique({ where: { id: "singleton" } });
  return cfg?.enabled ?? false;
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

    const lock = await prisma.whatsappLock.findUnique({ where: { id: "singleton" } });

    // Sem linha, ou com heartbeat vencido, o dono anterior morreu: o que estiver
    // gravado ali e passado. Reportar "CONECTADO" de um processo morto seria
    // pior do que reportar desconectado.
    const vivo = lock != null && !isLeaseExpired(lock.heartbeatAt, new Date());

    const qrDataUrl =
      vivo && lock?.qr ? await QRCode.toDataURL(lock.qr, { margin: 1, width: 280 }) : null;

    return actionOk({
      state: vivo ? (lock?.state ?? "DESCONECTADO") : "DESCONECTADO",
      qrDataUrl,
      connectedNumber: vivo ? maskNumber(lock?.connectedNumber ?? null) : null,
      enabled: await readEnabled(),
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
