"use client";

import { Clock } from "lucide-react";
import { STATUS_LABEL } from "@/lib/order-flow";
import { formatDuracao } from "@/lib/pendencias";
import type { AtrasoPedido } from "@/lib/atrasos";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { shortName } from "@/lib/utils";

/**
 * Listagem do Relatório de Atrasos.
 *
 * Client component por um motivo só: o contêiner roda em UTC, e a data da
 * justificativa precisa sair no fuso de quem lê (mesmo recurso da listagem de
 * pendências). Não há estado nem interação — a justificativa é curta e sai
 * inteira, sem expandir.
 */
function fmt(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AtrasosList({ pedidos }: { pedidos: AtrasoPedido[] }) {
  return (
    <div className="space-y-3">
      {pedidos.map((p) => (
        <Card key={p.id} className="border-amber-500/50">
          <CardContent className="space-y-3 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">
                  Pedido {p.orderNumber}
                  {p.comandaNumber ? (
                    <span className="text-muted-foreground"> · Comanda {p.comandaNumber}</span>
                  ) : (
                    <span className="text-muted-foreground"> · sem comanda</span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground" title={p.customerName}>
                  {shortName(p.customerName)} (Cód. {p.customerCode}) · Vendedora: {p.sellerName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.orderTypeName}
                  {p.originStoreName ? ` · ${p.originStoreName}` : ""} · criado em{" "}
                  {fmt(p.criadoEm)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-500">
                  {p.justificativas.length} atraso(s)
                </span>
                <StatusBadge status={p.status} />
              </div>
            </div>

            <ul className="space-y-2">
              {p.justificativas.map((j) => (
                <li key={j.id} className="rounded-lg border border-amber-500/30 bg-amber-50/60 p-3 dark:bg-amber-950/20">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-500">
                      {STATUS_LABEL[j.status]} · {j.setor}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-500">
                      <Clock className="h-3.5 w-3.5" aria-hidden />
                      Atrasou {formatDuracao(j.minutesLate)}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{j.reason}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Justificado em {fmt(j.createdAt)}
                    {j.autor ? ` · por ${j.autor}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
