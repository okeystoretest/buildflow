"use client";

import type { OrderStatus } from "@prisma/client";
import { FileText, Receipt, User, Tag, Clock } from "lucide-react";
import { STATUS_STYLE, formatOverdue, type StageAlert } from "@/lib/order-flow";
import { cn } from "@/lib/utils";

export interface OrderCardData {
  id: string;
  status: OrderStatus;
  orderNumber: string;
  comandaNumber: string | null;
  customerName: string;
  customerCode?: string | null;
  sellerName: string;
  total?: string;
  hasInvoice: boolean;
  hasPaymentProof?: boolean;
  // Pedido do tipo Troca: isento do bloqueio "Processando sem NF" (doc §5).
  isExchange?: boolean;
  approvedByFinance: boolean;
  // Pedido já tem motorista atribuído para a entrega. Quando true, a Logística
  // não deve mais avançar o status manualmente (a entrega está com o motorista).
  hasDriver?: boolean;
  // ISO da entrada em ENTREGUE (usado para sumir do fluxo após 15 min).
  deliveredAt?: string | null;
  // ISO de quando o pedido entrou no status atual (para alerta temporal).
  statusSince?: string | null;
  // Já existe motivo de atraso registrado para a etapa ATUAL deste pedido.
  // Quando true, o quadro não volta a pedir a justificativa.
  hasDelayReason?: boolean;
}

