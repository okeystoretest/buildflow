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

export const PIECE_COLUMNS: PieceStatus[] = ["EM_USO", "DEVOLVIDO", "EM_MANUTENCAO"];

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

/** Coluna virtual (não é valor do enum): peça ainda não entregue à blogueira. */
export const AGUARDANDO_ENTREGA_LABEL = "Aguardando Entrega";

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

/**
 * Transições permitidas no quadro, a partir do estado atual.
 * - Sem estado (null): só entra em EM_USO, e apenas se a entrega foi registrada
 *   (a checagem de entrega é feita na action, com dados do banco).
 * - EM_USO        -> DEVOLVIDO | EM_MANUTENCAO
 * - EM_MANUTENCAO -> EM_USO | DEVOLVIDO
 * - DEVOLVIDO     -> EM_USO | EM_MANUTENCAO  (reempréstimo / defeito detectado)
 */
export function allowedPieceTargets(current: PieceStatus | null): PieceStatus[] {
  if (!current) return ["EM_USO"];
  return PIECE_COLUMNS.filter((s) => s !== current);
}

export function canMovePiece(current: PieceStatus | null, to: PieceStatus): boolean {
  return allowedPieceTargets(current).includes(to);
}
