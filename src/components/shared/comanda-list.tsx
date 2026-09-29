"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Pencil, Trash2, PackageMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { OrderCard, type OrderCardData } from "@/components/shared/order-card";
import { OrderFicha, type OrderDetail } from "@/components/shared/order-ficha";
import { EditProofsModal, type EditProof } from "@/components/shared/edit-proofs-modal";
import { ReturnModal } from "@/components/shared/return-modal";
import { deleteHistoryOrder } from "@/lib/actions/orders";

/**
 * LISTA DE COMANDAS DO HISTÓRICO — o card do Fluxo, expansível.
 * ---------------------------------------------------------------------------
 * Os três históricos (Vendas, Logística e Motorista) mostravam a mesma comanda
 * de três formas diferentes, cada uma com um recorte próprio dos dados. Esta
 * lista unifica as duas metades:
 *
 *   - FECHADO: o card do Fluxo de Pedidos (`OrderCard`), exatamente o mesmo
 *     componente, com bolinha de status, Comanda/Pedido, valor, cliente,
 *     vendedora e os sinais de Comprovante/NF. Sem os realces de atraso, que
 *     não dizem nada num pedido já encerrado.
 *   - ABERTO: a ficha completa (`OrderFicha`), a mesma do modal do Fluxo,
 *     carregada de `/api/orders/[id]` no primeiro clique.
 *
 * A ficha vem do servidor com o recorte por papel já aplicado (o motorista não
 * recebe valores, comprovantes, NF, devoluções nem itens de campanha). Isto é
 * intencional: esconder no cliente não esconde no servidor.
 *
 * O que cada tela liga a mais: `editableProofs` (Motorista — gerir as fotos da
 * entrega), `canReturn` e `campaigns` (Vendas — devolução e CRUD das peças de
 * campanha), `canDelete` (Gestão/Financeiro — exclusão definitiva).
 */

export interface ComandaListItem extends OrderCardData {
  /** Id da entrega. Necessário para editar as fotos (Histórico do Motorista). */
  deliveryId?: string | null;
  /** Valor atual da mercadoria (sem frete), base da devolução (Vendas). */
  orderValue?: number;
}

