"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface FinHistProof { id: string; filePath: string; }
export interface FinHistItem {
  id: string;
  orderNumber: string;
  comandaNumber: string | null;
  customerName: string;
  sellerName: string;
  total: string;
  orderValue: string;
  freight: string;
  processedAt: string; // ISO — quando o Financeiro processou
  outcome: "APROVADO" | "PAGO" | "INTERROMPIDO";
  outcomeLabel: string; // texto do desfecho (ex.: nome do status de pagamento)
  cnpjName: string | null;
  paymentMethodName: string | null;
  bankName: string | null;
  paymentStatusName: string | null;
  trackingCode: string | null;
  paymentNotes: string | null;
  shippingNotes: string | null;
  paymentProofPath: string | null;
  invoicePath: string | null;
  paymentProofs: FinHistProof[]; // comprovantes da Vendedora
  financeProofs: FinHistProof[]; // comprovantes anexados pelo Financeiro
}

// Cor do selo por desfecho.
function outcomeBadge(outcome: FinHistItem["outcome"]) {
  if (outcome === "INTERROMPIDO") return "bg-red-600/90 text-white border-red-700";
  if (outcome === "PAGO") return "bg-sky-500/90 text-white border-sky-600";
  return "bg-emerald-600/90 text-white border-emerald-700"; // APROVADO
}

export function FinHistoricoList({ orders }: { orders: FinHistItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {orders.map((o) => {
        const open = openId === o.id;
        return (
          <Card key={o.id} className="overflow-hidden animate-fade-in-up">
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
                <p className="truncate text-xs text-muted-foreground">
                  {o.customerName} · {new Date(o.processedAt).toLocaleString("pt-BR")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <Badge className={cn("border", outcomeBadge(o.outcome))}>{o.outcomeLabel}</Badge>
                <span className="font-data text-sm font-medium">{o.total}</span>
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
              </div>
            </button>

            {open && (
              <div className="space-y-3 border-t border-border px-4 py-3 text-sm animate-fade-in">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Info label="Pedido" value={o.orderNumber} />
                  <Info label="Comanda" value={o.comandaNumber ?? "—"} />
                  <Info label="Cliente" value={o.customerName} />
                  <Info label="Vendedor(a)" value={o.sellerName} />
                  <Info label="Valor do pedido" value={o.orderValue} />
                  <Info label="Frete" value={o.freight} />
                  <Info label="Total" value={o.total} />
                  <Info label="CNPJ" value={o.cnpjName ?? "—"} />
                  <Info label="Forma de pagamento" value={o.paymentMethodName ?? "—"} />
                  <Info label="Banco" value={o.bankName ?? "—"} />
                  <Info label="Status de pagamento" value={o.paymentStatusName ?? "—"} />
                  <Info label="Rastreio" value={o.trackingCode ?? "—"} />
                  <Info label="Processado em" value={new Date(o.processedAt).toLocaleString("pt-BR")} />
                </div>

                {o.paymentNotes?.trim() && (
                  <div className="rounded-lg border-2 border-orange-400/60 bg-orange-100/60 p-3 dark:bg-orange-400/10">
                    <p className="mb-0.5 text-xs font-semibold text-orange-800 dark:text-orange-200">Observações de Pagamento</p>
                    <p className="whitespace-pre-wrap text-orange-900 dark:text-orange-100">{o.paymentNotes}</p>
                  </div>
                )}
                {o.shippingNotes?.trim() && (
                  <div>
                    <p className="text-xs text-muted-foreground">Observações de Envio</p>
                    <p className="whitespace-pre-wrap">{o.shippingNotes}</p>
                  </div>
                )}

                {(o.paymentProofPath || o.invoicePath) && (
                  <div className="flex flex-wrap gap-4">
                    {o.paymentProofPath && (
                      <a href={o.paymentProofPath} target="_blank" rel="noreferrer" className="text-primary underline">
                        Comprovante (Vendas)
                      </a>
                    )}
                    {o.invoicePath && (
                      <a href={o.invoicePath} target="_blank" rel="noreferrer" className="text-primary underline">
                        Nota Fiscal
                      </a>
                    )}
                  </div>
                )}

                {o.paymentProofs.length > 0 && (
                  <ProofGallery label="Comprovantes de pagamento (Vendas)" proofs={o.paymentProofs} />
                )}
                {o.financeProofs.length > 0 && (
                  <ProofGallery label="Comprovantes do Financeiro" proofs={o.financeProofs} />
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

function ProofGallery({ label, proofs }: { label: string; proofs: FinHistProof[] }) {
  return (
    <div>
      <p className="mb-1 font-medium">{label}:</p>
      <div className="flex flex-wrap gap-2">
        {proofs.map((p) => (
          <a key={p.id} href={p.filePath} target="_blank" rel="noreferrer">
            <img src={p.filePath} alt="comprovante" className="h-28 w-28 rounded-lg object-cover" />
          </a>
        ))}
      </div>
    </div>
  );
}
