"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SlidersHorizontal, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { PeriodoFiltro } from "@/components/shared/periodo-filtro";
import { useFilterQuery } from "@/hooks/use-filter-query";
import { SELECT_BRAND_LABEL, SELECT_BRANDS } from "@/lib/select-brand";
import { PURCHASE_STATES } from "@/lib/wholesale-permissions";
import { rejectionCodesByCategory } from "@/lib/wholesale-rejection-codes";
import { LEAD_STATUS_META, LEAD_STATUS_ORDER, PURCHASE_META } from "./lead-status-chip";

const selectClass =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";

/** Compara cidade escrita à mão: sem caixa, como o filtro do servidor faz. */
const mesmaCidade = (a: string, b: string) =>
  a.toLocaleLowerCase("pt-BR") === b.toLocaleLowerCase("pt-BR");

/**
 * Filtros da Análise de Clientes — um botão na borda DIREITA da tela que abre
 * uma barra lateral com os campos em lista.
 *
 * Era um `Card` com os nove campos lado a lado no topo, acima do painel
 * (30/10/2026, a pedido do dono). Nove campos numa barra horizontal quebravam
 * em três linhas e empurravam os números do painel para baixo da dobra; em
 * lista, cada campo tem a largura inteira e a ordem de leitura é uma só.
 *
 * A ORDEM DOS CAMPOS É A PEDIDA, e não é alfabética nem a antiga: recortar o
 * período, depois os dois eixos de decisão (Status e Compra) com o motivo logo
 * atrás, e por fim as dimensões de cadastro (Marca, Vendedora, Estado,
 * Cidade). A busca por nome não está aqui — ver `busca-client.tsx`.
 *
 * O PREÇO DA BARRA É QUE OS FILTROS FICAM ESCONDIDOS, e é por isso que o botão
 * carrega a CONTAGEM de filtros ativos. Sem ela, uma lista vazia por causa de um
 * filtro esquecido lê como tela quebrada — e o filtro que a causou está atrás de
 * um clique que ninguém tem motivo para dar.
 *
 * A mecânica não mudou: o estado vive na URL, texto com debounce, selects
 * aplicando na hora, e o painel acima da tabela lê o MESMO recorte.
 *
 * O FILTRO DE VENDEDORA SÓ EXISTE PARA A GESTÃO, e não por gentileza de
 * interface: para quem é de Vendas, a consulta já fixa `sellerId` no próprio
 * id, então o filtro não teria o que oferecer além dela mesma. Esconder aqui e
 * ignorar no servidor são decisões separadas — a segunda é a que vale, e está
 * em `listLeadsFor`.
 *
 * ESTADO (UF) substituiu o filtro de Auxiliar em 19/10/2026, a pedido do dono.
 * As opções são as UFs que REALMENTE existem na base, lidas pela página e
 * dentro do escopo de quem olha — oferecer as 27 faria a vendedora procurar
 * entre estados de onde nunca chegou candidatura.
 *
 * MARCA entrou em 28/10/2026: a Lov Club voltou com formulário próprio, e sem
 * este filtro as duas origens ficam embaralhadas na mesma fila. As opções são
 * as duas marcas fixas (`SELECT_BRANDS`), não as que existem na base: ao
 * contrário de UF, são duas e conhecidas, e "OKEY" desaparecer do seletor
 * porque ninguém se candidatou hoje leria como defeito.
 *
 * COMPRA entrou em 30/10/2026, junto da coluna na tabela. Ver a nota do campo.
 */
