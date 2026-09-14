// Checagem da conta de devolucao (Vendas > Devolucoes).
// Rodar com: npx tsx scripts/checks/order-returns.ts
//
// O que esta em jogo: o valor abatido aqui e o que sai do Ranking e das metas.
// Errar para mais tira venda real da vendedora; errar para menos deixa venda
// devolvida contando como faturada.
import {
  computeReturn,
  validateReturnItems,
  returnHistoryNote,
  MAX_RETURN_ITEMS,
  MAX_RETURN_QUANTITY,
} from "../../src/lib/order-returns";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}
function erroDe(fn: () => unknown): string | null {
  try { fn(); return null; } catch (e) { return e instanceof Error ? e.message : String(e); }
}

// --- validacao de formulario ---
check("lista vazia", validateReturnItems([]), "Informe ao menos um item devolvido.");
check("referencia vazia", validateReturnItems([{ reference: "  ", quantity: 1, value: 0 }]), "Item 1: informe a referência.");
check("quantidade zero", validateReturnItems([{ reference: "A", quantity: 0, value: 0 }]), "Item 1: quantidade deve ser um inteiro maior que zero.");
check("quantidade fracionada", validateReturnItems([{ reference: "A", quantity: 1.5, value: 0 }]), "Item 1: quantidade deve ser um inteiro maior que zero.");
check("valor negativo", validateReturnItems([{ reference: "A", quantity: 1, value: -1 }]), "Item 1: valor inválido.");
check("quantidade acima do teto", validateReturnItems([{ reference: "A", quantity: MAX_RETURN_QUANTITY + 1, value: 0 }]), `Item 1: quantidade acima do limite (${MAX_RETURN_QUANTITY}).`);
check("quantidade no teto e valida", validateReturnItems([{ reference: "A", quantity: MAX_RETURN_QUANTITY, value: 0 }]), null);
check("valor zero e valido", validateReturnItems([{ reference: "A", quantity: 1, value: 0 }]), null);
check("aponta a linha certa", validateReturnItems([{ reference: "A", quantity: 1, value: 1 }, { reference: "", quantity: 1, value: 1 }]), "Item 2: informe a referência.");
check(
  "teto de linhas",
  validateReturnItems(Array.from({ length: MAX_RETURN_ITEMS + 1 }, () => ({ reference: "A", quantity: 1, value: 1 }))),
  `Máximo de ${MAX_RETURN_ITEMS} itens por devolução.`,
);

// --- pedido sem campanha: so o valor da mercadoria cai; frete intacto ---
const simples = computeReturn({
  orderValue: 500,
  freight: 30,
  campaignItems: [],
  items: [{ reference: "REF-1", quantity: 2, value: 120 }],
});
check("valor devolvido", simples.returnedValue, 120);
check("pecas devolvidas", simples.returnedQuantity, 2);
check("mercadoria abatida", simples.orderValue, 380);
check("total = mercadoria + frete", simples.total, 410);
check("sem campanha nao muda item", simples.campaignUpdates, []);
check("itemCount sem campanha", simples.itemCount, 0);

// --- centavos nao acumulam erro de ponto flutuante ---
const centavos = computeReturn({
  orderValue: 10,
  freight: 0,
  campaignItems: [],
  items: [
    { reference: "A", quantity: 1, value: 0.1 },
    { reference: "B", quantity: 1, value: 0.2 },
  ],
});
check("0.1 + 0.2 em centavos", centavos.returnedValue, 0.3);
check("10 - 0.3", centavos.orderValue, 9.7);

// --- devolucao maior que a mercadoria e recusada ---
check(
  "acima do valor atual",
  erroDe(() => computeReturn({ orderValue: 100, freight: 0, campaignItems: [], items: [{ reference: "A", quantity: 1, value: 100.01 }] }))?.startsWith("O valor devolvido"),
  true,
);
check(
  "igual ao valor atual e aceito (zera)",
  computeReturn({ orderValue: 100, freight: 5, campaignItems: [], items: [{ reference: "A", quantity: 1, value: 100 }] }).total,
  5,
);

// --- campanha: referencia que casa abate quantidade e valor daquele item ---
const campanha = computeReturn({
  orderValue: 1000,
  freight: 0,
  campaignItems: [
    { id: "c1", reference: "Vestido Azul", quantity: 5, value: 500 },
    { id: "c2", reference: "Saia", quantity: 3, value: 300 },
  ],
  items: [{ reference: "vestido  azul", quantity: 2, value: 200 }],
});
check("casa sem acento/caixa/espacos", campanha.campaignUpdates, [{ id: "c1", quantity: 3, value: 300 }]);
check("itemCount recalculado", campanha.itemCount, 6);
check("mercadoria tambem cai", campanha.orderValue, 800);

// Referencia que NAO casa: so o valor do pedido cai; itens ficam como estao.
const semCasar = computeReturn({
  orderValue: 1000,
  freight: 0,
  campaignItems: [{ id: "c1", reference: "Vestido", quantity: 5, value: 500 }],
  items: [{ reference: "Blusa", quantity: 1, value: 50 }],
});
check("sem casar nao toca campanha", semCasar.campaignUpdates, []);
check("sem casar mantem itemCount", semCasar.itemCount, 5);
check("sem casar abate pedido", semCasar.orderValue, 950);

// O abate do item nunca fica negativo: devolver mais do que o item tem so zera.
const excede = computeReturn({
  orderValue: 1000,
  freight: 0,
  campaignItems: [{ id: "c1", reference: "Vestido", quantity: 2, value: 100 }],
  items: [{ reference: "Vestido", quantity: 5, value: 150 }],
});
check("item nao fica negativo", excede.campaignUpdates, [{ id: "c1", quantity: 0, value: 0 }]);
check("pedido abate o valor cheio", excede.orderValue, 850);

// Duas linhas com a mesma referencia somam sobre o mesmo item.
const duasLinhas = computeReturn({
  orderValue: 1000,
  freight: 0,
  campaignItems: [{ id: "c1", reference: "Vestido", quantity: 5, value: 500 }],
  items: [
    { reference: "Vestido", quantity: 1, value: 100 },
    { reference: "Vestido", quantity: 2, value: 200 },
  ],
});
check("linhas repetidas acumulam", duasLinhas.campaignUpdates, [{ id: "c1", quantity: 2, value: 200 }]);

// --- nota do historico ---
check("nota singular", returnHistoryNote({ returnedQuantity: 1, returnedValue: 50 }).startsWith("Devolução: 1 peça, "), true);
check("nota plural", returnHistoryNote({ returnedQuantity: 3, returnedValue: 50 }).startsWith("Devolução: 3 peças, "), true);

console.log(falhas === 0 ? "OK: order-returns" : `${falhas} falha(s) em order-returns`);
process.exit(falhas === 0 ? 0 : 1);
