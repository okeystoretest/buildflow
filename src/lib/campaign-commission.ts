// Premiação de campanha por PEÇA, compartilhada pelo Ranking de Vendas e pelo
// Relatório de Campanha. Mantém a regra num único lugar.
//
// REGRA DE NEGÓCIO VIGENTE
// Toda peça que faz parte de campanha gera R$ 5,00 de premiação para a
// vendedora. Valor único: não depende mais do modelo de venda (Atacado/Varejo)
// nem de o pedido ter sido marcado com desconto.
//
// O que existia antes (e foi removido):
//             │ Sem desconto │ Com desconto
//   Atacado   │    R$4,00    │    R$2,00
//   Varejo    │    R$5,00    │    R$2,50
// A coluna `Order.campaignDiscount` continua no banco por causa do histórico
// já gravado, mas NÃO é mais lida por nenhum cálculo nem preenchida por
// nenhuma tela.
//
// O termo passou de "Comissão" para "PREMIAÇÃO" em toda a interface.
//
// NÃO adicionar "use server" aqui: é usado por Server Components (páginas) e
// por módulos server-side comuns.

/** Valor fixo, em R$, pago por peça de campanha. */
export const PREMIACAO_POR_PECA = 5;

/** Premiação de UMA peça de campanha. */
export function premiacaoPorPeca(): number {
  return PREMIACAO_POR_PECA;
}

/** Premiação total de um item de campanha (quantidade × R$ 5,00). */
export function premiacaoDoItem(quantity: number): number {
  return PREMIACAO_POR_PECA * (quantity || 0);
}