export function AnaliseClientesFiltros({
  defaults,
  mesPadrao,
  estados,
  cidades,
  cidadesPorUf,
  vendedoras,
  ehGestao,
}: {
  defaults: {
    status: string;
    /** Nome da chave na URL (`?brand=`), como `listLeadsFor` já a espera. */
    brand: string;
    estado: string;
    cidade: string;
    vendedora: string;
    de: string;
    ate: string;
    motivo: string;
    /** Eixo de compra (`?compra=`). Só vale para candidatura aprovada. */
    compra: string;
    /** `tudo` desliga o recorte padrão do mês — ver `page.tsx`. */
    periodo: string;
  };
  /** O mês vigente, para saber se o período na URL é o padrão ou escolha. */
  mesPadrao: { de: string; ate: string };
  estados: string[];
  /** Todas as cidades da base no escopo de quem olha — ver a página. */
  cidades: string[];
  /** As cidades de cada UF, para o seletor dependente do Estado. */
  cidadesPorUf: Record<string, string[]>;
  vendedoras: { id: string; name: string }[];
  ehGestao: boolean;
}) {
  // Sem campo de TEXTO: a busca por nome saiu daqui em 30/10/2026 e virou
  // `busca-client.tsx`, no cabeçalho do bloco de Candidaturas. Os dois hooks
  // convivem porque `useFilterQuery` preserva os params que não gerencia — ver
  // a nota lá.
  const f = useFilterQuery(
    {},
    {
      instant: {
        status: defaults.status,
        compra: defaults.compra,
        brand: defaults.brand,
        estado: defaults.estado,
        cidade: defaults.cidade,
        vendedora: defaults.vendedora,
        de: defaults.de,
        ate: defaults.ate,
        motivo: defaults.motivo,
        periodo: defaults.periodo,
      },
    },
  );

  const [aberto, setAberto] = useState(false);
  const fechar = useRef<HTMLButtonElement>(null);
  const aside = useRef<HTMLElement>(null);
  // Se o painel de datas está aberto, ESC é dele — ver o efeito abaixo.
  const [periodoAberto, setPeriodoAberto] = useState(false);

  /**
   * TUDO AQUI VAI PARA O `body` POR UM PORTAL, e é isso que conserta a barra.
   *
   * Renderizada no lugar, ela é descendente do `<main>` do layout — e `fixed`
   * só vale contra a janela enquanto NENHUM ancestral criar um bloco de
   * contenção (`transform`, `filter`, `backdrop-filter`, `contain`,
   * `will-change`). Quando um cria, `inset-y-0` passa a medir a altura inteira
   * do conteúdo da página em vez da altura da tela: a barra nascia abaixo do
   * cabeçalho, o próprio cabeçalho dela saía de vista ao rolar, e o fim da
   * lista ficava além da borda inferior — que é exatamente o que as telas
   * mostravam.
   *
   * O portal tira o problema da raiz em vez de caçar o ancestral culpado: no
   * `body` não há ancestral nenhum para criar bloco de contenção, e um
   * `transform` adicionado a qualquer wrapper amanhã não traz a falha de volta.
   *
   * `montado` guarda o SSR, que não tem `document`. O custo é o botão só
   * aparecer depois da hidratação.
   */
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  // ESC fecha a barra. Ela cobre a lista inteira no celular, e quem abriu sem
  // querer precisa de uma saída que não seja mirar no X.
  //
  // MENOS quando o painel de datas está aberto: os dois ouvem a `window`, os
  // dois fechariam, e um ESC para dispensar o calendário levaria a barra
  // inteira junto. O de dentro fecha primeiro; o segundo ESC fecha a barra.
  useEffect(() => {
    if (!aberto) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !periodoAberto) setAberto(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aberto, periodoAberto]);

  // O foco entra na barra ao abrir: sem isto, quem navega por teclado continua
  // no botão da borda e tabula pela página inteira atrás dos campos.
  useEffect(() => {
    if (aberto) fechar.current?.focus();
  }, [aberto]);

  // CIDADE DEPENDE DO ESTADO (30/10/2026, a pedido do dono): escolhido um
  // estado, só os municípios dele. Em "Todos", a lista inteira da base.
  const doEstado = f.instant.estado ? (cidadesPorUf[f.instant.estado] ?? []) : cidades;

  // A CIDADE QUE ESTÁ FILTRANDO FICA NA LISTA, mesmo fora do estado escolhido.
  //
  // `?estado=SP&cidade=Curitiba` é montável na barra de endereços, e a consulta
  // responde certo (zero linha: não existe lojista assim). Sem esta emenda o
  // `<select>` não teria opção para o valor dele e o navegador mostraria
  // "Todas" — um controle afirmando que não filtra nada enquanto filtra, que é
  // a única leitura pior que a lista vazia.
  const cidadesVisiveis =
    f.instant.cidade && !doEstado.some((c) => mesmaCidade(c, f.instant.cidade))
      ? [f.instant.cidade, ...doEstado]
      : doEstado;

  /**
   * Trocar o Estado reavalia a Cidade NA MESMA navegação.
   *
   * Sem isto, `?estado=SP&cidade=Curitiba` fica possível pela barra de endereços
   * E pela própria tela: a cidade escolhida continuaria no estado do hook depois
   * de o estado mudar, e as duas cláusulas juntas devolvem zero linha — uma
   * lista vazia que não tem como ser explicada por nada visível na tela, porque
   * o seletor de Cidade nem mostra mais a opção que está filtrando.
   *
   * A cidade é MANTIDA quando pertence ao estado novo: é o caso de sair de
   * "Todos" para a UF que já continha a cidade escolhida, onde limpar seria
   * desfazer uma escolha que segue valendo.
   *
   * Uma navegação só (`setInstantMany`): duas chamadas empilhariam duas entradas
   * no histórico, e o Voltar precisaria de dois cliques para desfazer um clique.
   */
  function trocarEstado(uf: string) {
    const lista = uf ? (cidadesPorUf[uf] ?? []) : cidades;
    const mantem = f.instant.cidade && lista.some((c) => mesmaCidade(c, f.instant.cidade));
    f.setInstantMany({ estado: uf, cidade: mantem ? f.instant.cidade : "" });
  }

  // O PERÍODO SÓ CONTA COMO FILTRO QUANDO NÃO É O PADRÃO. A URL sem `de`/`ate`
  // recebe o mês vigente da página, então comparar com o mês é a única forma de
  // distinguir "é o repouso da tela" de "alguém escolheu outubro de propósito".
  // `periodo=tudo` é escolha também: é o que desliga o padrão.
  const periodoEscolhido =
    f.instant.periodo === "tudo" ||
    f.instant.de !== mesPadrao.de ||
    f.instant.ate !== mesPadrao.ate;
  const ativos =
    [
      f.instant.status,
      f.instant.compra,
      f.instant.motivo,
      f.instant.brand,
      ehGestao ? f.instant.vendedora : "",
      f.instant.estado,
      f.instant.cidade,
    ].filter((v) => v.trim()).length + (periodoEscolhido ? 1 : 0);

  const conteudo = (
    <>
      {/* O ACIONADOR: borda direita, na altura do meio da tela. `fixed` para
          acompanhar a rolagem — a tabela é longa, e um botão que sobe com o
          topo obrigaria a voltar lá para trocar um filtro. */}
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-expanded={aberto}
        aria-haspopup="dialog"
        className="fixed right-0 top-1/2 z-30 flex -translate-y-1/2 items-center gap-2 rounded-l-xl border border-r-0 border-border bg-card px-2 py-4 shadow-lg transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* `writingMode` em estilo inline, não em classe utilitária: é a única
            propriedade vertical desta tela e o Tailwind não a traz de fábrica. */}
        <span
          className="text-xs font-semibold uppercase tracking-wide"
          style={{ writingMode: "vertical-rl" }}
        >
          Filtros
        </span>
        <SlidersHorizontal className="h-4 w-4 shrink-0 text-vendas-text" aria-hidden />
        {/* A contagem é o que impede a lista vazia de parecer defeito. À
            ESQUERDA do botão, que está encostado na borda direita da tela. */}
        {ativos > 0 && (
          <span
            className="absolute -left-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-vendas px-1 text-xs font-bold text-vendas-fg"
            aria-label={`${ativos} filtro(s) ativo(s)`}
          >
            {ativos}
          </span>
        )}
      </button>

      {aberto && (
        <>
          {/* Fundo escuro: fecha ao clique e separa a barra do conteúdo. */}
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setAberto(false)}
            aria-hidden
          />
          <aside
            ref={aside}
            role="dialog"
            aria-modal="true"
            aria-label="Filtros da Análise de Clientes"
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-border bg-card shadow-2xl"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <SlidersHorizontal className="h-4 w-4 text-vendas-text" aria-hidden />
                Filtros
                {ativos > 0 && (
                  <span className="rounded-full bg-vendas px-2 py-0.5 text-xs font-bold text-vendas-fg">
                    {ativos}
                  </span>
                )}
              </p>
              <button
                ref={fechar}
                type="button"
                onClick={() => setAberto(false)}
                aria-label="Fechar filtros"
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Rola por dentro: com os nove campos empilhados a lista passa da
                altura da tela em telefone. */}
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {/* 1. PERÍODO de CHEGADA da candidatura. O PADRÃO É O MÊS VIGENTE
                  desde 30/10/2026 — ver a nota em `page.tsx`.
                  `periodo` viaja junto do patch porque é só ele que separa
                  "limpei para ver tudo" de "não escolhi nada": sem a marca, a
                  página reaplicaria o mês e o botão de limpar ficaria inerte. */}
              <div className="space-y-1.5">
                <Label>Período</Label>
                <PeriodoFiltro
                  de={f.instant.de}
                  ate={f.instant.ate}
                  onChange={(p) => {
                    // Decidido sobre o ESTADO RESULTANTE, e não sobre o patch:
                    // `PeriodoFiltro` manda uma ponta só quando a pessoa edita
                    // um dos dois campos, e esvaziar os dois à mão (em vez de
                    // usar "Limpar período") chegaria aqui como dois patches
                    // parciais. Olhando só o patch, o segundo não veria o
                    // primeiro e a tela voltaria ao mês vigente sozinha.
                    const de = p.de ?? f.instant.de;
                    const ate = p.ate ?? f.instant.ate;
                    f.setInstantMany({ ...p, periodo: !de && !ate ? "tudo" : "" });
                  }}
                  setor="vendas"
                  titulo="Recebimento"
                  id="analise"
                  // Abre AO LADO da barra, na altura deste campo: dentro dela o
                  // painel cobriria Status e Compra, e a barra o recortaria.
                  abrirAoLadoDe={aside}
                  onOpenChange={setPeriodoAberto}
                />
              </div>

              {/* 2. STATUS da análise */}
              <div className="space-y-1.5">
                <Label htmlFor="filtro-status">Status</Label>
                <select
                  id="filtro-status"
                  className={selectClass}
                  value={f.instant.status}
                  onChange={(e) => f.setInstant("status", e.target.value)}
                >
                  <option value="">Todos</option>
                  {/* Na ordem do fluxo, a mesma de `LEAD_STATUS_ORDER` e dos
                      cartões do painel: a lista é lida como o funil, não em
                      ordem alfabética. */}
                  {LEAD_STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {LEAD_STATUS_META[s].label}
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. COMPRA: o eixo que entrou em 30/10/2026 com a coluna da
                  tabela. O aviso embaixo não é decoração — a consulta FORÇA
                  `status = APROVADO` quando este filtro está preenchido (só
                  aprovada tem compra), então escolher "Cadência" junto de
                  "Reprovado" no campo acima devolve zero linha de propósito.
                  Ver a nota no `where` de `listLeadsFor`. */}
              <div className="space-y-1.5">
                <Label htmlFor="filtro-compra">Compra</Label>
                <select
                  id="filtro-compra"
                  className={selectClass}
                  value={f.instant.compra}
                  onChange={(e) => f.setInstant("compra", e.target.value)}
                >
                  <option value="">Todas</option>
                  {PURCHASE_STATES.map((p) => (
                    <option key={p} value={p}>
                      {PURCHASE_META[p].label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Só candidatura aprovada tem estado de compra.
                </p>
              </div>

              {/* 4. MOTIVO da reprovação: os mesmos 34 códigos do modal,
                  agrupados por categoria na ordem da planilha — é a ordem em
                  que o negócio pensa os motivos. Escolher um motivo já implica
                  reprovada, então o filtro de Status não precisa ser mexido
                  junto. */}
              <div className="space-y-1.5">
                <Label htmlFor="filtro-motivo">Motivo da reprovação</Label>
                <select
                  id="filtro-motivo"
                  className={selectClass}
                  value={f.instant.motivo}
                  onChange={(e) => f.setInstant("motivo", e.target.value)}
                >
                  <option value="">Todos</option>
                  {rejectionCodesByCategory().map((g) => (
                    <optgroup key={g.category} label={g.category}>
                      {g.codes.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code} — {c.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* 5. MARCA */}
              <div className="space-y-1.5">
                <Label htmlFor="filtro-marca">Marca</Label>
                <select
                  id="filtro-marca"
                  className={selectClass}
                  value={f.instant.brand}
                  onChange={(e) => f.setInstant("brand", e.target.value)}
                >
                  <option value="">Todas</option>
                  {SELECT_BRANDS.map((b) => (
                    <option key={b} value={b}>
                      {SELECT_BRAND_LABEL[b]}
                    </option>
                  ))}
                </select>
              </div>

              {/* 6. VENDEDORA — só a Gestão. */}
              {ehGestao && (
                <div className="space-y-1.5">
                  <Label htmlFor="filtro-vendedora">Vendedora</Label>
                  <select
                    id="filtro-vendedora"
                    className={selectClass}
                    value={f.instant.vendedora}
                    onChange={(e) => f.setInstant("vendedora", e.target.value)}
                  >
                    <option value="">Todas</option>
                    {vendedoras.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 7. ESTADO no lugar do Auxiliar: as opcoes sao as UFs que de
                  fato existem na base, dentro do escopo de quem olha. Uma lista
                  com as 27 faria a vendedora procurar entre estados de onde
                  nunca chegou candidatura. */}
              <div className="space-y-1.5">
                <Label htmlFor="filtro-estado">Estado</Label>
                <select
                  id="filtro-estado"
                  className={selectClass}
                  value={f.instant.estado}
                  onChange={(e) => trocarEstado(e.target.value)}
                  disabled={estados.length === 0}
                >
                  <option value="">{estados.length === 0 ? "Nenhum ainda" : "Todos"}</option>
                  {estados.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </select>
              </div>

              {/* 8. CIDADE, dependente do Estado. Logo DEPOIS dele, que é a
                  ordem em que se escolhe — e a ordem pedida. */}
              <div className="space-y-1.5">
                <Label htmlFor="filtro-cidade">Cidade</Label>
                <select
                  id="filtro-cidade"
                  className={selectClass}
                  value={f.instant.cidade}
                  onChange={(e) => f.setInstant("cidade", e.target.value)}
                  disabled={doEstado.length === 0 && !f.instant.cidade}
                >
                  <option value="">
                    {doEstado.length === 0
                      ? f.instant.estado
                        ? `Nenhuma em ${f.instant.estado}`
                        : "Nenhuma ainda"
                      : "Todas"}
                  </option>
                  {cidadesVisiveis.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                {f.instant.estado && doEstado.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Só as cidades de {f.instant.estado}.
                  </p>
                )}
              </div>
            </div>

            {/* LIMPAR FILTROS. Só aparece quando há o que limpar — um botão
                permanentemente inerte no rodapé ensina a ignorar o rodapé.
                
                Limpa a BUSCA junto, mesmo ela vivendo noutro componente:
                `clearAll` monta a URL do zero, e "limpar filtros" quer dizer
                "nenhum filtro nesta tela", não "nenhum dos meus".
                
                O PERÍODO VOLTA AO MÊS VIGENTE, não ao vazio: o mês é o estado
                de repouso desta tela (ver `page.tsx`), e mandar vazio deixaria
                o botão de período dizendo "Período" enquanto o servidor aplica
                outubro — um controle mentindo sobre o próprio valor. */}
            {ativos > 0 && (
              <div className="border-t border-border px-4 py-3">
                <button
                  type="button"
                  onClick={() => f.clearAll({ de: mesPadrao.de, ate: mesPadrao.ate })}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-input text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-4 w-4" aria-hidden />
                  Limpar filtros
                </button>
              </div>
            )}
          </aside>
        </>
      )}
    </>
  );

  return montado ? createPortal(conteudo, document.body) : null;
}
