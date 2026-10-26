"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { RefreshCw, Target, TrendingUp, BarChart3, Flame, Trophy, Maximize2, Minimize2, CalendarClock, Pencil, Check, RotateCcw, Undo2, Play, Pause } from "lucide-react";
import { formatBRL, tierColor, tierText, nextCampaignId } from "@/lib/utils";
import { setRankAdjustment, clearRankAdjustment, clearRankAdjustments } from "@/lib/actions/rank-adjustments";
import type { RankData, RankRow, CampaignPerf, CampaignPerfRow } from "@/lib/rank-data";

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

// RODIZIO DAS CAMPANHAS
//
// O bloco "Performance na" exibe UMA campanha por vez, e o quadro vive num
// telao onde ninguem esta operando o seletor. Sem rodizio, as demais campanhas
// ativas simplesmente nunca aparecem para quem olha a tela. A cada 5 minutos
// ele avanca para a proxima, dando a volta na lista.
const CAMPAIGN_ROTATE_MS = 5 * 60 * 1000; // 5 minutos

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// Particulas que nao viram inicial: "Maria DA Silva" e "MS", nunca "MD".
const PARTICULAS = new Set(["de", "da", "do", "das", "dos", "e", "di", "du", "del", "van", "von"]);

/**
 * Iniciais para o avatar: primeiro + ultimo nome de verdade.
 * "Arliane Araujo Trajano" -> "AT". Nome de uma palavra devolve uma letra.
 */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter((p) => p && !PARTICULAS.has(p.toLowerCase()));
  if (partes.length === 0) return "?";
  const primeira = partes[0][0];
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}

/**
 * Parte inteira e centavos de um valor em BRL, separados.
 *
 * Os centavos entram menores no KPI: num telao lido de longe, quem olha decide
 * pela ordem de grandeza — o centavo so rouba altura da linha. O valor
 * continua inteiro na tela, nao arredondado.
 */
function brlPartes(valor: number): [string, string] {
  const s = formatBRL(valor);
  const i = s.lastIndexOf(",");
  return i < 0 ? [s, ""] : [s.slice(0, i), s.slice(i + 1)];
}

/** Soma o realizado de um painel — serve ao "Total" do cabecalho. */
function somaVendido(rows: RankRow[]): number {
  return rows.reduce((acc, r) => acc + r.vendido, 0);
}

/**
 * Situacao da vendedora na campanha, em palavra.
 *
 * As FAIXAS SAO AS MESMAS de `tierColor`/`tierText` (34 / 67 / 100) de
 * proposito: a cor da barra e a palavra do selo respondem a mesma pergunta, e
 * com reguas diferentes 40% seria "amarelo" na barra e "elegivel" no selo —
 * duas leituras do mesmo numero na mesma linha.
 */
function statusCampanha(r: CampaignPerfRow): { label: string; tone: Tone } {
  if (r.meta <= 0) return { label: "Sem meta", tone: "neutral" };
  if (r.qtd === 0) return { label: "Sem vendas", tone: "neutral" };
  if (r.pct >= 100) return { label: "Meta batida", tone: "emerald" };
  if (r.pct >= 67) return { label: "Elegível", tone: "blue" };
  if (r.pct >= 34) return { label: "Em pacing", tone: "amber" };
  return { label: "Abaixo", tone: "red" };
}

