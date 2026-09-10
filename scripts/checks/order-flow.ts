// Checagem da cadeia de status do pedido apos a saida de EMBALADO e PROCESSADO.
// Rodar com: npx tsx scripts/checks/order-flow.ts
import {
  ORDER_FLOW,
  DASHBOARD_COLUMNS,
  SIMPLIFIED_FLOW,
  SIMPLIFIED_COLUMNS,
  STATUS_LABEL,
  STATUS_STYLE,
  nextStatus,
  canTransition,
  nextSimplifiedStatus,
  canTransitionSimplified,
} from "../../src/lib/order-flow";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

// --- EMBALADO e PROCESSADO saem do FLUXO ---
check("embalado fora do fluxo", ORDER_FLOW.includes("EMBALADO"), false);
check("processado fora do fluxo", ORDER_FLOW.includes("PROCESSADO"), false);
check("embalado fora das colunas", DASHBOARD_COLUMNS.includes("EMBALADO"), false);
check("processado fora das colunas", DASHBOARD_COLUMNS.includes("PROCESSADO"), false);

// ...mas CONTINUAM tendo rotulo e estilo. O historico de pedidos antigos aponta
// para eles, e a tela do cliente precisa saber desenha-los. Se estes dois
// falharem, um pedido antigo quebra a renderizacao do proprio historico.
check("embalado ainda tem rotulo", STATUS_LABEL.EMBALADO, "Embalado");
check("processado ainda tem rotulo", STATUS_LABEL.PROCESSADO, "Processado");
check("embalado ainda tem estilo", typeof STATUS_STYLE.EMBALADO?.dot, "string");
check("processado ainda tem estilo", typeof STATUS_STYLE.PROCESSADO?.dot, "string");

// --- A cadeia se fecha sem os dois ---
check("embalando avanca p/ processando", nextStatus("EMBALANDO"), "PROCESSANDO");
check("processando avanca p/ pronto", nextStatus("PROCESSANDO"), "ENVIADO");
check("pronto avanca p/ em rota", nextStatus("ENVIADO"), "EM_ROTA");
check("concluido e o fim", nextStatus("CONCLUIDO"), null);

// A escolha do envio (rastreio ou motorista) acontece nesta transicao — e o
// pop-up da Logistica dispara por ela.
check("transicao processando->pronto", canTransition("PROCESSANDO", "ENVIADO"), true);
// Ninguem cai mais nos status aposentados.
check("nao se transita p/ embalado", canTransition("EMBALANDO", "EMBALADO"), false);
check("nao se transita p/ processado", canTransition("PROCESSANDO", "PROCESSADO"), false);
// Excecoes continuam permitidas de qualquer status.
check("excecao segue valida", canTransition("PROCESSANDO", "CANCELADO"), true);

// --- Fluxo simplificado: o passo do meio virou EMBALANDO ---
check("simplificado", SIMPLIFIED_FLOW, ["PAGO", "EMBALANDO", "ENTREGUE"]);
check("colunas simplificadas", SIMPLIFIED_COLUMNS, ["PAGO", "EMBALANDO", "ENTREGUE"]);
check("pago avanca p/ embalando", nextSimplifiedStatus("PAGO"), "EMBALANDO");
check("embalando avanca p/ entregue", nextSimplifiedStatus("EMBALANDO"), "ENTREGUE");
check("entregue e o fim do simplificado", nextSimplifiedStatus("ENTREGUE"), null);
check("transicao simplificada valida", canTransitionSimplified("PAGO", "EMBALANDO"), true);
check("transicao simplificada invalida", canTransitionSimplified("PAGO", "ENTREGUE"), false);

// --- O corte de estagios do quadro precisa existir ---
// O Kanban divide as colunas em 1o/2o estagio por indexOf("EMBALANDO"). Se
// EMBALANDO sair das colunas, o indexOf devolve -1 e TODAS as colunas caem no
// 1o estagio, sem ninguem perceber.
check("corte de estagio existe", DASHBOARD_COLUMNS.indexOf("EMBALANDO") > 0, true);
// A grade usa lg:grid-cols-5 nos dois estagios. Se o corte deixar de dar 5 e 5,
// sobra vao vazio (ou falta coluna) na fileira — e ninguem percebe olhando o
// codigo do card.
const corte = DASHBOARD_COLUMNS.indexOf("EMBALANDO");
check("estagio 1 com 5 colunas", DASHBOARD_COLUMNS.slice(0, corte).length, 5);
check("estagio 2 com 5 colunas", DASHBOARD_COLUMNS.slice(corte).length, 5);

console.log(falhas === 0 ? "OK: order-flow" : `${falhas} falha(s) em order-flow`);
