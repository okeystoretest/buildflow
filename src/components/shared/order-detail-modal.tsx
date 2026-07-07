"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { STATUS_LABEL } from "@/lib/order-flow";
import { formatBRL } from "@/lib/utils";
import { StatusBadge } from "@/components/shared/status-badge";
import { uploadInvoiceBase64 } from "@/lib/actions/sales";
import { shrinkImageToBase64 } from "@/lib/client-image";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";

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
  customer: { name: string; code: string };
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
  history: { id: string; status: keyof typeof STATUS_LABEL; note: string | null; changedByName?: string | null; createdAt: string }[];
}

// Prazo padrao de entrega: 2 horas apos a confirmacao do pagamento.
const DELIVERY_SLA_HOURS = 2;

// Descobre o momento em que o pagamento foi confirmado. Regra: e a primeira
// vez que o pedido saiu de "Em Analise" (Financeiro aprovou e gerou comanda),
// marcada pela entrada de historico "Aguardando Impressao". Sem essa entrada,
// nao ha meta de entrega ainda (pedido nao aprovado).
function findPaymentConfirmedAt(
  history: { status: keyof typeof STATUS_LABEL; createdAt: string }[],
): Date | null {
  const entry = history.find((h) => h.status === "AGUARDANDO_IMPRESSAO");
  return entry ? new Date(entry.createdAt) : null;
}

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
  const [nfBusy, setNfBusy] = useState(false);
  const [nfMsg, setNfMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  // Alvo do portal. Em tela cheia, o navegador so pinta descendentes do
  // elemento fullscreen; se o modal for pro <body> ele existe mas fica INVISIVEL.
  // Por isso ancoramos o portal no fullscreenElement quando ele existe.
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  // Resolução de pendência: campo de novo comentário + estado de envio.
  const [resolutionNote, setResolutionNote] = useState("");
  const [resolvingPend, setResolvingPend] = useState(false);
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
      const res = await uploadInvoiceBase64({ orderId: order.id, base64: r.base64 ?? "" });
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

  // Meta de entrega: prazo limite = confirmacao do pagamento + 2h.
  const paymentAt = order ? findPaymentConfirmedAt(order.history) : null;
  const deliveryDeadline = paymentAt
    ? new Date(paymentAt.getTime() + DELIVERY_SLA_HOURS * 60 * 60 * 1000)
    : null;
  // Ja foi entregue/concluido? Ai o SLA nao "corre" mais.
  const isFinal = order ? ["ENTREGUE", "CONCLUIDO"].includes(order.status) : false;
  const isLate = deliveryDeadline ? !isFinal && new Date() > deliveryDeadline : false;

  // Comentário da pendência ativa: pega a ÚLTIMA entrada de histórico com
  // status PENDENTE que tenha nota. Só é relevante enquanto o pedido está
  // efetivamente em PENDENTE (mostrado abaixo das Observações, não no histórico).
  const pendencyComment = useMemo(() => {
    if (!order || order.status !== "PENDENTE") return null;
    const entry = [...order.history]
      .reverse()
      .find((h) => h.status === "PENDENTE" && h.note?.trim());
    if (!entry?.note) return null;
    // Remove o prefixo técnico "Pendência: " para exibir só o texto.
    return entry.note.replace(/^Pend[êe]ncia:\s*/i, "").trim();
  }, [order]);

  async function handleResolvePendency() {
    if (!order) return;
    setError(null);
    setResolvingPend(true);
    const mod = await import("@/lib/actions/logistics");
    const res = await mod.resolvePendency({
      orderId: order.id,
      resolutionNote: resolutionNote.trim() || undefined,
    });
    setResolvingPend(false);
    if (res.ok) {
      setResolutionNote("");
      onClose();
      router.refresh();
    } else {
      setError(res.error);
    }
  }

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
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div>
                {/* 1.1 - Codigo da cliente ao lado do nome no cabecalho. */}
                <h2 className="text-lg font-bold">
                  Pedido {order.orderNumber}
                  {order.comandaNumber && ` · Comanda ${order.comandaNumber}`}
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{order.customer.name}</span>
                  <span className="font-data ml-2 rounded-md bg-secondary px-1.5 py-0.5 text-xs">
                    Cód. {order.customer.code}
                  </span>
                </p>
                <div className="mt-1"><StatusBadge status={order.status} /></div>
              </div>
              <button onClick={onClose} className="text-2xl leading-none text-muted-foreground">
                ×
              </button>
            </div>

            {/* 1.5 - Meta de Entrega: horario limite (2h apos confirmacao do pgto). */}
            {deliveryDeadline && (
              <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
                isFinal
                  ? "border-motorista/40 bg-motorista/10 text-motorista"
                  : isLate
                    ? "border-destructive/50 bg-destructive/15 text-destructive"
                    : "border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300"
              }`}>
                <Clock className="h-4 w-4 shrink-0" />
                <span>
                  Meta de entrega: {deliveryDeadline.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  {isFinal ? " · concluída" : isLate ? " · atrasada" : " · dentro do prazo"}
                </span>
              </div>
            )}

            {/* 1.2 - Cada campo com borda delimitadora. */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Info label="Cliente" value={`${order.customer.name} (${order.customer.code})`} />
              <Info label="Vendedora" value={order.seller.name} />
              <Info label="Loja" value={order.store.name} />
              <Info label="Tipo" value={order.orderType.name} />
              {/* 1.3 - Operacao destacada em amarelo (#FFFF00). */}
              <Info label="Operação" value={`${order.operation.code} - ${order.operation.name}`} highlight />
              <Info label="Pagamento" value={order.paymentMethod.name} />
              <Info label="Envio" value={order.shippingMethod.name} />
              <Info label="Status pgto" value={order.paymentStatus?.name ?? "—"} />
              <Info label="CNPJ" value={order.cnpj ? order.cnpj.name : "—"} />
              <Info label="Rastreio" value={order.trackingCode ?? "—"} />
            </div>

            {/* Observações. No modo motorista ficam em DESTAQUE (leitura rápida
                durante a entrega): fonte maior, borda e fundo realçados. */}
            <div>
              <h3 className={`mb-1 font-semibold ${driverMode ? "text-motorista" : ""}`}>Observações</h3>
              <div className={
                driverMode
                  ? "rounded-lg border-2 border-motorista/50 bg-motorista/10 p-4 text-base font-medium leading-relaxed whitespace-pre-wrap"
                  : "rounded-lg border border-border bg-secondary/30 p-3 text-sm whitespace-pre-wrap"
              }>
                {order.notes?.trim() ? order.notes : <span className="font-normal text-muted-foreground">Nenhuma observação registrada.</span>}
              </div>
            </div>

            {/* Pendência ativa: destaque laranja pastel logo abaixo das Observações
                (NÃO no histórico). Motorista não interage — só logística/gestão. */}
            {order.status === "PENDENTE" && (
              <div className="rounded-lg border border-orange-300 bg-orange-100/70 p-4 dark:border-orange-400/40 dark:bg-orange-400/10">
                <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-orange-800 dark:text-orange-200">
                  ⚠ Pendência
                </h3>
                <p className="whitespace-pre-wrap text-sm text-orange-900 dark:text-orange-100">
                  {pendencyComment ?? "Pendência registrada sem descrição."}
                </p>

                {/* Interação de resolução: só para quem gerencia a logística. */}
                {!driverMode && (
                  <div className="mt-3 space-y-2">
                    <textarea
                      className="min-h-[70px] w-full rounded-lg border border-orange-300 bg-background p-3 text-sm dark:border-orange-400/40"
                      placeholder="Comentário sobre a resolução (opcional)..."
                      value={resolutionNote}
                      onChange={(e) => setResolutionNote(e.target.value)}
                      disabled={resolvingPend}
                    />
                    <div className="flex justify-end">
                      <Button
                        variant="distribuicao"
                        size="sm"
                        onClick={handleResolvePendency}
                        disabled={resolvingPend}
                      >
                        {resolvingPend ? "Resolvendo..." : "Confirmar Resolução"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Valores e edição: bloqueados para o motorista. */}
            {!driverMode && (
              <div>
                <h3 className="mb-1 font-semibold">Valores</h3>
                <div className="rounded-lg border border-border p-3 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Valor do pedido</span><span className="font-data">{formatBRL(order.orderValue)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Frete</span><span className="font-data">{formatBRL(order.freight)}</span></div>
                  <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold"><span>Total</span><span className="font-data">{formatBRL(order.total)}</span></div>
                </div>
              </div>
            )}

            {!driverMode && (
              <div className="flex flex-wrap gap-4 text-sm">
                <FileLink label="Comprovante pagamento" path={order.paymentProofPath} />
                <FileLink label="Nota Fiscal" path={order.invoicePath} />
              </div>
            )}

            {/* Nota Fiscal: liberado apos confirmacao do pagamento (comanda gerada).
                Bloqueado para o motorista (sem edição de dados).
                REGRA: apos o envio concluído (invoicePath existe), o botão de
                upload SOME PERMANENTEMENTE — só resta a confirmação. */}
            {!driverMode && order.comandaNumber && (
              <div className="rounded-lg border border-border p-3">
                <p className="mb-1 text-sm font-semibold">Nota Fiscal</p>
                {order.invoicePath ? (
                  // NF já enviada: sem input de upload, apenas confirmação.
                  <p className="text-sm font-medium text-motorista">✓ Nota Fiscal anexada.</p>
                ) : (
                  <>
                    {order.status === "PROCESSANDO" && (
                      <div className="mb-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                        ⚠ Pedido em Processando sem Nota Fiscal. O avanço está bloqueado até anexar a NF.
                      </div>
                    )}
                    <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                      onChange={onInvoiceFile} disabled={nfBusy}
                      className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-distribuicao file:px-4 file:py-2 file:text-sm file:font-medium file:text-distribuicao-fg hover:file:opacity-90" />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Clique para anexar a Nota Fiscal.{nfBusy && " Enviando..."}
                    </p>
                    {nfMsg && <p className={`mt-1 text-sm ${nfMsg.ok ? "text-motorista" : "text-destructive"}`}>{nfMsg.text}</p>}
                  </>
                )}
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

            {/* Histórico completo: oculto para o motorista (só vê a fase logística). */}
            {!driverMode && (
              <div>
                <h3 className="mb-1 font-semibold">Histórico</h3>
                <ul className="space-y-1 text-sm">
                  {order.history.map((h) => (
                    <li key={h.id} className="flex justify-between gap-3">
                      <span className="min-w-0">
                        {STATUS_LABEL[h.status]}{h.note ? ` — ${h.note}` : ""}
                        {/* 1.4 - Usuario responsavel pela movimentacao (quando registrado). */}
                        {h.changedByName && (
                          <span className="text-muted-foreground"> · por {h.changedByName}</span>
                        )}
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        {new Date(h.createdAt).toLocaleString("pt-BR")}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

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
    </div>,
    portalTarget,
  );
}

// Campo com borda delimitadora (1.2). Com highlight amarelo PASTEL para
// destacar a Operacao (1.3) — informacao critica, sem ruido visual excessivo.
function Info({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={`rounded-lg border px-2.5 py-1.5 ${
        highlight
          ? "border-yellow-300 bg-yellow-100 dark:border-yellow-700/60 dark:bg-yellow-500/15"
          : "border-border"
      }`}
    >
      <p className={`text-xs ${highlight ? "text-yellow-800 dark:text-yellow-300/80" : "text-muted-foreground"}`}>{label}</p>
      <p className={highlight ? "font-semibold text-yellow-900 dark:text-yellow-100" : ""}>{value}</p>
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