export function OrderCard({
  data,
  onClick,
  style,
  action,
  stageAlert = "none",
  lateMinutes = 0,
}: {
  data: OrderCardData;
  onClick?: () => void;
  style?: React.CSSProperties;
  // Slot de acao renderizado DENTRO do card (ex.: seta de mudar status).
  // Fica fora da area clicavel principal para nao abrir o modal por engano.
  action?: React.ReactNode;
  // Nivel de alerta temporal calculado pelo board (aviso/alerta/nenhum).
  stageAlert?: StageAlert;
  // Minutos decorridos desde que o prazo da etapa estourou (0 = no prazo).
  // Exibido ao lado do selo "Atrasado" para dar o tamanho do atraso.
  lateMinutes?: number;
}) {
  const s = STATUS_STYLE[data.status];
  // Alerta visual: processando sem NF. Troca (4 - Troca) e isenta de NF, entao
  // nao dispara o alerta nem o selo vermelho "Sem NF".
  const alerta = data.status === "PROCESSANDO" && !data.hasInvoice && !data.isExchange;

  // Regra de exibicao: se ja existe comanda, ela tem prioridade; senao, pedido.
  const principal = data.comandaNumber
    ? { rotulo: "Comanda", valor: data.comandaNumber }
    : { rotulo: "Pedido", valor: data.orderNumber };

  // Realce por tempo de permanencia (Gestao > Etapas). O "Sem NF" tem
  // prioridade visual (vermelho proprio); fora isso aplicamos warn/alert.
  // Os DOIS niveis preenchem o card por inteiro:
  //   - 50% do prazo  -> fundo AMARELO (antes era so a borda);
  //   - prazo estourado -> fundo VERMELHO.
  // O contraste do texto e tratado pelas classes `.card-overdue` (texto branco
  // sobre o vermelho) e `.card-warn` (texto escuro sobre o amarelo) em
  // globals.css — amarelo com texto branco fica ilegivel.
  const atrasado = !alerta && stageAlert === "alert";
  const atencao = !alerta && stageAlert === "warn";
  // Card com fundo preenchido: muda o tratamento dos chips internos.
  const preenchido = atrasado || atencao;
  const timeBorder = atrasado
    ? "card-overdue border-red-700 bg-red-600 shadow-md shadow-red-900/20"
    : atencao
      ? "card-warn border-amber-500 bg-amber-300 shadow-md shadow-amber-900/10"
      : null;

  return (
    <div
      style={style}
      className={cn(
        "card-hover group w-full rounded-xl border p-3 text-left shadow-sm animate-fade-in-up",
        preenchido ? null : "bg-card",
        alerta
          ? "border-destructive/50 ring-1 ring-destructive/20 hover:shadow-md hover:shadow-destructive/10"
          : timeBorder ?? "border-border hover:border-primary/40 hover:shadow-md",
      )}
    >
      {/* Area clicavel que abre o modal (todo o corpo do card). */}
      <button onClick={onClick} className="block w-full text-left">
        {/* topo: indicador de status + numero principal */}
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={cn("h-2 w-2 shrink-0 rounded-full", s.dot)} />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{principal.rotulo}</p>
              <p className="font-data text-sm font-semibold leading-none truncate">{principal.valor}</p>
            </div>
          </div>
          {data.total && (
            <span className="font-data text-sm font-semibold text-foreground/90 shrink-0">{data.total}</span>
          )}
        </div>

        {/* corpo: cliente (com codigo) + vendedora */}
        <div className="space-y-1 text-xs text-muted-foreground">
          <p className="flex items-center gap-1.5 truncate">
            <User className="h-3 w-3 shrink-0" />
            <span className="truncate">{data.customerName}</span>
            {data.customerCode && (
              <span className="font-data shrink-0 rounded bg-secondary px-1 text-[10px] text-foreground/70">
                {data.customerCode}
              </span>
            )}
          </p>
          <p className="flex items-center gap-1.5 truncate">
            <Tag className="h-3 w-3 shrink-0" /> {data.sellerName}
          </p>
        </div>
      </button>

      {/* rodape: sinais (NF, comprovante) + alerta + acao (seta de status) */}
      <div className="mt-2 flex items-center gap-2 border-t border-border/60 pt-2">
        <Signal active={data.hasPaymentProof} filled={preenchido} overdue={atrasado} icon={<Receipt className="h-3 w-3" />} label="Comprov." />
        <Signal active={data.hasInvoice} filled={preenchido} overdue={atrasado} icon={<FileText className="h-3 w-3" />} label="NF" />
        {alerta && (
          <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold text-destructive">
            Sem NF
          </span>
        )}
        {!alerta && stageAlert !== "none" && (
          <span
            className={cn(
              "order-overdue-badge inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
              atrasado ? "bg-white text-red-700" : "bg-white text-amber-800",
            )}
            title={
              atrasado
                ? `Tempo limite excedido há ${formatOverdue(lateMinutes)}`
                : "Atenção: 50% do tempo limite"
            }
          >
            <Clock className="h-3 w-3" />
            {/* No atraso, o selo carrega o TAMANHO do atraso ("Atrasado · 7min")
                — saber que estourou o prazo diz pouco sem saber há quanto. */}
            {atrasado ? `Atrasado · ${formatOverdue(lateMinutes)}` : "Atenção"}
          </span>
        )}
        {action && <span className="ml-auto shrink-0">{action}</span>}
      </div>
    </div>
  );
}

function Signal({
  active,
  filled,
  overdue,
  icon,
  label,
}: {
  active?: boolean;
  // Card com fundo preenchido (amarelo de atencao ou vermelho de atraso).
  // Nesse contexto o verde translucido some, entao o chip "anexado" vira verde
  // SOLIDO — a cor do documento anexado e verde em qualquer fundo.
  filled?: boolean;
  // Card atrasado (fundo vermelho): muda so o chip PENDENTE, que precisa de
  // borda clara para nao sumir; no amarelo a borda e escura.
  overdue?: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  // Documento anexado = SEMPRE verde, independente da cor de fundo do card.
  // Em card preenchido usamos verde solido (`signal-filled-active` reforça a
  // cor em globals.css, vencendo o `.card-overdue *` / `.card-warn *`).
  const cls = active
    ? filled
      ? "signal-filled-active bg-emerald-500 text-white"
      : "bg-motorista/15 text-motorista"
    : filled
      ? overdue
        ? "border border-white/40 text-white/80"
        : "border border-amber-900/30 text-amber-900/70"
      : "bg-secondary text-muted-foreground/60";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
        cls,
      )}
      title={active ? `${label}: anexado` : `${label}: pendente`}
    >
      {icon}{label}
    </span>
  );
}
