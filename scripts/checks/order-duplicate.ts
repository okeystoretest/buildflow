// Checagem da regra de NUMERO DE PEDIDO DUPLICADO.
// Rodar com: npx tsx scripts/checks/order-duplicate.ts
//
// O que esta em jogo: `orderNumber` nao tem restricao de unicidade no banco e
// a criacao nao checava nada. O mesmo pedido cadastrado duas vezes somava duas
// vezes no Ranking e na meta, sem nenhum aviso. A unicidade vale por LOJA DE
// ORIGEM: lojas diferentes mantem numeracoes proprias.
import {
  normalizeOrderNumber,
  mensagemPedidoDuplicado,
} from "../../src/lib/validations/order";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

// --- normalizacao: o que e gravado e o que e comparado ---
check("espacos nas pontas caem", normalizeOrderNumber("  A-102  "), "A-102");
check("tabulacao tambem cai", normalizeOrderNumber("\tA-102\n"), "A-102");
check("numero limpo fica igual", normalizeOrderNumber("A-102"), "A-102");
check("caixa e preservada na gravacao", normalizeOrderNumber("a-102"), "a-102");
check("nulo vira string vazia", normalizeOrderNumber(null), "");
check("indefinido vira string vazia", normalizeOrderNumber(undefined), "");

// A comparacao de duplicidade e feita sem diferenciar caixa (a query usa
// `mode: "insensitive"`), entao "a-102" e "A-102" sao o MESMO pedido. A
// normalizacao aqui so garante que o espaco em branco nao burle a checagem.
check("espaco nao cria numero novo", normalizeOrderNumber(" A-102"), normalizeOrderNumber("A-102 "));

// --- mensagem de erro ---
check(
  "mensagem cita o numero",
  mensagemPedidoDuplicado("A-102"),
  'Já existe um pedido com o número "A-102" nesta Loja de Origem.',
);
check(
  "mensagem usa o numero normalizado",
  mensagemPedidoDuplicado("  A-102  "),
  'Já existe um pedido com o número "A-102" nesta Loja de Origem.',
);

console.log(falhas === 0 ? "order-duplicate: OK" : `order-duplicate: ${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
