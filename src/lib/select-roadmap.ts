/**
 * ROADMAP DE ENTREGA DO SELECT — a régua de um contrato.
 *
 * O que ela é: as etapas prévias de negociação, e depois uma etapa por
 * benefício EXECUTÁVEL do plano comprado. Benefício casual/contínuo (suporte
 * sob demanda, atendimento recorrente) não tem marco de conclusão e por isso
 * não vira etapa nem entra no percentual — ele é listado à parte, fora da
 * régua.
 *
 * ETAPA É BINÁRIA: pendente ou concluída, avançada por clique. `doneAt` nulo é
 * pendente. Escolha do dono em 19/10/2026 sobre o fluxo de quatro estados.
 *
 * OS PRÉ-REQUISITOS SAEM DA ORDEM, não de uma coluna. "Validar pré-requisitos
 * antes de sinalizar a entrega do benefício" é, na prática, não deixar marcar
 * a etapa N com a N-1 pendente. Ordem é o que a régua já tem; um campo de
 * dependências seria estrutura nova para dizer a mesma coisa.
 *
 * Este arquivo é PURO (sem Prisma, sem "use server") para o check poder
 * exercitar a regra sem banco. A escrita vive em `actions/select-roadmap.ts`.
 */

/**
 * As etapas que antecedem a liberação dos benefícios, na ordem. Vêm antes de
 * todo benefício em todo plano: a entrega não começa antes de a venda existir.
 */
export const ETAPAS_PREVIAS = ["Serviço apresentado", "Negociação fechada"] as const;

export interface RoadmapStepInput {
  sortOrder: number;
  label: string;
}

/**
 * A régua de um contrato, pronta para gravar: prévias + benefícios executáveis
 * na ordem do plano. Recebe só os textos já filtrados por quem chamou.
 *
 * `sortOrder` começa em 1 e é contíguo — é ele que define o que vem antes de
 * quê, e portanto quem destrava quem.
 */
export function buildRoadmapSteps(executableBenefits: string[]): RoadmapStepInput[] {
  return [...ETAPAS_PREVIAS, ...executableBenefits].map((label, i) => ({
    sortOrder: i + 1,
    label,
  }));
}

export interface RoadmapStepState {
  sortOrder: number;
  done: boolean;
}

/**
 * Pode concluir? Só se a anterior já está concluída. A primeira não tem
 * anterior, então está sempre liberada.
 *
 * Já concluída devolve `false`: não há o que concluir de novo, e o botão da
 * tela vira "desfazer".
 */
export function canCompleteStep(steps: RoadmapStepState[], sortOrder: number): boolean {
  const alvo = steps.find((s) => s.sortOrder === sortOrder);
  if (!alvo || alvo.done) return false;
  const anterior = steps
    .filter((s) => s.sortOrder < sortOrder)
    .sort((a, b) => b.sortOrder - a.sortOrder)[0];
  return !anterior || anterior.done;
}

/**
 * Pode desfazer? Só se a seguinte NÃO está concluída.
 *
 * Sem esta metade, desfazer a etapa 2 deixaria a 3 concluída sobre uma
 * pendente — o estado que `canCompleteStep` existe para impedir, alcançado
 * pelo outro lado. A regra é "nenhuma concluída depois de uma pendente", e ela
 * precisa das duas guardas.
 */
export function canUndoStep(steps: RoadmapStepState[], sortOrder: number): boolean {
  const alvo = steps.find((s) => s.sortOrder === sortOrder);
  if (!alvo || !alvo.done) return false;
  const seguinte = steps
    .filter((s) => s.sortOrder > sortOrder)
    .sort((a, b) => a.sortOrder - b.sortOrder)[0];
  return !seguinte || !seguinte.done;
}

export interface RoadmapProgress {
  done: number;
  total: number;
  percent: number;
}

/**
 * Progresso CONTADO, nunca gravado: concluídas sobre total. Percentual
 * arredondado só na apresentação; régua vazia é 0% e não divisão por zero.
 */
export function roadmapProgress(steps: RoadmapStepState[]): RoadmapProgress {
  const total = steps.length;
  const done = steps.filter((s) => s.done).length;
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}
