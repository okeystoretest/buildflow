import type { Role } from "@prisma/client";

/**
 * O mapa de navegacao do sistema: modulos e as ferramentas de cada um.
 *
 * Existe porque a barra lateral precisa saber as ferramentas do modulo ATIVO,
 * e ate aqui cada modulo declarava as suas como botoes soltos na propria
 * index (`vendas/page.tsx`, `logistica/page.tsx`, `financeiro/ferramentas-client.tsx`).
 * Com a lista em cinco lugares, uma ferramenta nova aparecia na index e nunca
 * no menu. As paginas seguem desenhando seus atalhos como quiserem; quem
 * manda no MENU e este arquivo.
 *
 * So dados: nenhum componente e nenhum icone. O icone e resolvido por `href`
 * no cliente (`nav-client.tsx`), porque um componente de icone nao atravessa
 * a fronteira RSC -> client.
 *
 * Isto NAO e controle de acesso. Esconder um item do menu nao protege nada —
 * cada pagina confere o papel com `requireRole`, e e la que a porta fecha.
 */

/** Condicao que o layout calcula por sessao, alem do papel. */
export type NavFlag =
  /** VENDAS vinculada a loja de FLUXO SIMPLIFICADO (ve o modulo Logistica). */
  | "lojaSimplificada"
  /** Quem pode abrir a Analise de Clientes (regra de atacado). */
  | "podeAnalisar";

export interface NavTool {
  href: string;
  label: string;
  /**
   * A linha que diz para que a tela serve, mostrada na BARRA SUPERIOR.
   *
   * Mora aqui, e nao na pagina, porque o rotulo tambem mora aqui: com os dois
   * separados, renomear uma ferramenta no menu e esquecer o texto da tela
   * deixava as duas discordando e nada quebrava para avisar. Opcional porque
   * nem toda rota e uma ferramenta de menu (detalhe, formulario) — nessas a
   * barra mostra so a trilha e o titulo.
   */
  descricao?: string;
  /** Papeis que veem o item sempre. Vazio = so a `flag` abre. */
  roles: Role[];
  /** LIBERA quem o papel nao cobre. Nunca tira de quem o papel ja cobre. */
  flag?: NavFlag;
}

export interface NavModule {
  /**
   * Destino do clique. Nulo em todo setor COM ferramentas: clicar nele apenas
   * abre a lista, e quem navega e a ferramenta escolhida (pedido de
   * 04/11/2026, desfazendo a abertura automatica da primeira). So os modulos
   * de tela unica (Rank, Fluxo) levam a algum lugar.
   */
  href: string | null;
  /** Prefixo das rotas do setor, para saber qual esta ativo. */
  base: string;
  label: string;
  /** Como em `NavTool`. So os modulos de tela unica (Rank, Fluxo) usam. */
  descricao?: string;
  roles: Role[];
  flag?: NavFlag;
  tools: NavTool[];
}

/**
 * O que a barra superior escreve para uma rota: a trilha (o setor), o titulo e
 * a descricao.
 *
 * CASA A FERRAMENTA POR IGUALDADE, nao por prefixo — e esta e a diferenca para
 * `ferramentaAtiva`, que o menu usa. As duas perguntas sao outras:
 *
 *   menu  — "de que ferramenta esta tela faz parte?"  -> prefixo.
 *           Editar o pedido 42 e parte de "Lancar Pedidos", e o item acende.
 *   barra — "em que tela eu estou?"                   -> igualdade.
 *           Em `/vendas/42/editar` a barra NAO pode dizer "Lancar Pedidos":
 *           seria um titulo que nomeia outra tela, com a descricao errada
 *           junto ("seus pedidos registrados" numa tela de edicao).
 *
 * Rota que nao casa nenhuma ferramenta devolve o titulo do MODULO e nenhuma
 * descricao — "Comercial" acima de uma tela de edicao e menos errado que um
 * titulo em branco, e inventar descricao e pior que nao ter.
 */
