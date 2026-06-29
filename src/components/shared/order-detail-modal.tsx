"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { STATUS_LABEL } from "@/lib/order-flow";
import { formatBRL } from "@/lib/utils";
import { StatusBadge } from "@/components/shared/status-badge";
import { uploadInvoiceBase64 } from "@/lib/actions/sales";
import { shrinkImageToBase64 } from "@/lib/client-image";
import { Button } from "@/components/ui/button";

interface OrderDetail {
  id: string;
  orderNumber: string;
  comandaNumber: string | null;
  status: keyof typeof STATUS_LABEL;
  orderValue: string;
  freight: string;
  total: string;
  notes: string | null;
  paymentProofPath: string | null;
  invoicePath: string | null;
  trackingCode: string | null;
  cnpj: { name: string; document: string } | null;
  customer: { name: string };
  seller: { name: string };
  store: { name: string };
  orderType: { name: string };
  operation: { code: string; name: string };
  paymentMethod: { name: string };
  shippingMethod: { name: string };
  paymentStatus: { name: string } | null;
  delivery: {
    status: string;
    driver: { name: string } | null;
    proofs: { id: string; filePath: string }[];
  } | null;
  history: { id: string; status: keyof typeof STATUS_LABEL; note: string | null; createdAt: string }[];
}

