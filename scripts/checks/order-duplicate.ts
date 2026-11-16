// Checagem da regra de NUMERO DE PEDIDO DUPLICADO.
// Rodar com: npx tsx scripts/checks/order-duplicate.ts
//
// O que esta em jogo: `orderNumber` nao tem restricao de unicidade no banco e
// a criacao nao checava nada. O mesmo pedido cadastrado duas vezes somava duas
// vezes no Ranking e na meta, sem nenhum aviso. A unicidade vale por LOJA DE
// ORIGEM: lojas diferentes mantem numeracoes proprias.
import { readFileSync } from "node:fs";
import {
  normalizeOrderNumber,
  chaveDeDuplicidade,
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

// ===========================================================================
// ZEROS A ESQUERDA — `chaveDeDuplicidade`
// ===========================================================================
//
// O que esta em jogo: producao tinha um pedido gravado como "008029" com
// comanda "8029". Enquanto a comparacao olhava o texto cru, lancar "8029" onde
// "008029" existe criava um SEGUNDO pedido — a mesma venda somando duas vezes
// no Ranking e na meta. A chave e o que o banco indexa e o que a aplicacao
// compara, para os dois nunca discordarem.
//
// O NUMERO EXIBIDO NAO MUDA: `normalizeOrderNumber` continua preservando o que
// a pessoa digitou. A chave existe ao lado, so para comparar.

// --- o caso que originou tudo ---
check("008029 e 8029 sao o mesmo pedido", chaveDeDuplicidade("008029"), chaveDeDuplicidade("8029"));
check("um zero a esquenta nao cria pedido novo", chaveDeDuplicidade("08029"), chaveDeDuplicidade("8029"));
check("muitos zeros tambem nao", chaveDeDuplicidade("0000008029"), chaveDeDuplicidade("8029"));

// --- forma da chave ---
check("zeros a esquerda caem", chaveDeDuplicidade("008029"), "8029");
check("numero sem zero fica igual", chaveDeDuplicidade("8029"), "8029");
check("espacos caem antes dos zeros", chaveDeDuplicidade("  008029  "), "8029");
check("caixa e dobrada para minuscula", chaveDeDuplicidade("A-102"), "a-102");
check("caixa e zero juntos", chaveDeDuplicidade("0A-102"), "a-102");

// --- zero significativo NAO pode desaparecer ---
// Sem o piso de um caractere, "0", "00" e "" colidiriam todos na string vazia
// — e string vazia e "pedido sem numero", nao um numero.
check("zero sozinho continua zero", chaveDeDuplicidade("0"), "0");
check("muitos zeros viram um zero", chaveDeDuplicidade("0000"), "0");
check("zero nao vira vazio", chaveDeDuplicidade("0") === "", false);

// --- ausencia de numero ---
check("vazio continua vazio", chaveDeDuplicidade(""), "");
check("so espaco vira vazio", chaveDeDuplicidade("   "), "");
check("nulo vira vazio", chaveDeDuplicidade(null), "");
check("indefinido vira vazio", chaveDeDuplicidade(undefined), "");

// --- zero INTERNO e significativo, nao se toca ---
check("zero no meio fica", chaveDeDuplicidade("8009"), "8009");
check("zero no fim fica", chaveDeDuplicidade("80290"), "80290");

// --- numeros diferentes seguem diferentes ---
check("8029 e 8030 seguem distintos", chaveDeDuplicidade("8029") === chaveDeDuplicidade("8030"), false);
check("A-102 e A-103 seguem distintos", chaveDeDuplicidade("A-102") === chaveDeDuplicidade("A-103"), false);

// ===========================================================================
// GUARDA ESTRUTURAL — as duas travas tem que usar a MESMA funcao
// ===========================================================================
//
// A trava existe em dois lugares (criacao e edicao de pedido) e a versao
// anterior comparava em cada um por conta propria. Foi assim que o aviso de
// comprovante acabou corrigido num caminho e nao no outro — mesmo repositorio,
// mesma semana. Aqui a checagem exige que os dois passem por `pedidoColidente`
// e que nenhuma comparacao crua de `orderNumber` volte a aparecer.
const fonteOrders = readFileSync("src/lib/actions/orders.ts", "utf8");

check(
  "criacao e edicao usam pedidoColidente (2 chamadas)",
  (fonteOrders.match(/await pedidoColidente\(/g) ?? []).length,
  2,
);
check(
  "nenhuma comparacao crua de orderNumber sobrou",
  /orderNumber:\s*\{\s*equals:/.test(fonteOrders),
  false,
);
check(
  "pedidoColidente decide com chaveDeDuplicidade",
  /chaveDeDuplicidade\(c\.orderNumber\)/.test(fonteOrders),
  true,
);

console.log(falhas === 0 ? "order-duplicate: OK" : `order-duplicate: ${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
