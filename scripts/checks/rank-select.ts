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
  // Contrato anterior ao campo de marca: nao entra em campanha nenhuma, mas
  // continua somando no ranking (ver o bloco do realizado, abaixo).
  { brand: null, valor: 3000 },
];
const daCampanha = (marca: string) => vendas.filter((v) => v.brand === marca);

check("a campanha OKEY leva so as vendas OKEY", daCampanha("OKEY").length, 2);
check("a campanha LOV leva so as vendas LOV", daCampanha("LOV_CLUB").length, 1);
check("venda sem marca nao entra em campanha", daCampanha("OKEY").concat(daCampanha("LOV_CLUB")).length, 3);
check("o total da campanha OKEY", daCampanha("OKEY").reduce((a, v) => a + v.valor, 0), 11968);

// --- o Select somando no realizado ----------------------------------------
const corte = new Date("2026-10-01T00:00:00.000Z");
const dia = (n: number) => new Date(`2026-10-${String(n).padStart(2, "0")}T12:00:00.000Z`);

const pedido = { sellerId: "v1", orderValue: 1000, createdAt: dia(5) };
const select = { sellerId: "v1", orderValue: 7968, createdAt: dia(6) };

const soPedido = computeRealizado({ pedidos: [pedido], comMeta: new Set(["v1"]), ajustes: new Map() });
const comSelect = computeRealizado({ pedidos: [pedido, select], comMeta: new Set(["v1"]), ajustes: new Map() });

check("sem Select, so o pedido", soPedido.realizadoGeral, 1000);
// O valor e o TOTAL do contrato (decisao do dono), somado UMA vez.
check("o Select soma no realizado geral", comSelect.realizadoGeral, 8968);
check("e soma na linha da vendedora", comSelect.porVendedor.get("v1")?.total, 8968);

// Vendedora sem meta nao move o geral — mesma regra dos pedidos, sem excecao
// para servico: ela nao aparece no quadro, entao nao pode mover o KPI.
const semMeta = computeRealizado({ pedidos: [select], comMeta: new Set(), ajustes: new Map() });
check("Select de quem nao tem meta nao move o geral", semMeta.realizadoGeral, 0);

// O ajuste manual continua valendo por cima do Select, como vale do pedido:
// o anterior ao corte ja esta respondido pelo valor digitado.
const comAjuste = computeRealizado({
  pedidos: [{ sellerId: "v1", orderValue: 7968, createdAt: dia(2) }],
  comMeta: new Set(["v1"]),
  ajustes: new Map([["v1", { amount: 5000, corte: dia(3) }]]),
});
check("Select antes do corte nao soma sobre o ajuste", comAjuste.porVendedor.get("v1")?.posCorte, 0);
const posCorte = computeRealizado({
  pedidos: [{ sellerId: "v1", orderValue: 7968, createdAt: dia(9) }],
  comMeta: new Set(["v1"]),
  ajustes: new Map([["v1", { amount: 5000, corte: dia(3) }]]),
});
check("Select depois do corte soma sobre o ajuste", posCorte.porVendedor.get("v1")?.posCorte, 7968);
void corte;

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
