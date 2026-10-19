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
import { apagarCandidatura } from "@/lib/wholesale-retention";
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
    select: { id: true, sellerId: true },
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

  const gravou = await prisma.$transaction(async (tx) => {
    // O fromStatus do diário tem de ser o status que REALMENTE precedeu esta
    // mudança. Lido fora da transação, ele pode já ter sido superado por uma
    // decisão concorrente (a vendedora dona e a Gestão têm acesso ao mesmo
    // cadastro), e o par fromStatus->toStatus é justamente o que a Gestão
    // analisa depois. Ler aqui dentro mantém o par verdadeiro. O isolamento
    // padrão é read-committed: isto estreita a janela à duração da própria
    // transação, não a elimina; o que fica garantido é que update e evento
    // concordam entre si e com uma única leitura. (Sem FOR UPDATE de
    // propósito: duas pessoas internas não justificam travas.)
    const atual = await tx.wholesaleLead.findUnique({
      where: { id: lead.id },
      select: { status: true },
    });
    // A linha sumiu entre a checagem de permissão e a transação: não grava nada.
    if (!atual) return false;
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
        fromStatus: atual.status,
        toStatus,
        rejectionCode: decisao.rejectionCode,
        note: limitText(asText(input.note), MAX_NOTE),
        actorId: actor.userId,
      },
    });
    return true;
  });
  // O ator já passou por canDecideLead para este lead: dizer "sem permissão"
  // seria falso. A verdade é que o registro sumiu, e não há o que esconder de
  // quem já está autorizado a vê-lo.
  if (!gravou) return actionError("Candidatura não encontrada.");

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
 * EXCLUSÃO DE UMA CANDIDATURA — só a GESTÃO, e não volta atrás.
 *
 * Por que só a Gestão: apagar remove as 18 respostas, as duas fotos e o
 * diário de decisões. A vendedora dona pode DECIDIR a candidatura dela; apagar
 * o registro de uma decisão é outra ordem de poder, e `canUseWholesaleTool`
 * sozinho não a separa — por isso o papel é conferido aqui, explicitamente, e
 * não só escondendo o botão na tela.
 *
 * É a mesma rotina do expurgo de 90 dias (`apagarCandidatura`): a foto sai
 * antes da linha, e o diário sai junto. Escrever a exclusão de novo aqui
 * criaria duas versões de uma regra de LGPD.
 *
 * SEM registro do que foi apagado. Um "diário da exclusão" guardando nome e
 * CNPJ de quem foi apagado desfaria o próprio apagamento — a candidata pediu
 * para sumir e sobraria uma linha dizendo quem ela era. Quem apagou fica no
 * log do servidor, não numa tabela de dado pessoal.
 */
export async function deleteLead(input: { leadId: string }): Promise<ActionResult<void>> {
  const actor = await atorAtual();
  if (!actor || !canUseWholesaleTool(actor) || actor.role !== "GESTAO") {
    return actionError(WHOLESALE_DENIED_MSG);
  }

  const leadId = asText(input?.leadId);
  if (!leadId) return actionError(WHOLESALE_DENIED_MSG);

  const lead = await prisma.wholesaleLead.findUnique({
    where: { id: leadId },
    select: { id: true, instagramImagePath: true, storeImagePath: true },
  });
  // Mesma resposta de "não existe": idempotente de propósito, dois cliques no
  // botão não produzem um erro assustador no segundo.
  if (!lead) return actionOk(undefined);

  try {
    await apagarCandidatura(lead);
  } catch {
    return actionError("Não foi possível excluir o cadastro. Tente de novo.");
  }

  revalidatePath("/vendas/analise-clientes");
  return actionOk(undefined);
}

/* `assignLeadSeller` (distribuicao manual da Gestao) saiu em 17/10/2026, a
 * pedido do dono: quem chega pelo link geral entra no rodizio e ganha dona
 * sozinha, passando adiante a cada dia sem avaliacao. Ver
 * src/lib/wholesale-rodizio.ts.
 *
 * As duas coisas nao podiam conviver: o rodizio desfaria no dia seguinte a
 * atribuicao que a Gestao tivesse acabado de fazer. */
