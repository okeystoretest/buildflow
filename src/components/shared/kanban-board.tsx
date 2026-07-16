"use client";

import { useState, useTransition, useRef, useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Maximize2, Minimize2, ChevronDown, Search, ChevronRight } from "lucide-react";
import type { OrderStatus } from "@prisma/client";
import { STATUS_LABEL, STATUS_STYLE, nextStatus } from "@/lib/order-flow";
import { OrderCard, type OrderCardData } from "@/components/shared/order-card";
import { OrderDetailModal } from "@/components/shared/order-detail-modal";
import { Button } from "@/components/ui/button";

export interface KanbanCard extends OrderCardData {}

// Janela de permanência de um card ENTREGUE no fluxo ativo: 15 minutos.
const DELIVERED_TTL_MS = 15 * 60 * 1000;

interface AdvanceConfig {
  enabled: boolean;
  drivers: { id: string; name: string }[];
}

export function KanbanBoard({
  cards,
  columns,
  advance,
  canManage = false,
  userRole,
}: {
  cards: KanbanCard[];
  columns: OrderStatus[];
  // Quando habilitado (Logística), mostra botão "Avançar" + pop-ups.
  advance?: AdvanceConfig;
  // Quando true (Gestão), o modal exibe editar/excluir pedido.
  canManage?: boolean;
  // Papel do usuário atual — controla regras de permissão de avanço por status.
  userRole?: "GESTAO" | "VENDAS" | "FINANCEIRO" | "LOGISTICA" | "MOTORISTA";
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  // Busca rápida por comanda, nº do pedido, cliente ou vendedor.
  const [query, setQuery] = useState("");

  // "Relógio" interno: avança de minuto em minuto para reavaliar quais cards
  // ENTREGUE já passaram dos 15 min e devem sumir do fluxo — sem reload.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30_000); // 30s
    return () => clearInterval(id);
  }, []);

  // Atualizacao automatica dos status: a cada 2 min busca os dados mais
  // recentes do servidor (router.refresh re-renderiza o server component sem
  // recarregar a pagina nem perder o estado local, como busca ou modal aberto).
  // Pausa quando a aba esta em segundo plano para nao gastar recursos a toa.
  useEffect(() => {
    const REFRESH_MS = 2 * 60 * 1000; // 2 minutos
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [router]);

  // Janela de permanência de um card ENTREGUE no fluxo ativo: 15 minutos.
  const visibleCards = useMemo(() => {
    // 1) Some com ENTREGUE que já passou de 15 min desde a entrega.
    const afterTtl = cards.filter((c) => {
      if (c.status !== "ENTREGUE") return true;
      if (!c.deliveredAt) return true; // sem timestamp: mantém (não some sozinho)
      return nowTick - new Date(c.deliveredAt).getTime() < DELIVERED_TTL_MS;
    });
    // 2) Aplica a busca por texto.
    const q = query.trim().toLowerCase();
    if (!q) return afterTtl;
    return afterTtl.filter((c) =>
      [c.comandaNumber, c.orderNumber, c.customerName, c.sellerName]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [query, cards, nowTick]);
  // Coluna cujas comandas excedentes (além das 3 primeiras) estão sendo exibidas no modal.
  const [overflowStatus, setOverflowStatus] = useState<OrderStatus | null>(null);
  const [isFull, setIsFull] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const byStatus = (status: OrderStatus) => visibleCards.filter((c) => c.status === status);

  // Regra de permissão de avanço por status:
  //  - EM_ANALISE só avança por FINANCEIRO (ou GESTAO). Logística NÃO vê a seta.
  //  - Demais status seguem o advance normal da Logística.
  const canAdvanceCard = useCallback(
    (card: KanbanCard): boolean => {
      if (!advance?.enabled || !nextStatus(card.status)) return false;
      if (card.status === "EM_ANALISE" && userRole !== "FINANCEIRO" && userRole !== "GESTAO") {
        return false;
      }
      return true;
    },
    [advance?.enabled, userRole],
  );

  // ---- Tela cheia (mesma lógica do Rank de Vendas) ----
  const toggleFull = useCallback(async () => {
    try {
      if (!document.fullscreenElement) await rootRef.current?.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      setIsFull((v) => !v);
    }
  }, []);
  useEffect(() => {
    const onChange = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // ---- Avanço de status (somente quando advance.enabled) ----
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [popupOrder, setPopupOrder] = useState<KanbanCard | null>(null);
  const [driverId, setDriverId] = useState("");
  // Pop-up de rastreio (antes de PROCESSADO): pergunta se ha codigo.
  const [trackingOrder, setTrackingOrder] = useState<KanbanCard | null>(null);
  const [trackingCode, setTrackingCode] = useState("");
  const [hasTracking, setHasTracking] = useState<boolean | null>(null);
  const [pendencyOrder, setPendencyOrder] = useState<KanbanCard | null>(null);
  const [pendencyNote, setPendencyNote] = useState("");

  function handleAdvance(card: KanbanCard) {
    setError(null);
    const next = nextStatus(card.status);
    // Bloqueio de NF: Processando sem nota não avança.
    if (card.status === "PROCESSANDO" && !card.hasInvoice) {
      setError(`Pedido ${card.comandaNumber ?? card.orderNumber}: anexe a Nota Fiscal antes de avançar (Processando sem NF).`);
      return;
    }
    if (next === "PROCESSADO") {
      setTrackingOrder(card);
      setTrackingCode("");
      setHasTracking(null);
      return;
    }
    if (next === "PENDENTE") { setPendencyOrder(card); setPendencyNote(""); return; }
    runAdvance({ orderId: card.id });
  }

  function runAdvance(payload: { orderId: string; pendencyNote?: string; skipPendente?: boolean }) {
    start(async () => {
      const mod = await import("@/lib/actions/logistics");
      const res = await mod.advanceOrderStatus(payload);
      if (res.ok) { setPendencyOrder(null); router.refresh(); } else setError(res.error);
    });
  }

  // Etapa 1 (PROCESSADO): respondida a pergunta de rastreio, vai p/ motorista.
  function goToDriverStep() {
    if (!trackingOrder) return;
    setError(null);
    if (hasTracking && !trackingCode.trim()) {
      setError("Informe o codigo de rastreio.");
      return;
    }
    setPopupOrder(trackingOrder);
    setDriverId("");
    setTrackingOrder(null);
  }

  function confirmDriver() {
    if (!popupOrder || !driverId) return;
    setError(null);
    start(async () => {
      const mod = await import("@/lib/actions/logistics");
      const res = await mod.assignDriverToOrder({
        orderId: popupOrder.id,
        driverId,
        trackingCode: hasTracking ? trackingCode.trim() : null,
      });
      if (res.ok) {
        setPopupOrder(null);
        setTrackingCode("");
        setHasTracking(null);
        router.refresh();
      } else setError(res.error);
    });
  }

  function answerPendency(hasPendency: boolean) {
    if (!pendencyOrder) return;
    setError(null);
    if (hasPendency && !pendencyNote.trim()) { setError("Descreva a pendência."); return; }
    runAdvance(hasPendency
      ? { orderId: pendencyOrder.id, pendencyNote }
      : { orderId: pendencyOrder.id, skipPendente: true });
  }

  const wrapClass = isFull
    ? "flex h-screen flex-col gap-3 overflow-auto bg-background p-4"
    : "space-y-3";

  // Divisão em dois estágios. O 1º vai até "Embalando" (fim da preparação);
  // o 2º começa em "Embalado". Se por algum motivo "Embalado" não estiver nas
  // colunas, tudo cai no estágio 1 (fallback seguro).
  const splitIdx = columns.indexOf("EMBALADO");
  const stage1 = splitIdx >= 0 ? columns.slice(0, splitIdx) : columns;
  const stage2 = splitIdx >= 0 ? columns.slice(splitIdx) : [];

  // Renderiza uma coluna do Kanban (header colorido + até 3 cards, sem scroll).
  function renderColumn(status: OrderStatus) {
    const list = byStatus(status);
    const s = STATUS_STYLE[status];
    // Sinalizacao especial de cabecalho:
    //  - Aguardando Impressao: sempre AMARELO (alerta de fila para impressao).
    //  - Pendente: VERMELHO quando ha cards (prioridade critica).
    let headerClass = s.header;
    if (status === "AGUARDANDO_IMPRESSAO") {
      headerClass = "bg-yellow-400/25 text-yellow-800 dark:text-yellow-200 border-yellow-500";
    } else if (status === "PENDENTE" && list.length > 0) {
      headerClass = "bg-red-600/90 text-white border-red-700";
    }
    return (
      <div key={status} className="flex flex-col">
        {/* Header colorido conforme o status (cor distinta por etapa). */}
        <div className={`mb-2 flex items-center justify-between rounded-lg border px-2.5 py-1.5 ${headerClass}`}>
          <span className="flex items-center gap-1.5 text-xs font-semibold leading-tight">
            <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
            <span className="truncate">{STATUS_LABEL[status]}</span>
          </span>
          <span className="font-data ml-1 shrink-0 rounded-full bg-background/60 px-1.5 text-[11px]">
            {list.length}
          </span>
        </div>
        {/* Layout fixo: no máximo 3 cards, sem barra de rolagem. */}
        <div className="flex flex-col gap-2 pr-0.5">
          {list.slice(0, 3).map((card, i) => (
            <OrderCard
              key={card.id}
              data={card}
              onClick={() => setOpenId(card.id)}
              style={{ animationDelay: `${Math.min(i * 30, 200)}ms` }}
              action={
                canAdvanceCard(card) ? (
                  <StatusArrow onClick={() => handleAdvance(card)} disabled={pending} />
                ) : undefined
              }
            />
          ))}
          {list.length > 3 && (
            <button
              type="button"
              onClick={() => setOverflowStatus(status)}
              className="mt-0.5 flex flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-border/70 py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
            >
              <ChevronDown className="h-4 w-4 animate-bounce" />
              <span>+{list.length - 3} comandas</span>
            </button>
          )}
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
    <div ref={rootRef} className={wrapClass}>
      <div className="flex items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-sm"
            placeholder="Buscar comanda, pedido ou cliente..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button variant="outline" size="sm" onClick={toggleFull}>
          {isFull ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          <span className="hidden sm:inline">{isFull ? "Sair da tela cheia" : "Tela cheia"}</span>
        </Button>
      </div>

      {error && <p className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">{error}</p>}

      {/* Dois estágios do fluxo, cada um com barra full-width:
          Estágio 1: até "Embalando" (fim da preparação).
          Estágio 2: de "Embalado" em diante (expedição/entrega). */}
      <StageBar label="1º Estágio · Preparação" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stage1.map((status) => renderColumn(status))}
      </div>

      <StageBar label="2º Estágio · Expedição" className="mt-4" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stage2.map((status) => renderColumn(status))}
      </div>

      {openId && <OrderDetailModal orderId={openId} onClose={() => setOpenId(null)} canManage={canManage} />}

      {/* Modal de comandas excedentes da coluna (além das 3 primeiras) */}
      {overflowStatus && (() => {
        const list = byStatus(overflowStatus);
        const rest = list.slice(3);
        return (
          <Modal onClose={() => setOverflowStatus(null)}>
            <div className="mb-3 flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${STATUS_STYLE[overflowStatus].dot}`} />
              <h2 className="text-lg font-bold">{STATUS_LABEL[overflowStatus]}</h2>
              <span className="font-data ml-auto rounded-full bg-secondary px-2 text-xs text-muted-foreground">
                {rest.length} na fila
              </span>
            </div>
            <div className="-mr-2 max-h-[60vh] space-y-2 overflow-y-auto pr-2">
              {rest.map((card) => (
                <OrderCard
                  key={card.id}
                  data={card}
                  onClick={() => { setOverflowStatus(null); setOpenId(card.id); }}
                  action={
                    canAdvanceCard(card) ? (
                      <StatusArrow onClick={() => handleAdvance(card)} disabled={pending} />
                    ) : undefined
                  }
                />
              ))}
            </div>
          </Modal>
        );
      })()}

      {/* Pop-up de rastreio (antes de PROCESSADO) */}
      {trackingOrder && (
        <Modal onClose={() => setTrackingOrder(null)}>
          <h2 className="mb-1 text-lg font-bold">O item possui codigo de rastreio?</h2>
          <p className="mb-4 text-sm text-muted-foreground">Pedido {trackingOrder.orderNumber}</p>

          {hasTracking === null && (
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setHasTracking(false); }}>
                Nao
              </Button>
              <Button variant="distribuicao" onClick={() => setHasTracking(true)}>
                Sim
              </Button>
            </div>
          )}

          {hasTracking === true && (
            <>
              <input
                className="mb-3 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                placeholder="Digite o codigo de rastreio..."
                value={trackingCode}
                onChange={(e) => setTrackingCode(e.target.value)}
                autoFocus
              />
              {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setHasTracking(null)}>Voltar</Button>
                <Button variant="distribuicao" onClick={goToDriverStep} disabled={!trackingCode.trim()}>
                  Confirmar e prosseguir
                </Button>
              </div>
            </>
          )}

          {hasTracking === false && (
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setHasTracking(null)}>Voltar</Button>
              <Button variant="distribuicao" onClick={goToDriverStep}>Prosseguir</Button>
            </div>
          )}
        </Modal>
      )}

      {/* Pop-up de motorista (PROCESSADO) */}
      {popupOrder && (
        <Modal onClose={() => setPopupOrder(null)}>
          <h2 className="mb-1 text-lg font-bold">Atribuir motorista</h2>
          <p className="mb-4 text-sm text-muted-foreground">Pedido {popupOrder.orderNumber} — quem fará a entrega?</p>
          <select className="mb-4 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
            value={driverId} onChange={(e) => setDriverId(e.target.value)}>
            <option value="">Selecione o motorista...</option>
            {advance?.drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPopupOrder(null)}>Cancelar</Button>
            <Button variant="distribuicao" onClick={confirmDriver} disabled={pending || !driverId}>{pending ? "..." : "Confirmar"}</Button>
          </div>
        </Modal>
      )}

      {/* Pop-up de pendência (antes de PENDENTE) */}
      {pendencyOrder && (
        <Modal onClose={() => setPendencyOrder(null)}>
          <h2 className="mb-1 text-lg font-bold">Há alguma pendência neste pedido?</h2>
          <p className="mb-4 text-sm text-muted-foreground">Pedido {pendencyOrder.orderNumber}</p>
          <textarea
            className="mb-3 min-h-[80px] w-full rounded-lg border border-input bg-background p-3 text-sm"
            placeholder="Se houver pendência, descreva aqui..."
            value={pendencyNote}
            onChange={(e) => setPendencyNote(e.target.value)}
          />
          {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => answerPendency(false)} disabled={pending}>Não há pendência</Button>
            <Button variant="distribuicao" onClick={() => answerPendency(true)} disabled={pending}>Sim, registrar pendência</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// Barra divisória de estágio: atravessa toda a largura do board (todas as
// colunas), separando visualmente o 1º do 2º estágio do fluxo.
function StageBar({ label, className = "" }: { label: string; className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="h-px flex-1 bg-distribuicao/40" />
      <span className="rounded-full bg-distribuicao/15 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide text-distribuicao">
        {label}
      </span>
      <span className="h-px flex-1 bg-distribuicao/40" />
    </div>
  );
}

function StatusArrow({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Avançar status"
      title="Avançar status"
      className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-distribuicao text-distribuicao-fg shadow-sm transition-transform hover:scale-105 disabled:opacity-50"
    >
      <ChevronRight className="h-4 w-4" />
    </button>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
