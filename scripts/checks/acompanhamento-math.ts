// Checagem da GRADE do Acompanhamento Gerencial (Comercial).
// Rodar com: npx tsx scripts/checks/acompanhamento-math.ts
//
// O que esta em jogo: cinco contas que erram EM SILENCIO numa tela de 12x5
// celulas, onde ninguem confere a mao.
//   - divisao por zero (mes sem pedido, mes anterior zerado, loja sem meta);
//   - "0" exibido no lugar de "nao houve" (P.A. de um mes sem atendimento);
//   - o recorte do mes no fuso do negocio: a venda das ultimas horas do dia 31
//     tem de ficar no mes dela, nao no seguinte;
//   - o realizado da loja tem de ser EXATAMENTE a soma das linhas exibidas,
//     senao a tela se contradiz sozinha;
//   - o ajuste manual do Ranking tem de valer aqui tambem, ou as duas telas
//     mostram faturamentos diferentes para o mesmo mes.
import {
  montarGrade,
  pctDaMeta,
  paDoMes,
  variacaoMensal,
  faixaDeAtingimento,
} from "../../src/lib/acompanhamento-math";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

// --- as tres contas isoladas -----------------------------------------------

check("pct sem meta e null", pctDaMeta(5000, null), null);
check("pct com meta zero e null", pctDaMeta(5000, 0), null);
check("pct normal", pctDaMeta(4650, 5000), 0.93);
check("P.A. sem pedido e null, nao zero", paDoMes(0, 0), null);
check("P.A. normal", paDoMes(21, 10), 2.1);
check("variacao com mes anterior zerado e null", variacaoMensal(10000, 0), null);
check("variacao normal", variacaoMensal(150, 100), 0.5);
check("variacao negativa", variacaoMensal(50, 100), -0.5);

// --- a grade ----------------------------------------------------------------

// 15:00 UTC = 12:00 em Brasilia: dia sem ambiguidade de fuso.
const dia = (mes: number, d: number) =>
  new Date(`2026-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}T15:00:00.000Z`);

const vendedoras = [
  { id: "ana", nome: "Ana" },
  { id: "bia", nome: "Bia" },
];

// CLIENTES, montadas para cair na armadilha do "positivados":
//   - Ana atende a cliente c1 DUAS vezes em janeiro (conta UMA);
//   - Bia atende a MESMA c1 em janeiro (a loja ainda conta UMA).
// Soma das linhas em janeiro = 2 (Ana) + 1 (Bia) = 3. A loja tem 2.
const pedidos = [
  // Janeiro: Ana 3 pedidos, 12 pecas; Bia 1 pedido, 2 pecas.
  { sellerId: "ana", orderValue: 10000, pecas: 5, createdAt: dia(1, 5), customerId: "c1" },
  { sellerId: "ana", orderValue: 5000, pecas: 4, createdAt: dia(1, 10), customerId: "c1" },
  { sellerId: "ana", orderValue: 5000, pecas: 3, createdAt: dia(1, 20), customerId: "c2" },
  { sellerId: "bia", orderValue: 8000, pecas: 2, createdAt: dia(1, 15), customerId: "c1" },
  // Fevereiro: so Ana, 1 pedido.
  { sellerId: "ana", orderValue: 30000, pecas: 10, createdAt: dia(2, 3), customerId: "c3" },
  // Pedido de quem NAO e da loja: tem de ser ignorado (inclusive a cliente).
  { sellerId: "carla", orderValue: 99999, pecas: 50, createdAt: dia(1, 7), customerId: "c9" },
];

const grade = montarGrade({
  year: 2026,
  pedidos,
  vendedoras,
  metasIndividuais: [
    { userId: "ana", month: 1, amount: 15000 },
    { userId: "bia", month: 1, amount: 10000 },
    // Fevereiro: ninguem tem meta individual cadastrada.
  ],
  metasLoja: [{ month: 1, amount: 25000 }],
  ajustes: [],
  // Duas devolucoes em fevereiro e uma em marco. A de fevereiro de valor 500
  // devolve um pedido de JANEIRO: ela conta em fevereiro, que e quando entrou
  // de volta.
  devolucoes: [
    { createdAt: dia(2, 4), valor: 500, pecas: 2 },
    { createdAt: dia(2, 20), valor: 1500, pecas: 3 },
    { createdAt: dia(3, 1), valor: 700, pecas: 1 },
  ],
});

check("grade tem 12 meses de loja", grade.loja.length, 12);
check("realizado da loja em janeiro", grade.loja[0].realizado, 28000);
check("pedido de fora da loja e ignorado", grade.totalRealizado, 58000);
check("meta da loja em janeiro", grade.loja[0].meta, 25000);
check("soma das metas individuais de janeiro", grade.somaMetasIndividuais[0], 25000);
check("mes sem meta de loja fica null", grade.loja[1].meta, null);
check("mes sem meta de loja nao tem pct", grade.loja[1].pct, null);
check("P.A. da loja em janeiro", grade.loja[0].pa, 14 / 4);
check("mes sem pedido tem P.A. null", grade.loja[2].pa, null);
check("mes sem pedido tem realizado 0", grade.loja[2].realizado, 0);
check("janeiro nao compara com mes anterior", grade.loja[0].vsAnterior, null);
check("fevereiro compara com janeiro", grade.loja[1].vsAnterior, (30000 - 28000) / 28000);
check("marco zerado contra fevereiro", grade.loja[2].vsAnterior, -1);

