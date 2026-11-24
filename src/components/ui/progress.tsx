import { cn, tierColor } from "@/lib/utils";

/**
 * Barra de progresso.
 *
 * A COR SAI DE `tierColor`, a escala que o buildflow ja usa para "quanto da
 * meta foi batido" (vermelho ate 33%, ambar ate 66%, azul ate 99%, verde em
 * 100%). O Build.Connect tem uma escala propria, de cinco faixas e outras
 * cores; trazer junto daria duas reguas de cor para a mesma pergunta — "o
 * quanto disto esta pronto?" — na mesma tela de quem usa os dois modulos.
 *
 * `aria-label` e obrigatorio: sem ele a barra e um retangulo mudo para quem
 * usa leitor de tela, e o numero que ela representa costuma estar escrito ao
 * lado em texto que o leitor nao associa a ela sozinho.
 */
export function Progress({
  value,
  label,
  className,
}: {
  /** Percentual de 0 a 100. Valor fora da faixa e grampeado. */
  value: number;
  label: string;
  className?: string;
}) {
  const pct = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-secondary", className)}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500 ease-out", tierColor(pct))}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
