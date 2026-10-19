import type { WholesaleLeadStatus } from "@prisma/client";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock,
  Inbox,
  LayoutGrid,
  Percent,
  TrendingUp,
  User,
  Users,
  XCircle,
} from "lucide-react";
import { BackButton } from "@/components/shared/back-button";
import { prisma } from "@/lib/prisma";
// `pct` vem do dashboard de chamados: é a mesma conta (contagem sobre total,
// zero quando a base é zero) e o mesmo idioma visual. Reescrevê-la aqui criaria
// duas versões da mesma linha para divergirem no arredondamento.
import { pct } from "@/lib/transport/dashboard-math";
import { cn } from "@/lib/utils";
import { atorDaFerramenta } from "@/lib/wholesale-actor";
import { MAX_MESES_NO_GRAFICO, resumoDoAtacado } from "@/lib/wholesale-dashboard";
import { LEAD_STATUS_META, LEAD_STATUS_ORDER } from "../lead-status-chip";
import { AcessoNegadoAtacado, AnaliseClientesTabs } from "../tabs";
import { DashboardFiltros } from "./filtros-client";

/**
 * DASHBOARD DA ANÁLISE DE CLIENTES.
 *
 * MESMO DESENHO DO DASHBOARD DE CHAMADOS (`motorista/dashboard`): faixa de KPIs
 * com ícone, número grande e dica; depois painéis de contorno fino com listas
 * "ponto · rótulo · contagem (percentual)". Duas telas de métrica no mesmo
 * sistema que se parecem são duas telas que se aprendem uma vez.
 *
 * SEM BIBLIOTECA DE GRÁFICO. O projeto não tem nenhuma, e as formas aqui são a
 * barra empilhada e as listas que aquele painel já usa. Uma dependência de
 * charts entraria no bundle de todo mundo para substituir divs com `width: %`.
 *
 * O ESCOPO é o mesmo da fila (`resumoDoAtacado` o monta a partir do ator): a
 * vendedora vê o painel das candidaturas dela. "28 recebidas, 19 aprovadas"
 * somado sobre a equipe é informação da equipe, não dela.
 */

/** "2026-10-19" -> "19/10/2026", sem passar por `Date`. */
function dataBR(iso: string): string {
  const [a, m, d] = iso.split("-");
  return d && m && a ? `${d}/${m}/${a}` : iso;
}

/** Cor do número grande por status. Os fundos vêm do `LEAD_STATUS_META`. */
const NUMERO: Record<WholesaleLeadStatus, string> = {
  EM_ANALISE: "text-foreground",
  APROVADO: "text-emerald-700 dark:text-emerald-300",
  REPROVADO: "text-destructive",
  CUIDADO: "text-amber-600 dark:text-amber-400",
};

const ICONE: Record<WholesaleLeadStatus, React.ReactNode> = {
  EM_ANALISE: <Clock className="h-5 w-5" />,
  APROVADO: <CheckCircle2 className="h-5 w-5" />,
  REPROVADO: <XCircle className="h-5 w-5" />,
  CUIDADO: <AlertTriangle className="h-5 w-5" />,
};

/** Cores dos pontos das listas, cicladas por posição. */
const PALETA = ["bg-sky-500", "bg-emerald-500", "bg-violet-500", "bg-amber-500", "bg-rose-500"];

/* --------------------------------------------------------------- cartões */

