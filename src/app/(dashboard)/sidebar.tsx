"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, ShoppingCart, Wallet, PackageCheck, Truck, Settings, KanbanSquare,
  PackageOpen, HandCoins, FileSignature, Gauge, ScrollText, CalendarDays, Store,
  ClipboardCheck, Star, Users, MapPin, ListTodo, BarChart3, History, CreditCard, FilePlus2,
  Landmark, Tag, Building2, AlertTriangle, Clock, Shirt, Timer, ClipboardList,
  Menu, X, LogOut, ChevronDown, ChevronLeft, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  moduloAtivo,
  ferramentaAtiva,
  CONFIG,
  escolherFavoritos,
  sanitizarUsos,
  type NavModule,
} from "./nav";

/**
 * Icone por href — modulos e ferramentas. Fica no cliente porque um componente
 * de icone nao atravessa a fronteira RSC -> client. Cada ferramenta reusa o
 * icone que a propria pagina ja usa no atalho dela.
 */
const ICON: Record<string, React.ReactNode> = {
  "/dashboard": <LayoutDashboard className="h-4 w-4" />,
  "/fluxo": <KanbanSquare className="h-4 w-4" />,
  "/vendas": <ShoppingCart className="h-4 w-4" />,
  "/financeiro": <Wallet className="h-4 w-4" />,
  "/logistica": <PackageCheck className="h-4 w-4" />,
  "/motorista": <Truck className="h-4 w-4" />,
  "/gestao": <Settings className="h-4 w-4" />,

  "/vendas/novo": <FilePlus2 className="h-3.5 w-3.5" />,
  "/vendas/analise-clientes": <ClipboardCheck className="h-3.5 w-3.5" />,
  "/vendas/select": <Star className="h-3.5 w-3.5" />,
  "/vendas/clientes": <Users className="h-3.5 w-3.5" />,
  "/vendas/excursoes": <MapPin className="h-3.5 w-3.5" />,
  "/vendas/tarefas": <ListTodo className="h-3.5 w-3.5" />,
  "/vendas/relatorio-campanha": <BarChart3 className="h-3.5 w-3.5" />,
  "/vendas/cronograma": <CalendarDays className="h-3.5 w-3.5" />,
  "/vendas/vitrine": <Store className="h-3.5 w-3.5" />,
  "/vendas/historico": <History className="h-3.5 w-3.5" />,

  "/financeiro/historico": <ScrollText className="h-3.5 w-3.5" />,
  "/financeiro/entregas": <HandCoins className="h-3.5 w-3.5" />,
  "/financeiro/select": <FileSignature className="h-3.5 w-3.5" />,
  "/financeiro/ferramentas/pagamento": <CreditCard className="h-3.5 w-3.5" />,
  "/financeiro/ferramentas/bancos": <Landmark className="h-3.5 w-3.5" />,
  "/financeiro/ferramentas/status": <Tag className="h-3.5 w-3.5" />,
  "/financeiro/ferramentas/cnpj": <Building2 className="h-3.5 w-3.5" />,

  "/logistica/pendencias": <AlertTriangle className="h-3.5 w-3.5" />,
  "/logistica/atrasos": <Clock className="h-3.5 w-3.5" />,
  "/logistica/controle-pecas": <Shirt className="h-3.5 w-3.5" />,
  "/logistica/metricas": <Timer className="h-3.5 w-3.5" />,
  "/logistica/entregas": <PackageOpen className="h-3.5 w-3.5" />,

  "/motorista/chamados": <ClipboardList className="h-3.5 w-3.5" />,
  "/motorista/dashboard": <Gauge className="h-3.5 w-3.5" />,
};

/**
 * Cor do modulo: a mesma paleta da barra superior antiga. A sidebar carrega a
 * cor do modulo ATIVO na faixa do topo e no chip do item aceso, para a pessoa
 * saber onde esta sem ler o rotulo.
 */
