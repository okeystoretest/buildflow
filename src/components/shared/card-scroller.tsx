"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * useLayoutEffect avisa no console quando roda na renderizacao do servidor.
 * Como o componente e client mas passa por SSR no Next, alternamos para
 * useEffect no servidor (padrao "isomorphic layout effect").
 */
const useLayoutEffectIsomorfico = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * CONTÊINER DE CARDS COM ROLAGEM
 * ---------------------------------------------------------------------------
 * Empilha cards e limita a altura visível a um número exato de itens — o
 * restante fica acessível pela barra de rolagem, sem botão "Ver mais".
 *
 * Por que medir em vez de usar uma altura fixa (`max-h-[23.5rem]`):
 * os cards do Build.Flow NÃO têm altura constante. Um card do Financeiro com
 * "Obs. de Pagamento" é bem mais alto que um sem; um card de pedido com alerta
 * de etapa cresce mais uma linha. Com altura fixa, ora sobra espaço, ora o
 * terceiro card aparece cortado no meio — exatamente o corte visual que se
 * quer evitar. Aqui a altura é calculada a partir do fim do N-ésimo card, e
 * recalculada quando os cards mudam de tamanho (ResizeObserver).
 *
 * Quando há N itens ou menos, nenhuma altura é imposta: o bloco cresce natural
 * e não aparece barra de rolagem.
 */
export function CardScroller({
  children,
  visibleItems = 3,
  className = "",
}: {
  children: React.ReactNode;
  /** Quantos cards ficam visíveis por vez antes de rolar. */
  visibleItems?: number;
  /** Classes extras do contêiner (o layout de pilha já vem embutido). */
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);

  const medir = useCallback(() => {
    const el = ref.current;
    if (!el) return;

    const itens = Array.from(el.children).filter(
      (c): c is HTMLElement => c instanceof HTMLElement,
    );
    if (itens.length <= visibleItems) {
      setMaxHeight(undefined);
      return;
    }

    const primeiro = itens[0];
    const ultimoVisivel = itens[visibleItems - 1];
    // Do topo do primeiro card até a base do N-ésimo: inclui os gaps entre
    // eles e termina exatamente na borda do card, nunca no meio.
    const altura =
      ultimoVisivel.offsetTop + ultimoVisivel.offsetHeight - primeiro.offsetTop;
    setMaxHeight(altura > 0 ? altura : undefined);
  }, [visibleItems]);

  // Medir antes da pintura evita o "pulo" entre o primeiro render e a medição.
  useLayoutEffectIsomorfico(() => {
    medir();
  });

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const ro = new ResizeObserver(() => medir());
    ro.observe(el);
    for (const filho of Array.from(el.children)) {
      if (filho instanceof HTMLElement) ro.observe(filho);
    }
    return () => ro.disconnect();
  }, [medir, children]);

  return (
    <div
      ref={ref}
      className={`kanban-scroll flex flex-col gap-2 overflow-y-auto rounded-lg pr-1 ${className}`}
      style={maxHeight ? { maxHeight } : undefined}
    >
      {children}
    </div>
  );
}
