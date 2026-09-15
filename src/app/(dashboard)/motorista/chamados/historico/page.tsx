import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { listHistory } from "@/lib/transport/queries";
import { TRANSPORT_STATUS_STYLE } from "@/lib/transport/status";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

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

export default async function ChamadosHistoricoPage() {
  const session = await requireRole(["MOTORISTA", "LOGISTICA", "GESTAO"]);
  const isManager = session.role === "LOGISTICA" || session.role === "GESTAO";
  const todos = await listHistory(200);
  const items = isManager ? todos : todos.filter((i) => i.driverId === session.userId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-motorista">Histórico de chamados</h1>
          <p className="text-sm text-muted-foreground">Concluídos e cancelados, mais recentes primeiro.</p>
        </div>
        <Link
          href="/motorista/chamados"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2">Serviço</th>
              <th className="px-3 py-2">Solicitante</th>
              <th className="px-3 py-2">Motorista</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Encerrado</th>
              <th className="px-3 py-2">Km</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const s = TRANSPORT_STATUS_STYLE[i.status];
              return (
                <tr key={i.id} className="border-t border-border">
                  <td className="px-3 py-2 font-data text-xs">{i.code}</td>
                  <td className="px-3 py-2">{i.serviceType}</td>
                  <td className="px-3 py-2">{i.requesterName}</td>
                  <td className="px-3 py-2">{i.driverName ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs", s.badge)}>{s.label}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{dataHora(i.finishedAt)}</td>
                  <td className="px-3 py-2 text-xs">{i.distanceKm ?? "—"}</td>
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
    </div>
  );
}
