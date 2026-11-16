import { prisma } from "../src/lib/prisma";
(async () => {
  const exatas = await prisma.$queryRaw<{ loja: string|null; num: string; n: bigint }[]>`
    SELECT "originStoreId" AS loja, lower(trim("orderNumber")) AS num, count(*) AS n
    FROM "Order" GROUP BY 1,2 HAVING count(*) > 1 ORDER BY n DESC LIMIT 20`;
  const zeros = await prisma.$queryRaw<{ loja: string|null; num: string; n: bigint }[]>`
    SELECT "originStoreId" AS loja, ltrim(lower(trim("orderNumber")),'0') AS num, count(*) AS n
    FROM "Order" GROUP BY 1,2 HAVING count(*) > 1 ORDER BY n DESC LIMIT 20`;
  const vazios = await prisma.order.count({ where: { orderNumber: "" } });
  console.log("duplicatas EXATAS (item 1):", exatas.length);
  for (const r of exatas) console.log("  ", r.num, "x" + r.n, "loja", r.loja);
  console.log("duplicatas SO por zero a esquerda (item 2):", zeros.length - exatas.length);
  for (const r of zeros) console.log("  ", r.num, "x" + r.n, "loja", r.loja);
  console.log("orderNumber vazio:", vazios);
  await prisma.$disconnect();
})();
