import type { OrderStatus, PieceStatus, Role } from "@prisma/client";

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
 *
 * Ordem vigente:  Em Uso → Reprocessamento → Devolvido → Finalizado
 *
 * "Devolvido" e "Reprocessamento" trocaram de lugar: a peça que volta passa
 * primeiro pelo reprocessamento e só então é dada como devolvida ao estoque.
 * "Finalizado" é o estado TERMINAL — só ao chegar nele o fluxo do pedido é
 * considerado encerrado.
 */
export const PIECE_FLOW: PieceStatus[] = [
  "EM_USO",
  "EM_MANUTENCAO",
  "DEVOLVIDO",
  "FINALIZADO",
];

/** Alias mantido para leitura: as colunas exibidas são a própria sequência. */
export const PIECE_COLUMNS: PieceStatus[] = PIECE_FLOW;

/**
 * Rótulos exibidos. EM_MANUTENCAO aparece como "Reprocessamento": mudança só
 * de nomenclatura, o valor no banco continua EM_MANUTENCAO (mesmo critério de
 * ENVIADO → "Pronto"). Renomear o valor exigiria reescrever todo o histórico
 * em PieceMovement sem nenhum ganho funcional.
 */
export const PIECE_LABEL: Record<PieceStatus, string> = {
  EM_USO: "Em Uso",
  EM_MANUTENCAO: "Reprocessamento",
  DEVOLVIDO: "Devolvido",
  FINALIZADO: "Finalizado",
};

/** Classes de cabeçalho de coluna (mesmo padrão visual do Kanban de pedidos). */
export const PIECE_HEADER: Record<PieceStatus, string> = {
  EM_USO: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40",
  EM_MANUTENCAO: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40",
  DEVOLVIDO: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
  FINALIZADO: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/40",
};

/** Ponto colorido do cabeçalho (equivalente ao STATUS_STYLE[...].dot). */
export const PIECE_DOT: Record<PieceStatus, string> = {
  EM_USO: "bg-amber-600",
  EM_MANUTENCAO: "bg-red-600",
  DEVOLVIDO: "bg-emerald-600",
  FINALIZADO: "bg-violet-600",
};

/** Coluna virtual (não é valor do enum): peça ainda não entregue à blogueira. */
export const AGUARDANDO_ENTREGA_LABEL = "Aguardando Entrega";
export const AGUARDANDO_ENTREGA_HEADER =
  "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/40";
export const AGUARDANDO_ENTREGA_DOT = "bg-slate-600";

// ---------------------------------------------------------------------------
// RETENÇÃO NO QUADRO
// ---------------------------------------------------------------------------

/**
 * Janela de permanência de um card FINALIZADO no quadro ativo: 30 dias.
 *
 * Passado o prazo o card é arquivado — sai do quadro operacional, mas
 * NADA é apagado: `Order.pieceStatus` continua FINALIZADO e a trilha em
 * PieceMovement permanece íntegra. Os arquivados ficam acessíveis pelo
 * "Histórico" do próprio módulo.
 *
 * O TTL de 30 MINUTOS que existia em "Devolvido" foi REMOVIDO. Ele fazia
 * sentido quando "Devolvido" era o fim da linha; agora o ciclo só encerra em
 * "Finalizado", e sumir em meia hora impediria a peça de ser finalizada.
 */
export const FINALIZADO_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** O card finalizado ainda deve aparecer no quadro? */
export function dentroDaJanelaFinalizado(
  finalizadoEm: string | Date | null,
  agora: number = Date.now(),
): boolean {
  if (!finalizadoEm) return true; // sem timestamp: mantém visível (não some sozinho)
  return agora - new Date(finalizadoEm).getTime() < FINALIZADO_TTL_MS;
}

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
// ENCERRAMENTO DO PEDIDO
// ---------------------------------------------------------------------------

/**
 * "O fluxo do pedido somente será considerado encerrado ao atingir Finalizado."
 *
 * Com esta constante ligada, mover a peça para FINALIZADO também conclui o
 * PEDIDO (status CONCLUIDO + entrada no histórico), quando ele ainda não estiver
 * num estado terminal. A regra vale só para pedidos de peça e nunca REGRIDE um
 * pedido já cancelado/estornado.
 *
 * Se a operação preferir que o quadro de peças não mexa no status do pedido,
 * basta trocar para `false` — nada mais precisa mudar.
 */
export const ENCERRA_PEDIDO_AO_FINALIZAR = true;

/** Status de pedido que já são finais: não são sobrescritos pelo módulo. */
export const STATUS_TERMINAIS: OrderStatus[] = [
  "CONCLUIDO",
  "CANCELADO",
  "ESTORNO",
  "ESTORNO_PARCIAL",
];

// ---------------------------------------------------------------------------
// PERMISSÕES DE MOVIMENTAÇÃO
// ---------------------------------------------------------------------------

/**
 * Card em "Finalizado" é congelado para o usuário padrão: só a GESTÃO pode
 * tirá-lo de lá. A trava vale para a ORIGEM do movimento — colocar uma peça
 * EM "Finalizado" continua liberado para a Logística.
 */
export function exigeGestaoParaMover(origem: PieceStatus | null): boolean {
  return origem === "FINALIZADO";
}

/** O papel pode mover uma peça que está em `origem`? */
export function podeMoverDe(origem: PieceStatus | null, role: Role): boolean {
  if (exigeGestaoParaMover(origem)) return role === "GESTAO";
  return role === "LOGISTICA" || role === "GESTAO";
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
