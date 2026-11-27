"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/auth";
import { actionOk, actionError, type ActionResult } from "@/types/action";
import {
  FOLLOWUP_STATUSES,
  followUpSchema,
  updateFollowUpSchema,
} from "@/lib/validations/followup";
import { colunaDe, decidirMovimento, type FollowUpStatusValue } from "@/lib/followup-kanban";
import { instanteNoFuso } from "@/lib/rank-window";

const PATH = "/vendas/acompanhamento";

/**
 * Data de um `<input type="date">` como instante do NEGOCIO.
 *
 * `new Date("2026-11-13")` e meia-noite UTC — 21:00 do dia 12 em Brasilia. Num
 * servidor em UTC a tela mostraria o dia ANTERIOR ao escolhido, e o "Prazo de
 * Reavaliacao" venceria um dia antes do combinado.
 */
function dataDoNegocio(iso: string): Date {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return instanteNoFuso(ano, mes, dia);
}

/**
 * Campos gravados por tipo de formulario.
 *
 * Os exclusivos do OUTRO tipo vao a NULL de proposito: trocar o tipo de um
 * registro ja gravado nao pode deixar para tras um "Tema Central" invisivel na
 * tela de One-on-One, que voltaria a aparecer se o tipo fosse trocado de volta.
 */
function dadosDoTipo(
  d: ReturnType<typeof followUpSchema.parse>,
  opts?: { preservarStatus?: boolean },
) {
  const comuns = {
    kind: d.kind,
    collaboratorId: d.collaboratorId,
    heldOn: dataDoNegocio(d.heldOn),
    strengths: d.strengths,
    improvement: d.improvement,
    collaboratorView: d.collaboratorView,
    actionPlan: d.actionPlan,
    notes: d.notes ?? null,
    // "Nao Iniciado" e o padrao ate alteracao manual (planilha).
    //
    // NOS DOIS TIPOS desde 17/11/2026: e o campo que o filtro "Situacao" e o
    // historico da lista leem, e enquanto ele era nulo no Quinzenal o filtro
    // "Concluidos" daquela aba nao tinha como achar nada.
    //
    // `preservarStatus` OMITE a chave, e nao manda nulo: desde 27/11/2026 quem
    // e dono do status e o QUADRO (arrastar o card, as setas, "Mover para"), e
    // o formulario deixou de mandar o campo. Sem esta omissao, `?? "NAO_INICIADO"`
    // faria cada correcao de virgula arrastar o card de volta para a primeira
    // coluna — calado, porque editar devolve sucesso.
    ...(opts?.preservarStatus ? {} : { status: d.status ?? "NAO_INICIADO" }),
  };
  if (d.kind === "ONE_ON_ONE") {
    return {
      ...comuns,
      performance: d.performance ?? null,
      topic: null,
      support: null,
      reviewOn: null,
    };
  }
  return {
    ...comuns,
    performance: null,
    topic: d.topic ?? null,
    support: d.support ?? null,
    reviewOn: d.reviewOn ? dataDoNegocio(d.reviewOn) : null,
  };
}

export async function createFollowUp(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    // Só GESTAO: o registro traz pontos de desenvolvimento e falas do
    // colaborador. Decisão do dono em 13/11/2026.
    const session = await requireRoleAction(["GESTAO"]);
    const parsed = followUpSchema.safeParse(raw);
    if (!parsed.success) {
      return actionError("Dados inválidos.", parsed.error.flatten().fieldErrors);
    }
    const d = parsed.data;

    const colaborador = await prisma.user.findUnique({ where: { id: d.collaboratorId } });
    if (!colaborador) return actionError("Colaborador não encontrado.");

    const registro = await prisma.followUp.create({
      data: {
        ...dadosDoTipo(d),
        // "Gestor Responsavel pelo Suporte": quem preencheu, nunca digitado.
        managerId: session.userId,
      },
      select: { id: true },
    });

    revalidatePath(PATH);
    return actionOk({ id: registro.id });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao salvar o acompanhamento.");
  }
}

export async function updateFollowUp(raw: unknown): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["GESTAO"]);
    const parsed = updateFollowUpSchema.safeParse(raw);
    if (!parsed.success) {
      return actionError("Dados inválidos.", parsed.error.flatten().fieldErrors);
    }
    const { id, ...d } = parsed.data;

    const existe = await prisma.followUp.findUnique({ where: { id }, select: { id: true } });
    if (!existe) return actionError("Acompanhamento não encontrado.");

    // O GESTOR NAO E REESCRITO na edicao: ele registra quem CONDUZIU a
    // conversa, não quem corrigiu uma vírgula depois.
    //
    // E O STATUS TAMBEM NAO, quando a tela nao manda um: ele e do quadro, e
    // uma edicao de texto nao pode mover o card. Mesmo risco que a sessao de
    // 26/11 provou no Cronograma (§3.3), aqui no sentido contrario — lá a
    // action só gravava o status quando enviado; aqui ela o reescrevia sempre.
    // `preservarStatus` SEMPRE: `updateFollowUpSchema` descarta o campo, e o
    // `tsc` recusa `d.status` aqui — a invariante "só o quadro move o cartão"
    // deixou de depender de o chamador se comportar.
    await prisma.followUp.update({
      where: { id },
      data: dadosDoTipo(d, { preservarStatus: true }),
    });

    revalidatePath(PATH);
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao editar o acompanhamento.");
  }
}

