import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
// A checagem do Bearer vive em @/lib/cron-auth: ha mais de uma rotina agendada
// agora, e duas copias desta checagem divergem na primeira correcao.
import { autorizadoPorSegredoDeCron } from "@/lib/cron-auth";
import { dayUTC, addMonthsClamped, formatDayBR } from "@/lib/select-contract";

/**
 * ROTINA DIÁRIA DO SELECT.
 *
 * O projeto não tem agendador próprio (sem cron, sem vercel.json; o deploy é
 * Docker). Esta rota existe para ser chamada UMA VEZ POR DIA por um agendador
 * externo — cron do host, Task Scheduler do Windows, ou o que houver:
 *
 *   curl -X POST https://<host>/api/cron/selects \
 *        -H "Authorization: Bearer $SELECT_CRON_SECRET"
 *
 * O que ela NÃO faz: decidir a verdade dos dados. Parcela vencida, contrato
 * encerrado e pagamento parcial são DERIVADOS na consulta (ver
 * src/lib/select-contract.ts). Se esta rotina parar de rodar, nenhuma tela
 * mente — só o aviso deixa de chegar. É de propósito: uma rotina que sustenta
 * a verdade é uma rotina cuja falha corrompe o sistema em silêncio.
 *
 * O que ela faz:
 *   1. arruma o `status` dos contratos que alcançaram o fim (higiene da
 *      coluna, para os filtros não dependerem só da derivação);
 *   2. avisa FINANCEIRO e GESTÃO do que vence em 3 dias e do que está vencido.
 *
 * Idempotente: rodar duas vezes no mesmo dia não duplica notificação.
 */

export const dynamic = "force-dynamic";

/** Aviso prévio, em dias, antes do vencimento. */
const AVISO_PREVIO_DIAS = 3;

/** Prefixo que identifica a notificação desta rotina (usado na deduplicação). */
const PREFIXO = "Select:";

export async function POST(req: Request) {
  if (!autorizadoPorSegredoDeCron(req)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const hoje = dayUTC();
  const limiteAviso = new Date(hoje.getTime() + AVISO_PREVIO_DIAS * 86400000);

  // --- 1. higiene: contratos que alcançaram o fim efetivo ---
  const encerrados = await prisma.selectContract.updateMany({
    where: {
      status: "ATIVO",
      OR: [{ closedAt: { lte: hoje } }, { closedAt: null, endDate: { lte: hoje } }],
    },
    data: { status: "ENCERRADO" },
  });

  // --- 2. o que cobrar ---
  // Parcelas de contratos cancelados não entram: o contrato acabou, a parcela
  // pendente que sobrou é atraso histórico, não cobrança a fazer.
  const baseContrato = { status: { not: "CANCELADO" as const } };

  const [vencidas, aVencer] = await Promise.all([
    prisma.selectInstallment.aggregate({
      where: { status: "PENDENTE", dueDate: { lt: hoje }, contract: baseContrato },
      _count: { _all: true },
      _sum: { amount: true, paidAmount: true },
    }),
    prisma.selectInstallment.aggregate({
      where: { status: "PENDENTE", dueDate: { gte: hoje, lte: limiteAviso }, contract: baseContrato },
      _count: { _all: true },
      _sum: { amount: true, paidAmount: true },
    }),
  ]);

  const nVencidas = vencidas._count._all;
  const nAVencer = aVencer._count._all;
  const valorVencido =
    Number(vencidas._sum.amount ?? 0) - Number(vencidas._sum.paidAmount ?? 0);

  if (nVencidas === 0 && nAVencer === 0) {
    return NextResponse.json({
      ok: true,
      encerrados: encerrados.count,
      notificados: 0,
      motivo: "nada a cobrar",
    });
  }

  // --- 3. notificação, uma por usuário por dia ---
  const partes: string[] = [];
  if (nVencidas > 0) {
    partes.push(
      `${nVencidas} parcela(s) vencida(s), R$ ${valorVencido.toFixed(2).replace(".", ",")} em aberto`,
    );
  }
  if (nAVencer > 0) {
    partes.push(`${nAVencer} vencendo até ${formatDayBR(limiteAviso)}`);
  }
  const message = `${PREFIXO} ${partes.join(" · ")}.`;

  const destinatarios = await prisma.user.findMany({
    where: { active: true, role: { in: ["FINANCEIRO", "GESTAO"] } },
    select: { id: true },
  });

  // Deduplicação: quem já recebeu o aviso do Select hoje não recebe de novo.
  // Sem isto, um agendador configurado de hora em hora encheria o sino.
  const jaAvisados = await prisma.notification.findMany({
    where: {
      userId: { in: destinatarios.map((u) => u.id) },
      message: { startsWith: PREFIXO },
      createdAt: { gte: hoje },
    },
    select: { userId: true },
  });
  const jaTem = new Set(jaAvisados.map((n) => n.userId));
  const novos = destinatarios.filter((u) => !jaTem.has(u.id));

  if (novos.length > 0) {
    await prisma.notification.createMany({
      data: novos.map((u) => ({ userId: u.id, message })),
    });
  }

  return NextResponse.json({
    ok: true,
    encerrados: encerrados.count,
    vencidas: nVencidas,
    aVencer: nAVencer,
    notificados: novos.length,
    message,
  });
}

/** GET existe só para conferir se a rotina está no ar e configurada. */
export async function GET(req: Request) {
  if (!autorizadoPorSegredoDeCron(req)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }
  const proximo = addMonthsClamped(dayUTC(), 0);
  return NextResponse.json({ ok: true, hoje: formatDayBR(proximo), avisoPrevioDias: AVISO_PREVIO_DIAS });
}
