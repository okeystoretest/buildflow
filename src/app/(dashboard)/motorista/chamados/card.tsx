"use client";

import { Eye, UserPlus, UserCog, UserMinus, Ban, Paperclip, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TransportView } from "@/lib/transport/queries";
import { RouteController } from "./route-controller";

export interface TransportCardProps {
  item: TransportView;
  currentUserId: string;
  /** LOGISTICA/GESTAO: atribuir a outro, desatribuir de terceiros, cancelar. */
  isManager: boolean;
  /** GESTAO: age no lugar do motorista (iniciar, concluir). */
  canActAsDriver: boolean;
  /** MOTORISTA/GESTAO: assumir para si. */
  canClaim: boolean;
  onOpen: (item: TransportView) => void;
  onClaim: (item: TransportView) => void;
  onAssignOther: (item: TransportView) => void;
  onUnassign: (item: TransportView) => void;
  onComplete: (item: TransportView) => void;
  onCancel: (item: TransportView) => void;
}

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/**
 * Card do quadro de chamados. Sem arrastar: cada coluna expoe botoes conforme
 * status e papel (mesma regra do Build.Connect):
 *   ABERTO      "Atribuir para mim" (motorista) · "Atribuir para…" (gestao)
 *   ATRIBUIDO   "Iniciar rota" (dono) · "Desatribuir" (dono ou gestao)
 *   EM_ROTA     GPS ativo · "Concluir" (dono)
 *   CONCLUIDO   somente leitura
 * Gestao tem "Cancelar" em qualquer status nao final.
 */
export function TransportCard(p: TransportCardProps) {
  const { item } = p;
  const isMine = item.driverId === p.currentUserId;
  const status = item.status;
  const podeDirigir = isMine || p.canActAsDriver;

  return (
    <article className="card-hover rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="font-data text-xs text-muted-foreground">{item.code}</span>
        <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px]">{item.serviceType}</span>
      </div>
      <h3 className="mt-2 text-sm font-semibold leading-snug">{item.destLabel}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">De: {item.originLabel}</p>
      <p className="mt-2 truncate text-xs">
        <span className="text-muted-foreground">Solicitante:</span> {item.requesterName}
        {item.requesterSector ? ` · ${item.requesterSector}` : ""}
      </p>
      {item.driverName && (
        <p className="mt-1 text-xs">
          <span className="text-muted-foreground">Responsável:</span> {item.driverName}
          {isMine && <span className="text-motorista"> (você)</span>}
        </p>
      )}
      <div className="mt-3 flex items-center justify-between border-t border-border pt-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          {dataHora(item.createdAt)}
          {item.images.length > 0 && (
            <span className="flex items-center gap-0.5">
              <Paperclip className="h-3 w-3" />
              {item.images.length}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => p.onOpen(item)}
          className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-secondary hover:text-foreground"
        >
          <Eye className="h-3 w-3" /> Detalhes
        </button>
      </div>

      <div className="mt-2.5 space-y-2 border-t border-border pt-2.5">
        {status === "ABERTO" && (
          <>
            {p.canClaim && (
              <Button size="sm" className="w-full bg-motorista text-white hover:bg-motorista/90" onClick={() => p.onClaim(item)}>
                <UserPlus className="h-3.5 w-3.5" /> Atribuir para mim
              </Button>
            )}
            {p.isManager && (
              <Button size="sm" variant="outline" className="w-full" onClick={() => p.onAssignOther(item)}>
                <UserCog className="h-3.5 w-3.5" /> Atribuir para…
              </Button>
            )}
          </>
        )}
        {status === "ATRIBUIDO" && (
          <>
            {podeDirigir && <RouteController requestId={item.id} started={false} />}
            {(isMine || p.isManager) && (
              <Button size="sm" variant="ghost" className="w-full" onClick={() => p.onUnassign(item)}>
                <UserMinus className="h-3.5 w-3.5" /> Desatribuir
              </Button>
            )}
            {!isMine && !p.isManager && !p.canActAsDriver && (
              <p className="text-center text-[11px] text-muted-foreground">Atribuído a outra pessoa.</p>
            )}
          </>
        )}
        {status === "EM_ROTA" && (
          <>
            {podeDirigir && <RouteController requestId={item.id} started />}
            {podeDirigir && (
              <Button size="sm" className="w-full bg-motorista text-white hover:bg-motorista/90" onClick={() => p.onComplete(item)}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Concluir com comprovante
              </Button>
            )}
            {!podeDirigir && <p className="text-center text-[11px] text-muted-foreground">Corrida em andamento.</p>}
          </>
        )}
        {status === "CONCLUIDO" && (
          <p className="text-center text-[11px] text-muted-foreground">
            Concluído{item.distanceKm ? ` · ${item.distanceKm} km` : ""}. Sai do quadro em 15 min.
          </p>
        )}
        {p.isManager && status !== "CONCLUIDO" && status !== "CANCELADO" && (
          <Button size="sm" variant="ghost" className="w-full text-destructive hover:text-destructive" onClick={() => p.onCancel(item)}>
            <Ban className="h-3.5 w-3.5" /> Cancelar chamado
          </Button>
        )}
      </div>
    </article>
  );
}
