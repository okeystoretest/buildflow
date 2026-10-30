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
  resolvePurchase,
  WHOLESALE_DENIED_MSG,
  type PurchaseState,
  type WholesaleActor,
} from "@/lib/wholesale-permissions";
import { apagarCandidatura } from "@/lib/wholesale-retention";
import { cadastrarClienteDaCandidatura } from "@/lib/wholesale-customer";
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
  const entrada = {
    toStatus: toStatusRaw,
    rejectionCode: asText(input.rejectionCode),
    cautionReason: asText(input.cautionReason),
  };
  // UMA passada, e aqui fora.
  //
  // Havia uma segunda conferência dentro da transação enquanto COMPROU era
  // status: ele era a única transição com ORIGEM restrita (só de APROVADO), e
  // essa regra tinha de ver o status que a escrita ia sobrescrever, não o lido
  // antes. Com a compra em eixo próprio (30/10/2026) nenhuma regra de
  // `resolveDecision` depende mais do status atual — ela é função apenas da
  // entrada —, então reconferir dentro da transação devolveria exatamente este
  // resultado. A leitura de `atual` CONTINUA lá dentro, porque dela saem o
  // `fromStatus` do diário e o `customerId`.
  const decisao = resolveDecision(entrada);
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
      // `customerId` e os campos da candidata entram porque aprovar CADASTRA a
      // lojista (28/10/2026), e o cadastro sai destas respostas.
      select: {
        status: true,
        customerId: true,
        contactName: true,
        city: true,
        state: true,
        phone: true,
        email: true,
        cnpj: true,
      },
    });
    // A linha sumiu entre a checagem de permissão e a transação: não grava nada.
    if (!atual) return false;

    // O CADASTRO DA LOJISTA, quando ela passa a ser cliente.
    //
    // Só em APROVADO: com a compra fora do eixo do status, aprovar é o único
    // momento em que a candidatura passa a ser cliente. `customerId` já
    // preenchido não é tocado — o cadastro é criado uma vez.
    const customerId =
      toStatus === "APROVADO" && !atual.customerId
        ? await cadastrarClienteDaCandidatura(tx, atual)
        : null;

    await tx.wholesaleLead.update({
      where: { id: lead.id },
      data: {
        status: toStatus,
        rejectionCode: decisao.rejectionCode,
        cautionReason: decisao.cautionReason
          ? limitText(decisao.cautionReason, MAX_CAUTION)
          : null,
        // Só escreve quando há cadastro novo: `undefined` em Prisma não altera
        // a coluna, e `null` APAGARIA o vínculo de quem já o tem.
        ...(customerId ? { customerId } : {}),
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
 * O EIXO DE COMPRA de uma candidatura aprovada: Cadência, Comprou, Não Comprou.
 *
 * Mesma ordem de `decideLead`, pelo mesmo motivo de segurança: permissão
 * primeiro, invariante depois. Invertida, "Só uma candidatura aprovada tem
 * estado de compra." contaria a quem não pode ver o lead que ele existe e que
 * não foi aprovado.
 *
 * GRAVA EVENTO, e por isso update e insert vivem na MESMA transação: isto é uma
 * decisão comercial sobre uma lojista real, e o diário é o que a torna
 * auditável em vez de silenciosa. É também o que permite distinguir depois a
 * compra que a reconciliação encontrou (sem ator) da que alguém marcou à mão.
 *
 * Diferente de `decideLead` em um ponto: aqui a conferência de invariante VALE
 * dentro da transação, porque `resolvePurchase` depende do `status` — e entre a
 * leitura de fora e a escrita a candidatura pode ter sido reprovada por outra
 * pessoa (a vendedora dona e a Gestão têm o mesmo acesso). Sem ela, "Comprou"
 * entraria numa reprovada.
 */
export async function setLeadPurchase(input: {
  leadId: string;
  purchaseState: string;
}): Promise<ActionResult<{ purchaseState: PurchaseState }>> {
  const actor = await atorAtual();
  if (!actor || !canUseWholesaleTool(actor)) return actionError(WHOLESALE_DENIED_MSG);

  const leadId = asText(input.leadId);
  if (!leadId) return actionError(WHOLESALE_DENIED_MSG);

  const lead = await prisma.wholesaleLead.findUnique({
    where: { id: leadId },
    select: { id: true, sellerId: true, status: true },
  });
  if (!lead || !canDecideLead(actor, lead)) return actionError(WHOLESALE_DENIED_MSG);

  // Não-textual chega como "" e cai em "Estado de compra inválido.", nunca numa
  // exceção. Mesmo limite de confiança de `decideLead`.
  const pedido = asText(input.purchaseState) ?? "";
  const previa = resolvePurchase({ purchaseState: pedido, status: lead.status });
  if ("error" in previa) return actionError(previa.error);

  const gravou = await prisma.$transaction(async (tx) => {
    const atual = await tx.wholesaleLead.findUnique({
      where: { id: lead.id },
      select: { status: true, purchaseState: true },
    });
    // A linha sumiu entre a checagem de permissão e a transação.
    if (!atual) return false;

    // A conferência que VALE, com o status que a escrita vai usar.
    const decidido = resolvePurchase({ purchaseState: pedido, status: atual.status });
    if ("error" in decidido) return decidido.error;

    // ESTADO IGUAL NÃO GRAVA NADA. Mesmo motivo do `decisaoMudou` no modal:
    // chamar isto sem mudança encheria o diário de linhas
    // "CADENCIA -> CADENCIA", e um diário cheio de não-eventos é um diário que
    // ninguém consegue ler.
    if (atual.purchaseState === decidido.purchaseState) return true;

    await tx.wholesaleLead.update({
      where: { id: lead.id },
      data: { purchaseState: decidido.purchaseState },
    });
    await tx.wholesaleLeadEvent.create({
      data: {
        leadId: lead.id,
        // Evento de COMPRA: o par de status fica nulo, como o CHECK
        // `evento_e_status_ou_compra` exige.
        fromPurchase: atual.purchaseState,
        toPurchase: decidido.purchaseState,
        actorId: actor.userId,
      },
    });
    return true;
  });
  if (typeof gravou === "string") return actionError(gravou);
  if (!gravou) return actionError("Candidatura não encontrada.");

  revalidatePath("/vendas/analise-clientes");
  return actionOk({ purchaseState: previa.purchaseState });
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
