import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { firstName, formatBRL } from "@/lib/utils";
import { ColunasAgrupadas, LinhaMensal, MAX_SERIES } from "@/components/shared/mini-charts";
import type { AcompanhamentoData } from "@/lib/acompanhamento-data";
import { paDoMes, type CelulaMes } from "@/lib/acompanhamento-math";

const MESES_CURTOS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];
const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/**
 * Valor "curto" do eixo: 125 mil vira "125k" para o rotulo nao empurrar o plot.
 *
 * UMA CASA DECIMAL, e nao arredondamento para inteiro: as linhas de grade caem
 * em 25%, 50% e 75% do teto, entao um teto de 10k rotulava a linha de 2.500
 * como "3k" — um numero que a linha nao marca.
 */
function curto(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`;
  if (v >= 1_000) return `${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
  return String(Math.round(v));
}

const pct = (f: number | null) =>
  f === null ? "—" : `${(f * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;

/** Variacao com sinal: +12%, -8%, ou "—" quando nao ha base de comparacao. */
function variacao(f: number | null) {
  if (f === null) return <span className="text-muted-foreground">—</span>;
  const texto = `${f > 0 ? "+" : ""}${(f * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;
  // Sinal TAMBEM no texto, nao so na cor: quem nao distingue verde de vermelho
  // le o mesmo que todo mundo.
  return (
    <span className={f > 0 ? "text-vendas-text" : f < 0 ? "text-destructive" : ""}>{texto}</span>
  );
}

/**
 * Cor de PREENCHIMENTO por atingimento da meta, a pedido do dono (16/11/2026):
 * verde >= 100%, azul 75–99%, vermelho abaixo de 75%.
 *
 * SEM META NAO TEM COR. Mes sem meta individual cadastrada tem `pct` nulo, e
 * pintar de vermelho leria como "nao atingiu" onde nao havia alvo nenhum —
 * alarme falso justamente na linha de quem a Gestao ainda nao distribuiu meta.
 * Mes futuro tambem nao pinta: ele ja mostra traco, nao zero.
 *
 * A COR NUNCA E O UNICO SINAL: a celula leva `title` com o percentual em
 * texto, para quem nao distingue as tres cores.
 */
function corDeAtingimento(fracao: number | null): string {
  if (fracao === null) return "";
  if (fracao >= 1) return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300";
  if (fracao >= 0.75) return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
  return "bg-rose-500/15 text-rose-700 dark:text-rose-300";
}

const pa = (v: number | null) =>
  v === null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Resumo({ titulo, valor, rodape }: { titulo: string; valor: string; rodape?: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{titulo}</p>
        <p className="mt-1 font-data text-2xl font-bold">{valor}</p>
        {rodape && <p className="mt-1 text-xs text-muted-foreground">{rodape}</p>}
      </CardContent>
    </Card>
  );
}

export function AcompanhamentoPainel({
  dados,
  mesFoco,
  vendedoraId,
  nomeDaLoja,
  mesLimite,
}: {
  dados: AcompanhamentoData;
  /**
   * Mes em foco nos quatro numeros do topo. 0 = ano inteiro.
   *
   * NAO filtra a grade: ela e sempre os doze meses, porque e ela que mostra a
   * curva do ano. O mes troca o recorte dos cartoes e acende a coluna
   * correspondente, para a pessoa ver de onde o numero saiu.
   */
  mesFoco: number;
  /** Vendedora do painel individual. "" = a de maior entrega no ano. */
  vendedoraId: string;
  nomeDaLoja: string;
  /**
   * Último mês que JÁ ACONTECEU no ano exibido (12 em ano passado).
   *
   * Existe porque mês futuro tem zero de tudo, e zero mente: dezembro aparecia
   * com "R$ 0,00" e "-100% vs. mês anterior", como se a loja tivesse despencado,
   * com o mês nem começado. A META de mês futuro continua aparecendo — ela foi
   * cadastrada e é informação de verdade.
   */
  mesLimite: number;
}) {
  const { grade } = dados;
  const futuro = (month: number) => month > mesLimite;
  /** Célula de mês que ainda não aconteceu: traço, nunca zero. */
  const ouTraco = (month: number, conteudo: React.ReactNode) =>
    futuro(month) ? <span className="text-muted-foreground">—</span> : conteudo;
  // Sem vendedora no filtro o foco e a LOJA ("Todas"). Antes caia na primeira
  // da grade (ordenada por ENTREGA), e um painel individual que ninguem pediu
  // lia como se fosse o total da loja.
  const foco = grade.vendedoras.find((v) => v.userId === vendedoraId) ?? null;

  // SLOT DE COR POR NOME, nunca pela ordem da grade (que ordena por entrega):
  // a cor acompanha a pessoa, senão trocar de mês ou de filtro repintaria
  // quem sobrou e o gráfico passaria a mentir entre duas cargas da tela.
  const ordemDeCor = [...grade.vendedoras]
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    .map((v) => v.userId);
  const slotDe = (userId: string) => ordemDeCor.indexOf(userId);

  // Mais de 6 vendedoras: as 5 maiores entregas do ano por nome e o resto
  // somado em "Outras". Nunca ciclar a 7a cor — duas pessoas com a mesma cor
  // no mesmo gráfico é um gráfico errado.
  // Com uma vendedora ESCOLHIDA no filtro, o gráfico é só dela — e aí a meta
  // individual vira uma linha de referência que significa alguma coisa. Com
  // várias, cada uma tem a sua meta e um traço só não representaria nenhuma.
  const soUma = vendedoraId !== "" && foco !== null;
  const noGrafico = soUma ? [foco!] : grade.vendedoras;
  const excede = noGrafico.length > MAX_SERIES;
  const nomeadas = excede ? noGrafico.slice(0, MAX_SERIES - 1) : noGrafico;
  const restantes = excede ? noGrafico.slice(MAX_SERIES - 1) : [];

  const seriesColunas = [
    ...nomeadas.map((v) => ({
      nome: firstName(v.nome),
      slot: slotDe(v.userId) % MAX_SERIES,
      valores: v.meses.map((m) => m.realizado),
    })),
    ...(restantes.length
      ? [
          {
            nome: `Outras (${restantes.length})`,
            slot: MAX_SERIES - 1,
            valores: MESES.map((_, i) =>
              restantes.reduce((a, v) => a + v.meses[i].realizado, 0),
            ),
          },
        ]
      : []),
  ];

  const linhaDoFoco = foco ?? { nome: nomeDaLoja, meses: grade.loja as CelulaMes[] };
  // P.A. do ano: peças do ano ÷ pedidos do ano. NÃO é a média dos doze P.A.
  // mensais — essa média daria o mesmo peso a um mês de 2 pedidos e a um de 200.
  const paDoAno = paDoMes(
    grade.loja.reduce((a, c) => a + c.pecas, 0),
    grade.loja.reduce((a, c) => a + c.pedidos, 0),
  );

  // RECORTE DOS QUATRO NUMEROS DO TOPO: o mes em foco, ou o ano inteiro.
  // Os dados por mes ja existem em `grade.loja[m-1]` (meta, realizado, pct,
  // P.A.), entao nada precisou ser recalculado — e o modulo de matematica nao
  // foi tocado.
  const celulaFoco = mesFoco >= 1 && mesFoco <= 12 ? grade.loja[mesFoco - 1] : null;
  const recorte = celulaFoco
    ? {
        rotulo: MESES_CURTOS[mesFoco - 1],
        meta: celulaFoco.meta ?? 0,
        realizado: celulaFoco.realizado,
        pa: celulaFoco.pa,
        // Mes que ainda nao aconteceu: realizado e P.A. viram traco, nunca
        // zero. Zero mente — leria como "a loja nao vendeu nada".
        futuro: futuro(mesFoco),
      }
    : {
        rotulo: String(grade.year),
        meta: grade.totalMetaLoja,
        realizado: grade.totalRealizado,
        pa: paDoAno,
        futuro: false,
      };
  const faltam = Math.max(0, recorte.meta - recorte.realizado);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Resumo
          titulo={`Meta — ${recorte.rotulo}`}
          valor={recorte.meta > 0 ? formatBRL(recorte.meta) : "—"}
          rodape={
            recorte.meta > 0 ? nomeDaLoja : "Nenhuma meta de loja cadastrada em Gestão > Metas"
          }
        />
        <Resumo
          titulo={`Realizado — ${recorte.rotulo}`}
          valor={recorte.futuro ? "—" : formatBRL(recorte.realizado)}
          rodape={`${grade.vendedoras.length} vendedora(s) na apuração`}
        />
        <Resumo
          titulo={`% da meta — ${recorte.rotulo}`}
          valor={
            recorte.futuro
              ? "—"
              : pct(recorte.meta > 0 ? recorte.realizado / recorte.meta : null)
          }
          rodape={
            recorte.meta > 0 && !recorte.futuro ? `Faltam ${formatBRL(faltam)}` : undefined
          }
        />
        <Resumo
          titulo={`P.A. — ${recorte.rotulo}`}
          valor={recorte.futuro ? "—" : pa(recorte.pa)}
          rodape={celulaFoco ? "Peças por atendimento no mês" : "Peças por atendimento no ano"}
        />
      </div>

      {grade.vendedorasSemMeta > 0 && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <strong>{grade.vendedorasSemMeta}</strong> vendedora(s) desta apuração não têm meta
          individual cadastrada em nenhum mês de {grade.year}. A venda delas entra no realizado da
          loja, mas a linha fica sem percentual.
        </p>
      )}

      {/* ------------------------------------------------- grade do ano */}
      <Card>
        <CardHeader>
          <CardTitle>Grade do ano — {nomeDaLoja}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              {/* A coluna do mês em foco acende pela TABELA, com `<col>`, e não
                  classe em cada `<td>`: é um elemento em vez de um retoque em
                  todos os laços de célula desta tabela. Linha com fundo próprio
                  (Meta da Loja) pinta por cima e o realce fica mais fraco nela
                  — aceitável, porque quem orienta a leitura é o cabeçalho. */}
              <colgroup>
                <col />
                {MESES_CURTOS.map((m, i) => (
                  <col key={m} className={i + 1 === mesFoco ? "bg-vendas/10" : undefined} />
                ))}
                <col />
              </colgroup>
              <thead className="border-b border-border text-foreground">
                <tr>
                  <th className="py-2 pr-4 text-left">Linha</th>
                  {MESES_CURTOS.map((m, i) => (
                    <th
                      key={m}
                      aria-current={i + 1 === mesFoco ? "true" : undefined}
                      className={`py-2 pr-3 text-right font-medium ${
                        i + 1 === mesFoco ? "text-vendas-text" : ""
                      }`}
                    >
                      {m}
                    </th>
                  ))}
                  <th className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border bg-secondary/40">
                  <td className="py-2 pr-4 font-medium">Meta da Loja</td>
                  {grade.loja.map((c) => (
                    <td key={c.month} className="py-2 pr-3 text-right font-data">
                      {c.meta === null ? "—" : formatBRL(c.meta)}
                    </td>
                  ))}
                  <td className="py-2 text-right font-data font-semibold">
                    {grade.totalMetaLoja > 0 ? formatBRL(grade.totalMetaLoja) : "—"}
                  </td>
                </tr>
                {/* SAIRAM DAQUI (16/11/2026, pedido do dono): "Realizado da
                    Loja", "% da Meta" e "Soma das Metas Individuais". Os dois
                    primeiros viraram os cartoes do topo, que agora respondem
                    pelo mes em foco ou pelo ano; o terceiro ja existe em
                    Gestao > Metas, com a coluna Diferenca ao lado. Tres linhas
                    repetindo numero que esta a um palmo de distancia so
                    empurravam as vendedoras para baixo da dobra. */}
                {grade.vendedoras.map((v) => (
                  <tr key={v.userId} className="border-b border-border last:border-0 hover:bg-secondary/50">
                    <td className="py-2 pr-4">
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className="h-2.5 w-2.5 shrink-0 rounded-sm"
                          style={{ background: `var(--series-${(slotDe(v.userId) % MAX_SERIES) + 1})` }}
                        />
                        {firstName(v.nome)}
                        {v.semMetaNoAno && (
                          <span className="text-xs text-muted-foreground">(s/ meta)</span>
                        )}
                      </span>
                    </td>
                    {v.meses.map((c) => {
                      const pinta = !futuro(c.month) && c.pct !== null;
                      return (
                        <td
                          key={c.month}
                          className={`py-2 pr-3 text-right font-data ${pinta ? corDeAtingimento(c.pct) : ""}`}
                          title={
                            pinta
                              ? `${pct(c.pct)} da meta de ${formatBRL(c.meta!)}`
                              : c.meta === null && !futuro(c.month)
                                ? "Sem meta individual cadastrada neste mês"
                                : undefined
                          }
                        >
                          {c.realizado > 0 ? formatBRL(c.realizado) : <span className="text-muted-foreground">—</span>}
                        </td>
                      );
                    })}
                    <td className="py-2 text-right font-data font-semibold">
                      {formatBRL(v.totalRealizado)}
                    </td>
                  </tr>
                ))}
                {grade.vendedoras.length === 0 && (
                  <tr>
                    <td colSpan={14} className="py-6 text-center text-muted-foreground">
                      Nenhuma vendedora com esta loja como principal. Defina a loja principal em
                      Gestão &gt; Usuários.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            O realizado soma todas as vendedoras cuja <strong>loja principal</strong> é esta,
            tenham ou não meta individual no mês — por isso pode ficar acima do total do Ranking de
            Vendas, que conta apenas quem tem meta cadastrada. Valores sem frete, pelo mesmo
            critério de venda confirmada do Ranking.
          </p>
        </CardContent>
      </Card>

      {/* ------------------------------------------------- painel individual */}
      <Card>
        <CardHeader>
          <CardTitle>
            {foco ? `Acompanhamento individual — ${foco.nome}` : `Acompanhamento — ${nomeDaLoja}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-border text-left text-foreground">
                <tr>
                  <th className="py-2 pr-4">Mês</th>
                  <th className="py-2 pr-4 text-right">Meta</th>
                  <th className="py-2 pr-4 text-right">Atingido</th>
                  <th className="py-2 pr-4 text-right">% da Meta</th>
                  <th className="py-2 pr-4 text-right">P.A.</th>
                  <th className="py-2 pr-4 text-right">vs. mês anterior</th>
                </tr>
              </thead>
              <tbody>
                {linhaDoFoco.meses.map((c) => (
                  <tr key={c.month} className="border-b border-border last:border-0 hover:bg-secondary/50">
                    <td className="py-2 pr-4">{MESES[c.month - 1]}</td>
                    <td className="py-2 pr-4 text-right font-data">
                      {c.meta === null ? <span className="text-muted-foreground">—</span> : formatBRL(c.meta)}
                    </td>
                    <td className="py-2 pr-4 text-right font-data">
                      {ouTraco(c.month, formatBRL(c.realizado))}
                    </td>
                    <td className="py-2 pr-4 text-right font-data">{ouTraco(c.month, pct(c.pct))}</td>
                    <td className="py-2 pr-4 text-right font-data" title={`${c.pedidos} pedido(s) no mês`}>
                      {ouTraco(c.month, pa(c.pa))}
                    </td>
                    <td className="py-2 pr-4 text-right font-data">
                      {ouTraco(c.month, variacao(c.vsAnterior))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            <strong>P.A.</strong> = peças por atendimento (peças vendidas ÷ pedidos do mês).
            <strong className="ml-2">vs. mês anterior</strong> compara o <em>realizado</em> com o do
            mês anterior — não é o progresso da meta, que é a coluna “% da Meta”.
          </p>
        </CardContent>
      </Card>

      {/* ------------------------------------------------- graficos
          LADO A LADO a partir de `lg`, a pedido do dono: empilhados ocupavam
          duas dobras e comparar um com o outro exigia rolar. Abaixo de `lg`
          continuam um sobre o outro — dois graficos de doze meses lado a lado
          num telefone nao se leem. */}
      <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>
            {soUma ? `Realizado mês a mês — ${foco!.nome}` : "Realizado por vendedora, mês a mês"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ColunasAgrupadas
            categorias={MESES_CURTOS}
            series={seriesColunas}
            referencias={soUma ? foco!.meses.map((m) => m.meta) : undefined}
            rotuloReferencia="Meta individual"
            formatarEixo={curto}
            formatarValor={formatBRL}
            // Menor que os 240 do padrao: em duas colunas cada grafico tem
            // metade da largura, e manter a altura antiga deixaria os dois
            // quase quadrados, com as doze colunas espremidas.
            alturaPx={200}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Meta e Atingido — {foco ? foco.nome : nomeDaLoja}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LinhaMensal
            categorias={MESES_CURTOS}
            series={[
              { nome: "Meta", slot: 0, valores: linhaDoFoco.meses.map((m) => m.meta) },
              {
                nome: "Atingido",
                slot: 1,
                // Mês que já aconteceu entra como 0 (zero é informação: não
                // vendeu). Mês FUTURO vira buraco, senão a linha desabaria até
                // o eixo em dezembro e isso se leria como uma queda.
                valores: linhaDoFoco.meses.map((m) => (futuro(m.month) ? null : m.realizado)),
              },
            ]}
            formatarEixo={curto}
            formatarValor={formatBRL}
            alturaPx={200}
          />
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
