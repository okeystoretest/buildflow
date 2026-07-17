"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock, User, ChevronDown, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { flagOrderIssue } from "@/lib/actions/finance";
import { useRouter } from "next/navigation";
import { AuditarPedido } from "./audit-client";

export interface FinanceCard {
  id: string;
  orderNumber: string;
  comandaNumber: string | null;
  customerName: string;
  sellerName: string;
  total: string;
  createdAt: string;            // ISO
  currentCnpjId: string | null;
  currentPaymentMethodId: string | null;
  currentBankId: string | null;
  proof2Count: number;
  processedAt: string | null;   // ISO — só na coluna Processado
  outcome: "APROVADO" | "INTERROMPIDO" | null;
  // Pendencia ja sinalizada e ainda ativa? (mostra estado no card)
  hasActiveIssue: boolean;
}

interface StatusOpt { id: string; name: string; disposition: "APROVA" | "INTERROMPE"; }
interface CnpjOpt { id: string; name: string; document: string; }
interface Opt { id: string; name: string; }

const PAGE = 3; // cards visiveis por vez em cada coluna

export function AnaliseKanban({
  pendentes,
  processados,
  statusOptions,
  cnpjOptions,
  paymentMethods,
  banks,
  processedWindowMin,
}: {
  pendentes: FinanceCard[];
  processados: FinanceCard[];
  statusOptions: StatusOpt[];
  cnpjOptions: CnpjOpt[];
  paymentMethods: Opt[];
  banks: Opt[];
  processedWindowMin: number;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  // Card cujo modal "Qual o problema?" esta aberto.
  const [issueId, setIssueId] = useState<string | null>(null);
  const [showAllPend, setShowAllPend] = useState(false);
  const [showAllProc, setShowAllProc] = useState(false);
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

  const pendVis = showAllPend ? pendentes : pendentes.slice(0, PAGE);
  const procVis = showAllProc ? procVisiveis : procVisiveis.slice(0, PAGE);

  const aberto = openId ? pendentes.find((c) => c.id === openId) ?? null : null;
  const cardIssue = issueId ? pendentes.find((c) => c.id === issueId) ?? null : null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* COLUNA PENDENTE */}
      <Column
        title="Pendente"
        count={pendentes.length}
        tone="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        dot="bg-amber-500"
      >
        {pendVis.map((c) => (
          <PendingCard key={c.id} card={c} onOpen={() => setOpenId(c.id)} onFlag={() => setIssueId(c.id)} />
        ))}
        {pendentes.length === 0 && <Empty>Nenhum pedido aguardando análise.</Empty>}
        {pendentes.length > PAGE && (
          <VerMais total={pendentes.length} shown={pendVis.length}
            expanded={showAllPend} onToggle={() => setShowAllPend((v) => !v)} />
        )}
      </Column>

      {/* COLUNA PROCESSADO */}
      <Column
        title="Processado"
        count={procVisiveis.length}
        tone="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
        dot="bg-emerald-500"
        hint={`Somem após ${processedWindowMin} min`}
      >
        {procVis.map((c) => (
          <ProcessedCard key={c.id} card={c} />
        ))}
        {procVisiveis.length === 0 && <Empty>Nenhum pedido processado recentemente.</Empty>}
        {procVisiveis.length > PAGE && (
          <VerMais total={procVisiveis.length} shown={procVis.length}
            expanded={showAllProc} onToggle={() => setShowAllProc((v) => !v)} />
        )}
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

          <AuditarPedido
            orderId={aberto.id}
            statusOptions={statusOptions}
            cnpjOptions={cnpjOptions}
            currentCnpjId={aberto.currentCnpjId}
            paymentMethods={paymentMethods}
            banks={banks}
            currentPaymentMethodId={aberto.currentPaymentMethodId}
            currentBankId={aberto.currentBankId}
            proof2Count={aberto.proof2Count}
            onProcessed={() => setOpenId(null)}
          />
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
      <div className="flex flex-col gap-2">{children}</div>
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

function VerMais({ total, shown, expanded, onToggle }: {
  total: number; shown: number; expanded: boolean; onToggle: () => void;
}) {
  return (
    <Button variant="outline" size="sm" className="mt-1" onClick={onToggle}>
      {expanded ? "Ver menos" : `Ver mais (${total - shown} restantes)`}
    </Button>
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
