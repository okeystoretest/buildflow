"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Clock, User, ChevronDown, CheckCircle2, XCircle, AlertTriangle, BadgeDollarSign, Wallet, Truck, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardScroller } from "@/components/shared/card-scroller";
import { flagOrderIssue, confirmPayment, markOrderPaid, uploadSecondPaymentProof } from "@/lib/actions/finance";
import { prepareProofFile } from "@/lib/client-image";
import { useRouter } from "next/navigation";
import { AuditarPedido } from "./audit-client";

export interface FinanceCard {
  id: string;
  orderNumber: string;
  comandaNumber: string | null;
  customerName: string;
  sellerName: string;
  // Nome do tipo de pedido (ex.: "9 - Doação"). Define o painel simplificado.
  orderTypeName: string | null;
  total: string;
  createdAt: string;            // ISO
  currentCnpjId: string | null;
  currentPaymentMethodId: string | null;
  currentBankId: string | null;
  proof2Count: number;
  // Lista dos comprovantes do Financeiro (para exibir com opção de remover).
  proof2List: { id: string; filePath: string }[];
  // Fluxo simplificado (Loja de Origem): modal mostra so comprovante + "Pago".
  simplifiedFlow: boolean;
  paymentProofList: { id: string; filePath: string }[];
  // Observacoes de Envio (logistica). Exibida de forma discreta no card.
  shippingNotes: string | null;
  // Observacoes de Pagamento (EXCLUSIVO do Financeiro). So preenchida na
  // coluna Pendente — nas demais vem null e nao e exibida.
  paymentNotes: string | null;
  processedAt: string | null;   // ISO — só na coluna Processado
  outcome: "APROVADO" | "INTERROMPIDO" | null;
  // Pendencia ja sinalizada e ainda ativa? (mostra estado no card)
  hasActiveIssue: boolean;
}

interface StatusOpt { id: string; name: string; disposition: "APROVA" | "INTERROMPE"; }
interface CnpjOpt { id: string; name: string; document: string; }
interface Opt { id: string; name: string; }

/**
 * Cards visiveis por vez em cada coluna. O restante fica acessivel pela barra
 * de rolagem (o botao "Ver mais" foi removido): a fila do Financeiro e de
 * trabalho continuo, e o clique extra a cada 3 pedidos so atrapalhava.
 */
const VISIVEIS_POR_COLUNA = 3;

/** Teto de comprovantes por pedido — mesmo limite aplicado no servidor. */
const MAX_COMPROVANTES = 5;

