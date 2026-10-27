/**
 * Checagem da régua de entrega do Select.
 *
 * O que está em jogo: a régua é um registro de ENTREGA. Uma etapa que pode ser
 * marcada fora de ordem produz "benefício entregue" num contrato cuja venda
 * ainda não foi fechada, e o percentual é lido como se fosse verdade. A
 * invariante é uma só — nenhuma concluída depois de uma pendente — e ela
 * precisa das DUAS guardas: concluir e desfazer.
 *
 * Rode com: npx tsx scripts/checks/select-roadmap.ts
 */
import {
  ETAPAS_PREVIAS,
  buildRoadmapSteps,
  canCompleteStep,
  canUndoStep,
  canEditRoadmap,
  roadmapProgress,
} from "../../src/lib/select-roadmap";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  console.log(`${ok ? "ok" : "FALHOU"} ${nome}`);
  if (!ok) {
    falhas++;
    console.log(`  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

// --- montagem da régua ------------------------------------------------------
const regua = buildRoadmapSteps(["Treinamentos gravados", "Consultoria inicial"]);

check("as prévias vêm antes de todo benefício", regua.slice(0, ETAPAS_PREVIAS.length).map((e) => e.label), [...ETAPAS_PREVIAS]);
check("os benefícios vêm na ordem recebida", regua.slice(ETAPAS_PREVIAS.length).map((e) => e.label), ["Treinamentos gravados", "Consultoria inicial"]);
// sortOrder contíguo começando em 1 é o que faz "a anterior" existir: um furo
// na numeração destravaria a etapa seguinte sem a anterior concluída.
check("sortOrder contíguo a partir de 1", regua.map((e) => e.sortOrder), [1, 2, 3, 4]);

// Plano só com benefício casual ainda tem as prévias: a venda acontece, só não
// há entregável para acompanhar.
check("sem benefício executável, só as prévias", buildRoadmapSteps([]).length, ETAPAS_PREVIAS.length);

// --- a ordem, que é a regra de pré-requisito --------------------------------
const nenhuma = [1, 2, 3].map((sortOrder) => ({ sortOrder, done: false }));
check("a primeira está sempre liberada", canCompleteStep(nenhuma, 1), true);
check("a segunda não, com a primeira pendente", canCompleteStep(nenhuma, 2), false);
check("a terceira não, com tudo pendente", canCompleteStep(nenhuma, 3), false);

const primeiraFeita = [
  { sortOrder: 1, done: true },
  { sortOrder: 2, done: false },
  { sortOrder: 3, done: false },
];
check("a segunda libera quando a primeira cai", canCompleteStep(primeiraFeita, 2), true);
check("a terceira continua travada", canCompleteStep(primeiraFeita, 3), false);
check("concluir de novo a já concluída: não", canCompleteStep(primeiraFeita, 1), false);

// Desfazer é a MESMA invariante pelo outro lado. Sem esta guarda, desfazer a 1
// com a 2 concluída deixa exatamente o estado que canCompleteStep impede.
const duasFeitas = [
  { sortOrder: 1, done: true },
  { sortOrder: 2, done: true },
  { sortOrder: 3, done: false },
];
check("desfazer a última concluída: pode", canUndoStep(duasFeitas, 2), true);
check("desfazer a 1 com a 2 concluída: não", canUndoStep(duasFeitas, 1), false);
check("desfazer uma pendente: não", canUndoStep(duasFeitas, 3), false);

// Etapa que não existe não pode nada — e não pode estourar.
check("etapa inexistente não conclui", canCompleteStep(duasFeitas, 99), false);
check("etapa inexistente não desfaz", canUndoStep(duasFeitas, 99), false);

// --- progresso --------------------------------------------------------------
check("progresso conta as concluídas", roadmapProgress(duasFeitas), { done: 2, total: 3, percent: 67 });
check("régua vazia é 0%, não divisão por zero", roadmapProgress([]), { done: 0, total: 0, percent: 0 });
check("tudo concluído é 100%", roadmapProgress([{ sortOrder: 1, done: true }]), { done: 1, total: 1, percent: 100 });

// --- quem pode mexer na regua -----------------------------------------------
// O escopo da vendedora e a unica guarda que depende de QUEM clicou, e nao do
// estado da regua. Errar para o lado permissivo deixa uma vendedora registrar
// entrega no contrato de outra.
const contrato = { responsibleId: "u-ana" };
check("financeiro mexe em qualquer contrato", canEditRoadmap({ role: "FINANCEIRO", userId: "u-fin" }, contrato), true);
check("gestao mexe em qualquer contrato", canEditRoadmap({ role: "GESTAO", userId: "u-ges" }, contrato), true);
check("a vendedora responsavel mexe", canEditRoadmap({ role: "VENDAS", userId: "u-ana" }, contrato), true);
check("outra vendedora NAO mexe", canEditRoadmap({ role: "VENDAS", userId: "u-bia" }, contrato), false);
// Papel que nem chega na action hoje: a funcao nega por padrao, e nao por
// ausencia de caso.
check("papel sem relacao com o Select nao mexe", canEditRoadmap({ role: "LOGISTICA", userId: "u-log" }, contrato), false);
check("papel desconhecido nao mexe", canEditRoadmap({ role: "", userId: "u-ana" }, contrato), false);

// --- as previas nascem CONCLUIDAS -------------------------------------------
// Decisao do dono em 27/10/2026: se o contrato existe, apresentar o servico e
// fechar a negociacao ja aconteceram. O que esta em jogo e nao estender isso a
// BENEFICIO: um beneficio nascendo entregue seria entrega registrada sem
// ninguem ter entregue nada.
check("as duas previas nascem concluidas", regua.filter((e) => e.done).map((e) => e.label), [...ETAPAS_PREVIAS]);
check("nenhum beneficio nasce entregue", regua.slice(ETAPAS_PREVIAS.length).every((e) => !e.done), true);
// A marca e pela POSICAO, nao pelo texto: comparar rotulo quebraria no dia em
// que alguem corrigisse uma virgula em ETAPAS_PREVIAS.
check("plano so com beneficio casual nasce com as previas concluidas", buildRoadmapSteps([]).every((e) => e.done), true);
// A regra de ordem continua valendo por cima: com as duas previas ja feitas, a
// proxima liberada e a 3, e a 2 pode ser desfeita (e a ultima concluida).
const nascido = regua.map((e) => ({ sortOrder: e.sortOrder, done: e.done }));
check("com as previas feitas, a liberada e a terceira", canCompleteStep(nascido, 3), true);
check("e a segunda ainda pode ser desfeita", canUndoStep(nascido, 2), true);
check("a primeira nao, porque a segunda esta concluida", canUndoStep(nascido, 1), false);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("select-roadmap: todas as checagens passaram.");
