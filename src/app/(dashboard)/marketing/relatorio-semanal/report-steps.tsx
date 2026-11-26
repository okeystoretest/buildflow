"use client";

import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs } from "@/components/ui/tabs";
import type { WeeklyReportDetail } from "@/lib/relatorio-semanal-data";
import { useSalvarPendencias } from "./pendencias";
import { ResumoSection } from "./resumo-section";
import { AgendaSection, DeliveriesSection, MetricsSection, OkrsSection } from "./report-sections";
import { BlockersSection } from "./blockers-section";

/** Os seis blocos do relatório, na ordem em que se preenchem. */
export const PASSOS = [
  { id: "resumo", label: "1 · Resumo" },
  { id: "entregas", label: "2 · Entregas" },
  { id: "metricas", label: "3 · Canais e métricas" },
  { id: "okrs", label: "4 · OKRs" },
  { id: "bloqueios", label: "5 · Bloqueios" },
  { id: "pauta", label: "6 · One-on-one" },
] as const;

/**
 * Os seis blocos, UM POR VEZ.
 *
 * Um por vez, e não os seis empilhados, porque a página inteira de uma sexta
 * cansa antes do terceiro bloco: "Próximo" avança, e a barra de cima mostra
 * onde se está e deixa pular direto para qualquer bloco.
 *
 * OS SEIS FICAM MONTADOS; só o do passo atual aparece. Cada bloco guarda o que
 * foi digitado em estado local, e desmontá-lo ao avançar jogaria fora o texto
 * ainda não salvo — e o tiraria do registro de pendências.
 *
 * AVANÇAR GRAVA O BLOCO. Sem isso, "Próximo" seria o melhor lugar possível
 * para perder texto: no modal da semana nova, concluir fecha a janela e
 * levaria tudo o que não tivesse passado pelo "Salvar" de cada bloco.
 *
 * `onConcluir`, quando vem, é o MODO MODAL: o último passo troca "Próximo" por
 * "Salvar", e a barra de progresso aparece.
 */
export function ReportSteps({
  detail,
  onConcluir,
}: {
  detail: WeeklyReportDetail;
  onConcluir?: () => void;
}) {
  const [passo, setPasso] = useState(0);
  const [indo, setIndo] = useState(false);
  const barra = useRef<HTMLDivElement>(null);
  const salvarPendencias = useSalvarPendencias();

  async function ir(indice: number) {
    if (indo) return;
    // SÓ AO AVANÇAR: voltar não perde nada (os blocos seguem montados), e
    // gravar na volta prenderia quem está tentando sair de um bloco cujo
    // salvamento falhou.
    if (indice > passo) {
      setIndo(true);
      const ok = await salvarPendencias();
      setIndo(false);
      if (!ok) return;
    }
    setPasso(indice);
    // Quem chegou ao fim de uma tabela longa está com a barra de passos fora
    // da tela; sem isto o bloco seguinte abriria acima do campo visível.
    barra.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function concluir() {
    if (indo || !onConcluir) return;
    setIndo(true);
    const ok = await salvarPendencias();
    setIndo(false);
    if (ok) onConcluir();
  }

  const ultimo = passo === PASSOS.length - 1;

  const blocos = [
    <ResumoSection key="resumo" detail={detail} />,
    <DeliveriesSection key="entregas" reportId={detail.id} deliveries={detail.deliveries} />,
    <MetricsSection key="metricas" reportId={detail.id} metrics={detail.metrics} />,
    <OkrsSection key="okrs" reportId={detail.id} okrs={detail.okrs} />,
    <BlockersSection key="bloqueios" reportId={detail.id} blockers={detail.blockers} />,
    <AgendaSection key="pauta" reportId={detail.id} agenda={detail.agenda} />,
  ];

  return (
    <div className="space-y-4">
      {onConcluir && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-semibold text-foreground">{PASSOS[passo]!.label}</span>
            <span className="text-muted-foreground">
              Passo {passo + 1} de {PASSOS.length}
            </span>
          </div>
          <Progress
            value={((passo + 1) / PASSOS.length) * 100}
            label={`Passo ${passo + 1} de ${PASSOS.length}`}
          />
        </div>
      )}

      <div ref={barra}>
        <Tabs
          items={PASSOS}
          value={PASSOS[passo]!.id}
          onValueChange={(id) => void ir(PASSOS.findIndex((p) => p.id === id))}
        />
      </div>

      {blocos.map((bloco, i) => (
        <div key={PASSOS[i]!.id} className={i === passo ? "" : "hidden"}>
          {bloco}
        </div>
      ))}

      <div className="flex items-center justify-between gap-2">
        <Button variant="secondary" onClick={() => void ir(passo - 1)} disabled={passo === 0 || indo}>
          <ArrowLeft className="h-4 w-4" />
          Anterior
        </Button>

        {ultimo && onConcluir ? (
          <Button onClick={concluir} disabled={indo}>
            {indo && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        ) : (
          <Button onClick={() => void ir(passo + 1)} disabled={ultimo || indo}>
            {indo && <Loader2 className="h-4 w-4 animate-spin" />}
            Próximo
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
