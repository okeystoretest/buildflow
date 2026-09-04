"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, AlertTriangle, CheckCircle2, Link2, Check } from "lucide-react";
import { deleteOrder, resolveFinanceIssue } from "@/lib/actions/orders";
import { getTrackingLink } from "@/lib/actions/tracking";
import { Button } from "@/components/ui/button";

/**
 * Mensagem pronta de rastreio. Vai inteira para a area de transferencia — a
 * cliente recebe o link e o codigo no mesmo texto, sem precisar de duas
 * mensagens nem de explicacao extra da vendedora.
 */
function mensagemRastreio(url: string, customerCode: string) {
  return `Acesse o link ${url} e insira o código de cliente ${customerCode} para acessar a plataforma.`;
}

/**
 * Ações de pedido na tela de Vendas.
 *
 * - RASTREIO: copia a mensagem pronta de acompanhamento (link + Codigo de
 *   Cliente) para a vendedora colar direto na conversa com a cliente.
 * - EDITAR: disponivel para a Gestao e para a vendedora (nos proprios pedidos).
 * - EXCLUIR: GESTAO e FINANCEIRO (a permissao real e checada em deleteOrder).
 * - PENDENCIA: se o Financeiro sinalizou um problema ativo, mostra o botao
 *   "Pendência" que abre o detalhe com o texto e o botao "Resolvido".
 */
export function VendaRowActions({
  orderId,
  orderNumber,
  canDelete = false,
  issue = null,
}: {
  orderId: string;
  orderNumber: string;
  canDelete?: boolean;
  // Texto da pendencia ATIVA (null = sem pendencia).
  issue?: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [showIssue, setShowIssue] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Confirmacao visual efemera do "copiado" (o icone vira um check por 2s).
  const [copied, setCopied] = useState(false);
  // Modal de apoio: aparece quando o navegador nega a area de transferencia
  // (a Clipboard API so funciona em contexto seguro — HTTPS ou localhost) ou
  // quando a action falha. Sem isso, o clique nao daria retorno nenhum.
  const [linkModal, setLinkModal] = useState<{ mensagem?: string; error?: string } | null>(null);

  function copyLink() {
    setError(null);
    start(async () => {
      const res = await getTrackingLink(orderId);
      if (!res.ok) {
        setLinkModal({ error: res.error });
        return;
      }
      // A URL absoluta e montada aqui com a origem da propria aba: o dominio
      // publico e sempre o mesmo pelo qual a vendedora esta acessando.
      const url = `${window.location.origin}${res.data.path}`;
      // Copia a mensagem pronta, e nao a URL pura: a cliente ainda precisa do
      // Codigo de Cliente para passar da tela de verificacao.
      const mensagem = mensagemRastreio(url, res.data.customerCode);
      try {
        await navigator.clipboard.writeText(mensagem);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        setLinkModal({ mensagem });
      }
    });
  }

  function resolve() {
    setError(null);
    start(async () => {
      const res = await resolveFinanceIssue(orderId);
      if (res.ok) { setShowIssue(false); router.refresh(); }
      else setError(res.error);
    });
  }

  function remove() {
    setError(null);
    start(async () => {
      const res = await deleteOrder(orderId);
      if (res.ok) {
        setConfirming(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <>
      <div className="flex items-center justify-end gap-1.5">
        {issue && (
          <Button
            variant="destructive"
            size="sm"
            className="h-8"
            title="Ver pendência do Financeiro"
            onClick={() => setShowIssue(true)}
          >
            <AlertTriangle className="mr-1 h-4 w-4" /> Pendência
          </Button>
        )}
        {/* Rotulo visivel (nao so o icone): a acao mais usada da linha nao
            depende de o usuario passar o mouse para descobrir o que faz. */}
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          title="Copiar link"
          onClick={copyLink}
          disabled={pending}
        >
          {copied ? (
            <Check className="mr-1 h-4 w-4 text-vendas" />
          ) : (
            <Link2 className="mr-1 h-4 w-4" />
          )}
          Copiar link
        </Button>
        <Button asChild variant="outline" size="icon" className="h-8 w-8" title="Editar pedido">
          <Link href={`/vendas/${orderId}/editar`}>
            <Pencil className="h-4 w-4" />
          </Link>
        </Button>
        {canDelete && (
          <Button
            variant="destructive"
            size="icon"
            className="h-8 w-8"
            title="Excluir pedido"
            onClick={() => setConfirming(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Mensagem de rastreio: so aparece se a copia automatica nao rolou. */}
      {linkModal && (
        <Modal onClose={() => setLinkModal(null)}>
          <h2 className="mb-1 text-lg font-bold">Rastreio do pedido</h2>
          <p className="mb-3 text-sm text-muted-foreground">Pedido {orderNumber}</p>
          {linkModal.error ? (
            <p className="mb-4 text-sm text-destructive">{linkModal.error}</p>
          ) : (
            <>
              <p className="mb-2 text-sm text-muted-foreground">
                Copie a mensagem abaixo e envie para a cliente:
              </p>
              <textarea
                readOnly
                rows={4}
                value={linkModal.mensagem}
                onFocus={(e) => e.currentTarget.select()}
                className="mb-4 w-full rounded-lg border border-input bg-background p-3 text-xs"
              />
            </>
          )}
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setLinkModal(null)}>Fechar</Button>
          </div>
        </Modal>
      )}

      {/* Detalhe da pendencia + botao Resolvido (so aparece com pendencia ativa). */}
      {showIssue && issue && (
        <Modal onClose={() => setShowIssue(false)}>
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <h2 className="text-lg font-bold">Pendência do Financeiro</h2>
          </div>
          <p className="mb-1 text-sm text-muted-foreground">Pedido {orderNumber}</p>
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground">
            {issue}
          </div>
          {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowIssue(false)} disabled={pending}>Fechar</Button>
            <Button variant="vendas" onClick={resolve} disabled={pending}>
              <CheckCircle2 className="mr-1 h-4 w-4" />
              {pending ? "Resolvendo..." : "Resolvido"}
            </Button>
          </div>
        </Modal>
      )}

      {confirming && (
        <Modal onClose={() => setConfirming(false)}>
          <h2 className="mb-1 text-lg font-bold">Excluir pedido</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Tem certeza que deseja excluir o pedido {orderNumber}? Esta ação não pode ser desfeita.
          </p>
          {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={remove} disabled={pending}>
              {pending ? "Excluindo..." : "Excluir"}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
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
