/**
 * Dado de EXEMPLO do Relatório Semanal: semanas para olhar a ferramenta cheia,
 * e os 12 cartões com que o quadro abre.
 *
 * Existe porque a ferramenta vazia não se avalia: uma lista sem semana nenhuma
 * e um quadro sem cartão não mostram a barra de progresso, os três sinais, a
 * média de 4 semanas nem o painel do Kanban. Preencher tudo à mão a cada
 * conferência custa uma hora e sai diferente a cada vez.
 *
 * NÃO RODE EM PRODUÇÃO: ele cria semanas de demonstração. Os 12 cartões, sim,
 * são o quadro de verdade — mas eles também nascem de `--so-cartoes`, que não
 * cria semana nenhuma.
 *
 *   npx tsx scripts/semana-exemplo.ts              cria as semanas + os cartões
 *   npx tsx scripts/semana-exemplo.ts --so-cartoes só o quadro inicial
 *   npx tsx scripts/semana-exemplo.ts --limpar     apaga o que ele criou
 *
 * DATAS FIXAS, e não relativas a hoje: é o que faz `--limpar` apagar
 * exatamente o que foi criado, mesmo rodando semanas depois. Com datas
 * relativas, limpar na segunda seguinte deixaria lixo para trás.
 */
import { PrismaClient } from "@prisma/client";
import { AGENDA, TASKS } from "../src/lib/relatorio-semanal-templates";
import { semanaIso } from "../src/lib/relatorio-semanal-math";

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const limpar = args.includes("--limpar");
const soCartoes = args.includes("--so-cartoes");

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** As segundas-feiras das semanas de exemplo. A última é a CHEIA. */
const SEMANAS = [
  "2026-10-19",
  "2026-10-26",
  "2026-11-02",
  "2026-11-09",
  "2026-11-16",
  "2026-11-23",
] as const;
const CHEIA = SEMANAS[SEMANAS.length - 1];

/** Uma entrega da rotina, como a aba 2 a trazia. */
const ENTREGAS = [
  { day: "Segunda", block: "Planejamento", expected: "Calendário editorial da semana revisado" },
  { day: "Terça", block: "Produção", expected: "Gravação com duas consultoras" },
  { day: "Quarta", block: "Publicação", expected: "Posts agendados nas cinco redes" },
  { day: "Quinta", block: "Comunidade", expected: "DMs e comentários respondidos em 24h" },
  { day: "Sexta", block: "Relatório", expected: "Relatório da semana preenchido até 18h" },
];

