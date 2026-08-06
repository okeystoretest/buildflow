"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ExternalLink, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { payDriverDelivery } from "@/lib/actions/driver-payments";
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
  driverId: string | null;
  driverPixKey: string | null;
  assignedAt: string | null;
  startedAt: string | null;
  deliveredAt: string | null;
  failReason: string | null;
  // Pagamento ao motorista (Financeiro)
  paid: boolean;
  paymentAmount: string | null;
  paymentPixKey: string | null;
  paidAt: string | null;
  // Anexos
  proofs: EntregaProof[];
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function EntregasList({
  orders,
  enablePayment = false,
}: {
  orders: EntregaItem[];
  // Quando true (tela de "Pagamentos de Motoristas" do Financeiro), habilita o
  // botão "Pagar Entrega" nos pedidos ENTREGUE.
  enablePayment?: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  // Fluxo de pagamento: 1) modal com PIX + valor; 2) modal de confirmação.
  const router = useRouter();
  const [pending, start] = useTransition();
  const [payOrder, setPayOrder] = useState<EntregaItem | null>(null);
  const [amount, setAmount] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openPay(o: EntregaItem) {
    setPayOrder(o);
    setAmount("");
    setConfirming(false);
    setError(null);
  }
  function closePay() {
    setPayOrder(null);
    setAmount("");
    setConfirming(false);
    setError(null);
  }
  function askConfirm() {
    setError(null);
    const value = Number(amount.replace(",", "."));
    if (!(value > 0)) { setError("Informe um valor de entrega maior que zero."); return; }
    setConfirming(true);
  }
  function confirmPay() {
    if (!payOrder) return;
    const value = Number(amount.replace(",", "."));
    setError(null);
    start(async () => {
      const res = await payDriverDelivery({ orderId: payOrder.id, amount: value });
      if (res.ok) { closePay(); router.refresh(); }
      else { setError(res.error); setConfirming(false); }
    });
  }

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
                {enablePayment && o.paid && (
                  <Badge className="bg-financeiro/15 text-financeiro">Pago</Badge>
                )}
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

                {/* Pagamento ao motorista (só na tela do Financeiro). */}
                {enablePayment && (
                  <Section title="Pagamento da Entrega">
                    <Info label="Chave PIX do motorista" value={o.driverPixKey ?? "—"} />
                    {o.paid ? (
                      <>
                        <Info label="Valor pago" value={o.paymentAmount ?? "—"} />
                        <Info label="Pago em" value={fmtDateTime(o.paidAt)} />
                      </>
                    ) : (
                      <div className="col-span-2 flex items-end sm:col-span-3">
                        <Button
                          variant="financeiro"
                          size="sm"
                          onClick={() => openPay(o)}
                          disabled={!o.driverId}
                          title={!o.driverId ? "Pedido sem motorista atribuído" : undefined}
                        >
                          <Wallet className="h-4 w-4" /> Pagar Entrega
                        </Button>
                      </div>
                    )}
                  </Section>
                )}

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

      {/* Modal 1: exibe a Chave PIX do motorista e o campo "Valor da Entrega". */}
      {payOrder && !confirming && (
        <Modal onClose={closePay}>
          <h2 className="mb-1 text-lg font-bold">Pagar entrega</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Pedido {payOrder.orderNumber}
            {payOrder.driverName ? ` · Motorista: ${payOrder.driverName}` : ""}
          </p>

          <div className="mb-3 rounded-lg border border-border bg-secondary/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">Chave PIX do motorista</p>
            <p className="break-words font-data text-sm font-medium">
              {payOrder.driverPixKey ?? "— (motorista sem chave PIX cadastrada)"}
            </p>
          </div>

          <div className="mb-3 space-y-1.5">
            <Label>Valor da Entrega *</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </div>

          {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closePay}>Cancelar</Button>
            <Button variant="financeiro" onClick={askConfirm}>Confirmar Pagamento</Button>
          </div>
        </Modal>
      )}

      {/* Modal 2: verificação final. */}
      {payOrder && confirming && (
        <Modal onClose={() => setConfirming(false)}>
          <h2 className="mb-1 text-lg font-bold">Tem certeza de que deseja realizar esta ação?</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Pagamento da entrega do pedido {payOrder.orderNumber}
            {payOrder.driverName ? ` para ${payOrder.driverName}` : ""}.
          </p>
          {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={pending}>Voltar</Button>
            <Button variant="financeiro" onClick={confirmPay} disabled={pending}>
              {pending ? "Confirmando..." : "Sim, confirmar"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
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
