import { prisma } from "@/lib/prisma";

/**
 * CADENCIA -> COMPROU, sozinho, quando um pedido aparece.
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
 * Aqui a fila nunca mostra uma aprovada em CADENCIA que já comprou, mesmo que
 * nenhum cron rode nunca. E se o banco falhar, a exceção é engolida e a tela
 * abre com o que estiver gravado: tela que não abre é pior que número um pouco
 * atrasado.
 *
 * SÓ DE CADENCIA PARA COMPROU. Nunca o contrário: um pedido cancelado ou
 * apagado não "descompra" — a lojista comprou, e isso aconteceu. E `NAO_COMPROU`
 * NÃO é tocado, nem quando um pedido aparece depois: alguém olhou a candidatura
 * e decidiu aquilo. Um processo de higiene que desfaz decisão humana em silêncio
 * é pior que um número desatualizado. Reverter é pelo dropdown da linha.
 *
 * O CUSTO EM REGIME É ZERO ESCRITA. Cada candidatura cruza esta fronteira UMA
 * vez na vida; passada essa vez ela saiu de CADENCIA e não entra mais na
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

/**
 * CURA DO STATUS LEGADO `COMPROU`.
 *
 * Nenhum caminho de código escreve esse valor desde 30/10/2026, e a migração
 * converteu as linhas que existiam. Ainda assim ele pode REAPARECER, e por mais
 * de um caminho:
 *
 *  - ROLLOUT SOBREPOSTO. O contêiner aplica `migrate deploy` antes de servir
 *    (ver o CMD do Dockerfile), mas se uma réplica ANTIGA continuar viva nesse
 *    instante, o `reconciliarCompras` dela — que roda a cada leitura da tela —
 *    escreve `status = COMPROU` contra o schema novo. O Postgres aceita: o
 *    valor segue no enum, de propósito, para o diário histórico não mentir.
 *  - Restauração de dump anterior à migração, ou acerto manual em SQL.
 *
 * Sem esta cura a linha fica invisível: chip neutro com o texto cru `COMPROU`,
 * fora do filtro (que lista `STATUS_VIVOS`) e fora da contagem de aprovadas.
 * E nada mais a limparia, porque a migração já rodou.
 *
 * DUAS PASSADAS, E A ORDEM IMPORTA — é o que impede perda de decisão humana.
 * O código antigo não conhecia `purchaseState`, então ele viraria para COMPROU
 * até uma candidatura que alguém marcou à mão como `NAO_COMPROU` (bastava ter
 * pedido no cadastro). Escrever `purchaseState: COMPROU` em tudo apagaria essa
 * decisão. Então: a primeira passada trata quem estava em CADENCIA, e a segunda
 * só devolve o status de quem já tem o eixo de compra resolvido, sem tocá-lo.
 *
 * SEM EVENTO NO DIÁRIO, nas duas. Isto não é decisão de ninguém: é reparo de
 * representação, e o fato comercial (ela comprou) já está gravado em
 * `purchaseState`. Um evento `COMPROU -> APROVADO` leria no diário como
 * "alguém desfez a compra", que é o oposto do que aconteceu.
 *
 * Em regime: zero linhas, nas duas passadas.
 */
async function curarStatusLegado(): Promise<void> {
  await prisma.wholesaleLead.updateMany({
    where: { status: "COMPROU", purchaseState: "CADENCIA" },
    data: { status: "APROVADO", purchaseState: "COMPROU" },
  });
  // O que sobrou já tem COMPROU ou NAO_COMPROU no eixo próprio: só o status
  // volta ao lugar, e o eixo de compra fica como está.
  await prisma.wholesaleLead.updateMany({
    where: { status: "COMPROU" },
    data: { status: "APROVADO" },
  });
}

export async function reconciliarCompras(): Promise<void> {
  try {
    // Antes da varredura: uma linha com o status legado não seria encontrada
    // por ela (o `where` pede APROVADO), e ficaria parada para sempre.
    await curarStatusLegado();

    const compraram = await prisma.wholesaleLead.findMany({
      where: {
        status: "APROVADO",
        // CADENCIA e só: ver a nota acima. `NAO_COMPROU` é decisão humana e
        // fica. É também a cláusula que esvazia a varredura em regime.
        purchaseState: "CADENCIA",
        // Sem cadastro não há como ligar a pedido nenhum. A cláusula também é o
        // que mantém esta consulta no índice
        // (status, purchaseState, customerId).
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
        // `createMany` de eventos. Está errado: as cláusulas do WHERE existem
        // porque alguém pode ter reprovado a candidatura, ou marcado
        // "não comprou" à mão, entre a leitura acima e esta escrita — e quando
        // elas recusam a linha, o `createMany` ainda assim gravaria no diário
        // "CADENCIA -> COMPROU". Um diário de auditoria com uma linha que não
        // aconteceu é pior que não ter diário, porque ninguém desconfia dele.
        //
        // `count` é o que diz a verdade: 1 = mudou, 0 = outra pessoa chegou
        // antes e a decisão dela fica.
        const { count } = await tx.wholesaleLead.updateMany({
          where: { id, status: "APROVADO", purchaseState: "CADENCIA" },
          data: { purchaseState: "COMPROU" },
        });
        if (count === 0) continue;

        await tx.wholesaleLeadEvent.create({
          data: {
            leadId: id,
            // Evento de COMPRA: o par de status fica nulo. É o que o CHECK
            // `evento_e_status_ou_compra` exige, e o que diz a quem lê o
            // diário qual eixo mudou nesta linha.
            fromPurchase: "CADENCIA",
            toPurchase: "COMPROU",
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