export function RankBoard({ initial, canEdit = false }: { initial: RankData; canEdit?: boolean }) {
  const [data, setData] = useState<RankData>(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState<Date>(new Date());
  const [campSel, setCampSel] = useState<string>(initial.campaignPerf[0]?.id ?? "");
  const [campRotating, setCampRotating] = useState(true);
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

  // Rodizio das campanhas. Com 0 ou 1 campanha nao ha o que alternar, e o
  // intervalo nem chega a ser criado. A lista entra nas dependencias porque o
  // auto-refresh troca `data` e a lista pode mudar no meio do rodizio.
  const campIds = data.campaignPerf.map((c) => c.id).join(",");
  useEffect(() => {
    if (!campRotating) return;
    const ids = campIds ? campIds.split(",") : [];
    if (ids.length < 2) return;
    const id = setInterval(() => {
      setCampSel((atual) => nextCampaignId(ids, atual));
    }, CAMPAIGN_ROTATE_MS);
    return () => clearInterval(id);
  }, [campRotating, campIds]);

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

  // ---- Numeros derivados do que ja esta na tela (nenhuma consulta nova) ----

  const totalVarejo = somaVendido(data.rankVarejo);
  const totalAtacado = somaVendido(data.rankAtacado);
  // Participacao de cada frente no que as DUAS somam. Sem faturamento nenhum
  // nao ha participacao a mostrar — 0/0 leria como "0% do atacado".
  //
  // As duas saem da MESMA divisao e somam 100%: calcular o varejo como
  // "100 - atacado" daria o mesmo numero, mas um arredondamento a menos
  // deixaria 49,9 + 50,0 na tela.
  const faturamentoTotal = totalVarejo + totalAtacado;
  const participacaoAtacado =
    faturamentoTotal > 0 ? (totalAtacado / faturamentoTotal) * 100 : null;
  const participacaoVarejo =
    faturamentoTotal > 0 ? (totalVarejo / faturamentoTotal) * 100 : null;

  // Concentracao do topo: quanto do volume do mes esta nas tres primeiras.
  // Com tres vendedoras ou menos a resposta e sempre 100% e nao informa nada.
  const concentracaoTop3 = useMemo(() => {
    if (data.rankGeral.length <= 3) return null;
    const total = somaVendido(data.rankGeral);
    if (total <= 0) return null;
    return (somaVendido(data.rankGeral.slice(0, 3)) / total) * 100;
  }, [data.rankGeral]);

  // PACING DO MES
  //
  // Quanto do mes ja passou, em dias corridos, e onde o mes fecha mantido o
  // ritmo atual. So no mes corrente: mes fechado nao se projeta.
  //
  // shortcut: dias corridos, nao dias uteis — sabado e domingo contam como dia
  // de venda. Trocar por dias uteis quando a operacao tiver calendario proprio.
  const pacing = useMemo(() => {
    if (!data.isCurrent || data.metaGeral <= 0 || data.realizadoGeral <= 0) return null;
    const hoje = new Date();
    // Antes do dia 3 a projecao e ruido: dividir por 1/31 do mes multiplica
    // qualquer venda por trinta e o telao mostraria um numero absurdo.
    if (hoje.getDate() < 3) return null;
    const diasNoMes = new Date(selYear, selMonth, 0).getDate();
    const decorrido = Math.min(hoje.getDate(), diasNoMes) / diasNoMes;
    const projecao = data.realizadoGeral / decorrido;
    return {
      pctMes: Math.round(decorrido * 100),
      projecao,
      pctProj: Math.round((projecao / data.metaGeral) * 100),
    };
  }, [data.isCurrent, data.metaGeral, data.realizadoGeral, selMonth, selYear]);

  // Campanha em exibicao: meta somada de todas as vendedoras e o ticket medio
  // de quem efetivamente vendeu (quem esta com 0 nao forma media de ninguem).
  const campMetaGlobal = campPerf?.rows.reduce((a, r) => a + r.meta, 0) ?? 0;
  const campVendedoras = campPerf?.rows.filter((r) => r.qtd > 0).length ?? 0;
  // O VOLUME da campanha de Select e a contagem de contratos, nao `volume`,
  // que soma `itemCount` dos pedidos vinculados — e Select nao passa pelo
  // fluxo de pedidos. Sem esta troca o KPI do topo dizia "0 pecas" e "Nenhuma
  // peca vendida nesta campanha" num mes em que ela vendeu.
  const campVolume = campPerf?.select ? campPerf.select.vendidos : (campTotalVol?.volume ?? 0);
  const campTicket = campVendedoras > 0 ? campVolume / campVendedoras : null;
  const campPremiacao = campPerf?.rows.reduce((a, r) => a + r.premiacao, 0) ?? 0;

  // O quadro ocupa a altura da tela. Quando a tabela de Performance cresce
  // muito (muitos vendedores com meta), o excedente rola a PAGINA inteira —
  // nunca uma barra de rolagem dentro do bloco de Performance.
  const wrapClass = isFull
    ? "flex min-h-screen flex-col gap-3 overflow-y-auto bg-background p-3"
    : "flex min-h-[calc(100vh-7rem)] flex-col gap-3";

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
      {/* CABECALHO — identidade do quadro a esquerda, controles a direita.
          Virou card para separar "que tela e esta" de "o que ela mostra": no
          telao, o titulo solto sobre o fundo competia com os KPIs. */}
      <header className="shrink-0 rounded-xl border border-border bg-card px-3.5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-vendas/15 text-vendas-text">
              <TrendingUp className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-extrabold uppercase leading-none tracking-tight text-vendas-text sm:text-2xl lg:text-[1.7rem]">
                  Ranking de Vendas
                </h1>
                {data.isCurrent ? (
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
                    Ao vivo
                  </span>
                ) : (
                  <Pill tone="amber">Histórico</Pill>
                )}
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                Performance comercial integrada · Atacado &amp; Varejo
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {/* Periodo: calendario e os dois seletores num controle so. */}
            <div className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5">
              <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" />
              <select
                aria-label="Mês"
                className="cursor-pointer bg-transparent py-1 text-sm font-medium outline-none"
                value={selMonth}
                onChange={(e) => changePeriod(Number(e.target.value), selYear)}
              >
                {MESES.map((nome, i) => <option key={i} value={i + 1}>{nome}</option>)}
              </select>
              <span className="h-4 w-px shrink-0 bg-border" />
              <select
                aria-label="Ano"
                className="font-data cursor-pointer bg-transparent py-1 text-sm font-medium outline-none"
                value={selYear}
                onChange={(e) => changePeriod(selMonth, Number(e.target.value))}
              >
                {anos.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            {data.ajustesCount > 0 && (
              <Pill tone="sky" dot title="Há valores informados manualmente neste período.">
                {data.ajustesCount} ajuste{data.ajustesCount > 1 ? "s" : ""} manu{data.ajustesCount > 1 ? "ais" : "al"}
              </Pill>
            )}

            {!data.isCurrent && (
              <BarButton onClick={goCurrent}>Voltar ao mês atual</BarButton>
            )}

            {/* EDICAO MANUAL — some por completo em tela cheia. */}
            {canEdit && !isFull && (
              <div className="flex h-9 items-center rounded-lg border border-border bg-background">
                <button
                  onClick={() => { setEditMode((v) => !v); setEditErro(null); }}
                  className={`flex h-full items-center gap-1.5 rounded-l-lg px-2.5 text-xs font-medium transition-colors ${
                    editMode
                      ? "bg-vendas/15 text-vendas-text"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  {editMode ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">{editMode ? "Concluir edição" : "Editar valores"}</span>
                </button>
                {(editMode || data.ajustesCount > 0) && (
                  <>
                    <span className="h-4 w-px shrink-0 bg-border" />
                    <button
                      onClick={restaurarTudo}
                      disabled={data.ajustesCount === 0 || refreshing}
                      title={
                        data.ajustesCount === 0
                          ? "Nenhum ajuste manual neste período"
                          : "Descartar os ajustes e voltar aos valores do sistema"
                      }
                      className="flex h-full items-center gap-1.5 rounded-r-lg px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Restaurar</span>
                    </button>
                  </>
                )}
              </div>
            )}

            <BarButton onClick={refresh} title="Atualizar agora">
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              <span className="font-data">
                {lastSync.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </BarButton>

            <BarButton onClick={toggleFull} aria-label={isFull ? "Sair da tela cheia" : "Tela cheia"}>
              {isFull ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{isFull ? "Sair" : "Tela cheia"}</span>
            </BarButton>
          </div>
        </div>
      </header>

      {editErro && (
        <p className="shrink-0 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
          {editErro}
        </p>
      )}

      {editMode && (
        <p className="shrink-0 rounded-lg border border-vendas/40 bg-vendas/5 px-3 py-2 text-xs text-muted-foreground">
          Modo de edição ativo: clique no valor de uma vendedora para informar manualmente o
          realizado até agora. O valor digitado vale para os painéis Geral, Varejo e Atacado —
          e os pedidos registrados depois da edição continuam somando sobre ele.
        </p>
      )}

      {/* KPIs */}
      <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetaGeralKpi meta={data.metaGeral} realizado={data.realizadoGeral} pct={data.metaGeralPct} pacing={pacing} />
        <RecordeKpi
          icon={<TrendingUp className="h-4 w-4" />}
          iconClass="bg-emerald-500/15 text-emerald-500"
          label={data.isCurrent ? "Maior venda semanal" : "Maior venda no mês"}
          total={data.maiorSemana?.total ?? null}
          nome={data.maiorSemana?.nome ?? null}
          vazio={`${String(data.month).padStart(2, "0")}/${data.year}`}
        />
        <RecordeKpi
          icon={<BarChart3 className="h-4 w-4" />}
          iconClass="bg-sky-500/15 text-sky-500"
          label="Maior venda mensal"
          total={data.maiorMes?.total ?? null}
          nome={data.maiorMes?.nome ?? null}
          vazio="—"
        />
        <CampanhaKpi
          nome={campTotalVol?.name ?? null}
          volume={campVolume}
          metaGlobal={campMetaGlobal}
          ticket={campTicket}
          ehSelect={campPerf?.select != null}
        />
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
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-3 lg:grid-rows-[minmax(160px,1fr)_auto]">
        {/* Progresso Geral: ate 20 nomes, rola se passar disso. */}
        <div className="flex min-h-0 lg:row-span-2">
          <RankPanel
            title="Progresso geral de vendedoras"
            rows={data.rankGeral}
            showTrophy
            hideValue
            destacarTop3
            maxRows={20}
            className="flex-1"
            edicao={edicao}
            meta={
              <span className="shrink-0 text-right text-[11px] uppercase leading-tight tracking-widest text-muted-foreground">
                <span className="font-data block text-sm font-bold normal-case tracking-normal text-foreground">
                  {data.rankGeral.length}
                </span>
                vendedoras
              </span>
            }
            footer={
              concentracaoTop3 !== null && (
                <>
                  <span>Top 3 concentram</span>
                  <span className="font-data font-bold normal-case tracking-normal text-foreground">
                    {concentracaoTop3.toFixed(1)}% do volume
                  </span>
                </>
              )
            }
          />
        </div>

        <RankPanel
          title="Varejo"
          dotClass="bg-cyan-400"
          rows={data.rankVarejo}
          showTrophy
          edicao={edicao}
          meta={
            <TotalPainel
              qtd={data.rankVarejo.length}
              rotulo={data.rankVarejo.length === 1 ? "operação" : "operações"}
              total={totalVarejo}
            />
          }
          footer={
            participacaoVarejo !== null && (
              <>
                <span>Participação no faturamento</span>
                <span className="font-data font-bold normal-case tracking-normal text-foreground">
                  {participacaoVarejo.toFixed(1)}% da empresa
                </span>
              </>
            )
          }
        />

        <RankPanel
          title="Atacado"
          dotClass="bg-violet-400"
          rows={data.rankAtacado}
          showTrophy
          edicao={edicao}
          meta={
            <TotalPainel
              qtd={data.rankAtacado.length}
              rotulo={data.rankAtacado.length === 1 ? "conta" : "contas"}
              total={totalAtacado}
            />
          }
          footer={
            participacaoAtacado !== null && (
              <>
                <span>Participação no faturamento</span>
                <span className="font-data font-bold normal-case tracking-normal text-foreground">
                  {participacaoAtacado.toFixed(1)}% da empresa
                </span>
              </>
            )
          }
        />

        {/* Tabela de performance por campanha — ocupa apenas as colunas de
            Varejo/Atacado, na linha de baixo. Rola internamente. */}
        <div className="flex min-h-0 flex-col rounded-xl border border-border bg-card p-3.5 lg:col-span-2">
          <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Performance na campanha
              </h2>
              {data.campaignPerf.length > 0 && (
                <select
                  aria-label="Campanha"
                  className="h-8 cursor-pointer rounded-lg border border-border bg-background px-2 text-sm font-semibold"
                  value={campSel}
                  onChange={(e) => {
                    // Escolha manual desliga o rodizio: a pessoa quer ESTA
                    // campanha, e trocar sozinho depois desfaria a escolha.
                    setCampRotating(false);
                    setCampSel(e.target.value);
                  }}>
                  {data.campaignPerf.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              {/* Estado do rodizio + religar. So aparece havendo mais de uma
                  campanha: com uma so nao ha alternancia possivel, e o controle
                  seria um botao que nao faz nada. */}
              {data.campaignPerf.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    // Ao religar, ja avanca: religar e ficar 5 minutos na mesma
                    // campanha parece que o botao nao funcionou.
                    if (!campRotating) {
                      setCampSel((atual) => nextCampaignId(data.campaignPerf.map((c) => c.id), atual));
                    }
                    setCampRotating((v) => !v);
                  }}
                  title={
                    campRotating
                      ? "Trocando de campanha a cada 5 min. Clique para fixar esta."
                      : "Rodízio pausado. Clique para voltar a alternar."
                  }
                  className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2 text-xs font-medium transition-colors ${
                    campRotating
                      ? "border-vendas/40 bg-vendas/10 text-vendas-text hover:bg-vendas/20"
                      : "border-border text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {campRotating ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  <span className="font-data">
                    {Math.max(1, data.campaignPerf.findIndex((c) => c.id === campSel) + 1)}/{data.campaignPerf.length}
                  </span>
                </button>
              )}
            </div>
            {/* Premiacao somada da campanha. So na campanha de pecas: Select
                nao gera premiacao (decisao do dono em 26/10/2026), e a tabela
                dela nem tem a coluna. */}
            {!campPerf?.select && campPremiacao > 0 && (
              <span className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted-foreground">
                Total em premiações
                <span className="font-data rounded-lg bg-secondary px-2 py-1 text-sm font-bold normal-case tracking-normal text-vendas-text">
                  {formatBRL(campPremiacao)}
                </span>
              </span>
            )}
          </div>
          {/* Cabecalho da campanha Select: quantos Selects a equipe precisa
              vender no mes, e quantos ja sairam. A outra campanha nao tem
              numero equivalente — a meta dela e por vendedora, na tabela. */}
          {campPerf?.select && (
            <SelectMetaHeader
              vendidos={campPerf.select.vendidos}
              meta={campPerf.select.meta}
            />
          )}
          <PerfTable perf={campPerf} />
        </div>
      </div>
    </div>
  );
}

/* ========================== Pecas de interface ============================ */

type Tone = "neutral" | "sky" | "amber" | "emerald" | "blue" | "red";

const TONES: Record<Tone, { pill: string; dot: string }> = {
  neutral: { pill: "bg-secondary text-muted-foreground", dot: "bg-muted-foreground" },
  sky: { pill: "bg-sky-500/15 text-sky-500", dot: "bg-sky-500" },
  amber: { pill: "bg-amber-500/15 text-amber-500", dot: "bg-amber-500" },
  emerald: { pill: "bg-emerald-500/15 text-emerald-500", dot: "bg-emerald-500" },
  blue: { pill: "bg-blue-500/15 text-blue-500", dot: "bg-blue-500" },
  red: { pill: "bg-red-500/15 text-red-500", dot: "bg-red-500" },
};

/** Selo de estado. Fundo tingido da propria cor, nunca chapado. */
function Pill({ tone = "neutral", dot, children, title }: {
  tone?: Tone; dot?: boolean; children: React.ReactNode; title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone].pill}`}
    >
      {dot && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONES[tone].dot}`} />}
      {children}
    </span>
  );
}

/** Botao da barra de controles. Mesma altura e peso dos seletores. */
function BarButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      {children}
    </button>
  );
}

/** Contagem e total de um painel, no canto direito do cabecalho. */
function TotalPainel({ qtd, rotulo, total }: { qtd: number; rotulo: string; total: number }) {
  return (
    <span className="flex shrink-0 items-center gap-2">
      <Pill>{qtd} {rotulo}</Pill>
      {/* O rotulo fica pequeno e o VALOR cresce: no telao o que se le de longe
          e o numero, e "Total" so precisa ser identificavel de perto. */}
      <span className="whitespace-nowrap text-[11px] uppercase tracking-widest text-muted-foreground">
        Total{" "}
        <span className="font-data text-base font-bold normal-case tracking-normal text-foreground">
          {formatBRL(total)}
        </span>
      </span>
    </span>
  );
}

/** Moldura comum dos quatro KPIs: rotulo em caixa alta, icone e valor grande. */
function KpiShell({ label, icon, iconClass, children }: {
  label: string; icon: React.ReactNode; iconClass: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-3.5">
      <div className="flex items-start justify-between gap-2">
        <p className="truncate pt-0.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground" title={label}>
          {label}
        </p>
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${iconClass}`}>{icon}</span>
      </div>
      {children}
    </div>
  );
}

/**
 * Valor grande em reais, com os centavos menores.
 * O `tracking-tight` segura numero de sete digitos na largura do card.
 */
function ValorGrande({ valor }: { valor: number }) {
  const [inteiro, centavos] = brlPartes(valor);
  return (
    <p className="font-data mt-2 truncate text-2xl font-bold leading-none tracking-tight lg:text-[1.75rem]">
      {inteiro}
      {centavos && <span className="text-base font-semibold text-muted-foreground">,{centavos}</span>}
    </p>
  );
}

// KPI especial da Meta Geral: meta, realizado do mes, barra e o pacing.
function MetaGeralKpi({ meta, realizado, pct, pacing }: {
  meta: number; realizado: number; pct: number;
  pacing: { pctMes: number; projecao: number; pctProj: number } | null;
}) {
  return (
    <KpiShell label="Meta geral (mensal)" icon={<Target className="h-4 w-4" />} iconClass="bg-primary/15 text-primary">
      <ValorGrande valor={meta} />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="font-data truncate text-sm text-vendas-text">{formatBRL(realizado)} no mês</span>
        <span className={`font-data shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs font-bold ${tierText(pct)}`}>
          {pct}%
        </span>
      </div>
      <div className="mt-auto pt-2.5">
        <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
          <div className={`h-full rounded-full ${tierColor(pct)}`}
            style={{ width: `${Math.min(pct, 100)}%`, transition: "width .5s ease" }} />
        </div>
        {pacing && (
          <p className="mt-2 truncate text-[11px] text-muted-foreground">
            Pacing do mês <span className="font-data font-semibold text-foreground">{pacing.pctMes}%</span>
            {" · Projeção "}
            <span className="font-data font-semibold text-foreground">{formatBRL(pacing.projecao)}</span>
            {" ("}
            <span className={`font-data font-semibold ${tierText(pacing.pctProj)}`}>{pacing.pctProj}%</span>
            {")"}
          </p>
        )}
      </div>
    </KpiShell>
  );
}

/**
 * KPI de recorde (maior venda da semana / do mes): valor, e de quem foi.
 * A inicial em disco identifica a pessoa de longe, antes de o nome ser lido.
 */
function RecordeKpi({ icon, iconClass, label, total, nome, vazio }: {
  icon: React.ReactNode; iconClass: string; label: string;
  total: number | null; nome: string | null; vazio: string;
}) {
  return (
    <KpiShell label={label} icon={icon} iconClass={iconClass}>
      {total === null ? (
        <p className="font-data mt-2 truncate text-2xl font-bold leading-none tracking-tight text-muted-foreground lg:text-[1.75rem]">
          —
        </p>
      ) : (
        <ValorGrande valor={total} />
      )}
      <div className="mt-auto flex items-center gap-2 pt-3">
        {nome ? (
          <>
            <span className="font-data grid h-6 w-6 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-bold text-muted-foreground" aria-hidden>
              {iniciais(nome)}
            </span>
            <span className="truncate text-sm font-medium" title={nome}>{nome}</span>
          </>
        ) : (
          <span className="font-data truncate text-sm text-muted-foreground">{vazio}</span>
        )}
      </div>
    </KpiShell>
  );
}

/**
 * KPI da campanha em exibicao: pecas vendidas, ticket medio por vendedora e a
 * meta somada da equipe. O nome da campanha esta no rotulo — nao se repete num
 * selo "campanha ativa" ao lado, que diria a mesma coisa duas vezes.
 */
function CampanhaKpi({ nome, volume, metaGlobal, ticket, ehSelect = false }: {
  nome: string | null; volume: number; metaGlobal: number; ticket: number | null;
  /** Campanha de Select: a unidade e CONTRATO, nao peca. */
  ehSelect?: boolean;
}) {
  const pct = metaGlobal > 0 ? Math.round((volume / metaGlobal) * 100) : 0;
  // A unidade muda junta em todo o card. Deixar "pecas" fixo aqui era o que
  // fazia a campanha de Select anunciar "0 pecas" tendo vendido contratos.
  const unidade = ehSelect ? "Selects" : "peças";
  const unidadeCurta = ehSelect ? "Selects" : "pç";
  const vazio = ehSelect
    ? "Nenhum Select vendido nesta campanha."
    : "Nenhuma peça vendida nesta campanha.";
  return (
    <KpiShell
      label={nome ? `Campanha · ${nome}` : "Campanha ativa"}
      icon={<Flame className="h-4 w-4" />}
      iconClass="bg-orange-500/15 text-orange-500"
    >
      <p className="font-data mt-2 truncate text-2xl font-bold leading-none tracking-tight lg:text-[1.75rem]">
        {volume}
        <span className="ml-1.5 font-sans text-sm font-semibold text-muted-foreground">{unidade}</span>
      </p>
      <p className="mt-2 truncate text-[11px] text-muted-foreground">
        {ticket !== null ? (
          // "Ticket medio" e vocabulario de peca e de dinheiro; para contrato
          // o termo honesto e so "media".
          <>{ehSelect ? "Média por vendedora" : "Ticket médio por vendedora"} <span className="font-data font-semibold text-foreground">{ticket.toFixed(1)} {unidadeCurta}</span></>
        ) : (
          vazio
        )}
      </p>
      <div className="mt-auto pt-2.5">
        {metaGlobal > 0 ? (
          <>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
              <div className={`h-full rounded-full ${tierColor(pct)}`}
                style={{ width: `${Math.min(pct, 100)}%`, transition: "width .5s ease" }} />
            </div>
            <p className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span className="truncate">
                Meta da equipe <span className="font-data font-semibold text-foreground">{metaGlobal} {unidade}</span>
              </span>
              <span className={`font-data shrink-0 font-bold ${tierText(pct)}`}>{pct}%</span>
            </p>
          </>
        ) : (
          <p className="truncate text-[11px] text-muted-foreground">Sem metas vinculadas à campanha.</p>
        )}
      </div>
    </KpiShell>
  );
}

/**
 * Cabeçalho da campanha Select: quantos foram vendidos, a meta e a barra.
 *
 * A BARRA USA A MESMA RÉGUA DE COR da Meta Geral (`tierColor`/`tierText`): as
 * duas respondem "quanto da meta já foi" e, com cores próprias, verde num
 * lugar significaria uma coisa e noutro outra.
 *
 * A largura trava em 100%, o NÚMERO não: bateu 130% da meta, a barra fica
 * cheia e o texto diz 130%. Travar o número esconderia justamente o mês bom.
 *
 * Sem meta cadastrada não há barra — percentual de uma meta zero não existe, e
 * uma barra vazia leria como "nada vendido". Nesse caso o texto diz onde
 * cadastrar, que é a ação que resolve.
 */
function SelectMetaHeader({ vendidos, meta }: { vendidos: number; meta: number }) {
  if (meta <= 0) {
    return (
      <p className="mb-2.5 shrink-0 text-sm text-muted-foreground">
        <span className="font-data font-semibold text-foreground">{vendidos}</span> Selects
        vendidos no mês · sem meta cadastrada em Gestão &gt; Metas
      </p>
    );
  }

  const pct = Math.round((vendidos / meta) * 100);
  return (
    <div className="mb-2.5 flex shrink-0 items-center gap-3">
      <p className="shrink-0 text-sm text-muted-foreground">
        <span className="font-data font-semibold text-foreground">{vendidos}</span>
        {" de "}
        <span className="font-data font-semibold text-foreground">{meta}</span>
        {" Selects"}
      </p>
      <div
        className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-secondary"
        // A barra é decorativa: o "X de Y" ao lado e o percentual à direita já
        // dizem tudo a quem não a enxerga.
        aria-hidden
      >
        <div
          className={`h-full rounded-full ${tierColor(pct)}`}
          style={{ width: `${Math.min(pct, 100)}%`, transition: "width .5s ease" }}
        />
      </div>
      <span className={`font-data shrink-0 text-sm font-bold ${tierText(pct)}`}>{pct}%</span>
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
function RankPanel({ title, dotClass, rows, showTrophy, hideValue, destacarTop3, maxRows = 10, className, edicao, meta, footer }: {
  title: string; dotClass?: string; rows: RankRow[]; showTrophy?: boolean; hideValue?: boolean;
  destacarTop3?: boolean; maxRows?: number; className?: string; edicao?: EdicaoCtx;
  meta?: React.ReactNode; footer?: React.ReactNode;
}) {
  return (
    <div className={`flex min-h-0 flex-col rounded-xl border border-border bg-card p-3.5 ${className ?? ""}`}>
      <div className="mb-3 flex shrink-0 items-start justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-2 pt-0.5 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {dotClass && <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} />}
          <span className="truncate">{title}</span>
        </h2>
        {meta}
      </div>
      {/* `kanban-scroll`: sem ela a barra deste painel e a do Windows, grossa e
          com setinha nas pontas, dentro de um card num telao. A rolagem
          HORIZONTAL aparece quando nome + valor nao cabem na largura do painel
          — ver pendencia 3 do handoff de 22/10; a classe so veste a barra, nao
          resolve o transbordo. */}
      <div className="kanban-scroll flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
        {rows.slice(0, maxRows).map((r, i) => (
          <RankLine key={r.userId} pos={i + 1} row={r} showTrophy={showTrophy} hideValue={hideValue}
            destaque={destacarTop3 === true && i < 3} edicao={edicao} />
        ))}
        {rows.length === 0 && <p className="m-auto text-sm text-muted-foreground">Sem dados.</p>}
      </div>
      {footer && (
        <p className="mt-3 flex shrink-0 items-center justify-between gap-2 border-t border-border pt-2.5 text-[11px] uppercase tracking-widest text-muted-foreground">
          {footer}
        </p>
      )}
    </div>
  );
}

function RankLine({ pos, row, showTrophy, hideValue, destaque, edicao }: {
  pos: number; row: RankRow; showTrophy?: boolean; hideValue?: boolean; destaque?: boolean; edicao?: EdicaoCtx;
}) {
  // Progresso real: vendido / meta. Sem meta cadastrada, mostra 0%.
  const semMeta = !(row.meta > 0);
  const pct = semMeta ? 0 : row.pct;
  const editando = edicao?.ativo === true;
  // Pedidos registrados DEPOIS do ajuste somam sobre o valor digitado (ajuste
  // incremental). A tela mostra essa parcela para o numero ficar auditavel.
  const somouDepois = row.ajustado && row.vendidoAposAjuste > 0;
  const medalha = showTrophy === true && pos <= 3;

  return (
    // O destaque do podio e moldura e fundo, nao barra colorida na lateral: a
    // cor nesta tela e a regua de progresso, e uma faixa a mais competiria.
    <div className={destaque ? "rounded-lg border border-border bg-secondary/50 px-2.5 py-2" : "px-0.5 py-1"}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          {medalha ? (
            <RankTrophy pos={pos} />
          ) : (
            <span className="font-data w-4 shrink-0 text-center text-xs text-muted-foreground">{pos}</span>
          )}
          <span className={`truncate text-sm lg:text-[0.9375rem] ${destaque ? "font-bold" : "font-medium"}`} title={row.nome}>
            {row.nome}
          </span>
          {row.ajustado && (
            <span
              title={
                `Valor informado manualmente: ${formatBRL(row.ajusteBase ?? 0)}` +
                (row.ajusteCorte
                  ? ` (até ${new Date(row.ajusteCorte).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })})`
                  : "") +
                (somouDepois
                  ? ` + ${formatBRL(row.vendidoAposAjuste)} registrados depois.`
                  : ".") +
                ` Consolidado do sistema no mês: ${formatBRL(row.vendidoSistema)}.`
              }
              className="shrink-0 rounded bg-sky-500/15 px-1 text-[10px] font-bold text-sky-500"
            >
              M{somouDepois ? "+" : ""}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-2.5">
          {editando ? (
            <ValorEditavel row={row} edicao={edicao!} />
          ) : (
            !hideValue && row.vendido > 0 && (
              <span className="font-data text-sm lg:text-[0.9375rem]">{formatBRL(row.vendido)}</span>
            )
          )}
          <span className={`font-data w-11 shrink-0 text-right text-sm font-bold lg:text-[0.9375rem] ${semMeta ? "text-muted-foreground" : tierText(pct)}`}>
            {semMeta ? "s/ meta" : `${pct}%`}
          </span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
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
  return <Trophy className={`h-4 w-4 shrink-0 ${color}`} aria-hidden />;
}

function PerfTable({ perf }: { perf: CampaignPerf | undefined }) {
  // A campanha de Select usa a MESMA tabela, com duas diferencas: a coluna de
  // quantidade conta contratos e nao pecas, e a de premiacao nao existe
  // (Select nao premia). O resto — meta, progresso, selo — e identico, e e o
  // ponto: no telao as campanhas se alternam sozinhas a cada 5 min, e trocar a
  // forma da tabela junto obrigaria quem olha a reaprender o quadro.
  const ehSelect = perf?.select != null;

  if (!perf || perf.rows.length === 0) {
    return <p className="m-auto text-sm text-muted-foreground">Nenhuma campanha ativa ou sem metas vinculadas.</p>;
  }
  return (
    /* Sem rolagem interna: a tabela exibe TODOS os vendedores e o card cresce
       verticalmente conforme a quantidade de linhas. */
    <div className="flex-1">
      <table className="table-plain w-full text-sm">
        <thead className="text-left text-[11px] uppercase tracking-widest text-foreground">
          <tr>
            <th className="pb-2 pr-2 font-semibold">Vendedora</th>
            <th className="pb-2 pr-2 text-right font-semibold">Meta</th>
            <th className="pb-2 pr-2 text-right font-semibold">{ehSelect ? "Selects" : "Qtd peças"}</th>
            {/* Coluna "Valor" removida a pedido do produto. */}
            {!ehSelect && <th className="pb-2 pr-2 text-right font-semibold">Premiação</th>}
            <th className="px-2 pb-2 font-semibold" style={{ width: "26%" }}>Meta &amp; progresso</th>
            {/* A 6a coluna so entra onde ha largura para ela. Abaixo de 1280px
                o card vale 2/3 da grade e cinco colunas ja e o limite — e a
                palavra do selo sai da MESMA faixa do percentual ao lado, entao
                esconde-la nao tira informacao de ninguem. */}
            <th className="hidden pb-2 pl-2 text-right font-semibold xl:table-cell">Status</th>
          </tr>
        </thead>
        <tbody>
          {/* Sem corte: todos os vendedores com meta na campanha aparecem. */}
          {perf.rows.map((r, i) => {
            const status = statusCampanha(r);
            // Quem nao vendeu recua para o segundo plano: a tabela e lida de
            // longe, e a linha zerada so precisa existir, nao disputar atencao.
            const apagada = r.qtd === 0;
            return (
              <tr key={r.nome} className={`border-t border-border/60 ${apagada ? "text-muted-foreground" : ""}`}>
                <td className="py-1.5 pr-2">
                  <span className="flex items-center gap-2">
                    {i < 3 && !apagada ? <RankTrophy pos={i + 1} /> : <span className="w-4 shrink-0" />}
                    <span className={apagada ? "" : "font-semibold"}>{r.nome}</span>
                  </span>
                </td>
                <td className="py-1.5 pr-2 text-right font-data">{r.meta > 0 ? r.meta : "—"}</td>
                <td className={`py-1.5 pr-2 text-right font-data ${apagada ? "" : "font-bold text-foreground"}`}>{r.qtd}</td>
                {/* Coluna "Valor" removida a pedido do produto. */}
                {!ehSelect && (
                  <td className={`py-1.5 pr-2 text-right font-data ${apagada ? "" : "text-vendas-text"}`}>{formatBRL(r.premiacao)}</td>
                )}
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                      <div className={`h-full rounded-full ${tierColor(r.pct)}`}
                        style={{ width: `${Math.min(r.pct, 100)}%`, transition: "width .5s ease" }} />
                    </div>
                    <span className={`font-data w-9 shrink-0 text-right text-sm font-bold ${r.meta > 0 ? tierText(r.pct) : "text-muted-foreground"}`}>
                      {r.meta > 0 ? `${r.pct}%` : "—"}
                    </span>
                  </div>
                </td>
                <td className="hidden py-1.5 pl-2 text-right xl:table-cell">
                  <Pill tone={status.tone}>{status.label}</Pill>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
