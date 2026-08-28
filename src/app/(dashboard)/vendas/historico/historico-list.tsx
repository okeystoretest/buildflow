"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Pencil, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EditProofsModal } from "@/app/(dashboard)/motorista/historico/edit-proofs-modal";
import { deleteHistoryOrder } from "@/lib/actions/orders";

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
// `canDelete`: quando true, exibe a ação "Excluir" (remoção DEFINITIVA do pedido
// no banco). Restrito aos perfis GESTAO e FINANCEIRO — quem chama decide pela
// sessão, e a action `deleteHistoryOrder` reconfere o papel no servidor.
export function HistoricoList({
  orders,
  editableProofs = false,
  canDelete = false,
}: {
  orders: HistoricoItem[];
  editableProofs?: boolean;
  canDelete?: boolean;
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
          canDelete={canDelete}
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
  canDelete,
}: {
  item: HistoricoItem;
  open: boolean;
  onToggle: () => void;
  editableProofs: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  // Estado local das fotos, para refletir edições em tempo real sem recarregar.
  const [proofs, setProofs] = useState<HistoricoProof[]>(o.proofs);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Exclusão DEFINITIVA: a action apaga o pedido no banco (entrega e
  // comprovantes vão junto). Só Gestão e Financeiro veem o botão, e o servidor
  // reconfere o papel.
  function remover() {
    setErro(null);
    start(async () => {
      const res = await deleteHistoryOrder(o.id);
      if (res.ok) {
        setConfirming(false);
        router.refresh();
      } else {
        setErro(res.error);
      }
    });
  }

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

          {/* Exclusão definitiva — Gestão e Financeiro. */}
          {canDelete && (
            <div className="flex justify-end border-t border-border pt-3">
              <Button variant="destructive" size="sm" onClick={() => setConfirming(true)}>
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Excluir
              </Button>
            </div>
          )}
        </div>
      )}

      {confirming && (
        <ConfirmModal onClose={() => !pending && setConfirming(false)}>
          <h2 className="mb-1 text-lg font-bold">Excluir pedido</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Tem certeza que deseja excluir o pedido {o.orderNumber} do histórico? O
            registro é apagado definitivamente do banco e esta ação não pode ser desfeita.
          </p>
          {erro && <p className="mb-2 text-sm text-destructive">{erro}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={remover} disabled={pending}>
              {pending ? "Excluindo..." : "Excluir"}
            </Button>
          </div>
        </ConfirmModal>
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

function ConfirmModal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
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
