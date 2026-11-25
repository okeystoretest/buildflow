/**
 * Checagem da CAMADA DE LEITURA do Relatório Semanal.
 *
 * Fala com o BANCO de propósito, como `rate-limit.ts` faz, e pelo mesmo
 * motivo: o risco daqui não está em aritmética — está na CONSULTA. A média de
 * 4 semanas casa os resultados-chave PELO TEXTO, atravessando quatro
 * relatórios diferentes, e cada relatório tem as suas próprias linhas de OKR.
 * Conferir isso com objetos montados à mão testaria `mediaDasSemanas()`, que
 * já tem checagem pura em `relatorio-semanal-math.ts`, e deixaria passar o
 * caminho real — que é onde o defeito moraria.
 *
 * ESTA CHECAGEM SÓ EXISTE PORQUE O CI GANHOU BANCO (25/11/2026). Antes dela,
 * uma checagem que exige Postgres abortava o portão no CI.
 *
 * O DADO DE TESTE VIVE EM 2019 e é apagado no fim, inclusive quando uma
 * asserção falha. A data distante não é estética: a média lê as TRÊS semanas
 * anteriores por período, então as quatro semanas daqui precisam ser as únicas
 * antes da última delas. Em 2019 isso vale com o banco vazio do CI e com o
 * banco cheio da máquina do dev, onde os dados reais são de 2026 — e, por
 * serem POSTERIORES, nunca entram na janela.
 *
 * Rode com: npx tsx scripts/checks/relatorio-semanal-leitura.ts
 */
import { PrismaClient } from "@prisma/client";
import { getRelatorioSemanalDetail } from "../../src/lib/relatorio-semanal-data";

const prisma = new PrismaClient();
let falhas = 0;

function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  console.log(`${ok ? "ok" : "FALHOU"} ${nome}`);
  if (!ok) {
    falhas++;
    console.log(`  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

/** As quatro segundas-feiras do dado de teste, da mais velha para a mais nova. */
const SEGUNDAS = ["2018-12-31", "2019-01-07", "2019-01-14", "2019-01-21"] as const;
const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const domingoDepois = (iso: string) =>
  new Date(dia(iso).getTime() + 6 * 86400000);

async function limpar() {
  await prisma.weeklyReport.deleteMany({
    where: { periodStart: { in: SEGUNDAS.map(dia) } },
  });
}

async function main() {
  // Começa limpo: uma execução interrompida antes do `finally` deixaria lixo,
  // e a chave única do período faria a próxima falhar na criação.
  await limpar();

  // "KR A" existe nas QUATRO semanas, com 10, 20, 30 e 40.
  // "KR B" existe só na última — é o que prova que o casamento é por texto, e
  // que um KR novo não herda a história de outro.
  const valoresA = [10, 20, 30, 40];
  let ultimoId = "";

  for (const [i, segunda] of SEGUNDAS.entries()) {
    const okrs: { order: number; objective: string; keyResult: string; measure: string; goalLabel: string; achieved: number }[] = [
      { order: 0, objective: "Objetivo de teste", keyResult: "KR A", measure: "teste", goalLabel: "100", achieved: valoresA[i] },
    ];
    const ultima = i === SEGUNDAS.length - 1;
    if (ultima) {
      okrs.push({ order: 1, objective: "Objetivo de teste", keyResult: "KR B", measure: "teste", goalLabel: "100", achieved: 80 });
    }

    const criado = await prisma.weeklyReport.create({
      data: {
        weekNumber: 900 + i,
        periodStart: dia(segunda),
        periodEnd: domingoDepois(segunda),
        highlight: "destaque de teste",
        okrs: { create: okrs },
        // Só a última recebe entregas: os contadores são por relatório.
        deliveries: ultima
          ? {
              create: [
                { order: 0, day: "SEG", block: "teste", expected: "no ritmo", health: "NO_RITMO" },
                { order: 1, day: "TER", block: "teste", expected: "atencao", health: "ATENCAO" },
                { order: 2, day: "QUA", block: "teste", expected: "travado", health: "TRAVADO" },
                { order: 3, day: "QUI", block: "teste", expected: "sem resposta" },
              ],
            }
          : undefined,
      },
      select: { id: true },
    });
    if (ultima) ultimoId = criado.id;
  }

  const detalhe = await getRelatorioSemanalDetail(ultimoId);
  if (!detalhe) {
    console.log("FALHOU a ficha da semana de teste nao foi lida");
    falhas++;
    return;
  }

  const krA = detalhe.okrs.find((o) => o.keyResult === "KR A");
  const krB = detalhe.okrs.find((o) => o.keyResult === "KR B");

  // A MÉDIA DE 4 SEMANAS: (40 + 30 + 20 + 10) / 4. Atravessa quatro
  // relatórios, casando pelo texto do resultado-chave.
  check("a media de 4 semanas atravessa os relatorios", krA?.fourWeekAverage, 25);

  // Um KR que só existe nesta semana mede SÓ esta semana. É a mesma mecânica
  // que faz renomear um KR reiniciar a média dele — e isso é o certo: um KR
  // renomeado mede outra coisa.
  check("KR que so existe nesta semana nao herda historia", krB?.fourWeekAverage, 80);

  // E o valor da própria semana continua intacto ao lado da média.
  check("o apurado da semana nao e a media", krA?.achieved, 40);

  // Os três COUNTIF do rodapé da aba 2, mais o vazio que ninguém contava,
  // vindos da linha do Prisma direto.
  check("conta as entregas no ritmo", detalhe.onTrack, 1);
  check("conta as entregas em atencao", detalhe.attention, 1);
  check("conta as entregas travadas", detalhe.blocked, 1);
  check("conta as entregas SEM resposta", detalhe.pending, 1);

  // A semana de teste é a mais nova entre as quatro, mas o período dela é de
  // 2019: sem semana posterior entre elas, ela abre. Na máquina do dev existem
  // semanas de 2026 DEPOIS dela — por isso esta asserção não afirma `fechada`,
  // que dependeria do que mais há no banco. A regra tem prova própria e
  // determinística nas asserções puras de `relatorio-semanal-math.ts`.
  check("a ficha responde se a semana fechou", typeof detalhe.fechada, "boolean");
}

main()
  .catch((e) => {
    console.log("ERRO: " + String(e?.message ?? e).split("\n").slice(0, 4).join(" | "));
    falhas++;
  })
  .finally(async () => {
    await limpar();
    await prisma.$disconnect();
    if (falhas > 0) {
      console.log(`\n${falhas} checagem(ns) falharam.`);
      process.exit(1);
    }
    console.log("relatorio-semanal-leitura: todas as checagens passaram.");
  });
