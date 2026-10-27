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

/**
 * Os três motivos. Título e subtítulo são da planilha; o `body` NÃO É.
 *
 * A planilha só traz título e subtítulo para estes três (ao contrário das
 * vantagens, que já vêm com parágrafo). Os parágrafos abaixo foram escritos em
 * 16/10/2026, com autorização do dono, sob uma restrição: nenhuma afirmação
 * NOVA. Cada frase reaproveita uma afirmação que a planilha já aprovou em
 * outro lugar desta mesma página — e é por isso que o parágrafo 1 repete a
 * condição da margem, o 2 a Linha Italiana Premium e o 3 o critério da
 * exclusividade. Se a marca quiser dizer algo que a planilha não diz, o texto
 * volta a ser decisão dela, não daqui.
 */
const REASONS = [
  {
    title: "Altamente Lucrativo",
    subtitle: "Sua loja com mais rentabilidade",
    body: "A margem de lucro chega a até 100%, variando conforme a linha de produtos e o volume de aquisição. As peças são entregues devidamente etiquetadas com os valores sugeridos para revenda, planejados para cobrir os seus custos logísticos e assegurar a sua margem.",
  },
  {
    title: "Diferencial Qualitativo",
    subtitle: "Atemporalidade e padrão alta-costura",
    body: "Todas as peças passam por um rigoroso controle de qualidade, desde a seleção dos tecidos importados da Linha Italiana Premium até a confecção artesanal dos detalhes. É um acervo que não depende de estação para continuar vendendo.",
  },
  {
    title: "Design Autoral e Genuíno",
    subtitle: "Identidade única para o seu ponto de venda",
    body: "Avaliamos a localização e a viabilidade do ponto de venda para garantir a exclusividade de marca em determinadas regiões, preservando o valor percebido e a competitividade do seu negócio. (Consulte os critérios junto à nossa equipe).",
  },
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

/**
 * A faixa de métricas e os dois pares da abertura.
 *
 * ESTAVAM NO TSX, e é por isso que mudaram de lugar. `sections.tsx` estabelece
 * no próprio cabeçalho que "nenhuma afirmação comercial é escrita aqui" — e
 * então afirmava, em texto fixo, margem, tecido, atendimento e exclusividade.
 * Todas rastreáveis ao anexo A (FAQ 3, FAQ 4, vantagem 1), nada inventado; o
 * problema era a GARANTIA: fora do digest, essas dez frases podiam ser editadas
 * sem nenhuma checagem ficar vermelha, enquanto a decisão do dono de não abrir
 * texto à edição existe justamente porque "a garantia de que ninguém publica
 * promessa que o negócio não fez vale mais que a comodidade".
 *
 * `nota` carrega a CONDIÇÃO junto do número, sempre. A planilha condiciona a
 * margem ("até 100%, variando conforme a linha de produtos e o volume"), e
 * número sem condição é promessa que o negócio não fez.
 */
const METRICS = [
  {
    valor: "Até 100%",
    rotulo: "De margem na revenda",
    nota: "Varia conforme a linha de produtos e o volume de aquisição.",
  },
  {
    valor: "Linha Italiana Premium",
    rotulo: "Tecidos importados",
    nota: "Controle de qualidade do tecido à confecção artesanal dos detalhes.",
  },
  {
    valor: "Consultora exclusiva",
    rotulo: "Atendimento dedicado",
    nota: "Catálogos com especificação de cada peça e apoio na escolha.",
  },
  {
    valor: "Exclusividade territorial",
    rotulo: "Por região",
    nota: "Avaliada pela localização e viabilidade do ponto de venda.",
  },
] as const;

/** Os dois pares trazidos para perto da ação, na abertura. */
const HIGHLIGHTS = [
  { termo: "Margem na revenda", valor: "Até 100%, conforme a linha e o volume" },
  { termo: "Exclusividade", valor: "Por região, sob critério" },
] as const;

/**
 * A frase do preview do WhatsApp, que é a PRIMEIRA coisa que a lojista lê.
 *
 * `{marca}` é substituído pelo nome exibido. Estava no `generateMetadata` como
 * template literal, afirmando "margem de até 100%" sem a condição — a
 * afirmação mais exposta da página era a única sem o "varia conforme".
 */
/**
 * Aviso de privacidade da LP. Atende o Art. 9 da LGPD, que exige que o titular
 * saiba QUEM trata, PARA QUÊ, POR QUANTO TEMPO e COMO exercer os direitos do
 * Art. 18 — a página tinha só a finalidade, numa linha.
 *
 * `email` é o canal do Art. 18 e foi trocado em 17/10/2026, a pedido do dono,
 * de `contato@okeystore.com.br` (o endereço publicado no site da marca) para
 * `okeytecnologia@gmail.com`. O que o Art. 9 exige é um canal que FUNCIONE e
 * seja atendido — o domínio do endereço não importa; quem responde, sim.
 *
 * `controlador` é a RAZÃO SOCIAL, não o nome comercial: "Okey Store Handmade" é
 * marca, e o Art. 9 pede o agente de tratamento. CNPJ e e-mail conferidos na
 * política de privacidade do próprio site da marca (okeystore.com.br) em
 * 16/10/2026; a razão social veio do dono, porque o site não a publica.
 *
 * `retencaoDias` é 90 por decisão do dono (16/10/2026) e é o MESMO número que o
 * job de expurgo usa — ver `src/lib/wholesale-retention.ts`. Declarar aqui um
 * prazo e apagar noutro é a forma mais fácil de a página mentir: o valor tem
 * uma fonte só.
 *
 * Não confundir com os 6 meses de registro de acesso da política do site: é
 * outro dado, de outro tratamento.
 */
const PRIVACIDADE = {
  controlador: "Deliane Araujo Trajano Confecções",
  cnpj: "35.293.039/0001-29",
  email: "okeytecnologia@gmail.com",
  retencaoDias: 90,
} as const;

/**
 * Os canais no rodapé. WhatsApp e e-mail apenas, por decisão do dono
 * (16/10/2026): a LP é de captação, não de visita, e endereço convida a
 * aparecer na loja. O telefone da fábrica fica fora pelo mesmo motivo.
 *
 * O NÚMERO VEIO DO DONO, não do site. O site publica "(85) 9605.4844" — oito
 * dígitos, e celular brasileiro tem nove. O nono dígito não estava publicado, e
 * montar o `wa.me` a partir do que o site mostra exigiria escolher um dígito:
 * um dígito escolhido manda a lojista para o WhatsApp de um estranho. O dono
 * confirmou +55 85 99605-4844 em 16/10/2026, e é de lá que sai o link.
 *
 * `whatsappLink` é o número em dígitos puros com código do país, a forma que o
 * wa.me exige; `whatsapp` é a forma que a lojista lê. Os dois saem da mesma
 * decisão, e `scripts/checks/wholesale-content.ts` confere que o link tem os 13
 * dígitos de um celular brasileiro (55 + DDD + 9) — ou é null, e nada no meio.
 */
const CONTATO = {
  whatsapp: "(85) 99605-4844",
  whatsappLink: "https://wa.me/5585996054844" as string | null,
  email: "okeytecnologia@gmail.com",
} as const;

/**
 * A Lov Club é outra PESSOA JURÍDICA, não outra marca da mesma: controlador e
 * CNPJ próprios, informados pelo dono em 27/10/2026. Por isso estes dois
 * blocos existem à parte, e não como um campo a mais no compartilhado — o
 * aviso de privacidade do rodapé nomeia quem responde pelos dados, e nomear a
 * empresa errada ali não é detalhe de copy.
 */
const PRIVACIDADE_LOV = {
  controlador: "Trajano Confecções LTDA",
  cnpj: "16.838.144/0001-51",
  // O MESMO e-mail da OKEY, confirmado pelo dono em 27/10/2026 — não é sobra
  // do bloco compartilhado. É o canal do Art. 18 da LGPD (acesso, correção,
  // exclusão), e as duas empresas atendem por ele.
  email: "okeytecnologia@gmail.com",
  retencaoDias: 90,
} as const;

/**
 * O NÚMERO VEIO DO DONO, duas vezes — e a segunda é o que torna o link
 * possível. Ele informou "+55 85 8169-6371", oito dígitos, e celular
 * brasileiro tem nove: o link ficou NULL, porque escolher o nono dígito manda
 * a lojista para o WhatsApp de um estranho. Em 27/10/2026 ele confirmou o
 * nono — um 9 logo depois do 85 —, e é só de lá que sai o `wa.me`.
 *
 * É a mesma sequência que a OKEY percorreu em 16/10: número publicado com oito
 * dígitos, link null, dono confirma, link nasce. Fica registrado porque o
 * caminho curto (deduzir o dígito) parece sempre inofensivo e nunca é.
 *
 * `whatsappLink` é o número em dígitos puros com código do país, a forma que o
 * wa.me exige; `whatsapp` é a forma que a lojista lê. O check confere os 13
 * dígitos de um celular brasileiro (55 + DDD + 9) — ou null, e nada no meio.
 *
 * O e-mail é o mesmo da OKEY, confirmado pelo dono na mesma data.
 */
const CONTATO_LOV = {
  whatsapp: "(85) 98169-6371",
  whatsappLink: "https://wa.me/5585981696371" as string | null,
  email: "okeytecnologia@gmail.com",
} as const;

const META_DESCRIPTION =
  "Revenda {marca} na sua loja: margem de até 100% conforme a linha e o volume, " +
  "tecidos da Linha Italiana Premium e exclusividade territorial avaliada por região.";

export interface BrandContent {
  brandName: string;
  reasons: { title: string; subtitle: string; body: string }[];
  advantages: { title: string; subtitle: string; body: string }[];
  faq: { group: string; items: { q: string; a: string }[] }[];
  metrics: { valor: string; rotulo: string; nota: string }[];
  highlights: { termo: string; valor: string }[];
  privacidade: { controlador: string; cnpj: string; email: string; retencaoDias: number };
  contato: { whatsapp: string; whatsappLink: string | null; email: string };
  metaDescription: string;
}

// Os itens são compartilhados por referência entre as marcas, de propósito: a
// planilha não diferencia a copy por marca, só o nome exibido muda. A cópia rasa
// não promete independência; nada pode mutar o conteúdo de uma marca em runtime.
export const WHOLESALE_CONTENT: Record<"OKEY" | "LOV_CLUB", BrandContent> = {
  OKEY: {
    brandName: "OKEY",
    reasons: [...REASONS],
    advantages: [...ADVANTAGES],
    faq: FAQ.map((g) => ({ group: g.group, items: [...g.items] })),
    metrics: [...METRICS],
    highlights: [...HIGHLIGHTS],
    privacidade: { ...PRIVACIDADE },
    contato: { ...CONTATO },
    metaDescription: META_DESCRIPTION.replace("{marca}", "OKEY"),
  },
  LOV_CLUB: {
    brandName: "Lov Club",
    reasons: [...REASONS],
    advantages: [...ADVANTAGES],
    faq: FAQ.map((g) => ({ group: g.group, items: [...g.items] })),
    metrics: [...METRICS],
    highlights: [...HIGHLIGHTS],
    // Controlador, CNPJ e telefone SÃO da Lov, não os da OKEY: outra pessoa
    // jurídica (ver PRIVACIDADE_LOV e CONTATO_LOV).
    privacidade: { ...PRIVACIDADE_LOV },
    contato: { ...CONTATO_LOV },
    metaDescription: META_DESCRIPTION.replace("{marca}", "Lov Club"),
  },
};

export function getBrandContent(
  slug: string,
): { brand: "OKEY" | "LOV_CLUB"; content: BrandContent } | null {
  if (slug === "okey") return { brand: "OKEY", content: WHOLESALE_CONTENT.OKEY };
  if (slug === "lov-club") return { brand: "LOV_CLUB", content: WHOLESALE_CONTENT.LOV_CLUB };
  return null;
}
