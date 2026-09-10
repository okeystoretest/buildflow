"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { OrderStatus } from "@prisma/client";
import { startRoute, completeDelivery } from "@/lib/actions/deliveries";
import { unassignMyOrder } from "@/lib/actions/logistics";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { OrderDetailModal } from "@/components/shared/order-detail-modal";
import { CompletePhotoModal } from "./complete-photo-modal";
import { Truck, Camera, Eye, CheckCircle2, X, MapPin } from "lucide-react";

export interface DriverOrderView {
  id: string;
  status: OrderStatus;
  orderNumber: string;
  comandaNumber: string | null;
  customer: string;
  customerCode: string | null;
  notes: string | null;
  /** Excursão vinculada ao pedido, quando a forma de envio é excursão. */
  excursao: { name: string; address: string; notes: string | null } | null;
  /** true quando a entrega ainda não tem dono (qualquer motorista pode pegar). */
  isOpen?: boolean;
}

/**
 * Card do fluxo restrito do motorista. Progressão:
 *   Pronto --(Iniciar)--> Em Rota --(foto obrigatória)--> Entregue
 *
 * "Iniciar" num card SEM DONO assume a entrega e sai na mesma ação — não existe
 * mais o passo separado de "Atribuir", nem a coluna "Aguardando Entregador" de
 * onde ele vinha. A disputa entre dois motoristas é resolvida no banco (ver
 * startRoute); aqui só exibimos a mensagem de quem perdeu a corrida.
 */
export function EntregaCard({ order, index = 0 }: { order: DriverOrderView; index?: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState(false);
  const [photoModal, setPhotoModal] = useState(false);

  function iniciar() {
    setError(null);
    start(async () => {
      const res = await startRoute(order.id);
      if (res.ok) router.refresh(); else setError(res.error);
    });
  }

  function cancelar() {
    setError(null);
    start(async () => {
      const res = await unassignMyOrder({ orderId: order.id });
      if (res.ok) router.refresh(); else setError(res.error);
    });
  }

  function concluirComFotos(files: File[]) {
    setError(null);
    const fd = new FormData();
    fd.append("orderId", order.id);
    // Envia todas as fotos sob o mesmo campo "photos" (a action lê via getAll).
    for (const f of files) fd.append("photos", f);
    start(async () => {
      const res = await completeDelivery(fd);
      if (res.ok) {
        setPhotoModal(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  const podeIniciar = order.status === "ENVIADO";
  const podeConcluir = order.status === "EM_ROTA";
  const entregue = order.status === "ENTREGUE" || order.status === "CONCLUIDO";
  // "Cancelar" devolve a atribuição. Não faz sentido em card sem dono: não há
  // atribuição para devolver. Reaparece assim que o pedido é seu.
  const podeCancelar = !order.isOpen && (podeIniciar || podeConcluir);

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

      {/* EXCURSÃO em destaque: é para onde o motorista vai. Quando existe, ela
          ocupa o lugar da observação genérica — as instruções relevantes da
          entrega são as da excursão. */}
      {order.excursao ? (
        <div className="mt-3 rounded-lg border-2 border-motorista/50 bg-motorista/10 p-3 text-sm leading-relaxed">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-motorista">
            <MapPin className="h-3.5 w-3.5" /> Excursão
          </p>
          <p className="font-semibold">{order.excursao.name}</p>
          <p className="mt-0.5 text-muted-foreground">{order.excursao.address}</p>
          {order.excursao.notes?.trim() && (
            <p className="mt-1.5 border-t border-motorista/25 pt-1.5">{order.excursao.notes}</p>
          )}
        </div>
      ) : (
        // Sem excursão, a observação de envio continua: é a única instrução que
        // o motorista tem para portão, horário ou ponto de referência.
        order.notes?.trim() && (
          <div className="mt-3 rounded-lg border-2 border-motorista/50 bg-motorista/10 p-3 text-sm font-medium leading-relaxed">
            <p className="mb-0.5 text-xs font-bold uppercase tracking-wide text-motorista">Observação</p>
            {order.notes}
          </div>
        )
      )}

      {/* Ações em pílula, lado a lado, dividindo a largura igualmente. */}
      <div className="mt-4 flex items-center gap-2">
        {podeCancelar && (
          <Button
            variant="outline"
            className="h-11 flex-1 px-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={cancelar}
            disabled={pending}
          >
            <X className="h-4 w-4" />
            <span className="truncate">{pending ? "..." : "Cancelar"}</span>
          </Button>
        )}

        <Button
          variant="outline"
          className="h-11 flex-1 px-2"
          onClick={() => setDetail(true)}
        >
          <Eye className="h-4 w-4" />
          <span className="truncate">Ver</span>
        </Button>

        {podeIniciar && (
          <Button
            variant="brand"
            className="h-11 flex-1 px-2"
            onClick={iniciar}
            disabled={pending}
          >
            <Truck className="h-4 w-4" />
            <span className="truncate">{pending ? "..." : "Iniciar"}</span>
          </Button>
        )}

        {podeConcluir && (
          <Button
            variant="motorista"
            className="h-11 flex-1 px-2"
            onClick={() => setPhotoModal(true)}
            disabled={pending}
          >
            <Camera className="h-4 w-4" />
            <span className="truncate">{pending ? "..." : "Concluir"}</span>
          </Button>
        )}

        {entregue && (
          <div className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-motorista/10 text-sm font-medium text-motorista">
            <CheckCircle2 className="h-4 w-4" /> Entregue
          </div>
        )}
      </div>

      {error && <p className="mt-2 text-sm font-medium text-destructive">{error}</p>}

      {detail && (
        <OrderDetailModal orderId={order.id} onClose={() => setDetail(false)} driverMode />
      )}

      {photoModal && (
        <CompletePhotoModal
          pending={pending}
          onSubmit={concluirComFotos}
          onClose={() => setPhotoModal(false)}
        />
      )}
    </div>
  );
}