async function main() {
  if (limpar) {
    const semanas = await prisma.weeklyReport.deleteMany({
      where: { periodStart: { in: SEMANAS.map(dia) } },
    });
    const cartoes = await prisma.marketingTask.deleteMany({
      where: { code: { in: TASKS.map((_, i) => codigo(i)) } },
    });
    console.log(`apagadas ${semanas.count} semanas e ${cartoes.count} cartões.`);
    return;
  }

  const autor = await prisma.user.findFirst({ where: { role: "GESTAO", active: true } });
  if (!autor) throw new Error("Nenhum usuário GESTAO ativo: crie um antes (npm run db:seed).");

  // O quadro é IDEMPOTENTE pelo `code`: rodar duas vezes não duplica cartão.
  const jaTem = new Set(
    (await prisma.marketingTask.findMany({ select: { code: true } })).map((t) => t.code),
  );
  let criados = 0;
  for (const [i, modelo] of TASKS.entries()) {
    const code = codigo(i);
    if (jaTem.has(code)) continue;
    await prisma.marketingTask.create({
      data: {
        code,
        title: modelo.title,
        category: modelo.category,
        priority: modelo.priority,
        // Os dois primeiros já andaram, para o quadro não abrir com tudo numa
        // coluna só — é assim que se vê se as colunas funcionam.
        status: i === 0 ? "EM_ANDAMENTO" : i === 1 ? "A_FAZER" : "BACKLOG",
        assigneeId: i % 3 === 0 ? autor.id : null,
      },
    });
    criados += 1;
  }
  console.log(`cartões criados: ${criados} (os já existentes foram mantidos).`);

  if (soCartoes) return;

  const existentes = await prisma.weeklyReport.findMany({
    where: { periodStart: { in: SEMANAS.map(dia) } },
    select: { weekNumber: true },
  });
  if (existentes.length > 0) {
    throw new Error(
      `Já existem ${existentes.length} das semanas de exemplo no banco.\n` +
        "Rode `npx tsx scripts/semana-exemplo.ts --limpar` antes de recriar.",
    );
  }

  for (const inicio of SEMANAS) {
    const cheia = inicio === CHEIA;
    const fim = new Date(dia(inicio).getTime() + 6 * 86_400_000).toISOString().slice(0, 10);
    // As semanas antigas vão ficando mais completas conforme se aproximam da
    // cheia: é o que deixa a média de 4 semanas com números diferentes para
    // comparar, em vez de quatro vezes o mesmo valor.
    const posicao = SEMANAS.indexOf(inicio);
    const alcance = 8200 + posicao * 1450;

    await prisma.weeklyReport.create({
      data: {
        weekNumber: semanaIso(inicio),
        periodStart: dia(inicio),
        periodEnd: dia(fim),
        createdById: autor.id,
        highlight: cheia
          ? "A série de bastidores da coleção puxou o melhor alcance do mês, e as duas lives converteram acima da média."
          : "Semana dentro do combinado, sem nada fora da curva.",
        learning: cheia
          ? "Vídeo gravado na loja rende mais que arte pronta — vale fixar a terça como dia de gravação."
          : null,
        nextPriority: cheia ? "Fechar o roteiro da campanha de dezembro com as consultoras." : null,
        deliveries: {
          create: ENTREGAS.slice(0, cheia ? 5 : 3).map((e, n) => ({
            order: n + 1,
            ...e,
            health: cheia
              ? (["NO_RITMO", "NO_RITMO", "ATENCAO", "NO_RITMO", "TRAVADO"] as const)[n]
              : n === 0
                ? "NO_RITMO"
                : null,
            evidence: cheia && n === 0 ? "https://instagram.com/p/exemplo" : null,
            note: cheia && n === 4 ? "Travou na aprovação da arte; segue para segunda." : null,
          })),
        },
        metrics: cheia
          ? {
              create: [
                { order: 1, channel: "Instagram", metric: "Alcance", previous: 8200, current: 16400, target: "15.000/semana", health: "NO_RITMO", reading: "Dobrou com a série de bastidores." },
                { order: 2, channel: "Instagram", metric: "Taxa de resposta em DM", previous: 48, current: 39.6, target: "Reduzir de 48%", health: "ATENCAO", reading: "Caiu, mas ainda acima do alvo." },
                // Sem anterior: a variação não existe, e a tela mostra traço em
                // vez de inventar "+100%".
                { order: 3, channel: "TikTok", metric: "Seguidores novos", previous: null, current: 430, target: "+500/semana", health: "ATENCAO", reading: null },
              ],
            }
          : undefined,
        okrs: {
          create: [
            {
              order: 1,
              objective: "Crescer audiência própria",
              keyResult: "Alcance mensal no Instagram",
              measure: "Soma do alcance das publicações do mês",
              goalLabel: "20.000/semana",
              goalValue: 20000,
              achieved: alcance,
              monthlyRead: true,
              health: cheia ? "ATENCAO" : null,
              nextStep: cheia ? "Repetir o formato de bastidores duas vezes por semana." : null,
            },
            ...(cheia
              ? [
                  {
                    order: 2,
                    objective: "Operação sem falha",
                    keyResult: "Publicações fora do horário combinado",
                    measure: "Contagem de posts publicados fora da janela",
                    goalLabel: "0 falhas",
                    // Meta SEM número: a % da meta não existe, e é por isso que
                    // ela é opcional na tela.
                    goalValue: null,
                    achieved: 1,
                    monthlyRead: false,
                    health: "ATENCAO" as const,
                    nextStep: "Agendar na segunda, não na véspera.",
                  },
                ]
              : []),
          ],
        },
        blockers: cheia
          ? {
              create: [
                {
                  order: 1,
                  title: "Aprovação da arte de dezembro parada no fornecedor",
                  impact: "Atrasa o início da campanha em uma semana.",
                  needs: "Agência",
                  dueDate: dia("2026-12-01"),
                  health: "TRAVADO",
                  resolution: null,
                },
              ],
            }
          : undefined,
        // A pauta nasce pronta em TODA semana (é o roteiro da conversa), mas só
        // a semana cheia tem respostas — é o que mostra o filtro da leitura
        // funcionando: pergunta sem resposta não vira linha.
        agenda: {
          create: AGENDA.map((a, n) => ({
            order: n + 1,
            ...a,
            answer: cheia
              ? [
                  "Semana puxada na terça e na quarta, o resto tranquilo.",
                  "A série de bastidores — deu trabalho e rendeu o dobro de alcance.",
                  "A arte de dezembro, parada na agência desde quarta.",
                  "Destravar a agência e aprovar o orçamento da campanha.",
                  "Gravar terça, agendar na segunda, cobrar a agência na segunda-feira.",
                ][n]
              : null,
          })),
        },
      },
    });
  }
  console.log(`semanas criadas: ${SEMANAS.length} (a de ${CHEIA} está cheia).`);
  console.log("Para remover: npx tsx scripts/semana-exemplo.ts --limpar");
}

/** "K-01"… O índice é a posição no modelo, não a contagem do banco. */
function codigo(i: number): string {
  return `K-${String(i + 1).padStart(2, "0")}`;
}

main()
  .catch((e) => {
    console.error(String(e?.message ?? e));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
