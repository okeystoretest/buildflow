/**
 * DIAGNOSTICO DO ACOMPANHAMENTO GERENCIAL — so leitura, nada e gravado.
 *
 * Responde UMA pergunta: a tela demora por VOLUME de banco, ou por outra coisa?
 *
 * A pagina e `force-dynamic` e refaz o ano inteiro a cada F5: `order.findMany`
 * traz todo pedido faturado do ano para o Node, e `montarGrade` soma em
 * JavaScript. Se o tempo estiver aqui, o numero aparece. Se nao estiver, o
 * tempo esta em rede, cold start ou render — e nenhum conserto de query
 * resolveria.
 *
 *   DATABASE_URL="<prod>" npx tsx scripts/diag-acompanhamento.ts
 *   DATABASE_URL="<prod>" npx tsx scripts/diag-acompanhamento.ts 2025   (outro ano)
 */
import { prisma } from "../src/lib/prisma";
import { computeAcompanhamento } from "../src/lib/acompanhamento-data";
import { FATURADO_WHERE } from "../src/lib/rank-data";
import { janelaDoMes } from "../src/lib/rank-window";

const ms = (t: bigint) => `${Number(process.hrtime.bigint() - t) / 1e6} ms`;

(async () => {
  const year = Number(process.argv[2]) || new Date().getFullYear();
  const inicio = janelaDoMes(year, 1).inicio;
  const fim = janelaDoMes(year, 12).fim;

  // Primeira consulta paga a abertura da conexao; sem descartar, ela aparece
  // somada na primeira medicao e tudo depois dela parece rapido demais.
  await prisma.$queryRaw`SELECT 1`;

  const t0 = process.hrtime.bigint();
  const pedidos = await prisma.order.count({
    where: { ...FATURADO_WHERE, createdAt: { gte: inicio, lt: fim } },
  });
  console.log(`RES pedidos faturados em ${year}: ${pedidos}  (count em ${ms(t0)})`);

  const t1 = process.hrtime.bigint();
  const devolucoes = await prisma.orderReturn.count({
    where: { createdAt: { gte: inicio, lt: fim } },
  });
  console.log(`RES devolucoes em ${year}: ${devolucoes}  (count em ${ms(t1)})`);

  const vendedoras = await prisma.user.count({
    where: { role: "VENDAS", primaryOriginStoreId: { not: null } },
  });
  const lojas = await prisma.originStore.count({ where: { active: true } });
  console.log(`RES vendedoras com loja principal: ${vendedoras}  ·  lojas ativas: ${lojas}`);
  console.log(`RES linhas que a grade desenha: ${vendedoras} x 12 meses = ${vendedoras * 12} celulas`);

  // O NUMERO QUE IMPORTA: exatamente o que a aba Painel espera antes de
  // desenhar qualquer coisa. Tres vezes, porque a primeira inclui o plano de
  // consulta ainda frio no Postgres.
  for (let i = 1; i <= 3; i++) {
    const t = process.hrtime.bigint();
    const dados = await computeAcompanhamento({ year, lojaId: "", escopo: "" });
    console.log(
      `RES computeAcompanhamento (todas as lojas) #${i}: ${ms(t)}` +
        `  — ${dados.grade.vendedoras.length} vendedoras na grade`,
    );
  }

  // Com loja escolhida, para saber se o filtro alivia ou nao muda nada.
  const primeira = await prisma.originStore.findFirst({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  if (primeira) {
    const t = process.hrtime.bigint();
    await computeAcompanhamento({ year, lojaId: primeira.id, escopo: "" });
    console.log(`RES computeAcompanhamento (so ${primeira.name}): ${ms(t)}`);
  }

  await prisma.$disconnect();
})();
