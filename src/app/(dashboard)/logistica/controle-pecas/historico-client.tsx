"use client";

import { useMemo, useState } from "react";
import { History, Search, ChevronRight, X } from "lucide-react";
import type { PieceStatus } from "@prisma/client";
import { PIECE_LABEL } from "@/lib/piece-control";
import { OrderDetailModal } from "@/components/shared/order-detail-modal";

/**
 * HISTÓRICO DO CONTROLE DE PEÇAS
 * ---------------------------------------------------------------------------
 * Consulta dos pedidos que atingiram o status "Finalizado" — inclusive os que
 * já saíram do quadro pela retenção de 30 dias. Nada é apagado no arquivamento;
 * esta é a tela que dá acesso ao que foi arquivado.
 *
 * Também é onde a trilha de PieceMovement finalmente aparece na interface: até
 * então os movimentos eram gravados e nunca exibidos. Cada linha abre a
 * sequência completa (de/para, quem moveu, quando e a observação).
 */

export interface MovimentoPeca {
  id: string;
  fromStatus: PieceStatus | null;
  toStatus: PieceStatus;
  note: string | null;
  autor: string | null;
  createdAt: string; // ISO
}

export interface HistoricoPeca {
  orderId: string;
  orderNumber: string;
  comandaNumber: string | null;
  customerName: string;
  sellerName: string;
  pieceCount: number;
  /** ISO da última entrada em FINALIZADO. */
  finalizadoEm: string;
  finalizadoPor: string | null;
  /** true quando já passou dos 30 dias e saiu do quadro operacional. */
  arquivado: boolean;
  movimentos: MovimentoPeca[];
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function HistoricoPecas({
  itens,
  onClose,
}: {
  itens: HistoricoPeca[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [expandido, setExpandido] = useState<string | null>(null);
  const [detalheId, setDetalheId] = useState<string | null>(null);

  const lista = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return itens;
    return itens.filter((i) =>
      [i.orderNumber, i.comandaNumber, i.customerName, i.sellerName]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [itens, query]);

  return (
    <>
      <div
        className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          className="animate-scale-in flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-border bg-card p-5 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <History className="h-5 w-5 text-distribuicao" /> Histórico de Peças
              </h2>
              <p className="text-sm text-muted-foreground">
                Pedidos que chegaram em &quot;Finalizado&quot;, incluindo os já arquivados.
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="text-2xl leading-none text-muted-foreground"
            >
              ×
            </button>
          </div>

          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-8 text-sm"
              placeholder="Buscar comanda, pedido, cliente ou vendedora..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Limpar busca"
                className="absolute right-2 top-2 rounded p-0.5 text-muted-foreground hover:bg-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="kanban-scroll -mr-1 flex-1 space-y-2 overflow-y-auto pr-1">
            {lista.length === 0 && (
              <p className="rounded-xl border border-dashed border-border/60 py-10 text-center text-sm text-muted-foreground/60">
                {itens.length === 0
                  ? "Nenhuma peça finalizada até o momento."
                  : "Nenhum registro para esta busca."}
              </p>
            )}

            {lista.map((item) => {
              const aberto = expandido === item.orderId;
              return (
                <div key={item.orderId} className="rounded-xl border border-border bg-background/40 p-3">
                  <button
                    type="button"
                    onClick={() => setExpandido(aberto ? null : item.orderId)}
                    className="flex w-full items-start justify-between gap-3 text-left"
                  >
                    <div className="min-w-0">
                      <p className="font-data flex items-center gap-1.5 text-sm font-semibold">
                        <ChevronRight
                          className={`h-4 w-4 shrink-0 transition-transform ${aberto ? "rotate-90" : ""}`}
                        />
                        Pedido {item.orderNumber}
                        {item.comandaNumber && ` · Comanda ${item.comandaNumber}`}
                      </p>
                      <p className="truncate pl-6 text-sm">{item.customerName}</p>
                      <p className="pl-6 text-xs text-muted-foreground">
                        Vendedora: {item.sellerName}
                        {item.pieceCount > 0 && ` · ${item.pieceCount} peça(s)`}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:text-violet-300">
                        Finalizado em {fmt(item.finalizadoEm)}
                      </span>
                      {item.finalizadoPor && (
                        <span className="text-[11px] text-muted-foreground">
                          por {item.finalizadoPor}
                        </span>
                      )}
                      {item.arquivado && (
                        <span className="text-[11px] text-muted-foreground/70">Arquivado</span>
                      )}
                    </div>
                  </button>

                  {aberto && (
                    <div className="mt-3 border-t border-border pt-3">
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Movimentações da peça
                      </p>
                      <ul className="space-y-1.5">
                        {item.movimentos.map((m) => (
                          <li
                            key={m.id}
                            className="rounded-md bg-secondary/40 px-2 py-1.5 text-xs leading-snug"
                          >
                            <p className="font-medium">
                              {m.fromStatus ? PIECE_LABEL[m.fromStatus] : "Entrada no controle"}
                              {" → "}
                              {PIECE_LABEL[m.toStatus]}
                            </p>
                            {m.note && <p className="mt-0.5">{m.note}</p>}
                            <p className="mt-0.5 text-muted-foreground">
                              {fmt(m.createdAt)}
                              {m.autor && ` · por ${m.autor}`}
                            </p>
                          </li>
                        ))}
                      </ul>

                      <button
                        type="button"
                        onClick={() => setDetalheId(item.orderId)}
                        className="mt-2 text-xs font-medium text-distribuicao underline"
                      >
                        Ver detalhes do pedido
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <p className="mt-3 shrink-0 text-[11px] text-muted-foreground">
            {lista.length} de {itens.length} registro(s).
          </p>
        </div>
      </div>

      {detalheId && <OrderDetailModal orderId={detalheId} onClose={() => setDetalheId(null)} />}
    </>
  );
}
