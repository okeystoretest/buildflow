import type { OrderStatus } from "@prisma/client";

/**
 * Tradução do fluxo interno de pedidos para a linguagem do CLIENTE FINAL.
 *
 * O acompanhamento externo ESPELHA o fluxo do sistema, mas não expõe o
 * vocabulário operacional (Conferindo, Embalando, Processado, Pendente...):
 * para quem comprou, isso é ruído — e, no caso de PENDENTE, é informação
 * interna de bloqueio que não deve virar alarme para o cliente.
 *
 * Por isso os 17 status do enum são agrupados em 5 etapas visíveis. Qualquer
 * status novo no enum obriga a decidir em qual etapa ele cai (o Record abaixo
 * é exaustivo, então o TypeScript acusa o esquecimento).
 */

export const CUSTOMER_STEPS = [
  "Aguardando Pagamento",
  "Pagamento Confirmado",
  "Em Separação",
  "Em Trânsito",
  "Entregue",
] as const;

export type CustomerStepIndex = 0 | 1 | 2 | 3 | 4;

/** Etapa visível de cada status. `null` = exceção (fora da linha do tempo). */
const STEP_BY_STATUS: Record<OrderStatus, CustomerStepIndex | null> = {
  // Retido no Financeiro: o cliente ainda aguarda a confirmação do pagamento.
  EM_ANALISE: 0,
  // Pagamento reconhecido — nos dois fluxos (simplificado usa PAGO, o padrão
  // aprova indo para AGUARDANDO_IMPRESSAO).
  PAGO: 1,
  AGUARDANDO_IMPRESSAO: 1,
  // Toda a operação de armazém vira uma única etapa: "Em Separação".
  SEPARANDO: 2,
  PENDENTE: 2,
  CONFERINDO: 2,
  EMBALANDO: 2,
  EMBALADO: 2,
  PROCESSANDO: 2,
  PROCESSADO: 2,
  // Saiu do armazém e está a caminho.
  ENVIADO: 3,
  EM_ROTA: 3,
  // Fim da jornada. CONCLUIDO é fechamento administrativo — para o cliente,
  // continua sendo "Entregue".
  ENTREGUE: 4,
  CONCLUIDO: 4,
  // Exceções: não são etapas do caminho, são desfechos.
  ESTORNO: null,
  ESTORNO_PARCIAL: null,
  CANCELADO: null,
};

const EXCEPTION_LABEL: Partial<Record<OrderStatus, string>> = {
  ESTORNO: "Pedido Estornado",
  ESTORNO_PARCIAL: "Estorno Parcial",
  CANCELADO: "Pedido Cancelado",
};

export interface CustomerStatusView {
  /** Rótulo amigável exibido ao cliente. */
  label: string;
  /** Índice da etapa concluída/atual (0..4); null nas exceções. */
  step: CustomerStepIndex | null;
  /** true quando o pedido saiu do caminho normal (estorno/cancelamento). */
  exception: boolean;
}

export function customerStatusView(status: OrderStatus): CustomerStatusView {
  const step = STEP_BY_STATUS[status];
  if (step === null) {
    return {
      label: EXCEPTION_LABEL[status] ?? "Pedido Cancelado",
      step: null,
      exception: true,
    };
  }
  return { label: CUSTOMER_STEPS[step], step, exception: false };
}

/** Caminho (relativo) do link de acompanhamento de um pedido. */
export function trackingPath(token: string): string {
  return `/acompanhar/${token}`;
}

/** Data e hora no formato brasileiro, como o cliente espera ler. */
export function formatDateTimeBR(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

/** Só a data (usada na lista do histórico, onde a hora é ruído). */
export function formatDateBR(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}