export function cabecalhoDaRota(
  pathname: string,
  modulos: NavModule[],
): { trilha: string | null; titulo: string; descricao: string | null } | null {
  const base = moduloAtivo(pathname, modulos);
  const m = modulos.find((x) => x.base === base);
  if (!m) return null;

  const t = m.tools.find((x) => x.href === pathname);
  if (t) return { trilha: m.label, titulo: t.label, descricao: t.descricao ?? null };

  // SEM TRILHA aqui, sempre. O titulo ja E o nome do modulo — nos dois casos
  // que caem neste ponto:
  //   - tela unica (Rank, Fluxo), onde o modulo e a propria pagina;
  //   - rota sem ferramenta (um formulario, um detalhe), onde o modulo e o
  //     mais especifico que sabemos dizer.
  // Pôr a trilha escreveria "COMERCIAL / Comercial" uma em cima da outra.
  return { trilha: null, titulo: m.label, descricao: m.descricao ?? null };
}

/**
 * A COR DE CADA MODULO, em quatro usos.
 *
 * Mora aqui, e nao na barra lateral, porque dois lugares a desenham: o menu
 * (chip do icone) e a FAIXA que atravessa o topo da janela, na barra superior.
 * Com o mapa dentro de um dos dois, o outro teria o proprio — e a faixa diria
 * uma cor enquanto o icone dizia outra.
 *
 * `chipSuave` e o contorno do icone quando o item NAO esta aceso: a propria
 * cor do setor a 15%, nao um cinza neutro. O cinza (`bg-secondary`) ficava a 13
 * pontos de RGB do fundo do card no tema escuro — existia no HTML e sumia no
 * olho, e o menu parecia ter dois padroes de icone (05/11/2026).
 */
export const ACENTO: Record<
  string,
  { faixa: string; chip: string; chipSuave: string; texto: string }
> = {
  "/dashboard":  { faixa: "bg-rank",         chip: "bg-rank text-rank-fg",                 chipSuave: "bg-rank/15 text-rank-text",                 texto: "text-rank-text" },
  // Branco acinzentado, e nao a cor de um setor: o Fluxo ATRAVESSA Comercial,
  // Financeiro e Logistica, entao vestir a de um deles dizia a coisa errada.
  // Token proprio (`fluxo`) e nao `slate-*` solto, para o contraste entrar na
  // checagem junto com os outros — foi assim que os seis setores reprovaram
  // em 16/10 sem ninguem notar.
  //
  // ACESO USA O CHIP SOLIDO, e e a UNICA entrada que foge do padrao "fundo a
  // 15% com o glifo na cor". O padrao supoe uma cor saturada: a 15% sobre o
  // card, um quase-branco (#e2e8f0) soma uns poucos pontos de RGB e o botao
  // ficava visivelmente SEM COR ao ser clicado, enquanto a faixa do topo
  // mostrava a cor dele (06/11/2026). Solido, o chip claro com o glifo escuro
  // aparece nos dois temas — que e o que "aceso" precisa significar.
  "/fluxo":      { faixa: "bg-fluxo",        chip: "bg-fluxo text-fluxo-fg",               chipSuave: "bg-fluxo text-fluxo-fg",                    texto: "text-fluxo-text" },
  "/vendas":     { faixa: "bg-vendas",       chip: "bg-vendas text-vendas-fg",             chipSuave: "bg-vendas/15 text-vendas-text",             texto: "text-vendas-text" },
  "/financeiro": { faixa: "bg-financeiro",   chip: "bg-financeiro text-financeiro-fg",     chipSuave: "bg-financeiro/15 text-financeiro-text",     texto: "text-financeiro-text" },
  "/logistica":  { faixa: "bg-distribuicao", chip: "bg-distribuicao text-distribuicao-fg", chipSuave: "bg-distribuicao/15 text-distribuicao-text", texto: "text-distribuicao-text" },
  "/motorista":  { faixa: "bg-motorista",    chip: "bg-motorista text-motorista-fg",       chipSuave: "bg-motorista/15 text-motorista-text",       texto: "text-motorista-text" },
  "/gestao":     { faixa: "bg-brand",        chip: "bg-brand text-brand-fg",               chipSuave: "bg-brand/15 text-brand-text",               texto: "text-brand-text" },
};

const SEM_COR = {
  faixa: "bg-transparent",
  chip: "bg-primary text-primary-foreground",
  chipSuave: "bg-primary/15 text-primary",
  texto: "text-primary",
};

/** O acento de um modulo pela `base`. Rota desconhecida cai na cor primaria. */
export const corDoModulo = (base: string | null) => (base && ACENTO[base]) || SEM_COR;

