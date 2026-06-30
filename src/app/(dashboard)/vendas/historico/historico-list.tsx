"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface HistoricoProof { id: string; filePath: string; }
export interface HistoricoItem {
  id: string;
  orderNumber: string;
  comandaNumber: string | null;
  customerName: string;
  total: string;
  driverName: string | null;
  paymentProofPath: string | null;
  invoicePath: string | null;
  trackingCode: string | null;
  proofs: HistoricoProof[];
}

// Lista de comandas concluídas. Cada item começa recolhido e expande ao clicar,
// no mesmo espírito do Fluxo de Pedidos (clicar para ver o detalhamento).
export function HistoricoList({ orders }: { orders: HistoricoItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {orders.map((o) => {
        const open = openId === o.id;
        return (
          <Card key={o.id} className="overflow-hidden animate-fade-in-up">
            {/* Cabeçalho clicável (sempre visível) */}
            <button
              type="button"
              onClick={() => setOpenId(open ? null : o.id)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  Pedido {o.orderNumber}
                  {o.comandaNumber && <span className="text-muted-foreground"> · Comanda {o.comandaNumber}</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">{o.customerName}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="font-data text-sm font-medium">{o.total}</span>
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
              </div>
            </button>

            {/* Detalhamento (expande ao clicar) */}
            {open && (
              <div className="space-y-3 border-t border-border px-4 py-3 text-sm animate-fade-in">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Info label="Pedido" value={o.orderNumber} />
                  <Info label="Comanda" value={o.comandaNumber ?? "—"} />
                  <Info label="Cliente" value={o.customerName} />
                  <Info label="Total" value={o.total} />
                  <Info label="Motorista" value={o.driverName ?? "—"} />
                  <Info label="Rastreio" value={o.trackingCode ?? "—"} />
                </div>

                {(o.paymentProofPath || o.invoicePath) && (
                  <div className="flex flex-wrap gap-4">
                    {o.paymentProofPath && (
                      <a href={o.paymentProofPath} target="_blank" rel="noreferrer" className="text-primary underline">
                        Comprovante de pagamento
                      </a>
                    )}
                    {o.invoicePath && (
                      <a href={o.invoicePath} target="_blank" rel="noreferrer" className="text-primary underline">
                        Nota Fiscal
                      </a>
                    )}
                  </div>
                )}

                {o.proofs.length > 0 && (
                  <div>
                    <p className="mb-1 font-medium">Comprovante de entrega:</p>
                    <div className="flex flex-wrap gap-2">
                      {o.proofs.map((p) => (
                        <a key={p.id} href={p.filePath} target="_blank" rel="noreferrer">
                          <img src={p.filePath} alt="entrega" className="h-28 w-28 rounded-lg object-cover" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
