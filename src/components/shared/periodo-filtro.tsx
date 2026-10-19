"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, rotuloDePeriodo } from "@/lib/utils";

/**
 * FILTRO DE PERÍODO — um botão que abre as duas datas.
 *
 * Um componente só para as onze telas que filtram por período. Antes eram dois
 * `<Input type="date">` copiados em cada arquivo: onze cópias da mesma coisa,
 * e qualquer correção (o alinhamento do popover, o aviso de data invertida, o
 * limpar numa navegação só) precisaria ser feita onze vezes — ou, o que
 * realmente acontece, em três delas.
 *
 * O BOTÃO CARREGA O RECORTE no próprio rótulo ("01/10/26 – 19/10/26"), que é a
 * informação que importa quando ninguém está mexendo nele; os campos só
 * aparecem na hora de trocar. Dois inputs de data abertos o tempo todo ocupam
 * meia largura da barra de filtros para mostrar o que o rótulo diz em oito
 * caracteres — e é justamente por isso que, nas telas com cinco filtros, o
 * período empurrava os outros para a linha de baixo.
 *
 * `onChange` recebe um PATCH e não um par campo/valor: limpar as duas pontas é
 * uma chamada só, e com `setInstantMany` isso vira uma navegação só. Com duas
 * chamadas, o Voltar precisaria de dois cliques para desfazer um "Limpar".
 */

/** Setor da tela — decide a cor do botão quando há período escolhido. */
export type PeriodoSetor = "vendas" | "financeiro" | "distribuicao" | "motorista" | "servico";

/**
 * Os pares fundo/texto são os MESMOS que os botões de setor já usam, e o
 * contraste dos cinco é recalculado por `scripts/checks/cor-de-setor.ts` a cada
 * rodada. Mapa literal, e não `bg-${setor}`: o Tailwind não enxerga classe
 * montada em tempo de execução e a purga levaria a cor embora.
 */
const ATIVO: Record<PeriodoSetor, string> = {
  vendas: "border-vendas bg-vendas text-vendas-fg",
  financeiro: "border-financeiro bg-financeiro text-financeiro-fg",
  distribuicao: "border-distribuicao bg-distribuicao text-distribuicao-fg",
  motorista: "border-motorista bg-motorista text-motorista-fg",
  servico: "border-servico bg-servico text-servico-fg",
};

export function PeriodoFiltro({
  de,
  ate,
  onChange,
  setor,
  titulo = "Período",
  id = "periodo",
}: {
  de: string;
  ate: string;
  /** Patch com o que mudou. Limpar manda as duas pontas vazias de uma vez. */
  onChange: (patch: { de?: string; ate?: string }) => void;
  setor: PeriodoSetor;
  /** O que o período significa nesta tela ("Abertura", "Criação", "Início"). */
  titulo?: string;
  /** Prefixo dos ids dos campos — único por tela quando houver mais de um. */
  id?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora, como o seletor de motorista do painel de chamados.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // ESC fecha: o popover cobre parte da barra de filtros, e quem abriu sem
  // querer precisa de uma saída que não seja mirar no botão de novo.
  useEffect(() => {
    if (!aberto) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aberto]);

  const tem = Boolean(de || ate);
  const invertido = Boolean(de && ate && de > ate);
  const rotulo = rotuloDePeriodo(de, ate, titulo);

  return (
    <div className="relative" ref={caixa}>
      <button
        type="button"
        aria-expanded={aberto}
        aria-haspopup="dialog"
        onClick={() => setAberto((v) => !v)}
        className={cn(
          "flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors",
          tem
            ? ATIVO[setor]
            : "border-input bg-background text-muted-foreground hover:bg-secondary hover:text-foreground",
        )}
      >
        <CalendarDays className="h-4 w-4 shrink-0" aria-hidden />
        <span className="whitespace-nowrap">{rotulo}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
      </button>

      {aberto && (
        <div
          role="dialog"
          aria-label={`Escolher período — ${titulo}`}
          // `right-0`: em várias destas telas o botão fica na ponta direita da
          // barra, e um painel alinhado à esquerda sairia pela borda.
          className="absolute right-0 z-50 mt-1 w-64 space-y-3 rounded-lg border border-border bg-card p-3 shadow-lg"
        >
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-de`} className="text-xs">
              De
            </Label>
            <Input
              id={`${id}-de`}
              type="date"
              className="h-9"
              value={de}
              onChange={(e) => onChange({ de: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${id}-ate`} className="text-xs">
              Até
            </Label>
            <Input
              id={`${id}-ate`}
              type="date"
              className="h-9"
              value={ate}
              onChange={(e) => onChange({ ate: e.target.value })}
            />
          </div>

          {/* Diz o que está errado em vez de devolver uma lista vazia sem
              motivo: período invertido não dá erro, dá zero resultado. */}
          {invertido && (
            <p className="text-xs text-destructive">A data inicial é posterior à final.</p>
          )}

          {tem && (
            <button
              type="button"
              onClick={() => {
                onChange({ de: "", ate: "" });
                setAberto(false);
              }}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Limpar período
            </button>
          )}
        </div>
      )}
    </div>
  );
}
