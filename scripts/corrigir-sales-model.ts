/**
 * REPARO PONTUAL — cinco vendedoras de atacado com `salesModel` nulo.
 *
 * Elas não foram zeradas: nasceram nulas. As duas portas do app que gravam
 * usuário (`createUser` em management.ts:189 e `importUsersCsv` em
 * import.ts:155) RECUSAM vendedor sem modelo, então estas cinco entraram por
 * fora — escrita direta no banco. Em produção o campo está preenchido; só esta
 * cópia local ficou sem.
 *
 * O ESTRAGO: `canUseWholesaleTool` exige `salesModel === "ATACADO"`, então as
 * cinco donas de 1104 das 1105 candidaturas ficam trancadas fora da própria
 * ferramenta, e o filtro de vendedora da tela lista só "Valdir Atacado" (0
 * candidaturas).
 *
 * POR QUE ATACADO É DERIVAÇÃO, NÃO PALPITE: o app só atribui candidatura de
 * atacado a vendedora `salesModel: ATACADO` (wholesale-apply.ts:238 e
 * wholesale-queries.ts:253). Quem é dona de candidatura de atacado é, pela
 * própria invariante do sistema lida de trás para frente, vendedora de atacado.
 * As cinco somam 1104 candidaturas e zero pedidos de varejo.
 *
 * Sem revogar sessão de propósito: papel e `salesModel` são relidos do banco a
 * cada carga (layout.tsx:38, vendas/page.tsx:33), não do cookie.
 *
 * Idempotente: só grava onde ainda está NULL. Rode uma vez e apague o arquivo.
 *   npx tsx scripts/corrigir-sales-model.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Ids EXATOS. Lição do handoff de 05/11: nunca uma consulta ordenada para
// gravar — `createdAt` empatado não garante ordem e pega a linha errada.
const IDS = [
  "cmvjku8lb01058r2w6uhydn5o", // Arliane Araujo Trajano        — 383 candidaturas
  "cmvjktvzp01048r2wsxngkypw", // Darliane Araujo Trajano       — 383
  "cmvjkv8bs01078r2wkef06alt", // Larissa Neris de Assis        —  11
  "cmvjkumtd01068r2wgry1ptmz", // Maria Kelly Ferreira Sarmento —  68
  "cmvv3b3nj021ep5q9gxchbzc8", // Rhafaella Yslandia da Silva   — 259
];

async function main(): Promise<void> {
  const { count } = await prisma.user.updateMany({
    where: { id: { in: IDS }, role: "VENDAS", salesModel: null },
    data: { salesModel: "ATACADO" },
  });
  console.log(`linhas gravadas: ${count}`);

  const restantes = await prisma.user.count({ where: { role: "VENDAS", salesModel: null } });
  console.log(`VENDAS sem modelo restantes: ${restantes}`);

  const atacado = await prisma.user.findMany({
    where: { role: "VENDAS", salesModel: "ATACADO", active: true },
    select: { name: true },
    orderBy: { name: "asc" },
  });
  console.log(`vendedoras de atacado que a tela vê: ${atacado.map((u) => u.name).join(", ")}`);

  const comDona = await prisma.wholesaleLead.count({ where: { seller: { salesModel: "ATACADO" } } });
  const semDona = await prisma.wholesaleLead.count({ where: { sellerId: null } });
  const total = await prisma.wholesaleLead.count();
  console.log(`candidaturas com dona de atacado: ${comDona} | sem dona: ${semDona} | total: ${total}`);

  if (restantes > 0) {
    console.error("ATENÇÃO: ainda há vendedor sem modelo fora da lista acima. Confira na Gestão.");
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
