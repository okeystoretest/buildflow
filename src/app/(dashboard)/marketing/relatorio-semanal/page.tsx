import { NotebookPen } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { getRelatorioSemanalData } from "@/lib/relatorio-semanal-data";
import { ReportCard } from "./report-card";

/**
 * RELATÓRIO SEMANAL DO MARKETING — a lista de semanas.
 *
 * SÓ GESTAO: o buildflow não tem papel de Marketing, e criar um custaria
 * migração do enum `Role` para um módulo de uma ferramenta. Quem preenche o
 * relatório é a gestão (decisão de 24/11/2026).
 *
 * O título e a descrição da tela NÃO são desenhados aqui — a barra superior os
 * lê do `NAV`, como em toda ferramenta de menu.
 *
 * A PÁGINA VIVE NA URL (`?page=`), como no resto da casa, e não em estado de
 * componente. No Build.Connect ela é estado local, e isso custou um defeito
 * lá: criar uma semana estando na página 2 deixava a pessoa na página 2
 * enquanto a semana nova entrava na 1, invisível. Com a página na URL, quem
 * decide é a navegação.
 *
 * EM CONSTRUÇÃO: esta fatia do porte entrega a LISTA. Abrir a semana para
 * leitura, o editor em seis passos e o quadro Kanban entram nas próximas — e
 * é por isso que o card ainda não clica.
 */
export const dynamic = "force-dynamic";

/** Seis por página: duas fileiras de três na largura da leitura. */
const POR_PAGINA = 6;

export default async function RelatorioSemanalPage(props: {
  searchParams: Promise<{ page?: string }>;
}) {
  const searchParams = await props.searchParams;
  await requireRole(["GESTAO"]);

  const { reports } = await getRelatorioSemanalData();

  const totalPaginas = Math.max(1, Math.ceil(reports.length / POR_PAGINA));
  // Grampeia a página ao intervalo que existe: `?page=99` numa lista de duas
  // páginas mostraria uma tela vazia que parece defeito.
  const page = Math.min(Math.max(1, Number(searchParams.page ?? 1) || 1), totalPaginas);
  const daPagina = reports.slice((page - 1) * POR_PAGINA, page * POR_PAGINA);

  if (reports.length === 0) {
    return (
      <EmptyState
        icon={<NotebookPen className="h-6 w-6" />}
        title="Nenhuma semana registrada"
        description="A primeira semana do Marketing aparece aqui assim que for preenchida."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {daPagina.map((r) => (
          <ReportCard key={r.id} report={r} />
        ))}
      </div>
      <Pagination page={page} perPage={POR_PAGINA} total={reports.length} label="semanas" />
    </div>
  );
}
