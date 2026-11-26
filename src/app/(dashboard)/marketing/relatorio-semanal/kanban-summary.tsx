import { ChevronDown } from "lucide-react";
import { TASK_STATUSES, type KanbanSummary } from "@/lib/relatorio-semanal-math";
import {
  TASK_CATEGORY_LABEL,
  TASK_STATUS_LABEL,
  formatarPercentual,
} from "@/lib/relatorio-semanal-labels";

/**
 * A aba 8 da planilha — "Painel Kanban", o resumo automático.
 *
 * Era uma folha de `COUNTIF`/`COUNTIFS` sobre a aba 7. Aqui é a mesma conta,
 * feita em `relatorio-semanal-math` na leitura: NÃO HÁ NÚMERO GUARDADO para
 * divergir do quadro.
 *
 * Só as DUAS TABELAS moram aqui. Os totais ficam no topo do quadro, onde são
 * lidos antes de se olhar cartão por cartão — repeti-los embaixo seria dizer
 * o mesmo número duas vezes na mesma tela.
 *
 * AS DUAS NASCEM FECHADAS (pedido do dono, 26/11/2026). Elas ficam DEPOIS do
 * quadro, e abertas empurravam as colunas para cima da dobra: quem abre o
 * Kanban vem mexer em cartão, não ler tabela. Fechadas, os dois títulos viram
 * um índice do que há embaixo — e um clique traz a tabela de volta.
 *
 * `<details>` NATIVO, e não um `useState`: este é um componente de SERVIDOR, e
 * abrir uma gaveta não vale mandar JavaScript ao navegador. De graça vêm o
 * teclado, o leitor de tela e o "localizar na página" do próprio navegador,
 * que acha texto dentro da gaveta fechada e a abre.
 */

/** O cabeçalho clicável da gaveta. Mesmo desenho do `<h4>` que ele substituiu. */
function Cabecalho({ children }: { children: React.ReactNode }) {
  return (
    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
      {/* O `<h4>` fica DENTRO do `<summary>`: sem ele a tela perde um nível de
          estrutura, e quem navega por títulos deixa de achar as tabelas. */}
      <h4>{children}</h4>
      <ChevronDown
        className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
        aria-hidden
      />
    </summary>
  );
}

export function KanbanSummaryPanel({ summary }: { summary: KanbanSummary }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <details className="group rounded-xl border border-border bg-card">
        <Cabecalho>Tarefas por status</Cabecalho>
        {/* A borda vai no CONTEÚDO, não no cabeçalho: no cabeçalho ela ficaria
            pendurada embaixo de um título sem nada abaixo quando fechado. */}
        <div className="border-t border-border">
          <table className="w-full border-collapse">
            <thead className="sr-only">
              <tr>
                <th scope="col">Status</th>
                <th scope="col">Quantidade</th>
                <th scope="col">% do total</th>
              </tr>
            </thead>
            <tbody>
              {summary.byStatus.map((linha) => (
                <tr key={linha.status} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2 text-xs text-foreground">{TASK_STATUS_LABEL[linha.status]}</td>
                  <td className="w-20 px-2 py-2 text-right text-xs font-semibold text-foreground">
                    {linha.count}
                  </td>
                  <td className="w-24 px-4 py-2 text-right text-xs text-muted-foreground">
                    {formatarPercentual(linha.share)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <details className="group rounded-xl border border-border bg-card">
        <Cabecalho>Categoria × status</Cabecalho>
        <div className="border-t border-border">
          <div className="kanban-scroll overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Categoria
                  </th>
                  {TASK_STATUSES.map((s) => (
                    <th key={s} scope="col" className="px-1 py-2 text-center text-[11px] font-semibold text-muted-foreground">
                      {TASK_STATUS_LABEL[s]}
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {summary.byCategory.map((linha) => (
                  <tr key={linha.category} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2 text-xs text-foreground">{TASK_CATEGORY_LABEL[linha.category]}</td>
                    {TASK_STATUSES.map((s) => (
                      // O zero fica esmaecido: a linha inteira precisa aparecer
                      // (uma categoria que some esconde que ninguém trabalha
                      // nela), mas o que importa ler são os números que existem.
                      <td key={s} className={`px-1 py-2 text-center text-xs ${linha.counts[s] === 0 ? "text-muted-foreground/50" : "text-foreground"}`}>
                        {linha.counts[s]}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right text-xs font-semibold text-foreground">{linha.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    </div>
  );
}
