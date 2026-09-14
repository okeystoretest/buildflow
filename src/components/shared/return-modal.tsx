"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PackageMinus, Plus, Trash2, X } from "lucide-react";
import { registerOrderReturn } from "@/lib/actions/returns";
import { validateReturnItems, MAX_RETURN_ITEMS } from "@/lib/order-returns";
import { formatBRL } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Linha {
  key: number;
  reference: string;
  quantity: string;
  value: string;
}

function novaLinha(key: number): Linha {
  return { key, reference: "", quantity: "1", value: "" };
}

/** "12,50" e "12.50" valem; vazio vira NaN e cai na validacao. */
function toNumber(s: string): number {
  return Number(s.trim().replace(",", "."));
}

/**
 * DEVOLUÇÃO — formulário de peças devolvidas de um pedido.
 *
 * Usado na tela de Vendas (linha do pedido) e no Histórico de Vendas (card
 * expandido). Cada linha é (referência, quantidade, valor); a soma dos valores
 * é abatida do pedido pela action, que também recalcula o total e os itens de
 * campanha — o Ranking e as metas leem esses campos e se atualizam sozinhos.
 *
 * `currentValue` é o valor atual da mercadoria (sem frete): serve para mostrar
 * ao usuário quanto sobra e barrar, ainda no cliente, devolução maior que o
 * pedido. O servidor reconfere.
 */
export function ReturnModal({
  orderId,
  orderLabel,
  currentValue,
  onClose,
  onSaved,
}: {
  orderId: string;
  /** Texto de identificação no cabeçalho ("Pedido 123 · Comanda 45"). */
  orderLabel: string;
  /** Valor atual da mercadoria, em reais. */
  currentValue: number;
  onClose: () => void;
  /** Devolução gravada: recebe os novos valores para a tela atualizar. */
  onSaved: (next: { orderValue: number; total: number }) => void;
}) {
  const [linhas, setLinhas] = useState<Linha[]>([novaLinha(0)]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => setPortalTarget(document.body), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const somaValores = linhas.reduce((a, l) => {
    const v = toNumber(l.value);
    return a + (Number.isFinite(v) && v > 0 ? v : 0);
  }, 0);
  const restante = currentValue - somaValores;
  const excede = somaValores > currentValue + 0.005;

  function atualizar(key: number, campo: keyof Omit<Linha, "key">, valor: string) {
    setError(null);
    setLinhas((prev) => prev.map((l) => (l.key === key ? { ...l, [campo]: valor } : l)));
  }
  function adicionar() {
    setError(null);
    setLinhas((prev) =>
      prev.length >= MAX_RETURN_ITEMS ? prev : [...prev, novaLinha((prev.at(-1)?.key ?? 0) + 1)],
    );
  }
  function remover(key: number) {
    setError(null);
    setLinhas((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.key !== key)));
  }

  async function salvar() {
    const items = linhas.map((l) => ({
      reference: l.reference.trim(),
      quantity: toNumber(l.quantity),
      value: toNumber(l.value),
    }));
    const invalido = validateReturnItems(items);
    if (invalido) { setError(invalido); return; }
    if (excede) {
      setError(`O valor devolvido (${formatBRL(somaValores)}) é maior que o valor atual da mercadoria (${formatBRL(currentValue)}).`);
      return;
    }
    setSaving(true);
    setError(null);
    const res = await registerOrderReturn({ orderId, items, note });
    setSaving(false);
    if (res.ok) {
      onSaved({ orderValue: res.data.orderValue, total: res.data.total });
      onClose();
    } else {
      setError(res.error);
    }
  }

  if (!portalTarget) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in"
      onClick={() => !saving && onClose()}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="return-modal-title"
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <PackageMinus className="h-5 w-5 text-vendas" />
            <h2 id="return-modal-title" className="text-lg font-bold">Registrar devolução</h2>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} disabled={saving} aria-label="Fechar">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">{orderLabel}</p>

        {/* Linhas: referência, quantidade, valor. Cabeçalho só no desktop; no
            celular cada campo carrega o próprio rótulo via placeholder. */}
        <div className="mb-2 hidden grid-cols-[1fr_5rem_7rem_2rem] gap-2 text-xs font-medium text-muted-foreground sm:grid">
          <span>Referência</span>
          <span>Qtd.</span>
          <span>Valor (R$)</span>
          <span />
        </div>
        <div className="max-h-[40vh] space-y-2 overflow-y-auto pr-1">
          {linhas.map((l, i) => (
            <div key={l.key} className="grid grid-cols-[1fr_4.5rem_6.5rem_2rem] gap-2 sm:grid-cols-[1fr_5rem_7rem_2rem]">
              <Input
                placeholder="Referência"
                value={l.reference}
                maxLength={120}
                autoFocus={i === 0}
                onChange={(e) => atualizar(l.key, "reference", e.target.value)}
                disabled={saving}
              />
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                placeholder="Qtd."
                value={l.quantity}
                onChange={(e) => atualizar(l.key, "quantity", e.target.value)}
                disabled={saving}
              />
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={l.value}
                onChange={(e) => atualizar(l.key, "value", e.target.value)}
                disabled={saving}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => remover(l.key)}
                disabled={saving || linhas.length === 1}
                aria-label="Remover linha"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={adicionar}
          disabled={saving || linhas.length >= MAX_RETURN_ITEMS}
        >
          <Plus className="h-4 w-4" /> Adicionar item
        </Button>

        <div className="mt-4 space-y-1.5">
          <Label htmlFor="return-note">Observação (opcional)</Label>
          <textarea
            id="return-note"
            className="min-h-[70px] w-full rounded-lg border border-input bg-background p-3 text-sm"
            placeholder="Motivo, estado da peça..."
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={saving}
          />
        </div>

        {/* Resumo: o que sai e o que fica. Fica vermelho quando passa do valor. */}
        <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${excede ? "border-destructive/50 bg-destructive/10" : "border-border bg-secondary/40"}`}>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Valor atual da mercadoria</span>
            <span className="font-data">{formatBRL(currentValue)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total devolvido</span>
            <span className="font-data">− {formatBRL(somaValores)}</span>
          </div>
          <div className="mt-1 flex justify-between border-t border-border pt-1 font-medium">
            <span>Novo valor da mercadoria</span>
            <span className={`font-data ${excede ? "text-destructive" : ""}`}>{formatBRL(Math.max(0, restante))}</span>
          </div>
        </div>

        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="vendas" onClick={salvar} disabled={saving || excede}>
            {saving ? "Registrando..." : "Registrar devolução"}
          </Button>
        </div>
      </div>
    </div>,
    portalTarget,
  );
}
