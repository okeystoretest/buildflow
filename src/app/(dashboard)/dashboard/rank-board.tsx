"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { RefreshCw, Target, TrendingUp, BarChart3, Flame, Trophy, Maximize2, Minimize2, CalendarClock, Pencil, Check, RotateCcw, Undo2 } from "lucide-react";
import { formatBRL, tierColor, tierText } from "@/lib/utils";
import { setRankAdjustment, clearRankAdjustment, clearRankAdjustments } from "@/lib/actions/rank-adjustments";
import type { RankData, RankRow, CampaignPerf } from "@/lib/rank-data";

/**
 * Converte o texto digitado no modo de edicao em numero.
 * Aceita "1.234,56", "1234,56", "1234.56" e "R$ 1.234,56".
 */
export function parseValorBR(txt: string): number | null {
  const limpo = txt.replace(/[^\d,.-]/g, "").trim();
  if (!limpo) return null;

  let normalizado: string;
  if (limpo.includes(",")) {
    // Virgula presente = separador decimal; os pontos sao milhar.
    normalizado = limpo.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(limpo)) {
    // "1.234" / "12.345.678": pontos em grupos de 3 = separador de milhar.
    normalizado = limpo.replace(/\./g, "");
  } else {
    normalizado = limpo;
  }

  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

const REFRESH_MS = 30 * 60 * 1000; // 30 minutos

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function RankBoard({ initial, canEdit = false }: { initial: RankData; canEdit?: boolean }) {
  const [data, setData] = useState<RankData>(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState<Date>(new Date());
  const [campSel, setCampSel] = useState<string>(initial.campaignPerf[0]?.id ?? "");
  const [isFull, setIsFull] = useState(false);
  // Modo de edicao manual dos valores realizados. Exclusivo da GESTAO e
  // indisponivel em tela cheia (o telao e so exibicao).
  const [editMode, setEditMode] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editErro, setEditErro] = useState<string | null>(null);
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

  // Tela cheia encerra a edicao: o recurso so existe fora do modo telao.
  useEffect(() => {
    if (isFull) setEditMode(false);
  }, [isFull]);

  // Grava o ajuste de uma linha e recarrega o periodo, para que os tres
  // paineis e o KPI de Meta Geral reflitam o novo valor de uma vez so.
  const salvarAjuste = useCallback(
    async (userId: string, valor: number) => {
      setSavingId(userId);
      setEditErro(null);
      const res = await setRankAdjustment({ userId, month: selMonth, year: selYear, amount: valor });
      setSavingId(null);
      if (res.ok) await fetchPeriod(selMonth, selYear);
      else setEditErro(res.error);
    },
    [fetchPeriod, selMonth, selYear],
  );

  // Desfaz o ajuste de UMA linha: volta ao consolidado do sistema.
  const desfazerLinha = useCallback(
    async (userId: string) => {
      setSavingId(userId);
      setEditErro(null);
      const res = await clearRankAdjustment({ userId, month: selMonth, year: selYear });
      setSavingId(null);
      if (res.ok) await fetchPeriod(selMonth, selYear);
      else setEditErro(res.error);
    },
    [fetchPeriod, selMonth, selYear],
  );

  // "Restaurar padrao": descarta TODOS os ajustes do periodo.
  const restaurarTudo = useCallback(async () => {
    const confirmar = window.confirm(
      `Descartar os ${data.ajustesCount} ajuste(s) manual(is) de ${MESES[selMonth - 1]}/${selYear}? ` +
        "O quadro volta a exibir apenas os valores consolidados pelo sistema.",
    );
    if (!confirmar) return;
    setEditErro(null);
    const res = await clearRankAdjustments({ month: selMonth, year: selYear });
    if (res.ok) await fetchPeriod(selMonth, selYear);
    else setEditErro(res.error);
  }, [data.ajustesCount, fetchPeriod, selMonth, selYear]);

  const campPerf = data.campaignPerf.find((c) => c.id === campSel) ?? data.campaignPerf[0];
  const campTotalVol = data.campaigns.find((c) => c.id === campSel) ?? data.campaigns[0];

  // Anos disponiveis no seletor: do ano atual voltando 4 anos.
  const nowYear = new Date().getFullYear();
  const anos = Array.from({ length: 5 }, (_, i) => nowYear - i);

  // O quadro ocupa a altura da tela. Quando a tabela de Performance cresce
  // muito (muitos vendedores com meta), o excedente rola a PAGINA inteira —
  // nunca uma barra de rolagem dentro do bloco de Performance.
  const wrapClass = isFull
    ? "flex min-h-screen flex-col gap-2.5 overflow-y-auto bg-background p-3"
    : "flex min-h-[calc(100vh-7rem)] flex-col gap-2.5";

  // Contexto de edicao repassado as linhas. `ativo` fica false em tela cheia
  // ou para quem nao e GESTAO — nesse caso as linhas renderizam normalmente.
  const edicao: EdicaoCtx = {
    ativo: editMode && canEdit && !isFull,
    savingId,
    onSalvar: salvarAjuste,
    onDesfazer: desfazerLinha,
  };

  return (
    <div ref={rootRef} className={wrapClass}>
      {/* Barra de filtro de periodo */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="mr-1 text-xl font-extrabold uppercase tracking-tight text-vendas sm:text-2xl lg:text-3xl">Ranking de Vendas</h1>
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          <select className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
            value={selMonth} onChange={(e) => changePeriod(Number(e.target.value), selYear)}>
            {MESES.map((nome, i) => <option key={i} value={i + 1}>{nome}</option>)}
          </select>
          <select className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
            value={selYear} onChange={(e) => changePeriod(selMonth, Number(e.target.value))}>
            {anos.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          {data.ajustesCount > 0 && (
            <span
              title="Há valores informados manualmente neste período."
              className="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-500"
            >
              {data.ajustesCount} ajuste(s) manual(is)
            </span>
          )}
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
          {/* EDICAO MANUAL — some por completo em tela cheia. */}
          {canEdit && !isFull && (
            <>
              <button
                onClick={() => { setEditMode((v) => !v); setEditErro(null); }}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                  editMode
                    ? "border-vendas bg-vendas/10 text-vendas"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {editMode ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{editMode ? "Concluir edição" : "Editar valores"}</span>
              </button>
              {(editMode || data.ajustesCount > 0) && (
                <button
                  onClick={restaurarTudo}
                  disabled={data.ajustesCount === 0 || refreshing}
                  title={
                    data.ajustesCount === 0
                      ? "Nenhum ajuste manual neste período"
                      : "Descartar os ajustes e voltar aos valores do sistema"
                  }
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Restaurar padrão</span>
                </button>
              )}
            </>
          )}
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

      {editErro && (
        <p className="shrink-0 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
          {editErro}
        </p>
      )}

      {editMode && (
        <p className="shrink-0 rounded-lg border border-vendas/40 bg-vendas/5 px-3 py-2 text-xs text-muted-foreground">
          Modo de edição ativo: clique no valor de uma vendedora para informar manualmente o
          realizado do período. O valor digitado substitui o consolidado e vale para os painéis
          Geral, Varejo e Atacado.
        </p>
      )}

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

      {/* Grade principal (2 linhas x 3 colunas no desktop):
            col 1  -> Progresso Geral de Vendedoras, ocupando as DUAS linhas
                      (preenche verticalmente todo o espaco disponivel);
            col 2/3 linha 1 -> Varejo e Atacado;
            col 2/3 linha 2 -> Performance na Campanha, alinhado a esquerda com
                      o bloco Varejo (portanto mais estreito) e mais baixo.
          No mobile tudo empilha em coluna unica. */}
      {/* A 2a linha e `auto`: o bloco de Performance cresce conforme o numero
          de vendedores, sem barra de rolagem interna. Varejo/Atacado (1a linha)
          cedem altura — tem minimo de 160px e rolam internamente se preciso. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 lg:grid-cols-3 lg:grid-rows-[minmax(160px,1fr)_auto]">
        {/* Progresso Geral: ate 20 nomes, rola se passar disso. */}
        <div className="flex min-h-0 lg:row-span-2">
          <RankPanel title="Progresso Geral de Vendedoras" rows={data.rankGeral} showTrophy hideValue compact maxRows={20} className="flex-1"
            edicao={edicao} />
        </div>
        <RankPanel title="Varejo" rows={data.rankVarejo} showTrophy compact edicao={edicao} />
        <RankPanel title="Atacado" rows={data.rankAtacado} showTrophy compact edicao={edicao} />

        {/* Tabela de performance por campanha — ocupa apenas as colunas de
            Varejo/Atacado, na linha de baixo. Rola internamente. */}
        <div className="flex min-h-0 flex-col rounded-xl border border-border bg-card p-3 lg:col-span-2">
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

/** Estado da edicao manual repassado do quadro para cada linha do ranking. */
export interface EdicaoCtx {
  ativo: boolean;
  savingId: string | null;
  onSalvar: (userId: string, valor: number) => void | Promise<void>;
  onDesfazer: (userId: string) => void | Promise<void>;
}

// `maxRows` define quantos nomes o painel exibe (default 10). O container rola
// verticalmente quando a lista nao cabe na altura disponivel.
function RankPanel({ title, rows, showTrophy, compact, hideValue, maxRows = 10, className, edicao }: {
  title: string; rows: RankRow[]; showTrophy?: boolean; compact?: boolean; hideValue?: boolean;
  maxRows?: number; className?: string; edicao?: EdicaoCtx;
}) {
  return (
    <div className={`flex min-h-0 flex-col rounded-xl border border-border bg-card p-3 ${className ?? ""}`}>
      <p className="mb-1.5 shrink-0 text-base font-semibold lg:text-lg">{title}</p>
      <div className={`flex min-h-0 flex-1 flex-col overflow-y-auto ${compact ? "justify-start gap-2" : "justify-around gap-0.5"}`}>
        {rows.slice(0, maxRows).map((r, i) => (
          <RankLine key={r.userId} pos={i + 1} row={r} showTrophy={showTrophy} compact={compact} hideValue={hideValue} edicao={edicao} />
        ))}
        {rows.length === 0 && <p className="m-auto text-sm text-muted-foreground">Sem dados.</p>}
      </div>
    </div>
  );
}

function RankLine({ pos, row, showTrophy, compact, hideValue, edicao }: { pos: number; row: RankRow; showTrophy?: boolean; compact?: boolean; hideValue?: boolean; edicao?: EdicaoCtx }) {
  // Progresso real: vendido / meta. Sem meta cadastrada, mostra 0%.
  const semMeta = !(row.meta > 0);
  const pct = semMeta ? 0 : row.pct;
  const editando = edicao?.ativo === true;
  // Entraram pedidos depois que o ajuste foi salvo? O numero manual ficou para
  // tras e a tela avisa, em vez de esconder a divergencia.
  const defasado =
    row.ajustado &&
    row.sistemaNoAjuste !== null &&
    Math.abs(row.vendidoSistema - row.sistemaNoAjuste) >= 0.01;

  return (
    <div className={compact ? "py-1" : ""}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          {showTrophy && pos <= 3 && <RankTrophy pos={pos} />}
          <span className="truncate text-sm font-medium lg:text-base">{row.nome}</span>
          {row.ajustado && (
            <span
              title={
                `Valor informado manualmente. Sistema: ${formatBRL(row.vendidoSistema)}.` +
                (defasado
                  ? ` Atenção: o consolidado mudou desde o ajuste (era ${formatBRL(row.sistemaNoAjuste ?? 0)}).`
                  : "")
              }
              className={`shrink-0 rounded px-1 text-[10px] font-bold ${
                defasado ? "bg-amber-500/20 text-amber-500" : "bg-sky-500/15 text-sky-500"
              }`}
            >
              M
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {editando ? (
            <ValorEditavel row={row} edicao={edicao!} />
          ) : (
            !hideValue && row.vendido > 0 && (
              <span className="font-data text-sm lg:text-base">{formatBRL(row.vendido)}</span>
            )
          )}
          <span className={`font-data text-sm font-bold lg:text-base ${semMeta ? "text-muted-foreground" : tierText(pct)}`}>
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

/**
 * Campo de valor no modo de edicao.
 *
 * Grava no `blur` e no Enter; `Esc` cancela e devolve o valor anterior. Nao
 * salva quando o texto nao mudou, para nao gravar ajuste identico ao
 * consolidado a cada clique acidental.
 */
function ValorEditavel({ row, edicao }: { row: RankRow; edicao: EdicaoCtx }) {
  const inicial = String(row.vendido.toFixed(2)).replace(".", ",");
  const [texto, setTexto] = useState(inicial);
  const salvando = edicao.savingId === row.userId;

  // Se o valor mudar por fora (refetch apos salvar), reflete no campo.
  useEffect(() => { setTexto(inicial); }, [inicial]);

  function confirmar() {
    if (texto === inicial) return;
    const valor = parseValorBR(texto);
    if (valor === null || valor < 0) { setTexto(inicial); return; }
    edicao.onSalvar(row.userId, valor);
  }

  return (
    <span className="flex items-center gap-1">
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={confirmar}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.currentTarget.blur(); }
          if (e.key === "Escape") { setTexto(inicial); e.currentTarget.blur(); }
        }}
        disabled={salvando}
        inputMode="decimal"
        aria-label={`Valor realizado de ${row.nome}`}
        className="font-data h-7 w-28 rounded-md border border-input bg-background px-2 text-right text-sm disabled:opacity-50"
      />
      {row.ajustado && (
        <button
          type="button"
          onClick={() => edicao.onDesfazer(row.userId)}
          disabled={salvando}
          title={`Desfazer ajuste e voltar a ${formatBRL(row.vendidoSistema)}`}
          aria-label="Desfazer ajuste desta vendedora"
          className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  );
}

function RankTrophy({ pos }: { pos: number }) {
  const color = pos === 1 ? "text-amber-400" : pos === 2 ? "text-slate-300" : "text-amber-700";
  return <Trophy className={`h-4 w-4 lg:h-5 lg:w-5 ${color}`} />;
}

function PerfTable({ perf }: { perf: CampaignPerf | undefined }) {
  if (!perf || perf.rows.length === 0) {
    return <p className="m-auto text-sm text-muted-foreground">Nenhuma campanha ativa ou sem metas vinculadas.</p>;
  }
  return (
    /* Sem rolagem interna: a tabela exibe TODOS os vendedores e o card cresce
       verticalmente conforme a quantidade de linhas. */
    <div className="flex-1">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="pb-1 pr-2">Vendedores</th>
            <th className="pb-1 pr-2 text-right">Meta</th>
            <th className="pb-1 pr-2 text-center">Qtd Peças</th>
            {/* Coluna "Valor" removida a pedido do produto. */}
            <th className="pb-1 pr-2 text-right">Premiação</th>
            <th className="pb-1 pl-2" style={{ width: "28%" }}>Meta%</th>
          </tr>
        </thead>
        <tbody>
          {/* Sem corte: todos os vendedores com meta na campanha aparecem. */}
          {perf.rows.map((r, i) => (
            <tr key={r.nome} className="border-t border-border/60">
              <td className="py-1 pr-2">
                <span className="flex items-center gap-1.5">
                  {i < 3 && <RankTrophy pos={i + 1} />}
                  <span className="font-medium">{r.nome}</span>
                </span>
              </td>
              <td className="py-1 pr-2 text-right font-data">{r.meta > 0 ? r.meta : "—"}</td>
              <td className="py-1 pr-2 text-center font-data">{r.qtd}</td>
              {/* Coluna "Valor" removida a pedido do produto. */}
              <td className="py-1 pr-2 text-right font-data text-vendas">{formatBRL(r.premiacao)}</td>
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
