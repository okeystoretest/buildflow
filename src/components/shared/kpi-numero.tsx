import { cn } from "@/lib/utils";

/**
 * Um número do topo de um quadro Kanban.
 *
 * Veio do quadro do Relatório Semanal, onde era o `Numero` local, porque a
 * especificação do Acompanhamento (27/11/2026) pede "a mesma proposta de
 * design do Kanban de Relatório Semanal, incluindo os KPIs". Com duas cópias,
 * as duas telas divergem no primeiro ajuste de tom — e aí deixam de ser a
 * mesma proposta.
 *
 * O destaque só pinta quando há o que destacar: "Atrasadas: 0" em âmbar
 * chamaria atenção para a ausência de problema.
 */
export function KpiNumero({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: number;
  destaque?: "ok" | "alerta";
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-[11px] text-muted-foreground">{rotulo}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-bold tracking-tight",
          destaque === "ok" && valor > 0 && "text-emerald-700 dark:text-emerald-300",
          destaque === "alerta" && valor > 0 && "text-amber-700 dark:text-amber-300",
          (!destaque || valor === 0) && "text-foreground",
        )}
      >
        {valor}
      </p>
    </div>
  );
}
