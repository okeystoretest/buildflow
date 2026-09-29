"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { OrderFicha, type OrderDetail } from "@/components/shared/order-ficha";

/**
 * MODAL DO FLUXO DE PEDIDOS — a moldura em volta da ficha da comanda.
 *
 * O detalhamento em si mora em `OrderFicha` (src/components/shared/order-ficha.tsx),
 * compartilhado com os históricos de Vendas, Logística e Motorista. Aqui ficam
 * só as responsabilidades da janela: buscar o pedido, o portal, o ESC, o fundo
 * escuro e as ações de Gestão no rodapé.
 */
export function OrderDetailModal({
  orderId,
  onClose,
  canManage = false,
  driverMode = false,
}: {
  orderId: string;
  onClose: () => void;
  canManage?: boolean;
  // Modo motorista: observacao em destaque, SEM historico, SEM valores/edicao.
  driverMode?: boolean;
}) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  // Alvo do portal. Em tela cheia, o navegador so pinta descendentes do
  // elemento fullscreen; se o modal for pro <body> ele existe mas fica INVISIVEL.
  // Por isso ancoramos o portal no fullscreenElement quando ele existe.
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
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

  // Fecha com a tecla ESC (bom UX e garante saida mesmo se o clique falhar).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Define/atualiza o alvo do portal conforme entra/sai da tela cheia.
  // fullscreenElement existe -> portal dentro dele (fica visivel).
  // Sem tela cheia -> volta pro <body> (comportamento padrao).
  useEffect(() => {
    const sync = () =>
      setPortalTarget((document.fullscreenElement as HTMLElement | null) ?? document.body);
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  // Renderiza via PORTAL no <body>. Motivo: cards ancestrais usam transform
  // (card-hover), e um ancestral com transform PRENDE o position:fixed, fazendo
  // o modal aparecer no lugar errado e sem cobrir a tela. O portal escapa disso.
  if (typeof document === "undefined" || !portalTarget) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {error && <p className="text-destructive">{error}</p>}
        {!order && !error && <p className="text-muted-foreground">Carregando...</p>}

        {order && (
          <OrderFicha
            order={order}
            onChange={setOrder}
            driverMode={driverMode}
            headerAction={
              <button onClick={onClose} className="text-2xl leading-none text-muted-foreground">
                ×
              </button>
            }
            footer={
              // Ações de Gestão: editar e excluir o pedido.
              canManage ? (
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
              ) : null
            }
          />
        )}
      </div>
    </div>,
    portalTarget,
  );
}