function Kpi({
  icon,
  chip,
  valor,
  corValor,
  label,
  hint,
}: {
  icon: React.ReactNode;
  chip: string;
  valor: string | number;
  corValor?: string;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", chip)}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className={cn("text-2xl font-bold leading-tight", corValor)}>{valor}</p>
        <p className="truncate text-sm font-medium">{label}</p>
        {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

function Painel({
  titulo,
  icon,
  children,
}: {
  titulo: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {titulo}
      </p>
      {children}
    </div>
  );
}

/** Lista "ponto · rótulo · contagem (percentual)" — o corpo dos painéis. */
function Lista({
  fatias,
  total,
}: {
  fatias: { label: string; count: number; cor?: string }[];
  total: number;
}) {
  if (fatias.length === 0) {
    return <p className="text-xs text-muted-foreground">Sem dados.</p>;
  }
  return (
    <ul className="space-y-2">
      {fatias.map((f, i) => (
        <li key={f.label} className="flex items-center gap-2 text-sm">
          <span
            className={cn("h-2 w-2 shrink-0 rounded-full", f.cor ?? PALETA[i % PALETA.length])}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate" title={f.label}>
            {f.label}
          </span>
          <span className="shrink-0 font-semibold">{f.count}</span>
          <span className="w-12 shrink-0 text-right text-xs text-muted-foreground">
            ({pct(f.count, total)}%)
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ página */

export default async function AnaliseClientesDashboardPage(props: {
  searchParams?: Promise<{ de?: string; ate?: string; vendedora?: string }>;
}) {
  const searchParams = await props.searchParams;
  const actor = await atorDaFerramenta();
  if (!actor) return <AcessoNegadoAtacado />;

  const ehGestao = actor.role === "GESTAO";
  const de = searchParams?.de?.trim() || "";
  const ate = searchParams?.ate?.trim() || "";
  // Lido por qualquer papel, mas `resumoDoAtacado` só o aplica para a GESTAO.
  const vendedora = searchParams?.vendedora?.trim() || "";

  const [r, vendedoras] = await Promise.all([
    resumoDoAtacado(actor, { de, ate, vendedora }),
    // Inclui as INATIVAS de propósito: candidatura antiga continua apontando
    // para quem saiu da equipe, e sem o nome na lista ela ficaria inalcançável.
    ehGestao
      ? prisma.user.findMany({
          where: { role: "VENDAS", salesModel: "ATACADO" },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const selecionada = vendedoras.find((v) => v.id === vendedora) ?? null;
  const temFiltro = Boolean(de || ate || vendedora);
  const rotuloPeriodo =
    de && ate
      ? `de ${dataBR(de)} a ${dataBR(ate)}`
      : de
        ? `desde ${dataBR(de)}`
        : ate
          ? `até ${dataBR(ate)}`
          : "todo o histórico";

  const porStatus = new Map(r.porStatus.map((s) => [s.status, s.total]));
  const mesAtual = r.entradasPorMes[r.entradasPorMes.length - 1];
  const somaJanela = r.entradasPorMes.reduce((s, m) => s + m.total, 0);
  // A janela do gráfico varia com o período, então a média divide pelos meses
  // MOSTRADOS, não por uma constante — dividir por 6 um recorte de 2 meses
  // daria um terço do valor certo.
  const mesesNaJanela = Math.max(1, r.entradasPorMes.length);
  const mediaMensal = Math.round((somaJanela / mesesNaJanela) * 10) / 10;
  // O gráfico foi cortado no teto, mas os KPIs somam o período inteiro.
  const graficoRecortado = somaJanela < r.total;
  const maiorMes = Math.max(1, ...r.entradasPorMes.map((m) => m.total));
  const lider = r.porVendedora[0];

  return (
    <div className="space-y-4">
      <BackButton />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-vendas-text">Análise de Clientes</h1>
          {/* O recorte vale para TODOS os números abaixo, então ele é dito em
              palavras aqui: ler "42 recebidas" sem saber de que período é a
              forma mais fácil de levar um número errado para uma reunião. */}
          <p className="text-sm text-muted-foreground">
            {selecionada
              ? `Candidaturas de ${selecionada.name}`
              : ehGestao
                ? "Todas as vendedoras"
                : "A sua fila"}{" "}
            · {rotuloPeriodo}
          </p>
        </div>
        <DashboardFiltros
          defaults={{ de, ate, vendedora }}
          vendedoras={vendedoras}
          ehGestao={ehGestao}
        />
      </div>

      <AnaliseClientesTabs ativa="dashboard" />

      {r.total === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground shadow-sm">
          <Inbox className="h-6 w-6" aria-hidden />
          {/* "Nada ainda" e "nada NESTE recorte" são estados diferentes: sem a
              distinção, um período mal escolhido parece base vazia. */}
          <span className="text-sm">
            {temFiltro
              ? "Nenhuma candidatura neste recorte. Troque o período ou a vendedora."
              : ehGestao
                ? "Nenhuma candidatura recebida ainda. O painel se preenche assim que a primeira lojista enviar o formulário."
                : "Nenhuma candidatura na sua fila ainda. O painel se preenche quando uma lojista enviar o formulário pelo seu link."}
          </span>
        </div>
      ) : (
        <>
          {/* Linha 1 — volume e status. */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi
              icon={<Inbox className="h-5 w-5" />}
              chip="bg-secondary text-foreground"
              valor={r.total}
              label="Candidaturas recebidas"
              hint="todo o histórico"
            />
            {LEAD_STATUS_ORDER.map((s) => (
              <Kpi
                key={s}
                icon={ICONE[s]}
                chip={LEAD_STATUS_META[s].chip}
                valor={porStatus.get(s) ?? 0}
                corValor={NUMERO[s]}
                label={LEAD_STATUS_META[s].label}
                hint={`${pct(porStatus.get(s) ?? 0, r.total)}% do total`}
              />
            ))}
          </div>

          {/* Linha 2 — destaques. */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              icon={<Percent className="h-5 w-5" />}
              chip="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              valor={`${r.conversao.toLocaleString("pt-BR")}%`}
              corValor="text-emerald-700 dark:text-emerald-300"
              label="Taxa de conversão"
              // O denominador vai na dica: a outra leitura (aprovadas ÷
              // decididas) dá um número maior e igualmente plausível na tela.
              hint={`${r.aprovadas} aprovadas ÷ ${r.total} recebidas`}
            />
            <Kpi
              icon={<CalendarDays className="h-5 w-5" />}
              chip="bg-vendas/15 text-vendas-text"
              valor={mesAtual?.total ?? 0}
              corValor="text-vendas-text"
              label="Entradas no mês"
              hint={mesAtual?.rotulo ?? "—"}
            />
            <Kpi
              icon={<TrendingUp className="h-5 w-5" />}
              chip="bg-secondary text-foreground"
              valor={mediaMensal.toLocaleString("pt-BR")}
              label="Média mensal"
              hint={`${somaJanela} em ${mesesNaJanela} ${mesesNaJanela === 1 ? "mês" : "meses"}`}
            />
            {ehGestao ? (
              <Kpi
                icon={<User className="h-5 w-5" />}
                chip="bg-secondary text-foreground"
                valor={lider ? lider.nome : "—"}
                label="Quem mais recebeu"
                hint={lider ? `${lider.total} candidatura(s)` : "sem distribuição"}
              />
            ) : (
              <Kpi
                icon={<Clock className="h-5 w-5" />}
                chip="bg-secondary text-foreground"
                valor={r.recentes[0]?.createdAtLabel ?? "—"}
                label="Última candidatura"
                hint={r.recentes[0]?.contactName ?? "—"}
              />
            )}
          </div>

          {/* Linha 3 — distribuições. */}
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
            <Painel titulo="Status das análises" icon={<LayoutGrid className="h-3.5 w-3.5" />}>
              {/* Barra empilhada: a proporção entre os quatro estados de uma
                  olhada, antes de ler qualquer número. */}
              <div className="mb-3 flex h-2 w-full overflow-hidden rounded-full bg-secondary">
                {LEAD_STATUS_ORDER.map((s) => (
                  <span
                    key={s}
                    className={LEAD_STATUS_META[s].dot}
                    style={{ width: `${pct(porStatus.get(s) ?? 0, r.total)}%` }}
                    aria-hidden
                  />
                ))}
              </div>
              <Lista
                fatias={LEAD_STATUS_ORDER.map((s) => ({
                  label: LEAD_STATUS_META[s].label,
                  count: porStatus.get(s) ?? 0,
                  // `dot`, não `chip`: o ponto se separa do FUNDO, o chip
                  // carrega texto. Ver a nota em `lead-status-chip.tsx`.
                  cor: LEAD_STATUS_META[s].dot,
                }))}
                total={r.total}
              />
            </Painel>

            <Painel
              titulo={`Entrada · ${mesesNaJanela} ${mesesNaJanela === 1 ? "mês" : "meses"}`}
              icon={<CalendarDays className="h-3.5 w-3.5" />}
            >
              <div
                className="flex h-20 items-end gap-1.5"
                role="img"
                aria-label={`Entrada por mês: ${r.entradasPorMes
                  .map((m) => `${m.rotulo}, ${m.total}`)
                  .join("; ")}`}
              >
                {r.entradasPorMes.map((m) => (
                  <div key={m.chave} className="flex flex-1 flex-col items-center gap-1">
                    <span className="font-data text-[10px] text-muted-foreground">{m.total}</span>
                    <div
                      className="w-full rounded-t bg-vendas"
                      // Mínimo de 2px: mês zerado precisa deixar um traço, senão
                      // vira um buraco sem explicação no eixo.
                      style={{ height: `${Math.max(2, (m.total / maiorMes) * 100)}%` }}
                    />
                    <span className="text-[10px] text-muted-foreground">{m.rotulo}</span>
                  </div>
                ))}
              </div>
              {/* Um gráfico que mostra menos que os cartões ao lado precisa
                  dizer isso, senão a soma das colunas "não bate" com o total. */}
              {graficoRecortado && (
                <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
                  O período escolhido passa de {MAX_MESES_NO_GRAFICO} meses: o gráfico mostra os
                  mais recentes, os cartões somam o período inteiro.
                </p>
              )}
            </Painel>

            {/* Distribuição por vendedora só existe para a Gestão: para a
                vendedora, o escopo já reduz o painel a uma barra dela. */}
            {ehGestao && (
              <Painel titulo="Por vendedora" icon={<Users className="h-3.5 w-3.5" />}>
                <Lista
                  fatias={r.porVendedora.map((v) => ({
                    label: v.nome,
                    count: v.total,
                    // Sem dona = chegou pelo link geral sem vendedora ativa.
                    // Âmbar porque é aviso de operação, não mais uma fatia.
                    cor: v.sellerId ? undefined : "bg-amber-400",
                  }))}
                  total={r.total}
                />
              </Painel>
            )}

            <Painel titulo="Últimas candidaturas" icon={<Inbox className="h-3.5 w-3.5" />}>
              <ul className="space-y-2">
                {r.recentes.slice(0, 6).map((c) => (
                  <li key={c.id} className="flex items-center gap-2 text-sm">
                    <span
                      className={cn("h-2 w-2 shrink-0 rounded-full", LEAD_STATUS_META[c.status].dot)}
                      aria-hidden
                    />
                    <span
                      className="min-w-0 flex-1 truncate"
                      title={`${c.contactName} · ${c.city}/${c.state}${
                        c.sellerName ? ` · ${c.sellerName}` : ""
                      }`}
                    >
                      {c.contactName}
                    </span>
                    <span className="shrink-0 font-data text-xs text-muted-foreground">
                      {c.createdAtLabel}
                    </span>
                  </li>
                ))}
              </ul>
            </Painel>
          </div>
        </>
      )}
    </div>
  );
}
