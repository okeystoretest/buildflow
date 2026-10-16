// Checagem da CONTA do Dashboard de chamados (Motorista > Dashboard).
// Rodar com: npx tsx scripts/checks/transport-dashboard.ts
//
// O que esta em jogo: o painel ganhou um filtro por motorista, e TODOS os
// indicadores passam a sair do recorte filtrado. Dois erros seriam invisiveis
// na tela e mentirosos no numero: (1) dividir por zero quando o motorista
// selecionado nao tem chamado, imprimindo "NaN%" ou 0 sem sentido; (2) tratar
// chamado sem distanceKm como corrida de 0 km, o que derruba a media de
// quilometragem — justamente o dado que o painel precisa preservar.
import { buildTransportDashboard, pct, type TransportRow } from "../../src/lib/transport/dashboard-math";

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

const AGORA = new Date("2026-10-16T12:00:00.000Z");
const h = (horas: number) => new Date(AGORA.getTime() - horas * 60 * 60 * 1000);

function row(p: Partial<TransportRow>): TransportRow {
  return {
    status: "CONCLUIDO",
    serviceType: "Entrega",
    requesterSector: "Comercial",
    createdAt: h(4),
    finishedAt: h(2),
    distanceKm: 10,
    driverId: "m1",
    driverName: "Paulo",
    ...p,
  };
}

// --- recorte vazio: nada de NaN nem divisao por zero ---
const vazio = buildTransportDashboard([], AGORA);
check("vazio: total", vazio.total, 0);
check("vazio: taxa de conclusao", vazio.completionRate, 0);
check("vazio: km total", vazio.totalKm, 0);
check("vazio: media por corrida", vazio.avgKmPerTrip, 0);
check("vazio: tempo medio", vazio.avgResolution, "—");
check("vazio: topDriver", vazio.topDriver, "—");
check("pct protege total zero", pct(3, 0), 0);

// --- cancelado fica fora do total e da taxa ---
const comCancelado = buildTransportDashboard(
  [
    row({}),
    row({ status: "ABERTO", finishedAt: null, distanceKm: null }),
    row({ status: "CANCELADO", finishedAt: null, distanceKm: null }),
  ],
  AGORA,
);
check("cancelado fora do total", comCancelado.total, 2);
check("cancelado contado no byStatus", comCancelado.byStatus.CANCELADO, 1);
check("taxa sobre os nao cancelados", comCancelado.completionRate, 50);

// --- quilometragem: chamado SEM distancia nao e corrida de 0 km ---
const km = buildTransportDashboard(
  [
    row({ distanceKm: 10 }),
    row({ distanceKm: 20 }),
    row({ distanceKm: null }), // concluida, mas sem medicao
  ],
  AGORA,
);
check("km total soma so o medido", km.totalKm, 30);
check("media ignora a corrida sem medicao", km.avgKmPerTrip, 15); // 30/2, nao 30/3

// --- recorte de UM motorista (o que o filtro da tela produz) ---
const soDoPaulo = [
  row({ driverId: "m1", driverName: "Paulo", distanceKm: 12 }),
  row({ driverId: "m1", driverName: "Paulo", distanceKm: 8 }),
];
const filtrado = buildTransportDashboard(soDoPaulo, AGORA);
check("filtrado: total", filtrado.total, 2);
check("filtrado: km do motorista", filtrado.totalKm, 20);
check("filtrado: topDriver e ele", filtrado.topDriver, "Paulo");
check("filtrado: byDriver com uma linha", filtrado.byDriver, [{ label: "Paulo", count: 2 }]);

// --- motorista sem nenhum chamado: painel zera sem quebrar ---
const semChamado = buildTransportDashboard([], AGORA);
check("motorista sem chamado: byDriver vazio", semChamado.byDriver, []);
check("motorista sem chamado: taxa", semChamado.completionRate, 0);

// --- distribuicoes ordenadas por volume, e "Sem setor" para nulo ---
const dist = buildTransportDashboard(
  [
    row({ serviceType: "Coleta", requesterSector: null }),
    row({ serviceType: "Entrega" }),
    row({ serviceType: "Entrega" }),
  ],
  AGORA,
);
check("byService ordenado por volume", dist.byService, [
  { label: "Entrega", count: 2 },
  { label: "Coleta", count: 1 },
]);
check("setor nulo vira 'Sem setor'", dist.bySector.some((f) => f.label === "Sem setor"), true);

// --- concluidos hoje x 30 dias ---
const janelas = buildTransportDashboard(
  [
    row({ finishedAt: h(1) }), // hoje
    row({ finishedAt: new Date(AGORA.getTime() - 10 * 24 * 60 * 60 * 1000) }), // 10 dias
    row({ finishedAt: new Date(AGORA.getTime() - 40 * 24 * 60 * 60 * 1000) }), // 40 dias
  ],
  AGORA,
);
check("concluidos hoje", janelas.concludedToday, 1);
check("concluidos em 30 dias", janelas.concluded30d, 2);

console.log(falhas === 0 ? "transport-dashboard: OK" : `transport-dashboard: ${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
