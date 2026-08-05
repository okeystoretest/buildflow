"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Ficha completa de uma entrega concluída. Sem ocultar/resumir: exibe todos os
// dados da venda e da entrega. Compartilhada pelos históricos de Entregas da
// Logística e do Financeiro.
export interface EntregaProof {
  id: string;
  filePath: string;
  label: string;
}

export interface EntregaItem {
  id: string;
  orderNumber: string;
  comandaNumber: string | null;
  status: string;
  // Cliente
  customerName: string;
  customerCode: string | null;
  // Venda
  sellerName: string;
  storeName: string | null;
  originStoreName: string | null;
  orderTypeName: string | null;
  operationName: string | null;
  shippingMethodName: string | null;
  cnpjName: string | null;
  paymentMethodName: string | null;
  bankName: string | null;
  paymentStatusName: string | null;
  total: string;
  orderValue: string;
  freight: string;
  trackingCode: string | null;
  paymentNotes: string | null;
  shippingNotes: string | null;
  // Endereço de entrega (Excursão)
  address: string | null;
  // Entrega
  driverName: string | null;
  assignedAt: string | null;
  startedAt: string | null;
  deliveredAt: string | null;
  failReason: string | null;
  // Anexos
  proofs: EntregaProof[];
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function EntregasList({ orders }: { orders: EntregaItem[] }) {
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
                  {o.customerName} · Vendedora: {o.sellerName}
                  {o.driverName ? ` · Motorista: ${o.driverName}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <Badge className="bg-motorista/15 text-motorista">Entregue</Badge>
                <span className="font-data text-sm font-medium">{o.total}</span>
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
              </div>
            </button>

            {open && (
              <div className="space-y-4 border-t border-border px-4 py-4 text-sm animate-fade-in">
                <Section title="Cliente">
                  <Info label="Código" value={o.customerCode ?? "—"} />
                  <Info label="Nome" value={o.customerName} />
                </Section>

                <Section title="Venda">
                  <Info label="Pedido" value={o.orderNumber} />
                  <Info label="Comanda" value={o.comandaNumber ?? "—"} />
                  <Info label="Vendedora" value={o.sellerName} />
                  <Info label="Loja" value={o.storeName ?? "—"} />
                  <Info label="Loja de Origem" value={o.originStoreName ?? "—"} />
                  <Info label="Tipo de Pedido" value={o.orderTypeName ?? "—"} />
                  <Info label="Código da Operação" value={o.operationName ?? "—"} />
                  <Info label="Forma de Envio" value={o.shippingMethodName ?? "—"} />
                  <Info label="Código de Rastreio" value={o.trackingCode ?? "—"} />
                </Section>

                <Section title="Financeiro">
                  <Info label="CNPJ" value={o.cnpjName ?? "—"} />
                  <Info label="Forma de Pagamento" value={o.paymentMethodName ?? "—"} />
                  <Info label="Banco" value={o.bankName ?? "—"} />
                  <Info label="Status de Pagamento" value={o.paymentStatusName ?? "—"} />
                  <Info label="Valor da Mercadoria" value={o.orderValue} />
                  <Info label="Frete" value={o.freight} />
                  <Info label="Total" value={o.total} />
                </Section>

                {o.address && (
                  <Section title="Endereço de Entrega">
                    <Info label="Endereço" value={o.address} full />
                  </Section>
                )}

                <Section title="Entrega">
                  <Info label="Motorista" value={o.driverName ?? "—"} />
                  <Info label="Atribuída em" value={fmtDateTime(o.assignedAt)} />
                  <Info label="Iniciada em" value={fmtDateTime(o.startedAt)} />
                  <Info label="Entregue em" value={fmtDateTime(o.deliveredAt)} />
                  {o.failReason && <Info label="Observação de falha" value={o.failReason} full />}
                </Section>

                {(o.paymentNotes || o.shippingNotes) && (
                  <Section title="Observações">
                    {o.paymentNotes && <Info label="Pagamento" value={o.paymentNotes} full />}
                    {o.shippingNotes && <Info label="Envio" value={o.shippingNotes} full />}
                  </Section>
                )}

                {o.proofs.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Anexos</p>
                    <div className="flex flex-wrap gap-2">
                      {o.proofs.map((p) => (
                        <a
                          key={p.id}
                          href={p.filePath}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs transition-colors hover:bg-secondary"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          {p.label}
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{children}</div>
    </div>
  );
}

function Info({ label, value, full = false }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={cn("min-w-0", full && "col-span-2 sm:col-span-3")}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="break-words font-medium">{value}</p>
    </div>
  );
}
