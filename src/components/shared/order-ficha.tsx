"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { STATUS_LABEL, formatOverdue } from "@/lib/order-flow";
import { formatBRL } from "@/lib/utils";
import { StatusBadge } from "@/components/shared/status-badge";
import { uploadInvoiceBase64, removeInvoice } from "@/lib/actions/sales";
import { prepareInvoiceFile } from "@/lib/client-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Clock, X, Printer, MapPin, Plus, Pencil, Trash2 } from "lucide-react";
import {
  addCampaignItem,
  updateCampaignItem,
  deleteCampaignItem,
} from "@/lib/actions/campaign-items";

/**
 * A FICHA DA COMANDA — uma definição só, para todas as telas.
 * ---------------------------------------------------------------------------
 * Este componente é o detalhamento completo de um pedido: identificação,
 * endereço, observações, pendência, valores, anexos, Nota Fiscal, entrega,
 * peças de campanha, devoluções, motivos de atraso e histórico.
 *
 * Antes ele existia SÓ dentro do modal do Fluxo de Pedidos, e cada histórico
 * (Vendas, Logística, Motorista) reimplementava um recorte próprio — três
 * versões que divergiam a cada campo novo. Agora o modal do Fluxo é só a
 * moldura em volta desta ficha, e os históricos a usam dentro do bloco
 * expansível. Campo novo aqui aparece nas quatro telas de uma vez.
 *
 * O componente não busca nada: recebe o pedido já carregado (de
 * `/api/orders/[id]`, que aplica o recorte por papel no SERVIDOR) e avisa por
 * `onChange` quando uma ação interna altera o pedido — anexar a Nota Fiscal,
 * resolver a pendência, mexer nas peças de campanha.
 */

export interface OrderFichaCampaignItem {
  id: string;
  campaignId: string;
  campaignName: string;
  reference: string;
  quantity: number;
  /** String: o Decimal do Prisma atravessa o JSON como texto. */
  value: string;
}

