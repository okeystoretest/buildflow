/**
 * Checagem do dashboard da Análise de Clientes.
 *
 * Duas coisas, e a primeira é segurança: o ESCOPO. O painel soma a base, e a
 * única linha que impede uma vendedora de ver "28 recebidas, 19 aprovadas" da
 * equipe inteira é o `sellerId` entrar no where. Um painel que vaza não dá
 * erro nenhum — ele só mostra números maiores.
 *
 * A segunda é a CONTA da conversão, que a especificação define estritamente
 * como aprovadas ÷ total recebido. A outra leitura (aprovadas ÷ decididas) dá
 * um número maior e igualmente plausível na tela, e é por isso que ela precisa
 * estar presa aqui.
 *
 * Rode com: npx tsx scripts/checks/wholesale-dashboard.ts
 */
import {
  MAX_MESES_NO_GRAFICO,
  MESES_NO_GRAFICO,
  bucketsDeMes,
  escopoDoAtor,
  taxaDeConversao,
} from "../../src/lib/wholesale-dashboard";
import { filtroDePeriodo } from "../../src/lib/wholesale-queries";
import type { WholesaleActor } from "../../src/lib/wholesale-permissions";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  console.log(`${ok ? "ok" : "FALHOU"} ${nome}`);
  if (!ok) {
    falhas++;
    console.log(`  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

// --- escopo -----------------------------------------------------------------
const gestao: WholesaleActor = { userId: "g1", role: "GESTAO", salesModel: "ATACADO" };
const vendedora: WholesaleActor = { userId: "v1", role: "VENDAS", salesModel: "ATACADO" };

check("Gestão soma a base inteira", escopoDoAtor(gestao), {});
check("vendedora é presa ao próprio id", escopoDoAtor(vendedora), { sellerId: "v1" });
// Em Prisma, `sellerId: undefined` NÃO filtra: se o id sumir do ator, a chave
// precisa continuar existindo para a consulta não virar "tudo".
check("o escopo da vendedora sempre traz a chave", "sellerId" in escopoDoAtor(vendedora), true);

// --- conversão --------------------------------------------------------------
check("aprovadas ÷ total recebido", taxaDeConversao(19, 28), 67.9);
check("metade é 50%", taxaDeConversao(5, 10), 50);
check("nenhuma aprovada é 0%", taxaDeConversao(0, 10), 0);
check("todas aprovadas é 100%", taxaDeConversao(10, 10), 100);
// Base zero não pode virar NaN: seria o que a tela mostraria no primeiro dia.
check("base zero é 0, não NaN", taxaDeConversao(0, 0), 0);
// O denominador é o TOTAL, não as decididas: com 2 aprovadas, 2 reprovadas e
// 6 em análise, a resposta é 20% — não 50%.
check("as em análise contam no denominador", taxaDeConversao(2, 10), 20);

// --- meses do gráfico -------------------------------------------------------
const meses = bucketsDeMes(new Date("2026-10-19T12:00:00.000Z"));
check("são os N meses configurados", meses.length, MESES_NO_GRAFICO);
check("o último é o mês corrente", meses[meses.length - 1].chave, "2026-10");
check("do mais antigo ao mais novo", meses.map((m) => m.chave), [
  "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10",
]);
check("todo mês nasce zerado", meses.every((m) => m.total === 0), true);
check("cada mês tem rótulo", meses.every((m) => m.rotulo.length > 0), true);

// A virada do ano é onde um cálculo de mês quebra: subtrair meses de janeiro
// precisa voltar para o ano anterior, não produzir mês 0 ou -1.
const viraAno = bucketsDeMes(new Date("2026-01-15T12:00:00.000Z"));
check("a virada do ano volta corretamente", viraAno.map((m) => m.chave), [
  "2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01",
]);

// Dia 31 não pode "vazar" para o mês seguinte ao recuar os meses.
check(
  "fim de mês não desloca os buckets",
  bucketsDeMes(new Date("2026-03-31T23:00:00.000Z")).map((m) => m.chave),
  ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03"],
);

// --- período -----------------------------------------------------------------
check("sem período, nenhum filtro de data", filtroDePeriodo("", ""), {});
check("sem período (undefined) também", filtroDePeriodo(), {});
// O último dia escolhido ENTRA. Com `lte` na meia-noite, "até 19/10" perderia
// tudo que chegou no dia 19 — e quem escolhe a data final está incluindo o dia.
check(
  "a data final fecha às 23:59:59",
  (filtroDePeriodo("2026-10-01", "2026-10-19").createdAt as { lte: Date }).lte.getHours(),
  23,
);
check(
  "só o início também filtra",
  Object.keys(filtroDePeriodo("2026-10-01").createdAt as object),
  ["gte"],
);
check(
  "só o fim também filtra",
  Object.keys(filtroDePeriodo(undefined, "2026-10-19").createdAt as object),
  ["lte"],
);

const agora = new Date("2026-10-19T12:00:00.000Z");

// --- a janela do gráfico acompanha o período ---------------------------------
const hoje = agora;

// Um gráfico preso em 6 meses ao lado de KPIs filtrados por outro intervalo são
// dois números diferentes na mesma tela.
check(
  "com período, a janela é a do período",
  bucketsDeMes(hoje, "2026-07-10", "2026-09-20").map((m) => m.chave),
  ["2026-07", "2026-08", "2026-09"],
);
check(
  "período dentro de um mês só dá uma coluna",
  bucketsDeMes(hoje, "2026-08-02", "2026-08-28").map((m) => m.chave),
  ["2026-08"],
);
check(
  "só o início: vai até o mês corrente",
  bucketsDeMes(hoje, "2026-08-01").map((m) => m.chave),
  ["2026-08", "2026-09", "2026-10"],
);
// Cinco anos não podem virar sessenta colunas de dois pixels.
const longo = bucketsDeMes(hoje, "2021-01-01", "2026-10-19");
check("período longo é cortado no teto", longo.length, MAX_MESES_NO_GRAFICO);
check("o corte mantém os mais RECENTES", longo[longo.length - 1].chave, "2026-10");
// Período invertido não pode gerar lista vazia nem laço infinito.
check(
  "período invertido cai no mês final",
  bucketsDeMes(hoje, "2026-09-01", "2026-03-01").map((m) => m.chave),
  ["2026-03"],
);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("wholesale-dashboard: todas as checagens passaram.");
