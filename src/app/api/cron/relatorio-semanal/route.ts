import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizadoPorSegredoDeCron } from "@/lib/cron-auth";
import { segundaDaSemana, semanaIso } from "@/lib/relatorio-semanal-math";

/**
 * A COBRANÇA DA SEXTA.
 *
 * A planilha dizia "entrega toda sexta até 18h", e a ferramenta não cobrava
 * ninguém: quem esquecia só descobria na reunião, com a semana em branco na
 * tela. Esta rotina é o lembrete que faltava.
 *
 * Chamada UMA VEZ POR DIA por um agendador externo, como as outras rotinas
 * daqui (o projeto não tem agendador próprio — o deploy é Docker):
 *
 *   curl -X POST https://<host>/api/cron/relatorio-semanal \
 *        -H "Authorization: Bearer $SELECT_CRON_SECRET"
 *
 * ELA SÓ FALA NA SEXTA. Chamar nos outros dias devolve `ok` sem notificar —
 * assim o agendador aponta para cá todo dia e o dia certo mora no código, e
 * não na configuração de um servidor que ninguém relê.
 *
 * ELA NÃO DECIDE NADA. Não cria semana, não preenche campo, não fecha nada.
 * Se parar de rodar, nenhuma tela mente — só o aviso deixa de chegar. É a
 * mesma regra da rotina do Select, e pelo mesmo motivo: uma rotina que
 * sustenta a verdade é uma rotina cuja falha corrompe o sistema em silêncio.
 *
 * Idempotente: rodar duas vezes no mesmo dia não duplica notificação.
 */

export const dynamic = "force-dynamic";

/** Prefixo que identifica a notificação desta rotina (usado na deduplicação). */
const PREFIXO = "Relatório Semanal:";

/** Sexta-feira em `getUTCDay()` (0 = domingo). O dia da entrega. */
const DIA_DA_ENTREGA = 5;

/** `yyyy-mm-dd` → meia-noite UTC, a mesma régua das colunas `@db.Date`. */
function lerDia(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export async function POST(req: Request) {
  if (!autorizadoPorSegredoDeCron(req)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const hojeIso = new Date().toISOString().slice(0, 10);
  const hoje = lerDia(hojeIso);

  if (hoje.getUTCDay() !== DIA_DA_ENTREGA) {
    return NextResponse.json({ ok: true, notificados: 0, motivo: "hoje nao e sexta" });
  }

  // A semana CORRENTE, pela mesma conta que a ferramenta usa para criar uma:
  // a chave de um relatório é o período, e o período começa na segunda.
  const inicio = segundaDaSemana(hojeIso);
  const semana = semanaIso(hojeIso);

  const report = await prisma.weeklyReport.findUnique({
    where: { periodStart: lerDia(inicio) },
    select: { id: true, highlight: true, deliveries: { select: { health: true } } },
  });

  // O QUE SE COBRA são as três coisas que fazem a reunião travar: a semana não
  // existir, entregas sem status, e o destaque em branco. Métricas e OKRs
  // ficam de fora de propósito — nem toda semana tem número para lançar, e um
  // lembrete que acusa o que é opcional vira lembrete que ninguém lê.
  let message: string;

  if (!report) {
    message = `${PREFIXO} a semana ${semana} ainda nao foi criada, e a entrega e hoje ate as 18h.`;
  } else {
    const semStatus = report.deliveries.filter((d) => d.health === null).length;
    const semDestaque = !report.highlight?.trim();

    if (semStatus === 0 && !semDestaque) {
      return NextResponse.json({ ok: true, notificados: 0, motivo: "semana completa", semana });
    }

    const partes: string[] = [];
    if (semStatus > 0) partes.push(`${semStatus} entrega(s) sem status`);
    if (semDestaque) partes.push("destaque da semana em branco");
    message = `${PREFIXO} a semana ${semana} fecha hoje as 18h — ${partes.join(" e ")}.`;
  }

  // Só GESTAO: é quem a ferramenta deixa entrar (ver o `requireRole` da
  // página). Avisar quem não consegue abrir seria sino sem porta.
  const destinatarios = await prisma.user.findMany({
    where: { active: true, role: "GESTAO" },
    select: { id: true },
  });

  // Deduplicação: quem já recebeu o aviso hoje não recebe de novo. Sem isto,
  // um agendador configurado de hora em hora encheria o sino.
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

  return NextResponse.json({ ok: true, semana, notificados: novos.length, message });
}

/** GET existe só para conferir se a rotina está no ar e configurada. */
export async function GET(req: Request) {
  if (!autorizadoPorSegredoDeCron(req)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }
  const hojeIso = new Date().toISOString().slice(0, 10);
  return NextResponse.json({
    ok: true,
    hoje: hojeIso,
    semanaCorrente: semanaIso(hojeIso),
    inicioDoPeriodo: segundaDaSemana(hojeIso),
    avisaHoje: lerDia(hojeIso).getUTCDay() === DIA_DA_ENTREGA,
  });
}
