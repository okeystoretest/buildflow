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

// ---------------------------------------------------------------------------
// PERFORMANCE DA CAMPANHA DE SELECT
//
// A campanha de Select conta VENDAS DO SERVICO, nao pecas. Um contrato e uma
// venda; dez pecas num pedido sao dez. Por isso ela nao pode reusar a conta da
// campanha comum, que soma `itemCount` e multiplica por R$ 5,00.
//
// Decisoes do dono em 26/10/2026:
//  - a tabela e POR VENDEDORA, como nas outras campanhas (a lista nominal de
//    contratos saiu do bloco; o KPI ao lado segue mostrando o total do mes);
//  - Select NAO gera premiacao. Pecas pagam R$ 5,00 cada; aplicar isso a um
//    contrato inventaria um valor que ninguem definiu, e o principio 3 do
//    produto e que o sistema informa, nao inventa movimento financeiro;
//  - quem vendeu SEM meta vinculada APARECE, com meta zero. A campanha de
//    pecas esconde esse caso, e herdar a regra faria uma venda real sumir do
//    telao — e o total do bloco nao bateria com a soma das linhas.
// ---------------------------------------------------------------------------

/** Um contrato Select ja atribuido a uma campanha (pela marca). */
export interface SelectCampaignVenda {
  sellerId: string;
  sellerName: string;
  /** Valor TOTAL do contrato (mensalidade x validade), como no resto do rank. */
  valor: number;
}

/** Meta de Selects de uma vendedora nesta campanha. */
export interface SelectCampaignMeta {
  userId: string;
  userName: string;
  targetItems: number;
}

export interface SelectCampaignRow {
  nome: string;
  meta: number;
  qtd: number;
  valor: number;
  premiacao: number;
  pct: number;
}

/**
 * A tabela por vendedora de uma campanha de Select.
 *
 * Entra quem tem meta OU quem vendeu — a uniao dos dois, nao a intersecao.
 * `qtd` e a CONTAGEM de contratos, e e ela que forma o percentual contra a
 * meta; `valor` e a soma dos contratos, e nao entra no percentual.
 *
 * Ordena como a campanha de pecas: maior percentual primeiro, e a quantidade
 * desempata. Sem meta o percentual e 0, entao essas linhas caem para o fim
 * sem precisar de caso especial.
 */
export function selectCampaignRows(
  vendas: SelectCampaignVenda[],
  metas: SelectCampaignMeta[],
): SelectCampaignRow[] {
  const porVend = new Map<string, { nome: string; meta: number; qtd: number; valor: number }>();

  // Primeiro as metas: quem tem meta e nao vendeu precisa aparecer zerada,
  // senao a cobranca do mes some junto com a venda que nao houve.
  for (const m of metas) {
    const cur = porVend.get(m.userId) ?? { nome: m.userName, meta: 0, qtd: 0, valor: 0 };
    cur.meta += m.targetItems;
    porVend.set(m.userId, cur);
  }

  for (const v of vendas) {
    const cur = porVend.get(v.sellerId) ?? { nome: v.sellerName, meta: 0, qtd: 0, valor: 0 };
    cur.qtd += 1;
    cur.valor += v.valor;
    porVend.set(v.sellerId, cur);
  }

  return [...porVend.values()]
    .map((v) => ({
      nome: v.nome,
      meta: v.meta,
      qtd: v.qtd,
      valor: v.valor,
      premiacao: 0,
      pct: v.meta > 0 ? Math.round((v.qtd / v.meta) * 100) : 0,
    }))
    .sort((a, b) => b.pct - a.pct || b.qtd - a.qtd);
}
