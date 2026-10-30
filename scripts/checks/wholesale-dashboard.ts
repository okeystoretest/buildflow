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
  agrupaPorMotivo,
  agrupaPorVendedora,
  bucketsDeMes,
  escopoDoAtor,
  taxaDeConversao,
} from "../../src/lib/wholesale-dashboard";
import { filtroDePeriodo, marcaValida, mesVigente } from "../../src/lib/wholesale-queries";
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

// --- marca ------------------------------------------------------------------
// A marca chega da query string, então é texto livre. Valor desconhecido tem
// de virar `undefined` (painel e lista sem o filtro): repassado ao Prisma ele
// derrubaria a tela por erro de validação, e virar lista vazia faria um
// `?brand=OKEI` digitado errado parecer "nenhuma candidatura da OKEY".
check("marca real passa", marcaValida("OKEY"), "OKEY");
check("a outra marca também", marcaValida("LOV_CLUB"), "LOV_CLUB");
check("marca inventada é ignorada", marcaValida("OKEI"), undefined);
check("vazio é ignorado", marcaValida(""), undefined);
check("ausente é ignorado", marcaValida(undefined), undefined);
// Minúscula NÃO é aceita: o enum do banco é maiúsculo, e aceitar aqui faria o
// filtro funcionar na URL e falhar no Prisma.
check("caixa diferente é ignorada", marcaValida("okey"), undefined);

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

// --- conversão por vendedora ------------------------------------------------
// O painel "Taxa de conversão por vendedora" soma linhas
// (vendedora × estado de compra) do groupBy. Dois erros moram aqui: contar o
// estado errado no numerador e perder a linha sem dona, que tem
// `sellerId: null` e também aparece no painel.
//
// O NUMERADOR É COMPROU, e só ele. O painel por vendedora falava de APROVAÇÃO
// até 29/10/2026, e esta é a diferença que os checks abaixo prendem: uma
// vendedora com três aprovadas e nenhuma venda converteu ZERO.
//
// AGRUPA POR `purchaseState` desde 30/10/2026, não por status: toda candidatura
// tem um (a coluna é NOT NULL com default CADENCIA), então o `total` continua
// sendo tudo que ela recebeu — inclusive o que nem foi analisado, que entra
// como CADENCIA.
const linha = (sellerId: string | null, purchaseState: string, n: number) =>
  ({ sellerId, purchaseState, _count: { _all: n } }) as Parameters<
    typeof agrupaPorVendedora
  >[0][number];

const nomes = new Map([
  ["v1", "Ana"],
  ["v2", "Bia"],
]);
const grupos = agrupaPorVendedora(
  [
    // Um par (vendedora, estado) por linha, como o groupBy devolve.
    linha("v1", "CADENCIA", 4),
    linha("v1", "NAO_COMPROU", 1),
    linha("v2", "CADENCIA", 2),
    linha(null, "CADENCIA", 1),
    linha("v9", "CADENCIA", 1),
  ],
  nomes,
);

check(
  "uma linha por vendedora, ordenada por volume",
  grupos.map((g) => `${g.nome}:${g.comprou}/${g.total}=${g.conversao}`),
  ["Ana:0/5=0", "Bia:0/2=0", "Sem vendedora:0/1=0", "Vendedora removida:0/1=0"],
);

// SÓ COMPROU CONTA NO NUMERADOR, e este é o check que separa as duas taxas.
//
// Aqui Ana tem 2 que compraram em 5 recebidas: 2/5 = 40%. As outras 3 estão em
// cadência ou marcadas como não-compra, e nenhuma delas é venda. Somar
// cadência ao numerador dá um número maior e igualmente plausível na tela, que
// é o que faz esse defeito sobreviver a uma revisão.
check(
  "cadência e não-compra não entram na conversão",
  agrupaPorVendedora(
    [
      linha("v1", "CADENCIA", 2),
      linha("v1", "COMPROU", 2),
      linha("v1", "NAO_COMPROU", 1),
    ],
    nomes,
  ).map((g) => `${g.nome}:${g.comprou}/${g.total}=${g.conversao}`),
  ["Ana:2/5=40"],
);
// Todas compraram: 100%.
check(
  "só compraram: conversão é 100%",
  agrupaPorVendedora([linha("v1", "COMPROU", 3)], nomes).map((g) => g.conversao),
  [100],
);
// Nenhuma venda: conversão ZERO, mesmo que as três estejam aprovadas e em
// cadência. É o caso que a taxa de aprovação mostraria como 100% — as duas
// contas respondem perguntas diferentes, e o painel por vendedora responde a
// da venda.
check(
  "só em cadência: conversão é 0",
  agrupaPorVendedora([linha("v1", "CADENCIA", 3)], nomes).map((g) => g.conversao),
  [0],
);
// "NÃO COMPROU" É DENOMINADOR, NÃO NUMERADOR, e também não desaparece.
//
// Marcar à mão que a lojista não comprou não pode tirá-la das recebidas: a
// conversão é compraram ÷ RECEBIDAS, e sumir com o denominador faria a taxa
// SUBIR quando alguém registra uma venda perdida — o indicador melhoraria
// justamente ao receber má notícia.
check(
  "não-compra fica no denominador",
  agrupaPorVendedora(
    [linha("v1", "COMPROU", 1), linha("v1", "NAO_COMPROU", 3)],
    nomes,
  ).map((g) => `${g.comprou}/${g.total}=${g.conversao}`),
  ["1/4=25"],
);
// Nenhuma venda em `grupos`: o numerador é zero mesmo com 5 recebidas.
check("sem COMPROU, o numerador é zero", grupos[0].comprou, 0);
// `null` não pode ser descartado nem casar com outra vendedora: é a candidatura
// que chegou pelo link geral sem dona, e o painel precisa mostrá-la.
check("a linha sem dona sobrevive", grupos.find((g) => g.sellerId === null)?.total, 1);
// Vendedora que saiu da equipe não sai do histórico dela.
check("id sem nome não vira linha anônima", grupos[3].nome, "Vendedora removida");
check("sem linhas, sem painel", agrupaPorVendedora([], nomes), []);

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

