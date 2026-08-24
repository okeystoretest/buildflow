import type { OrderStatus, PieceStatus } from "@prisma/client";

/**
 * CONTROLE DE PEÇAS (Logística > "Controle de Peças")
 * ---------------------------------------------------------------------------
 * Escopo do módulo: SOMENTE pedidos cujo Tipo de Pedido é
 * "10 - Peças p/ Blogueira". A comparação é tolerante a acentos, caixa e
 * espaços (mesmo padrão de isTroca/isDoacao em validations/order.ts), porque o
 * nome do tipo é um cadastro livre da Gestão e pode variar na digitação.
 */
export const TIPO_PECAS_BLOGUEIRA = "10 - Peças p/ Blogueira";

function normalize(s?: string | null): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** O pedido é do tipo "10 - Peças p/ Blogueira"? */
export function isPecasBlogueira(orderTypeName?: string | null): boolean {
  return normalize(orderTypeName) === normalize(TIPO_PECAS_BLOGUEIRA);
}

// ---------------------------------------------------------------------------
// COLUNAS DO QUADRO
// ---------------------------------------------------------------------------

/**
 * Sequência LINEAR das colunas. O quadro replica o Fluxo de Pedidos: o card
 * anda um passo por vez, com seta para frente e seta para trás. Por isso a
 * ordem aqui não é decorativa — ela define o que cada seta faz.
 */
export const PIECE_FLOW: PieceStatus[] = ["EM_USO", "DEVOLVIDO", "EM_MANUTENCAO"];

/** Alias mantido para leitura: as colunas exibidas são a própria sequência. */
export const PIECE_COLUMNS: PieceStatus[] = PIECE_FLOW;

export const PIECE_LABEL: Record<PieceStatus, string> = {
  EM_USO: "Em Uso",
  DEVOLVIDO: "Devolvido",
  EM_MANUTENCAO: "Em Manutenção",
};

/** Classes de cabeçalho de coluna (mesmo padrão visual do Kanban de pedidos). */
export const PIECE_HEADER: Record<PieceStatus, string> = {
  EM_USO: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40",
  DEVOLVIDO: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
  EM_MANUTENCAO: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40",
};

/** Ponto colorido do cabeçalho (equivalente ao STATUS_STYLE[...].dot). */
export const PIECE_DOT: Record<PieceStatus, string> = {
  EM_USO: "bg-amber-600",
  DEVOLVIDO: "bg-emerald-600",
  EM_MANUTENCAO: "bg-red-600",
};

/** Coluna virtual (não é valor do enum): peça ainda não entregue à blogueira. */
export const AGUARDANDO_ENTREGA_LABEL = "Aguardando Entrega";
export const AGUARDANDO_ENTREGA_HEADER =
  "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/40";
export const AGUARDANDO_ENTREGA_DOT = "bg-slate-600";

/**
 * Janela de permanência de um card DEVOLVIDO no quadro ativo: 30 minutos.
 *
 * Mesma mecânica do card ENTREGUE no Fluxo de Pedidos (que some após 15 min):
 * a peça devolvida encerrou o ciclo e não deve poluir o quadro operacional. O
 * registro NÃO é apagado — `Order.pieceStatus` continua DEVOLVIDO e o histórico
 * em PieceMovement permanece íntegro; o card apenas deixa de ser exibido.
 */
export const DEVOLVIDO_TTL_MS = 30 * 60 * 1000;

// ---------------------------------------------------------------------------
// REGRA DE TRANSIÇÃO PARA "EM USO"
// ---------------------------------------------------------------------------

/**
 * A peça só pode entrar em "Em Uso" DEPOIS que o pedido registrou a entrega.
 *
 * Por que não basta olhar `order.status === "ENTREGUE"`: existem dois caminhos
 * de conclusão no Build.Flow.
 *   - Fluxo simplificado / avanço manual da Logística: o pedido para em ENTREGUE.
 *   - Fluxo do motorista (completeDelivery): ao anexar as fotos, o pedido pula
 *     direto para CONCLUIDO e a Delivery é que fica ENTREGUE.
 * Considerar só um dos caminhos deixaria metade das peças travadas fora do
 * quadro. Por isso aceitamos qualquer evidência de entrega registrada.
 */
export function foiEntregue(args: {
  status: OrderStatus;
  deliveryStatus?: string | null;
  deliveredAt?: Date | string | null;
  historyStatuses?: OrderStatus[];
}): boolean {
  if (args.status === "ENTREGUE" || args.status === "CONCLUIDO") return true;
  if (args.deliveryStatus === "ENTREGUE") return true;
  if (args.deliveredAt) return true;
  return (args.historyStatuses ?? []).some((s) => s === "ENTREGUE" || s === "CONCLUIDO");
}

// ---------------------------------------------------------------------------
// NAVEGAÇÃO LINEAR (setas para frente e para trás)
// ---------------------------------------------------------------------------

/**
 * Próxima coluna. A partir de `null` (Aguardando Entrega) o próximo é EM_USO —
 * mas a liberação depende da entrega registrada, checada na action.
 */
export function nextPieceStatus(current: PieceStatus | null): PieceStatus | null {
  if (!current) return PIECE_FLOW[0];
  const i = PIECE_FLOW.indexOf(current);
  if (i === -1 || i === PIECE_FLOW.length - 1) return null;
  return PIECE_FLOW[i + 1];
}

/**
 * Coluna anterior. Retorna null em EM_USO de propósito: voltar para
 * "Aguardando Entrega" significaria zerar `pieceStatus` e apagar o registro de
 * entrada no controle. A entrada é sempre consequência da entrega, nunca uma
 * escolha manual reversível.
 */
export function prevPieceStatus(current: PieceStatus | null): PieceStatus | null {
  if (!current) return null;
  const i = PIECE_FLOW.indexOf(current);
  if (i <= 0) return null;
  return PIECE_FLOW[i - 1];
}

/** Destinos válidos a partir do estado atual: só os vizinhos imediatos. */
export function allowedPieceTargets(current: PieceStatus | null): PieceStatus[] {
  return [nextPieceStatus(current), prevPieceStatus(current)].filter(
    (s): s is PieceStatus => s !== null,
  );
}

export function canMovePiece(current: PieceStatus | null, to: PieceStatus): boolean {
  return allowedPieceTargets(current).includes(to);
}
