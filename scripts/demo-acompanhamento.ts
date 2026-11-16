/**
 * DADOS DE DEMONSTRACAO do Acompanhamento Gerencial (Comercial).
 *
 * Enche um ANO inteiro de uma Loja de Origem para a tela poder ser VISTA
 * funcionando: meta da loja mes a mes, meta individual de cada vendedora,
 * pedidos faturados com pecas (para o P.A.) e um registro de cada formulario.
 *
 *   npx tsx scripts/demo-acompanhamento.ts [ano]
 *
 * SO PARA DESENVOLVIMENTO. Tudo que ele cria e marcado e some com:
 *
 *   npx tsx scripts/demo-acompanhamento.ts --limpar [ano]
 *
 * O que torna a limpeza possivel:
 *  - pedidos nascem com `orderNumber` começando em DEMO- e cliente DEMO-0001;
 *  - metas (loja e individuais) e acompanhamentos do ano sao reescritos.
 * Por isso ele NAO apaga pedido nenhum que voce tenha lancado a mao.
 *
 * NAO e aleatorio: a mesma semente da sempre o mesmo quadro, para a tela nao
 * mudar de numero a cada rodada e um print de ontem seguir batendo com o de
 * hoje.
 */
import { PrismaClient, type OrderStatus } from "@prisma/client";

const prisma = new PrismaClient();

const PREFIXO = "DEMO-";
const CLIENTE_DEMO = "DEMO-0001";
// "Venda confirmada" para o Ranking e para esta tela (ver FATURADO_WHERE).
const STATUS_FATURADO: OrderStatus = "CONCLUIDO";

/** Metas da loja, mes a mes — os mesmos valores da planilha que originou a tela. */
const META_LOJA = [60_000, 65_000, 75_000, 80_000, 85_000, 90_000, 95_000, 100_000, 125_000, 150_000, 175_000, 200_000];

