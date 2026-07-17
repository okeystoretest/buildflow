"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { RefreshCw, Target, TrendingUp, BarChart3, Flame, Trophy, Maximize2, Minimize2, CalendarClock } from "lucide-react";
import { formatBRL, tierColor, tierText } from "@/lib/utils";
import type { RankData, RankRow, CampaignPerf } from "@/lib/rank-data";

const REFRESH_MS = 30 * 60 * 1000; // 30 minutos

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function RankBoard({ initial }: { initial: RankData }) {
  const [data, setData] = useState<RankData>(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState<Date>(new Date());
  const [campSel, setCampSel] = useState<string>(initial.campaignPerf[0]?.id ?? "");
  const [isFull, setIsFull] = useState(false);
  // Periodo selecionado. Comeca no periodo que veio do servidor (corrente).
  const [selMonth, setSelMonth] = useState<number>(initial.month);
  const [selYear, setSelYear] = useState<number>(initial.year);
  const rootRef = useRef<HTMLDivElement>(null);

  // Busca os dados de um periodo especifico (ou o corrente).
  const fetchPeriod = useCallback(async (month: number, year: number) => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/rank?month=${month}&year=${year}`, { cache: "no-store" });
      if (res.ok) { setData(await res.json()); setLastSync(new Date()); }
    } finally { setRefreshing(false); }
  }, []);

  const refresh = useCallback(() => fetchPeriod(selMonth, selYear), [fetchPeriod, selMonth, selYear]);

  // Ao trocar mes/ano nos seletores, recarrega o periodo.
  function changePeriod(month: number, year: number) {
    setSelMonth(month);
    setSelYear(year);
    fetchPeriod(month, year);
  }

  // Volta para o mes corrente.
  function goCurrent() {
    const now = new Date();
    changePeriod(now.getMonth() + 1, now.getFullYear());
  }

  // Auto-refresh SOMENTE no periodo corrente (telao ao vivo). Em periodos
  // passados os dados sao fechados, nao precisa ficar recarregando.
  useEffect(() => {
    if (!data.isCurrent) return;
    const id = setInterval(() => fetchPeriod(selMonth, selYear), REFRESH_MS);
    return () => clearInterval(id);
  }, [data.isCurrent, fetchPeriod, selMonth, selYear]);

  // Tela cheia nativa do navegador (oculta a barra superior do app).
  const toggleFull = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await rootRef.current?.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      setIsFull((v) => !v);
    }
  }, []);

  useEffect(() => {
    const onChange = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const campPerf = data.campaignPerf.find((c) => c.id === campSel) ?? data.campaignPerf[0];
  const campTotalVol = data.campaigns.find((c) => c.id === campSel) ?? data.campaigns[0];

  // Anos disponiveis no seletor: do ano atual voltando 4 anos.
  const nowYear = new Date().getFullYear();
  const anos = Array.from({ length: 5 }, (_, i) => nowYear - i);

  const wrapClass = isFull
    ? "flex h-screen flex-col gap-2.5 overflow-hidden bg-background p-3"
    : "flex h-[calc(100vh-7rem)] flex-col gap-2.5 overflow-hidden";

  return (
    <div ref={rootRef} className={wrapClass}>
      {/* Barra de filtro de periodo */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="mr-1 text-lg font-bold text-vendas sm:text-xl">Ranking de Vendas</h1>
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          <select className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
            value={selMonth} onChange={(e) => changePeriod(Number(e.target.value), selYear)}>
            {MESES.map((nome, i) => <option key={i} value={i + 1}>{nome}</option>)}
          </select>
          <select className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
            value={selYear} onChange={(e) => changePeriod(selMonth, Number(e.target.value))}>
            {anos.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          {!data.isCurrent && (
            <>
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-500">
                Histórico
              </span>
              <button onClick={goCurrent}
                className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
                Voltar ao mês atual
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={refresh}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {lastSync.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </button>
          <button onClick={toggleFull} aria-label="Tela cheia"
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
            {isFull ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{isFull ? "Sair" : "Tela cheia"}</span>
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid shrink-0 grid-cols-2 gap-2.5 lg:grid-cols-4">
        <MetaGeralKpi meta={data.metaGeral} realizado={data.realizadoGeral} pct={data.metaGeralPct} />
        <Kpi icon={<TrendingUp className="h-5 w-5" />} iconClass="text-emerald-500" label={data.isCurrent ? "Maior Venda Semanal" : "Maior Venda no Mês"}
          value={data.maiorSemana ? formatBRL(data.maiorSemana.total) : "—"} sub={data.maiorSemana?.nome ?? `${String(data.month).padStart(2,"0")}/${data.year}`} subClass="text-vendas" />
        <Kpi icon={<BarChart3 className="h-5 w-5" />} iconClass="text-sky-500" label="Maior Venda Mensal"
          value={data.maiorMes ? formatBRL(data.maiorMes.total) : "—"} sub={data.maiorMes?.nome ?? "—"} />
        <Kpi icon={<Flame className="h-5 w-5" />} iconClass="text-orange-500" label={`Total por Campanha${campTotalVol ? " · " + campTotalVol.name : ""}`}
          value={String(campTotalVol?.volume ?? 0)} sub="peças" />
      </div>

      {/* 3 colunas de ranking */}
      <div className="grid min-h-0 grid-cols-1 gap-2.5 lg:grid-cols-3" style={{ flex: "1 1 55%" }}>
        <RankPanel title="Progresso Geral de Vendedoras" rows={data.rankGeral} showTrophy hideValue />
        <RankPanel title="Varejo" rows={data.rankVarejo} showTrophy compact />
        <RankPanel title="Atacado" rows={data.rankAtacado} showTrophy compact />
      </div>

      {/* Tabela de performance por campanha */}
      <div className="flex min-h-0 flex-col rounded-xl border border-border bg-card p-3" style={{ flex: "1 1 45%" }}>
        <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-base font-semibold">Performance na</span>
            {data.campaignPerf.length > 0 && (
              <select className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
                value={campSel} onChange={(e) => setCampSel(e.target.value)}>
                {data.campaignPerf.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>
        </div>
        <PerfTable perf={campPerf} />
      </div>
    </div>
  );
}

// KPI especial da Meta Geral: mostra meta, realizado do mês e barra de progresso.
function MetaGeralKpi({ meta, realizado, pct }: { meta: number; realizado: number; pct: number }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card p-3">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm text-muted-foreground">Meta Geral</p>
          <p className="font-data mt-1 truncate text-2xl font-bold">{formatBRL(meta)}</p>
          <p className="font-data truncate text-sm text-vendas">{formatBRL(realizado)} no mês</p>
        </div>
        <span className="shrink-0 text-primary"><Target className="h-5 w-5" /></span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
          <div className={`h-full rounded-full ${tierColor(pct)}`}
            style={{ width: `${Math.min(pct, 100)}%`, transition: "width .5s ease" }} />
        </div>
        <span className={`font-data shrink-0 text-sm font-bold ${tierText(pct)}`}>{pct}%</span>
      </div>
    </div>
  );
}

function Kpi({ icon, iconClass, label, value, sub, subClass }: {
  icon: React.ReactNode; iconClass?: string; label: string; value: string; sub: string; subClass?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card p-3">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm text-muted-foreground">{label}</p>
          <p className="font-data mt-1 truncate text-2xl font-bold">{value}</p>
          <p className={`font-data truncate text-sm ${subClass ?? "text-muted-foreground"}`}>{sub}</p>
        </div>
        <span className={`shrink-0 ${iconClass ?? "text-muted-foreground/60"}`}>{icon}</span>
      </div>
    </div>
  );
}

function RankPanel({ title, rows, showTrophy, compact, hideValue }: { title: string; rows: RankRow[]; showTrophy?: boolean; compact?: boolean; hideValue?: boolean }) {
  return (
    <div className="flex min-h-0 flex-col rounded-xl border border-border bg-card p-3">
      <p className="mb-1.5 shrink-0 text-base font-semibold">{title}</p>
      <div className={`flex min-h-0 flex-1 flex-col ${compact ? "justify-start gap-2" : "justify-around gap-0.5"}`}>
        {rows.slice(0, 10).map((r, i) => (
          <RankLine key={r.nome} pos={i + 1} row={r} showTrophy={showTrophy} compact={compact} hideValue={hideValue} />
        ))}
        {rows.length === 0 && <p className="m-auto text-sm text-muted-foreground">Sem dados.</p>}
      </div>
    </div>
  );
}

function RankLine({ pos, row, showTrophy, compact, hideValue }: { pos: number; row: RankRow; showTrophy?: boolean; compact?: boolean; hideValue?: boolean }) {
  // Progresso real: vendido / meta. Sem meta cadastrada, mostra 0%.
  const semMeta = !(row.meta > 0);
  const pct = semMeta ? 0 : row.pct;
  return (
    <div className={compact ? "py-1" : ""}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          {showTrophy && pos <= 3 && <RankTrophy pos={pos} />}
          <span className="truncate text-sm font-medium">{row.nome}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {!hideValue && row.vendido > 0 && <span className="font-data text-sm">{formatBRL(row.vendido)}</span>}
          <span className={`font-data text-sm font-bold ${semMeta ? "text-muted-foreground" : tierText(pct)}`}>
            {semMeta ? "s/ meta" : `${pct}%`}
          </span>
        </span>
      </div>
      <div className={`${compact ? "mt-1 h-1.5" : "mt-1 h-1.5"} overflow-hidden rounded-full bg-secondary`}>
        <div className={`h-full rounded-full ${tierColor(pct)}`}
          style={{ width: `${Math.min(pct, 100)}%`, transition: "width .5s ease" }} />
      </div>
    </div>
  );
}

function RankTrophy({ pos }: { pos: number }) {
  const color = pos === 1 ? "text-amber-400" : pos === 2 ? "text-slate-300" : "text-amber-700";
  return <Trophy className={`h-4 w-4 ${color}`} />;
}

function PerfTable({ perf }: { perf: CampaignPerf | undefined }) {
  if (!perf || perf.rows.length === 0) {
    return <p className="m-auto text-sm text-muted-foreground">Nenhuma campanha ativa ou sem metas vinculadas.</p>;
  }
  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="pb-1 pr-2">Vendedores</th>
            <th className="pb-1 pr-2 text-right">Meta</th>
            <th className="pb-1 pr-2 text-center">Qtd Peças</th>
            <th className="pb-1 pr-2 text-right">Valor</th>
            <th className="pb-1 pr-2 text-right">Comissão</th>
            <th className="pb-1 pl-2" style={{ width: "28%" }}>Meta%</th>
          </tr>
        </thead>
        <tbody>
          {perf.rows.slice(0, 10).map((r, i) => (
            <tr key={r.nome} className="border-t border-border/60">
              <td className="py-1 pr-2">
                <span className="flex items-center gap-1.5">
                  {i < 3 && <RankTrophy pos={i + 1} />}
                  <span className="font-medium">{r.nome}</span>
                </span>
              </td>
              <td className="py-1 pr-2 text-right font-data">{r.meta > 0 ? r.meta : "—"}</td>
              <td className="py-1 pr-2 text-center font-data">{r.qtd}</td>
              <td className="py-1 pr-2 text-right font-data">{formatBRL(r.valor)}</td>
              <td className="py-1 pr-2 text-right font-data text-vendas">{formatBRL(r.comissao)}</td>
              <td className="py-1 pl-2">
                <div className="flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div className={`h-full rounded-full ${tierColor(r.pct)}`}
                      style={{ width: `${Math.min(r.pct, 100)}%` }} />
                  </div>
                  <span className={`font-data w-9 shrink-0 text-right text-sm font-bold ${tierText(r.pct)}`}>{r.pct}%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