// --- CLIENTES POSITIVADOS ---------------------------------------------------
//
// A conta que mais erra em silencio: `clientes` e um CONJUNTO, nao uma soma.
check("cliente atendida duas vezes conta UMA vez", grade.vendedoras.find((v) => v.userId === "ana")!.meses[0].clientes, 2);
check("Bia tem uma cliente em janeiro", grade.vendedoras.find((v) => v.userId === "bia")!.meses[0].clientes, 1);
check("clientes da loja em janeiro", grade.loja[0].clientes, 2);

// A ARMADILHA, cravada: somar as linhas daria 3 e a verdade sao 2, porque a
// cliente c1 foi atendida pela Ana E pela Bia no mesmo mes. Se alguem trocar a
// contagem da loja por uma soma, esta linha fica vermelha.
check(
  "clientes da loja NAO e a soma das vendedoras",
  grade.loja[0].clientes !== grade.vendedoras.reduce((a, v) => a + v.meses[0].clientes, 0),
  true,
);
check("mes sem pedido tem 0 clientes", grade.loja[2].clientes, 0);
check("cliente de quem nao e da loja nao entra", grade.loja[0].clientes, 2);

// CLIENTES DO ANO: c1 e c2 em janeiro, c3 em fevereiro. c1 aparece nos dois
// pedidos de janeiro e no da Bia — uma cliente. Total do ano = 3.
// Somar os meses daria 2 (jan) + 1 (fev) = 3 por coincidencia aqui, entao a
// assercao que PEGA o erro e a de baixo, com cliente repetida entre meses.
check("clientes do ano", grade.clientesNoAno, 3);

const clienteEmDoisMeses = montarGrade({
  year: 2026,
  pedidos: [
    { sellerId: "ana", orderValue: 100, pecas: 1, createdAt: dia(3, 5), customerId: "c1" },
    { sellerId: "ana", orderValue: 100, pecas: 1, createdAt: dia(8, 5), customerId: "c1" },
  ],
  vendedoras: [{ id: "ana", nome: "Ana" }],
  metasIndividuais: [],
  metasLoja: [],
  ajustes: [],
});
// A mesma cliente em marco E em agosto: dois meses com 1 cliente cada, mas UMA
// cliente no ano. Somar os doze meses daria 2 — e e isso que esta linha impede.
check("cliente que compra em dois meses conta uma vez no ano", clienteEmDoisMeses.clientesNoAno, 1);
check("e continua contando 1 em cada mes", clienteEmDoisMeses.loja[2].clientes, 1);

// --- DEVOLUCOES -------------------------------------------------------------
check("devolucoes tem 12 meses", grade.devolucoesLoja.length, 12);
check("janeiro sem devolucao", grade.devolucoesLoja[0].qtd, 0);
check("duas devolucoes em fevereiro", grade.devolucoesLoja[1].qtd, 2);
check("valor devolvido em fevereiro", grade.devolucoesLoja[1].valor, 2000);
check("pecas devolvidas em fevereiro", grade.devolucoesLoja[1].pecas, 5);
check("devolucao de marco nao vaza para fevereiro", grade.devolucoesLoja[2].qtd, 1);
check("mes sem devolucao soma 0, nao NaN", grade.devolucoesLoja[5].valor, 0);

// A INVARIANTE DA TELA: o realizado da loja e a soma das linhas exibidas.
for (const c of grade.loja) {
  const soma = grade.vendedoras.reduce((a, v) => a + v.meses[c.month - 1].realizado, 0);
  check(`loja fecha com as linhas no mes ${c.month}`, c.realizado, soma);
}

// Ordem: maior entrega do ano primeiro.
check("ordenado pelo realizado do ano", grade.vendedoras.map((v) => v.userId), ["ana", "bia"]);

const ana = grade.vendedoras.find((v) => v.userId === "ana")!;
const bia = grade.vendedoras.find((v) => v.userId === "bia")!;
check("Ana bateu a meta de janeiro", ana.meses[0].pct, 20000 / 15000);
check("P.A. da Ana em janeiro", ana.meses[0].pa, 12 / 3);
check("Bia sem pedido em fevereiro: P.A. null", bia.meses[1].pa, null);
check("Bia sem meta em fevereiro: meta null", bia.meses[1].meta, null);
check("vendedora com meta em algum mes nao conta como sem meta", grade.vendedorasSemMeta, 0);

