"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/shared/modal";
import { excluirRelatorio } from "@/lib/actions/relatorio-semanal";
import { formatarData } from "@/lib/relatorio-semanal-labels";
import type { WeeklyReportDetail } from "@/lib/relatorio-semanal-data";
import { PendenciasProvider, useSalvarPendencias } from "./pendencias";
import { ReportSteps } from "./report-steps";

/**
 * A semana aberta para EDITAR.
 *
 * Não existe enviar nem aprovar: a semana se preenche e se salva, e a reunião
 * lê o que está salvo.
 *
 * O "Salvar" do cabeçalho grava TODO bloco com algo pendente. Cada bloco
 * também tem o seu — uma sexta interrompida no meio das métricas não pode
 * perder as entregas já respondidas.
 *
 * TODOS OS BLOCOS FICAM MONTADOS, e a aba só esconde. Desmontar o bloco
 * escondido jogaria fora o que foi digitado nele e, pior, o tiraria do
 * registro de pendências — o "Salvar" do cabeçalho deixaria de enxergá-lo.
 *
 * Os SEIS blocos da planilha estão aqui. O que falta do porte é o fluxo em
 * etapas da semana nova, que reusa estes mesmos blocos página a página.
 */
export function ReportEditor({
  detail,
  onBack,
}: {
  detail: WeeklyReportDetail;
  onBack: () => void;
}) {
  const router = useRouter();
  const [excluindo, setExcluindo] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function remover() {
    if (excluindo) return;
    setExcluindo(true);
    setErro(null);
    const r = await excluirRelatorio({ reportId: detail.id });
    setExcluindo(false);
    if (!r.ok) {
      setErro(r.error);
      return;
    }
    setConfirmar(false);
    router.refresh();
    onBack();
  }

  return (
    <PendenciasProvider>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Button variant="ghost" size="sm" onClick={onBack} className="-ml-3 mb-1">
              <ArrowLeft className="h-3.5 w-3.5" />
              Todas as semanas
            </Button>
            <h2 className="text-lg font-semibold text-foreground">Semana {detail.weekNumber}</h2>
            <p className="text-xs text-muted-foreground">
              {formatarData(detail.periodStart)} a {formatarData(detail.periodEnd)}
              {detail.authorName && ` · ${detail.authorName}`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <SalvarTudo />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Excluir a semana"
              className="text-destructive"
              onClick={() => setConfirmar(true)}
              disabled={excluindo}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {erro && <p className="text-xs text-destructive">{erro}</p>}

        <ReportSteps detail={detail} />

        {confirmar && (
          <Modal onClose={() => !excluindo && setConfirmar(false)} largura="max-w-md">
            <h2 className="text-lg font-semibold text-foreground">Excluir a semana</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Confirma a exclusão da{" "}
              <span className="font-semibold text-foreground">semana {detail.weekNumber}</span>? As
              entregas, as métricas, os OKRs, os bloqueios e a pauta vão com ela. Esta ação não pode
              ser desfeita.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmar(false)} disabled={excluindo}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={remover} disabled={excluindo}>
                {excluindo && <Loader2 className="h-4 w-4 animate-spin" />}
                Excluir
              </Button>
            </div>
          </Modal>
        )}
      </div>
    </PendenciasProvider>
  );
}

/** O "Salvar" do cabeçalho: grava todo bloco que tem algo pendente. */
function SalvarTudo() {
  const salvarPendencias = useSalvarPendencias();
  const [estado, setEstado] = useState<"parado" | "salvando" | "salvo">("parado");

  return (
    <div className="flex items-center gap-2">
      {estado === "salvo" && (
        <span className="flex items-center gap-1 text-xs text-primary">
          <Check className="h-3.5 w-3.5" />
          Salvo
        </span>
      )}
      <Button
        onClick={async () => {
          if (estado === "salvando") return;
          setEstado("salvando");
          const ok = await salvarPendencias();
          // O erro quem mostra é o bloco que recusou, em vermelho ao lado do
          // campo — e não uma linha genérica aqui em cima.
          setEstado(ok ? "salvo" : "parado");
        }}
        disabled={estado === "salvando"}
      >
        {estado === "salvando" && <Loader2 className="h-4 w-4 animate-spin" />}
        Salvar
      </Button>
    </div>
  );
}