export function AnaliseKanban({
  pendentes,
  processados,
  pagPendentes,
  statusOptions,
  cnpjOptions,
  paymentMethods,
  banks,
  processedWindowMin,
  podeAnexarComprovante,
}: {
  pendentes: FinanceCard[];
  processados: FinanceCard[];
  pagPendentes: FinanceCard[];
  statusOptions: StatusOpt[];
  cnpjOptions: CnpjOpt[];
  paymentMethods: Opt[];
  banks: Opt[];
  processedWindowMin: number;
  /** Anexar comprovante e exclusivo do setor Financeiro (Gestao inclusa). */
  podeAnexarComprovante: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  // Card cujo modal "Qual o problema?" esta aberto.
  const [issueId, setIssueId] = useState<string | null>(null);
  const router = useRouter();

  // "Relogio" interno: reavalia de 30 em 30s quais processados ja passaram
  // dos 15 min e devem sumir da coluna — sem recarregar a pagina.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Atualizacao automatica dos dados do Financeiro a cada 2 minutos: busca o
  // estado mais recente do servidor sem recarregar a pagina nem perder modais
  // abertos. Pausa quando a aba esta em segundo plano.
  useEffect(() => {
    const REFRESH_MS = 2 * 60 * 1000; // 2 minutos
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [router]);

  const windowMs = processedWindowMin * 60 * 1000;

  // Filtra processados dentro da janela de 15 min.
  const procVisiveis = useMemo(
    () =>
      processados.filter((c) =>
        c.processedAt ? nowTick - new Date(c.processedAt).getTime() < windowMs : false,
      ),
    [processados, nowTick, windowMs],
  );

  const aberto = openId ? pendentes.find((c) => c.id === openId) ?? null : null;
  const cardIssue = issueId ? pendentes.find((c) => c.id === issueId) ?? null : null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* COLUNA PENDENTE */}
      <Column
        title="Pendente"
        count={pendentes.length}
        tone="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        dot="bg-amber-500"
      >
        {pendentes.map((c) => (
          <PendingCard key={c.id} card={c} onOpen={() => setOpenId(c.id)} onFlag={() => setIssueId(c.id)} />
        ))}
        {pendentes.length === 0 && <Empty>Nenhum pedido aguardando análise.</Empty>}
      </Column>

      {/* COLUNA PROCESSADO */}
      <Column
        title="Processado"
        count={procVisiveis.length}
        tone="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
        dot="bg-emerald-500"
        hint={`Somem após ${processedWindowMin} min`}
      >
        {procVisiveis.map((c) => (
          <ProcessedCard key={c.id} card={c} />
        ))}
        {procVisiveis.length === 0 && <Empty>Nenhum pedido processado recentemente.</Empty>}
      </Column>

      {/* COLUNA PAGAMENTO PENDENTE (azul claro) */}
      <Column
        title="Pagamento pendente"
        count={pagPendentes.length}
        tone="border-sky-400/40 bg-sky-400/10 text-sky-700 dark:text-sky-300"
        dot="bg-sky-400"
        hint="Aguardando confirmação"
      >
        {pagPendentes.map((c) => (
          <PaidPendingCard key={c.id} card={c} podeAnexar={podeAnexarComprovante} />
        ))}
        {pagPendentes.length === 0 && <Empty>Nenhum pagamento pendente.</Empty>}
      </Column>

      {/* MODAL de auditoria (expansao do card Pendente). */}
      {aberto && (
        <Modal onClose={() => setOpenId(null)}>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Pedido {aberto.orderNumber}</h2>
              <p className="text-sm text-muted-foreground">
                {aberto.customerName} · Vend.: {aberto.sellerName}
              </p>
            </div>
            <button onClick={() => setOpenId(null)} className="text-2xl leading-none text-muted-foreground">×</button>
          </div>

          <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
            <Clock className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="font-data text-base font-bold text-amber-700 dark:text-amber-300">
              {new Date(aberto.createdAt).toLocaleString("pt-BR", {
                day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
              })}
            </span>
            <span className="ml-auto font-data font-semibold">{aberto.total}</span>
          </div>

          {/* OBSERVACOES DE PAGAMENTO — destaque laranja, no topo do modal para
              leitura imediata pela equipe de aprovacao. */}
          {aberto.paymentNotes?.trim() && (
            <div className="mb-3 rounded-lg border-2 border-orange-400/70 bg-orange-100/80 p-3 dark:border-orange-400/50 dark:bg-orange-400/10">
              <h3 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-orange-800 dark:text-orange-200">
                <Wallet className="h-4 w-4" /> Observações de Pagamento
              </h3>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-orange-900 dark:text-orange-100">
                {aberto.paymentNotes}
              </p>
            </div>
          )}

          {/* OBSERVACOES DE ENVIO — informativo, sem destaque. */}
          {aberto.shippingNotes?.trim() && (
            <div className="mb-3 rounded-lg border border-border bg-secondary/30 p-3">
              <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Truck className="h-3.5 w-3.5" /> Observações de Envio
              </h3>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{aberto.shippingNotes}</p>
            </div>
          )}

          {aberto.simplifiedFlow ? (
            <SimplifiedPaidPanel
              orderId={aberto.id}
              proofs={aberto.paymentProofList}
              onDone={() => setOpenId(null)}
            />
          ) : (
            <AuditarPedido
              orderId={aberto.id}
              statusOptions={statusOptions}
              cnpjOptions={cnpjOptions}
              currentCnpjId={aberto.currentCnpjId}
              paymentMethods={paymentMethods}
              banks={banks}
              currentPaymentMethodId={aberto.currentPaymentMethodId}
              currentBankId={aberto.currentBankId}
              proof2List={aberto.proof2List}
              orderTypeName={aberto.orderTypeName}
              onProcessed={() => setOpenId(null)}
            />
          )}
        </Modal>
      )}

      {/* MODAL "Qual o problema?" — sinalizacao de pendencia pelo Financeiro. */}
      {cardIssue && (
        <IssueModal
          orderNumber={cardIssue.orderNumber}
          orderId={cardIssue.id}
          onClose={() => setIssueId(null)}
        />
      )}
    </div>
  );
}

