"use client";

import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface CampaignItemData {
  campaignId: string;
  reference: string;
  quantity: number;
  value: number;
}

interface Opt { id: string; name: string; }

/**
 * Linha inline de um item de campanha: Campanha · Referência · Quantidade ·
 * Valor, com botão de remoção individual. Usada tanto no Novo Pedido quanto na
 * Edição (a lista dinâmica é controlada pelo formulário pai).
 *
 * Layout: em telas largas os 4 campos ficam numa única linha (inline);
 * empilham no mobile. O botão remover só aparece quando `canRemove` é true
 * (não deixamos remover o último item se a campanha está ativa).
 */
export function CampaignItemRow({
  item, index, campaigns, canRemove, onChange, onRemove,
}: {
  item: CampaignItemData;
  index: number;
  campaigns: Opt[];
  canRemove: boolean;
  onChange: (patch: Partial<CampaignItemData>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-3">
      <div className="flex items-end gap-2">
        {/* Numeração do item para orientar quem preenche */}
        <span className="font-data mb-2.5 hidden w-5 shrink-0 text-xs text-muted-foreground sm:block">
          {index + 1}.
        </span>

        {/* Inline: Campanha · Referência · Quantidade · Valor */}
        <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-[1.4fr_1.4fr_0.8fr_1fr]">
          <div className="space-y-1">
            <Label className="text-xs">Campanha</Label>
            <select
              className="flex h-10 w-full rounded-lg border border-input bg-background px-2 text-sm"
              value={item.campaignId}
              onChange={(e) => onChange({ campaignId: e.target.value })}
            >
              <option value="">Selecione...</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Referência</Label>
            <Input
              value={item.reference}
              onChange={(e) => onChange({ reference: e.target.value })}
              placeholder="ex: REF-102"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Quantidade</Label>
            <Input
              type="number" min={1}
              value={item.quantity || ""}
              onChange={(e) => onChange({ quantity: Number(e.target.value) })}
              placeholder="ex: 10"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Valor</Label>
            <Input
              type="number" min={0} step="0.01"
              value={item.value || ""}
              onChange={(e) => onChange({ value: Number(e.target.value) })}
              placeholder="0,00"
            />
          </div>
        </div>

        {/* Remoção individual */}
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          className="mb-1 shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-background hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30"
          aria-label={`Remover item ${index + 1}`}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
