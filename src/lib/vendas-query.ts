import type { Prisma } from "@prisma/client";

/**
 * O `where` da listagem de "Lançar Pedidos" (/vendas).
 * ---------------------------------------------------------------------------
 * POR QUE ESTE MÓDULO EXISTE
 *
 * A regra tem uma exceção que erra EM SILÊNCIO, e errou: a lista esconde os
 * pedidos CONCLUIDO (eles vivem em "Vendas Realizadas"), e esse mesmo filtro
 * valia também para a BUSCA. Quem procurava um pedido já concluído pelo número
 * recebia "Nenhum pedido encontrado para X" — a tela afirmando que o pedido não
 * existe, quando ele existe e está a uma tela de distância. "Vendas Realizadas"
 * não resolvia: lá a busca é só por COMANDA, então número do pedido e nome da
 * cliente não encontravam nada em lugar nenhum do sistema.
 *
 * Transferência era o caso mais sentido: é movimento interno entre lojas, e
 * quem a procura tem na mão o número do pedido, não o nome de uma cliente.
 *
 * REGRA VIGENTE: sem busca, a lista é o trabalho em aberto (sem CONCLUIDO).
 * COM busca, procura em TODOS os status — quem digita um número está atrás
 * daquele pedido, em qualquer etapa que ele esteja. O selo de status na linha
 * diz onde ele parou.
 *
 * Puro e exportado para `scripts/checks/vendas-query.ts` exercitar sem banco.
 *
 * NÃO adicionar "use server": é usado por Server Components.
 */
export function buildVendasWhere(args: {
  /** Termo digitado, já aparado. "" = sem busca. */
  busca: string;
  /** Não-nulo RESTRINGE a uma vendedora; nulo é o escopo de GESTAO/FINANCEIRO. */
  sellerId: string | null;
}): Prisma.OrderWhereInput {
  const busca = args.busca.trim();

  // Número do Pedido, Comanda OU nome da cliente. O nome entra porque é o que
  // a vendedora tem na cabeça quando a cliente liga; número e comanda ela
  // precisa procurar.
  //
  // LIMITE CONHECIDO: `mode: "insensitive"` ignora a CAIXA, não o ACENTO —
  // buscar "conceicao" não acha "Conceição".
  // shortcut: busca sem dobra de acento, trocar por `unaccent` do Postgres (ou
  // uma coluna normalizada em Customer) quando alguém reclamar do acento.
  const filtroBusca: Prisma.OrderWhereInput = busca
    ? {
        OR: [
          { orderNumber: { contains: busca, mode: "insensitive" } },
          { comandaNumber: { contains: busca, mode: "insensitive" } },
          { customer: { name: { contains: busca, mode: "insensitive" } } },
        ],
      }
    : {};

  return {
    // O recorte de status SÓ VALE SEM BUSCA. Era ele, aplicado também à busca,
    // que fazia a tela negar a existência de um pedido concluído.
    ...(busca ? {} : { status: { not: "CONCLUIDO" as const } }),
    ...(args.sellerId ? { sellerId: args.sellerId } : {}),
    ...filtroBusca,
  };
}
