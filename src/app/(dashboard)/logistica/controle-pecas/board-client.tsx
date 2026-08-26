"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronRight, ChevronLeft, Lock, History } from "lucide-react";
import type { PieceStatus } from "@prisma/client";
import {
  PIECE_COLUMNS,
  PIECE_LABEL,
  PIECE_HEADER,
  PIECE_DOT,
  AGUARDANDO_ENTREGA_LABEL,
  AGUARDANDO_ENTREGA_HEADER,
  AGUARDANDO_ENTREGA_DOT,
  dentroDaJanelaFinalizado,
  exigeGestaoParaMover,
  nextPieceStatus,
  prevPieceStatus,
} from "@/lib/piece-control";
import { setPieceStatus } from "@/lib/actions/pieces";
import { Button } from "@/components/ui/button";
import { CardScroller } from "@/components/shared/card-scroller";
import { OrderCard, type OrderCardData } from "@/components/shared/order-card";
import { OrderDetailModal } from "@/components/shared/order-detail-modal";
import { HistoricoPecas, type HistoricoPeca } from "./historico-client";

/**
 * Card do Controle de Peças: é o MESMO OrderCardData do Fluxo de Pedidos
 * (para o card renderizar idêntico), acrescido dos campos próprios do módulo.
 */
export interface PecaCard extends OrderCardData {
  pieceStatus: PieceStatus | null;
  /** Entrega registrada? Sem isso, a peça não entra em "Em Uso". */
  entregue: boolean;
  /** ISO da entrada em FINALIZADO — base da retenção de 30 dias. */
  finalizadoEm: string | null;
}

export function ControlePecasBoard({
  cards,
  canMove,
  isGestao,
  historico,
}: {
  cards: PecaCard[];
  /** Perfil operacional (Logística/Gestão) pode mover cards não finalizados. */
  canMove: boolean;
  /** Só a Gestão movimenta cards que já estão em "Finalizado". */
  isGestao: boolean;
  historico: HistoricoPeca[];
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // "Relógio" interno (mesmo padrão do KanbanBoard): reavalia periodicamente
  // quais cards FINALIZADO passaram dos 30 dias e devem ser arquivados. O
  // intervalo curto serve para a virada acontecer sem reload com a aba aberta.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const visibleCards = useMemo(() => {
    // 1) Arquiva (some do quadro) o FINALIZADO com mais de 30 dias. O dado
    //    permanece no banco e continua acessível pelo Histórico.
    const dentroDoPrazo = cards.filter((c) =>
      c.pieceStatus === "FINALIZADO"
        ? dentroDaJanelaFinalizado(c.finalizadoEm, nowTick)
        : true,
    );
    // 2) Aplica a busca por texto.
    const q = query.trim().toLowerCase();
    if (!q) return dentroDoPrazo;
    return dentroDoPrazo.filter((c) =>
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
   * ponto + rótulo + contador, e a lista com rolagem limitada a 3 cards.
   */
  function renderColumn(status: PieceStatus | null) {
    const list = byPiece(status);
    const label = status ? PIECE_LABEL[status] : AGUARDANDO_ENTREGA_LABEL;
    const headerClass = status ? PIECE_HEADER[status] : AGUARDANDO_ENTREGA_HEADER;
    const dot = status ? PIECE_DOT[status] : AGUARDANDO_ENTREGA_DOT;
    // Coluna congelada para o usuário padrão (só Gestão movimenta).
    const congelada = exigeGestaoParaMover(status) && !isGestao;

    return (
      <div key={status ?? "AGUARDANDO"} className="flex flex-col">
        <div className={`mb-2 flex items-center justify-between rounded-lg border px-2.5 py-1.5 ${headerClass}`}>
          <span className="flex items-center gap-1.5 text-xs font-semibold leading-tight">
            <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
            <span className="truncate">{label}</span>
            {congelada && <Lock className="h-3 w-3 shrink-0 opacity-70" />}
          </span>
          <span className="font-data ml-1 shrink-0 rounded-full bg-background/60 px-1.5 text-[11px]">
            {list.length}
          </span>
        </div>

        <CardScroller visibleItems={3}>
          {list.map((card, i) => {
            const proximo = nextPieceStatus(card.pieceStatus);
            const anterior = prevPieceStatus(card.pieceStatus);
            // Sair de "Finalizado" é exclusivo da Gestão.
            const liberado = canMove && (!exigeGestaoParaMover(card.pieceStatus) || isGestao);
            // "Em Uso" exige entrega registrada — a seta some enquanto não houver.
            const podeAvancar =
              liberado && proximo !== null && !(proximo === "EM_USO" && !card.entregue);
            const podeVoltar = liberado && anterior !== null;

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
        </CardScroller>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Busca, no mesmo padrão do Fluxo de Pedidos. */}
      <div className="flex flex-wrap items-center gap-3">
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => setHistoricoAberto(true)}
        >
          <History className="h-4 w-4" /> Histórico ({historico.length})
        </Button>
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {renderColumn(null)}
        {PIECE_COLUMNS.map((s) => renderColumn(s))}
      </div>

      <p className="text-xs text-muted-foreground">
        O fluxo do pedido só é considerado encerrado ao chegar em{" "}
        <span className="font-semibold">Finalizado</span>. Cards finalizados ficam 30 dias no quadro
        e depois são arquivados — o registro continua disponível no Histórico.
        {!isGestao && " Pedidos finalizados só podem ser movimentados pelo perfil Gestão."}
      </p>

      {openId && <OrderDetailModal orderId={openId} onClose={() => setOpenId(null)} />}
      {historicoAberto && (
        <HistoricoPecas itens={historico} onClose={() => setHistoricoAberto(false)} />
      )}
    </div>
  );
}

/**
 * Setas de movimentação. Mesmo desenho do StatusArrow do KanbanBoard; aqui são
 * duas — voltar (contorno) e avançar (preenchida) — porque o quadro de peças é
 * bidirecional: uma peça devolvida pode voltar ao reprocessamento.
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
