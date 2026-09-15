import type { TransportStatus } from "@prisma/client";

/**
 * Regras de status do chamado de transporte (vindo do Build.Connect).
 *
 * Puro — sem I/O — para servir tanto as Server Actions quanto os
 * scripts/checks. O fluxo e o MESMO do Connect: Em Aberto -> Atribuido ->
 * Em Rota -> Concluido, com Cancelado como saida a qualquer momento antes do
 * fim. "Desatribuir" devolve para Em Aberto.
 */

/** Colunas do quadro, na ordem. Cancelado nao tem coluna: vai ao historico. */
export const TRANSPORT_COLUMNS: readonly TransportStatus[] = [
  "ABERTO",
  "ATRIBUIDO",
  "EM_ROTA",
  "CONCLUIDO",
];

/** Concluido fica este tempo no quadro e depois so aparece no historico. */
export const CONCLUDED_WINDOW_MIN = 15;

export interface TransportStatusStyle {
  label: string;
  badge: string;
  dot: string;
  header: string;
}

// Mesma forma do STATUS_STYLE de order-flow.ts, para o badge e o cabecalho
// de coluna ficarem iguais aos do resto do sistema.
export const TRANSPORT_STATUS_STYLE: Record<TransportStatus, TransportStatusStyle> = {
  ABERTO:    { label: "Em Aberto",  badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400", dot: "bg-amber-600",  header: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40" },
  ATRIBUIDO: { label: "Atribuído",  badge: "bg-sky-400/15 text-sky-700 dark:text-sky-300",       dot: "bg-sky-400",    header: "bg-sky-400/15 text-sky-700 dark:text-sky-300 border-sky-400/40" },
  EM_ROTA:   { label: "Em Rota",    badge: "bg-motorista/15 text-motorista",                     dot: "bg-motorista",  header: "bg-motorista/15 text-motorista border-motorista/40" },
  CONCLUIDO: { label: "Concluído",  badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-600", header: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40" },
  CANCELADO: { label: "Cancelado",  badge: "bg-destructive/15 text-destructive",                 dot: "bg-destructive", header: "bg-destructive/15 text-destructive border-destructive/40" },
};

/** Status como o Connect o grava no espelho (enum TicketStatus de la). */
export type ConnectTicketStatus =
  | "PENDENTE"
  | "ATRIBUIDO"
  | "EM_ANDAMENTO"
  | "CONCLUIDO"
  | "CANCELADO";

export function toConnectStatus(status: TransportStatus): ConnectTicketStatus {
  switch (status) {
    case "ABERTO":
      return "PENDENTE";
    case "ATRIBUIDO":
      return "ATRIBUIDO";
    case "EM_ROTA":
      return "EM_ANDAMENTO";
    case "CONCLUIDO":
      return "CONCLUIDO";
    case "CANCELADO":
      return "CANCELADO";
  }
}

const ALLOWED: Record<TransportStatus, readonly TransportStatus[]> = {
  ABERTO: ["ATRIBUIDO", "CANCELADO"],
  ATRIBUIDO: ["EM_ROTA", "ABERTO", "CANCELADO"],
  EM_ROTA: ["CONCLUIDO", "CANCELADO"],
  CONCLUIDO: [],
  CANCELADO: [],
};

export function canTransition(from: TransportStatus, to: TransportStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function isFinal(status: TransportStatus): boolean {
  return status === "CONCLUIDO" || status === "CANCELADO";
}
