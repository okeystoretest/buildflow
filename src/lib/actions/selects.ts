"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/auth";
import { actionOk, actionError, type ActionResult } from "@/types/action";
import { limitText } from "@/lib/utils";
import {
  parseDayUTC,
  dayUTC,
  contractEndDate,
  buildInstallmentPlan,
  classifyAdesao,
  formatDayBR,
  effectiveEnd,
  money,
  monthlyWithBuildSales,
  BUILD_SALES_MONTHLY,
  resolveResponsibleId,
  parseMoney,
  type ExistingContract,
} from "@/lib/select-contract";

/**
 * SELECT — adesão de uma cliente a um plano de serviço.
 *
 * Quem cria: VENDAS, GESTÃO e FINANCEIRO. Quem CONFIRMA TROCA ou CANCELA: só
 * GESTÃO e FINANCEIRO, verificado aqui no servidor — esconder o botão na tela
 * não é controle de acesso.
 *
 * Nenhum valor enviado pelo navegador é gravado como veio: mensalidade, mínimo
 * e validade são relidos de SelectPlan (ou validados, no plano negociado), e o
 * fim e as parcelas são recalculados. O que o formulário manda serve para o
 * usuário ver, não para o banco acreditar.
 *
 * A CLIENTE tem de existir. A adesão não cria mais cadastro: a cliente é
 * escolhida numa busca e, se não houver, nasce antes — pelo modal da própria
 * busca, com endereço e contato, e não como o par código+nome que a gravação
 * improvisava.
 *
 * O RESPONSÁVEL é a única exceção a "sai da sessão", e por isso é o campo mais
 * desconfiado de todos: Gestão e Financeiro escolhem um vendedor, então um id
 * de usuário chega pelo navegador. Quem é de Vendas não escolhe — fica como
 * responsável de si mesmo, e um id enviado no payload é ignorado. A regra
 * inteira vive em `resolveResponsibleId` (puro, coberto por checagem); aqui só
 * se carrega a linha do banco e se obedece ao veredito.
 */

const PERFIS_CRIACAO = ["VENDAS", "GESTAO", "FINANCEIRO"] as const;
const PERFIS_PRIVILEGIADOS = ["GESTAO", "FINANCEIRO"] as const;

// Tetos dos campos de texto. `code` e campo de IDENTIDADE da cliente e por
// isso o excesso e RECUSADO, nao cortado: truncar um codigo poderia
// transforma-lo no codigo exato de outra cliente. O motivo do cancelamento e
// texto livre e aceita corte.
const MAX_CODE = 40;
const MAX_TEXTO = 500;

// Mensagem unica da recusa por cliente desconhecida. A adesao se liga a
// cadastro que JA EXISTE: a cliente nova nasce no modal "+ Novo cliente" da
// busca, antes do contrato, e nunca mais dentro da transacao da gravacao.
const CLIENTE_INEXISTENTE =
  "Cliente não encontrada. Selecione uma cliente na busca ou cadastre-a em \"+ Novo cliente\".";

/** Valida o codigo normalizado. Devolve a mensagem de erro, ou null. */
function checkCode(code: string): string | null {
  if (!code) return "Informe o código da cliente.";
  if (code.length > MAX_CODE) return `Código muito longo (máx. ${MAX_CODE} caracteres).`;
  return null;
}

/** Código da cliente: apara e colapsa espaços. A CAIXA NÃO É ALTERADA — o
 *  código gravado tem de ser o que a cliente conhece, e a busca já é
 *  case-insensitive. */