function IssueModal({ orderId, orderNumber, onClose }: {
  orderId: string; orderNumber: string; onClose: () => void;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!text.trim()) { setErr("Descreva o problema."); return; }
    setBusy(true); setErr(null);
    const res = await flagOrderIssue({ orderId, issue: text });
    setBusy(false);
    if (res.ok) { onClose(); router.refresh(); }
    else setErr(res.error);
  }

  return (
    <Modal onClose={onClose}>
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-amber-500" />
        <h2 className="text-lg font-bold">Qual o problema?</h2>
      </div>
      <p className="mb-2 text-sm text-muted-foreground">Pedido {orderNumber}</p>
      <textarea
        className="min-h-[110px] w-full rounded-lg border border-input bg-background p-3 text-sm"
        placeholder="Descreva a inconsistência para a vendedora corrigir..."
        value={text} onChange={(e) => setText(e.target.value)} autoFocus
      />
      {err && <p className="mt-1 text-sm text-destructive">{err}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button variant="financeiro" onClick={submit} disabled={busy || !text.trim()}>
          {busy ? "Enviando..." : "Sinalizar pendência"}
        </Button>
      </div>
    </Modal>
  );
}

function Column({
  title, count, tone, dot, hint, children,
}: {
  title: string; count: number; tone: string; dot: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <div className={`mb-2 flex items-center justify-between rounded-lg border px-3 py-2 ${tone}`}>
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
          {title}
          <span className="font-data rounded-full bg-background/60 px-1.5 text-xs">{count}</span>
        </span>
        {hint && <span className="text-[11px] opacity-80">{hint}</span>}
      </div>
      {/* Empilhamento com rolagem: 3 cards visiveis, o resto rola. A altura e
          medida pelo 3o card (ver CardScroller) porque os cards do Financeiro
          variam de altura conforme as observacoes — com altura fixa o ultimo
          aparecia cortado ao meio. */}
      <CardScroller visibleItems={VISIVEIS_POR_COLUNA}>{children}</CardScroller>
    </div>
  );
}

