/**
 * ITENS DE CAMPANHA — validação, agregados e nota de auditoria, sem banco.
 * ---------------------------------------------------------------------------
 * Um pedido pode carregar VÁRIAS peças de campanha (CampaignItem), cada uma
 * com referência, quantidade e valor próprios. É a soma de `value` que alimenta
 * a coluna "Valor" do Ranking > Performance na Campanha, e a soma de
 * `quantity` que alimenta o volume — por isso mexer nesses itens depois do
 * pedido concluído é uma alteração de PONTUAÇÃO, e não um detalhe cadastral.
 *
 * Daí as duas responsabilidades deste módulo:
 *
 *   1. Validar cada item antes de gravar (referência, quantidade, valor), para
 *      que nenhum lançamento entre com peça sem nome, quantidade zero ou valor
 *      absurdo — o INTEGER e o DECIMAL(10,2) do banco não avisam com educação.
 *   2. Derivar os campos LEGADOS do pedido (`campaignId` e `itemCount`) a
 *      partir da lista de itens, do mesmo jeito que `createOrder`/`updateOrder`
 *      já fazem: campanha do primeiro item, `itemCount` = soma das quantidades.
 *      Se o CRUD do histórico esquecesse isso, o Rank passaria a discordar da
 *      própria tela que o alimenta.
 *
 * E a nota de auditoria: toda operação do CRUD grava uma linha no histórico do
 * pedido dizendo o que mudou e quem mudou. O texto sai daqui para ficar igual
 * nas três operações e testável sem banco.
 *
 * Valores em centavos por dentro (inteiros) para a soma não acumular erro de
 * ponto flutuante; a borda converte de/para reais — mesma escolha de
 * src/lib/order-returns.ts.
 */

export const MAX_REFERENCE_LENGTH = 120;
/** Teto de peças por item. Barra digitação errada antes do INTEGER do banco. */
export const MAX_ITEM_QUANTITY = 10000;
/** Teto de valor por item (R$). O banco é DECIMAL(10,2) — não cabe mais. */
export const MAX_ITEM_VALUE = 1_000_000;

export interface CampaignItemInput {
  campaignId: string;
  reference: string;
  quantity: number;
  value: number;
}

export type CampaignItemCheck =
  | { ok: true; item: CampaignItemInput }
  | { ok: false; error: string };

function toCents(v: number): number {
  return Math.round(v * 100);
}
function fromCents(c: number): number {
  return c / 100;
}
function fmt(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Valida e normaliza um item de campanha vindo da tela.
 *
 * A mensagem de erro é a que o usuário lê — quem chama devolve direto.
 */
export function normalizeCampaignItem(input: {
  campaignId?: unknown;
  reference?: unknown;
  quantity?: unknown;
  value?: unknown;
}): CampaignItemCheck {
  const campaignId = String(input.campaignId ?? "").trim();
  if (!campaignId) return { ok: false, error: "Selecione a campanha do item." };

  const reference = String(input.reference ?? "").replace(/\s+/g, " ").trim();
  if (!reference) return { ok: false, error: "Informe a referência da peça." };
  if (reference.length > MAX_REFERENCE_LENGTH) {
    return { ok: false, error: `Referência muito longa (máx. ${MAX_REFERENCE_LENGTH} caracteres).` };
  }

  const quantity = Number(input.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { ok: false, error: "Quantidade deve ser um número inteiro de 1 peça ou mais." };
  }
  if (quantity > MAX_ITEM_QUANTITY) {
    return { ok: false, error: `Quantidade acima do limite (máx. ${MAX_ITEM_QUANTITY} peças).` };
  }

  const rawValue = Number(input.value);
  if (!Number.isFinite(rawValue) || rawValue < 0) {
    return { ok: false, error: "Valor do item inválido." };
  }
  if (rawValue > MAX_ITEM_VALUE) {
    return { ok: false, error: `Valor acima do limite (máx. ${fmt(MAX_ITEM_VALUE)}).` };
  }
  // Arredonda para centavos: o banco é DECIMAL(10,2) e truncaria em silêncio.
  const value = fromCents(toCents(rawValue));

  return { ok: true, item: { campaignId, reference, quantity, value } };
}

/**
 * Campos legados do pedido derivados da lista de itens.
 *
 * `items` deve vir na ordem canônica das consultas (createdAt asc): a campanha
 * do pedido é a do PRIMEIRO item, como em createOrder/updateOrder. Lista vazia
 * = pedido fora de campanha (campaignId null, itemCount 0).
 */
export function aggregateCampaignFields(
  items: { campaignId: string; quantity: number }[],
): { campaignId: string | null; itemCount: number } {
  if (items.length === 0) return { campaignId: null, itemCount: 0 };
  return {
    campaignId: items[0].campaignId,
    itemCount: items.reduce((a, it) => a + it.quantity, 0),
  };
}

/** Soma dos valores dos itens, em reais (o que o Rank exibe como "Valor"). */
export function sumCampaignValue(items: { value: number }[]): number {
  return fromCents(items.reduce((a, it) => a + toCents(it.value), 0));
}

interface AuditItem {
  campaignName: string;
  reference: string;
  quantity: number;
  value: number;
}

/**
 * Nota gravada no histórico do pedido a cada operação do CRUD de campanha.
 *
 * Fica no mesmo lugar onde a devolução e as mudanças de status já aparecem, e o
 * autor vem do `changedBy` da linha — a ficha exibe "· por Fulano". É o registro
 * de auditoria da decisão de produto: todos os perfis editam, e quem editou
 * fica visível.
 */
export function campaignItemAuditNote(
  action: "add" | "update" | "remove",
  item: AuditItem,
  before?: AuditItem,
): string {
  const alvo = `${item.reference} x${item.quantity} — ${fmt(item.value)} (${item.campaignName})`;
  if (action === "add") return `Item de campanha adicionado: ${alvo}`;
  if (action === "remove") return `Item de campanha excluído: ${alvo}`;
  // Edição: só vale registrar o que mudou de fato.
  const mudancas: string[] = [];
  if (before) {
    if (before.campaignName !== item.campaignName) {
      mudancas.push(`campanha ${before.campaignName} -> ${item.campaignName}`);
    }
    if (before.reference !== item.reference) {
      mudancas.push(`referência ${before.reference} -> ${item.reference}`);
    }
    if (before.quantity !== item.quantity) {
      mudancas.push(`quantidade ${before.quantity} -> ${item.quantity}`);
    }
    if (toCents(before.value) !== toCents(item.value)) {
      mudancas.push(`valor ${fmt(before.value)} -> ${fmt(item.value)}`);
    }
  }
  return mudancas.length
    ? `Item de campanha editado (${item.reference}): ${mudancas.join("; ")}`
    : `Item de campanha editado: ${alvo}`;
}
