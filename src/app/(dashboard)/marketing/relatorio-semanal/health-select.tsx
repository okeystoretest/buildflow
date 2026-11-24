"use client";

import { Select } from "@/components/ui/select";
import { HEALTH_LABEL, HEALTH_ORDER } from "@/lib/relatorio-semanal-labels";
import type { WeeklyHealth } from "@/lib/relatorio-semanal-math";

/**
 * A lista 🟢/🟡/🔴 da planilha, com a opção VAZIA preservada.
 *
 * O vazio é um estado de verdade — "ainda não respondi" —, e é o que alimenta
 * o contador de pendências do card. Trocá-lo por um padrão (🟢, por exemplo)
 * faria a semana abrir dizendo que tudo está no ritmo antes de alguém olhar.
 */
export function HealthSelect({
  value,
  onChange,
  ariaLabel,
}: {
  value?: WeeklyHealth;
  onChange: (value?: WeeklyHealth) => void;
  ariaLabel: string;
}) {
  return (
    <Select
      aria-label={ariaLabel}
      className="h-9 text-xs"
      value={value ?? ""}
      onChange={(e) => onChange((e.target.value || undefined) as WeeklyHealth | undefined)}
      options={[{ value: "", label: "—" }, ...HEALTH_ORDER.map((h) => ({ value: h, label: HEALTH_LABEL[h] }))]}
    />
  );
}
