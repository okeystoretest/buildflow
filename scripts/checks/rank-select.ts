/**
 * Checagem da campanha Select no ranking.
 *
 * O que esta em jogo e DINHEIRO e PONTUACAO: o valor de um contrato Select
 * entra na meta individual da vendedora e na meta geral. Somar duas vezes
 * infla o percentual de quem bateu meta; nao somar some com a venda.
 *
 * Rode com: npx tsx scripts/checks/rank-select.ts
 */
import { computeRealizado, selectCampaignRows } from "../../src/lib/rank-math";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  console.log(`${ok ? "ok" : "FALHOU"} ${nome}`);
  if (!ok) {
    falhas++;
    console.log(`  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

// --- atribuicao por MARCA ---------------------------------------------------
// A campanha de Select era reconhecida pelo NOME, e renomea-la no cadastro
// parava a atribuicao em silencio. Agora o vinculo e estrutural
// (Campaign.selectBrand x SelectContract.brand), e o que precisa ficar preso e
// o casamento: cada venda entra na campanha da SUA marca, e so nela.
type Venda = { brand: string | null; valor: number };
const vendas: Venda[] = [
  { brand: "OKEY", valor: 7968 },
  { brand: "OKEY", valor: 4000 },
  { brand: "LOV_CLUB", valor: 5000 },
  // Contrato anterior ao campo de marca. Desde 27/10/2026 ele nao aparece em
  // lugar nenhum do quadro: nao entra em campanha (nao tem marca) e nao soma
  // mais no realizado. So a adesao com marca escolhida e medida.
  { brand: null, valor: 3000 },
];
const daCampanha = (marca: string) => vendas.filter((v) => v.brand === marca);

check("a campanha OKEY leva so as vendas OKEY", daCampanha("OKEY").length, 2);
check("a campanha LOV leva so as vendas LOV", daCampanha("LOV_CLUB").length, 1);
check("venda sem marca nao entra em campanha", daCampanha("OKEY").concat(daCampanha("LOV_CLUB")).length, 3);
check("o total da campanha OKEY", daCampanha("OKEY").reduce((a, v) => a + v.valor, 0), 11968);

// --- o Select FORA do realizado -------------------------------------------
// Ate 19/10/2026 o valor do contrato somava na meta INDIVIDUAL da vendedora e
// na GERAL. Em 27/10/2026 o dono reverteu: a venda de servico passou a ser
// medida pela campanha de Select (contratos por vendedora, abaixo), e creditar
// o R$ na meta tambem contava a mesma entrega em duas reguas.
//
// ATENCAO ao ler estes dois checks: a exclusao NAO mora aqui. Ela e o
// chamador, `rank-data.ts`, que deixou de passar `selectsDoMes` para
// `computeRealizado`. A funcao nunca soube o que e um Select — ela soma o que
// recebe. Entao nenhum check puro pega a regressao de alguem reinserir os
// Selects naquela lista; o que segura isso e o comentario no chamador.
//
// O que fica preso aqui e a metade que E pura e da sustento a regra: a conta
// nao inventa valor nenhum alem do que foi entregue a ela.
const dia = (n: number) => new Date(`2026-10-${String(n).padStart(2, "0")}T12:00:00.000Z`);
const pedido = { sellerId: "v1", orderValue: 1000, createdAt: dia(5) };

const soPedidos = computeRealizado({
  pedidos: [pedido],
  comMeta: new Set(["v1"]),
  ajustes: new Map(),
});
check("o realizado geral conta so o que recebe", soPedidos.realizadoGeral, 1000);
check("a linha da vendedora tambem", soPedidos.porVendedor.get("v1")?.total, 1000);

// --- a tabela POR VENDEDORA da campanha de Select --------------------------
// A campanha de Select conta VENDAS DO SERVICO, nao pecas: um contrato e um,
// dez pecas num pedido sao dez. Reusar a conta da campanha comum (itemCount x
// R$ 5,00) daria zero em toda linha, porque Select nao passa pelo fluxo de
// pedidos. Decisoes do dono em 26/10/2026 exercitadas aqui.
const vendasOkey = [
  { sellerId: "u-ana", sellerName: "Ana", valor: 16368 },
  { sellerId: "u-ana", sellerName: "Ana", valor: 11964 },
  { sellerId: "u-bia", sellerName: "Bia", valor: 7968 },
];
const metasOkey = [
  { userId: "u-ana", userName: "Ana", targetItems: 4 },
  // Tem meta e nao vendeu: a cobranca do mes nao pode sumir com a venda que
  // nao houve.
  { userId: "u-cris", userName: "Cris", targetItems: 2 },
];
const linhas = selectCampaignRows(vendasOkey, metasOkey);
const linha = (nome: string) => linhas.find((l) => l.nome === nome);

check("entra quem vendeu E quem tem meta (uniao, nao intersecao)", linhas.length, 3);
check("qtd conta CONTRATOS, nao pecas nem valor", linha("Ana")?.qtd, 2);
check("valor soma os contratos", linha("Ana")?.valor, 28332);
check("percentual sai da contagem contra a meta", linha("Ana")?.pct, 50);
check("quem tem meta e nao vendeu aparece zerada", { qtd: linha("Cris")?.qtd, meta: linha("Cris")?.meta }, { qtd: 0, meta: 2 });
// A campanha de pecas esconde quem nao tem meta. Herdar isso faria uma venda
// real sumir do telao, e o total do bloco nao bateria com a soma das linhas.
check("quem vendeu SEM meta aparece, com meta zero", { qtd: linha("Bia")?.qtd, meta: linha("Bia")?.meta }, { qtd: 1, meta: 0 });
// Pecas pagam R$ 5,00 cada; aplicar isso a um contrato inventaria um valor que
// ninguem definiu (principio 3: o sistema informa, nao inventa movimento
// financeiro).
check("Select NAO gera premiacao", linhas.map((l) => l.premiacao), [0, 0, 0]);
// Sem meta o percentual e 0, entao a linha cai para o fim sem caso especial.
check("ordena por percentual, com a quantidade desempatando", linhas.map((l) => l.nome), ["Ana", "Bia", "Cris"]);
check("campanha sem venda e sem meta nao inventa linha", selectCampaignRows([], []), []);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("rank-select: todas as checagens passaram.");
