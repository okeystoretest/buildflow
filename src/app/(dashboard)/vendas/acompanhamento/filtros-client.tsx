"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SlidersHorizontal, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { useFilterQuery } from "@/hooks/use-filter-query";

const selectClass =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";

/**
 * Nomes dos meses pelo Intl, e nao uma lista de doze strings: a plataforma ja
 * sabe, e lista fixa e mais uma coisa para alguem manter. `pt-BR` devolve em
 * minuscula ("janeiro"), entao a primeira letra sobe aqui.
 */
const MESES = Array.from({ length: 12 }, (_, i) => {
  const nome = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(2026, i, 1));
  return nome.charAt(0).toUpperCase() + nome.slice(1);
});

/**
 * FILTROS DO ACOMPANHAMENTO — botao na borda direita que abre uma barra lateral.
 *
 * Era um `Card` com os campos lado a lado acima do painel. Virou barra lateral
 * a pedido do dono, no mesmo desenho da Analise de Clientes: com cinco campos a
 * barra horizontal quebrava em duas linhas e empurrava os quatro numeros do
 * resumo para baixo da dobra — e sao justamente eles que respondem a pergunta
 * da tela.
 *
 * O PRECO DA BARRA E QUE OS FILTROS FICAM ESCONDIDOS, e e por isso que o botao
 * carrega a CONTAGEM de filtros ativos. Sem ela, uma tela com recorte esquecido
 * le como numero errado — e o filtro que a causou esta atras de um clique que
 * ninguem tem motivo para dar.
 *
 * O PERIODO E MES + ANO, e nao um intervalo livre de datas como na Analise de
 * Clientes. A meta e MENSAL: um recorte de 17/03 a 09/05 nao tem meta contra a
 * qual comparar, e a grade de doze colunas — que e o valor desta tela — morreria
 * junto. Mes+Ano e a mesma forma que Gestao > Metas usa para cadastrar essas
 * metas, entao nao e invencao: e o padrao da casa para este dado.
 *
 * O MES NAO FILTRA A GRADE, poe o mes EM FOCO: os quatro numeros do topo passam
 * a ser daquele mes e a coluna dele acende na grade. "Ano inteiro" devolve o
 * comportamento anterior, para nao perder a visao do ano.
 *
 * Duplicacao conhecida: a mecanica da barra (portal, ESC, clique fora) e a
 * mesma de `analise-clientes/filtros-client.tsx`. Nao foi extraida para um
 * componente compartilhado porque isso mexeria naquela tela, que funciona e nao
 * foi pedida — a extracao continua valendo se uma terceira tela precisar.
 */
