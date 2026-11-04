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
  roles: Role[];
  flag?: NavFlag;
  tools: NavTool[];
}

/** Configuracoes: fora do NAV porque mora no rodape da barra, nao na lista. */
export const CONFIG = { href: "/gestao", label: "Gestão", roles: ["GESTAO"] as Role[] };

export const NAV: NavModule[] = [
  { href: "/dashboard", base: "/dashboard", label: "Rank de Vendas", roles: ["GESTAO", "VENDAS"], tools: [] },
  { href: "/fluxo", base: "/fluxo", label: "Fluxo de Pedidos", roles: ["GESTAO", "VENDAS", "FINANCEIRO"], tools: [] },
  {
    href: null,
    base: "/vendas",
    label: "Comercial",
    roles: ["GESTAO", "VENDAS", "FINANCEIRO"],
    // A ORDEM e a pedida pelo dono, nao alfabetica nem por rota. Mexer nela
    // muda o menu de quem usa o sistema todo dia: so com pedido.
    tools: [
      { href: "/vendas/clientes", label: "Cadastro de Clientes", roles: ["GESTAO", "VENDAS", "FINANCEIRO"] },
      { href: "/vendas/excursoes", label: "Gestão de Excursões", roles: ["GESTAO", "VENDAS", "FINANCEIRO"] },
      // Aponta para a INDEX do modulo (a lista de pedidos com as acoes), nao
      // para o formulario: lancar um pedido comeca por ver o que ja existe.
      { href: "/vendas", label: "Lançar Pedidos", roles: ["GESTAO", "VENDAS", "FINANCEIRO"] },
      // `roles` vazio: quem abre esta tela nao e um papel, e a regra de
      // atacado (`podeAnalisar`). Sem a flag, ninguem ve.
      { href: "/vendas/analise-clientes", label: "Qualificação de Clientes", roles: [], flag: "podeAnalisar" },
      { href: "/vendas/tarefas", label: "Agenda de Tarefas", roles: ["GESTAO", "VENDAS", "FINANCEIRO"] },
      { href: "/vendas/historico", label: "Vendas Realizadas", roles: ["GESTAO", "VENDAS", "FINANCEIRO"] },
      { href: "/vendas/relatorio-campanha", label: "Resultados de Campanhas", roles: ["GESTAO", "VENDAS", "FINANCEIRO"] },
      // "Meus Selects" e a versao da vendedora (roadmap e compras, sem
      // financeiro). Gestao e Financeiro tem a tela cheia em /financeiro/select.
      // Fica no fim: nao estava na ordem que o dono passou.
      { href: "/vendas/select", label: "Meus Selects", roles: ["VENDAS"] },
    ],
  },
  {
    href: null,
    base: "/financeiro",
    label: "Financeiro",
    roles: ["GESTAO", "FINANCEIRO"],
    tools: [
      { href: "/financeiro", label: "Gestão de Pedidos", roles: ["GESTAO", "FINANCEIRO"] },
      { href: "/financeiro/historico", label: "Registo de Pedidos", roles: ["GESTAO", "FINANCEIRO"] },
      { href: "/financeiro/select", label: "Contratos Select", roles: ["GESTAO", "FINANCEIRO"] },
      { href: "/financeiro/entregas", label: "Repasse a Motoristas", roles: ["GESTAO", "FINANCEIRO"] },
      { href: "/financeiro/ferramentas/status", label: "Situação do Pagamento", roles: ["GESTAO", "FINANCEIRO"] },
      { href: "/financeiro/ferramentas/bancos", label: "Registro de Bancos", roles: ["GESTAO", "FINANCEIRO"] },
      { href: "/financeiro/ferramentas/pagamento", label: "Meios de Pagamento", roles: ["GESTAO", "FINANCEIRO"] },
      { href: "/financeiro/ferramentas/cnpj", label: "Empresas / CNPJs", roles: ["GESTAO", "FINANCEIRO"] },
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
      { href: "/logistica", label: "Movimentação de Pedidos", roles: ["GESTAO", "LOGISTICA"] },
      { href: "/logistica/controle-pecas", label: "Controle de Peças", roles: ["GESTAO", "LOGISTICA"] },
      { href: "/logistica/pendencias", label: "Controle de Pendências", roles: ["GESTAO", "LOGISTICA"] },
      { href: "/logistica/atrasos", label: "Monitor de Atrasos", roles: ["GESTAO", "LOGISTICA"] },
      { href: "/logistica/metricas", label: "Tempo de Preparação", roles: ["GESTAO", "LOGISTICA"] },
      { href: "/logistica/entregas", label: "Histórico de Entregas", roles: ["GESTAO", "LOGISTICA"] },
    ],
  },
  {
    href: null,
    base: "/motorista",
    label: "Motorista",
    // LOGISTICA entra pelas ferramentas Chamados e Dashboard (nao ve Entregas).
    roles: ["GESTAO", "MOTORISTA", "LOGISTICA"],
    tools: [
      { href: "/motorista", label: "Entregas", roles: ["GESTAO", "MOTORISTA"] },
      { href: "/motorista/chamados", label: "Chamados", roles: ["GESTAO", "MOTORISTA", "LOGISTICA"] },
      { href: "/motorista/dashboard", label: "Dashboard", roles: ["GESTAO", "LOGISTICA"] },
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
