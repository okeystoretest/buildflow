"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { OrderStatus } from "@prisma/client";
import { startRoute, completeDelivery } from "@/lib/actions/deliveries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";

interface OrderView {
  id: string;
  status: OrderStatus;
  orderNumber: string;
  comandaNumber: string | null;
  customer: string;
  address: string;
  city: string;
  deliveryStatus: string;
}

export function EntregaCard({ order, index = 0 }: { order: OrderView; index?: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function iniciar() {
    setError(null);
    start(async () => {
      const res = await startRoute(order.id);
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
  }

  // ENVIADO / PROCESSADO -> pode iniciar rota. EM_ROTA -> pode concluir.
  const podeIniciar = order.status === "ENVIADO" || order.status === "PROCESSADO";
  const podeConcluir = order.status === "EM_ROTA";

  return (
    <Card className="card-hover animate-fade-in-up" style={{ animationDelay: `${Math.min(index * 60, 300)}ms` }}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{order.customer}</CardTitle>
          <StatusBadge status={order.status} />
        </div>
        <p className="font-data text-xs text-muted-foreground">
          {order.comandaNumber ? `Comanda ${order.comandaNumber}` : `Pedido ${order.orderNumber}`}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm">
          <p>{order.address}</p>
          {order.city && <p className="text-muted-foreground">{order.city}</p>}
        </div>

        {podeIniciar && (
          <Button variant="brand" size="lg" className="w-full" onClick={iniciar} disabled={pending}>
            {pending ? "..." : "Iniciar rota"}
          </Button>
        )}

        {podeConcluir && (
          <>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto} />
            <Button variant="motorista" size="lg" className="w-full" onClick={() => fileRef.current?.click()} disabled={pending}>
              {pending ? "Enviando foto..." : "Concluir com foto"}
            </Button>
          </>
        )}

        {error && <p className="text-sm font-medium text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