// --- reprovacoes por motivo -------------------------------------------------
// Substituiu "Ultimas candidaturas" no painel em 22/10/2026. O que esta em jogo
// e a ORDEM (quem le um painel age sobre as primeiras linhas, e a tela mostra
// oito dos 34 motivos) e o motivo NULO: escondido, as parcelas nao fechariam com
// o total de reprovacoes, e diferenca inexplicada num painel e pior que linha a
// mais.
const motivos = agrupaPorMotivo([
  { rejectionCode: "02", _count: { _all: 3 } },
  { rejectionCode: null, _count: { _all: 5 } },
  { rejectionCode: "01", _count: { _all: 9 } },
  { rejectionCode: "03", _count: { _all: 3 } },
]);
check("motivo mais frequente vem primeiro", motivos[0].total, 9);
check("ordena do maior para o menor", motivos.map((m) => m.total), [9, 5, 3, 3]);
// Empate desempatado pelo codigo: sem criterio, a ordem mudaria a cada leitura e
// o painel pareceria instavel sem nada ter mudado.
check("empate e desempatado pelo codigo", [motivos[2].code, motivos[3].code], ["02", "03"]);
check("rotulo traz codigo e texto", motivos[0].rotulo, "01 — Sem CNPJ");
check("reprovada sem codigo aparece como linha", motivos[1].rotulo, "Sem código");
check("nada reprovado devolve lista vazia", agrupaPorMotivo([]), []);
// Codigo que saiu da taxonomia: mostrar o cru e mais honesto que sumir com a linha.
check(
  "codigo desconhecido nao some do painel",
  agrupaPorMotivo([{ rejectionCode: "99", _count: { _all: 1 } }])[0].rotulo,
  "99 — motivo desconhecido",
);
// As parcelas TEM de fechar com o total: e a conta que o painel mostra ao lado
// de cada linha, em percentual.
check("as parcelas somam o total de reprovacoes", motivos.reduce((n, m) => n + m.total, 0), 20);

// --- o recorte PADRAO: o mes vigente ----------------------------------------
// Entrou em 30/10/2026: a tela abria no acumulado de todo o historico. O que
// esta em jogo aqui e o FUSO. `filtroDePeriodo` monta as pontas como meia-noite
// LOCAL (`new Date("2026-10-01T00:00:00")`), e `mesVigente` tem de falar a mesma
// lingua: montado em UTC, o recorte andaria tres horas no Brasil e a candidatura
// que chegou as 22h do dia 31 cairia fora do mes dela — sem erro nenhum para
// denunciar isso, so um numero menor no painel.
check(
  "outubro de 2026 vai do dia 1 ao 31",
  mesVigente(new Date(2026, 9, 19, 12, 0)),
  { de: "2026-10-01", ate: "2026-10-31" },
);
// Dia 0 do mes seguinte e o ultimo do atual: fevereiro sai certo sem tabela.
check("fevereiro de ano bissexto termina no 29", mesVigente(new Date(2024, 1, 10)).ate, "2024-02-29");
check("fevereiro comum termina no 28", mesVigente(new Date(2025, 1, 10)).ate, "2025-02-28");
// Dezembro: `new Date(ano, 12, 0)` vira o ultimo dia de dezembro, nao janeiro.
check(
  "dezembro nao vaza para o ano seguinte",
  mesVigente(new Date(2026, 11, 3)),
  { de: "2026-12-01", ate: "2026-12-31" },
);
// O mes vigente no primeiro e no ultimo instante do mes e o MESMO mes.
check(
  "primeiro e ultimo dia caem no mesmo recorte",
  [mesVigente(new Date(2026, 9, 1, 0, 1)), mesVigente(new Date(2026, 9, 31, 23, 59))],
  [
    { de: "2026-10-01", ate: "2026-10-31" },
    { de: "2026-10-01", ate: "2026-10-31" },
  ],
);
// A asserção que o fuso quebraria: 22h30 do dia 31 e DESTE mes.
const outubro = mesVigente(new Date(2026, 9, 15));
const janela = filtroDePeriodo(outubro.de, outubro.ate).createdAt as { gte: Date; lte: Date };
const noiteDoDia31 = new Date(2026, 9, 31, 22, 30);
const primeiroInstante = new Date(2026, 9, 1, 0, 0, 0);
check(
  "22h30 do ultimo dia ainda esta no mes",
  janela.gte <= noiteDoDia31 && noiteDoDia31 <= janela.lte,
  true,
);
check(
  "a meia-noite do dia 1 tambem esta",
  janela.gte <= primeiroInstante && primeiroInstante <= janela.lte,
  true,
);
// E o que esta fora, fica fora: o dia 1 do mes seguinte nao entra.
const mesSeguinte = new Date(2026, 10, 1, 0, 30);
check("o mes seguinte nao entra", mesSeguinte <= janela.lte, false);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("wholesale-dashboard: todas as checagens passaram.");
