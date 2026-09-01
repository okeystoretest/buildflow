"use server";

import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/auth";
import { checkLoginRate, checkRate, clearLoginRate } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import {
  createTrackingSession,
  destroyTrackingSession,
  newTrackingToken,
} from "@/lib/tracking-auth";
import { trackingPath } from "@/lib/customer-tracking";
import { actionOk, actionError, type ActionResult } from "@/types/action";

/**
 * Acompanhamento do pedido pelo cliente final.
 *
 * Duas portas bem separadas:
 *  - `getTrackingLink`: interna (Vendas/Gestão/Financeiro), devolve o caminho
 *    do link (e o Código de Cliente) para o vendedor copiar e mandar para a cliente.
 *  - `verifyTrackingCode`: PÚBLICA, sem sessão do sistema. É o único ponto em
 *    que um visitante anônimo consulta o banco — por isso o rate limit e as
 *    mensagens genéricas.
 */

/**
 * Caminho do link de acompanhamento do pedido (ex.: "/acompanhar/abc123").
 * A URL absoluta é montada no cliente com o `window.location.origin`, o que
 * evita depender de uma variável de ambiente com o domínio público.
 *
 * Gera o token sob demanda: pedidos criados antes deste recurso (ou por
 * qualquer rota de importação futura) ainda não têm um, e o vendedor não
 * deveria descobrir isso na hora de atender a cliente.
 */
export async function getTrackingLink(
  orderId: string,
): Promise<ActionResult<{ path: string; customerCode: string }>> {
  try {
    const session = await requireRoleAction(["VENDAS", "GESTAO", "FINANCEIRO"]);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        sellerId: true,
        trackingToken: true,
        // O Código de Cliente entra na mensagem pronta que a vendedora copia:
        // sem ele, a cliente recebe o link e trava na tela de verificação.
        customer: { select: { code: true } },
      },
    });
    if (!order) return actionError("Pedido não encontrado.");

    // Mesmo escopo da lista de Vendas: a vendedora só compartilha os próprios
    // pedidos; Gestão e Financeiro veem todos.
    if (session.role === "VENDAS" && order.sellerId !== session.userId) {
      return actionError("Sem permissão para este pedido.");
    }

    let token = order.trackingToken;
    if (!token) {
      token = newTrackingToken();
      await prisma.order.update({
        where: { id: order.id },
        data: { trackingToken: token },
      });
    }

    return actionOk({ path: trackingPath(token), customerCode: order.customer.code });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao gerar o link.";
    return actionError(msg);
  }
}

/**
 * Valida o Código de Cliente informado na tela pública e libera a consulta.
 *
 * O código só vale para o pedido daquele link: a comparação é sempre contra o
 * cliente DAQUELE pedido, nunca uma busca global por código.
 */
export async function verifyTrackingCode(
  token: string,
  code: string,
): Promise<ActionResult<void>> {
  // Freio de força bruta: o Código de Cliente é curto, então sem isto um link
  // vazado permitiria varrer o espaço de códigos. Janela por (IP + link).
  const ip = getClientIp();
  const gate = checkLoginRate(`track:${ip}:${token}`);
  if (!gate.allowed) {
    return actionError(
      `Muitas tentativas. Tente novamente em ${gate.retryAfterSec}s.`,
    );
  }

  // SEGUNDO balde, por LINK e independente do IP. O de cima sozinho não basta:
  // esta é a única barreira entre um link vazado e os dados da cliente, e um
  // atacante com vários IPs (ou botnet) varreria o espaço de códigos mesmo com
  // o limite por IP intacto. Teto mais alto porque o link é legitimamente
  // compartilhado — a cliente pode abrir de mais de um aparelho.
  const linkGate = checkRate(`track:link:${token}`, { max: 20 });
  if (!linkGate.allowed) {
    return actionError(
      `Muitas tentativas para este link. Tente novamente em ${linkGate.retryAfterSec}s.`,
    );
  }

  const informado = code.trim();
  if (!informado) return actionError("Informe o seu código de cliente.");

  const order = await prisma.order.findUnique({
    where: { trackingToken: token },
    select: { customer: { select: { code: true } } },
  });

  // Mensagem única para link inexistente e código errado: quem tem o link não
  // precisa saber qual dos dois falhou.
  const ok =
    !!order &&
    order.customer.code.trim().toLowerCase() === informado.toLowerCase();
  if (!ok) return actionError("Código de cliente inválido para este pedido.");

  clearLoginRate(`track:${ip}:${token}`);
  clearLoginRate(`track:link:${token}`);
  await createTrackingSession(token);
  return actionOk(undefined);
}

/** Encerra a consulta e devolve a tela de verificação. */
export async function leaveTracking(): Promise<ActionResult<void>> {
  destroyTrackingSession();
  return actionOk(undefined);
}
