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
 * status e papel (mesma regra do Build.Connect), numa linha de pilulas com
 * "Ver" sempre presente (padrao do card de Entregas):
 *   ABERTO      "Atribuir" (motorista, para si) · "Atribuir…" (gestao, para outro)
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

  // Sem `card-hover`: este card nao se move ao passar o mouse.
  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-1.5 font-data text-xs text-muted-foreground">
          {item.code}
          {item.images.length > 0 && (
            <span className="flex items-center gap-0.5">
              <Paperclip className="h-3 w-3" />
              {item.images.length}
            </span>
          )}
        </span>
        <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px]">{item.serviceType}</span>
      </div>

      {/* Partida imediatamente acima do destino: le-se como o trajeto. */}
      <p className="mt-2 text-xs text-muted-foreground">
        <span className="text-[10px] uppercase tracking-wide">Partida</span> · {item.originLabel}
      </p>
      <h3 className="mt-1 text-sm font-semibold leading-snug">
        <span className="text-[10px] font-normal uppercase tracking-wide text-muted-foreground">Destino</span> · {item.destLabel}
      </h3>

      <p className="mt-2 truncate text-xs">
        <span className="text-muted-foreground">Solicitante:</span> {item.requesterName}
        {item.requesterSector ? ` · ${item.requesterSector}` : ""}
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">Solicitado em {dataHora(item.createdAt)}</p>
      {item.driverName && (
        <p className="mt-1 text-xs">
          <span className="text-muted-foreground">Responsável:</span> {item.driverName}
          {isMine && <span className="text-motorista"> (você)</span>}
        </p>
      )}

      {/* GPS em rota fica acima das acoes: e um estado, nao um botao. */}
      {status === "EM_ROTA" && podeDirigir && (
        <div className="mt-3">
          <RouteController requestId={item.id} started />
        </div>
      )}

      {/* Acoes em pilula, lado a lado, dividindo a largura — mesmo padrao do
          card de Entregas. "Ver" abre o detalhe (descricao completa, fotos,
          historico) e esta em toda coluna. */}
      <div className="mt-3 flex items-center gap-2">
        <Button variant="outline" className="h-11 flex-1 px-2" onClick={() => p.onOpen(item)}>
          <Eye className="h-4 w-4" />
          <span className="truncate">Ver</span>
        </Button>

        {status === "ABERTO" && p.canClaim && (
          <Button
            variant="motorista"
            className="h-11 flex-1 px-2"
            onClick={() => p.onClaim(item)}
            title="Atribuir para mim"
          >
            <UserPlus className="h-4 w-4" />
            <span className="truncate">Atribuir</span>
          </Button>
        )}
        {status === "ABERTO" && p.isManager && (
          <Button
            variant="outline"
            className="h-11 flex-1 px-2"
            onClick={() => p.onAssignOther(item)}
            title="Atribuir para outro motorista"
          >
            <UserCog className="h-4 w-4" />
            <span className="truncate">{p.canClaim ? "Atribuir…" : "Atribuir"}</span>
          </Button>
        )}

        {status === "ATRIBUIDO" && podeDirigir && (
          <RouteController requestId={item.id} started={false} className="min-w-0 flex-1" />
        )}
        {status === "ATRIBUIDO" && (isMine || p.isManager) && (
          <Button
            variant="outline"
            className="h-11 flex-1 px-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => p.onUnassign(item)}
          >
            <UserMinus className="h-4 w-4" />
            <span className="truncate">Desatribuir</span>
          </Button>
        )}

        {status === "EM_ROTA" && podeDirigir && (
          <Button variant="motorista" className="h-11 flex-1 px-2" onClick={() => p.onComplete(item)}>
            <CheckCircle2 className="h-4 w-4" />
            <span className="truncate">Concluir</span>
          </Button>
        )}

        {status === "CONCLUIDO" && (
          <div className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-motorista/10 text-sm font-medium text-motorista">
            <CheckCircle2 className="h-4 w-4" />
            <span className="truncate">Concluído{item.distanceKm ? ` · ${item.distanceKm} km` : ""}</span>
          </div>
        )}
      </div>

      {status === "ATRIBUIDO" && !isMine && !p.isManager && !p.canActAsDriver && (
        <p className="mt-2 text-center text-[11px] text-muted-foreground">Atribuído a outra pessoa.</p>
      )}
      {status === "EM_ROTA" && !podeDirigir && (
        <p className="mt-2 text-center text-[11px] text-muted-foreground">Corrida em andamento.</p>
      )}
      {status === "CONCLUIDO" && (
        <p className="mt-2 text-center text-[11px] text-muted-foreground">Sai do quadro em 15 min.</p>
      )}

      {p.isManager && status !== "CONCLUIDO" && status !== "CANCELADO" && (
        <Button
          size="sm"
          variant="ghost"
          className="mt-2 w-full text-destructive hover:text-destructive"
          onClick={() => p.onCancel(item)}
        >
          <Ban className="h-3.5 w-3.5" /> Cancelar chamado
        </Button>
      )}
    </article>
  );
}
