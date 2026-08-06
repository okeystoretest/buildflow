// Comissão de campanha por ITEM (peça), compartilhada pelo Rank e pelo
// Relatório de Campanha. Mantém a regra num único lugar.
//
// Regra de negócio — valor BASE por peça conforme o modelo de venda:
//             │ Sem desconto (100%) │ Com desconto (50%)
//   Atacado   │       R$4,00        │      R$2,00
//   Varejo    │       R$5,00        │      R$2,50
//
// "Sem desconto" paga 100% do valor base; "com desconto" paga 50%. A dimensão
// do desconto é POR PEDIDO (Order.campaignDiscount).
//
// NÃO adicionar "use server" aqui: é usado por Server Components (páginas) e
// por módulos server-side comuns.

export type CommissionScope = "VAREJO" | "ATACADO" | null;

const COMISSAO_POR_ITEM: Record<"VAREJO" | "ATACADO", { normal: number; desconto: number }> = {
  VAREJO: { normal: 5, desconto: 2.5 },
  ATACADO: { normal: 4, desconto: 2 },
};

/** Valor da comissão de UMA peça, conforme escopo e desconto do pedido. */
export function taxaItemCampanha(scope: CommissionScope, desconto: boolean): number {
  if (!scope) return 0;
  return desconto ? COMISSAO_POR_ITEM[scope].desconto : COMISSAO_POR_ITEM[scope].normal;
}

/** Comissão total de um item de campanha (quantidade × taxa por peça). */
export function comissaoDoItem(
  scope: CommissionScope,
  desconto: boolean,
  quantity: number,
): number {
  return taxaItemCampanha(scope, desconto) * (quantity || 0);
}
