"use client";

import { useState } from "react";
import { ChevronDown, Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EditProofsModal } from "@/app/(dashboard)/motorista/historico/edit-proofs-modal";

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
  // Id da entrega (Delivery). Necessário para editar as fotos no histórico do
  // motorista. Opcional: telas que não editam (Vendas) não precisam informar.
  deliveryId?: string | null;
}

// Lista de comandas concluídas. Cada item começa recolhido e expande ao clicar,
// no mesmo espírito do Fluxo de Pedidos (clicar para ver o detalhamento).
//
// `editableProofs`: quando true, exibe a ação "Editar Entrega" nos itens que têm
// entrega (deliveryId), abrindo o modal de gestão de fotos. Usado no Histórico
// do Motorista. Nas demais telas (Vendas) fica desligado — comportamento igual.
export function HistoricoList({
  orders,
  editableProofs = false,
}: {
  orders: HistoricoItem[];
  editableProofs?: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {orders.map((o) => (
        <HistoricoRow
          key={o.id}
          item={o}
          open={openId === o.id}
          onToggle={() => setOpenId(openId === o.id ? null : o.id)}
          editableProofs={editableProofs}
        />
      ))}
    </div>
  );
}

function HistoricoRow({
  item: o,
  open,
  onToggle,
  editableProofs,
}: {
  item: HistoricoItem;
  open: boolean;
  onToggle: () => void;
  editableProofs: boolean;
}) {
  // Estado local das fotos, para refletir edições em tempo real sem recarregar.
  const [proofs, setProofs] = useState<HistoricoProof[]>(o.proofs);
  const [editing, setEditing] = useState(false);

  // Só dá para editar quando a tela permite E o pedido tem entrega (Delivery).
  const podeEditar = editableProofs && !!o.deliveryId;

  return (
    <Card className="overflow-hidden animate-fade-in-up">
      {/* Cabeçalho clicável (sempre visível) */}
      <button
        type="button"
        onClick={onToggle}
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

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="font-medium">Comprovante de entrega:</p>
              {podeEditar && (
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  <Pencil className="h-3.5 w-3.5" /> Editar Entrega
                </Button>
              )}
            </div>
            {proofs.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {proofs.map((p) => (
                  <a key={p.id} href={p.filePath} target="_blank" rel="noreferrer">
                    <img src={p.filePath} alt="entrega" className="h-28 w-28 rounded-lg object-cover" />
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Nenhuma foto anexada.</p>
            )}
          </div>
        </div>
      )}

      {editing && o.deliveryId && (
        <EditProofsModal
          deliveryId={o.deliveryId}
          initialProofs={proofs}
          onClose={() => setEditing(false)}
          onSaved={(next) => setProofs(next)}
        />
      )}
    </Card>
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
