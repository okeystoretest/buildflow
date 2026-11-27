"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Inbox, Loader2, Pause, Play, Plus, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Cronometro } from "@/components/shared/cronometro";
import { KpiNumero } from "@/components/shared/kpi-numero";
import { alternarCronometro, moverFollowUp } from "@/lib/actions/followups";
import {
  FOLLOWUP_STATUSES,
  FOLLOWUP_STATUS_LABEL,
  type FollowUpKindValue,
} from "@/lib/validations/followup";
import {
  FOLLOWUP_STATUS_COLOR,
  colunaDe,
  formatarDuracao,
  rotuloDaColuna,
  tempoTotal,
  type FollowUpRow,
  type FollowUpStatusValue,
  type FollowUpSummary,
} from "@/lib/followup-kanban";

/**
 * O quadro do Acompanhamento — os Status de Evolução como colunas
 * (especificação do dono, 27/11/2026).
 *
 * MESMA PROPOSTA DE DESIGN do quadro do Relatório Semanal, como ele pediu, e
 * por isso os três caminhos de movimentação foram copiados dali em vez de
 * reinventados: arrasto NATIVO do HTML (sem biblioteca — o navegador faz isso
 * há vinte anos, e uma dependência aqui pagaria por recursos que este quadro
 * não usa), ← e → com o cartão em foco para quem usa TECLADO, e a lista "Mover
 * para" da ficha, que é o único caminho num telefone. Ver o cabeçalho de
 * `marketing/relatorio-semanal/kanban-board.tsx`.
 *
 * NÃO É um quadro genérico compartilhado: o projeto tem o de pedidos
 * (`shared/kanban-board.tsx`, amarrado a `OrderStatus`), o de tarefas de
 * marketing e o de controle de peças, cada um seu. Generalizar os quatro é
 * obra maior e mais arriscada do que o pedido; o que vale a pena compartilhar
 * — o quadrinho de KPI e o cronômetro — já saiu para `shared/`.
 *
 * O CARTÃO NÃO TEM SELO DE STATUS: a coluna já diz o status pela posição, e
 * repetir a informação ao lado dela só gasta tinta.
 */

/** Quantos cartões a coluna mostra antes de rolar por dentro. */
const ALTURA_DA_COLUNA = "max-h-[600px]";

