"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/auth";
import { actionOk, actionError, type ActionResult } from "@/types/action";
import { limitText } from "@/lib/utils";
import {
  canDecideLead,
  canUseWholesaleTool,
  resolveDecision,
  WHOLESALE_DENIED_MSG,
  type WholesaleActor,
} from "@/lib/wholesale-permissions";
import type { WholesaleLeadStatus } from "@prisma/client";

/**
 * Decisão sobre uma candidatura de atacado.
 *
 * A ORDEM aqui é parte da segurança: permissão primeiro, invariante depois.
 * Invertida, "Escolha o motivo da reprovação." contaria a quem não pode ver o
 * lead que ele existe e em que estado está.
 *
 * Mudar um veredito já dado é PERMITIDO (decisão 33) e sempre grava evento: a
 * Gestão precisa poder corrigir triagem errada, e o diário é o que torna a
 * correção auditável em vez de silenciosa. Por isso o update e o insert do
 * evento vivem na MESMA transação — sem evento, sem mudança.
 *
 * ESTE É O LIMITE DE CONFIANÇA. Os argumentos são tipados em TypeScript, mas
 * isso só vale para quem compila: em tempo de execução chega o que o navegador
 * mandou, e um cliente pode enviar `rejectionCode: 11` ou um objeto. Um
 * `TypeError` vindo de `.trim()` num número viraria um 500 opaco no lugar da
 * mensagem precisa em pt-BR; por isso todo valor textual passa por `asText`
 * antes de tocar qualquer regra, e nada daqui para dentro supõe o tipo.
 */

const MAX_CAUTION = 500;
const MAX_NOTE = 500;
const MAX_ASSISTANT = 120;

/**
 * Só texto atravessa o limite de confiança. Qualquer outra coisa (número,
 * objeto, array, undefined) vira `null`, que as regras puras já tratam como
 * "campo ausente" e respondem com a mensagem de validação correspondente.
 */
const asText = (v: unknown): string | null => (typeof v === "string" ? v : null);

/**
 * Ator vindo da sessão, relido do banco: papel e escopo de venda podem ter
 * mudado desde que o cookie foi emitido, e o cookie não é fonte de verdade
 * para autorização.
 *
 * Devolve `null` (e não lança) quando o usuário da sessão não existe mais ou
 * foi desativado: um `throw` numa Server Action vira um 500 genérico no
 * navegador, e este é um caso de negação como qualquer outro — as três actions
 * respondem com `WHOLESALE_DENIED_MSG`.
 *
 * `requireRoleAction` é chamado SEM lista de perfis de propósito: com lista,
 * um FINANCEIRO receberia um `throw` ("Sem permissao") em vez da mensagem de
 * negação; quem decide o perfil é `canUseWholesaleTool`, que já exclui os
 * perfis fora da ferramenta (decisão 17). A falta de sessão continua lançando,
 * como em toda action da casa — o middleware já barra isso antes.
 */
async function atorAtual(): Promise<WholesaleActor | null> {
  const session = await requireRoleAction();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, salesModel: true, active: true },
  });
  if (!user || !user.active) return null;
  return { userId: user.id, role: user.role, salesModel: user.salesModel };
}

