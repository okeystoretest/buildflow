"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, PackageMinus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/shared/modal";
import { OrderCard, type OrderCardData } from "@/components/shared/order-card";
import { OrderFicha, type OrderDetail } from "@/components/shared/order-ficha";
import { EditProofsModal, type EditProof } from "@/components/shared/edit-proofs-modal";
import { ReturnModal } from "@/components/shared/return-modal";
import { deleteHistoryOrder } from "@/lib/actions/orders";

/**
 * LISTA DE COMANDAS DO HISTÓRICO — a grade do Fluxo, com a ficha em modal.
 * ---------------------------------------------------------------------------
 * Os três históricos (Vendas, Logística e Motorista) mostravam a mesma comanda
 * de três formas diferentes, cada uma com um recorte próprio dos dados. Esta
 * lista unifica as duas metades:
 *
 *   - A GRADE: o card do Fluxo de Pedidos (`OrderCard`), exatamente o mesmo
 *     componente e a mesma grade de colunas, com bolinha de status,
 *     Comanda/Pedido, valor, cliente, vendedora e os sinais de Comprovante/NF.
 *     Sem os realces de atraso, que não dizem nada num pedido já encerrado.
 *   - O MODAL: a ficha completa (`OrderFicha`), a mesma do Fluxo, carregada de
 *     `/api/orders/[id]` ao abrir.
 *
 * ABRE EM MODAL, não para baixo. A expansão vertical empurrava os cards
 * seguintes tela abaixo: achar de novo a comanda que se estava lendo exigia
 * rolar de volta, e com a comanda aberta não dava para comparar com nenhuma
 * outra. É também o mecanismo que o Fluxo de Pedidos da Logística já usa — as
 * duas telas mostram o mesmo pedido, e abriam de dois jeitos diferentes.
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
  clienteClicavel = false,
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
  /**
   * Nome da cliente abre o cadastro dela. Padrao FECHADO: este componente e o
   * mesmo na Logistica e na tela do Motorista, e o cadastro e de
   * VENDAS/GESTAO/FINANCEIRO. Ver `NomeDoCliente`.
   */
  clienteClicavel?: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const aberta = orders.find((o) => o.id === openId) ?? null;

  return (
    <>
      {/* A grade do Fluxo. Três colunas e não as cinco de lá: o histórico
          mostra 9 por página, e 3x3 fecha a página sem deixar vão. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {orders.map((o) => (
          <OrderCard key={o.id} data={o} onClick={() => setOpenId(o.id)} />
        ))}
      </div>

      {/* UMA ficha montada por vez, e desmontada ao fechar: montar as nove
          significaria nove consultas a `/api/orders/[id]` para ler uma. */}
      {aberta && (
        <ComandaDetalhe
          item={aberta}
          onClose={() => setOpenId(null)}
          driverMode={driverMode}
          editableProofs={editableProofs}
          canDelete={canDelete}
          canReturn={canReturn}
          campaigns={campaigns}
          clienteClicavel={clienteClicavel}
        />
      )}
    </>
  );
}

function ComandaDetalhe({
  item: o,
  onClose,
  driverMode,
  editableProofs,
  canDelete,
  canReturn,
  campaigns,
  clienteClicavel,
}: {
  item: ComandaListItem;
  onClose: () => void;
  driverMode: boolean;
  editableProofs: boolean;
  canDelete: boolean;
  canReturn: boolean;
  campaigns?: { id: string; name: string }[];
  clienteClicavel: boolean;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [returning, setReturning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Carrega ao montar: o componente só existe enquanto o modal está aberto.
  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.id]);

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
    <>
      <Modal onClose={() => !pending && onClose()} largura="max-w-2xl">
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
              clienteClicavel={clienteClicavel}
              compact
              campaignEdit={campaigns?.length ? { campaigns } : undefined}
              headerAction={
                <button
                  onClick={onClose}
                  aria-label="Fechar"
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              }
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
      </Modal>

      {confirming && (
        <Modal onClose={() => !pending && setConfirming(false)} largura="max-w-sm">
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
        </Modal>
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
    </>
  );
}
