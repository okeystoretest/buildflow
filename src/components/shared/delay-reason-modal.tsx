"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlarmClock, X } from "lucide-react";
import { STATUS_LABEL, formatOverdue } from "@/lib/order-flow";
import { registerDelayReason } from "@/lib/actions/delays";
import { Button } from "@/components/ui/button";
import type { OrderCardData } from "@/components/shared/order-card";

const MAX_REASON = 500;

/**
 * MOTIVO DO ATRASO — pedido automático de justificativa.
 *
 * Abre sozinho quando um card do quadro passa de 5 minutos além do prazo da
 * etapa. Quem é interrompido é apenas o setor DONO daquele status (mais a
 * Gestão): num quadro compartilhado, disparar o mesmo pop-up para todo mundo
 * transformaria a justificativa em ruído que ninguém responde.
 *
 * O botão "Agora não" existe de propósito: o quadro é tela de operação, e um
 * modal sem saída travaria o trabalho de quem só quer mover um card. A dispensa
 * vale para a sessão da aba — ao recarregar a página o pedido volta a aparecer
 * enquanto não houver motivo registrado.
 */
export function DelayReasonModal({
  card,
  lateMinutes,
  onDone,
  onDismiss,
}: {
  card: OrderCardData;
  lateMinutes: number;
  // Motivo salvo com sucesso (o board marca o card e segue para o próximo).
  onDone: () => void;
  // "Agora não" — adia o pedido para este card até o próximo carregamento.
  onDismiss: () => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => setPortalTarget(document.body), []);

  // ESC dispensa (equivale a "Agora não") — o modal não pode prender a tela.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  async function salvar() {
    const texto = reason.trim();
    if (!texto) {
      setError("Descreva o motivo do atraso.");
      return;
    }
    setError(null);
    setSaving(true);
    const res = await registerDelayReason({ orderId: card.id, reason: texto });
    setSaving(false);
    if (res.ok) {
      onDone();
    } else {
      setError(res.error);
    }
  }

  const principal = card.comandaNumber
    ? `Comanda ${card.comandaNumber}`
    : `Pedido ${card.orderNumber}`;

  // Portal no <body> pelo mesmo motivo do OrderDetailModal: os cards usam
  // transform (card-hover), e um ancestral com transform prende o position:fixed.
  if (!portalTarget) return null;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl animate-scale-in">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/15 text-destructive">
              <AlarmClock className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-lg font-semibold leading-tight">Motivo do atraso</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {principal} · {card.customerName}
              </p>
            </div>
          </div>
          <button
            onClick={onDismiss}
            aria-label="Fechar"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
          Este pedido está{" "}
          <span className="font-semibold text-destructive">
            {formatOverdue(lateMinutes)} além do prazo
          </span>{" "}
          na etapa <span className="font-semibold">{STATUS_LABEL[card.status]}</span>.
        </p>

        <label htmlFor="delay-reason" className="mb-1.5 block text-sm font-medium">
          O que causou o atraso?
        </label>
        <textarea
          id="delay-reason"
          autoFocus
          rows={4}
          maxLength={MAX_REASON}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ex.: aguardando reposição da peça no estoque."
          className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary"
        />
        <p className="mt-1 text-right text-[11px] text-muted-foreground">
          {reason.length}/{MAX_REASON}
        </p>

        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onDismiss} disabled={saving}>
            Agora não
          </Button>
          <Button onClick={salvar} disabled={saving}>
            {saving ? "Salvando..." : "Salvar motivo"}
          </Button>
        </div>
      </div>
    </div>,
    portalTarget,
  );
}
