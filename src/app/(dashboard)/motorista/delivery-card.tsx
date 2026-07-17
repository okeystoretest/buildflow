"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { OrderStatus } from "@prisma/client";
import { startRoute, completeDelivery } from "@/lib/actions/deliveries";
import { claimOpenOrder } from "@/lib/actions/logistics";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { OrderDetailModal } from "@/components/shared/order-detail-modal";
import { Truck, Camera, Eye, CheckCircle2, Hand } from "lucide-react";

export interface DriverOrderView {
  id: string;
  status: OrderStatus;
  orderNumber: string;
  comandaNumber: string | null;
  customer: string;
  customerCode: string | null;
  notes: string | null;
  // true quando o card está na coluna "Aguardando Entregador" (sem dono).
  isOpen?: boolean;
}

// Card do fluxo restrito do motorista. Progressão:
//   ENVIADO --(Iniciar rota)--> EM_ROTA --(foto obrigatória)--> ENTREGUE
export function EntregaCard({ order, index = 0 }: { order: DriverOrderView; index?: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function iniciar() {
    setError(null);
    start(async () => {
      const res = await startRoute(order.id);
      if (res.ok) router.refresh(); else setError(res.error);
    });
  }

  function atribuir() {
    setError(null);
    start(async () => {
      const res = await claimOpenOrder({ orderId: order.id });
      if (res.ok) router.refresh(); else setError(res.error);
    });
  }

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const fd = new FormData();
    fd.append("orderId", order.id);
    fd.append("photo", file);
    start(async () => {
      const res = await completeDelivery(fd);
      if (res.ok) router.refresh(); else setError(res.error);
    });
    e.target.value = "";
  }

  // Card em aberto: só permite "Atribuir" (pegar para si). Sem iniciar/concluir.
  const podeAtribuir = order.isOpen === true;
  const podeIniciar = !podeAtribuir && order.status === "ENVIADO";
  const podeConcluir = !podeAtribuir && order.status === "EM_ROTA";
  const entregue = order.status === "ENTREGUE" || order.status === "CONCLUIDO";

  return (
    <div
      className="card-hover animate-fade-in-up rounded-2xl border border-border bg-card p-4 shadow-sm"
      style={{ animationDelay: `${Math.min(index * 60, 300)}ms` }}
    >
      {/* Cabeçalho: cliente + código + status */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">
            {order.customer}
            {order.customerCode && (
              <span className="font-data ml-2 rounded-md bg-secondary px-1.5 py-0.5 text-xs text-foreground/70">
                {order.customerCode}
              </span>
            )}
          </p>
          <p className="font-data text-xs text-muted-foreground">
            {order.comandaNumber ? `Comanda ${order.comandaNumber}` : `Pedido ${order.orderNumber}`}
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {/* Observação em DESTAQUE (leitura durante a entrega). */}
      {order.notes?.trim() && (
        <div className="mt-3 rounded-lg border-2 border-motorista/50 bg-motorista/10 p-3 text-sm font-medium leading-relaxed">
          <p className="mb-0.5 text-xs font-bold uppercase tracking-wide text-motorista">Observação</p>
          {order.notes}
        </div>
      )}

      {/* Ações do fluxo */}
      <div className="mt-3 flex flex-col gap-2">
        {podeAtribuir && (
          <Button variant="brand" size="lg" className="w-full" onClick={atribuir} disabled={pending}>
            <Hand className="mr-2 h-5 w-5" />
            {pending ? "..." : "Atribuir"}
          </Button>
        )}

        {podeIniciar && (
          <Button variant="brand" size="lg" className="w-full" onClick={iniciar} disabled={pending}>
            <Truck className="mr-2 h-5 w-5" />
            {pending ? "..." : "Iniciar rota"}
          </Button>
        )}

        {podeConcluir && (
          <>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto} />
            <Button variant="motorista" size="lg" className="w-full" onClick={() => fileRef.current?.click()} disabled={pending}>
              <Camera className="mr-2 h-5 w-5" />
              {pending ? "Enviando foto..." : "Concluir com foto"}
            </Button>
          </>
        )}

        {entregue && (
          <div className="flex items-center justify-center gap-2 rounded-lg bg-motorista/10 py-2 text-sm font-medium text-motorista">
            <CheckCircle2 className="h-5 w-5" /> Entregue
          </div>
        )}

        {/* Ver detalhes (somente leitura, sem histórico/valores). */}
        <Button variant="outline" size="sm" className="w-full" onClick={() => setDetail(true)}>
          <Eye className="mr-2 h-4 w-4" /> Ver detalhes
        </Button>
      </div>

      {error && <p className="mt-2 text-sm font-medium text-destructive">{error}</p>}

      {detail && (
        <OrderDetailModal orderId={order.id} onClose={() => setDetail(false)} driverMode />
      )}
    </div>
  );
}