export async function deleteFollowUp(id: string): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["GESTAO"]);
    await prisma.followUp.delete({ where: { id } });
    revalidatePath(PATH);
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao excluir o acompanhamento.");
  }
}

// ---------------------------------------------------------------------------
// O QUADRO: mover o card e cronometrar (especificacao de 27/11/2026)
//
// As duas gravam na MESMA transacao a linha da trilha e o novo estado do
// registro: metade disso gravada e um historico em que ninguem pode confiar.
//
// E as duas usam uma GUARDA DE CONCORRENCIA (`updateMany` com o valor que
// acabou de ser lido no `where`). Sem ela, dois cliques quase simultaneos em
// Pausar — ou dois gestores no mesmo card — leriam o mesmo `timerStartedAt` e
// gravariam o MESMO trecho duas vezes: o tempo do status dobraria, e nada na
// tela acusaria. Quando a guarda nao pega nada, o outro clique ja fez o
// trabalho e esta chamada devolve sucesso sem gravar.
//
// O tempo e apurado SEMPRE com o relogio do servidor, de `timerStartedAt`
// contra `Date.now()`. O cliente nunca envia duracao: um navegador adiantado
// gravaria tempo falso numa trilha de auditoria.
// ---------------------------------------------------------------------------

/** Move o card de coluna, pausando a contagem e registrando o trecho. */
export async function moverFollowUp(args: {
  id: string;
  status: FollowUpStatusValue;
}): Promise<ActionResult<void>> {
  try {
    const session = await requireRoleAction(["GESTAO"]);
    const parsed = z
      .object({ id: z.string().min(1), status: z.enum(FOLLOWUP_STATUSES) })
      .safeParse(args);
    if (!parsed.success) return actionError("Dados inválidos.");
    const { id, status } = parsed.data;

    const registro = await prisma.followUp.findUnique({
      where: { id },
      select: { status: true, timerStartedAt: true },
    });
    if (!registro) return actionError("Acompanhamento não encontrado.");

    const mov = decidirMovimento(
      registro.status,
      status,
      registro.timerStartedAt?.toISOString() ?? null,
      Date.now(),
    );
    // Soltar o card na propria coluna nao e movimentacao, e nao pode parar o
    // cronometro de quem so errou a mira.
    if (!mov) return actionOk(undefined);

    await prisma.$transaction(async (tx) => {
      const r = await tx.followUp.updateMany({
        where: { id, status: registro.status, timerStartedAt: registro.timerStartedAt },
        data: { status, timerStartedAt: null },
      });
      if (r.count === 0) return;
      await tx.followUpMovement.create({
        data: {
          followUpId: id,
          ...mov,
          changedById: session.userId,
          changedByName: session.name,
        },
      });
    });

    revalidatePath(PATH);
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao mover o acompanhamento.");
  }
}

/**
 * Liga e desliga a contagem do card.
 *
 * UM BOTAO SO. Qual ramo vale e decidido pelo `timerStartedAt` LIDO DO BANCO,
 * nunca por algo que o cliente mande: assim um segundo clique em Iniciar nao
 * reinicia a contagem nem duplica trecho.
 *
 * Desligar grava uma linha de MESMO status na trilha — e o unico jeito de
 * registrar o trecho contado sem mover o card. A ficha a mostra como
 * "pausado em Em Andamento · 1h20".
 */
export async function alternarCronometro(args: {
  id: string;
}): Promise<ActionResult<{ contando: boolean }>> {
  try {
    const session = await requireRoleAction(["GESTAO"]);
    const parsed = z.object({ id: z.string().min(1) }).safeParse(args);
    if (!parsed.success) return actionError("Dados inválidos.");
    const { id } = parsed.data;

    const registro = await prisma.followUp.findUnique({
      where: { id },
      select: { status: true, timerStartedAt: true },
    });
    if (!registro) return actionError("Acompanhamento não encontrado.");

    if (!registro.timerStartedAt) {
      await prisma.followUp.updateMany({
        where: { id, timerStartedAt: null },
        data: { timerStartedAt: new Date() },
      });
      revalidatePath(PATH);
      return actionOk({ contando: true });
    }

    const mov = decidirMovimento(
      registro.status,
      colunaDe(registro.status),
      registro.timerStartedAt.toISOString(),
      Date.now(),
      { pausa: true },
    );

    await prisma.$transaction(async (tx) => {
      const r = await tx.followUp.updateMany({
        where: { id, timerStartedAt: registro.timerStartedAt },
        data: { timerStartedAt: null },
      });
      if (r.count === 0 || !mov) return;
      await tx.followUpMovement.create({
        data: {
          followUpId: id,
          ...mov,
          changedById: session.userId,
          changedByName: session.name,
        },
      });
    });

    revalidatePath(PATH);
    return actionOk({ contando: false });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao alterar o cronômetro.");
  }
}
