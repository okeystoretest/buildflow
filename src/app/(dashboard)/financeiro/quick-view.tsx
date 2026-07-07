"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrderDetailModal } from "@/components/shared/order-detail-modal";

// Visualizacao Rapida (3.1): abre o modal de detalhe do pedido (formulario
// completo + comprovante de pagamento) sem sair da tela de Analise de Pedidos.
// Reaproveita o mesmo OrderDetailModal usado no Kanban.
export function QuickViewButton({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Eye className="mr-1.5 h-4 w-4" />
        Visualização rápida
      </Button>
      {open && <OrderDetailModal orderId={orderId} onClose={() => setOpen(false)} />}
    </>
  );
}
