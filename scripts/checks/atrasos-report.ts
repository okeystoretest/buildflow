// Checagem da CONTA do Relatorio de Atrasos (Logistica > Relatorio de Atrasos).
// Rodar com: npx tsx scripts/checks/atrasos-report.ts
//
// O que esta em jogo: os quatro indicadores da capa do PDF e o apontamento da
// "etapa com mais atrasos" saem todos de resumirAtrasos(). Se a media contar
// pedidos em vez de justificativas, ou se a etapa critica mudar de uma execucao
// para outra por empate, o relatorio deixa de ser auditavel — e ele existe
// justamente para ser cobrado em reuniao.
import { resumirAtrasos, setorDaEtapa, type AtrasoPedido } from "../../src/lib/atrasos";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(
      `FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`,
    );
  }
}

function pedido(
  id: string,
  js: Array<{ status: AtrasoPedido["status"]; minutesLate: number }>,
): AtrasoPedido {
  return {
    id,
    orderNumber: id,
    comandaNumber: null,
    status: "CONFERINDO",
    customerName: "Cliente",
    customerCode: "001",
    sellerName: "Ana",
    orderTypeName: "Venda",
    originStoreName: null,
    criadoEm: "2026-10-01T12:00:00.000Z",
    justificativas: js.map((j, i) => ({
      id: `${id}-${i}`,
      status: j.status,
      setor: setorDaEtapa(j.status),
      reason: "Faltou peca",
      minutesLate: j.minutesLate,
      autor: "Bruno",
      createdAt: "2026-10-02T12:00:00.000Z",
    })),
  };
}

// --- recorte vazio: nada de dividir por zero nem imprimir "0min" falso ---
const vazio = resumirAtrasos([]);
check("sem pedidos: media nula", vazio.mediaAtrasoMin, null);
check("sem pedidos: pior nulo", vazio.piorAtrasoMin, null);
check("sem pedidos: sem etapa critica", vazio.etapaCritica, null);
check("sem pedidos: contagens zeradas", [vazio.pedidos, vazio.justificativas], [0, 0]);

// --- a media e por JUSTIFICATIVA, nao por pedido ---
// 3 justificativas (10, 20, 60) em 2 pedidos => media 30, nao 45.
const base = [
  pedido("P1", [
    { status: "SEPARANDO", minutesLate: 10 },
    { status: "CONFERINDO", minutesLate: 20 },
  ]),
  pedido("P2", [{ status: "SEPARANDO", minutesLate: 60 }]),
];
const r = resumirAtrasos(base);
check("conta pedidos", r.pedidos, 2);
check("conta justificativas", r.justificativas, 3);
check("media por justificativa", r.mediaAtrasoMin, 30);
check("maior atraso", r.piorAtrasoMin, 60);
check("etapa critica por volume", r.etapaCritica, { status: "SEPARANDO", total: 2 });

// --- media arredondada (o PDF imprime minutos inteiros) ---
const impar = resumirAtrasos([
  pedido("P3", [
    { status: "EMBALANDO", minutesLate: 10 },
    { status: "CONFERINDO", minutesLate: 11 },
  ]),
]);
check("media arredondada", impar.mediaAtrasoMin, 11); // 10,5 -> 11

// --- empate de etapas e deterministico (primeira a aparecer vence) ---
const empate = resumirAtrasos([
  pedido("P4", [
    { status: "EMBALANDO", minutesLate: 5 },
    { status: "SEPARANDO", minutesLate: 5 },
  ]),
]);
check("empate mantem a primeira etapa vista", empate.etapaCritica, {
  status: "EMBALANDO",
  total: 1,
});

// --- o setor sai da ETAPA do atraso, nao do status atual do pedido ---
check("setor da etapa logistica", setorDaEtapa("SEPARANDO"), "LOGISTICA");
check("setor da etapa do financeiro", setorDaEtapa("EM_ANALISE"), "FINANCEIRO");
check("setor da etapa do motorista", setorDaEtapa("EM_ROTA"), "MOTORISTA");

console.log(falhas === 0 ? "atrasos-report: OK" : `atrasos-report: ${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