export async function decideLead(input: {
  leadId: string;
  toStatus: string;
  rejectionCode?: string | null;
  cautionReason?: string | null;
  note?: string | null;
}): Promise<ActionResult<{ status: string }>> {
  const actor = await atorAtual();
  if (!actor || !canUseWholesaleTool(actor)) return actionError(WHOLESALE_DENIED_MSG);

  // `leadId` que não é texto recebe a mesma resposta de "lead inexistente".
  const leadId = asText(input.leadId);
  if (!leadId) return actionError(WHOLESALE_DENIED_MSG);

  const lead = await prisma.wholesaleLead.findUnique({
    where: { id: leadId },
    select: { id: true, sellerId: true, status: true },
  });
  // Mesma resposta para "não existe" e "não é seu": a existência do cadastro
  // de um negócio real não é informação pública dentro do sistema.
  if (!lead || !canDecideLead(actor, lead)) return actionError(WHOLESALE_DENIED_MSG);

  // `toStatus` não-textual chega como "" e cai em "Status inválido.", nunca
  // numa exceção.
  const toStatusRaw = asText(input.toStatus) ?? "";
  const decisao = resolveDecision({
    toStatus: toStatusRaw,
    rejectionCode: asText(input.rejectionCode),
    cautionReason: asText(input.cautionReason),
  });
  if ("error" in decisao) return actionError(decisao.error);

  // Só chega aqui um status que `resolveDecision` reconheceu.
  const toStatus = toStatusRaw as WholesaleLeadStatus;

  await prisma.$transaction(async (tx) => {
    await tx.wholesaleLead.update({
      where: { id: lead.id },
      data: {
        status: toStatus,
        rejectionCode: decisao.rejectionCode,
        cautionReason: decisao.cautionReason
          ? limitText(decisao.cautionReason, MAX_CAUTION)
          : null,
        decidedById: actor.userId,
        decidedAt: new Date(),
      },
    });
    await tx.wholesaleLeadEvent.create({
      data: {
        leadId: lead.id,
        fromStatus: lead.status,
        toStatus,
        rejectionCode: decisao.rejectionCode,
        note: limitText(asText(input.note), MAX_NOTE),
        actorId: actor.userId,
      },
    });
  });

  revalidatePath("/vendas/analise-clientes");
  return actionOk({ status: toStatus });
}

/**
 * "Auxiliar Responsável": texto livre (decisão 19), editável em qualquer
 * status e nunca obrigatória (decisão 34). Gravada em maiúsculas porque a
 * planilha pede exibição em maiúsculas — normalizar na gravação evita que a
 * mesma pessoa apareça em duas caixas diferentes na lista.
 */
export async function setAssistantName(input: {
  leadId: string;
  assistantName: string;
}): Promise<ActionResult<{ assistantName: string }>> {
  const actor = await atorAtual();
  if (!actor || !canUseWholesaleTool(actor)) return actionError(WHOLESALE_DENIED_MSG);

  const leadId = asText(input.leadId);
  if (!leadId) return actionError(WHOLESALE_DENIED_MSG);

  const lead = await prisma.wholesaleLead.findUnique({
    where: { id: leadId },
    select: { id: true, sellerId: true },
  });
  if (!lead || !canDecideLead(actor, lead)) return actionError(WHOLESALE_DENIED_MSG);

  // `limitText` devolve `string | null`; "" (vazio ou não-texto) limpa o campo.
  const nome =
    limitText(asText(input.assistantName)?.trim().toUpperCase(), MAX_ASSISTANT) ?? "";
  await prisma.wholesaleLead.update({
    where: { id: lead.id },
    data: { assistantName: nome || null },
  });

  revalidatePath("/vendas/analise-clientes");
  return actionOk({ assistantName: nome });
}

/**
 * Distribuição dos leads sem dono. Só GESTAO: é a fila dela (decisão 14), e o
 * destino tem de ser uma vendedora de atacado ativa — relida do banco, nunca
 * aceita como o navegador mandou.
 */
export async function assignLeadSeller(input: {
  leadId: string;
  sellerId: string;
}): Promise<ActionResult<void>> {
  const actor = await atorAtual();
  if (!actor || actor.role !== "GESTAO") return actionError(WHOLESALE_DENIED_MSG);

  const leadId = asText(input.leadId);
  if (!leadId) return actionError(WHOLESALE_DENIED_MSG);

  const msgDestino = "Escolha uma vendedora de atacado ativa.";
  const sellerId = asText(input.sellerId);
  if (!sellerId) return actionError(msgDestino);

  const destino = await prisma.user.findUnique({
    where: { id: sellerId },
    select: { id: true, role: true, salesModel: true, active: true },
  });
  if (!destino || !destino.active || destino.role !== "VENDAS" || destino.salesModel !== "ATACADO") {
    return actionError(msgDestino);
  }

  // `update` num id inexistente lança P2025 (500 opaco). Gestão pode ver todo
  // lead, então aqui "não existe" é só uma mensagem honesta.
  const lead = await prisma.wholesaleLead.findUnique({
    where: { id: leadId },
    select: { id: true },
  });
  if (!lead) return actionError("Candidatura não encontrada.");

  await prisma.wholesaleLead.update({
    where: { id: lead.id },
    data: { sellerId: destino.id },
  });

  revalidatePath("/vendas/analise-clientes");
  return actionOk(undefined);
}
