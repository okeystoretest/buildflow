import type { OrderStatus } from "@prisma/client";
import { STATUS_SETOR, type Setor } from "@/lib/order-flow";

/**
 * RELATÓRIO DE ATRASOS — camada pura
 * ---------------------------------------------------------------------------
 * Diferente do Relatório de Pendências, aqui NÃO há trilha para reconstruir: a
 * justificativa de atraso é uma linha de OrderDelayReason, gravada pelo quadro
 * quando o card passa do prazo da etapa (ver src/lib/actions/delays.ts). Como a
 * tabela tem UNIQUE (orderId, status), cada pedido tem no máximo uma
 * justificativa por etapa — e o relatório as agrupa por pedido/comanda.
 *
 * Este módulo só define as fichas e a conta do resumo, sem Prisma e sem
 * layout, para que a tela, o PDF e a checagem leiam a mesma regra.
 */

export interface AtrasoJustificativa {
  id: string;
  /** Etapa em que o pedido atrasou (não o status atual dele). */
  status: OrderStatus;
  /** Setor dono da etapa — quem respondeu pelo atraso. */
  setor: Setor;
  reason: string;
  minutesLate: number;
  autor: string | null;
  createdAt: string; // ISO
}

/** Ficha de um pedido no relatório: a tela e o gerador de PDF consomem esta. */
export interface AtrasoPedido {
  id: string;
  orderNumber: string;
  comandaNumber: string | null;
  /** Status ATUAL do pedido (onde ele está hoje). */
  status: OrderStatus;
  customerName: string;
  customerCode: string;
  sellerName: string;
  orderTypeName: string;
  originStoreName: string | null;
  criadoEm: string;
  /** Da etapa mais recente para a mais antiga. */
  justificativas: AtrasoJustificativa[];
}

export interface ResumoAtrasos {
  pedidos: number;
  justificativas: number;
  /** Média dos minutos de atraso justificados (null quando não há nenhum). */
  mediaAtrasoMin: number | null;
  /** Maior atraso justificado do recorte. */
  piorAtrasoMin: number | null;
  /** Etapa com mais justificativas, para abrir o relatório já apontando. */
  etapaCritica: { status: OrderStatus; total: number } | null;
}

export function setorDaEtapa(status: OrderStatus): Setor {
  return STATUS_SETOR[status];
}

export function resumirAtrasos(pedidos: AtrasoPedido[]): ResumoAtrasos {
  const js = pedidos.flatMap((p) => p.justificativas);
  const atrasos = js.map((j) => j.minutesLate);

  const porEtapa = new Map<OrderStatus, number>();
  for (const j of js) porEtapa.set(j.status, (porEtapa.get(j.status) ?? 0) + 1);

  // Empate resolvido pela ordem de inserção (Map preserva), e não ao acaso:
  // duas execuções do mesmo filtro devem imprimir a mesma etapa crítica.
  let etapaCritica: ResumoAtrasos["etapaCritica"] = null;
  for (const [status, total] of porEtapa) {
    if (!etapaCritica || total > etapaCritica.total) etapaCritica = { status, total };
  }

  return {
    pedidos: pedidos.length,
    justificativas: js.length,
    mediaAtrasoMin: atrasos.length
      ? Math.round(atrasos.reduce((s, v) => s + v, 0) / atrasos.length)
      : null,
    piorAtrasoMin: atrasos.length ? Math.max(...atrasos) : null,
    etapaCritica,
  };
}
