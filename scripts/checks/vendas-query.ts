// Checagem do `where` de "Lançar Pedidos" (/vendas).
// Rodar com: npx tsx scripts/checks/vendas-query.ts
//
// O QUE ESTA EM JOGO: a lista esconde os pedidos CONCLUIDO (eles vivem em
// "Vendas Realizadas"), e ate 13/11/2026 esse filtro valia TAMBEM para a busca.
// Quem procurava um pedido ja concluido pelo numero lia "Nenhum pedido
// encontrado" — a tela negando a existencia de um pedido que existe. E a outra
// tela que os tem busca so por COMANDA, entao numero e nome da cliente nao
// achavam nada em lugar nenhum.
//
// E um erro MUDO: a tela continua abrindo, a busca continua respondendo, e so
// quem conhece o pedido percebe que a resposta esta errada.
import { buildVendasWhere } from "../../src/lib/vendas-query";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

// --- sem busca: o trabalho em aberto -----------------------------------------
const aberto = buildVendasWhere({ busca: "", sellerId: null });
check("sem busca, esconde os concluidos", aberto.status, { not: "CONCLUIDO" });
check("sem busca, nao filtra por texto", aberto.OR, undefined);
check("escopo amplo nao restringe vendedora", aberto.sellerId, undefined);

const daVendedora = buildVendasWhere({ busca: "", sellerId: "u1" });
check("escopo restrito filtra pela vendedora", daVendedora.sellerId, "u1");

// --- COM busca: o conserto ---------------------------------------------------
const procurando = buildVendasWhere({ busca: "BF-2026-000123", sellerId: null });
check("com busca, NAO esconde os concluidos", procurando.status, undefined);
check("com busca, procura nos tres campos", procurando.OR, [
  { orderNumber: { contains: "BF-2026-000123", mode: "insensitive" } },
  { comandaNumber: { contains: "BF-2026-000123", mode: "insensitive" } },
  { customer: { name: { contains: "BF-2026-000123", mode: "insensitive" } } },
]);

// A busca NAO pode abrir o escopo de quem so ve os proprios pedidos: achar o
// pedido de outra vendedora seria um vazamento pela barra de busca.
const buscaRestrita = buildVendasWhere({ busca: "123", sellerId: "u1" });
check("busca mantem o escopo da vendedora", buscaRestrita.sellerId, "u1");
check("busca restrita tambem ve os concluidos", buscaRestrita.status, undefined);

// --- borda: espaco em branco nao e busca -------------------------------------
const soEspaco = buildVendasWhere({ busca: "   ", sellerId: null });
check("so espaco conta como SEM busca", soEspaco.status, { not: "CONCLUIDO" });
check("so espaco nao vira filtro de texto", soEspaco.OR, undefined);

console.log(falhas === 0 ? "vendas-query: OK" : `vendas-query: ${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
