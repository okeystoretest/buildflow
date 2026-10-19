/**
 * Checagem do Histórico de Vendas: o escopo do filtro e o PDF.
 *
 * O que está em jogo é ESCOPO. O `where` é o mesmo da tela e da rota de
 * exportação, e a única coisa que impede uma vendedora de baixar o histórico
 * da equipe inteira é o `sellerId` entrar nele. Um relatório que vaza não dá
 * erro nenhum: ele simplesmente sai mais completo do que devia.
 *
 * O PDF é conferido DESCOMPRIMINDO os streams, porque é assim que se lê o que
 * de fato foi parar no papel — procurar texto nos bytes crus de um PDF
 * deflatado não acha nada e passa como se estivesse tudo certo.
 *
 * Rode com: npx tsx scripts/checks/historico-vendas.ts
 */
import { inflateSync } from "node:zlib";
import { gerarHistoricoPdf } from "../../src/lib/historico-vendas-pdf";
import {
  PDF_MAX_PEDIDOS,
  buildHistoricoWhere,
  descreverFiltros,
  parseHistoricoFiltros,
} from "../../src/lib/historico-vendas-query";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  console.log(`${ok ? "ok" : "FALHOU"} ${nome}`);
  if (!ok) {
    falhas++;
    console.log(`  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

/** O texto que o leitor de PDF mostraria: streams inflados e concatenados. */
function textoVisivel(b: Buffer): string {
  const bruto = b.toString("latin1");
  let fora = "";
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bruto))) {
    const ini = m.index + m[0].length;
    const fim = bruto.indexOf("endstream", ini);
    if (fim < 0) continue;
    try {
      fora += inflateSync(Buffer.from(bruto.slice(ini, fim), "latin1")).toString("latin1");
    } catch {
      // Objeto que não é stream deflatado (fonte, catálogo): não interessa aqui.
    }
  }
  return fora;
}

// --- escopo: a parte que é segurança ----------------------------------------
const amplo = buildHistoricoWhere(parseHistoricoFiltros({}), { sellerId: null });
const restrito = buildHistoricoWhere(parseHistoricoFiltros({}), { sellerId: "u1" });

check("Gestão/Financeiro não filtram por vendedora", "sellerId" in amplo, false);
check("Vendas é presa ao próprio id", restrito.sellerId, "u1");
// Se isto cair, o relatório passa a trazer pedido em rascunho ou cancelado.
check("só pedido CONCLUIDO entra", amplo.status, "CONCLUIDO");

// Sem período na URL não existe filtro de data (correção 2.1): cair no "mês
// atual" ocultava silenciosamente todo o histórico anterior.
check("sem período, nenhum filtro de data", "updatedAt" in amplo, false);
check(
  "com período, o filtro aparece",
  "updatedAt" in buildHistoricoWhere(parseHistoricoFiltros({ de: "2026-01-01" }), { sellerId: null }),
  true,
);
check(
  "a comanda vira busca parcial, sem diferenciar maiúscula",
  buildHistoricoWhere(parseHistoricoFiltros({ comanda: "A12" }), { sellerId: null }).comandaNumber,
  { contains: "A12", mode: "insensitive" },
);

check("recorte vazio é descrito", descreverFiltros(parseHistoricoFiltros({})), "período: todo o histórico");
check(
  "recorte com data é descrito em pt-BR",
  descreverFiltros(parseHistoricoFiltros({ de: "2026-01-05" })),
  "conclusão de 05/01/2026 até hoje",
);

// --- o PDF ------------------------------------------------------------------
const linhas = Array.from({ length: 120 }, (_, i) => ({
  sellerName:
    i === 0
      ? "Vendedora Com Um Nome Absurdamente Longo Que Nao Cabe Na Coluna De Jeito Nenhum"
      : `Vendedora ${(i % 5) + 1}`,
  orderNumber: `PED-${String(1000 + i)}`,
  total: 1234.5 + i,
}));

const grande = Buffer.from(
  gerarHistoricoPdf(linhas, {
    filtros: "período: todo o histórico",
    geradoPor: "Gestor Geral",
    escopo: "todas as vendedoras",
    totalFiltro: 999,
    limiteAplicado: PDF_MAX_PEDIDOS,
  }),
);
const visivel = textoVisivel(grande);

check("sai um PDF de verdade", grande.toString("latin1").slice(0, 5), "%PDF-");
check("o arquivo fecha", grande.toString("latin1").trimEnd().endsWith("%%EOF"), true);
check("120 linhas passam de uma página", (grande.toString("latin1").match(/\/Type \/Page[^s]/g) ?? []).length > 1, true);

check("os três campos pedidos estão no papel", ["Vendedora", "Pedido", "Valor"].every((c) => visivel.includes(c)), true);
check("a vendedora aparece", visivel.includes("Vendedora 2"), true);
check("o número do pedido aparece", visivel.includes("PED-1005"), true);
// `formatBRL` do app usa espaço não-quebrável, que o WinAnsi do PDF escreveria
// como outro caractere: o valor precisa sair com espaço comum.
check("o valor sai em R$ com espaço comum", visivel.includes("R$ 1.234,50"), true);
check("nome longo é cortado, não quebrado em duas linhas", visivel.includes("..."), true);

// Um relatório truncado que não avisa é um relatório que mente pelo silêncio.
check("com mais que o teto, avisa que é parcial", visivel.includes("EXPORTA"), true);
check(
  "dentro do teto, nenhum aviso",
  textoVisivel(
    Buffer.from(
      gerarHistoricoPdf(linhas.slice(0, 3), {
        filtros: "x", geradoPor: "x", escopo: "x", totalFiltro: 3, limiteAplicado: PDF_MAX_PEDIDOS,
      }),
    ),
  ).includes("EXPORTA"),
  false,
);

// Filtro sem resultado é o caso comum de uma vendedora nova, não uma exceção.
check(
  "filtro sem resultado gera PDF válido",
  Buffer.from(gerarHistoricoPdf([], { filtros: "x", geradoPor: "x", escopo: "x", totalFiltro: 0 }))
    .toString("latin1")
    .slice(0, 5),
  "%PDF-",
);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("historico-vendas: todas as checagens passaram.");
