/**
 * Copy institucional das LPs de atacado, transcrita da planilha
 * "Database - LP Atacado (OKEY & Lov Club)" e do anexo A da spec.
 *
 * COMPARTILHADO ENTRE AS MARCAS de propósito: as abas se chamam "Por que
 * revender (marca)" e o texto diz "nossa marca", nunca OKEY. Só a identidade
 * visual e o nome exibido diferem — é isso que faz a Fase 2 ser uma LP e um
 * valor, não uma migration (decisão 3).
 *
 * Cada bloco é definido UMA vez e reutilizado pelas duas marcas. Duas cópias
 * do mesmo texto divergem na primeira edição, e aí as duas páginas passam a
 * prometer coisas diferentes.
 *
 * NÃO REESCREVA ESTE TEXTO. São promessas comerciais (margem de até 100%,
 * exclusividade territorial, tecidos da Linha Italiana Premium) numa página
 * pública. Mudança de texto é decisão da marca, não de implementação.
 *
 * Duas grafias parecem erro e são transcrição deliberada, conferida na
 * planilha: "rodoviário/expressa" (vantagem 2) contra "rodoviário expresso"
 * (FAQ do grupo 2) são células distintas do negócio; e o ponto depois do
 * parêntese em "(Consulte os critérios junto à nossa equipe)." também é do
 * original. Não "arrume" nenhuma das duas.
 */

const REASONS = [
  { title: "Altamente Lucrativo", subtitle: "Sua loja com mais rentabilidade" },
  { title: "Diferencial Qualitativo", subtitle: "Atemporalidade e padrão alta-costura" },
  { title: "Design Autoral e Genuíno", subtitle: "Identidade única para o seu ponto de venda" },
] as const;

const ADVANTAGES = [
  {
    title: "Suporte Exclusivo",
    subtitle: "Acompanhamento personalizado para o seu negócio",
    body: "Oferecemos suporte completo na representação da marca. Nossos catálogos contam com especificações detalhadas de cada peça, e você dispõe do atendimento dedicado de uma consultora exclusiva para auxiliar suas escolhas e otimizar seus resultados.",
  },
  {
    title: "Logística Ágil",
    subtitle: "Segurança e eficiência na entrega",
    body: "Parcerias com as principais transportadoras do país garantem a entrega dos seus pedidos com máxima agilidade e segurança, seja por meio de frete aéreo ou envio rodoviário/expressa.",
  },
  {
    title: "Posicionamento de Mercado",
    subtitle: "Acesso ao segmento mais promissor da moda",
    body: "Desenvolvemos coleções direcionadas ao público consumidor de maior relevância e poder de compra no mercado de moda, assegurando demanda constante e alinhada às expectativas de clientes exigentes.",
  },
  {
    title: "Excelência em Produto",
    subtitle: "Design autoral e padrão alta-costura",
    body: "Criamos peças modernas que combinam alta qualidade, caimento impecável e design autoral. Um portfólio exclusivo estruturado para diferenciar a sua loja no mercado e destacar o seu espaço frente à concorrência.",
  },
  {
    title: "Rentabilidade Estratégica",
    subtitle: "Excelente retorno financeiro e alto giro",
    body: "Proporcione ao seu negócio margens de lucro atrativas e superiores à média de mercado. Nossas peças combinam alto apelo visual e aceitação, favorecendo um giro de estoque contínuo e rentável.",
  },
  {
    title: "Valor Percebido",
    subtitle: "Sofisticação comparável às grifes internacionais",
    body: "A qualidade singular dos tecidos e o design refinado posicionam nossas coleções ao lado dos grandes nomes da moda europeia, proporcionando uma experiência de compra que encanta e fideliza suas clientes.",
  },
] as const;

const FAQ = [
  {
    group: "Pedido e Condições de Compra",
    items: [
      {
        q: "Qual é o valor ou a quantidade mínima para o primeiro pedido?",
        a: "Trabalhamos com condições acessíveis para que você possa introduzir a marca em seu ponto de venda com tranquilidade.",
      },
      {
        q: "Como funciona o processo de seleção das peças e coleções?",
        a: "Disponibilizamos catálogos digitais completos e atualizados, com especificações técnicas e materiais de apoio. Além disso, nossa equipe de consultoria está à disposição para auxiliar na escolha das peças que melhor se adaptam ao perfil do seu público.",
      },
    ],
  },
  {
    group: "Logística e Entrega",
    items: [
      {
        q: "Quais são as opções e prazos de entrega para a minha região?",
        a: "Possuímos parcerias com as principais transportadoras do país, incluindo modalidades de envio aéreo e rodoviário expresso. O prazo e o valor do frete são calculados de acordo com a sua localidade e o volume do pedido, garantindo máxima eficiência e segurança.",
      },
      {
        q: "Como funcionam as etiquetas com preços sugeridos?",
        a: "Para sua maior praticidade, os produtos são entregues devidamente etiquetados com os valores sugeridos para revenda. Esses valores são planejados estrategicamente para cobrir os seus custos logísticos e assegurar a sua margem de lucro.",
      },
    ],
  },
  {
    group: "Margem e Exclusividade",
    items: [
      {
        q: "Qual é a margem de lucro praticada nas revendas?",
        a: "Nossos parceiros contam com uma margem de lucro de até 100%, variando conforme a linha de produtos e o volume de aquisição.",
      },
      {
        q: "Existe política de exclusividade territorial para a minha cidade?",
        a: "Sim. Avaliamos a localização e a viabilidade do ponto de venda para garantir a exclusividade de marca em determinadas regiões, preservando o valor percebido e a competitividade do seu negócio. (Consulte os critérios junto à nossa equipe).",
      },
    ],
  },
  {
    group: "Qualidade e Trocas",
    items: [
      {
        q: "Qual é a garantia em relação à qualidade e acabamento dos produtos?",
        a: "Todas as peças passam por um rigoroso controle de qualidade, desde a seleção dos tecidos importados da Linha Italiana Premium até a confecção artesanal dos detalhes. Caso ocorra qualquer divergência, dispomos de uma política ágil de suporte e troca para lojistas.",
      },
    ],
  },
] as const;

export interface BrandContent {
  brandName: string;
  reasons: { title: string; subtitle: string }[];
  advantages: { title: string; subtitle: string; body: string }[];
  faq: { group: string; items: { q: string; a: string }[] }[];
}

export const WHOLESALE_CONTENT: Record<"OKEY" | "LOV_CLUB", BrandContent> = {
  OKEY: {
    brandName: "OKEY",
    reasons: [...REASONS],
    advantages: [...ADVANTAGES],
    faq: FAQ.map((g) => ({ group: g.group, items: [...g.items] })),
  },
  LOV_CLUB: {
    brandName: "Lov Club",
    reasons: [...REASONS],
    advantages: [...ADVANTAGES],
    faq: FAQ.map((g) => ({ group: g.group, items: [...g.items] })),
  },
};

export function getBrandContent(
  slug: string,
): { brand: "OKEY" | "LOV_CLUB"; content: BrandContent } | null {
  if (slug === "okey") return { brand: "OKEY", content: WHOLESALE_CONTENT.OKEY };
  if (slug === "lov-club") return { brand: "LOV_CLUB", content: WHOLESALE_CONTENT.LOV_CLUB };
  return null;
}