function PendingCard({ card, onOpen, onFlag }: { card: FinanceCard; onOpen: () => void; onFlag: () => void }) {
  return (
    <div className={`card-hover animate-fade-in-up w-full rounded-xl border bg-card p-3 shadow-sm ${
      card.hasActiveIssue ? "border-destructive/50 ring-1 ring-destructive/20" : "border-border hover:border-primary/40 hover:shadow-md"
    }`}>
      {/* Corpo clicavel: abre o modal de auditoria. */}
      <button onClick={onOpen} className="block w-full text-left">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="font-data text-sm font-semibold">Pedido {card.orderNumber}</span>
          <span className="font-data text-sm font-semibold">{card.total}</span>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <User className="h-3 w-3 shrink-0" /> {card.customerName} · {card.sellerName}
        </p>

        {/* Obs. de Pagamento em DESTAQUE laranja (visibilidade imediata p/ o
            Financeiro). Aparece apenas quando ha texto. */}
        {card.paymentNotes?.trim() && (
          <div className="mt-2 rounded-md border border-orange-400/60 bg-orange-100/70 px-2 py-1 dark:border-orange-400/40 dark:bg-orange-400/10">
            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-300">
              <Wallet className="h-3 w-3" /> Obs. Pagamento
            </p>
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-orange-900 dark:text-orange-100">
              {card.paymentNotes}
            </p>
          </div>
        )}

        {/* Obs. de Envio: discreta (nao e o foco do Financeiro). */}
        {card.shippingNotes?.trim() && (
          <p className="mt-1.5 flex items-start gap-1 text-[11px] text-muted-foreground">
            <Truck className="mt-0.5 h-3 w-3 shrink-0" />
            <span className="line-clamp-1">{card.shippingNotes}</span>
          </p>
        )}

        <div className="mt-2 flex items-center justify-between">
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            {new Date(card.createdAt).toLocaleString("pt-BR", {
              day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
            })}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-financeiro/15 px-2 py-0.5 text-[11px] font-medium text-financeiro">
            Analisar <ChevronDown className="h-3 w-3" />
          </span>
        </div>
      </button>

      {/* Botao Atencao: sinaliza pendencia. Fica FORA da area clicavel do card. */}
      <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-2">
        {card.hasActiveIssue ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" /> Pendência sinalizada
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground/60">Sem pendência</span>
        )}
        <button onClick={onFlag}
          className="inline-flex items-center gap-1 rounded-full border border-amber-500/50 px-2 py-0.5 text-[11px] font-medium text-amber-600 transition-colors hover:bg-amber-500/10 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" /> Atenção
        </button>
      </div>
    </div>
  );
}