/** Configuracoes: fora do NAV porque mora no rodape da barra, nao na lista. */
export const CONFIG = { href: "/gestao", label: "Gestão", roles: ["GESTAO"] as Role[] };

export const NAV: NavModule[] = [
  { href: "/dashboard", base: "/dashboard", label: "Ranking de Vendas", descricao: "A posição de cada vendedora no mês e o quanto falta para a meta.", roles: ["GESTAO", "VENDAS"], tools: [] },
  { href: "/fluxo", base: "/fluxo", label: "Fluxo de Pedidos", descricao: "Em que etapa está cada pedido, loja por loja.", roles: ["GESTAO", "VENDAS", "FINANCEIRO"], tools: [] },
  {
    href: null,
    base: "/vendas",
    label: "Comercial",
    roles: ["GESTAO", "VENDAS", "FINANCEIRO"],
    // A ORDEM e a pedida pelo dono, nao alfabetica nem por rota. Mexer nela
    // muda o menu de quem usa o sistema todo dia: so com pedido.
    tools: [
      { href: "/vendas/clientes", label: "Cadastro de Clientes", descricao: "Clientes da carteira, com endereço e contato para a entrega.", roles: ["GESTAO", "VENDAS", "FINANCEIRO"] },
      { href: "/vendas/excursoes", label: "Gestão de Excursões", descricao: "Excursões cadastradas e os clientes vinculados a cada uma.", roles: ["GESTAO", "VENDAS", "FINANCEIRO"] },
      // Aponta para a INDEX do modulo (a lista de pedidos com as acoes), nao
      // para o formulario: lancar um pedido comeca por ver o que ja existe.
      { href: "/vendas", label: "Lançar Pedidos", descricao: "Seus pedidos registrados e os atalhos para abrir um novo.", roles: ["GESTAO", "VENDAS", "FINANCEIRO"] },
      // `roles` vazio: quem abre esta tela nao e um papel, e a regra de
      // atacado (`podeAnalisar`). Sem a flag, ninguem ve.
      { href: "/vendas/analise-clientes", label: "Qualificação de Clientes", descricao: "Candidaturas de atacado e a decisão de cada uma.", roles: [], flag: "podeAnalisar" },
      { href: "/vendas/tarefas", label: "Agenda de Tarefas", descricao: "As tarefas do dia e o que já foi concluído.", roles: ["GESTAO", "VENDAS", "FINANCEIRO"] },
      { href: "/vendas/historico", label: "Vendas Realizadas", descricao: "Pedidos já encerrados, com filtro por período e busca.", roles: ["GESTAO", "VENDAS", "FINANCEIRO"] },
      { href: "/vendas/relatorio-campanha", label: "Resultados de Campanhas", descricao: "Desempenho de cada campanha e o que cada vendedora fez nela.", roles: ["GESTAO", "VENDAS", "FINANCEIRO"] },
      // "Meus Selects" e a versao da vendedora (roadmap e compras, sem
      // financeiro). Gestao e Financeiro tem a tela cheia em /financeiro/select.
      // Fica no fim: nao estava na ordem que o dono passou.
      { href: "/vendas/select", label: "Meus Selects", descricao: "O roteiro e as compras das suas clientes no Select.", roles: ["VENDAS"] },
      // NO FIM, como "Meus Selects", e pelo mesmo motivo: nao estava na ordem
      // que o dono passou. Entrar no meio seria decidir por ele a posicao de
      // uma ferramenta nova numa lista que ele ordenou a mao.
      { href: "/vendas/cronograma", label: "Cronograma de Conteúdo", descricao: "O que o Marketing vai publicar, e quando.", roles: ["GESTAO", "VENDAS", "FINANCEIRO"] },
      // Ao lado do Cronograma: as duas leem do Build.Connect e nenhuma escreve.
      { href: "/vendas/vitrine", label: "Vitrine", descricao: "Fotos, vídeos e documentos publicados no Build.Connect.", roles: ["GESTAO", "VENDAS", "FINANCEIRO"] },
    ],
  },
  {
    href: null,
    base: "/financeiro",
    label: "Financeiro",
    roles: ["GESTAO", "FINANCEIRO"],
    tools: [
      { href: "/financeiro", label: "Gestão de Pedidos", descricao: "Auditoria, faturamento e liberação de pedidos.", roles: ["GESTAO", "FINANCEIRO"] },
      { href: "/financeiro/historico", label: "Registo de Pedidos", descricao: "Todo pedido que passou pelo Financeiro, com filtro por período.", roles: ["GESTAO", "FINANCEIRO"] },
      { href: "/financeiro/select", label: "Contratos Select", descricao: "Cada contrato Select com as parcelas e os pagamentos.", roles: ["GESTAO", "FINANCEIRO"] },
      { href: "/financeiro/entregas", label: "Repasse a Motoristas", descricao: "Entregas a pagar e os comprovantes de cada motorista.", roles: ["GESTAO", "FINANCEIRO"] },
      { href: "/financeiro/ferramentas/status", label: "Situação do Pagamento", descricao: "As situações que um pagamento pode assumir.", roles: ["GESTAO", "FINANCEIRO"] },
      { href: "/financeiro/ferramentas/bancos", label: "Registro de Bancos", descricao: "Os bancos disponíveis para registrar um recebimento.", roles: ["GESTAO", "FINANCEIRO"] },
      { href: "/financeiro/ferramentas/pagamento", label: "Meios de Pagamento", descricao: "As formas de pagamento que o pedido pode usar.", roles: ["GESTAO", "FINANCEIRO"] },
      { href: "/financeiro/ferramentas/cnpj", label: "Empresas / CNPJs", descricao: "As empresas do grupo que podem emitir um pedido.", roles: ["GESTAO", "FINANCEIRO"] },
    ],
  },
  {
    href: null,
    base: "/logistica",
    label: "Logística",
    roles: ["GESTAO", "LOGISTICA"],
    flag: "lojaSimplificada",
    // As ferramentas sao de LOGISTICA/GESTAO: a vendedora de loja
    // simplificada entra no modulo, mas so ve o quadro.
    tools: [
      { href: "/logistica", label: "Movimentação de Pedidos", descricao: "Os pedidos que a Logística está preparando agora.", roles: ["GESTAO", "LOGISTICA"] },
      { href: "/logistica/controle-pecas", label: "Controle de Peças", descricao: "Conferência de peças por pedido, da separação à expedição.", roles: ["GESTAO", "LOGISTICA"] },
      { href: "/logistica/pendencias", label: "Controle de Pendências", descricao: "Pedidos parados na preparação e há quanto tempo.", roles: ["GESTAO", "LOGISTICA"] },
      { href: "/logistica/atrasos", label: "Monitor de Atrasos", descricao: "Entregas fora do prazo combinado, com o motivo registrado.", roles: ["GESTAO", "LOGISTICA"] },
      { href: "/logistica/metricas", label: "Tempo de Preparação", descricao: "Quanto tempo o pedido leva em cada etapa até sair para entrega.", roles: ["GESTAO", "LOGISTICA"] },
      { href: "/logistica/entregas", label: "Histórico de Entregas", descricao: "Entregas concluídas, com motorista, data e comprovante.", roles: ["GESTAO", "LOGISTICA"] },
    ],
  },
  {
    href: null,
    base: "/motorista",
    label: "Motorista",
    // LOGISTICA entra pelas ferramentas Chamados e Dashboard (nao ve Entregas).
    roles: ["GESTAO", "MOTORISTA", "LOGISTICA"],
    tools: [
      { href: "/motorista", label: "Entregas", descricao: "As entregas atribuídas a você e o andamento de cada uma.", roles: ["GESTAO", "MOTORISTA"] },
      { href: "/motorista/chamados", label: "Chamados", descricao: "Pedidos de transporte abertos e quem já aceitou.", roles: ["GESTAO", "MOTORISTA", "LOGISTICA"] },
      { href: "/motorista/dashboard", label: "Dashboard", descricao: "Volume de chamados, tempo de atendimento e quilometragem.", roles: ["GESTAO", "LOGISTICA"] },
    ],
  },
];

