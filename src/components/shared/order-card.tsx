"use client";

import type { OrderStatus } from "@prisma/client";
import { FileText, Receipt, User, Tag } from "lucide-react";
import { STATUS_STYLE } from "@/lib/order-flow";
import { cn } from "@/lib/utils";

export interface OrderCardData {
  id: string;
  status: OrderStatus;
  orderNumber: string;
  comandaNumber: string | null;
  customerName: string;
  sellerName: string;
  total?: string;
  hasInvoice: boolean;
  hasPaymentProof?: boolean;
  approvedByFinance: boolean;
}

export function OrderCard({
  data,
  onClick,
  style,
}: {
  data: OrderCardData;
  onClick?: () => void;
  style?: React.CSSProperties;
}) {
  const s = STATUS_STYLE[data.status];
  // Alerta visual: processando sem NF
  const alerta = data.status === "PROCESSANDO" && !data.hasInvoice;

  // Regra de exibicao: antes da aprovacao mostra pedido; depois, comanda.
  const principal = data.approvedByFinance && data.comandaNumber
    ? { rotulo: "Comanda", valor: data.comandaNumber }
    : { rotulo: "Pedido", valor: data.orderNumber };

  return (
    <button
      onClick={onClick}
      style={style}
      className={cn(
        "card-hover group w-full rounded-xl border bg-card p-3 text-left shadow-sm animate-fade-in-up",
        alerta
          ? "border-destructive/50 ring-1 ring-destructive/20 hover:shadow-md hover:shadow-destructive/10"
          : "border-border hover:border-primary/40 hover:shadow-md",
      )}
    >
      {/* topo: indicador de status + numero principal */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", s.dot)} />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{principal.rotulo}</p>
            <p className="font-data text-sm font-semibold leading-none truncate">{principal.valor}</p>
          </div>
        </div>
        {data.total && (
          <span className="font-data text-sm font-semibold text-foreground/90 shrink-0">{data.total}</span>
        )}
      </div>

      {/* corpo: cliente + vendedora */}
      <div className="space-y-1 text-xs text-muted-foreground">
        <p className="flex items-center gap-1.5 truncate">
          <User className="h-3 w-3 shrink-0" /> {data.customerName}
        </p>
        <p className="flex items-center gap-1.5 truncate">
          <Tag className="h-3 w-3 shrink-0" /> {data.sellerName}
        </p>
      </div>

      {/* rodape: sinais (NF, comprovante) + alerta */}
      <div className="mt-2 flex items-center gap-2 border-t border-border/60 pt-2">
        <Signal active={data.hasPaymentProof} icon={<Receipt className="h-3 w-3" />} label="Comprov." />
        <Signal active={data.hasInvoice} icon={<FileText className="h-3 w-3" />} label="NF" />
        {alerta && (
          <span className="ml-auto rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold text-destructive">
            Sem NF
          </span>
        )}
      </div>
    </button>
  );
}

function Signal({ active, icon, label }: { active?: boolean; icon: React.ReactNode; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
        active ? "bg-motorista/15 text-motorista" : "bg-secondary text-muted-foreground/60",
      )}
      title={active ? `${label}: anexado` : `${label}: pendente`}
    >
      {icon}{label}
    </span>
  );
}
