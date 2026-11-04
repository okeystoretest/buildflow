/**
 * Checagem das contas NOVAS do relatório gerencial da Análise de Clientes:
 * conversão por praça, tempo de resposta e a descrição do recorte.
 *
 * As três aparecem na tela E no PDF, lendo o mesmo `ResumoDoAtacado`. Um erro
 * aqui não quebra nada visivelmente: produz um número plausível e errado, que
 * é levado para uma reunião. É o tipo de defeito que só um teste pega.
 *
 * Rode com: npx tsx scripts/checks/analise-clientes-relatorio.ts
 */
import { inflateSync } from "node:zlib";
import {
  DIAS_PARADA,
  agrupaPorUf,
  descreverRecorte,
  tempoDeResposta,
  type ResumoDoAtacado,
} from "../../src/lib/wholesale-dashboard";
import { gerarAnaliseClientesPdf } from "../../src/lib/analise-clientes-pdf";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  console.log(`${ok ? "ok" : "FALHOU"} ${nome}`);
  if (!ok) {
    falhas++;
    console.log(`  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

const linha = (state: string, purchaseState: string, total: number) =>
  ({ state, purchaseState, _count: { _all: total } }) as Parameters<typeof agrupaPorUf>[0][number];

/* ------------------------------------------------------- conversão por UF */

// A conta é compraram ÷ recebidas DAQUELA UF — nunca sobre o total geral. Com
// o denominador errado, CE daria 3/13 = 23% em vez de 30%.
const porUf = agrupaPorUf([
  linha("CE", "COMPROU", 3),
  linha("CE", "CADENCIA", 7),
  linha("SP", "COMPROU", 2),
  linha("SP", "NAO_COMPROU", 1),
]);
check("UF ordenada por volume", porUf.map((u) => u.uf), ["CE", "SP"]);
check("conversão da UF usa o total DELA", porUf[0], {
  uf: "CE",
  total: 10,
  comprou: 3,
  conversao: 30,
});
check("conversão da segunda UF", porUf[1].conversao, 66.7);

// UF em branco/minúscula: a LP grava `state` como texto livre. Sem a
// normalização, "ce" e "CE" seriam duas praças, e a lista mostraria a mesma
// UF duas vezes com metade do volume em cada.
const normaliza = agrupaPorUf([
  linha("ce", "COMPROU", 1),
  linha("CE", "CADENCIA", 1),
  linha("", "CADENCIA", 2),
  linha("  ", "COMPROU", 1),
]);
check("UF normalizada para maiúsculas", normaliza.find((u) => u.uf === "CE")?.total, 2);
check("UF vazia vira uma linha só, e não some", normaliza.find((u) => u.uf === "—")?.total, 3);
// As parcelas têm de fechar com o total recebido: é por isso que a UF vazia
// aparece em vez de ser escondida.
check("as parcelas fecham com o total", normaliza.reduce((s, u) => s + u.total, 0), 5);
check("base vazia devolve lista vazia", agrupaPorUf([]), []);

/* --------------------------------------------------------- tempo de resposta */

const DIA = 24 * 60 * 60 * 1000;
const agora = new Date("2026-11-04T12:00:00Z");
const diasAtras = (d: number) => new Date(agora.getTime() - d * DIA);

const t = tempoDeResposta(
  [
    // Decididas: entram na média (2 e 4 dias -> 3).
    { createdAt: diasAtras(10), decidedAt: diasAtras(8), status: "APROVADO" },
    { createdAt: diasAtras(20), decidedAt: diasAtras(16), status: "REPROVADO" },
    // Em análise há 9 dias: passa de DIAS_PARADA, conta como parada.
    { createdAt: diasAtras(9), decidedAt: null, status: "EM_ANALISE" },
    // Em análise há 2 dias: dentro do prazo.
    { createdAt: diasAtras(2), decidedAt: null, status: "EM_ANALISE" },
  ],
  agora,
);
check("média só das decididas", t.mediaDias, 3);
check("denominador da média", t.decididas, 2);
check(`paradas há mais de ${DIAS_PARADA} dias`, t.paradas, 1);
check("espera mais antiga em dias", t.maisAntigaDias, 9);

// CUIDADO é DECISÃO TOMADA, não fila. Sem esta distinção o painel cobraria
// ação sobre candidatura já julgada — e o número nunca zeraria.
const comCuidado = tempoDeResposta(
  [{ createdAt: diasAtras(30), decidedAt: null, status: "CUIDADO" }],
  agora,
);
check("CUIDADO sem data não conta como fila parada", comCuidado.paradas, 0);
check("...nem entra na média", comCuidado.decididas, 0);

// A pendente NÃO entra na média: com a idade atual somada, o tempo médio
// subiria sozinho a cada dia em que ninguém decidisse nada.
const soPendente = tempoDeResposta(
  [{ createdAt: diasAtras(40), decidedAt: null, status: "EM_ANALISE" }],
  agora,
);
check("sem decisão a média é 0, nunca NaN", soPendente.mediaDias, 0);
check("...e a pendente aparece como parada", soPendente.paradas, 1);

// `decidedAt` anterior ao `createdAt` (importação torta) não pode virar tempo
// negativo e puxar a média para baixo.
const invertido = tempoDeResposta(
  [{ createdAt: diasAtras(5), decidedAt: diasAtras(9), status: "APROVADO" }],
  agora,
);
check("decisão antes da chegada não gera média negativa", invertido.mediaDias, 0);
check("base vazia não quebra", tempoDeResposta([], agora), {
  mediaDias: 0,
  decididas: 0,
  paradas: 0,
  maisAntigaDias: 0,
});

/* ---------------------------------------------------------------- recorte */

// A capa do PDF precisa dizer o recorte: sem isto, dois arquivos com o mesmo
// título trazem números diferentes e ninguém descobre por quê.
check("sem período: todo o histórico", descreverRecorte({}), "todo o histórico");
check(
  "período fechado em pt-BR",
  descreverRecorte({ de: "2026-10-01", ate: "2026-10-31" }),
  "de 01/10/2026 a 31/10/2026",
);
check("só o início", descreverRecorte({ de: "2026-10-01" }), "desde 01/10/2026");
check("só o fim", descreverRecorte({ ate: "2026-10-31" }), "até 31/10/2026");
check(
  "os filtros do painel entram na capa",
  descreverRecorte({ estado: "ce", cidade: "Fortaleza" }, "Maria Kelly"),
  "todo o histórico · vendedora: Maria Kelly · UF: CE · cidade: Fortaleza",
);
// UF mal formada é ignorada, como em `resumoDoAtacado`: a capa não pode
// anunciar um recorte que a consulta não aplicou.
check("UF inválida não entra na capa", descreverRecorte({ estado: "ceara" }), "todo o histórico");

/* -------------------------------------------------------------------- PDF */

/**
 * O texto que o PDF realmente imprime: cada página é um stream deflatado, e
 * procurar palavra nos bytes crus do arquivo não encontra nada. Mesmo helper
 * de `historico-vendas.ts`.
 */
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
      // Objeto que não é stream deflatado (fonte, catálogo): não interessa.
    }
  }
  return fora;
}

const resumo: ResumoDoAtacado = {
  total: 40,
  porStatus: [
    { status: "EM_ANALISE", total: 9 },
    { status: "APROVADO", total: 22 },
    { status: "REPROVADO", total: 7 },
    { status: "CUIDADO", total: 2 },
  ],
  porVendedora: [
    {
      sellerId: "u1",
      nome: "Vendedora Com Um Nome Absurdamente Longo Que Nao Cabe Na Coluna De Jeito Nenhum",
      total: 25,
      comprou: 10,
      conversao: 40,
    },
    { sellerId: null, nome: "Sem vendedora", total: 15, comprou: 3, conversao: 20 },
  ],
  entradasPorMes: [
    { chave: "2026-09", rotulo: "set/26", total: 12 },
    { chave: "2026-10", rotulo: "out/26", total: 0 },
    { chave: "2026-11", rotulo: "nov/26", total: 28 },
  ],
  recentes: [],
  porMotivo: [
    { code: "12", rotulo: "12 — Loja sem vitrine", total: 5 },
    { code: null, rotulo: "Sem código", total: 2 },
  ],
  porUf: [
    { uf: "CE", total: 30, comprou: 12, conversao: 40 },
    { uf: "SP", total: 10, comprou: 1, conversao: 10 },
  ],
  tempo: { mediaDias: 3.5, decididas: 31, paradas: 4, maisAntigaDias: 19 },
  aprovacao: 55,
  aprovadas: 22,
  conversao: 32.5,
  comprou: 13,
};
const meta = { filtros: "todo o histórico", geradoPor: "Gestor Geral", escopo: "todas as vendedoras" };

const arquivo = Buffer.from(gerarAnaliseClientesPdf(resumo, meta));
const visivel = textoVisivel(arquivo);

check("sai um PDF de verdade", arquivo.toString("latin1").slice(0, 5), "%PDF-");
check("o arquivo fecha", arquivo.toString("latin1").trimEnd().endsWith("%%EOF"), true);
// O escopo no papel é o que impede dois arquivos com o mesmo título e números
// diferentes — ver `descreverRecorte`.
check("a capa diz o escopo", visivel.includes("todas as vendedoras"), true);
check("as seções pedidas estão no papel", [
  "Funil do", "Taxas e tempo", "Por vendedora", "Por pra", "Reprova", "por m",
].every((s) => visivel.includes(s)), true);
check("os números do funil aparecem", visivel.includes("40") && visivel.includes("22"), true);
check("as duas taxas aparecem", visivel.includes("55%") && visivel.includes("32,5%"), true);
check("o tempo de resposta aparece", visivel.includes("3,5 d"), true);
check("a praça entra com a conversão dela", visivel.includes("CE"), true);
// Os cinco cartões do funil não somam o total quando há CUIDADO: a diferença
// precisa estar EXPLICADA no papel, não virar um "não fecha" silencioso.
check("o Cuidado fora dos cartões é explicado", visivel.includes("Cuidado"), true);
check("nome longo é cortado, não quebrado", visivel.includes("..."), true);

// Recorte sem resultado é o caso comum de uma vendedora nova, não exceção: o
// PDF não pode sair como uma coluna de zeros nem estourar.
const vazio = Buffer.from(
  gerarAnaliseClientesPdf({ ...resumo, total: 0 }, meta),
);
check("recorte vazio gera PDF válido", vazio.toString("latin1").slice(0, 5), "%PDF-");
check(
  "...e diz que está vazio em vez de imprimir zeros",
  textoVisivel(vazio).includes("Nenhuma candidatura neste recorte"),
  true,
);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("analise-clientes-relatorio: todas as checagens passaram.");