export function ComandaList({
  orders,
  driverMode = false,
  editableProofs = false,
  canDelete = false,
  canReturn = false,
  campaigns,
}: {
  orders: ComandaListItem[];
  /** Perfil MOTORISTA: ficha sem o pacote financeiro (igual ao Fluxo). */
  driverMode?: boolean;
  /** Exibe "Editar Entrega" (gestão das fotos) nos pedidos com entrega. */
  editableProofs?: boolean;
  /** Exibe "Excluir" — remoção DEFINITIVA do pedido. Gestão e Financeiro. */
  canDelete?: boolean;
  /** Exibe "Fazer devolução" (precisa de `orderValue` no item). */
  canReturn?: boolean;
  /** Campanhas ativas. Presente = CRUD das peças de campanha habilitado. */
  campaigns?: { id: string; name: string }[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {orders.map((o) => (
        <ComandaRow
          key={o.id}
          item={o}
          open={openId === o.id}
          onToggle={() => setOpenId(openId === o.id ? null : o.id)}
          driverMode={driverMode}
          editableProofs={editableProofs}
          canDelete={canDelete}
          canReturn={canReturn}
          campaigns={campaigns}
        />
      ))}
    </div>
  );
}

function ComandaRow({
  item: o,
  open,
  onToggle,
  driverMode,
  editableProofs,
  canDelete,
  canReturn,
  campaigns,
}: {
  item: ComandaListItem;
  open: boolean;
  onToggle: () => void;
  driverMode: boolean;
  editableProofs: boolean;
  canDelete: boolean;
  canReturn: boolean;
  campaigns?: { id: string; name: string }[];
}) {
  const router = useRouter();
  // A ficha é buscada no PRIMEIRO clique e fica em memória: reabrir o mesmo
  // bloco não repete a consulta.
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [returning, setReturning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function toggle() {
    const abrindo = !open;
    onToggle();
    if (abrindo && !detail && !loading) carregar();
  }

  function carregar() {
    setLoading(true);
    setLoadError(null);
    fetch(`/api/orders/${o.id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => setDetail(data))
      .catch(() => setLoadError("Não foi possível carregar a comanda."))
      .finally(() => setLoading(false));
  }

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

  // Fotos da entrega editáveis quando a tela permite E o pedido tem entrega.
  const podeEditar = editableProofs && !!o.deliveryId;
  // Devolução precisa do valor atual da mercadoria (a tela de Vendas informa).
  const podeDevolver = canReturn && typeof o.orderValue === "number";
  const temAcoes = podeEditar || podeDevolver || canDelete;

  // Fotos atuais da entrega, para o modal de edição e para atualizar a ficha
  // depois de salvar.
  const proofs: EditProof[] = detail?.delivery?.proofs ?? [];

  return (
    <div>
      {/* FECHADO: o card do Fluxo. Ao abrir, os cantos de baixo ficam retos e o
          hover para de levantar — o card e o painel viram um bloco só. */}
      <OrderCard
        data={o}
        onClick={toggle}
        hoverLift={!open}
        className={cn(open && "rounded-b-none")}
        action={
          <button
            type="button"
            onClick={toggle}
            className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            aria-expanded={open}
            aria-label={open ? "Recolher comanda" : "Ver comanda completa"}
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          </button>
        }
      />

      {/* ABERTO: a ficha completa, no mesmo bloco. */}
      {open && (
        <div className="rounded-b-xl border border-t-0 border-border bg-card px-4 py-4 text-sm animate-fade-in">
          {loading && <p className="text-muted-foreground">Carregando comanda...</p>}
          {loadError && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-destructive">{loadError}</p>
              <Button variant="outline" size="sm" onClick={carregar}>Tentar de novo</Button>
            </div>
          )}
          {detail && (
            <OrderFicha
              order={detail}
              onChange={setDetail}
              driverMode={driverMode}
              compact
              campaignEdit={campaigns?.length ? { campaigns } : undefined}
              footer={
                temAcoes ? (
                  <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
                    {erro && <span className="mr-auto text-sm text-destructive">{erro}</span>}
                    {podeEditar && (
                      <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                        <Pencil className="h-3.5 w-3.5" /> Editar Entrega
                      </Button>
                    )}
                    {podeDevolver && (
                      <Button variant="outline" size="sm" onClick={() => setReturning(true)}>
                        <PackageMinus className="h-3.5 w-3.5" /> Fazer devolução
                      </Button>
                    )}
                    {canDelete && (
                      <Button variant="destructive" size="sm" onClick={() => setConfirming(true)}>
                        <Trash2 className="mr-1 h-3.5 w-3.5" /> Excluir
                      </Button>
                    )}
                  </div>
                ) : null
              }
            />
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

      {returning && podeDevolver && (
        <ReturnModal
          orderId={o.id}
          orderLabel={o.comandaNumber ? `Pedido ${o.orderNumber} · Comanda ${o.comandaNumber}` : `Pedido ${o.orderNumber}`}
          currentValue={o.orderValue as number}
          onClose={() => setReturning(false)}
          onSaved={() => {
            // A devolução muda valores e peças de campanha: relê a ficha.
            carregar();
            router.refresh();
          }}
        />
      )}

      {editing && o.deliveryId && detail && (
        <EditProofsModal
          deliveryId={o.deliveryId}
          initialProofs={proofs}
          onClose={() => setEditing(false)}
          onSaved={(next) =>
            setDetail(
              detail.delivery
                ? { ...detail, delivery: { ...detail.delivery, proofs: next } }
                : detail,
            )
          }
        />
      )}
    </div>
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
