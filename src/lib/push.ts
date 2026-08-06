import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

/**
 * Camada de Web Push (notificações a nível de Sistema Operacional).
 *
 * Diferença para a Web Notification usada no board: aquela só dispara com uma
 * aba do app aberta e em foco. Esta usa o serviço de push do navegador +
 * Service Worker, então o alerta chega na Central de Ações do SO mesmo com o
 * navegador minimizado ou fechado (com o SW registrado).
 *
 * Requer um par de chaves VAPID nas variáveis de ambiente:
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY  (exposta ao client p/ subscribe)
 *   VAPID_PRIVATE_KEY             (secreta, só no servidor)
 *   VAPID_SUBJECT                 (mailto:... ou URL de contato) — opcional
 *
 * Gere o par uma vez com:  npx web-push generate-vapid-keys
 */

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@buildflowapp.com.br";

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  if (!PUBLIC_KEY || !PRIVATE_KEY) {
    // Sem chaves, o push fica desativado silenciosamente (o board e a Web
    // Notification em foco continuam funcionando). Logamos uma vez.
    console.warn("[push] VAPID keys ausentes — Web Push desativado.");
    return false;
  }
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
  configured = true;
  return true;
}

export function isPushConfigured(): boolean {
  return Boolean(PUBLIC_KEY && PRIVATE_KEY);
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
}

/**
 * Envia um push para TODOS os dispositivos inscritos de TODOS os usuários de um
 * determinado papel (ex.: todo o setor FINANCEIRO). Inscrições inválidas
 * (410/404) são removidas do banco automaticamente. Fire-and-forget seguro:
 * nunca lança — falhas são apenas logadas.
 */
export async function sendPushToRole(role: Role, payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return;

  let subs: { id: string; endpoint: string; p256dh: string; auth: string }[] = [];
  try {
    subs = await prisma.pushSubscription.findMany({
      where: { user: { role, active: true } },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
  } catch (err) {
    console.error("[push] falha ao carregar inscrições:", err);
    return;
  }
  await deliver(subs, payload);
}

/**
 * Envia um push para TODOS os dispositivos inscritos de UM usuário específico
 * (ex.: a vendedora responsável por um pedido). Mesmo tratamento de inscrições
 * inválidas e mesmo caráter fire-and-forget de sendPushToRole.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return;
  if (!userId) return;

  let subs: { id: string; endpoint: string; p256dh: string; auth: string }[] = [];
  try {
    subs = await prisma.pushSubscription.findMany({
      where: { userId, user: { active: true } },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
  } catch (err) {
    console.error("[push] falha ao carregar inscrições do usuário:", err);
    return;
  }
  await deliver(subs, payload);
}

/**
 * Dispara o payload para uma lista de inscrições e remove as expiradas
 * (404/410). Extraído para reuso entre envio por papel e por usuário.
 */
async function deliver(
  subs: { id: string; endpoint: string; p256dh: string; auth: string }[],
  payload: PushPayload,
): Promise<void> {
  if (subs.length === 0) return;

  const body = JSON.stringify(payload);
  const staleIds: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
      } catch (err: unknown) {
        const statusCode =
          typeof err === "object" && err !== null && "statusCode" in err
            ? (err as { statusCode?: number }).statusCode
            : undefined;
        // 404/410 = inscrição expirada/cancelada no navegador: descarta.
        if (statusCode === 404 || statusCode === 410) {
          staleIds.push(s.id);
        } else {
          console.error("[push] falha ao enviar:", statusCode ?? err);
        }
      }
    }),
  );

  if (staleIds.length) {
    try {
      await prisma.pushSubscription.deleteMany({ where: { id: { in: staleIds } } });
    } catch {
      /* limpeza best-effort */
    }
  }
}
