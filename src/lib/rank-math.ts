/**
 * CONTA DO REALIZADO NO RANKING — sem banco.
 * ---------------------------------------------------------------------------
 * POR QUE ESTE MÓDULO EXISTE
 *
 * O KPI "Meta Geral" e a tabela de vendedoras precisam contar a MESMA
 * população, senão o painel se contradiz na própria tela. Antes:
 *
 *   - numerador  (`realizadoGeral`): somava os pedidos de TODOS os vendedores;
 *   - denominador (`metaGeral`):     somava apenas as metas cadastradas;
 *   - tabela:                        descartava quem não tem meta.
 *
 * Como `sellerId` é sempre quem CRIOU o pedido, todo pedido lançado por
 * GESTÃO/FINANCEIRO — e todo pedido de vendedora sem meta no mês — entrava no
 * KPI sem gerar linha nenhuma. Somar as linhas do quadro nunca fechava com o
 * KPI, e o percentual saía inflado.
 *
 * REGRA VIGENTE: só entra no realizado quem tem meta geral cadastrada no
 * período. O mesmo vale para o ajuste manual — um ajuste de vendedor sem meta
 * não pode mover um KPI em que ele não aparece.
 *
 * REGRA DE NEGÓCIO (mantida): o valor considerado é SEMPRE o "Valor Total do
 * Pedido" (`Order.orderValue`). Frete não entra, e nenhum outro campo de valor
 * é reaproveitado aqui.
 *
 * NÃO adicionar "use server": é usado por Server Components e por módulos
 * server-side comuns.
 */

export interface PedidoRank {
  sellerId: string;
  /** "Valor Total do Pedido", em reais. Nunca inclui frete. */
  orderValue: number;
  createdAt: Date;
}

export interface AjusteRank {
  /** Valor digitado pela Gestão, em reais. */
  amount: number;
  /** Instante até o qual `amount` responde pelo realizado. */
  corte: Date;
}

export interface ConsolidadoVendedor {
  /** Faturado pelo sistema no período. */
  total: number;
  /** Parcela do `total` que entrou A PARTIR do corte do ajuste. */
  posCorte: number;
}

export interface RealizadoRank {
  /** Soma consolidada pelo sistema, só de quem tem meta. */
  realizadoSistema: number;
  /** Diferença introduzida pelos ajustes manuais (pode ser negativa). */
  ajusteManualTotal: number;
  /** O que o KPI exibe. Igual à soma das linhas da tabela, por construção. */
  realizadoGeral: number;
  /** Uma entrada por vendedor COM meta — inclusive quem não vendeu nada. */
  porVendedor: Map<string, ConsolidadoVendedor>;
}

/**
 * Valor exibido na linha do vendedor.
 *
 * Com ajuste manual, o valor digitado responde pelo período até o corte e o
 * faturado posterior SOMA sobre ele (ajuste incremental). Sem ajuste, é o
 * consolidado puro.
 */
export function vendidoDoVendedor(v: ConsolidadoVendedor, ajuste?: AjusteRank): number {
  return ajuste ? ajuste.amount + v.posCorte : v.total;
}

/**
 * Consolida o realizado do período.
 *
 * `comMeta` é a população do quadro: os vendedores com meta geral cadastrada.
 * Pedidos e ajustes de quem está fora dela são ignorados de propósito — é o
 * que garante a invariante `realizadoGeral === Σ vendidoDoVendedor(...)`.
 */
export function computeRealizado(args: {
  pedidos: PedidoRank[];
  comMeta: Set<string>;
  ajustes: Map<string, AjusteRank>;
}): RealizadoRank {
  const porVendedor = new Map<string, ConsolidadoVendedor>();

  // Todo vendedor com meta tem linha, mesmo sem nenhum pedido: é o que permite
  // editar manualmente a linha de quem vendeu fora da plataforma.
  for (const userId of args.comMeta) {
    porVendedor.set(userId, { total: 0, posCorte: 0 });
  }

  for (const p of args.pedidos) {
    const consolidado = porVendedor.get(p.sellerId);
    if (!consolidado) continue; // sem meta no período: fora do quadro e do KPI
    consolidado.total += p.orderValue;
    const corte = args.ajustes.get(p.sellerId)?.corte;
    if (corte && p.createdAt >= corte) consolidado.posCorte += p.orderValue;
  }

  let realizadoSistema = 0;
  for (const v of porVendedor.values()) realizadoSistema += v.total;

  // O ajuste é incremental: substitui apenas o consolidado ATÉ o corte. O que
  // entrou depois já está em `realizadoSistema` e continua valendo.
  let ajusteManualTotal = 0;
  for (const [userId, ajuste] of args.ajustes) {
    const consolidado = porVendedor.get(userId);
    if (!consolidado) continue; // ajuste órfão: sem meta, sem linha, sem efeito
    const consolidadoAteCorte = consolidado.total - consolidado.posCorte;
    ajusteManualTotal += ajuste.amount - consolidadoAteCorte;
  }

  return {
    realizadoSistema,
    ajusteManualTotal,
    realizadoGeral: realizadoSistema + ajusteManualTotal,
    porVendedor,
  };
}