/**
 * A cor de cada modulo em tres usos.
 *
 * `chipSuave` e o contorno do icone quando o item NAO esta aberto: a propria
 * cor do setor a 15%, nao um cinza neutro. O cinza (`bg-secondary`) ficava a 13
 * pontos de RGB do fundo do card no tema escuro — existia no HTML e sumia no
 * olho, e o menu parecia ter dois padroes de icone (05/11/2026).
 */
const ACCENT: Record<string, { faixa: string; chip: string; chipSuave: string; texto: string }> = {
  "/dashboard":  { faixa: "bg-rank",         chip: "bg-rank text-rank-fg",                 chipSuave: "bg-rank/15 text-rank-text",                 texto: "text-rank-text" },
  // NEUTRO de proposito (pedido do dono, 06/11/2026): o Fluxo de Pedidos
  // atravessa Comercial, Financeiro e Logistica, entao vestir a cor de um deles
  // dizia a coisa errada. Cinza aqui nao e ausencia de cor, e a informacao de
  // que o Fluxo nao pertence a um setor so.
  "/fluxo":      { faixa: "bg-slate-400",    chip: "bg-slate-200 text-slate-900",          chipSuave: "bg-foreground/10 text-foreground",          texto: "text-foreground" },
  "/vendas":     { faixa: "bg-vendas",       chip: "bg-vendas text-vendas-fg",             chipSuave: "bg-vendas/15 text-vendas-text",             texto: "text-vendas-text" },
  "/financeiro": { faixa: "bg-financeiro",   chip: "bg-financeiro text-financeiro-fg",     chipSuave: "bg-financeiro/15 text-financeiro-text",     texto: "text-financeiro-text" },
  "/logistica":  { faixa: "bg-distribuicao", chip: "bg-distribuicao text-distribuicao-fg", chipSuave: "bg-distribuicao/15 text-distribuicao-text", texto: "text-distribuicao-text" },
  "/motorista":  { faixa: "bg-motorista",    chip: "bg-motorista text-motorista-fg",       chipSuave: "bg-motorista/15 text-motorista-text",       texto: "text-motorista-text" },
  "/gestao":     { faixa: "bg-brand",        chip: "bg-brand text-brand-fg",               chipSuave: "bg-brand/15 text-brand-text",               texto: "text-brand-text" },
};
/**
 * Contorno do icone de MODULO quando ele nao esta aberto.
 *
 * NEUTRO de proposito (pedido do dono, 05/11/2026): o menu nao fica colorido o
 * tempo todo — a cor do setor aparece no momento em que se entra nele. As
 * FERRAMENTAS dentro do setor seguem tingidas, e essa diferenca e o que
 * distingue "onde estou" de "o que ha aqui dentro".
 *
 * `bg-foreground/10` e nao `bg-secondary`: o cinza do tema escuro ficava a 13
 * pontos de RGB do card e sumia no olho. Derivado do foreground, o contorno
 * aparece nos dois temas sem carregar cor de setor.
 */
const CHIP_NEUTRO = "bg-foreground/10 text-muted-foreground";

const SEM_COR = {
  faixa: "bg-transparent",
  chip: "bg-primary text-primary-foreground",
  chipSuave: "bg-primary/15 text-primary",
  texto: "text-primary",
};
const cor = (href: string | null) => (href && ACCENT[href]) || SEM_COR;

/** Ferramenta acesa: o prefixo mais longo, como no modulo. */

export interface SidebarUser {
  nome: string;
  papel: string;
  iniciais: string;
}

const CHAVE_COLAPSO = "buildflow:sidebar-colapsada";
const CHAVE_USOS = "buildflow:sidebar-usos";

/**
 * A contagem de aberturas guardada neste navegador.
 *
 * O `try` existe porque o conteudo vem do localStorage da pessoa: um
 * `JSON.parse` cru derrubaria a barra inteira — que e a unica forma de navegar
 * — por causa de uma preferencia de conveniencia. A higiene do VALOR mora em
 * `sanitizarUsos`, em nav.ts, para ser conferida por script.
 */