export function OrderDetailModal({
  orderId,
  onClose,
  canManage = false,
}: {
  orderId: string;
  onClose: () => void;
  canManage?: boolean;
}) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nfBusy, setNfBusy] = useState(false);
  const [nfMsg, setNfMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  const router = useRouter();

  async function handleDelete() {
    if (!order) return;
    setDelBusy(true);
    const mod = await import("@/lib/actions/orders");
    const res = await mod.deleteOrder(order.id);
    setDelBusy(false);
    if (res.ok) { onClose(); router.refresh(); }
    else { setError(res.error); setConfirmDel(false); }
  }

  function onInvoiceFile(e: React.ChangeEvent<HTMLInputElement>) {
    setNfMsg(null);
    const file = e.target.files?.[0];
    if (!file || !order) return;
    setNfBusy(true);
    (async () => {
      const r = await shrinkImageToBase64(file, { maxDimension: 1600, quality: 0.8 });
      if (r.error) { setNfBusy(false); setNfMsg({ ok: false, text: r.error }); return; }
      const res = await uploadInvoiceBase64({ orderId: order.id, base64: r.base64 });
      setNfBusy(false);
      if (res.ok) {
        setNfMsg({ ok: true, text: "Nota Fiscal anexada." });
        setOrder({ ...order, invoicePath: res.data.filePath });
        router.refresh();
      } else setNfMsg({ ok: false, text: res.error });
    })();
    e.target.value = "";
  }

  useEffect(() => {
    let active = true;
    fetch(`/api/orders/${orderId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => active && setOrder(data))
      .catch(() => active && setError("Nao foi possivel carregar o pedido."));
    return () => {
      active = false;
    };
  }, [orderId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {error && <p className="text-destructive">{error}</p>}
        {!order && !error && <p className="text-muted-foreground">Carregando...</p>}

        {order && (
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold">
                  Pedido {order.orderNumber}
                  {order.comandaNumber && ` · Comanda ${order.comandaNumber}`}
                </h2>
                <StatusBadge status={order.status} />
              </div>
              <button onClick={onClose} className="text-2xl leading-none text-muted-foreground">
                ×
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Cliente" value={order.customer.name} />
              <Info label="Vendedora" value={order.seller.name} />
              <Info label="Loja" value={order.store.name} />
              <Info label="Tipo" value={order.orderType.name} />
              <Info label="Operacao" value={`${order.operation.code} - ${order.operation.name}`} />
              <Info label="Pagamento" value={order.paymentMethod.name} />
              <Info label="Envio" value={order.shippingMethod.name} />
              <Info label="Status pgto" value={order.paymentStatus?.name ?? "—"} />
              <Info label="CNPJ" value={order.cnpj ? order.cnpj.name : "—"} />
              <Info label="Rastreio" value={order.trackingCode ?? "—"} />
            </div>

            {/* Observações do pedido (sempre exibidas quando o card é expandido). */}
            <div>
              <h3 className="mb-1 font-semibold">Observações</h3>
              <div className="rounded-lg border border-border bg-secondary/30 p-3 text-sm whitespace-pre-wrap">
                {order.notes?.trim() ? order.notes : <span className="text-muted-foreground">Nenhuma observação registrada.</span>}
              </div>
            </div>

            <div>
              <h3 className="mb-1 font-semibold">Valores</h3>
              <div className="rounded-lg border border-border p-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Valor do pedido</span><span className="font-data">{formatBRL(order.orderValue)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Frete</span><span className="font-data">{formatBRL(order.freight)}</span></div>
                <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold"><span>Total</span><span className="font-data">{formatBRL(order.total)}</span></div>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 text-sm">
              <FileLink label="Comprovante pagamento" path={order.paymentProofPath} />
              <FileLink label="Nota Fiscal" path={order.invoicePath} />
            </div>

            {/* Upload de NF: liberado apos confirmacao do pagamento (comanda gerada). */}
            {order.comandaNumber && (
              <div className="rounded-lg border border-border p-3">
                <p className="mb-1 text-sm font-semibold">Nota Fiscal</p>
                {order.status === "PROCESSANDO" && !order.invoicePath && (
                  <div className="mb-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                    ⚠ Pedido em Processando sem Nota Fiscal. O avanço está bloqueado até anexar a NF.
                  </div>
                )}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  onChange={onInvoiceFile} disabled={nfBusy}
                  className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-distribuicao file:px-4 file:py-2 file:text-sm file:font-medium file:text-distribuicao-fg hover:file:opacity-90" />
                <p className="mt-1 text-xs text-muted-foreground">
                  {order.invoicePath ? "NF anexada. Enviar outra substitui a atual." : "Clique para anexar a Nota Fiscal."}
                  {nfBusy && " Enviando..."}
                </p>
                {nfMsg && <p className={`mt-1 text-sm ${nfMsg.ok ? "text-motorista" : "text-destructive"}`}>{nfMsg.text}</p>}
              </div>
            )}

            {order.delivery && (
              <div>
                <h3 className="mb-1 font-semibold">Entrega</h3>
                <p className="text-sm">
                  Status: {order.delivery.status}
                  {order.delivery.driver && ` · Motorista: ${order.delivery.driver.name}`}
                </p>
                {order.delivery.proofs.length > 0 && (
                  <div className="mt-2 flex gap-2">
                    {order.delivery.proofs.map((p) => (
                      <a key={p.id} href={p.filePath} target="_blank" rel="noreferrer">
                        <img src={p.filePath} alt="comprovante" className="h-24 w-24 rounded object-cover" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div>
              <h3 className="mb-1 font-semibold">Historico</h3>
              <ul className="space-y-1 text-sm">
                {order.history.map((h) => (
                  <li key={h.id} className="flex justify-between">
                    <span>{STATUS_LABEL[h.status]}{h.note ? ` — ${h.note}` : ""}</span>
                    <span className="text-muted-foreground">
                      {new Date(h.createdAt).toLocaleString("pt-BR")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Ações de Gestão: editar e excluir o pedido. */}
            {canManage && (
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
                {error && <span className="mr-auto text-sm text-destructive">{error}</span>}
                <Button variant="outline" size="sm"
                  onClick={() => { onClose(); router.push(`/vendas/${order.id}/editar`); }}>
                  Editar pedido
                </Button>
                {confirmDel ? (
                  <span className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Confirmar exclusão?</span>
                    <Button variant="destructive" size="sm" onClick={handleDelete} disabled={delBusy}>
                      {delBusy ? "Excluindo..." : "Sim, excluir"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmDel(false)} disabled={delBusy}>Não</Button>
                  </span>
                ) : (
                  <Button variant="destructive" size="sm" onClick={() => setConfirmDel(true)}>Excluir</Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p>{value}</p>
    </div>
  );
}

function FileLink({ label, path }: { label: string; path: string | null }) {
  if (!path) return <span className="text-muted-foreground">{label}: —</span>;
  return (
    <a href={path} target="_blank" rel="noreferrer" className="text-brand underline">
      {label}
    </a>
  );
}
