/**
 * DEVOLUÇÕES — a conta, sem banco.
 * ---------------------------------------------------------------------------
 * O pedido não tem itens cadastrados: `orderValue` é um montante único, e só
 * os itens de CAMPANHA carregam referência. Por isso a devolução é uma lista
 * livre de (referência, quantidade, valor), e o que se abate é:
 *
 *   - `orderValue` (mercadoria) e, por consequência, `total = orderValue +
 *     frete`. O frete fica intacto: é repasse, não mercadoria devolvida.
 *   - Quando a referência digitada casa com a de um item de campanha do
 *     pedido, a quantidade e o valor daquele item também caem — é o que
 *     alimenta o volume e a coluna "Valor" do Ranking > Performance na
 *     Campanha. `itemCount` é recalculado como a soma das quantidades.
 *
 * O status do pedido NUNCA muda por devolução. Devolução maior que o valor
 * atual da mercadoria é recusada: não existe pedido com valor negativo.
 *
 * Valores em centavos por dentro (inteiros) para a soma não acumular erro de
 * ponto flutuante; a borda converte de/para reais.
 */

export interface ReturnItemInput {
  reference: string;
  quantity: number;
  value: number;
}

export interface CampaignItemState {
  id: string;
  reference: string;
  quantity: number;
  value: number;
}

export interface ReturnComputation {
  /** Soma dos valores devolvidos, em reais. */
  returnedValue: number;
  /** Quantidade total de peças devolvidas. */
  returnedQuantity: number;
  /** Novo valor da mercadoria, em reais. */
  orderValue: number;
  /** Novo total (mercadoria + frete), em reais. */
  total: number;
  /** Itens de campanha que mudam: id -> novos quantity/value. */
  campaignUpdates: { id: string; quantity: number; value: number }[];
  /** Novo `itemCount` (soma das quantidades de campanha após o abate). */
  itemCount: number;
}

export const MAX_RETURN_ITEMS = 50;
export const MAX_REFERENCE_LENGTH = 120;

function normalize(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function toCents(v: number): number {
  return Math.round(v * 100);
}

function fromCents(c: number): number {
  return c / 100;
}

/**
 * Valida a lista digitada. Devolve a mensagem do primeiro problema, ou null.
 * Regras curtas, de formulário: 1–50 linhas, referência preenchida, quantidade
 * inteira positiva, valor não negativo.
 */
export function validateReturnItems(items: ReturnItemInput[]): string | null {
  if (!Array.isArray(items) || items.length === 0) return "Informe ao menos um item devolvido.";
  if (items.length > MAX_RETURN_ITEMS) return `Máximo de ${MAX_RETURN_ITEMS} itens por devolução.`;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const ref = (it.reference ?? "").trim();
    const linha = `Item ${i + 1}`;
    if (!ref) return `${linha}: informe a referência.`;
    if (ref.length > MAX_REFERENCE_LENGTH) return `${linha}: referência muito longa.`;
    if (!Number.isInteger(it.quantity) || it.quantity <= 0) return `${linha}: quantidade deve ser um inteiro maior que zero.`;
    if (!Number.isFinite(it.value) || it.value < 0) return `${linha}: valor inválido.`;
  }
  return null;
}

/**
 * Aplica a devolução sobre o estado atual do pedido e devolve os novos
 * números. Lança `Error` com mensagem de usuário quando a soma passa do valor
 * da mercadoria — quem chama transforma em `actionError`.
 *
 * Duas linhas da devolução com a mesma referência somam sobre o mesmo item de
 * campanha; o abate nunca deixa quantidade ou valor negativos (o excedente
 * simplesmente não tem de onde sair).
 */
export function computeReturn(args: {
  orderValue: number;
  freight: number;
  campaignItems: CampaignItemState[];
  items: ReturnItemInput[];
}): ReturnComputation {
  const erro = validateReturnItems(args.items);
  if (erro) throw new Error(erro);

  const returnedCents = args.items.reduce((a, it) => a + toCents(it.value), 0);
  const returnedQuantity = args.items.reduce((a, it) => a + it.quantity, 0);
  const currentCents = toCents(args.orderValue);
  if (returnedCents > currentCents) {
    throw new Error(
      `O valor devolvido (${fmt(fromCents(returnedCents))}) é maior que o valor atual da mercadoria (${fmt(args.orderValue)}).`,
    );
  }
  const newOrderCents = currentCents - returnedCents;
  const totalCents = newOrderCents + toCents(args.freight);

  // Estado mutável dos itens de campanha, em centavos.
  const estado = new Map(
    args.campaignItems.map((c) => [
      c.id,
      { id: c.id, ref: normalize(c.reference), quantity: c.quantity, valueCents: toCents(c.value), changed: false },
    ]),
  );
  for (const it of args.items) {
    const ref = normalize(it.reference);
    // Primeiro item de campanha com a mesma referência que ainda tem saldo;
    // se nenhum tiver saldo, cai no primeiro que casar (para registrar zero).
    const candidatos = [...estado.values()].filter((c) => c.ref === ref);
    if (candidatos.length === 0) continue;
    const alvo = candidatos.find((c) => c.quantity > 0 || c.valueCents > 0) ?? candidatos[0];
    alvo.quantity = Math.max(0, alvo.quantity - it.quantity);
    alvo.valueCents = Math.max(0, alvo.valueCents - toCents(it.value));
    alvo.changed = true;
  }

  const campaignUpdates = [...estado.values()]
    .filter((c) => c.changed)
    .map((c) => ({ id: c.id, quantity: c.quantity, value: fromCents(c.valueCents) }));
  const itemCount = [...estado.values()].reduce((a, c) => a + c.quantity, 0);

  return {
    returnedValue: fromCents(returnedCents),
    returnedQuantity,
    orderValue: fromCents(newOrderCents),
    total: fromCents(totalCents),
    campaignUpdates,
    itemCount,
  };
}

function fmt(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Nota gravada no histórico do pedido a cada devolução. */
export function returnHistoryNote(c: Pick<ReturnComputation, "returnedQuantity" | "returnedValue">): string {
  const pecas = c.returnedQuantity === 1 ? "1 peça" : `${c.returnedQuantity} peças`;
  return `Devolução: ${pecas}, ${fmt(c.returnedValue)}`;
}
