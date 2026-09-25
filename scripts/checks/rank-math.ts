// Checagem da CONTA do realizado no Ranking de Vendas.
// Rodar com: npx tsx scripts/checks/rank-math.ts
//
// O que esta em jogo: o KPI "Meta Geral" e a tabela de vendedoras tem de contar
// a MESMA populacao. O numerador somava os pedidos de TODOS os vendedores
// (inclusive de quem nao tem meta, e de GESTAO/FINANCEIRO que tambem lancam
// pedido), enquanto o denominador somava so as metas cadastradas e a tabela
// descartava quem nao tem meta. Resultado: somar as linhas do quadro nunca
// dava o valor do KPI, e o percentual saia inflado.
import { computeRealizado, vendidoDoVendedor } from "../../src/lib/rank-math";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

const dia = (d: number) => new Date(`2026-09-${String(d).padStart(2, "0")}T15:00:00.000Z`);

// Ana e Bruno tem meta. Carla vendeu mas NAO tem meta no periodo.
const pedidos = [
  { sellerId: "ana", orderValue: 1000, createdAt: dia(5) },
  { sellerId: "ana", orderValue: 500, createdAt: dia(20) },
  { sellerId: "bruno", orderValue: 800, createdAt: dia(10) },
  { sellerId: "carla", orderValue: 9999, createdAt: dia(12) },
];
const comMeta = new Set(["ana", "bruno"]);

// --- quem nao tem meta nao entra no realizado ---
const base = computeRealizado({ pedidos, comMeta, ajustes: new Map() });
check("realizado ignora quem nao tem meta", base.realizadoSistema, 2300);
check("sem ajuste, ajuste total e zero", base.ajusteManualTotal, 0);
check("realizado geral sem ajuste", base.realizadoGeral, 2300);
check("vendedor sem meta nao vira linha", base.porVendedor.has("carla"), false);
check("ana consolidada", base.porVendedor.get("ana")?.total, 1500);
check("bruno consolidado", base.porVendedor.get("bruno")?.total, 800);

// --- A INVARIANTE QUE ESTAVA QUEBRADA ---
// O KPI tem de ser exatamente a soma das linhas exibidas na tabela.
function somaDasLinhas(r: ReturnType<typeof computeRealizado>, ajustes: Map<string, { amount: number; corte: Date }>) {
  let s = 0;
  for (const [id, v] of r.porVendedor.entries()) s += vendidoDoVendedor(v, ajustes.get(id));
  return s;
}
check("KPI fecha com a tabela (sem ajuste)", somaDasLinhas(base, new Map()), base.realizadoGeral);

// --- ajuste manual incremental: valor digitado + o que entrou apos o corte ---
const ajusteAna = new Map([["ana", { amount: 2000, corte: dia(15) }]]);
const comAjuste = computeRealizado({ pedidos, comMeta, ajustes: ajusteAna });
check("posCorte da ana", comAjuste.porVendedor.get("ana")?.posCorte, 500);
check("vendido da ana = digitado + pos-corte", vendidoDoVendedor(comAjuste.porVendedor.get("ana")!, ajusteAna.get("ana")), 2500);
check("realizado geral com ajuste", comAjuste.realizadoGeral, 3300);
check("KPI fecha com a tabela (com ajuste)", somaDasLinhas(comAjuste, ajusteAna), comAjuste.realizadoGeral);

// --- ajuste de quem nao tem meta nao pode mover o KPI ---
// Antes, o laco percorria TODOS os ajustes do periodo: um ajuste de vendedor
// sem meta somava no realizado geral sem gerar linha nenhuma na tabela.
const ajusteCarla = new Map([["carla", { amount: 5000, corte: dia(15) }]]);
const comAjusteOrfao = computeRealizado({ pedidos, comMeta, ajustes: ajusteCarla });
check("ajuste sem meta nao move o realizado", comAjusteOrfao.realizadoGeral, 2300);
check("KPI fecha com a tabela (ajuste orfao)", somaDasLinhas(comAjusteOrfao, ajusteCarla), comAjusteOrfao.realizadoGeral);

// --- vendedor com meta e sem nenhum pedido entra zerado ---
const comMetaSemVenda = new Set(["ana", "bruno", "diana"]);
const comZerado = computeRealizado({ pedidos, comMeta: comMetaSemVenda, ajustes: new Map() });
check("vendedor com meta e sem venda aparece", comZerado.porVendedor.get("diana")?.total, 0);
check("vendedor zerado nao altera o realizado", comZerado.realizadoGeral, 2300);

// Ajuste para vendedor COM meta e SEM pedido: o valor digitado entra inteiro.
const ajusteDiana = new Map([["diana", { amount: 700, corte: dia(15) }]]);
const comDiana = computeRealizado({ pedidos, comMeta: comMetaSemVenda, ajustes: ajusteDiana });
check("ajuste de quem nao vendeu entra inteiro", comDiana.realizadoGeral, 3000);
check("KPI fecha com a tabela (sem pedido)", somaDasLinhas(comDiana, ajusteDiana), comDiana.realizadoGeral);

// --- pedido exatamente no instante do corte conta como POS-corte ---
const ajusteNoLimite = new Map([["bruno", { amount: 100, corte: dia(10) }]]);
const limite = computeRealizado({ pedidos, comMeta, ajustes: ajusteNoLimite });
check("pedido no instante do corte e pos-corte", limite.porVendedor.get("bruno")?.posCorte, 800);

console.log(falhas === 0 ? "rank-math: OK" : `rank-math: ${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
