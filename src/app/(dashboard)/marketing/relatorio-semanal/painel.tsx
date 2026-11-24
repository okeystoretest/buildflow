"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Pagination } from "@/components/shared/pagination";
import type { WeeklyReportDetail, WeeklyReportListItem } from "@/lib/relatorio-semanal-data";
import { ReportCard } from "./report-card";
import { ReportEditor } from "./report-editor";
import { ReportViewModal } from "./report-view-modal";

/**
 * A lista de semanas e a ficha de leitura que ela abre.
 *
 * QUAL SEMANA ESTÁ ABERTA VEM DA URL (`?semana=`), não de estado local: o
 * detalhe é carregado no servidor, e recarregar a página no meio de uma sexta
 * tem de voltar para a mesma semana. É a mesma decisão da paginação, um nível
 * acima.
 *
 * Fechar a ficha PRESERVA a página (`?page=`): quem abriu a semana 42 lá da
 * segunda página volta para a segunda página, não para o começo da lista.
 */
export function Painel({
  reports,
  detail,
  page,
  porPagina,
  total,
}: {
  reports: readonly WeeklyReportListItem[];
  detail: WeeklyReportDetail | null;
  page: number;
  porPagina: number;
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  /**
   * O que fazer com a semana que a URL aponta: LER ou EDITAR.
   *
   * Fica aqui, e não na URL, porque é escolha do clique — o card abre a
   * leitura, o lápis abre a edição. Recarregar a página volta para a leitura,
   * que é o modo seguro dos dois.
   */
  const [modo, setModo] = useState<"ver" | "editar">("ver");

  function abrir(id: string | null, como: "ver" | "editar" = "ver") {
    setModo(como);
    const next = new URLSearchParams(params.toString());
    if (id) next.set("semana", id);
    else next.delete("semana");
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  // A edição toma a tela inteira; a leitura é um modal por cima da lista.
  if (detail && modo === "editar") {
    return <ReportEditor detail={detail} onBack={() => abrir(null)} />;
  }

  return (
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

      {detail && <ReportViewModal detail={detail} onClose={() => abrir(null)} />}
    </div>
  );
}
