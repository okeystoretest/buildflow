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

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("select-roadmap: todas as checagens passaram.");