function normalizeCode(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

function revalidateSelect() {
  revalidatePath("/vendas");
  revalidatePath("/vendas/novo-select");
  revalidatePath("/financeiro/select");
}

// ---------------------------------------------------------------------------
// Consultas do formulário
// ---------------------------------------------------------------------------

export interface ActiveContractInfo {
  id: string;
  planName: string;
  monthlyAmount: number;
  startDate: string;
  endDate: string;
  closedAt: string | null;
}

export interface CustomerLookup {
  found: boolean;
  customerId: string | null;
  code: string;
  name: string | null;
  /** Contratos ATIVOS da cliente, para avisar da troca ANTES do preenchimento. */
  activeContracts: ActiveContractInfo[];
}

function toActiveInfo(c: {
  id: string; planNameSnapshot: string; monthlyAmount: Prisma.Decimal;
  startDate: Date; endDate: Date; closedAt: Date | null;
}): ActiveContractInfo {
  return {
    id: c.id,
    planName: c.planNameSnapshot,
    monthlyAmount: Number(c.monthlyAmount),
    startDate: c.startDate.toISOString(),
    endDate: c.endDate.toISOString(),
    closedAt: c.closedAt ? c.closedAt.toISOString() : null,
  };
}

/**
 * Carrega a cliente e os Selects que ela já tem.
 *
 * Chamada quando a cliente é ESCOLHIDA na busca, e não na gravação: é daqui
 * que sai o aviso de contrato vigente, que a vendedora precisa ver antes de
 * preencher o formulário — inclusive o aviso de que a troca de plano exige
 * Gestão ou Financeiro.
 *
 * Distingue três respostas, e a distinção importa: encontrada, não encontrada
 * (cadastro apagado entre a busca e a escolha) e erro técnico. Tratar banco
 * fora do ar como "cliente não existe" faria a tela mandar o usuário cadastrar
 * de novo uma cliente que já está lá.
 */
export async function lookupSelectCustomer(codeRaw: string): Promise<ActionResult<CustomerLookup>> {
  try {
    await requireRoleAction([...PERFIS_CRIACAO]);
    const code = normalizeCode(codeRaw);
    const codeInvalido = checkCode(code);
    if (codeInvalido) return actionError(codeInvalido);

    const customer = await prisma.customer.findFirst({
      where: { code: { equals: code, mode: "insensitive" } },
      select: { id: true, code: true, name: true },
    });

    if (!customer) {
      return actionOk({ found: false, customerId: null, code, name: null, activeContracts: [] });
    }

    const ativos = await prisma.selectContract.findMany({
      where: { customerId: customer.id, status: "ATIVO" },
      select: {
        id: true, planNameSnapshot: true, monthlyAmount: true,
        startDate: true, endDate: true, closedAt: true,
      },
      orderBy: { startDate: "asc" },
    });

    // Contrato que já alcançou o fim efetivo continua ATIVO no banco (não há
    // rotina que o vire) — mas não é obstáculo para uma adesão nova, então
    // não entra no aviso.
    const hoje = dayUTC();
    const vigentes = ativos.filter((c) => effectiveEnd(c).getTime() > hoje.getTime());

    return actionOk({
      found: true,
      customerId: customer.id,
      code: customer.code,
      name: customer.name,
      activeContracts: vigentes.map(toActiveInfo),
    });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao buscar a cliente.");
  }
}

// ---------------------------------------------------------------------------
// Resolução dos valores (compartilhada entre a prévia e a gravação)
// ---------------------------------------------------------------------------

export interface SelectFormInput {
  code: string;
  planId: string;
  /** "aaaa-mm-dd". */
  startDate: string;
  /** Plano negociado: digitados. Nos demais, ignorados. */
  monthlyAmount?: string;
  minMonthlyPurchase?: string;
  validityMonths?: string;
}

interface Resolved {
  plan: { id: string; name: string };
  validityMonths: number;
  /** Base do plano (tabela) ou valor negociado — SEM o Build.Sales. */
  baseMonthlyAmount: number;
  /** O que a cliente paga por mês: base + Build.Sales. É o que vai ao banco. */
  monthlyAmount: number;
  minMonthlyPurchase: number;
  totalAmount: number;
  start: Date;
  end: Date;
}

/** Relê o plano no banco e monta os valores definitivos. Nunca confia no que veio da tela. */
async function resolveValues(input: SelectFormInput): Promise<Resolved | { error: string }> {
  const plan = await prisma.selectPlan.findUnique({
    where: { id: input.planId },
    select: {
      id: true, name: true, active: true, validityMonths: true,
      monthlyAmount: true, minMonthlyPurchase: true, editableValues: true,
    },
  });
  if (!plan) return { error: "Plano não encontrado." };
  if (!plan.active) return { error: "Este plano não está mais ativo." };

  const start = parseDayUTC(input.startDate);
  if (!start) return { error: "Data de início inválida." };

  let validityMonths = plan.validityMonths;
  let monthlyAmount: number | null = plan.monthlyAmount == null ? null : Number(plan.monthlyAmount);
  let minMonthlyPurchase: number | null =
    plan.minMonthlyPurchase == null ? null : Number(plan.minMonthlyPurchase);

  if (plan.editableValues) {
    // Plano negociado: validade, mensalidade e mínimo vêm da tela — e por isso
    // são os únicos campos validados aqui.
    monthlyAmount = parseMoney(input.monthlyAmount);
    minMonthlyPurchase = parseMoney(input.minMonthlyPurchase);
    const v = Number((input.validityMonths ?? "").trim() || plan.validityMonths);
    if (!Number.isInteger(v) || v < 1 || v > 120) {
      return { error: "Validade inválida (de 1 a 120 meses)." };
    }
    validityMonths = v;
    if (monthlyAmount == null || monthlyAmount <= 0) {
      return { error: "Informe a mensalidade (maior que zero)." };
    }
    if (minMonthlyPurchase == null || minMonthlyPurchase <= 0) {
      return { error: "Informe o mínimo de compras mensal (maior que zero)." };
    }
    if (monthlyAmount > 9_999_999 || minMonthlyPurchase > 9_999_999) {
      return { error: "Valor acima do limite permitido." };
    }
  }

  if (monthlyAmount == null || minMonthlyPurchase == null) {
    return { error: "O plano não tem valores cadastrados." };
  }

  // O Build.Sales entra AQUI, uma vez, para os quatro planos: sobre o valor de
  // tabela nos três fixos e sobre o valor digitado no negociado. Daqui para
  // baixo `mensal` é o que a cliente paga — as parcelas, o total do contrato e
  // o snapshot do contrato saem todos deste número.
  const baseMensal = money(monthlyAmount);
  const mensal = monthlyWithBuildSales(baseMensal);

  // totalAmount é DECIMAL(10,2): acima de 99.999.999,99 o insert estoura no
  // banco, e não no formulário. Mensalidade × validade chega lá com valores
  // que cada um sozinho passaria na validação acima.
  const total = money(mensal * validityMonths);
  if (total > 99_999_999.99) {
    return { error: "O valor total do contrato ultrapassa o limite permitido." };
  }

  const end = contractEndDate(start, validityMonths);
  if (end.getTime() <= dayUTC().getTime()) {
    return { error: `Este Select terminaria em ${formatDayBR(end)}, uma data que já passou.` };
  }

  return {
    plan: { id: plan.id, name: plan.name },
    validityMonths,
    baseMonthlyAmount: baseMensal,
    monthlyAmount: mensal,
    minMonthlyPurchase: money(minMonthlyPurchase),
    totalAmount: total,
    start,
    end,
  };
}

async function loadActives(customerId: string): Promise<ExistingContract[]> {
  const rows = await prisma.selectContract.findMany({
    where: { customerId, status: "ATIVO" },
    select: {
      id: true, startDate: true, endDate: true, closedAt: true,
      planNameSnapshot: true, monthlyAmount: true,
    },
  });
  return rows.map((c) => ({
    id: c.id,
    startDate: c.startDate,
    endDate: c.endDate,
    closedAt: c.closedAt,
    planNameSnapshot: c.planNameSnapshot,
    monthlyAmount: Number(c.monthlyAmount),
  }));
}

// ---------------------------------------------------------------------------
// Prévia (o resumo exibido antes de confirmar)
// ---------------------------------------------------------------------------

export interface SelectPreview {
  customerName: string;
  customerCode: string;
  planName: string;
  validityMonths: number;
  /** Base do plano ou valor negociado, sem o Build.Sales. */
  baseMonthlyAmount: number;
  /** Parcela do Build.Sales embutida na mensalidade. */
  buildSalesAmount: number;
  /** O que a cliente paga por mês: base + Build.Sales. */
  monthlyAmount: number;
  minMonthlyPurchase: number;
  /** mensalidade × validade. */
  totalAmount: number;
  startDate: string;
  endDate: string;
  installments: { number: number; dueDate: string; amount: number }[];
  /** Soma das parcelas geradas. Difere de totalAmount em contrato retroativo. */
  billableAmount: number;
  skippedPastInstallments: number;
  kind: "NOVO" | "RENOVACAO" | "TROCA";
  /** Preenchido quando kind = TROCA. */
  replacing: {
    planName: string;
    monthlyAmount: number;
    startDate: string;
    endDate: string;
    canceledInstallments: number;
    /** Já pago referente a período posterior ao encerramento (decisão 3). */
    paidBeyondClosure: number;
  } | null;
  /** True quando a troca exige um perfil que o usuário não tem. */
  requiresPrivilege: boolean;
}

/**
 * Monta o resumo da adesão — no SERVIDOR. É a mesma resolução de valores que a
 * gravação usa, então o que a tela mostra antes de confirmar é exatamente o
 * que será gravado, e não uma segunda conta feita em JavaScript no navegador.
 */
export async function previewSelectContract(input: SelectFormInput): Promise<ActionResult<SelectPreview>> {
  try {
    const session = await requireRoleAction([...PERFIS_CRIACAO]);

    const resolved = await resolveValues(input);
    if ("error" in resolved) return actionError(resolved.error);

    const code = normalizeCode(input.code);
    const codeInvalido = checkCode(code);
    if (codeInvalido) return actionError(codeInvalido);

    const customer = await prisma.customer.findFirst({
      where: { code: { equals: code, mode: "insensitive" } },
      select: { id: true, code: true, name: true },
    });
    if (!customer) return actionError(CLIENTE_INEXISTENTE);
    const nome = customer.name;

    const actives = await loadActives(customer.id);
    const classificacao = classifyAdesao({ start: resolved.start, actives });
    if (classificacao.kind === "BLOQUEADO") return actionError(classificacao.reason);

    const plano = buildInstallmentPlan({
      start: resolved.start,
      validityMonths: resolved.validityMonths,
      monthlyAmount: resolved.monthlyAmount,
    });

    let replacing: SelectPreview["replacing"] = null;
    if (classificacao.kind === "TROCA") {
      const alvo = classificacao.current;
      const [aCancelar, pagoAlem] = await Promise.all([
        prisma.selectInstallment.count({
          where: { contractId: alvo.id, status: "PENDENTE", dueDate: { gte: resolved.start } },
        }),
        prisma.selectInstallment.aggregate({
          where: { contractId: alvo.id, dueDate: { gte: resolved.start } },
          _sum: { paidAmount: true },
        }),
      ]);
      replacing = {
        planName: alvo.planNameSnapshot,
        monthlyAmount: alvo.monthlyAmount,
        startDate: alvo.startDate.toISOString(),
        endDate: effectiveEnd(alvo).toISOString(),
        canceledInstallments: aCancelar,
        paidBeyondClosure: money(Number(pagoAlem._sum.paidAmount ?? 0)),
      };
    }

    return actionOk({
      customerName: nome,
      customerCode: customer.code,
      planName: resolved.plan.name,
      validityMonths: resolved.validityMonths,
      baseMonthlyAmount: resolved.baseMonthlyAmount,
      buildSalesAmount: BUILD_SALES_MONTHLY,
      monthlyAmount: resolved.monthlyAmount,
      minMonthlyPurchase: resolved.minMonthlyPurchase,
      totalAmount: resolved.totalAmount,
      startDate: resolved.start.toISOString(),
      endDate: resolved.end.toISOString(),
      installments: plano.map((p) => ({
        number: p.number,
        dueDate: p.dueDate.toISOString(),
        amount: p.amount,
      })),
      billableAmount: money(plano.reduce((s, p) => s + p.amount, 0)),
      skippedPastInstallments: resolved.validityMonths - plano.length,
      kind: classificacao.kind,
      replacing,
      requiresPrivilege:
        classificacao.kind === "TROCA" &&
        !(PERFIS_PRIVILEGIADOS as readonly string[]).includes(session.role),
    });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao montar o resumo.");
  }
}

// ---------------------------------------------------------------------------
// Gravação
// ---------------------------------------------------------------------------

/**
 * Grava a adesão. Tudo numa transação: cadastro da cliente (quando nova),
 * encerramento e ajuste de parcelas do contrato trocado, o contrato novo e as
 * suas parcelas. Se qualquer passo falhar, nada fica.
 *
 * `confirmTroca` é a confirmação do usuário diante do contrato vigente, não um
 * atalho: a classificação é refeita AQUI, a partir do banco. Um navegador que
 * mandasse `confirmTroca: false` numa troca real só conseguiria ser recusado.
 */
export async function createSelectContract(
  input: SelectFormInput & { confirmTroca?: boolean; responsibleId?: string },
): Promise<ActionResult<{ id: string; kind: string }>> {
  try {
    const session = await requireRoleAction([...PERFIS_CRIACAO]);

    const resolved = await resolveValues(input);
    if ("error" in resolved) return actionError(resolved.error);

    const code = normalizeCode(input.code);
    const codeInvalido = checkCode(code);
    if (codeInvalido) return actionError(codeInvalido);
    const resultado = await prisma.$transaction(async (tx) => {
      // --- cliente (tem de existir) ---
      // A adesão NÃO cria mais a cliente. Antes criava, e era o que permitia
      // digitar um código qualquer e um nome ao lado; agora a cliente é
      // escolhida numa busca, e quem não está cadastrada nasce no modal
      // "+ Novo cliente" — um cadastro de verdade, com endereço e contato, e
      // não o par código+nome que a adesão improvisava.
      const customer = await tx.customer.findFirst({
        where: { code: { equals: code, mode: "insensitive" } },
        select: { id: true, code: true, name: true },
      });
      if (!customer) throw new Error(CLIENTE_INEXISTENTE);

      // --- classificação, refeita a partir do banco ---
      const rows = await tx.selectContract.findMany({
        where: { customerId: customer.id, status: "ATIVO" },
        select: {
          id: true, startDate: true, endDate: true, closedAt: true,
          planNameSnapshot: true, monthlyAmount: true,
        },
      });
      const actives: ExistingContract[] = rows.map((c) => ({
        id: c.id, startDate: c.startDate, endDate: c.endDate, closedAt: c.closedAt,
        planNameSnapshot: c.planNameSnapshot, monthlyAmount: Number(c.monthlyAmount),
      }));
      const classificacao = classifyAdesao({ start: resolved.start, actives });

      if (classificacao.kind === "BLOQUEADO") throw new Error(classificacao.reason);

      if (classificacao.kind === "TROCA") {
        if (!(PERFIS_PRIVILEGIADOS as readonly string[]).includes(session.role)) {
          throw new Error(
            `A cliente tem um Select vigente (${classificacao.current.planNameSnapshot}, até ` +
              `${formatDayBR(effectiveEnd(classificacao.current))}). A troca de plano precisa ser feita por Gestão ou Financeiro.`,
          );
        }
        if (!input.confirmTroca) {
          throw new Error("A troca de plano não foi confirmada.");
        }
      }

      // --- responsável pela venda ---
      // Dentro da transação de propósito: assim a conferência do vendedor e a
      // gravação do contrato leem o mesmo instante do banco, e um vendedor
      // desativado no meio do caminho não escapa pela janela entre as duas.
      const pedido = (input.responsibleId ?? "").trim();
      const escolhido =
        session.role !== "VENDAS" && pedido
          ? await tx.user.findUnique({
              where: { id: pedido },
              select: { id: true, role: true, active: true },
            })
          : null;
      const responsavel = resolveResponsibleId({
        actorRole: session.role,
        actorId: session.userId,
        chosenId: input.responsibleId,
        chosen: escolhido,
      });
      if ("error" in responsavel) throw new Error(responsavel.error);

      // --- contrato novo ---
      const novo = await tx.selectContract.create({
        data: {
          customerId: customer.id,
          planId: resolved.plan.id,
          responsibleId: responsavel.responsibleId,
          startDate: resolved.start,
          endDate: resolved.end,
          validityMonths: resolved.validityMonths,
          monthlyAmount: new Prisma.Decimal(resolved.monthlyAmount),
          totalAmount: new Prisma.Decimal(resolved.totalAmount),
          minMonthlyPurchase: new Prisma.Decimal(resolved.minMonthlyPurchase),
          planNameSnapshot: resolved.plan.name,
          status: "ATIVO",
          createdById: session.userId,
        },
        select: { id: true },
      });

      // --- parcelas do contrato novo ---
      const parcelas = buildInstallmentPlan({
        start: resolved.start,
        validityMonths: resolved.validityMonths,
        monthlyAmount: resolved.monthlyAmount,
      });
      if (parcelas.length > 0) {
        await tx.selectInstallment.createMany({
          data: parcelas.map((p) => ({
            contractId: novo.id,
            number: p.number,
            dueDate: p.dueDate,
            amount: new Prisma.Decimal(p.amount),
            createdById: session.userId,
          })),
        });
      }

      // --- encerramento do contrato trocado ---
      if (classificacao.kind === "TROCA") {
        const alvo = classificacao.current;
        const hoje = dayUTC();
        // Início futuro: o antigo SEGUE ativo até a data da troca, e só então
        // vira encerrado — o que a derivação de contractState já faz sozinha.
        const encerraAgora = resolved.start.getTime() <= hoje.getTime();

        await tx.selectContract.update({
          where: { id: alvo.id },
          data: {
            closedAt: resolved.start,
            replacedById: novo.id,
            status: encerraAgora ? "ENCERRADO" : "ATIVO",
            updatedById: session.userId,
          },
        });

        // Parcelas pendentes que cairiam depois do encerramento deixam de ser
        // devidas. As vencidas em aberto (antes do encerramento) continuam:
        // trocar de plano não perdoa o que já estava atrasado.
        await tx.selectInstallment.updateMany({
          where: { contractId: alvo.id, status: "PENDENTE", dueDate: { gte: resolved.start } },
          data: { status: "CANCELADA", updatedById: session.userId },
        });
      }

      return { id: novo.id, kind: classificacao.kind };
    });

    revalidateSelect();
    return actionOk(resultado);
  } catch (err) {
    // Corrida no cadastro automático: duas adesões simultâneas com o mesmo
    // código novo. A transação já desfez tudo; a mensagem orienta a repetir.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return actionError("Este código de cliente acabou de ser cadastrado. Busque novamente e repita a adesão.");
    }
    return actionError(err instanceof Error ? err.message : "Erro ao registrar o Select.");
  }
}

