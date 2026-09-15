// Checagem das regras de status do chamado de transporte.
// Rodar com: npx tsx scripts/checks/transport-status.ts
//
// O que esta em jogo: a transicao decide o que cada botao do quadro pode
// fazer, e o mapeamento e o que o Connect grava no espelho. Errar aqui
// aparece nos DOIS sistemas.
import {
  TRANSPORT_COLUMNS,
  TRANSPORT_STATUS_STYLE,
  toConnectStatus,
  canTransition,
  isFinal,
  CONCLUDED_WINDOW_MIN,
} from "../../src/lib/transport/status";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

check("colunas do quadro", TRANSPORT_COLUMNS, ["ABERTO", "ATRIBUIDO", "EM_ROTA", "CONCLUIDO"]);
check("janela de concluidos", CONCLUDED_WINDOW_MIN, 15);

// Mapeamento para o Connect (enum TicketStatus de la).
check("aberto -> pendente", toConnectStatus("ABERTO"), "PENDENTE");
check("atribuido -> atribuido", toConnectStatus("ATRIBUIDO"), "ATRIBUIDO");
check("em rota -> em andamento", toConnectStatus("EM_ROTA"), "EM_ANDAMENTO");
check("concluido -> concluido", toConnectStatus("CONCLUIDO"), "CONCLUIDO");
check("cancelado -> cancelado", toConnectStatus("CANCELADO"), "CANCELADO");

// Transicoes permitidas (o fluxo do Connect: Em Aberto -> Atribuido -> Em Rota -> Concluido).
check("aberto -> atribuido", canTransition("ABERTO", "ATRIBUIDO"), true);
check("atribuido -> em rota", canTransition("ATRIBUIDO", "EM_ROTA"), true);
check("atribuido -> aberto (desatribuir)", canTransition("ATRIBUIDO", "ABERTO"), true);
check("em rota -> concluido", canTransition("EM_ROTA", "CONCLUIDO"), true);
check("aberto -> cancelado", canTransition("ABERTO", "CANCELADO"), true);
check("atribuido -> cancelado", canTransition("ATRIBUIDO", "CANCELADO"), true);
check("em rota -> cancelado", canTransition("EM_ROTA", "CANCELADO"), true);
// Proibidas.
check("aberto -> em rota (pula atribuicao)", canTransition("ABERTO", "EM_ROTA"), false);
check("aberto -> concluido", canTransition("ABERTO", "CONCLUIDO"), false);
check("em rota -> aberto", canTransition("EM_ROTA", "ABERTO"), false);
check("concluido -> qualquer", canTransition("CONCLUIDO", "ABERTO"), false);
check("cancelado -> qualquer", canTransition("CANCELADO", "ATRIBUIDO"), false);
check("mesmo status", canTransition("ABERTO", "ABERTO"), false);

check("final: concluido", isFinal("CONCLUIDO"), true);
check("final: cancelado", isFinal("CANCELADO"), true);
check("final: em rota", isFinal("EM_ROTA"), false);

// Todo status tem estilo com rotulo (o badge nunca cai em undefined).
for (const s of ["ABERTO", "ATRIBUIDO", "EM_ROTA", "CONCLUIDO", "CANCELADO"] as const) {
  check(`estilo ${s} tem label`, typeof TRANSPORT_STATUS_STYLE[s].label, "string");
}

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("transport-status: OK");
