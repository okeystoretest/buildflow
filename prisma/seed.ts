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

  // Lojas de Origem (conceito novo). Iguatemi, Sao Paulo e Lov Club usam o
  // fluxo simplificado; a Fabrica segue o fluxo padrao.
  const originStores = [
    { name: "OKEY Store (Fábrica)", simplifiedFlow: false },
    { name: "OKEY Store (Iguatemi)", simplifiedFlow: true },
    { name: "OKEY Store (São Paulo)", simplifiedFlow: true },
    { name: "Lov Club (Centro Fashion)", simplifiedFlow: true },
  ];
  for (const os of originStores) {
    const exists = await prisma.originStore.findFirst({ where: { name: os.name } });
    if (!exists) await prisma.originStore.create({ data: os });
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

  // ---- Planos do SELECT (venda de servico) ----
  //
  // ATENCAO AOS VALORES: monthlyAmount aqui e a mensalidade BASE do plano,
  // SEM o Build.Sales. O servidor soma BUILD_SALES_MONTHLY (R$ 67,00) ao
  // resolver a adesao, de modo que a cliente do Estrela Prata paga R$ 664,00
  // por mes e o contrato vale R$ 7.968,00. Cadastrar 664 aqui cobraria o
  // Build.Sales duas vezes.
  // Idempotente por NOME: rodar de novo atualiza os valores de tabela e
  // reescreve os beneficios, sem duplicar plano nem tocar em contratos ja
  // vendidos — estes carregam o proprio snapshot e nao olham mais para aqui.
  //
  // Beneficios comuns aos quatro planos. O plano 4 troca a primeira linha pela
  // propria redacao, por isso ela nao esta nesta lista.
  const beneficiosComuns = [
    "Pg 30: programa de prêmio para a equipe comercial do lojista (meta geral definida conjuntamente)",
    "Participação nos eventos e nas campanhas da marca",
    "Solução comercial personalizada Build.Sales",
  ];

  const planosSelect = [
    {
      name: "Estrela Prata",
      sortOrder: 1,
      validityMonths: 12,
      monthlyAmount: 597,
      minMonthlyPurchase: 6000,
      editableValues: false,
      benefits: [
        "Política de desconto progressivo",
        "Acesso parcial a materiais",
        "Treinamentos gravados",
        "Suporte sob demanda",
        "Exclusividade de área num raio de 10 km",
        "Campanhas sazonais personalizadas",
        ...beneficiosComuns,
      ],
    },
    {
      name: "Rubi",
      sortOrder: 2,
      validityMonths: 12,
      monthlyAmount: 997,
      minMonthlyPurchase: 15000,
      editableValues: false,
      benefits: [
        "Política de desconto progressivo",
        "Material de mídia e lançamento (fotos e vídeos)",
        "Treinamentos on-line contínuos",
        "Participação em eventos",
        "2 fretes gratuitos/mês (convertidos em crédito de R$ 200,00 no pedido seguinte)",
        "Grade inteligente definida por região + personalização via consultoria",
        "Suporte focado em sell-out (giro na ponta)",
        "Exclusividade parcial de área num raio de 15 km (mediante contrato)",
        "Campanhas sazonais personalizadas",
        "15 dust bags premium personalizadas",
        ...beneficiosComuns,
      ],
    },
    {
      name: "Diamante",
      sortOrder: 3,
      validityMonths: 12,
      monthlyAmount: 1297,
      minMonthlyPurchase: 20000,
      editableValues: false,
      benefits: [
        "Política de desconto progressivo",
        "Kit inicial com curadoria de peças (pronto para venda)",
        "Treinamentos on-line contínuos",
        "Material profissional de mídia (fotos e vídeos)",
        "Participação em eventos",
        "Acesso antecipado às coleções",
        "Suporte intensivo dedicado",
        "2 fretes gratuitos/mês (convertidos em crédito de R$ 200,00 no pedido seguinte)",
        "Grade inteligente definida por região + personalização via consultoria",
        "Suporte focado em sell-out (giro na ponta)",
        "Exclusividade regional (mediante contrato)",
        "Campanhas sazonais personalizadas",
        "20 dust bags premium personalizadas",
        ...beneficiosComuns,
      ],
    },
    {
      // Plano negociado: validade, mensalidade e minimo sao combinados em cada
      // adesao. Por isso os valores de tabela ficam nulos e editableValues
      // libera os tres campos no formulario.
      name: "Diamante (Wincon)",
      sortOrder: 4,
      validityMonths: 12,
      monthlyAmount: null,
      minMonthlyPurchase: null,
      editableValues: true,
      benefits: [
        "Condições comerciais superiores (melhor desconto progressivo da marca)",
        "Curadoria completa de mix inicial (alto valor agregado + peças estratégicas de posicionamento)",
        "Prioridade total no acesso às coleções (antecipação real, não simbólica)",
        "Participação em eventos",
        "Desenvolvimento de campanhas exclusivas para a região",
        "Material de mídia premium (editorial + vídeo + branding)",
        "Suporte estratégico direto (nível consultoria)",
        "Planejamento de coleção e reposição orientada por performance (frete prioritário + condições especiais)",
        "Estrutura completa de apoio ao sell-out (do produto à comunicação na ponta)",
        "20 dust bags premium personalizadas",
        ...beneficiosComuns,
      ],
    },
  ];

  for (const p of planosSelect) {
    const { benefits, ...dados } = p;
    const existente = await prisma.selectPlan.findFirst({ where: { name: dados.name } });
    const plano = existente
      ? await prisma.selectPlan.update({ where: { id: existente.id }, data: dados })
      : await prisma.selectPlan.create({ data: dados });

    await prisma.selectPlanBenefit.deleteMany({ where: { planId: plano.id } });
    await prisma.selectPlanBenefit.createMany({
      data: benefits.map((text, i) => ({ planId: plano.id, sortOrder: i + 1, text })),
    });
  }

  console.log("Seed v2 concluido. Login: senha padrao 123456");
  console.log("Perfis: gestao@, vendas@, financeiro@, logistica@, motorista@, motorista2@ (buildflow.com)");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