export function KanbanFollowUps({
  rows,
  resumo,
  kind,
  hoje,
  onAbrir,
  onNovo,
}: {
  /** Só os registros DESTA PÁGINA — o dono manteve a paginação no quadro. */
  rows: readonly FollowUpRow[];
  /** Os números do topo E a contagem por coluna, do FILTRO INTEIRO. */
  resumo: FollowUpSummary;
  kind: FollowUpKindValue;
  /** "YYYY-MM-DD" de hoje no fuso do negócio. */
  hoje: string;
  onAbrir: (id: string) => void;
  onNovo: () => void;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<FollowUpStatusValue | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  /**
   * Cartão que acabou de mudar de coluna PELO TECLADO.
   *
   * Ele é destruído e recriado dentro da coluna nova, e sem isto o foco cairia
   * no corpo da página a cada seta — a seta seguinte rolaria a página em vez
   * de mover o cartão. Em `ref`, e não em estado, porque reposicionar o foco
   * não é motivo para redesenhar o quadro.
   */
  const foco = useRef<string | null>(null);

  useEffect(() => {
    if (!foco.current) return;
    document.querySelector<HTMLElement>(`[data-cartao="${foco.current}"]`)?.focus();
  }, [rows]);

  async function mover(id: string, status: FollowUpStatusValue) {
    if (ocupado) return;
    setOcupado(id);
    setErro(null);
    const r = await moverFollowUp({ id, status });
    setOcupado(null);
    if (!r.ok) {
      setErro(r.error);
      return;
    }
    router.refresh();
  }

  async function cronometro(id: string) {
    if (ocupado) return;
    setOcupado(id);
    setErro(null);
    const r = await alternarCronometro({ id });
    setOcupado(null);
    if (!r.ok) {
      setErro(r.error);
      return;
    }
    router.refresh();
  }

  function soltarNaColuna(status: FollowUpStatusValue, e: React.DragEvent) {
    e.preventDefault();
    setAlvo(null);
    setArrastando(null);
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    const row = rows.find((r) => r.id === id);
    // Soltar na própria coluna não é movimentação: a action também recusa, mas
    // a ida ao servidor para nada piscaria o cartão.
    if (!row || colunaDe(row.status) === status) return;
    void mover(id, status);
  }

  const quinzenal = kind === "QUINZENAL";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Arraste os cartões conforme o acompanhamento evolui, ou clique para abrir a ficha — que
          também move o cartão, e é o caminho no celular. Com o cartão em foco, ← e → movem entre as
          colunas. O cronômetro do cartão pausa sozinho quando o status muda.
        </p>
        <Button size="sm" onClick={onNovo}>
          <Plus className="h-3.5 w-3.5" />
          Novo registro
        </Button>
      </div>

      {/* Os números contam o FILTRO INTEIRO, nunca a página: com cinco
          registros por página, um total de página diria "5" num ano com
          trinta. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <KpiNumero rotulo="Total de registros" valor={resumo.total} />
        <KpiNumero rotulo="Em andamento" valor={resumo.emAndamento} />
        <KpiNumero rotulo="Precisa de revisão" valor={resumo.precisaRevisao} />
        <KpiNumero rotulo="Entregues" valor={resumo.entregues} destaque="ok" />
        {/* O quinto número depende da aba: o One-on-One não tem prazo, e um
            quadrinho de "Reavaliação vencida" ficaria em zero para sempre
            naquela aba. */}
        {quinzenal ? (
          <KpiNumero rotulo="Reavaliação vencida" valor={resumo.reavaliacaoVencida} destaque="alerta" />
        ) : (
          <KpiNumero rotulo="Em espera" valor={resumo.emEspera} />
        )}
      </div>

      {erro && <p className="text-xs text-destructive">{erro}</p>}

      <div className="kanban-scroll overflow-x-auto rounded-xl border border-border bg-card">
        {/* A partir de `lg` as cinco colunas DIVIDEM a largura disponível, e
            não há barra horizontal. Abaixo disso voltam à largura fixa e o
            quadro rola de lado: cinco colunas num telefone não caberiam sem
            virar cinco tiras ilegíveis. */}
        <div className="flex min-w-max divide-x divide-border lg:min-w-0">
          {FOLLOWUP_STATUSES.map((status) => {
            const coluna = rows.filter((r) => colunaDe(r.status) === status);
            const recebendo = alvo === status;
            return (
              <section
                key={status}
                aria-label={FOLLOWUP_STATUS_LABEL[status]}
                className={cn(
                  "w-[248px] shrink-0 transition-colors lg:w-auto lg:min-w-0 lg:flex-1",
                  recebendo && "bg-primary/[0.07]",
                )}
                onDragOver={(e) => {
                  if (!arrastando) return;
                  // Sem o preventDefault o navegador RECUSA a soltura: o
                  // padrão de toda área da página é "aqui não se solta".
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setAlvo(status);
                }}
                onDragLeave={(e) => {
                  // Só limpa ao sair da COLUNA: passar por cima de um cartão
                  // filho dispara dragleave e piscaria o destaque.
                  if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                  setAlvo((atual) => (atual === status ? null : atual));
                }}
                onDrop={(e) => soltarNaColuna(status, e)}
              >
                <header
                  className={cn(
                    "flex items-center gap-1.5 border-b border-border px-2.5 py-2 transition-colors",
                    recebendo ? "bg-primary/10" : "bg-secondary",
                  )}
                >
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: FOLLOWUP_STATUS_COLOR[status] }}
                  />
                  <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {FOLLOWUP_STATUS_LABEL[status]}
                  </h4>
                  {/* "3 de 11" quando a página esconde registros: o dono
                      manteve a paginação no quadro, e um "3" solto mentiria
                      sobre o que existe fora da página. */}
                  <span
                    className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-md bg-muted px-1 text-[11px] font-semibold text-muted-foreground"
                    title={`${coluna.length} nesta página de ${resumo.porStatus[status]} no filtro`}
                  >
                    {rotuloDaColuna(coluna.length, resumo.porStatus[status])}
                  </span>
                </header>

                <div className={cn("kanban-scroll min-h-[120px] space-y-2 overflow-y-auto p-2", ALTURA_DA_COLUNA)}>
                  {coluna.length === 0 ? (
                    <div
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-lg border border-dashed px-2 py-6 text-center transition-colors",
                        recebendo ? "border-primary/50" : "border-border",
                      )}
                    >
                      <Inbox className="h-5 w-5 text-muted-foreground/60" aria-hidden />
                      <p className="text-[11px] leading-tight text-muted-foreground">
                        {/* "Nenhum registro nesta coluna", e não "Nenhum em
                            {status}": a preposição colide com o "Em" do rótulo
                            em três dos cinco status ("Nenhum em em espera"). */}
                        {recebendo
                          ? "Solte aqui"
                          : resumo.porStatus[status] > 0
                            ? "Nenhum nesta página"
                            : "Nenhum registro nesta coluna"}
                      </p>
                    </div>
                  ) : (
                    coluna.map((row) => (
                      <Cartao
                        key={row.id}
                        row={row}
                        status={status}
                        hoje={hoje}
                        quinzenal={quinzenal}
                        ocupado={ocupado === row.id}
                        travado={ocupado !== null}
                        arrastando={arrastando === row.id}
                        onAbrir={() => {
                          foco.current = null;
                          onAbrir(row.id);
                        }}
                        onSeta={(passo) => {
                          const destino = FOLLOWUP_STATUSES[FOLLOWUP_STATUSES.indexOf(status) + passo];
                          if (!destino) return;
                          foco.current = row.id;
                          void mover(row.id, destino);
                        }}
                        onArrastar={(ligado) => {
                          setArrastando(ligado ? row.id : null);
                          if (!ligado) setAlvo(null);
                        }}
                        onCronometro={() => void cronometro(row.id)}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2.5">
        {FOLLOWUP_STATUSES.map((status) => (
          <span key={status} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span
              aria-hidden
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: FOLLOWUP_STATUS_COLOR[status] }}
            />
            {FOLLOWUP_STATUS_LABEL[status]}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Um cartão.
 *
 * `div` com papel de botão, e não `<button>`: o cartão tem o botão do
 * cronômetro dentro, e botão dentro de botão é HTML inválido — o navegador
 * desmancha a árvore e o clique interno para de funcionar.
 */
function Cartao({
  row,
  status,
  hoje,
  quinzenal,
  ocupado,
  travado,
  arrastando,
  onAbrir,
  onSeta,
  onArrastar,
  onCronometro,
}: {
  row: FollowUpRow;
  status: FollowUpStatusValue;
  hoje: string;
  quinzenal: boolean;
  ocupado: boolean;
  travado: boolean;
  arrastando: boolean;
  onAbrir: () => void;
  onSeta: (passo: 1 | -1) => void;
  onArrastar: (ligado: boolean) => void;
  onCronometro: () => void;
}) {
  const contando = row.timerStartedAt !== null;
  // O total FECHADO (sem o trecho que corre agora): o trecho aberto é o
  // `Cronometro` ao lado, que anda de segundo em segundo. Somar os dois num
  // número só daria um valor congelado no instante da consulta, ao lado de um
  // relógio andando — duas verdades diferentes no mesmo cartão.
  const fechado = tempoTotal(row.movements, null, 0);
  const vencido = quinzenal && row.reviewOn !== null && row.reviewOn < hoje && status !== "ENTREGUE";

  return (
    <article
      role="button"
      tabIndex={0}
      data-cartao={row.id}
      draggable={!travado}
      aria-label={`${row.collaboratorName}, conversa de ${row.heldOn.split("-").reverse().join("/")}`}
      onClick={onAbrir}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onAbrir();
          return;
        }
        const passo = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (passo === 0) return;
        e.preventDefault();
        onSeta(passo);
      }}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", row.id);
        e.dataTransfer.effectAllowed = "move";
        onArrastar(true);
      }}
      onDragEnd={() => onArrastar(false)}
      className={cn(
        "cursor-grab rounded-lg border border-border bg-secondary p-3 text-left transition-all active:cursor-grabbing",
        "hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        arrastando && "opacity-40",
        ocupado && "opacity-60",
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className="font-data text-[11px] leading-none text-muted-foreground">
          {row.heldOn.split("-").reverse().join("/")}
        </span>
        {ocupado && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      <div className="mt-1.5 flex items-center gap-2">
        {/* 28px: o disco é a única pista de quem é o cartão numa varredura da
            coluna, e com duas iniciais em 10px ele pedia aproximação. */}
        <Avatar name={row.collaboratorName} size="h-7 w-7" textSize="text-[11px]" />
        <p className="line-clamp-2 min-w-0 flex-1 text-sm font-semibold leading-snug text-foreground">
          {row.collaboratorName}
        </p>
      </div>

      {vencido && (
        <p className="mt-2 flex items-center gap-0.5 text-[11px] font-semibold text-destructive">
          <CalendarClock className="h-3 w-3" aria-hidden />
          reavaliar {row.reviewOn!.split("-").reverse().join("/")}
        </p>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
          <Timer className="h-3 w-3 shrink-0" aria-hidden />
          {fechado > 0 && <span className="font-data">{formatarDuracao(fechado)}</span>}
          {contando && (
            <>
              {fechado > 0 && <span aria-hidden>+</span>}
              <Cronometro desde={Date.parse(row.timerStartedAt!)} />
            </>
          )}
          {fechado === 0 && !contando && <span>—</span>}
          <span className="sr-only">
            {contando ? "contagem em andamento" : `tempo de execução ${formatarDuracao(fechado)}`}
          </span>
        </span>

        {/* O botão para o clique ANTES de chegar ao cartão: sem isto, acionar
            o cronômetro abriria a ficha junto. */}
        <Button
          variant="outline"
          size="sm"
          className="h-7 shrink-0 px-2"
          disabled={travado}
          onClick={(e) => {
            e.stopPropagation();
            onCronometro();
          }}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {contando ? (
            <>
              <Pause className="h-3 w-3" aria-hidden />
              Pausar
            </>
          ) : (
            <>
              <Play className="h-3 w-3" aria-hidden />
              Iniciar
            </>
          )}
        </Button>
      </div>
    </article>
  );
}
