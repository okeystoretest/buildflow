import { signWebhook } from "./signature";
import { integrationEnv } from "./connect-auth";
import type { ConnectTicketStatus } from "@/lib/transport/status";

/**
 * Aviso ao Build.Connect a cada mudanca de status do chamado.
 *
 * Melhor esforco: 3 tentativas (0s, 5s, 30s) e depois so o log. Nao ha fila
 * persistente de proposito — a rede de seguranca e o Connect reconciliar na
 * leitura (ele reconsulta chamados nao finais com espelho velho). O receptor
 * de la aplica ESTADO, nao transicao, entao repeticao e desordem sao inofensivas.
 */

export interface ConnectWebhookPayload {
  connectId: string;
  flowId: string;
  status: ConnectTicketStatus;
  driverName: string | null;
  assignedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  distanceKm: number | null;
  cancelReason: string | null;
}

const RETRY_DELAYS_MS = [0, 5_000, 30_000];
const TIMEOUT_MS = 8_000;

function espera(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tentar(url: string, secret: string, body: string): Promise<boolean> {
  const timestamp = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-flow-timestamp": String(timestamp),
        "x-flow-signature": signWebhook(secret, timestamp, body),
      },
      body,
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function sendConnectWebhook(payload: ConnectWebhookPayload): Promise<void> {
  const env = integrationEnv();
  if (!env) {
    console.error("[webhook] integracao nao configurada; aviso ao Connect nao enviado.");
    return;
  }
  const url = `${env.webhookUrl}/api/integracao/flow/webhook`;
  const body = JSON.stringify(payload);

  for (let i = 0; i < RETRY_DELAYS_MS.length; i += 1) {
    if (RETRY_DELAYS_MS[i]! > 0) await espera(RETRY_DELAYS_MS[i]!);
    if (await tentar(url, env.webhookSecret, body)) return;
    console.warn(`[webhook] tentativa ${i + 1} falhou para ${payload.connectId}`);
  }
  console.error(`[webhook] desistiu apos ${RETRY_DELAYS_MS.length} tentativas: ${payload.connectId}`);
}
