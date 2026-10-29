import { prisma } from "@/lib/prisma";

/**
 * APROVADO -> COMPROU, sozinho, quando um pedido aparece.
 *
 * A candidatura aprovada ganha o cadastro da lojista (`customerId`, ver
 * `wholesale-customer.ts`). A partir daí "ela comprou" é uma pergunta
 * respondível: existe algum `Order` ligado a esse cadastro?
 *
 * NA LEITURA, E NÃO NO CADASTRO DO PEDIDO. Mesmo arranjo de
 * `reconciliarRodizio`, pelo mesmo motivo e com o mesmo custo aceito: a verdade
 * é a CONTA (tem pedido?) e o banco é a cópia que a leitura atualiza. As
 * alternativas são piores:
 *
 *  - Virar o status dentro de `createOrder` acoplaria o cadastro de pedido do
 *    VAREJO à Análise de Clientes do Atacado, e teria de ser repetido em todo
 *    caminho que cria pedido (formulário, importação, edição que troca o
 *    cliente). Um caminho esquecido viraria "comprou e o painel não sabe".
 *  - Num cron diário, "comprou hoje" só apareceria amanhã.
 *
 * Aqui a fila nunca mostra um APROVADO que já comprou, mesmo que nenhum cron
 * rode nunca. E se o banco falhar, a exceção é engolida e a tela abre com o que
 * estiver gravado: tela que não abre é pior que número um pouco atrasado.
 *
 * SÓ DE APROVADO PARA COMPROU. Nunca o contrário: um pedido cancelado ou
 * apagado não "descompra" — a lojista comprou, e isso aconteceu. Reverter é
 * decisão humana, pelo modal.
 *
 * O CUSTO EM REGIME É ZERO ESCRITA. Cada candidatura cruza esta fronteira UMA
 * vez na vida; passada essa vez ela está em COMPROU e não entra mais na
 * consulta. O estado normal desta função é "encontrou nenhuma".
 */

/**
 * Teto por passada.
 *
 * Roda a cada leitura da tela, então o custo tem de ser limitado e previsível —
 * não o tamanho da base. O teto é baixo de propósito: cada linha gasta duas
 * instruções DENTRO de uma transação interativa (que tem tempo limite), e o
 * único momento em que há muitas linhas de uma vez é a primeira leitura depois
 * de o COMPROU existir. O que passar do teto entra na próxima leitura; não há
 * pressa, porque APROVADO não está errado, só desatualizado.
 */
const TETO_POR_PASSADA = 50;

export async function reconciliarCompras(): Promise<void> {
  try {
    const compraram = await prisma.wholesaleLead.findMany({
      where: {
        status: "APROVADO",
        // Sem cadastro não há como ligar a pedido nenhum. A cláusula também é o
        // que mantém esta consulta no índice (status, customerId).
        customerId: { not: null },
        // UM pedido basta. `some: {}` vira EXISTS no SQL: não conta nem carrega
        // os pedidos, só pergunta se há algum.
        customer: { orders: { some: {} } },
      },
      select: { id: true },
      take: TETO_POR_PASSADA,
    });
    if (compraram.length === 0) return;

    await prisma.$transaction(async (tx) => {
      for (const { id } of compraram) {
        // UMA LINHA POR VEZ, e o evento só depois de a linha ter MESMO mudado.
        //
        // A tentação é um `updateMany` no lote inteiro seguido de um
        // `createMany` de eventos. Está errado: o `status: "APROVADO"` do WHERE
        // existe porque alguém pode ter reprovado a candidatura entre a leitura
        // acima e esta escrita — e quando ele recusa a linha, o `createMany`
        // ainda assim gravaria no diário "APROVADO -> COMPROU". Um diário de
        // auditoria com uma linha que não aconteceu é pior que não ter diário,
        // porque ninguém desconfia dele.
        //
        // `count` é o que diz a verdade: 1 = mudou, 0 = outra pessoa chegou
        // antes e a decisão dela fica.
        const { count } = await tx.wholesaleLead.updateMany({
          where: { id, status: "APROVADO" },
          data: { status: "COMPROU" },
        });
        if (count === 0) continue;

        await tx.wholesaleLeadEvent.create({
          data: {
            leadId: id,
            fromStatus: "APROVADO",
            toStatus: "COMPROU",
            // SEM actorId: ninguém decidiu isto. Ver a nota da coluna no
            // schema — pôr aqui o id de quem abriu a tela seria mentira.
            actorId: null,
            note: "Pedido registrado no cadastro da cliente.",
          },
        });
      }
    });
  } catch (err) {
    // Reconciliação é higiene, não verdade: a tela abre com o que está gravado.
    console.error("[atacado] falha ao reconciliar as compras:", err);
  }
}