function ProcessedCard({ card }: { card: FinanceCard }) {
  const aprovado = card.outcome === "APROVADO";
  return (
    <div className="animate-fade-in-up w-full rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-data text-sm font-semibold">
          {card.comandaNumber ? `Comanda ${card.comandaNumber}` : `Pedido ${card.orderNumber}`}
        </span>
        <span className="font-data text-sm font-semibold">{card.total}</span>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <User className="h-3 w-3 shrink-0" /> {card.customerName} · {card.sellerName}
      </p>
      <div className="mt-2 flex items-center justify-between">
        {aprovado ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> Aprovado
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-destructive">
            <XCircle className="h-3.5 w-3.5" /> Interrompido
          </span>
        )}
        {card.processedAt && (
          <span className="text-[11px] text-muted-foreground">
            {new Date(card.processedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>
    </div>
  );
}

// Painel do Financeiro para pedidos de fluxo simplificado (Loja de Origem).
// Mostra APENAS o(s) comprovante(s) de pagamento e o botao "Pago", que move
// o pedido para o status PAGO. Sem CNPJ, forma de pagamento, banco ou NF.
function SimplifiedPaidPanel({ orderId, proofs, onDone }: {
  orderId: string;
  proofs: { id: string; filePath: string }[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pay() {
    setBusy(true); setErr(null);
    const res = await markOrderPaid(orderId);
    setBusy(false);
    if (res.ok) { onDone(); router.refresh(); }
    else setErr(res.error);
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-secondary/30 p-3">
        <p className="mb-2 text-sm font-semibold">Comprovante de pagamento</p>
        {proofs.length === 0 ? (
          <p className="text-sm text-destructive">Nenhum comprovante anexado. O pedido não pode ser marcado como Pago.</p>
        ) : (
          <ul className="space-y-1">
            {proofs.map((p, i) => (
              <li key={p.id} className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{i + 1}.</span>
                <a href={p.filePath} target="_blank" rel="noreferrer" className="truncate text-financeiro underline">
                  Ver comprovante {i + 1}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {err && <p className="text-sm text-destructive">{err}</p>}

      <Button
        onClick={pay}
        disabled={busy || proofs.length === 0}
        className="w-full bg-sky-500 text-white hover:bg-sky-600"
      >
        <BadgeDollarSign className="mr-1 h-4 w-4" />
        {busy ? "Confirmando..." : "Pago"}
      </Button>
    </div>
  );
}

/**
 * Card da coluna "Pagamento pendente".
 *
 * Alem do "Pago", traz o "Inserir Comprovante" a ESQUERDA dele: o Financeiro
 * costuma receber o comprovante depois da liberacao, e ate aqui era preciso
 * voltar pela Analise para anexar. Reaproveita a mesma Server Action do 2o
 * comprovante (uploadSecondPaymentProof) — mesmo teto de 5 arquivos, mesmo
 * pipeline do sharp (.webp no disco, so o caminho no banco) e PDF gravado
 * como esta.
 */
function PaidPendingCard({ card, podeAnexar }: { card: FinanceCard; podeAnexar: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [anexando, setAnexando] = useState(false);
  const [anexos, setAnexos] = useState(card.proof2Count);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const cheio = anexos >= MAX_COMPROVANTES;

  async function onArquivos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    const espacoLivre = MAX_COMPROVANTES - anexos;
    if (espacoLivre <= 0) {
      setErr(`Limite de ${MAX_COMPROVANTES} comprovantes atingido.`);
      return;
    }

    setErr(null); setOkMsg(null); setAnexando(true);
    const base64List: string[] = [];
    for (const file of files.slice(0, espacoLivre)) {
      const pronto = await prepareProofFile(file, { maxDimension: 1600, quality: 0.8 });
      if (pronto.error || !pronto.base64) {
        setErr(pronto.error ?? "Não foi possível processar o arquivo.");
        continue;
      }
      base64List.push(pronto.base64);
    }
    if (base64List.length === 0) { setAnexando(false); return; }

    const res = await uploadSecondPaymentProof({ orderId: card.id, base64List });
    setAnexando(false);
    if (res.ok) {
      setAnexos((n) => Math.min(n + res.data.count, MAX_COMPROVANTES));
      setOkMsg(`${res.data.count} comprovante(s) anexado(s).`);
      router.refresh();
    } else setErr(res.error);
  }

  async function pay() {
    setBusy(true); setErr(null);
    const res = await confirmPayment(card.id);
    setBusy(false);
    if (res.ok) router.refresh();
    else setErr(res.error);
  }

  return (
    <div className="animate-fade-in-up w-full rounded-xl border border-sky-400/40 bg-card p-3 shadow-sm">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-data text-sm font-semibold">Pedido {card.orderNumber}</span>
        <span className="font-data text-sm font-semibold">{card.total}</span>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <User className="h-3 w-3 shrink-0" /> {card.customerName} · {card.sellerName}
      </p>
      <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
        <Clock className="h-3 w-3" />
        {new Date(card.createdAt).toLocaleString("pt-BR", {
          day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
        })}
      </div>

      {podeAnexar && anexos > 0 && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {anexos}/{MAX_COMPROVANTES} comprovante(s) anexado(s).
        </p>
      )}

      {err && <p className="mt-2 text-[11px] text-destructive">{err}</p>}
      {okMsg && <p className="mt-2 text-[11px] text-motorista">{okMsg}</p>}

      <div className="mt-3 flex items-center gap-2">
        {podeAnexar && (
          <>
            {/* Input escondido: o botao e quem dispara a selecao de arquivos. */}
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.pdf"
              onChange={onArquivos}
              className="hidden"
            />
            <Button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={anexando || busy || cheio}
              size="sm"
              variant="outline"
              className="flex-1"
              title={cheio ? `Limite de ${MAX_COMPROVANTES} comprovantes atingido` : "Anexar comprovante"}
            >
              <Paperclip className="mr-1 h-4 w-4" />
              {anexando ? "Enviando..." : cheio ? "Limite atingido" : "Inserir Comprovante"}
            </Button>
          </>
        )}

        <Button
          onClick={pay}
          disabled={busy || anexando}
          size="sm"
          className={`${podeAnexar ? "flex-1" : "w-full"} bg-sky-500 text-white hover:bg-sky-600`}
        >
          <BadgeDollarSign className="mr-1 h-4 w-4" />
          {busy ? "Confirmando..." : "Pago"}
        </Button>
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border/60 py-8 text-center text-sm text-muted-foreground/60">
      {children}
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