export interface OrderDetail {
  id: string;
  orderNumber: string;
  comandaNumber: string | null;
  status: keyof typeof STATUS_LABEL;
  // "N° de Peças no Pedido" (declarado em Vendas). 0 = nao informado.
  pieceCount?: number | null;
  orderValue: string;
  freight: string;
  total: string;
  notes: string | null;
  // Observacoes de Pagamento (preenchidas por Vendas/Financeiro).
  paymentNotes?: string | null;
  paymentProofPath: string | null;
  // Comprovantes da Vendedora (ate 5). Pedidos novos usam esta lista.
  paymentProofs: { id: string; filePath: string }[];
  // Segundo comprovante, anexado pelo Financeiro. Visível a todos.
  paymentProof2Path: string | null;
  // Comprovantes do Financeiro (ate 5). Pedidos novos usam esta lista.
  financeProofs: { id: string; filePath: string }[];
  invoicePath: string | null;
  trackingCode: string | null;
  // Endereço de entrega (Excursão). Preenchidos só quando a forma exige.
  shipCep: string | null;
  shipStreet: string | null;
  shipNumber: string | null;
  shipDistrict: string | null;
  shipCity: string | null;
  shipState: string | null;
  cnpj: { name: string; document: string } | null;
  customer: { name: string; code: string };
  seller: { name: string };
  store: { name: string };
  // Loja de Origem (null em pedidos antigos).
  originStore?: { name: string } | null;
  orderType: { name: string };
  operation: { code: string; name: string };
  // Preenchidos pelo Financeiro: ficam nulos até a Análise de Pedidos.
  paymentMethod: { name: string } | null;
  bank: { name: string } | null;
  shippingMethod: { name: string; requiresAddress?: boolean };
  paymentStatus: { name: string } | null;
  delivery: {
    status: string;
    driver: { name: string } | null;
    proofs: { id: string; filePath: string }[];
    // Marcos da entrega. Ausentes nas entregas anteriores ao campo.
    assignedAt?: string | null;
    startedAt?: string | null;
    deliveredAt?: string | null;
    failReason?: string | null;
    /** Valor do serviço informado pelo motorista ao concluir. */
    driverFee?: string | null;
  } | null;
  history: { id: string; status: keyof typeof STATUS_LABEL; note: string | null; changedByName?: string | null; createdAt: string }[];
  // Motivos de atraso justificados pelo setor dono de cada etapa (um por etapa).
  delayReasons?: {
    id: string;
    status: keyof typeof STATUS_LABEL;
    reason: string;
    minutesLate: number;
    createdByName?: string | null;
    createdAt: string;
  }[];
  // Devolucoes registradas (Vendas > Devolucoes). Ausente no modo motorista.
  returns?: {
    id: string;
    createdAt: string;
    note: string | null;
    totalValue: string;
    registeredByName?: string | null;
    items: { id: string; reference: string; quantity: number; value: string }[];
  }[];
  // Pecas de campanha lancadas no pedido. Ausente no modo motorista (carregam valor).
  campaignItems?: OrderFichaCampaignItem[];
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

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function OrderFicha({
  order,
  onChange,
  driverMode = false,
  compact = false,
  headerAction,
  campaignEdit,
  children,
  footer,
}: {
  order: OrderDetail;
  /** Chamado quando uma ação interna altera o pedido (NF, pendência, campanha). */
  onChange?: (next: OrderDetail) => void;
  // Modo motorista: observacao em destaque, SEM historico, SEM valores/edicao.
  driverMode?: boolean;
  /**
   * `false` (modal do Fluxo): cabeçalho completo com pedido, comanda, cliente e
   * status. `true` (históricos): o card acima do bloco já identifica a comanda,
   * então fica só o selo de status.
   */
  compact?: boolean;
  /** Slot no canto do cabeçalho — o modal põe aqui o botão de fechar. */
  headerAction?: React.ReactNode;
  /** Quando presente, habilita o CRUD das peças de campanha (Histórico de Vendas). */
  campaignEdit?: { campaigns: { id: string; name: string }[] };
  /** Blocos extras do setor, inseridos antes do rodapé. */
  children?: React.ReactNode;
  /** Ações do rodapé (editar/excluir pedido, editar entrega, devolução...). */
  footer?: React.ReactNode;
}) {
  const router = useRouter();
  const [nfBusy, setNfBusy] = useState(false);
  const [nfMsg, setNfMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Resolução de pendência: campo de novo comentário + estado de envio.
  const [resolutionNote, setResolutionNote] = useState("");
  const [resolvingPend, setResolvingPend] = useState(false);

  function patchOrder(patch: Partial<OrderDetail>) {
    onChange?.({ ...order, ...patch });
  }

  function onInvoiceFile(e: React.ChangeEvent<HTMLInputElement>) {
    setNfMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setNfBusy(true);
    (async () => {
      // Aceita imagem (vira .webp no servidor) ou PDF (salvo como esta).
      const r = await prepareInvoiceFile(file, { maxDimension: 1600, quality: 0.8 });
      if (r.error) { setNfBusy(false); setNfMsg({ ok: false, text: r.error }); return; }
      const res = await uploadInvoiceBase64({ orderId: order.id, base64: r.base64 ?? "" });
      setNfBusy(false);
      if (res.ok) {
        setNfMsg({ ok: true, text: "Nota Fiscal anexada." });
        patchOrder({ invoicePath: res.data.filePath });
        router.refresh();
      } else setNfMsg({ ok: false, text: res.error });
    })();
    e.target.value = "";
  }

  // Remove a NF anexada (botao "x"), liberando o campo para um novo envio.
  function onRemoveInvoice() {
    setNfMsg(null);
    setNfBusy(true);
    (async () => {
      const res = await removeInvoice({ orderId: order.id });
      setNfBusy(false);
      if (res.ok) {
        patchOrder({ invoicePath: null });
        setNfMsg({ ok: true, text: "Nota Fiscal removida. Anexe a nova." });
        router.refresh();
      } else setNfMsg({ ok: false, text: res.error });
    })();
  }

  // Meta de entrega: prazo limite = confirmacao do pagamento + 2h.
  const paymentAt = findPaymentConfirmedAt(order.history);
  const deliveryDeadline = paymentAt
    ? new Date(paymentAt.getTime() + DELIVERY_SLA_HOURS * 60 * 60 * 1000)
    : null;
  // Ja foi entregue/concluido? Ai o SLA nao "corre" mais.
  const isFinal = ["ENTREGUE", "CONCLUIDO"].includes(order.status);
  const isLate = deliveryDeadline ? !isFinal && new Date() > deliveryDeadline : false;

  // Comentário da pendência ativa: pega a ÚLTIMA entrada de histórico com
  // status PENDENTE que tenha nota. Só é relevante enquanto o pedido está
  // efetivamente em PENDENTE (mostrado abaixo das Observações, não no histórico).
  const pendencyComment = useMemo(() => {
    if (order.status !== "PENDENTE") return null;
    const entry = [...order.history]
      .reverse()
      .find((h) => h.status === "PENDENTE" && h.note?.trim());
    if (!entry?.note) return null;
    // Remove o prefixo técnico "Pendência: " para exibir só o texto.
    return entry.note.replace(/^Pend[êe]ncia:\s*/i, "").trim();
  }, [order.history, order.status]);

  // Ultima RESOLUCAO de pendencia registrada no historico (nota que comeca com
  // "Pendência resolvida"). Exibida em destaque logo abaixo das Observações de
  // Envio, para rastreabilidade rapida mesmo depois que o pedido saiu de
  // PENDENTE.
  const resolutionComment = useMemo(() => {
    const entry = [...order.history]
      .reverse()
      .find((h) => /^Pend[êe]ncia resolvida/i.test(h.note?.trim() ?? ""));
    if (!entry?.note) return null;
    // Remove o prefixo tecnico, mantendo so o texto da solucao (se houver).
    const txt = entry.note.replace(/^Pend[êe]ncia resolvida:?\s*/i, "").trim();
    return { text: txt, at: entry.createdAt };
  }, [order.history]);

  async function handleResolvePendency() {
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
      // Recarrega o pedido para refletir o novo status e exibir o highlight da
      // resolução imediatamente (sem fechar a ficha). Atualiza tambem a board.
      try {
        const r = await fetch(`/api/orders/${order.id}`);
        if (r.ok) onChange?.(await r.json());
      } catch {
        // se o refetch falhar, o router.refresh abaixo ainda sincroniza a tela
      }
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  return (
    <div className="space-y-4">
      {compact ? (
        <div className="flex items-start justify-between gap-2">
          <StatusBadge status={order.status} />
          {headerAction}
        </div>
      ) : (
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
          {headerAction}
        </div>
      )}

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
        {/* No modo compacto o card acima não repete pedido/comanda: a ficha os
            traz aqui, junto do resto da identificação. */}
        {compact && (
          <>
            <Info label="Pedido" value={order.orderNumber} />
            <Info label="Comanda" value={order.comandaNumber ?? "—"} />
          </>
        )}
        <Info label="Cliente" value={`${order.customer.name} (${order.customer.code})`} />
        <Info label="Vendedora" value={order.seller.name} />
        <Info label="Loja" value={order.store.name} />
        <Info label="Loja de Origem" value={order.originStore?.name ?? "—"} />
        <Info label="Tipo" value={order.orderType.name} />
        <Info label="N° de Peças" value={order.pieceCount ? String(order.pieceCount) : "—"} />
        {/* 1.3 - Operacao destacada em amarelo (#FFFF00). */}
        <Info label="Operação" value={`${order.operation.code} - ${order.operation.name}`} highlight />
        {/* Pagamento e Banco são definidos pelo Financeiro na Análise. */}
        <Info label="Pagamento" value={order.paymentMethod?.name ?? "—"} />
        <Info label="Banco" value={order.bank?.name ?? "—"} />
        <Info label="Envio" value={order.shippingMethod.name} />
        <Info label="Status pgto" value={order.paymentStatus?.name ?? "—"} />
        <Info label="CNPJ" value={order.cnpj ? order.cnpj.name : "—"} />
        <Info label="Rastreio" value={order.trackingCode ?? "—"} />
      </div>

      {/* Endereço de entrega + etiqueta térmica — só para formas de envio
          que exigem endereço (Excursão). Oculto no modo motorista. */}
      {!driverMode && order.shippingMethod.requiresAddress && (
        <div className="rounded-lg border border-vendas/40 bg-vendas/5 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-vendas">
              <MapPin className="h-4 w-4" /> Endereço de Entrega
            </h3>
            <a
              href={`/etiqueta/${order.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center justify-center rounded-lg bg-vendas px-3 text-sm font-semibold text-vendas-fg shadow-sm transition-colors hover:bg-vendas/90"
            >
              <Printer className="mr-2 h-4 w-4" /> Imprimir Etiqueta
            </a>
          </div>
          <div className="text-sm leading-relaxed">
            {[order.shipStreet, order.shipNumber].filter(Boolean).join(", ") || "—"}
            {(order.shipDistrict || order.shipCity || order.shipState) && (
              <div className="text-muted-foreground">
                {[order.shipDistrict, order.shipCity, order.shipState].filter(Boolean).join(" · ")}
              </div>
            )}
            {order.shipCep && <div className="font-data text-muted-foreground">CEP {order.shipCep}</div>}
          </div>
        </div>
      )}

      {/* Observações. No modo motorista ficam em DESTAQUE (leitura rápida
          durante a entrega): fonte maior, borda e fundo realçados. */}
      <div>
        <h3 className={`mb-1 font-semibold ${driverMode ? "text-motorista" : ""}`}>Observações de Envio</h3>
        <div className={
          driverMode
            ? "rounded-lg border-2 border-motorista/50 bg-motorista/10 p-4 text-base font-medium leading-relaxed whitespace-pre-wrap"
            : "rounded-lg border border-border bg-secondary/30 p-3 text-sm whitespace-pre-wrap"
        }>
          {order.notes?.trim() ? order.notes : <span className="font-normal text-muted-foreground">Nenhuma observação registrada.</span>}
        </div>
      </div>

      {/* Observações de Pagamento: valem como justificativa quando o pedido não
          tem comprovante anexado, então fazem parte da ficha. Não vão ao
          motorista, que não vê o pacote financeiro. */}
      {!driverMode && order.paymentNotes?.trim() && (
        <div>
          <h3 className="mb-1 font-semibold">Observações de Pagamento</h3>
          <div className="rounded-lg border border-border bg-secondary/30 p-3 text-sm whitespace-pre-wrap">
            {order.paymentNotes}
          </div>
        </div>
      )}

      {/* Resolução de pendência (highlight): texto da última solução
          registrada, exibido logo abaixo das Observações de Envio para
          rastreabilidade imediata — inclusive após o pedido sair de
          PENDENTE. O registro completo permanece no Histórico. */}
      {resolutionComment && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-100/70 p-4 dark:border-emerald-400/40 dark:bg-emerald-400/10">
          <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-emerald-800 dark:text-emerald-200">
            ✓ Pendência resolvida
          </h3>
          <p className="whitespace-pre-wrap text-sm text-emerald-900 dark:text-emerald-100">
            {resolutionComment.text
              ? resolutionComment.text
              : <span className="text-emerald-800/80 dark:text-emerald-200/80">Resolvida sem comentário.</span>}
          </p>
        </div>
      )}

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
          {/* Comprovantes da Vendedora (ate 5). Pedidos antigos (sem lista)
              caem no campo unico paymentProofPath. */}
          {order.paymentProofs.length > 0 ? (
            order.paymentProofs.map((p, i) => (
              <FileLink key={p.id} label={`Comprovante ${i + 1}`} path={p.filePath} />
            ))
          ) : (
            <FileLink label="Comprovante pagamento" path={order.paymentProofPath} />
          )}
          {/* Comprovantes do Financeiro (ate 5). Pedidos antigos caem no
              campo unico paymentProof2Path. */}
          {order.financeProofs.length > 0 ? (
            order.financeProofs.map((p, i) => (
              <FileLink key={p.id} label={`2º Comprovante ${i + 1}`} path={p.filePath} />
            ))
          ) : (
            <FileLink label="2º Comprovante pagamento" path={order.paymentProof2Path} />
          )}
          <FileLink label="Nota Fiscal" path={order.invoicePath} />
        </div>
      )}

      {/* Nota Fiscal: liberado apos confirmacao do pagamento (comanda gerada).
          Bloqueado para o motorista (sem edição de dados).
          Depois de anexada, o "x" permite remover e enviar outra. */}
      {!driverMode && order.comandaNumber && (
        <div className="rounded-lg border border-border p-3">
          <p className="mb-1 text-sm font-semibold">Nota Fiscal</p>
          {order.invoicePath ? (
            // NF ja enviada: confirmacao + "x" para trocar o arquivo.
            <>
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-1.5">
                <a href={order.invoicePath} target="_blank" rel="noreferrer"
                  className="truncate text-sm font-medium text-motorista underline">
                  ✓ Nota Fiscal anexada.
                </a>
                <button type="button" onClick={onRemoveInvoice} disabled={nfBusy}
                  className="ml-2 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-background hover:text-destructive disabled:opacity-40"
                  aria-label="Remover Nota Fiscal">
                  <X className="h-4 w-4" />
                </button>
              </div>
              {nfBusy && <p className="mt-1 text-xs text-muted-foreground">Removendo...</p>}
              {nfMsg && <p className={`mt-1 text-sm ${nfMsg.ok ? "text-motorista" : "text-destructive"}`}>{nfMsg.text}</p>}
            </>
          ) : (
            <>
              {order.status === "PROCESSANDO" && (
                <div className="mb-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                  ⚠ Pedido em Processando sem Nota Fiscal. O avanço está bloqueado até anexar a NF.
                </div>
              )}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.pdf"
                onChange={onInvoiceFile} disabled={nfBusy}
                className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-distribuicao file:px-4 file:py-2 file:text-sm file:font-medium file:text-distribuicao-fg hover:file:opacity-90" />
              <p className="mt-1 text-xs text-muted-foreground">
                Clique para anexar a Nota Fiscal (imagem ou PDF).{nfBusy && " Enviando..."}
              </p>
              {nfMsg && <p className={`mt-1 text-sm ${nfMsg.ok ? "text-motorista" : "text-destructive"}`}>{nfMsg.text}</p>}
            </>
          )}
        </div>
      )}

      {/* Entrega: motorista, marcos de tempo, valor informado por ele e motivo
          de falha. Os marcos vinham só na tela da Logística; passam a fazer
          parte da ficha em todas. */}
      {order.delivery && (
        <div>
          <h3 className="mb-1 font-semibold">Entrega</h3>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <Info label="Status" value={order.delivery.status} />
            <Info label="Motorista" value={order.delivery.driver?.name ?? "—"} />
            <Info label="Atribuída em" value={fmtDateTime(order.delivery.assignedAt)} />
            <Info label="Iniciada em" value={fmtDateTime(order.delivery.startedAt)} />
            <Info label="Entregue em" value={fmtDateTime(order.delivery.deliveredAt)} />
            {/* O valor do serviço é dado financeiro: não vai ao motorista. */}
            {!driverMode && (
              <Info
                label="Valor informado pelo motorista"
                value={order.delivery.driverFee != null ? formatBRL(order.delivery.driverFee) : "—"}
              />
            )}
            {order.delivery.failReason && (
              <Info label="Observação de falha" value={order.delivery.failReason} full />
            )}
          </div>
          {order.delivery.proofs.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {order.delivery.proofs.map((p) => (
                <a key={p.id} href={p.filePath} target="_blank" rel="noreferrer">
                  <img src={p.filePath} alt="comprovante de entrega" className="h-24 w-24 rounded object-cover" />
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Peças de campanha. Só leitura no Fluxo; com CRUD no Histórico de
          Vendas (campaignEdit). Fora do modo motorista: carregam valor. */}
      {!driverMode && (order.campaignItems !== undefined || campaignEdit) && (
        <CampaignItemsBlock
          orderId={order.id}
          items={order.campaignItems ?? []}
          campaigns={campaignEdit?.campaigns}
          onItems={(items) => patchOrder({ campaignItems: items })}
        />
      )}

      {/* Devoluções: peças que voltaram e o valor abatido do pedido. Os
          valores exibidos acima já são os líquidos; esta lista é o que
          explica a diferença para quem conhecia o valor original. */}
      {!driverMode && (order.returns?.length ?? 0) > 0 && (
        <div>
          <h3 className="mb-1 font-semibold">Devoluções</h3>
          <ul className="space-y-2 text-sm">
            {order.returns!.map((r) => (
              <li key={r.id} className="rounded-lg border border-border bg-secondary/40 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString("pt-BR")}
                    {r.registeredByName ? ` · por ${r.registeredByName}` : ""}
                  </span>
                  <span className="font-data font-medium">- {formatBRL(r.totalValue)}</span>
                </div>
                <ul className="mt-1 space-y-0.5 text-xs">
                  {r.items.map((it) => (
                    <li key={it.id} className="flex justify-between gap-2">
                      <span className="truncate">{it.reference} x {it.quantity}</span>
                      <span className="font-data shrink-0">{formatBRL(it.value)}</span>
                    </li>
                  ))}
                </ul>
                {r.note && <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{r.note}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Motivos de atraso: o que o setor responsável respondeu quando o
          pedido estourou o prazo de cada etapa. Fica fora do Histórico
          porque é a leitura que a Gestão procura direto — e o histórico
          de um pedido antigo tem dezenas de linhas. Oculto no modo
          motorista, que só acompanha a fase logística. */}
      {!driverMode && (order.delayReasons?.length ?? 0) > 0 && (
        <div>
          <h3 className="mb-1 font-semibold">Motivos de atraso</h3>
          <ul className="space-y-2 text-sm">
            {order.delayReasons!.map((d) => (
              <li
                key={d.id}
                className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {STATUS_LABEL[d.status]}
                    <span className="ml-2 rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                      {formatOverdue(d.minutesLate)} de atraso
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(d.createdAt).toLocaleString("pt-BR")}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap">{d.reason}</p>
                {d.createdByName && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    por {d.createdByName}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Histórico completo: oculto para o motorista (só vê a fase logística).
          É também onde a auditoria das peças de campanha aparece. */}
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

      {children}

      {error && <p className="text-sm text-destructive">{error}</p>}
      {footer}
    </div>
  );
}

/**
 * PEÇAS DE CAMPANHA — lista e, quando `campaigns` é informado, o CRUD.
 *
 * Cada linha é uma peça (campanha, referência, quantidade, valor). O valor e a
 * quantidade são a pontuação do Ranking > Performance na Campanha, e é por isso
 * que toda operação aqui grava uma linha no histórico do pedido (feito na
 * action). A lista devolvida pela action substitui a local, então a tela mostra
 * o estado real logo depois da escrita, sem recarregar a página.
 */
function CampaignItemsBlock({
  orderId,
  items,
  campaigns,
  onItems,
}: {
  orderId: string;
  items: OrderFichaCampaignItem[];
  /** Ausente = só leitura. */
  campaigns?: { id: string; name: string }[];
  onItems: (items: OrderFichaCampaignItem[]) => void;
}) {
  const router = useRouter();
  const podeEditar = !!campaigns?.length;
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Linha em edição (id) e o rascunho do formulário.
  const [editId, setEditId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<{ campaignId: string; reference: string; quantity: string; value: string }>({
    campaignId: "",
    reference: "",
    quantity: "",
    value: "",
  });
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const total = items.reduce((a, it) => a + Number(it.value || 0), 0);
  const pecas = items.reduce((a, it) => a + it.quantity, 0);

  function fecharFormulario() {
    setEditId(null);
    setAdding(false);
    setErro(null);
    setDraft({ campaignId: "", reference: "", quantity: "", value: "" });
  }

  function abrirAdicao() {
    setErro(null);
    setConfirmId(null);
    setEditId(null);
    setAdding(true);
    setDraft({
      // Uma campanha só? Já vem escolhida — é o caso comum.
      campaignId: campaigns?.length === 1 ? campaigns[0].id : "",
      reference: "",
      quantity: "1",
      value: "",
    });
  }

  function abrirEdicao(it: OrderFichaCampaignItem) {
    setErro(null);
    setConfirmId(null);
    setAdding(false);
    setEditId(it.id);
    setDraft({
      campaignId: it.campaignId,
      reference: it.reference,
      quantity: String(it.quantity),
      value: String(Number(it.value)),
    });
  }

  // As actions devolvem a lista inteira já reagregada; a tela só a adota.
  function aplicar(res: Awaited<ReturnType<typeof addCampaignItem>>) {
    setBusy(false);
    if (!res.ok) { setErro(res.error); return; }
    onItems(
      res.data.items.map((it) => ({
        id: it.id,
        campaignId: it.campaignId,
        campaignName: it.campaignName,
        reference: it.reference,
        quantity: it.quantity,
        value: String(it.value),
      })),
    );
    fecharFormulario();
    // O valor da campanha entra no Rank e no Relatório de Campanha: as telas
    // do servidor precisam reler.
    router.refresh();
  }

  function salvar() {
    setErro(null);
    setBusy(true);
    const payload = {
      orderId,
      campaignId: draft.campaignId,
      reference: draft.reference,
      quantity: Number(draft.quantity),
      value: Number(draft.value === "" ? 0 : draft.value),
    };
    (async () => {
      const res = editId
        ? await updateCampaignItem({ ...payload, itemId: editId })
        : await addCampaignItem(payload);
      aplicar(res);
    })();
  }

  function excluir(itemId: string) {
    setErro(null);
    setBusy(true);
    (async () => {
      const res = await deleteCampaignItem({ orderId, itemId });
      setConfirmId(null);
      aplicar(res);
    })();
  }

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Itens de Campanha</h3>
        {podeEditar && !adding && !editId && (
          <Button variant="outline" size="sm" onClick={abrirAdicao} disabled={busy}>
            <Plus className="h-3.5 w-3.5" /> Adicionar item
          </Button>
        )}
      </div>

      {items.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground">Nenhuma peça de campanha lançada neste pedido.</p>
      )}

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((it) =>
            editId === it.id ? (
              <li key={it.id}>
                <CampaignForm
                  campaigns={campaigns!}
                  draft={draft}
                  setDraft={setDraft}
                  busy={busy}
                  onSave={salvar}
                  onCancel={fecharFormulario}
                  saveLabel="Salvar item"
                />
              </li>
            ) : (
              <li
                key={it.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{it.reference}</span>
                <span className="text-xs text-muted-foreground">{it.campaignName}</span>
                <span className="font-data text-xs">x{it.quantity}</span>
                <span className="font-data font-medium">{formatBRL(it.value)}</span>
                {podeEditar && (
                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => abrirEdicao(it)}
                      disabled={busy}
                      className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-40"
                      aria-label={`Editar item ${it.reference}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(it.id)}
                      disabled={busy}
                      className="rounded p-1 text-muted-foreground hover:bg-background hover:text-destructive disabled:opacity-40"
                      aria-label={`Excluir item ${it.reference}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                )}
                {confirmId === it.id && (
                  <span className="flex w-full flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-2 text-xs">
                    <span className="mr-auto text-muted-foreground">
                      Excluir esta peça? O valor sai do Ranking da campanha.
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmId(null)} disabled={busy}>
                      Não
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => excluir(it.id)} disabled={busy}>
                      {busy ? "Excluindo..." : "Sim, excluir"}
                    </Button>
                  </span>
                )}
              </li>
            ),
          )}
        </ul>
      )}

      {/* Totais: é o número que a pessoa compara com o Rank. */}
      {items.length > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          {pecas} peça(s) · <span className="font-data">{formatBRL(total)}</span> em campanha
        </p>
      )}

      {adding && campaigns && (
        <div className="mt-2">
          <CampaignForm
            campaigns={campaigns}
            draft={draft}
            setDraft={setDraft}
            busy={busy}
            onSave={salvar}
            onCancel={fecharFormulario}
            saveLabel="Adicionar item"
          />
        </div>
      )}

      {erro && <p className="mt-1 text-sm text-destructive">{erro}</p>}
    </div>
  );
}

/** Formulário de uma peça de campanha (adição e edição usam o mesmo). */
function CampaignForm({
  campaigns,
  draft,
  setDraft,
  busy,
  onSave,
  onCancel,
  saveLabel,
}: {
  campaigns: { id: string; name: string }[];
  draft: { campaignId: string; reference: string; quantity: string; value: string };
  setDraft: (d: { campaignId: string; reference: string; quantity: string; value: string }) => void;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
  saveLabel: string;
}) {
  return (
    <div className="rounded-lg border border-vendas/40 bg-vendas/5 p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1.4fr_1.4fr_0.7fr_1fr]">
        <div className="space-y-1">
          <Label className="text-xs">Campanha</Label>
          <select
            className="flex h-10 w-full rounded-lg border border-input bg-background px-2 text-sm"
            value={draft.campaignId}
            onChange={(e) => setDraft({ ...draft, campaignId: e.target.value })}
            disabled={busy}
          >
            <option value="">Selecione...</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Referência</Label>
          <Input
            value={draft.reference}
            onChange={(e) => setDraft({ ...draft, reference: e.target.value })}
            placeholder="ex: REF-102"
            disabled={busy}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Quantidade</Label>
          <Input
            type="number" min={1}
            value={draft.quantity}
            onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
            placeholder="ex: 10"
            disabled={busy}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Valor</Label>
          <Input
            type="number" min={0} step="0.01" inputMode="decimal"
            value={draft.value}
            onChange={(e) => setDraft({ ...draft, value: e.target.value })}
            placeholder="0,00"
            disabled={busy}
          />
        </div>
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>Cancelar</Button>
        <Button variant="vendas" size="sm" onClick={onSave} disabled={busy}>
          {busy ? "Salvando..." : saveLabel}
        </Button>
      </div>
    </div>
  );
}

// Campo com borda delimitadora (1.2). Com highlight amarelo PASTEL para
// destacar a Operacao (1.3) — informacao critica, sem ruido visual excessivo.
function Info({
  label,
  value,
  highlight,
  full,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  full?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-2.5 py-1.5 ${full ? "col-span-2 sm:col-span-3" : ""} ${
        highlight
          ? "border-yellow-300 bg-yellow-100 dark:border-yellow-700/60 dark:bg-yellow-500/15"
          : "border-border"
      }`}
    >
      <p className={`text-xs ${highlight ? "text-yellow-800 dark:text-yellow-300/80" : "text-muted-foreground"}`}>{label}</p>
      <p className={`break-words ${highlight ? "font-semibold text-yellow-900 dark:text-yellow-100" : ""}`}>{value}</p>
    </div>
  );
}

function FileLink({ label, path }: { label: string; path: string | null }) {
  if (!path) return <span className="text-muted-foreground">{label}: —</span>;
  // A Nota Fiscal pode ser PDF; sinaliza para o usuario saber o que vai abrir.
  const ehPdf = path.toLowerCase().endsWith(".pdf");
  return (
    <a href={path} target="_blank" rel="noreferrer" className="text-brand underline">
      {label}{ehPdf && " (PDF)"}
    </a>
  );
}
