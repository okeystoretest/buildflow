"use client";

import type { OrderStatus } from "@prisma/client";
import { FileText, Receipt, User, Tag, Clock } from "lucide-react";
import { STATUS_STYLE, type StageAlert } from "@/lib/order-flow";
import { cn } from "@/lib/utils";

export interface OrderCardData {
  id: string;
  status: OrderStatus;
  orderNumber: string;
  comandaNumber: string | null;
  customerName: string;
  customerCode?: string | null;
  sellerName: string;
  total?: string;
  hasInvoice: boolean;
  hasPaymentProof?: boolean;
  approvedByFinance: boolean;
  // ISO da entrada em ENTREGUE (usado para sumir do fluxo após 15 min).
  deliveredAt?: string | null;
  // ISO de quando o pedido entrou no status atual (para alerta temporal).
  statusSince?: string | null;
}

export function OrderCard({
  data,
  onClick,
  style,
  action,
  stageAlert = "none",
}: {
  data: OrderCardData;
  onClick?: () => void;
  style?: React.CSSProperties;
  // Slot de acao renderizado DENTRO do card (ex.: seta de mudar status).
  // Fica fora da area clicavel principal para nao abrir o modal por engano.
  action?: React.ReactNode;
  // Nivel de alerta temporal calculado pelo board (aviso/alerta/nenhum).
  stageAlert?: StageAlert;
}) {
  const s = STATUS_STYLE[data.status];
  // Alerta visual: processando sem NF
  const alerta = data.status === "PROCESSANDO" && !data.hasInvoice;

  // Regra de exibicao: se ja existe comanda, ela tem prioridade; senao, pedido.
  const principal = data.comandaNumber
    ? { rotulo: "Comanda", valor: data.comandaNumber }
    : { rotulo: "Pedido", valor: data.orderNumber };

  // Borda/realce por tempo de permanencia (Gestao > Etapas). O "Sem NF" tem
  // prioridade visual (vermelho proprio); fora isso aplicamos warn/alert.
  const timeBorder =
    !alerta && stageAlert === "alert"
      ? "border-red-500/70 ring-1 ring-red-500/30 hover:shadow-md hover:shadow-red-500/10"
      : !alerta && stageAlert === "warn"
        ? "border-amber-500/70 ring-1 ring-amber-500/25 hover:shadow-md hover:shadow-amber-500/10"
        : null;

  return (
    <div
      style={style}
      className={cn(
        "card-hover group w-full rounded-xl border bg-card p-3 text-left shadow-sm animate-fade-in-up",
        alerta
          ? "border-destructive/50 ring-1 ring-destructive/20 hover:shadow-md hover:shadow-destructive/10"
          : timeBorder ?? "border-border hover:border-primary/40 hover:shadow-md",
      )}
    >
      {/* Area clicavel que abre o modal (todo o corpo do card). */}
      <button onClick={onClick} className="block w-full text-left">
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

        {/* corpo: cliente (com codigo) + vendedora */}
        <div className="space-y-1 text-xs text-muted-foreground">
          <p className="flex items-center gap-1.5 truncate">
            <User className="h-3 w-3 shrink-0" />
            <span className="truncate">{data.customerName}</span>
            {data.customerCode && (
              <span className="font-data shrink-0 rounded bg-secondary px-1 text-[10px] text-foreground/70">
                {data.customerCode}
              </span>
            )}
          </p>
          <p className="flex items-center gap-1.5 truncate">
            <Tag className="h-3 w-3 shrink-0" /> {data.sellerName}
          </p>
        </div>
      </button>

      {/* rodape: sinais (NF, comprovante) + alerta + acao (seta de status) */}
      <div className="mt-2 flex items-center gap-2 border-t border-border/60 pt-2">
        <Signal active={data.hasPaymentProof} icon={<Receipt className="h-3 w-3" />} label="Comprov." />
        <Signal active={data.hasInvoice} icon={<FileText className="h-3 w-3" />} label="NF" />
        {alerta && (
          <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold text-destructive">
            Sem NF
          </span>
        )}
        {!alerta && stageAlert !== "none" && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
              stageAlert === "alert"
                ? "bg-red-500/15 text-red-600 dark:text-red-400"
                : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
            )}
            title={stageAlert === "alert" ? "Tempo limite excedido" : "Atenção: 50% do tempo limite"}
          >
            <Clock className="h-3 w-3" />
            {stageAlert === "alert" ? "Atrasado" : "Atenção"}
          </span>
        )}
        {action && <span className="ml-auto shrink-0">{action}</span>}
      </div>
    </div>
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
