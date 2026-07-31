import type { Role } from "@prisma/client";

/**
 * Regras de acesso a pedidos (fatia backend das novas regras de Loja de Origem).
 *
 * Principios (do documento + decisoes do produto):
 * - VISUALIZACAO: todos os usuarios podem VER todos os pedidos. Nao ha filtro
 *   de visualizacao aqui — a listagem nao restringe por criador nem por loja.
 * - INTERACAO (editar, mudar status, aprovar, dar andamento): permitida apenas
 *   para quem criou o pedido, para quem tem a Loja de Origem do pedido atrelada
 *   ao seu cadastro, ou para papeis privilegiados (GESTAO).
 *
 * Estas funcoes sao puras (sem I/O) para poderem ser usadas tanto em Server
 * Actions quanto em Server Components. Quem chama e responsavel por carregar os
 * dados (sellerId do pedido, originStoreId, lojas do usuario).
 */

export interface ActorContext {
  userId: string;
  role: Role;
  /** IDs das Lojas de Origem atreladas ao usuario logado. */
  originStoreIds: string[];
}

export interface OrderAccessInfo {
  sellerId: string;
  /** Loja de Origem do pedido (null em pedidos antigos). */
  originStoreId: string | null;
}

/**
 * GESTAO e FINANCEIRO enxergam e operam tudo, sem restricao de escopo.
 * FINANCEIRO foi incluido por decisao de produto: o setor Financeiro passa a
 * ter as MESMAS capacidades operacionais do modulo Vendas (ver/criar/editar
 * qualquer pedido), alem da aprovacao financeira que ja exercia.
 */
export function isPrivileged(role: Role): boolean {
  return role === "GESTAO" || role === "FINANCEIRO";
}

/**
 * Pode INTERAGIR com o pedido?
 * - GESTAO: sempre.
 * - Criador do pedido: sempre.
 * - Usuario com a Loja de Origem do pedido atrelada: sim (permite operar o
 *   fluxo por loja, ex.: Embalado -> Entregue na Logistica).
 * - Demais: nao.
 */
export function canInteractWithOrder(actor: ActorContext, order: OrderAccessInfo): boolean {
  if (isPrivileged(actor.role)) return true;
  if (order.sellerId === actor.userId) return true;
  if (order.originStoreId && actor.originStoreIds.includes(order.originStoreId)) {
    return true;
  }
  return false;
}

/**
 * Mensagem padrao de bloqueio de interacao, para reuso nas Server Actions.
 */
export const INTERACTION_DENIED_MSG =
  "Você não tem permissão para interagir com este pedido.";