function lerUsos(): Record<string, number> {
  try {
    return sanitizarUsos(JSON.parse(localStorage.getItem(CHAVE_USOS) ?? "{}"));
  } catch {
    return {};
  }
}

export function Sidebar({
  modulos,
  user,
  podeConfigurar,
  logoutAction,
}: {
  modulos: NavModule[];
  user: SidebarUser;
  /** A pessoa ve o botao de Configuracoes (papel de Gestao). */
  podeConfigurar: boolean;
  /** Server action; o form abaixo a executa no servidor. */
  logoutAction: () => void;
}) {
  const pathname = usePathname();
  const ativo = moduloAtivo(pathname, modulos);

  const [aberta, setAberta] = useState(false);      // gaveta do mobile
  const [colapsada, setColapsada] = useState(false); // coluna estreita do desktop
  // O flyout guarda o topo do botao porque e `fixed`: o <nav> rola, e um
  // filho `absolute` dentro dele seria cortado (overflow-y auto tambem
  // corta o eixo X — nao existe `overflow-x: visible` ao lado de `auto`).
  const [flyout, setFlyout] = useState<{ href: string; top: number } | null>(null);
  // Accordion de um: so um setor aberto por vez, como na referencia.
  //
  // COMECA FECHADO, e a gaveta so abre por CLIQUE (pedido do dono, 06/11/2026).
  // Antes ela comecava no setor ativo e um efeito a reabria a cada navegacao:
  // clicar numa ferramenta dos Favoritos escancarava o setor inteiro embaixo,
  // que e o oposto do que o atalho serve para fazer. Quem diz onde a pessoa
  // esta e o QUADRADO DO ICONE do modulo (`eAtivo`), que nao depende deste
  // estado — a gaveta e navegacao, nao sinalizacao.
  const [expandido, setExpandido] = useState<string | null>(null);

  // Preferencia de colapso: lida DEPOIS de montar, nunca no estado inicial.
  // localStorage nao existe no servidor, e o valor divergente quebraria a
  // hidratacao da tela toda (foi o que aconteceu com o relogio do Rank).
  useEffect(() => {
    setColapsada(localStorage.getItem(CHAVE_COLAPSO) === "1");
  }, []);

  // FAVORITOS: as ferramentas que esta pessoa mais abre sobem para o topo.
  // Lido depois de montar, pelo mesmo motivo do colapso acima.
  const [usos, setUsos] = useState<Record<string, number>>({});
  const ultimaContada = useRef<string | null>(null);
  useEffect(() => { setUsos(lerUsos()); }, []);

  /**
   * Qual ferramenta esta aberta agora, decidida UMA vez entre TODAS.
   *
   * Nunca `ferramentaAtiva(pathname, [t])` por item: este helper existe para
   * arbitrar o prefixo MAIS LONGO, e com uma ferramenta so na lista nao ha o
   * que arbitrar. Em /vendas/clientes, "Lancar Pedidos" (/vendas) tambem casa
   * pelo prefixo — as duas acendiam ao mesmo tempo.
   */
  const ferramentaAberta = useMemo(
    () => ferramentaAtiva(pathname, modulos.flatMap((m) => m.tools)),
    [pathname, modulos],
  );

  // Conta a ABERTURA, e nao o clique no menu: chegar por um atalho da tela
  // inicial, por um link de outra tela ou pelo botao voltar tambem e uso, e
  // contar so o clique daqui nunca promoveria a ferramenta de quem chega por
  // outro caminho.
  //
  // O ref evita contar a mesma visita duas vezes: em StrictMode o efeito roda,
  // limpa e roda de novo no mesmo pathname, e sem a trava toda visita valeria 2.
  useEffect(() => {
    if (!ferramentaAberta || ultimaContada.current === ferramentaAberta) return;
    ultimaContada.current = ferramentaAberta;
    const proximo = { ...lerUsos(), [ferramentaAberta]: (lerUsos()[ferramentaAberta] ?? 0) + 1 };
    // Gravar FORA do updater: ver a nota em `alternarColapso`.
    localStorage.setItem(CHAVE_USOS, JSON.stringify(proximo));
    setUsos(proximo);
  }, [ferramentaAberta]);

  // So entram ferramentas que AINDA existem no menu desta pessoa: um papel
  // que perdeu acesso nao pode continuar com o atalho no topo, e ferramenta
  // renomeada/removida sairia como link quebrado.
  const favoritos = useMemo(() => escolherFavoritos(usos, modulos), [usos, modulos]);


  function alternarColapso() {
    // Gravar FORA do updater: em StrictMode o React o chama duas vezes, e o
    // segundo passe desfazia o que o primeiro gravou.
    const proximo = !colapsada;
    setColapsada(proximo);
    localStorage.setItem(CHAVE_COLAPSO, proximo ? "1" : "0");
    setFlyout(null);
  }

  const fechar = () => { setAberta(false); setFlyout(null); };

  // Configuracoes aparece pelo papel; `modulos` ja vem filtrado, mas Gestao
  // saiu do NAV, entao o layout informa isso a parte.
  const configAtiva = pathname === CONFIG.href || pathname.startsWith(CONFIG.href + "/");

  // "Geral" = modulo de tela unica; "Setores" = os que tem ferramentas.
  const geral = modulos.filter((m) => m.tools.length === 0);
  const setores = modulos.filter((m) => m.tools.length > 0);

  /** Item de modulo: chip do icone + rotulo (o rotulo some quando colapsada). */
  function LinkModulo({ m, eAtivo }: { m: NavModule; eAtivo: boolean }) {
    const c = cor(m.base);
    return (
      <Link
        href={m.href ?? m.base}
        onClick={fechar}
        aria-current={eAtivo ? "page" : undefined}
        title={colapsada ? m.label : undefined}
        className={cn(
          "flex items-center gap-2.5 rounded-lg py-1.5 text-sm transition-colors",
          colapsada ? "justify-center px-1.5" : "px-2",
          // QUEM MOSTRA O ESTADO E O QUADRADO DO ICONE, nunca uma faixa na
          // linha inteira: a faixa lia como "retangulo" ao lado de icones
          // quadrados, e some atras do rotulo em vez de marcar o item.
          //
          // O ROTULO VAI EM ALTO CONTRASTE, nao na cor do setor: a cor ja esta
          // no icone ao lado, e repeti-la no texto custa legibilidade sem
          // acrescentar informacao (pedido do dono, 05/11/2026).
          eAtivo ? "font-semibold text-foreground" : "font-medium text-muted-foreground hover:text-foreground",
        )}
      >
        <span className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors",
          // Aberto: fundo SUAVE com o glifo na cor, como na referencia do dono
          // — nao um bloco solido com icone branco.
          eAtivo ? c.chipSuave : CHIP_NEUTRO,
        )}>
          {ICON[m.base]}
        </span>
        {!colapsada && <span className="truncate">{m.label}</span>}
      </Link>
    );
  }

  /** Lista de ferramentas de um setor (usada expandida e no flyout). */
  function Ferramentas({ m, dentroDoFlyout = false }: { m: NavModule; dentroDoFlyout?: boolean }) {
    const c = cor(m.base);
    const tAtiva = m.base === ativo ? ferramentaAtiva(pathname, m.tools) : null;
    return (
      <ul className={cn("space-y-0.5", dentroDoFlyout ? "" : "ml-5 border-l border-border pl-3")}>
        {m.tools.map((t) => {
          const acesa = t.href === tAtiva;
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                onClick={fechar}
                aria-current={acesa ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[0.8125rem] transition-colors",
                  // Rotulo em alto contraste e estado no quadrado do icone,
                  // como nos modulos acima.
                  acesa
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-colors",
                  acesa ? c.chip : c.chipSuave,
                )}>
                  {ICON[t.href]}
                </span>
                {/* `title`: rotulo longo trunca na coluna de 16rem. */}
                <span className="truncate" title={t.label}>{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <>
      {/* Barra do MOBILE: so o botao da gaveta e a marca. Notificacoes e tema
          ficam no cabecalho da pagina, como no desktop. */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-card/80 px-3 backdrop-blur-xl lg:hidden">
        <button
          onClick={() => setAberta(true)}
          className="rounded-md p-2 text-muted-foreground hover:text-foreground"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-base font-bold tracking-tight">
          Build.<span className="text-primary">Flow</span>
        </span>
      </header>

      {aberta && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={fechar} aria-hidden />}

      {/* Clique fora fecha o flyout. Invisivel: so captura o clique. */}
      {flyout && <div className="fixed inset-0 z-40 hidden lg:block" onClick={() => setFlyout(null)} aria-hidden />}

      <aside
        className={cn(
          "z-50 flex shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200",
          colapsada ? "lg:w-[4.5rem]" : "lg:w-64",
          "w-64 lg:sticky lg:top-0 lg:h-screen",
          // `lg:bottom-auto` NAO e enfeite. `inset-y-0` existe para a gaveta
          // `fixed` do celular, mas no `lg` a barra vira `sticky` — e um sticky
          // com `top` E `bottom` ao mesmo tempo e resolvido pela ancora de
          // BAIXO: ao rolar, a barra descolava e escorregava por cima do
          // conteudo em vez de ficar presa no topo (06/11/2026).
          "fixed inset-y-0 left-0 transition-transform duration-200 lg:bottom-auto lg:translate-x-0",
          aberta ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Faixa da cor do setor ativo: a sinalizacao de onde a pessoa esta. */}
        <div className={cn("h-1 shrink-0 transition-colors", cor(ativo).faixa)} />

        <div className={cn("flex shrink-0 items-center gap-2 px-3 py-3", colapsada && "lg:justify-center lg:px-2")}>
          <Link href="/" onClick={fechar} className="flex min-w-0 items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" width={36} height={36} className="h-9 w-9 shrink-0 object-contain" />
            {!colapsada && (
              <span className="min-w-0 leading-tight">
                <span className="block text-base font-bold tracking-tight">
                  Build.<span className="text-primary">Flow</span>
                </span>
                <span className="block truncate text-[0.6875rem] text-muted-foreground">
                  Logística e controle de vendas
                </span>
              </span>
            )}
          </Link>
          <button onClick={fechar} className="ml-auto rounded-md p-1 text-muted-foreground hover:text-foreground lg:hidden" aria-label="Fechar menu">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Cartao do usuario, no topo como na referencia. */}
        <div className={cn("shrink-0 px-3 pb-3", colapsada && "lg:px-2")}>
          <div className={cn(
            "flex items-center gap-2.5 rounded-xl bg-secondary p-2",
            colapsada && "lg:justify-center lg:p-1.5",
          )}>
            <span
              // Quadrado de cantos arredondados, nao circulo: a referencia do dono
              // (05/11/2026) usa a MESMA forma do contorno dos icones, e duas
              // geometrias no mesmo menu leem como dois sistemas.
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-sm font-semibold text-primary"
              title={colapsada ? `${user.nome} · ${user.papel}` : undefined}
            >
              {user.iniciais}
            </span>
            {!colapsada && (
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-sm font-semibold" title={user.nome}>{user.nome}</span>
                <span className="block truncate text-xs text-muted-foreground">{user.papel}</span>
              </span>
            )}
          </div>
        </div>

        <nav aria-label="Navegação" className="kanban-scroll flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-3 lg:px-2">
          {/* FAVORITOS acima de tudo: e atalho, e atalho que exige rolar ate o
              meio do menu nao economiza nada. Some sozinha quando ninguem
              abriu nada MIN_USOS vezes — menu novo nao nasce com uma secao
              vazia pedindo explicacao. */}
          {favoritos.length > 0 && (
            <>
              {!colapsada && <p className="px-2 pb-1 pt-2 text-[0.6875rem] font-semibold uppercase tracking-widest text-muted-foreground">Favoritos</p>}
              {colapsada && <div className="mb-2 mt-1 border-t border-border" />}
              {favoritos.map(({ tool: t, modulo: m }) => {
                const c = cor(m.base);
                const acesa = t.href === ferramentaAberta;
                return (
                  <Link
                    key={t.href}
                    href={t.href}
                    onClick={fechar}
                    // `title`: no modo estreito o rotulo some, e o icone
                    // sozinho nao diz qual ferramenta e.
                    title={t.label}
                    aria-current={acesa ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg py-1.5 text-sm transition-colors",
                      colapsada ? "justify-center px-1.5" : "px-2",
                      // Mesma regra do modulo: estado no quadrado, rotulo em
                      // alto contraste, sem faixa na linha.
                      acesa ? "font-semibold text-foreground" : "font-medium text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors",
                      acesa ? c.chip : c.chipSuave,
                    )}>
                      {ICON[t.href]}
                    </span>
                    {/* A ferramenta CONTINUA no setor dela. O atalho duplica,
                        nao muda de lugar: tirar do setor abriria um buraco na
                        lista e faria procurar onde sempre esteve. */}
                    <span className={cn("truncate", colapsada && "lg:hidden")}>{t.label}</span>
                  </Link>
                );
              })}
            </>
          )}

          {geral.length > 0 && (
            <>
              {!colapsada && <p className="px-2 pb-1 pt-2 text-[0.6875rem] font-semibold uppercase tracking-widest text-muted-foreground">Geral</p>}
              {colapsada && <div className="my-2 border-t border-border" />}
              {geral.map((m) => <LinkModulo key={m.base} m={m} eAtivo={m.base === ativo} />)}
            </>
          )}

          {setores.length > 0 && (
            <>
              {!colapsada && <p className="px-2 pb-1 pt-3 text-[0.6875rem] font-semibold uppercase tracking-widest text-muted-foreground">Setores</p>}
              {colapsada && <div className="my-2 border-t border-border" />}
              {setores.map((m) => {
                const eAtivo = m.base === ativo;
                const c = cor(m.base);
                const aberto = expandido === m.base;

                // Colapsada: o icone abre um flyout com as ferramentas, porque
                // a lista indentada nao cabe em 4.5rem de largura.
                if (colapsada) {
                  return (
                    <div key={m.base} className="relative">
                      <button
                        onClick={(e) => {
                          const r = e.currentTarget.getBoundingClientRect();
                          setFlyout((f) => (f?.href === m.base ? null : { href: m.base, top: r.top }));
                        }}
                        title={m.label}
                        aria-expanded={flyout?.href === m.base}
                        // Sem faixa: retraida, o botao ocupa a largura da
                        // coluna e pintar o fundo dele dava um retangulo em
                        // volta do quadrado do icone.
                        className="flex w-full items-center justify-center rounded-lg px-1.5 py-1.5 transition-colors"
                      >
                        <span className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-xl transition-colors",
                          eAtivo ? c.chipSuave : CHIP_NEUTRO,
                        )}>
                          {ICON[m.base]}
                        </span>
                      </button>
                      {flyout?.href === m.base && (
                        <div
                          className="fixed left-[4.75rem] z-50 w-56 rounded-xl border border-border bg-card p-2 shadow-xl"
                          style={{ top: flyout.top }}
                        >
                          <p className={cn("px-2 pb-1.5 text-[0.6875rem] font-semibold uppercase tracking-widest", c.texto)}>
                            {m.label}
                          </p>
                          <Ferramentas m={m} dentroDoFlyout />
                        </div>
                      )}
                    </div>
                  );
                }

                // Miolo do item: identico com ou sem destino.
                const miolo = (
                  <>
                    <span className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors",
                      eAtivo ? c.chipSuave : CHIP_NEUTRO,
                    )}>
                      {ICON[m.base]}
                    </span>
                    <span className="truncate">{m.label}</span>
                  </>
                );
                const classeMiolo = cn(
                  "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm",
                  // Alto contraste, como nos demais itens: a cor do setor vive
                  // no quadrado do icone ao lado.
                  eAtivo ? "font-semibold text-foreground" : "font-medium text-muted-foreground hover:text-foreground",
                );
                const alternar = () => setExpandido((e) => (e === m.base ? null : m.base));

                return (
                  <div key={m.base}>
                    <div className={cn(
                      // Sem faixa no item aberto: o estado e o quadrado do
                      // icone. A faixa lia como retangulo ao lado dos icones
                      // quadrados (pedido do dono, 05/11/2026).
                      "flex items-center rounded-lg transition-colors",
                    )}>
                      {m.href === null ? (
                        // Sem destino (Comercial): o setor so abre a lista.
                        <button onClick={alternar} aria-expanded={aberto} className={classeMiolo}>
                          {miolo}
                        </button>
                      ) : (
                        <Link
                          href={m.href}
                          onClick={fechar}
                          aria-current={eAtivo ? "page" : undefined}
                          className={classeMiolo}
                        >
                          {miolo}
                        </Link>
                      )}
                      <button
                        onClick={alternar}
                        aria-expanded={aberto}
                        aria-label={`${aberto ? "Recolher" : "Expandir"} ferramentas de ${m.label}`}
                        className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                      >
                        <ChevronDown className={cn("h-4 w-4 transition-transform", aberto && "rotate-180")} />
                      </button>
                    </div>
                    {aberto && (
                      <div className="mt-0.5 pb-1">
                        <Ferramentas m={m} />
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </nav>

        <div className={cn("shrink-0 space-y-1 border-t border-border p-3 lg:p-2")}>
          {/* Configuracoes (Gestao): nao e um setor, e a engrenagem do sistema —
              por isso vive aqui embaixo com as outras acoes, e nao na lista. */}
          {podeConfigurar && (
            <Link
              href={CONFIG.href}
              onClick={fechar}
              aria-current={configAtiva ? "page" : undefined}
              title={colapsada ? CONFIG.label : undefined}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors",
                configAtiva ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
                colapsada && "lg:justify-center lg:px-1.5",
              )}
            >
              <span className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
                configAtiva ? "bg-brand/15 text-brand-text" : CHIP_NEUTRO,
              )}>
                <Settings className="h-4 w-4" />
              </span>
              {!colapsada && <span>{CONFIG.label}</span>}
            </Link>
          )}

          {/* Colapsar: so faz sentido no desktop; no mobile a gaveta fecha. */}
          <button
            onClick={alternarColapso}
            className={cn(
              "hidden w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:flex",
              colapsada && "lg:justify-center lg:px-1.5",
            )}
            aria-label={colapsada ? "Expandir menu" : "Recolher menu"}
            title={colapsada ? "Expandir menu" : "Recolher menu"}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
              {colapsada ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </span>
            {!colapsada && <span>Recolher menu</span>}
          </button>

          <form action={logoutAction}>
            <button
              type="submit"
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive",
                colapsada && "lg:justify-center lg:px-1.5",
              )}
              aria-label="Sair"
              title={colapsada ? "Sair" : undefined}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
                <LogOut className="h-4 w-4" />
              </span>
              {!colapsada && <span>Sair</span>}
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