// --- vendedora SEM meta nenhuma entra no realizado da loja -----------------
//
// E a diferenca deliberada com o Ranking (que descarta quem nao tem meta):
// aqui a venda real da loja nao pode desaparecer porque ninguem cadastrou a
// meta da pessoa.
const comSemMeta = montarGrade({
  year: 2026,
  pedidos,
  vendedoras,
  metasIndividuais: [{ userId: "ana", month: 1, amount: 15000 }],
  metasLoja: [{ month: 1, amount: 25000 }],
  ajustes: [],
});
check("venda de quem nao tem meta soma na loja", comSemMeta.loja[0].realizado, 28000);
check("conta quantas vendedoras estao sem meta", comSemMeta.vendedorasSemMeta, 1);
check("linha sem meta aparece com meta null", comSemMeta.vendedoras.find((v) => v.userId === "bia")!.meses[0].meta, null);

// --- ajuste manual do Ranking vale aqui tambem ------------------------------
//
// Ajuste incremental: o valor digitado responde pelo periodo ate o corte, e o
// faturado posterior SOMA sobre ele. Corte no dia 12 de janeiro => os pedidos
// de Ana dos dias 5 e 10 sao substituidos pelos 50.000 digitados, e o do dia
// 20 (5.000) soma.
const comAjuste = montarGrade({
  year: 2026,
  pedidos,
  vendedoras,
  metasIndividuais: [
    { userId: "ana", month: 1, amount: 15000 },
    { userId: "bia", month: 1, amount: 10000 },
  ],
  metasLoja: [{ month: 1, amount: 25000 }],
  ajustes: [{ userId: "ana", month: 1, amount: 50000, corte: dia(1, 12) }],
});
const anaAjustada = comAjuste.vendedoras.find((v) => v.userId === "ana")!;
check("ajuste incremental na linha da vendedora", anaAjustada.meses[0].realizado, 55000);
check("ajuste entra no realizado da loja", comAjuste.loja[0].realizado, 63000);
check("ajuste nao mexe no P.A. (pecas sao pecas)", anaAjustada.meses[0].pa, 12 / 3);
check("ajuste de janeiro nao vaza para fevereiro", anaAjustada.meses[1].realizado, 30000);

// --- fuso do negocio: a virada do mes ---------------------------------------
//
// 01/02/2026 as 01:00 UTC = 31/01/2026 as 22:00 em Brasilia. A venda e de
// JANEIRO. Com `new Date(...).getMonth()` num servidor em UTC, cairia em
// fevereiro — o erro que `janelaDoMes` existe para impedir.
const viradaDoMes = montarGrade({
  year: 2026,
  pedidos: [
    {
      sellerId: "ana",
      orderValue: 1000,
      pecas: 1,
      createdAt: new Date("2026-02-01T01:00:00.000Z"),
      customerId: "c1",
    },
  ],
  vendedoras: [{ id: "ana", nome: "Ana" }],
  metasIndividuais: [],
  metasLoja: [],
  ajustes: [],
  // A devolucao corre o MESMO risco de fuso do pedido, e pela mesma janela.
  devolucoes: [{ createdAt: new Date("2026-02-01T01:00:00.000Z"), valor: 300, pecas: 1 }],
});
check("venda das 22h do dia 31 fica em janeiro", viradaDoMes.loja[0].realizado, 1000);
check("fevereiro nao recebe a venda de janeiro", viradaDoMes.loja[1].realizado, 0);
check("cliente da venda da virada conta em janeiro", viradaDoMes.loja[0].clientes, 1);
check("devolucao das 22h do dia 31 fica em janeiro", viradaDoMes.devolucoesLoja[0].qtd, 1);
check("fevereiro nao recebe a devolucao de janeiro", viradaDoMes.devolucoesLoja[1].qtd, 0);

// --- loja vazia: a tela abre sem explodir -----------------------------------
const vazia = montarGrade({
  year: 2026,
  pedidos: [],
  vendedoras: [],
  metasIndividuais: [],
  metasLoja: [],
  ajustes: [],
});
check("loja sem vendedora tem 12 meses zerados", vazia.loja.map((c) => c.realizado), new Array(12).fill(0));
check("loja vazia nao tem total", vazia.totalRealizado, 0);
check("loja vazia nao tem linha", vazia.vendedoras.length, 0);

// --- faixa de cor por atingimento ------------------------------------------
// As bordas sao o pedido do dono em percentual inteiro; errar um `>=` por um
// centesimo pinta de amarelo a linha que bateu 67% e ninguem confere a mao.
check("sem meta nao tem faixa", faixaDeAtingimento(null), null);
check("zero e vermelho", faixaDeAtingimento(0), "vermelho");
check("33% e vermelho", faixaDeAtingimento(0.33), "vermelho");
check("borda de baixo do amarelo", faixaDeAtingimento(0.34), "amarelo");
check("66% e amarelo", faixaDeAtingimento(0.66), "amarelo");
check("borda de baixo do azul", faixaDeAtingimento(0.67), "azul");
check("99% e azul", faixaDeAtingimento(0.99), "azul");
check("99,6% NAO e verde, mesmo exibindo 100%", faixaDeAtingimento(0.996), "azul");
check("meta exata e verde", faixaDeAtingimento(1), "verde");
check("acima da meta e verde", faixaDeAtingimento(2.5), "verde");

console.log(falhas === 0 ? "acompanhamento-math: OK" : `acompanhamento-math: ${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
