// Definicoes centrais do fluxo de status de pedidos (Build.Flow).
// Fonte unica de verdade para ordem, rotulos, cores e transicoes.

import type { OrderStatus } from "@prisma/client";

// Ordem sequencial do ciclo de vida (status operacionais, sem excecoes).
export const ORDER_FLOW: OrderStatus[] = [
  "EM_ANALISE",
  "AGUARDANDO_IMPRESSAO",
  "SEPARANDO",
  "PENDENTE",
  "CONFERINDO",
  "EMBALANDO",
  "EMBALADO",
  "PROCESSANDO",
  "PROCESSADO",
  "ENVIADO",
  "EM_ROTA",
  "ENTREGUE",
  "CONCLUIDO",
];

// Colunas do Dashboard principal: 12 status, SEM "Concluído"
// (Concluído aparece apenas no Histórico do vendedor). Layout 2 linhas x 6.
export const DASHBOARD_COLUMNS: OrderStatus[] = ORDER_FLOW.filter(
  (s) => s !== "CONCLUIDO",
);

// Estados de excecao (definidos pelo Financeiro).
export const EXCEPTION_STATUSES: OrderStatus[] = [
  "ESTORNO",
  "ESTORNO_PARCIAL",
  "CANCELADO",
];

// Rotulos legiveis em PT-BR.
export const STATUS_LABEL: Record<OrderStatus, string> = {
  EM_ANALISE: "Em Análise",
  AGUARDANDO_IMPRESSAO: "Aguardando Impressão",
  SEPARANDO: "Separando",
  PENDENTE: "Pendente",
  CONFERINDO: "Conferindo",
  EMBALANDO: "Embalando",
  EMBALADO: "Embalado",
  PROCESSANDO: "Processando",
  PROCESSADO: "Processado",
  ENVIADO: "Enviado",
  EM_ROTA: "Em Rota",
  ENTREGUE: "Entregue",
  CONCLUIDO: "Concluído",
  ESTORNO: "Estorno",
  ESTORNO_PARCIAL: "Estorno Parcial",
  CANCELADO: "Cancelado",
};

// Qual setor "possui" cada status (para colunas do Kanban e permissoes).
export type Setor = "VENDAS" | "FINANCEIRO" | "LOGISTICA" | "MOTORISTA";

export const STATUS_SETOR: Record<OrderStatus, Setor> = {
  EM_ANALISE: "FINANCEIRO",
  AGUARDANDO_IMPRESSAO: "LOGISTICA",
  SEPARANDO: "LOGISTICA",
  PENDENTE: "LOGISTICA",
  CONFERINDO: "LOGISTICA",
  EMBALANDO: "LOGISTICA",
  EMBALADO: "LOGISTICA",
  PROCESSANDO: "LOGISTICA",
  PROCESSADO: "LOGISTICA",
  ENVIADO: "MOTORISTA",
  EM_ROTA: "MOTORISTA",
  ENTREGUE: "MOTORISTA",
  CONCLUIDO: "VENDAS",
  ESTORNO: "FINANCEIRO",
  ESTORNO_PARCIAL: "FINANCEIRO",
  CANCELADO: "FINANCEIRO",
};

// Status visiveis para o motorista: fluxo logistico restrito.
// Apenas Enviado -> Em Rota -> Entregue. Estagios anteriores nao aparecem.
export const MOTORISTA_VISIBLE: OrderStatus[] = [
  "ENVIADO",
  "EM_ROTA",
  "ENTREGUE",
];

// Colunas do fluxo do motorista, na ordem de progressao.
export const MOTORISTA_COLUMNS: OrderStatus[] = [
  "ENVIADO",
  "EM_ROTA",
  "ENTREGUE",
];

// Proximo status no fluxo linear (para o "atalho operacional" da Logistica).
export function nextStatus(current: OrderStatus): OrderStatus | null {
  const idx = ORDER_FLOW.indexOf(current);
  if (idx === -1 || idx === ORDER_FLOW.length - 1) return null;
  return ORDER_FLOW[idx + 1];
}

// Valida se uma transicao manual e permitida (avancar 1 passo, ou excecao).
export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  if (EXCEPTION_STATUSES.includes(to)) return true; // financeiro pode interromper
  return nextStatus(from) === to;
}

// ---------------------------------------------------------------------------
// Estilo visual por status (cor consistente em todo o sistema).
// Classes Tailwind para texto/fundo/borda de badges e cards.
// ---------------------------------------------------------------------------
export interface StatusStyle {
  label: string;
  badge: string; // classes para Badge (fundo + texto)
  dot: string; // classe de cor para um ponto/indicador
  header: string; // classes de cor do cabecalho da coluna (fundo + texto + borda)
}

export const STATUS_STYLE: Record<OrderStatus, StatusStyle> = {
  EM_ANALISE:           { label: "Em Análise",          badge: "bg-muted text-muted-foreground",     dot: "bg-slate-600",      header: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/40" },
  AGUARDANDO_IMPRESSAO: { label: "Aguardando Impressão", badge: "bg-primary/15 text-primary",        dot: "bg-yellow-500",        header: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/40" },
  SEPARANDO:            { label: "Separando",           badge: "bg-primary/15 text-primary",        dot: "bg-cyan-600",       header: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/40" },
  PENDENTE:             { label: "Pendente",            badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400",     dot: "bg-amber-600",      header: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40" },
  CONFERINDO:           { label: "Conferindo",          badge: "bg-primary/15 text-primary",        dot: "bg-teal-600",       header: "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/40" },
  EMBALANDO:            { label: "Embalando",           badge: "bg-distribuicao/15 text-distribuicao", dot: "bg-indigo-600",   header: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/40" },
  EMBALADO:            { label: "Embalado",            badge: "bg-distribuicao/15 text-distribuicao", dot: "bg-violet-600",   header: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/40" },
  PROCESSANDO:          { label: "Processando",         badge: "bg-distribuicao/15 text-distribuicao", dot: "bg-fuchsia-600",  header: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/40" },
  PROCESSADO:           { label: "Processado",          badge: "bg-distribuicao/20 text-distribuicao", dot: "bg-purple-600",   header: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/40" },
  ENVIADO:              { label: "Enviado",             badge: "bg-motorista/15 text-motorista", dot: "bg-blue-600",          header: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/40" },
  EM_ROTA:              { label: "Em Rota",             badge: "bg-motorista/15 text-motorista", dot: "bg-lime-600",          header: "bg-lime-500/15 text-lime-700 dark:text-lime-300 border-lime-500/40" },
  ENTREGUE:             { label: "Entregue",            badge: "bg-motorista/20 text-motorista",  dot: "bg-emerald-600",      header: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40" },
  CONCLUIDO:            { label: "Concluído",           badge: "bg-motorista/20 text-motorista",  dot: "bg-green-700",        header: "bg-green-600/15 text-green-700 dark:text-green-300 border-green-600/40" },
  ESTORNO:              { label: "Estorno",             badge: "bg-destructive/15 text-destructive",         dot: "bg-red-600",  header: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40" },
  ESTORNO_PARCIAL:      { label: "Estorno Parcial",     badge: "bg-destructive/15 text-destructive",         dot: "bg-orange-600",  header: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/40" },
  CANCELADO:            { label: "Cancelado",           badge: "bg-destructive/15 text-destructive",         dot: "bg-rose-600",  header: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40" },
};