/** Condicoes da sessao, resolvidas uma vez no layout. */
export type NavFlags = Partial<Record<NavFlag, boolean>>;

function liberado(item: { roles: Role[]; flag?: NavFlag }, role: Role, flags: NavFlags): boolean {
  // A flag LIBERA quem o papel nao cobre (a vendedora de loja simplificada no
  // modulo Logistica); nunca tira de quem o papel ja cobre.
  return item.roles.includes(role) || (item.flag !== undefined && flags[item.flag] === true);
}

/** Os modulos que este usuario ve, cada um ja com as ferramentas dele. */
export function navParaSessao(role: Role, flags: NavFlags = {}): NavModule[] {
  return NAV.filter((m) => liberado(m, role, flags)).map((m) => ({
    ...m,
    tools: m.tools.filter((t) => liberado(t, role, flags)),
  }));
}

/**
 * O href do modulo ativo: o prefixo MAIS LONGO que casa com o caminho atual.
 * Sem isso /motorista venceria /motorista/chamados por ser o primeiro da lista.
 */
export function moduloAtivo(pathname: string, modulos: { base: string }[]): string | null {
  let melhor: string | null = null;
  for (const m of modulos) {
    if (pathname === m.base || pathname.startsWith(m.base + "/")) {
      if (!melhor || m.base.length > melhor.length) melhor = m.base;
    }
  }
  return melhor;
}

