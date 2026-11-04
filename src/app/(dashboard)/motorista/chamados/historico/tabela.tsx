"use client";

import { useState } from "react";
import type { TransportView } from "@/lib/transport/queries";
import { TRANSPORT_STATUS_STYLE } from "@/lib/transport/status";
import { cn } from "@/lib/utils";
import { DetailModal } from "../detail-modal";

function dataHora(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
}

export function HistoricoTabela({ items }: { items: TransportView[] }) {
  const [selected, setSelected] = useState<TransportView | null>(null);

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-foreground">
            <tr>
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2">Serviço</th>
              <th className="px-3 py-2">Solicitante</th>
              <th className="px-3 py-2">Motorista</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Encerrado</th>
              <th className="px-3 py-2 text-right">Km</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const s = TRANSPORT_STATUS_STYLE[i.status];
              return (
                <tr
                  key={i.id}
                  onClick={() => setSelected(i)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(i);
                    }
                  }}
                  aria-label={`Ver detalhes do chamado ${i.code}`}
                  className="cursor-pointer border-t border-border hover:bg-muted/50"
                >
                  <td className="px-3 py-2 font-data text-xs">{i.code}</td>
                  <td className="px-3 py-2">{i.serviceType}</td>
                  <td className="px-3 py-2">{i.requesterName}</td>
                  <td className="px-3 py-2">{i.driverName ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs", s.badge)}>{s.label}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{dataHora(i.finishedAt)}</td>
                  <td className="px-3 py-2 text-right text-xs">{i.distanceKm ?? "—"}</td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  Nenhum chamado encerrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <DetailModal item={selected} onClose={() => setSelected(null)} />
    </>
  );
}
