"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Segmented } from "@/components/ui/segmented";
import { Pagination } from "@/components/shared/pagination";
import type { WeeklyReportDetail, WeeklyReportListItem } from "@/lib/relatorio-semanal-data";
import type { KanbanSummary, MarketingTaskItem, TaskPerson } from "@/lib/relatorio-semanal-math";
import { KanbanBoard } from "./kanban-board";
import { KanbanSummaryPanel } from "./kanban-summary";
import { NewReportModal } from "./new-report-modal";
import { ReportCard } from "./report-card";
import { ReportEditor } from "./report-editor";
import { ReportViewModal } from "./report-view-modal";

type Vista = "semanas" | "kanban";

/**
 * As duas vistas da ferramenta, que eram as dez abas da planilha: as SEMANAS
 * (abas 1 a 6, uma por relatório) e o KANBAN (abas 7 e 8, permanente).
 *
 * QUAL SEMANA ESTÁ ABERTA VEM DA URL (`?semana=`): o detalhe é carregado no
 * servidor, e recarregar a página no meio de uma sexta tem de voltar para a
 * mesma semana.
 *
 * O MODO (ler ou editar) fica em estado local, não na URL, porque é escolha do
 * clique — o card abre a leitura, o lápis abre a edição. Recarregar volta para
 * a leitura, que é o modo seguro dos dois.
 */
export function Painel({
  reports,
  detail,
  page,
  porPagina,
  total,
  tasks,
  summary,
  people,
}: {
  reports: readonly WeeklyReportListItem[];
  detail: WeeklyReportDetail | null;
  page: number;
  porPagina: number;
  total: number;
  tasks: readonly MarketingTaskItem[];
  summary: KanbanSummary;
  people: readonly TaskPerson[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [vista, setVista] = useState<Vista>("semanas");
  const [modo, setModo] = useState<"ver" | "editar">("ver");
  const [novo, setNovo] = useState(false);

  function abrir(id: string | null, como: "ver" | "editar" = "ver") {
    setModo(como);
    const next = new URLSearchParams(params.toString());
    if (id) next.set("semana", id);
    else next.delete("semana");
    // A página volta para a primeira ao abrir uma semana nova: ela entra em
    // PRIMEIRO na lista, e quem criou estando na página 2 voltaria para uma
    // lista onde ela não aparece.
    if (como === "editar") next.delete("page");
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  // Com uma semana aberta para EDIÇÃO, as vistas saem de cena: o editor é a
  // tela. A leitura é modal, e fica por cima da lista.
  if (detail && modo === "editar") {
    // A `key` força a remontagem ao trocar de semana: o estado do editor nasce
    // em inicializadores de `useState`, e sem ela editar `?semana=` na barra
    // de endereços manteria o formulário anterior sobre o id novo.
    return <ReportEditor key={detail.id} detail={detail} onBack={() => abrir(null)} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-end gap-3">
        {vista === "semanas" && <Button onClick={() => setNovo(true)}>Nova semana</Button>}
      </div>

      <Segmented
        options={[
          { value: "semanas", label: `Semanas (${total})` },
          { value: "kanban", label: `Kanban (${summary.total})` },
        ]}
        value={vista}
        onChange={setVista}
        ariaLabel="Vista do Relatório Semanal"
      />

      {vista === "semanas" &&
        (total === 0 ? (
          <EmptyState
            icon={<NotebookPen className="h-6 w-6" />}
            title="Nenhuma semana registrada"
            description="Crie a semana: ela nasce com a pauta do one-on-one, e as entregas, as métricas e os OKRs você adiciona conforme a semana pede."
            action={<Button onClick={() => setNovo(true)}>Criar a primeira</Button>}
          />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {reports.map((r) => (
                <ReportCard
                  key={r.id}
                  report={r}
                  onOpen={() => abrir(r.id)}
                  onEdit={() => abrir(r.id, "editar")}
                />
              ))}
            </div>
            <Pagination page={page} perPage={porPagina} total={total} label="semanas" />
          </div>
        ))}

      {vista === "kanban" && (
        <div className="space-y-5">
          <KanbanBoard tasks={tasks} summary={summary} people={people} />
          <KanbanSummaryPanel summary={summary} />
        </div>
      )}

      {novo && (
        <NewReportModal onClose={() => setNovo(false)} />
      )}

      {detail && modo === "ver" && (
        <ReportViewModal
          key={detail.id}
          detail={detail}
          onClose={() => abrir(null)}
          onEdit={() => setModo("editar")}
        />
      )}
    </div>
  );
}