/**
 * Qual ferramenta de `tools` esta aberta em `pathname`, pelo prefixo MAIS
 * LONGO. `null` quando nenhuma.
 *
 * CHAME COM A LISTA INTEIRA, nunca com uma ferramenta por vez: a arbitragem E
 * a comparacao entre as candidatas. Com `[t]` sozinha, toda ferramenta cujo
 * href e prefixo de outra acende junto — em /vendas/clientes, "Lancar Pedidos"
 * (/vendas) casava tambem, e os Favoritos mostravam duas acesas ao mesmo tempo
 * (05/11/2026).
 *
 * Mesma regra de `moduloAtivo`, um nivel abaixo.
 */
export function ferramentaAtiva(pathname: string, tools: { href: string }[]): string | null {
  let melhor: string | null = null;
  for (const t of tools) {
    if (pathname === t.href || pathname.startsWith(t.href + "/")) {
      if (!melhor || t.href.length > melhor.length) melhor = t.href;
    }
  }
  return melhor;
}

/* ------------------------------------------------------------- favoritos */

/** Quantas ferramentas aparecem em Favoritos na barra lateral. */
export const MAX_FAVORITOS = 4;
/**
 * Aberturas necessarias para uma ferramenta virar favorita.
 *
 * Abaixo disso a secao nem aparece: uma ferramenta aberta UMA vez e acaso, nao
 * habito, e um atalho que se reordena a cada visita isolada obriga a reler o
 * menu toda vez — custa mais do que o atalho economiza.
 */
export const MIN_USOS_FAVORITO = 3;

/**
 * A contagem de aberturas, higienizada.
 *
 * SEPARADA da leitura do localStorage para poder ser conferida por script: o
 * valor vem do navegador da pessoa, onde pode ter sido editado a mao,
 * corrompido, ou gravado por uma versao anterior com outro formato. Uma entrada
 * estranha que passasse daqui iria parar na ordenacao do menu.
 */
export function sanitizarUsos(cru: unknown): Record<string, number> {
  if (!cru || typeof cru !== "object" || Array.isArray(cru)) return {};
  const limpo: Record<string, number> = {};
  for (const [href, n] of Object.entries(cru as Record<string, unknown>)) {
    if (typeof n === "number" && Number.isFinite(n) && n > 0) limpo[href] = n;
  }
  return limpo;
}

/**
 * As ferramentas que vao para Favoritos, da mais aberta para a menos.
 *
 * SO ENTRA O QUE AINDA EXISTE no menu desta pessoa: um papel que perdeu acesso
 * nao pode seguir com o atalho no topo (seria um vazamento pela navegacao), e
 * ferramenta renomeada ou removida viraria link quebrado no lugar mais visivel
 * da tela.
 *
 * PURA e exportada para ser conferida por script: sao quatro regras (minimo,
 * teto, existencia, desempate) e todas quebram em silencio — o menu continua
 * abrindo, so com os atalhos errados.
 */
export function escolherFavoritos(
  usos: Record<string, number>,
  modulos: NavModule[],
): { tool: NavTool; modulo: NavModule }[] {
  const porHref = new Map(
    modulos.flatMap((m) => m.tools.map((t) => [t.href, { tool: t, modulo: m }] as const)),
  );
  return Object.entries(usos)
    .filter(([href, n]) => n >= MIN_USOS_FAVORITO && porHref.has(href))
    // Desempate pelo href para a ordem nao dancar entre renders com empate.
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_FAVORITOS)
    .map(([href]) => porHref.get(href)!);
}
