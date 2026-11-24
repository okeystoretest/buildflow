"use client";

import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

/**
 * Pilulas exclusivas: escolher UMA entre poucas opcoes que cabem lado a lado
 * (a vista Semanas / Kanban do Relatorio Semanal).
 *
 * `radiogroup` e nao um grupo de botoes: para quem usa leitor de tela, a
 * diferenca e saber que escolher uma desmarca a outra. As setas do teclado
 * continuam sendo o Tab do navegador — nao ha roving tabindex aqui, e com
 * duas ou tres opcoes o Tab basta.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("inline-flex items-center gap-1 rounded-full border border-border bg-card p-1", className)}
    >
      {options.map((o) => {
        const escolhida = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={escolhida}
            onClick={() => onChange(o.value)}
            className={cn(
              "whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              escolhida
                ? "bg-primary font-semibold text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
