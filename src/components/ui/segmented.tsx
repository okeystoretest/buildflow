"use client";

import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

/** Quantas colunas para quantas opcoes. Quatro quebram em duas no celular. */
const COLUNAS: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
};

/**
 * Escolher UMA entre poucas opcoes, em botoes de LARGURA CHEIA divididos por
 * igual (a vista Semanas / Kanban do Relatorio Semanal).
 *
 * Largura cheia, e nao pilulas compactas: as duas vistas sao os dois lados da
 * mesma ferramenta, e um par de pilulas pequenas no canto as faria parecer um
 * filtro do conteudo abaixo.
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
      className={cn("grid gap-3", COLUNAS[options.length] ?? "grid-cols-2", className)}
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
              "h-11 rounded-xl border px-2 text-sm font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              escolhida
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
