/**
 * POR QUE ESTE PEDIDO NAO APARECE? — diagnostico de um pedido sumido.
 *
 *   npx tsx scripts/diag-pedido.ts <numero ou trecho>
 *
 * Em outro ambiente (producao), aponte o banco na propria linha:
 *
 *   DATABASE_URL="postgresql://..." npx tsx scripts/diag-pedido.ts 12345
 *
 * SO LE o banco — nenhum update, nenhum delete.
 *
 * Existe porque "sumiu" tem varias causas que a tela nao distingue: o pedido
 * pode nao existir, pode estar fora do recorte de status de cada tela, ou pode
 * existir e pertencer a OUTRA vendedora — e, para quem olha, as tres parecem a
 * mesma coisa. Ele responde qual das tres e, pedido por pedido.
 */
import { PrismaClient } from "@prisma/client";
import { HISTORY_STATUSES } from "../src/lib/order-flow";

const prisma = new PrismaClient();

async function main() {
  const termo = process.argv.slice(2).join(" ").trim();
  if (!termo) {
    console.error('Uso: npx tsx scripts/diag-pedido.ts "<numero do pedido, comanda ou cliente>"');
    process.exit(1);
  }

  // SEM recorte de status e SEM escopo de vendedora: a pergunta aqui e "existe?",
  // nao "voce pode ver?". O escopo entra depois, no diagnostico de cada achado.
  const achados = await prisma.order.findMany({
    where: {
      OR: [
        { orderNumber: { contains: termo, mode: "insensitive" } },
        { comandaNumber: { contains: termo, mode: "insensitive" } },
        { customer: { name: { contains: termo, mode: "insensitive" } } },
      ],
    },
    include: {
      customer: { select: { name: true } },
      seller: { select: { name: true, role: true } },
      orderType: { select: { name: true } },
      originStore: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  console.log(`\nBuscando "${termo}" em ${process.env.DATABASE_URL?.replace(/\/\/[^@]*@/, "//***@") ?? "(DATABASE_URL não definida)"}`);

  if (achados.length === 0) {
    console.log("\nNENHUM pedido com esse número, comanda ou cliente NESTE banco.");
    console.log("Ou o pedido está em outro ambiente, ou o número foi gravado diferente");
    console.log("do que você está digitando (acento, espaço no meio, prefixo).");
    const tipos = await prisma.orderType.findMany({ select: { name: true, active: true } });
    console.log("\nTipos de pedido cadastrados aqui:");
    console.log("  " + tipos.map((t) => `"${t.name}"${t.active ? "" : " [inativo]"}`).join("  |  "));
    return;
  }

  console.log(`\n${achados.length} pedido(s) encontrado(s):\n`);
  for (const o of achados) {
    const emAberto = o.status !== "CONCLUIDO";
    const noHistorico = HISTORY_STATUSES.includes(o.status);
    console.log(`  ${o.orderNumber}  ·  ${o.orderType.name}  ·  ${o.status}`);
    console.log(`     cliente: ${o.customer.name}`);
    console.log(`     lançado por: ${o.seller.name} (${o.seller.role})`);
    console.log(`     loja de origem: ${o.originStore?.name ?? "—"}  ·  comanda: ${o.comandaNumber ?? "—"}`);
    console.log(`     criado em: ${o.createdAt.toLocaleString("pt-BR")}`);
    console.log(`     Lançar Pedidos — sem busca: ${emAberto ? "APARECE" : "não (concluído; aparece ao buscar)"}`);
    console.log(`     Lançar Pedidos — buscando: APARECE (desde a correção de 13/11/2026)`);
    console.log(
      `     Vendas Realizadas: ${noHistorico ? (o.comandaNumber ? "aparece (busca só por comanda)" : "aparece, mas a busca de lá é SÓ por comanda — e este não tem") : "não (status fora do histórico)"}`,
    );
    console.log(`     QUEM VÊ: ${o.seller.name} (dona do pedido), mais GESTÃO e FINANCEIRO.`);
    console.log(`              Outra vendedora NÃO vê este pedido em lugar nenhum.`);
    console.log("");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
