"use server";

import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/auth";
import { actionOk, actionError, type ActionResult } from "@/types/action";
import { getConnectionSnapshot, disconnectAndReset } from "@/lib/whatsapp/connection";

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

export async function getWhatsappPanelState(): Promise<ActionResult<WhatsappPanelState>> {
  try {
    await requireRoleAction(["GESTAO"]);
    const snap = getConnectionSnapshot();
    const qrDataUrl = snap.qr ? await QRCode.toDataURL(snap.qr, { margin: 1, width: 280 }) : null;
    return actionOk({
      state: snap.state,
      qrDataUrl,
      connectedNumber: maskNumber(snap.connectedNumber),
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
