"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  abrirAoLadoDe,
  onOpenChange,
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
  /**
   * Abre o painel AO LADO deste elemento, e não embaixo do botão.
   *
   * Existe para o período dentro de uma barra lateral (Análise de Clientes): a
   * barra tem `overflow-y: auto`, que RECORTA qualquer coisa saindo dela, e o
   * painel embaixo do botão cobriria os campos seguintes da lista. Passando a
   * `<aside>` da barra, o painel vai para fora dela — ancorado em `fixed` e
   * levado ao `body` por um portal, que é o que escapa tanto do recorte quanto
   * de qualquer ancestral com `transform`/`filter`.
   *
   * Sem a prop, nada muda: o popover continua embaixo do botão, como nas outras
   * dez telas que usam este componente.
   */
  abrirAoLadoDe?: React.RefObject<HTMLElement | null>;
  /**
   * Avisa quem está em volta que o painel abriu ou fechou.
   *
   * Quem abre este componente dentro de um diálogo precisa saber: as duas telas
   * ouvem ESC na `window`, e sem o aviso um ESC para fechar as datas fecharia a
   * barra inteira junto.
   */
  onOpenChange?: (aberto: boolean) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const painel = useRef<HTMLDivElement>(null);
  // Posição do painel quando ele abre ao lado. `null` até a primeira medida.
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    onOpenChange?.(aberto);
    // `onOpenChange` fora das dependências de propósito: um callback recriado a
    // cada render do pai dispararia este efeito sem o painel ter mudado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  // Fecha ao clicar fora, como o seletor de motorista do painel de chamados.
  // O PAINEL ENTRA NA CONTA: levado ao `body` pelo portal, ele não está dentro
  // de `caixa`, e sem esta segunda checagem clicar num campo de data contaria
  // como clique fora e fecharia o que a pessoa acabou de abrir.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const alvo = e.target as Node;
      if (caixa.current?.contains(alvo) || painel.current?.contains(alvo)) return;
      setAberto(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  /**
   * Mede onde o painel lateral tem de ficar: na altura do botão, encostado na
   * borda esquerda do elemento recebido (a barra lateral).
   *
   * Remede em rolagem e redimensionamento porque a lista da barra ROLA — o
   * botão desce e o painel tem de descer com ele, ou a ligação entre os dois se
   * perde. `capture` no scroll: quem rola é um contêiner interno, e sem ele o
   * evento não chega à `window`.
   */
  useEffect(() => {
    if (!aberto || !abrirAoLadoDe) return;
    function medir() {
      const b = botao.current?.getBoundingClientRect();
      const lado = abrirAoLadoDe?.current?.getBoundingClientRect();
      if (!b || !lado) return;
      // O painel tem `w-64` (256px) e quer 8px de respiro dos dois lados.
      const LARGURA = 256;
      const RESPIRO = 8;
      setPos({
        // Preso à janela: com o botão no pé da lista, um painel alinhado ao
        // topo dele nasceria metade fora da tela.
        top: Math.max(RESPIRO, Math.min(b.top, window.innerHeight - 280)),
        // Encostado na borda esquerda do elemento recebido — MAS sem sair da
        // tela. Em telefone a barra ocupa a largura toda e não existe "ao
        // lado": o teto empurra o painel para cima dela, onde ainda dá para
        // usá-lo, em vez de para fora da janela, onde não dá.
        right: Math.max(
          RESPIRO,
          Math.min(
            window.innerWidth - lado.left + RESPIRO,
            window.innerWidth - LARGURA - RESPIRO,
          ),
        ),
      });
    }
    medir();
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    return () => {
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, true);
    };
  }, [aberto, abrirAoLadoDe]);

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

  // Os campos, montados UMA vez: as duas colocações (embaixo do botão e ao lado
  // da barra) mudam só onde o painel fica, nunca o que ele tem dentro.
  const campos = (
    <>
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
    </>
  );

  return (
    <div className="relative" ref={caixa}>
      <button
        ref={botao}
        type="button"
        aria-expanded={aberto}
        aria-haspopup="dialog"
        onClick={() => setAberto((v) => !v)}
        className={cn(
          // `pr-4` maior que o `pl-3`: a seta e o ultimo elemento da linha e
          // encostava na borda do botao. O respiro extra vai so do lado dela.
          "flex h-10 items-center gap-2 rounded-lg border pl-3 pr-4 text-sm font-medium transition-colors",
          tem
            ? ATIVO[setor]
            : "border-input bg-background text-muted-foreground hover:bg-secondary hover:text-foreground",
        )}
      >
        <CalendarDays className="h-4 w-4 shrink-0" aria-hidden />
        <span className="whitespace-nowrap">{rotulo}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
      </button>

      {aberto &&
        (abrirAoLadoDe ? (
          // AO LADO: `fixed` e levado ao `body`. A barra lateral recorta o que
          // sai dela (`overflow-y: auto`), então um painel posicionado dentro
          // dela nunca apareceria do lado de fora por mais que se empurre.
          pos && typeof document !== "undefined"
            ? createPortal(
                <div
                  ref={painel}
                  role="dialog"
                  aria-label={`Escolher período — ${titulo}`}
                  style={{ top: pos.top, right: pos.right, zIndex: 60 }}
                  className="fixed w-64 space-y-3 rounded-lg border border-border bg-card p-3 shadow-xl"
                >
                  {campos}
                </div>,
                document.body,
              )
            : null
        ) : (
          <div
            ref={painel}
            role="dialog"
            aria-label={`Escolher período — ${titulo}`}
            // `right-0`: em várias destas telas o botão fica na ponta direita da
            // barra, e um painel alinhado à esquerda sairia pela borda.
            className="absolute right-0 z-50 mt-1 w-64 space-y-3 rounded-lg border border-border bg-card p-3 shadow-lg"
          >
            {campos}
          </div>
        ))}
    </div>
  );
}