/**
 * Cancela um Select. Contrato não se sobrescreve: corrigir é cancelar e
 * cadastrar outro, e o cancelado fica no histórico.
 */
export async function cancelSelectContract(args: {
  id: string;
  reason: string;
}): Promise<ActionResult<void>> {
  try {
    const session = await requireRoleAction([...PERFIS_PRIVILEGIADOS]);
    const reason = limitText(args.reason, MAX_TEXTO);
    if (!reason) return actionError("Informe o motivo do cancelamento.");

    await prisma.$transaction(async (tx) => {
      const c = await tx.selectContract.findUnique({
        where: { id: args.id },
        select: { id: true, status: true },
      });
      if (!c) throw new Error("Select não encontrado.");
      if (c.status === "CANCELADO") throw new Error("Este Select já está cancelado.");

      const agora = new Date();
      await tx.selectContract.update({
        where: { id: c.id },
        data: {
          status: "CANCELADO",
          canceledAt: agora,
          canceledById: session.userId,
          cancelReason: reason,
          updatedById: session.userId,
        },
      });

      // Parcelas pendentes a vencer deixam de ser devidas. As vencidas em
      // aberto permanecem: o cancelamento olha para a frente, não apaga
      // atraso que já existia. Pagas não se mexem.
      await tx.selectInstallment.updateMany({
        where: { contractId: c.id, status: "PENDENTE", dueDate: { gte: dayUTC() } },
        data: { status: "CANCELADA", updatedById: session.userId },
      });
    });

    revalidateSelect();
    revalidatePath(`/financeiro/select/${args.id}`);
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao cancelar o Select.");
  }
}
