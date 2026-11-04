"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, ShoppingCart, Wallet, PackageCheck, Truck, Settings2, KanbanSquare,
  ClipboardCheck, Star, Users, MapPin, ListTodo, BarChart3, History, CreditCard, FilePlus2,
  Landmark, Tag, Building2, AlertTriangle, Clock, Shirt, Timer, ClipboardList,
  Menu, X, LogOut, ChevronDown, ChevronLeft, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { moduloAtivo, CONFIG, type NavModule } from "./nav";

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
  "/gestao": <Settings2 className="h-4 w-4" />,

  "/vendas/novo": <FilePlus2 className="h-3.5 w-3.5" />,
  "/vendas/analise-clientes": <ClipboardCheck className="h-3.5 w-3.5" />,
  "/vendas/select": <Star className="h-3.5 w-3.5" />,
  "/vendas/clientes": <Users className="h-3.5 w-3.5" />,
  "/vendas/excursoes": <MapPin className="h-3.5 w-3.5" />,
  "/vendas/tarefas": <ListTodo className="h-3.5 w-3.5" />,
  "/vendas/relatorio-campanha": <BarChart3 className="h-3.5 w-3.5" />,
  "/vendas/historico": <History className="h-3.5 w-3.5" />,

  "/financeiro/historico": <History className="h-3.5 w-3.5" />,
  "/financeiro/entregas": <Truck className="h-3.5 w-3.5" />,
  "/financeiro/select": <Star className="h-3.5 w-3.5" />,
  "/financeiro/ferramentas/pagamento": <CreditCard className="h-3.5 w-3.5" />,
  "/financeiro/ferramentas/bancos": <Landmark className="h-3.5 w-3.5" />,
  "/financeiro/ferramentas/status": <Tag className="h-3.5 w-3.5" />,
  "/financeiro/ferramentas/cnpj": <Building2 className="h-3.5 w-3.5" />,

  "/logistica/pendencias": <AlertTriangle className="h-3.5 w-3.5" />,
  "/logistica/atrasos": <Clock className="h-3.5 w-3.5" />,
  "/logistica/controle-pecas": <Shirt className="h-3.5 w-3.5" />,
  "/logistica/metricas": <Timer className="h-3.5 w-3.5" />,
  "/logistica/entregas": <PackageCheck className="h-3.5 w-3.5" />,

  "/motorista/chamados": <ClipboardList className="h-3.5 w-3.5" />,
  "/motorista/dashboard": <BarChart3 className="h-3.5 w-3.5" />,
};

/**
 * Cor do modulo: a mesma paleta da barra superior antiga. A sidebar carrega a
 * cor do modulo ATIVO na faixa do topo e no chip do item aceso, para a pessoa
 * saber onde esta sem ler o rotulo.
 */
const ACCENT: Record<string, { faixa: string; chip: string; texto: string }> = {
  "/dashboard":  { faixa: "bg-vendas",       chip: "bg-vendas text-vendas-fg",             texto: "text-vendas-text" },
  "/fluxo":      { faixa: "bg-slate-400",    chip: "bg-slate-200 text-slate-900",          texto: "text-foreground" },
  "/vendas":     { faixa: "bg-vendas",       chip: "bg-vendas text-vendas-fg",             texto: "text-vendas-text" },
  "/financeiro": { faixa: "bg-financeiro",   chip: "bg-financeiro text-financeiro-fg",     texto: "text-financeiro-text" },
  "/logistica":  { faixa: "bg-distribuicao", chip: "bg-distribuicao text-distribuicao-fg", texto: "text-distribuicao-text" },
  "/motorista":  { faixa: "bg-motorista",    chip: "bg-motorista text-motorista-fg",       texto: "text-motorista-text" },
  "/gestao":     { faixa: "bg-brand",        chip: "bg-brand text-brand-fg",               texto: "text-brand-text" },
};

const SEM_COR = { faixa: "bg-transparent", chip: "bg-primary text-primary-foreground", texto: "text-primary" };
const cor = (href: string | null) => (href && ACCENT[href]) || SEM_COR;

/** Ferramenta acesa: o prefixo mais longo, como no modulo. */
function ferramentaAtiva(pathname: string, tools: { href: string }[]): string | null {
  let melhor: string | null = null;
  for (const t of tools) {
    if (pathname === t.href || pathname.startsWith(t.href + "/")) {
      if (!melhor || t.href.length > melhor.length) melhor = t.href;
    }
  }
  return melhor;
}

export interface SidebarUser {
  nome: string;
  papel: string;
  iniciais: string;
}

const CHAVE_COLAPSO = "buildflow:sidebar-colapsada";

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
  const [expandido, setExpandido] = useState<string | null>(ativo);

  // Preferencia de colapso: lida DEPOIS de montar, nunca no estado inicial.
  // localStorage nao existe no servidor, e o valor divergente quebraria a
  // hidratacao da tela toda (foi o que aconteceu com o relogio do Rank).
  useEffect(() => {
    setColapsada(localStorage.getItem(CHAVE_COLAPSO) === "1");
  }, []);

  // Navegou para outro setor: abre o dele. Fechar na mao continua valendo
  // enquanto a pessoa fica no mesmo setor.
  useEffect(() => { setExpandido(ativo); }, [ativo]);

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
          "flex items-center gap-2.5 rounded-lg py-1.5 text-sm font-medium transition-colors",
          colapsada ? "justify-center px-1.5" : "px-2",
          eAtivo ? "bg-secondary " + c.texto : "text-muted-foreground hover:bg-secondary hover:text-foreground",
        )}
      >
        <span className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
          eAtivo ? c.chip : "bg-secondary text-muted-foreground",
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
                  acesa
                    ? cn("bg-secondary font-semibold", c.texto)
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <span className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                  acesa ? c.chip : "bg-secondary/60",
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
          "fixed inset-y-0 left-0 transition-transform duration-200 lg:translate-x-0",
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
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary"
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
                        className={cn(
                          "flex w-full items-center justify-center rounded-lg px-1.5 py-1.5 transition-colors",
                          eAtivo ? "bg-secondary" : "hover:bg-secondary",
                        )}
                      >
                        <span className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                          eAtivo ? c.chip : "bg-secondary text-muted-foreground",
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
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                      eAtivo ? c.chip : "bg-secondary text-muted-foreground",
                    )}>
                      {ICON[m.base]}
                    </span>
                    <span className="truncate">{m.label}</span>
                  </>
                );
                const classeMiolo = cn(
                  "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm font-medium",
                  eAtivo ? c.texto : "text-muted-foreground hover:text-foreground",
                );
                const alternar = () => setExpandido((e) => (e === m.base ? null : m.base));

                return (
                  <div key={m.base}>
                    <div className={cn(
                      "flex items-center rounded-lg transition-colors",
                      eAtivo ? "bg-secondary" : "hover:bg-secondary",
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
                configAtiva ? "bg-secondary text-brand-text" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                colapsada && "lg:justify-center lg:px-1.5",
              )}
            >
              <span className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                configAtiva ? "bg-brand text-brand-fg" : "bg-secondary",
              )}>
                <Settings2 className="h-4 w-4" />
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
