"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronRight, ChevronLeft } from "lucide-react";
import type { PieceStatus } from "@prisma/client";
import {
  PIECE_COLUMNS,
  PIECE_LABEL,
  PIECE_HEADER,
  PIECE_DOT,
  AGUARDANDO_ENTREGA_LABEL,
  AGUARDANDO_ENTREGA_HEADER,
  AGUARDANDO_ENTREGA_DOT,
  DEVOLVIDO_TTL_MS,
  nextPieceStatus,
  prevPieceStatus,
} from "@/lib/piece-control";
import { setPieceStatus } from "@/lib/actions/pieces";
import { OrderCard, type OrderCardData } from "@/components/shared/order-card";
import { OrderDetailModal } from "@/components/shared/order-detail-modal";

/**
 * Card do Controle de Peças: é o MESMO OrderCardData do Fluxo de Pedidos
 * (para o card renderizar idêntico), acrescido dos campos próprios do módulo.
 */
export interface PecaCard extends OrderCardData {
  pieceStatus: PieceStatus | null;
  /** Entrega registrada? Sem isso, a peça não entra em "Em Uso". */
  entregue: boolean;
  /** ISO da entrada em DEVOLVIDO — base do TTL de 30 min. */
  devolvidoEm: string | null;
}

export function ControlePecasBoard({
  cards,
  canMove,
}: {
  cards: PecaCard[];
  canMove: boolean;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // "Relógio" interno (mesmo padrão do KanbanBoard): reavalia de 30 em 30s
  // quais cards DEVOLVIDO já passaram dos 30 min e devem sumir — sem reload.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const visibleCards = useMemo(() => {
    // 1) Some com DEVOLVIDO que já passou de 30 min desde a devolução.
    const afterTtl = cards.filter((c) => {
      if (c.pieceStatus !== "DEVOLVIDO") return true;
      if (!c.devolvidoEm) return true; // sem timestamp: mantém (não some sozinho)
      return nowTick - new Date(c.devolvidoEm).getTime() < DEVOLVIDO_TTL_MS;
    });
    // 2) Aplica a busca por texto.
    const q = query.trim().toLowerCase();
    if (!q) return afterTtl;
    return afterTtl.filter((c) =>
      [c.comandaNumber, c.orderNumber, c.customerName, c.sellerName]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [cards, query, nowTick]);

  const byPiece = (s: PieceStatus | null) => visibleCards.filter((c) => c.pieceStatus === s);

  function move(card: PecaCard, to: PieceStatus) {
    setError(null);
    start(async () => {
      const res = await setPieceStatus({ orderId: card.id, to });
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  /**
   * Renderiza uma coluna — mesma marcação do KanbanBoard: header colorido com
   * ponto + rótulo + contador, e a lista com scroll minimalista limitada a
   * ~3 cards visíveis.
   */
  function renderColumn(status: PieceStatus | null) {
    const list = byPiece(status);
    const label = status ? PIECE_LABEL[status] : AGUARDANDO_ENTREGA_LABEL;
    const headerClass = status ? PIECE_HEADER[status] : AGUARDANDO_ENTREGA_HEADER;
    const dot = status ? PIECE_DOT[status] : AGUARDANDO_ENTREGA_DOT;

    return (
      <div key={status ?? "AGUARDANDO"} className="flex flex-col">
        <div className={`mb-2 flex items-center justify-between rounded-lg border px-2.5 py-1.5 ${headerClass}`}>
          <span className="flex items-center gap-1.5 text-xs font-semibold leading-tight">
            <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
            <span className="truncate">{label}</span>
          </span>
          <span className="font-data ml-1 shrink-0 rounded-full bg-background/60 px-1.5 text-[11px]">
            {list.length}
          </span>
        </div>

        <div className="kanban-scroll flex max-h-[23.5rem] flex-col gap-2 overflow-y-auto rounded-lg pr-1">
          {list.map((card, i) => {
            const proximo = nextPieceStatus(card.pieceStatus);
            const anterior = prevPieceStatus(card.pieceStatus);
            // "Em Uso" exige entrega registrada — a seta some enquanto não houver.
            const podeAvancar =
              canMove && proximo !== null && !(proximo === "EM_USO" && !card.entregue);
            const podeVoltar = canMove && anterior !== null;

            return (
              <OrderCard
                key={card.id}
                data={card}
                onClick={() => setOpenId(card.id)}
                style={{ animationDelay: `${Math.min(i * 30, 200)}ms` }}
                action={
                  podeAvancar || podeVoltar ? (
                    <span className="flex items-center gap-1">
                      {podeVoltar && anterior && (
                        <PieceArrow
                          direction="back"
                          label={`Voltar para ${PIECE_LABEL[anterior]}`}
                          onClick={() => move(card, anterior)}
                          disabled={pending}
                        />
                      )}
                      {podeAvancar && proximo && (
                        <PieceArrow
                          direction="forward"
                          label={`Avançar para ${PIECE_LABEL[proximo]}`}
                          onClick={() => move(card, proximo)}
                          disabled={pending}
                        />
                      )}
                    </span>
                  ) : undefined
                }
              />
            );
          })}
          {list.length === 0 && (
            <div className="rounded-lg border border-dashed border-border/50 py-4 text-center text-[11px] text-muted-foreground/50">
              Vazio
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Busca, no mesmo padrão do Fluxo de Pedidos. */}
      <div className="flex items-center gap-3">
        <div className="relative w-full max-w-xs shrink-0">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-sm"
            placeholder="Buscar comanda, pedido ou cliente..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <p className="text-sm text-muted-foreground">{visibleCards.length} peça(s) no quadro</p>
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {renderColumn(null)}
        {PIECE_COLUMNS.map((s) => renderColumn(s))}
      </div>

      <p className="text-xs text-muted-foreground">
        Peças devolvidas saem do quadro 30 minutos após a devolução. O registro permanece no
        histórico do pedido.
      </p>

      {openId && <OrderDetailModal orderId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

/**
 * Setas de movimentação. Mesmo desenho do StatusArrow do KanbanBoard; aqui são
 * duas — voltar (contorno) e avançar (preenchida) — porque o quadro de peças é
 * bidirecional: uma peça devolvida pode ir para manutenção e voltar.
 */
function PieceArrow({
  direction,
  label,
  onClick,
  disabled,
}: {
  direction: "back" | "forward";
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const forward = direction === "forward";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={
        forward
          ? "inline-flex h-7 w-7 items-center justify-center rounded-full bg-distribuicao text-distribuicao-fg shadow-sm transition-transform hover:scale-105 disabled:opacity-50"
          : "inline-flex h-7 w-7 items-center justify-center rounded-full border border-distribuicao/50 bg-background text-distribuicao shadow-sm transition-transform hover:scale-105 disabled:opacity-50"
      }
    >
      {forward ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
    </button>
  );
}