export function AcompanhamentoFiltros({
  ano,
  mes,
  loja,
  vendedora,
  escopo,
  lojas,
  vendedoras,
  anoAtual,
}: {
  ano: string;
  /** "ano" = ano inteiro; "1".."12" = mes em foco. Nunca vazio. */
  mes: string;
  loja: string;
  vendedora: string;
  escopo: string;
  lojas: { id: string; name: string }[];
  vendedoras: { id: string; nome: string }[];
  anoAtual: number;
}) {
  const f = useFilterQuery({}, { instant: { ano, mes, loja, vendedora, escopo } });
  const [aberto, setAberto] = useState(false);
  const [montado, setMontado] = useState(false);
  const aside = useRef<HTMLElement>(null);

  const anos = Array.from({ length: 5 }, (_, i) => anoAtual - i);

  // Quantos filtros estao ESCONDENDO LINHA da tela. Periodo (mes e ano) nao
  // entra: os dois sempre tem valor, entao contar faria o botao nascer com "2"
  // e o numero perderia o sentido de "ha recorte aqui". Loja, vendedora e
  // escopo entram, porque cada um deles tira gente da apuracao.
  const ativos = [f.instant.loja, f.instant.vendedora, f.instant.escopo].filter(Boolean).length;

  // O portal evita a armadilha do `position: fixed` preso por um ancestral com
  // `transform`: no `body` nao ha ancestral nenhum para criar bloco de
  // contencao, e um wrapper com transform adicionado amanha nao traz a falha de
  // volta. Mesma decisao, e mesmo motivo, da Analise de Clientes.
  useEffect(() => setMontado(true), []);

  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    const onDown = (e: MouseEvent) => {
      if (aside.current && !aside.current.contains(e.target as Node)) setAberto(false);
    };
    window.addEventListener("keydown", onKey);
    // `mousedown` e nao `click`: com `click`, o mesmo evento que abriu a barra
    // chegaria aqui e a fecharia na hora.
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [aberto]);

  const painel = (
    <>
      {/* Fundo escuro: fecha ao clique e separa a barra do conteudo. Mesmas
          camadas da Analise de Clientes (acionador 30, veu 40, barra 50), para
          as duas telas se comportarem igual perto do resto do app. */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={() => setAberto(false)}
        aria-hidden="true"
      />
      <aside
        ref={aside}
        role="dialog"
        aria-modal="true"
        aria-label="Filtros do Acompanhamento"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col gap-4 overflow-y-auto border-l border-border bg-card p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Filtros</h2>
          <button
            type="button"
            onClick={() => setAberto(false)}
            aria-label="Fechar filtros"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* A ORDEM E A DE LEITURA: primeiro QUANDO, depois ONDE, depois QUEM. */}
        <div className="space-y-1.5">
          <Label htmlFor="acomp-mes">Mês</Label>
          <select
            id="acomp-mes"
            className={selectClass}
            value={f.instant.mes}
            onChange={(e) => f.setInstant("mes", e.target.value)}
          >
            {/* Valor "ano", e nao "": a querystring descarta valor vazio, e a
                AUSENCIA do parametro ja significa "mes vigente" (o padrao).
                Sem um valor proprio, "Ano inteiro" seria inselecionavel. */}
            <option value="ano">Ano inteiro</option>
            {MESES.map((nome, i) => (
              <option key={nome} value={String(i + 1)}>{nome}</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Põe o mês em foco nos números do topo. A grade dos doze meses continua inteira.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="acomp-ano">Ano</Label>
          <select
            id="acomp-ano"
            className={selectClass}
            value={f.instant.ano}
            onChange={(e) => f.setInstant("ano", e.target.value)}
          >
            {anos.map((a) => (
              <option key={a} value={String(a)}>{a}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="acomp-loja">Loja de Origem</Label>
          <select
            id="acomp-loja"
            className={selectClass}
            value={f.instant.loja}
            onChange={(e) => f.setInstantMany({ loja: e.target.value, vendedora: "" })}
          >
            <option value="">Todas as lojas</option>
            {lojas.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Trocar a loja zera a vendedora: a escolhida pode não pertencer à nova loja.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="acomp-vendedora">Vendedora</Label>
          <select
            id="acomp-vendedora"
            className={selectClass}
            value={f.instant.vendedora}
            onChange={(e) => f.setInstant("vendedora", e.target.value)}
          >
            {/* "Todas" e nao "Maior entrega do ano": sem vendedora escolhida o
                painel individual mostra a LOJA (ver painel.tsx). O rotulo antigo
                sobreviveu a troca do comportamento e passou a prometer uma coisa
                e entregar outra — foi o teste de navegador que pegou. */}
            <option value="">Todas</option>
            {vendedoras.map((v) => (
              <option key={v.id} value={v.id}>{v.nome}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="acomp-escopo">Escopo</Label>
          <select
            id="acomp-escopo"
            className={selectClass}
            value={f.instant.escopo}
            onChange={(e) => f.setInstantMany({ escopo: e.target.value, vendedora: "" })}
          >
            <option value="">Varejo e Atacado</option>
            <option value="VAREJO">Varejo</option>
            <option value="ATACADO">Atacado</option>
          </select>
        </div>

        <button
          type="button"
          // Limpar nao mexe no PERIODO: mes e ano nao escondem ninguem, e
          // zerar o mes devolveria a pessoa ao mes vigente sem ela pedir.
          onClick={() => f.setInstantMany({ loja: "", vendedora: "", escopo: "" })}
          disabled={ativos === 0}
          // A COR DIZ QUE ELE ESTA DISPONIVEL. Desabilitado com `opacity-40` e
          // habilitado em cinza se pareciam demais: nao dava para saber, de
          // relance, se havia o que limpar. Vermelho quando ha filtro ativo
          // (acao destrutiva do recorte), neutro e apagado quando nao ha.
          className={
            ativos === 0
              ? "mt-auto rounded-lg border border-input px-3 py-2 text-sm text-muted-foreground opacity-40"
              : "mt-auto rounded-lg border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-500/20 dark:text-rose-300"
          }
        >
          {ativos === 0 ? "Limpar filtros" : `Limpar filtros (${ativos})`}
        </button>
      </aside>
    </>
  );

  return (
    <>
      {/* O ACIONADOR: borda direita, na altura do meio da tela, `fixed` para
          ACOMPANHAR A ROLAGEM — a grade e as duas tabelas sao longas, e um
          botao que sobe com o topo obrigaria a voltar la para trocar um
          filtro. Mesmo componente da Analise de Clientes, a pedido do dono. */}
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-expanded={aberto}
        aria-haspopup="dialog"
        className="fixed right-0 top-1/2 z-30 flex -translate-y-1/2 items-center gap-2 rounded-l-xl border border-r-0 border-border bg-card px-2 py-4 shadow-lg transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* `writingMode` em estilo inline, e nao classe utilitaria: o Tailwind
            nao traz a propriedade vertical de fabrica. */}
        <span
          className="text-xs font-semibold uppercase tracking-wide"
          style={{ writingMode: "vertical-rl" }}
        >
          Filtros
        </span>
        <SlidersHorizontal className="h-4 w-4 shrink-0 text-vendas-text" aria-hidden />
        {/* A contagem fica a ESQUERDA, porque o botao esta encostado na borda
            direita da tela e la fora nao ha onde desenhar. */}
        {ativos > 0 && (
          <span
            className="absolute -left-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-vendas px-1 text-xs font-bold text-vendas-fg"
            aria-label={`${ativos} filtro(s) ativo(s)`}
          >
            {ativos}
          </span>
        )}
      </button>
      {montado && aberto && createPortal(painel, document.body)}
    </>
  );
}
