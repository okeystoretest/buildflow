"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Clock, ChevronRight, Lock } from "lucide-react";
import type { OrderStatus, PieceStatus } from "@prisma/client";
import { STATUS_LABEL } from "@/lib/order-flow";
import {
  PIECE_COLUMNS,
  PIECE_LABEL,
  PIECE_HEADER,
  AGUARDANDO_ENTREGA_LABEL,
  allowedPieceTargets,
} from "@/lib/piece-control";
import { setPieceStatus } from "@/lib/actions/pieces";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface PecaMovimento {
  id: string;
  from: PieceStatus | null;
  to: PieceStatus;
  note: string | null;
  autor: string | null;
  createdAt: string;
}

export interface PecaCard {
  id: string;
  orderNumber: string;
  comandaNumber: string | null;
  orderStatus: OrderStatus;
  pieceCount: number;
  pieceStatus: PieceStatus | null;
  customerName: string;
  customerCode: string;
  sellerName: string;
  entregue: boolean;
  entregueEm: string | null;
  createdAt: string;
  movimentos: PecaMovimento[];
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Dias corridos desde a entrega — leitura rápida de "há quanto tempo está fora". */
function diasDesde(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export function ControlePecasBoard({
  cards,
  canMove,
}: {
  cards: PecaCard[];
  canMove: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Card aberto no modal de movimentação.
  const [moving, setMoving] = useState<{ card: PecaCard; to: PieceStatus } | null>(null);
  const [note, setNote] = useState("");
  // Card com o histórico expandido.
  const [openHist, setOpenHist] = useState<string | null>(null);

  const visiveis = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter((c) =>
      [c.orderNumber, c.comandaNumber, c.customerName, c.customerCode, c.sellerName]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [cards, query]);

  const aguardando = visiveis.filter((c) => c.pieceStatus === null);
  const porStatus = (s: PieceStatus) => visiveis.filter((c) => c.pieceStatus === s);

  function confirmarMovimento() {
    if (!moving) return;
    setError(null);
    const { card, to } = moving;
    start(async () => {
      const res = await setPieceStatus({ orderId: card.id, to, note: note.trim() || undefined });
      if (res.ok) {
        setMoving(null);
        setNote("");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Busca + resumo por coluna */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8 pr-9"
            placeholder="Buscar por pedido, comanda, cliente ou vendedora"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Limpar busca"
              className="absolute right-2 top-2 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {visiveis.length} peça(s) no quadro
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* 4 colunas: a virtual "Aguardando Entrega" + os 3 status reais. */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Coluna
          titulo={AGUARDANDO_ENTREGA_LABEL}
          headerClass="bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/40"
          total={aguardando.length}
          vazio="Nenhuma peça aguardando entrega."
        >
          {aguardando.map((c) => (
            <CardPeca
              key={c.id}
              card={c}
              canMove={canMove}
              onMove={(to) => { setNote(""); setError(null); setMoving({ card: c, to }); }}
              histAberto={openHist === c.id}
              onToggleHist={() => setOpenHist(openHist === c.id ? null : c.id)}
            />
          ))}
        </Coluna>

        {PIECE_COLUMNS.map((s) => {
          const lista = porStatus(s);
          return (
            <Coluna
              key={s}
              titulo={PIECE_LABEL[s]}
              headerClass={PIECE_HEADER[s]}
              total={lista.length}
              vazio="Nenhuma peça nesta coluna."
            >
              {lista.map((c) => (
                <CardPeca
                  key={c.id}
                  card={c}
                  canMove={canMove}
                  onMove={(to) => { setNote(""); setError(null); setMoving({ card: c, to }); }}
                  histAberto={openHist === c.id}
                  onToggleHist={() => setOpenHist(openHist === c.id ? null : c.id)}
                />
              ))}
            </Coluna>
          );
        })}
      </div>

      {/* Modal de confirmação da movimentação (com observação opcional). */}
      {moving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
            <h2 className="text-lg font-bold">
              Mover para &quot;{PIECE_LABEL[moving.to]}&quot;
            </h2>
            <p className="mb-3 mt-0.5 text-sm text-muted-foreground">
              Pedido {moving.card.orderNumber} · {moving.card.customerName}
            </p>

            <div className="space-y-1.5">
              <Label>Observação (opcional)</Label>
              <textarea
                className="min-h-[80px] w-full rounded-lg border border-input bg-background p-2 text-sm"
                placeholder="Ex.: peça devolvida com defeito na costura."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setMoving(null); setError(null); }} disabled={pending}>
                Cancelar
              </Button>
              <Button variant="distribuicao" onClick={confirmarMovimento} disabled={pending}>
                {pending ? "Salvando..." : "Confirmar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Coluna({
  titulo,
  headerClass,
  total,
  vazio,
  children,
}: {
  titulo: string;
  headerClass: string;
  total: number;
  vazio: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-border bg-secondary/30">
      <div className={`flex items-center justify-between rounded-t-xl border-b px-3 py-2 text-sm font-semibold ${headerClass}`}>
        <span>{titulo}</span>
        <span className="font-data rounded-md bg-background/60 px-1.5 py-0.5 text-xs">{total}</span>
      </div>
      <div className="flex flex-col gap-2 p-2">
        {total === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">{vazio}</p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function CardPeca({
  card,
  canMove,
  onMove,
  histAberto,
  onToggleHist,
}: {
  card: PecaCard;
  canMove: boolean;
  onMove: (to: PieceStatus) => void;
  histAberto: boolean;
  onToggleHist: () => void;
}) {
  const dias = diasDesde(card.entregueEm);
  // Sem entrega registrada, o único destino possível (EM_USO) fica bloqueado.
  const bloqueado = !card.entregue;
  const destinos = allowedPieceTargets(card.pieceStatus).filter(
    (t) => !(t === "EM_USO" && bloqueado),
  );

  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-data text-sm font-semibold">
            {card.comandaNumber ? `Comanda ${card.comandaNumber}` : `Pedido ${card.orderNumber}`}
          </p>
          <p className="truncate text-sm">{card.customerName}</p>
          <p className="font-data text-xs text-muted-foreground">Cód. {card.customerCode}</p>
        </div>
        <span className="font-data shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-xs">
          {card.pieceCount > 0 ? `${card.pieceCount} pç` : "— pç"}
        </span>
      </div>

      <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
        <p>Vendedora: {card.sellerName}</p>
        <p>Status do pedido: {STATUS_LABEL[card.orderStatus]}</p>
        {card.entregue ? (
          <p className="flex items-center gap-1">
            <Clock className="h-3 w-3" /> Entregue em {fmt(card.entregueEm)}
            {dias !== null && ` · há ${dias} dia(s)`}
          </p>
        ) : (
          <p className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <Lock className="h-3 w-3" /> Entrega ainda não registrada
          </p>
        )}
      </div>

      {canMove && destinos.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {destinos.map((t) => (
            <Button key={t} size="sm" variant="outline" onClick={() => onMove(t)}>
              {PIECE_LABEL[t]}
            </Button>
          ))}
        </div>
      )}

      {canMove && bloqueado && (
        <p className="mt-3 rounded-md bg-secondary px-2 py-1 text-[11px] leading-snug text-muted-foreground">
          Disponível para &quot;Em Uso&quot; assim que o pedido for marcado como Entregue.
        </p>
      )}

      {card.movimentos.length > 0 && (
        <div className="mt-3 border-t border-border pt-2">
          <button
            type="button"
            onClick={onToggleHist}
            className="flex w-full items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${histAberto ? "rotate-90" : ""}`} />
            Histórico ({card.movimentos.length})
          </button>
          {histAberto && (
            <ul className="mt-2 space-y-2">
              {card.movimentos.map((m) => (
                <li key={m.id} className="rounded-md bg-secondary/60 px-2 py-1.5 text-[11px] leading-snug">
                  <p className="font-medium">
                    {m.from ? PIECE_LABEL[m.from] : "Entrada no controle"} → {PIECE_LABEL[m.to]}
                  </p>
                  <p className="text-muted-foreground">
                    {fmt(m.createdAt)}
                    {m.autor && ` · por ${m.autor}`}
                  </p>
                  {m.note && <p className="mt-0.5">{m.note}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
