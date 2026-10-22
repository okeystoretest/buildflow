"use client";

import { useEffect, useRef, useState } from "react";
import { LeadStatusChip } from "./lead-status-chip";

/**
 * A célula de STATUS da lista de candidaturas: o chip, e o MOTIVO da
 * reprovação sob CLIQUE.
 *
 * O motivo já esteve escrito na linha, ao lado do nome e do CNPJ de quem foi
 * recusada — exposto o tempo todo, inclusive com a lojista olhando a tela. Saiu
 * de lá. A primeira tentativa foi o `title` do navegador, e ela caiu por três
 * razões: demora ~1s, não existe no toque (a Gestão usa tablet) e não é
 * alcançável por teclado. Daí este componente.
 *
 * POR QUE `position: fixed` E NÃO `absolute`: a tabela vive dentro de um
 * `<div className="overflow-x-auto">`. Quando um eixo do overflow deixa de ser
 * `visible`, o outro também para de ser — então o contêiner recorta nos DOIS
 * eixos, e uma bolha `absolute` apareceria cortada ou criaria barra de rolagem.
 * `fixed` é relativo à janela e passa por cima do recorte; o preço é que a
 * posição vem do `getBoundingClientRect` do chip no momento do clique.
 *
 * POR QUE A BOLHA FECHA AO ROLAR: pelo mesmo preço. Rolar move a âncora e a
 * bolha ficaria solta no meio da tela. Fechar é mais honesto (e muito mais
 * barato) que recalcular a posição a cada quadro de rolagem.
 *
 * A BOLHA USA `bg-card`, E NÃO O TOKEN DE POPOVER: `--popover` existe no
 * globals.css mas nunca foi mapeado no `colors` do tailwind.config.ts, e uma
 * utility sobre token não mapeado não gera regra NENHUMA — a bolha saiu
 * TRANSPARENTE, sem erro de build e sem aviso. `--card` tem valor idêntico nos
 * dois temas e está mapeado. Como a bolha pousa sobre um `<Card>` da mesma cor,
 * a elevação vem da borda e da sombra. `scripts/checks/cor-de-setor.ts` barra o
 * token não mapeado, e é por isso que o nome da classe não está escrito aqui.
 *
 * POR QUE UM `<button>` E NÃO UMA `<div onClick>`: foco, Enter/Espaço e
 * anúncio de leitor de tela vêm de graça — é o que faltava no `title`.
 */
export function LeadStatusCell({
  status,
  motivo,
}: {
  status: string;
  /** Ausente em candidatura que não foi reprovada: aí o chip não clica. */
  motivo?: string;
}) {
  const [bolha, setBolha] = useState<{ x: number; y: number } | null>(null);
  const chip = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!bolha) return;
    const fechar = () => setBolha(null);
    // Clique fora fecha, MENOS no próprio chip: o clique nele é o que alterna,
    // e fechar aqui faria o par fechar-e-reabrir (a bolha nunca sumiria).
    // Clicar no chip de OUTRA linha cai neste caminho e fecha esta — duas
    // bolhas abertas ao mesmo tempo não ajudariam ninguém.
    const foraDoChip = (e: Event) => {
      if (!chip.current?.contains(e.target as Node)) fechar();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
    };
    // `true`: captura, para pegar a rolagem de qualquer contêiner interno
    // (a própria tabela rola na horizontal), que não borbulha até a janela.
    document.addEventListener("pointerdown", foraDoChip, true);
    window.addEventListener("scroll", fechar, true);
    window.addEventListener("resize", fechar);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", foraDoChip, true);
      window.removeEventListener("scroll", fechar, true);
      window.removeEventListener("resize", fechar);
      document.removeEventListener("keydown", esc);
    };
  }, [bolha]);

  if (!motivo) return <LeadStatusChip status={status} />;

  return (
    <>
      <button
        ref={chip}
        type="button"
        aria-expanded={bolha !== null}
        title="Ver o motivo da reprovação"
        onClick={() => {
          if (bolha) return setBolha(null);
          const r = chip.current!.getBoundingClientRect();
          // A bolha tem 18rem (288px) de largura máxima. Encostada na direita
          // da janela ela sairia da tela — e a coluna de status fica no meio de
          // uma tabela que rola na horizontal, então isso acontece no celular.
          // Daí o limite nos dois lados, com 8px de respiro.
          setBolha({
            x: Math.max(8, Math.min(r.left, window.innerWidth - 296)),
            y: r.bottom + 6,
          });
        }}
        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <LeadStatusChip
          status={status}
          className="cursor-pointer underline decoration-dotted underline-offset-2"
        />
      </button>
      {bolha && (
        <div
          role="status"
          style={{ left: bolha.x, top: bolha.y }}
          className="animate-scale-in fixed z-50 max-w-[18rem] rounded-md border border-border bg-card px-3 py-2 text-xs leading-snug text-card-foreground shadow-xl"
        >
          {motivo}
        </div>
      )}
    </>
  );
}
