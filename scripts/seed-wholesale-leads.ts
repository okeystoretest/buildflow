// Semeia candidaturas de atacado para desenvolver a Análise de Clientes antes
// de a LP existir. Rodar com: npx tsx scripts/seed-wholesale-leads.ts
//
// NÃO é seed de produção: não entra em prisma/seed.ts. Cria 6 leads, entre
// eles um par que compartilha CNPJ e um par que compartilha telefone em
// grafias diferentes do nono dígito — é esse par que faz o aviso de cadastro
// repetido aparecer na tela.
//
// Todo lead criado aqui leva submittedIp = "seed". Esse marcador é o que
// permite removê-los depois sem tocar em candidaturas reais e é o que faz a
// re-execução substituir os leads anteriores em vez de duplicá-los.
import { prisma } from "../src/lib/prisma";

const MARCADOR_SEED = "seed";

async function main() {
  const vendedora = await prisma.user.findFirst({
    where: { role: "VENDAS", salesModel: "ATACADO", active: true },
    select: { id: true, name: true },
  });
  if (!vendedora) {
    console.log("Nenhuma vendedora VENDAS+ATACADO ativa. Crie uma antes.");
    process.exit(1);
  }

  const base = {
    brand: "OKEY" as const,
    story: "Trabalho com moda há alguns anos e quero elevar o mix da loja.",
    state: "CE",
    city: "Fortaleza",
    serviceModel: "LOJA_FISICA" as const,
    instagramImagePath: "/uploads/atacado/exemplo-instagram.webp",
    storeImagePath: "/uploads/atacado/exemplo-loja.webp",
    storeImageKind: "ESPACO_FISICO" as const,
    marketTime: "3 anos",
    teamSize: "2 pessoas",
    brandsCarried: "Marcas regionais",
    foundUs: "INSTAGRAM" as const,
    followTime: "6 meses",
    investmentBand: "DE_3_A_5K" as const,
    wantsVisit: true,
    submittedIp: MARCADOR_SEED,
  };

  // Remove só o que um run anterior deste script criou: o marcador "seed"
  // nunca é usado por cadastro real, então isto não toca em candidaturas reais.
  await prisma.wholesaleLead.deleteMany({ where: { submittedIp: MARCADOR_SEED } });

  const leads = [
    { ...base, contactName: "Ana", email: "ana@exemplo.com", phone: "85988887777", instagram: "lojadaana", cnpj: "11222333000181", sellerId: vendedora.id },
    // Mesmo CNPJ da Ana, já reprovado: faz o aviso disparar.
    { ...base, contactName: "Ana Maria", email: "anamaria@exemplo.com", phone: "85999996666", instagram: "anamariastore", cnpj: "11222333000181", sellerId: vendedora.id, status: "REPROVADO" as const, rejectionCode: "34", decidedById: vendedora.id, decidedAt: new Date() },
    // Mesmo telefone da Bruna, SEM o nono dígito, marcado CUIDADO.
    { ...base, contactName: "Bruna", email: "bruna@exemplo.com", phone: "8588885555", instagram: "brunamodas", cnpj: "11444777000161", sellerId: vendedora.id, status: "CUIDADO" as const, cautionReason: "Mesmo telefone de cadastro anterior com dados trocados.", decidedById: vendedora.id, decidedAt: new Date() },
    { ...base, contactName: "Bruna Lima", email: "brunalima@exemplo.com", phone: "85988885555", instagram: "brunalima", cnpj: "11444777000161", sellerId: vendedora.id },
    // Loja só online: exercita o storeImageKind da decisão 21.
    { ...base, contactName: "Carla", email: "carla@exemplo.com", phone: "85977774444", instagram: "carlaonline", cnpj: "19131243000197", serviceModel: "LOJA_ONLINE" as const, storeImageKind: "LOJA_ONLINE" as const, sellerId: vendedora.id },
    // Sem dono: só a Gestão vê, e precisa distribuir.
    { ...base, contactName: "Daniela", email: "dani@exemplo.com", phone: "85966663333", instagram: "danimodas", cnpj: "34028316000103", sellerId: null },
  ];

  for (const l of leads) {
    await prisma.wholesaleLead.create({ data: l });
  }
  console.log(`Semeados ${leads.length} leads para ${vendedora.name}.`);
  console.log('Para remover: npx prisma studio, ou DELETE FROM "WholesaleLead" WHERE "submittedIp" = \'seed\';');
}

main().finally(() => prisma.$disconnect());
