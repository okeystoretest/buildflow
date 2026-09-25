// Checagem das JANELAS DE TEMPO do Ranking de Vendas.
// Rodar com: npx tsx scripts/checks/rank-window.ts
//
// O que esta em jogo: a janela decide em QUAL MES cada venda e contabilizada.
// O servidor roda em UTC (node:20-slim, sem TZ no Dockerfile) e o negocio
// opera em horario de Brasilia (UTC-3). Construir a janela com o fuso do
// servidor jogava toda venda feita entre 21:00 e 23:59 do ultimo dia do mes
// para o mes seguinte. Estes testes fixam a janela no fuso do NEGOCIO.
import {
  FUSO_NEGOCIO,
  instanteNoFuso,
  janelaDoMes,
  inicioDaSemana,
  janelaDaSemana,
  corteLegado,
} from "../../src/lib/rank-window";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}
const iso = (d: Date) => d.toISOString();

// --- o fuso do negocio e o de Brasilia, nao o do servidor ---
check("fuso do negocio", FUSO_NEGOCIO, "America/Sao_Paulo");

// --- meia-noite no fuso do negocio = 03:00 UTC ---
check("meia-noite BRT vira 03:00Z", iso(instanteNoFuso(2026, 9, 1)), "2026-09-01T03:00:00.000Z");
check("meio-dia BRT vira 15:00Z", iso(instanteNoFuso(2026, 9, 1, 12)), "2026-09-01T15:00:00.000Z");

// --- janela do mes ancorada no fuso do negocio ---
const setembro = janelaDoMes(2026, 9);
check("inicio de setembro", iso(setembro.inicio), "2026-09-01T03:00:00.000Z");
check("fim de setembro (exclusivo)", iso(setembro.fim), "2026-10-01T03:00:00.000Z");

const dezembro = janelaDoMes(2026, 12);
check("virada de ano: fim de dezembro", iso(dezembro.fim), "2027-01-01T03:00:00.000Z");

// --- O DEFEITO QUE ISTO CORRIGE ---
// Venda feita as 23:30 do dia 30/09 (horario de Brasilia) e de SETEMBRO.
// Com a janela em UTC ela caia em outubro.
const vendaFimDoMes = new Date("2026-10-01T02:30:00.000Z"); // 30/09 23:30 BRT
const dentro = (d: Date, j: { inicio: Date; fim: Date }) => d >= j.inicio && d < j.fim;
check("23:30 de 30/09 conta em setembro", dentro(vendaFimDoMes, setembro), true);
check("23:30 de 30/09 NAO conta em outubro", dentro(vendaFimDoMes, janelaDoMes(2026, 10)), false);

// Venda feita as 00:30 do dia 01/10 (horario de Brasilia) e de OUTUBRO.
const vendaInicioDoMes = new Date("2026-10-01T03:30:00.000Z"); // 01/10 00:30 BRT
check("00:30 de 01/10 conta em outubro", dentro(vendaInicioDoMes, janelaDoMes(2026, 10)), true);
check("00:30 de 01/10 NAO conta em setembro", dentro(vendaInicioDoMes, setembro), false);

// --- semana comeca no domingo 00:00 do fuso do negocio ---
// 01/10/2026 e uma quinta-feira; o domingo daquela semana e 27/09.
const quintaFeira = new Date("2026-10-01T15:00:00.000Z"); // 01/10 12:00 BRT
check("domingo da semana corrente", iso(inicioDaSemana(quintaFeira)), "2026-09-27T03:00:00.000Z");

// Domingo as 00:30 BRT: o inicio da semana e o proprio dia, nao a semana anterior.
const domingoCedo = new Date("2026-09-27T03:30:00.000Z"); // 27/09 00:30 BRT
check("domingo e o proprio inicio", iso(inicioDaSemana(domingoCedo)), "2026-09-27T03:00:00.000Z");

// Sabado as 22:00 BRT ainda pertence a semana que comecou no domingo anterior.
// Em UTC ja seria domingo — e o corte cairia na semana errada.
const sabadoNoite = new Date("2026-09-27T01:00:00.000Z"); // 26/09 22:00 BRT (sabado)
check("sabado 22:00 fica na semana anterior", iso(inicioDaSemana(sabadoNoite)), "2026-09-20T03:00:00.000Z");

// --- a janela da semana nunca vaza para fora do mes exibido ---
// Na primeira semana de outubro, o domingo caiu em 27/09: o recorte tem de
// comecar no dia 1o de outubro, senao o KPI "Maior Venda Semanal" mostra uma
// venda de setembro sob o painel de outubro.
const semanaOutubro = janelaDaSemana(quintaFeira, 2026, 10);
check("semana recortada no inicio do mes", iso(semanaOutubro.inicio), "2026-10-01T03:00:00.000Z");
check("semana termina com o mes", iso(semanaOutubro.fim), "2026-11-01T03:00:00.000Z");

// Semana inteiramente dentro do mes nao sofre recorte.
const meioDeSetembro = new Date("2026-09-17T15:00:00.000Z"); // quinta, 17/09
check("semana no meio do mes fica intacta", iso(janelaDaSemana(meioDeSetembro, 2026, 9).inicio), "2026-09-13T03:00:00.000Z");

// --- corte dos ajustes legados (baselineAt nulo) ---
// A constante existente vale 27/08/2026 10:00 BRT. Dentro de agosto/2026 ela
// e preservada tal como esta hoje.
const constante = instanteNoFuso(2026, 8, 27, 10);
const agosto = janelaDoMes(2026, 8);
check("agosto/2026 preserva a constante", iso(corteLegado(constante, agosto)), iso(constante));

// Em QUALQUER outro mes a constante nao faz sentido: se o mes inteiro esta
// depois dela, todo pedido vira "pos-corte" e o valor digitado passa a SOMAR
// sobre o mes inteiro em vez de substitui-lo (contagem dobrada). O corte cai
// para o fim do mes, restaurando a semantica legada de substituir o mes.
check("setembro/2026 cai para o fim do mes", iso(corteLegado(constante, setembro)), iso(setembro.fim));
check("julho/2026 cai para o fim do mes", iso(corteLegado(constante, janelaDoMes(2026, 7))), iso(janelaDoMes(2026, 7).fim));

console.log(falhas === 0 ? "rank-window: OK" : `rank-window: ${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
