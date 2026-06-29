import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const senha = await bcrypt.hash("123456", 10);

  // ---- Usuarios: um por perfil ----
  const users = [
    { name: "Gestor Geral", email: "gestao@buildflow.com", role: "GESTAO" as const, salesModel: null },
    { name: "Vanessa Varejo", email: "vendas@buildflow.com", role: "VENDAS" as const, salesModel: "VAREJO" as const },
    { name: "Valdir Atacado", email: "vendas2@buildflow.com", role: "VENDAS" as const, salesModel: "ATACADO" as const },
    { name: "Fernando Financeiro", email: "financeiro@buildflow.com", role: "FINANCEIRO" as const, salesModel: null },
    { name: "Lucas Logistica", email: "logistica@buildflow.com", role: "LOGISTICA" as const, salesModel: null },
    { name: "Marcos Motorista", email: "motorista@buildflow.com", role: "MOTORISTA" as const, salesModel: null },
    { name: "Mateus Motorista", email: "motorista2@buildflow.com", role: "MOTORISTA" as const, salesModel: null },
  ];
  for (const u of users) {
    await prisma.user.upsert({ where: { email: u.email }, update: {}, create: { ...u, password: senha } });
  }

  // ---- Cadastros de apoio ----
  const stores = ["Loja Centro", "Loja Shopping", "E-commerce"];
  for (const name of stores) {
    const exists = await prisma.store.findFirst({ where: { name } });
    if (!exists) await prisma.store.create({ data: { name } });
  }

  const orderTypes = ["Venda", "Brinde", "Troca", "Amostra"];
  for (const name of orderTypes) {
    const exists = await prisma.orderType.findFirst({ where: { name } });
    if (!exists) await prisma.orderType.create({ data: { name } });
  }

  const operations = [
    { code: "5102", name: "Venda de mercadoria" },
    { code: "5910", name: "Brinde ou doacao" },
    { code: "1202", name: "Devolucao de venda" },
  ];
  for (const op of operations) {
    const exists = await prisma.operation.findFirst({ where: { code: op.code } });
    if (!exists) await prisma.operation.create({ data: op });
  }

  const shipping = ["Motoboy", "Transportadora", "Retirada na loja", "Correios"];
  for (const name of shipping) {
    const exists = await prisma.shippingMethod.findFirst({ where: { name } });
    if (!exists) await prisma.shippingMethod.create({ data: { name } });
  }

  const payments = ["Dinheiro", "PIX", "Cartao Credito", "Cartao Debito", "Boleto"];
  for (const name of payments) {
    const exists = await prisma.paymentMethod.findFirst({ where: { name } });
    if (!exists) await prisma.paymentMethod.create({ data: { name } });
  }

  const banks = ["Banco do Brasil", "Itau", "Bradesco", "Caixa", "Nubank"];
  for (const name of banks) {
    const exists = await prisma.bank.findFirst({ where: { name } });
    if (!exists) await prisma.bank.create({ data: { name } });
  }

  // ---- Status de pagamento + efeito no fluxo ----
  const payStatuses = [
    { name: "Pago", disposition: "APROVA" as const },
    { name: "Liberado (Credito)", disposition: "APROVA" as const },
    { name: "Transferencia", disposition: "APROVA" as const },
    { name: "Troca", disposition: "APROVA" as const },
    { name: "Estorno", disposition: "INTERROMPE" as const },
    { name: "Estorno Parcial", disposition: "INTERROMPE" as const },
    { name: "Cancelado", disposition: "INTERROMPE" as const },
  ];
  for (const ps of payStatuses) {
    const exists = await prisma.paymentStatusOption.findFirst({ where: { name: ps.name } });
    if (!exists) await prisma.paymentStatusOption.create({ data: ps });
  }

  // ---- Produtos ----
  const produtos = [
    { sku: "TIJ-001", name: "Tijolo Ceramico (milheiro)", price: 850.0, stock: 200 },
    { sku: "CIM-050", name: "Cimento CP-II 50kg", price: 32.5, stock: 500 },
    { sku: "ARE-M3", name: "Areia media (m3)", price: 120.0, stock: 80 },
    { sku: "BRI-M3", name: "Brita 1 (m3)", price: 135.0, stock: 60 },
  ];
  for (const p of produtos) {
    await prisma.product.upsert({ where: { sku: p.sku }, update: {}, create: p });
  }

  // ---- Clientes ----
  const clientes = [
    { code: "CLI-0001", name: "Construtora Alfa" },
    { code: "CLI-0002", name: "Obras Beta Ltda" },
  ];
  for (const c of clientes) {
    await prisma.customer.upsert({ where: { code: c.code }, update: {}, create: c });
  }

  console.log("Seed v2 concluido. Login: senha padrao 123456");
  console.log("Perfis: gestao@, vendas@, financeiro@, logistica@, motorista@, motorista2@ (buildflow.com)");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