/** Gerador deterministico (mulberry32): mesma semente, mesmo quadro. */
function aleatorio(semente: number) {
  let a = semente;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Apaga o que ESTE script cria, e so isso.
 *
 * O recorte e estreito de proposito: pedidos do cliente de demonstracao com o
 * prefixo DEMO-, e as metas do ANO da loja escolhida e das vendedoras dela.
 * Sem o recorte por loja/vendedora, uma rodada aqui levaria junto a meta que
 * alguem cadastrou a mao em outra loja — e metas nao tem como voltar.
 */
async function limpar(ano: number, lojaId: string, vendedoraIds: string[]) {
  const cliente = await prisma.customer.findUnique({ where: { code: CLIENTE_DEMO } });
  const pedidos = cliente
    ? await prisma.order.deleteMany({
        where: { customerId: cliente.id, orderNumber: { startsWith: PREFIXO } },
      })
    : { count: 0 };
  const metasLoja = await prisma.storeGoal.deleteMany({ where: { year: ano, originStoreId: lojaId } });
  const metas = vendedoraIds.length
    ? await prisma.salesGoal.deleteMany({
        where: { year: ano, campaignId: null, userId: { in: vendedoraIds } },
      })
    : { count: 0 };
  console.log(`Removidos: ${pedidos.count} pedido(s) de demonstração, ${metasLoja.count} meta(s) de loja, ${metas.count} meta(s) individual(is) de ${ano}.`);
}

async function main() {
  const args = process.argv.slice(2);
  const ano = Number(args.find((a) => /^\d{4}$/.test(a))) || new Date().getFullYear();

  const limpando = args.includes("--limpar");

  // A LOJA: a que tem mais vendedoras com ela como principal. Sem nenhuma, a
  // tela nao teria o que mostrar e o script avisa em vez de inventar vinculo.
  const lojas = await prisma.originStore.findMany({
    where: { active: true },
    include: { _count: { select: { primaryUsers: true } } },
    orderBy: { name: "asc" },
  });
  const loja = lojas.sort((a, b) => b._count.primaryUsers - a._count.primaryUsers)[0];
  if (!loja || loja._count.primaryUsers === 0) {
    console.error(
      "Nenhuma Loja de Origem tem vendedora com ela como PRINCIPAL.\n" +
        "Marque a estrela em Gestão > Usuários (ou rode a migração de backfill) e tente de novo.",
    );
    process.exit(1);
  }

  const vendedoras = await prisma.user.findMany({
    where: { role: "VENDAS", primaryOriginStoreId: loja.id },
    select: { id: true, name: true, salesModel: true },
    orderBy: { name: "asc" },
  });

  if (limpando) {
    await limpar(ano, loja.id, vendedoras.map((v) => v.id));
    return;
  }

  // Cadastros de apoio: o pedido exige todos. Usa o que ja existe; so cria o
  // que faltar, para nao poluir as listas de quem ja tem o sistema montado.
  const [store, orderType, operation, shippingMethod] = await Promise.all([
    prisma.store.findFirst({ where: { active: true } }),
    prisma.orderType.findFirst({ where: { active: true } }),
    prisma.operation.findFirst({ where: { active: true } }),
    prisma.shippingMethod.findFirst({ where: { active: true } }),
  ]);
  if (!store || !orderType || !operation || !shippingMethod) {
    console.error("Faltam cadastros de apoio (Loja, Tipo de Pedido, Operação ou Forma de Envio). Rode `npm run db:seed`.");
    process.exit(1);
  }

  const cliente = await prisma.customer.upsert({
    where: { code: CLIENTE_DEMO },
    update: {},
    create: { code: CLIENTE_DEMO, name: "Cliente de Demonstração", city: "São Paulo", state: "SP" },
  });

  // Rodar duas vezes nao pode empilhar um ano em cima do outro.
  await limpar(ano, loja.id, vendedoras.map((v) => v.id));

  // ---- metas da loja e das vendedoras -------------------------------------
  for (let mes = 1; mes <= 12; mes++) {
    await prisma.storeGoal.create({
      data: { originStoreId: loja.id, month: mes, year: ano, amount: META_LOJA[mes - 1] },
    });
    for (const v of vendedoras) {
      // A meta individual e a da loja DIVIDIDA PELO NUMERO REAL de vendedoras
      // (a planilha dividia por 4 fixo, com tres vendedoras cadastradas).
      await prisma.salesGoal.create({
        data: {
          userId: v.id,
          month: mes,
          year: ano,
          amount: Math.round(META_LOJA[mes - 1] / vendedoras.length),
          scope: v.salesModel ?? "VAREJO",
        },
      });
    }
  }

  // ---- pedidos ------------------------------------------------------------
  const hoje = new Date();
  const ultimoMes = ano < hoje.getFullYear() ? 12 : ano > hoje.getFullYear() ? 0 : hoje.getMonth() + 1;

  let n = 0;
  for (const [iv, v] of vendedoras.entries()) {
    const rnd = aleatorio(1000 + iv);
    for (let mes = 1; mes <= ultimoMes; mes++) {
      const metaDoMes = META_LOJA[mes - 1] / vendedoras.length;
      // Entre 40% e 160% da meta, para a tela mostrar mes abaixo e mes acima.
      const alvo = metaDoMes * (0.4 + rnd() * 1.2);
      const pedidos = 3 + Math.floor(rnd() * 5);
      for (let i = 0; i < pedidos; i++) {
        // Dia 2 a 27: longe das bordas do mes, onde o fuso confundiria a
        // leitura de quem for conferir o numero a mao.
        const dia = 2 + Math.floor(rnd() * 26);
        n++;
        await prisma.order.create({
          data: {
            orderNumber: `${PREFIXO}${ano}${String(mes).padStart(2, "0")}-${String(n).padStart(4, "0")}`,
            status: STATUS_FATURADO,
            storeId: store.id,
            originStoreId: loja.id,
            orderTypeId: orderType.id,
            operationId: operation.id,
            shippingMethodId: shippingMethod.id,
            customerId: cliente.id,
            sellerId: v.id,
            orderValue: Math.round(alvo / pedidos),
            total: Math.round(alvo / pedidos),
            // Peças declaradas: o numerador do P.A. (1 a 5 por pedido).
            pieceCount: 1 + Math.floor(rnd() * 5),
            createdAt: new Date(Date.UTC(ano, mes - 1, dia, 15, 0, 0)),
          },
        });
      }
    }
  }

  // ---- um registro de cada formulario -------------------------------------
  const gestor = await prisma.user.findFirst({ where: { role: "GESTAO" } });
  if (gestor && vendedoras[0]) {
    await prisma.followUp.create({
      data: {
        kind: "ONE_ON_ONE",
        collaboratorId: vendedoras[0].id,
        managerId: gestor.id,
        heldOn: new Date(Date.UTC(ano, Math.max(0, ultimoMes - 1), 10, 15, 0, 0)),
        performance: "Fechou o mês em 108% da meta. Pontual, postura boa com a equipe.",
        strengths: "Recuperou quatro clientes inativas da carteira.",
        improvement: "Registrar o pedido no mesmo dia da venda — hoje acumula para a sexta.",
        collaboratorView: "Disse que o atraso vem do volume de atendimento no fim da semana.",
        actionPlan: "Lançar todo pedido no mesmo dia até a próxima sexta.",
        status: "EM_ANDAMENTO",
        notes: "Pediu treinamento do módulo de Select.",
      },
    });
    await prisma.followUp.create({
      data: {
        kind: "QUINZENAL",
        collaboratorId: vendedoras[Math.min(1, vendedoras.length - 1)].id,
        managerId: gestor.id,
        heldOn: new Date(Date.UTC(ano, Math.max(0, ultimoMes - 1), 24, 15, 0, 0)),
        topic: "Retomada da carteira inativa antes da virada de coleção.",
        strengths: "Melhor P.A. da loja no período: leva peça complementar em quase todo atendimento.",
        improvement: "Ticket médio abaixo da equipe — está vendendo volume, não valor.",
        collaboratorView: "Acha que falta repertório das peças novas para sugerir o conjunto completo.",
        actionPlan: "Montar três looks completos por semana e oferecer na abordagem.",
        support: "Acesso antecipado ao catálogo da coleção nova.",
        reviewOn: new Date(Date.UTC(ano, Math.max(0, ultimoMes - 1), 28, 15, 0, 0)),
      },
    });
  }

  console.log(
    `Pronto: ${loja.name} · ${vendedoras.length} vendedora(s) · ${n} pedido(s) em ${ano} · ` +
      `12 metas de loja · ${12 * vendedoras.length} metas individuais · 2 acompanhamentos.`,
  );
  console.log("Abra /vendas/acompanhamento como GESTAO.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
