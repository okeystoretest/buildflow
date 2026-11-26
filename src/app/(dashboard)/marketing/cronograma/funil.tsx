import {
  acumularFunil,
  contarPorFunil,
  CORES_DE_FUNIL,
  escalaDoEixo,
  funilPorDia,
  type CamadaDoFunil,
  type FatiaDoFunil,
} from "@/lib/cronograma";
import type { Atividade } from "@/lib/cronograma-data";

/**
 * O FUNIL DO PERÍODO: quanto do conteúdo é topo, meio e fundo — e como isso
 * se distribui pelos dias que a visão mostra.
 *
 * DESENHADO COMO O DO BUILD.CONNECT (pedido do dono, 26/11/2026), e não só
 * "parecido": as cores são as de `FUNNEL` lá, a rosca traz o TOTAL NO CENTRO, e
 * a distribuição no tempo é uma ÁREA EMPILHADA — BOFU na base, TOFU no topo.
 *
 * ANTES ERAM COLUNAS AGRUPADAS (`ColunasAgrupadas` da casa). A troca não foi de
 * gosto: três colunas lado a lado por dia, em 42 dias, dão 126 barras de dois
 * pixels, e a pergunta do gráfico ("o volume está subindo ou caindo?") não se
 * responde contando barras. A área empilhada mostra o total do dia na linha de
 * cima e a composição nas faixas — a mesma leitura que o Connect oferece.
 *
 * DUAS ORIGENS NA MESMA CONTA. A atividade vinda do Build.Connect entra junto
 * com a criada aqui, porque a pergunta ("meu conteúdo está equilibrado?") é
 * sobre a agenda inteira, não sobre quem a digitou. Separá-las daria dois
 * funis que ninguém sabe somar.
 *
 * A COR NUNCA É A ÚNICA PISTA: os números ficam ao lado da rosca em texto, e o
 * gráfico de área leva uma tabela para leitor de tela. É a regra da casa, e
 * valia aqui de graça enquanto `ColunasAgrupadas` trazia a tabela junto —
 * saindo ela, a tabela vem à mão.
 */

/** Raio e espessura da rosca, em unidades do `viewBox`. */
const R = 50;
const GROSSURA = 18;
const CIRCUNFERENCIA = 2 * Math.PI * R;

/**
 * A rosca, na técnica do Connect: cada arco é um traço com um vão do tamanho do
 * resto da volta, girado para onde o anterior parou.
 *
 * O GIRO É DE CADA ARCO, e não do `<svg>` inteiro — era `-rotate-90` no
 * elemento. Precisa ser assim porque agora há texto no centro: rodar o `<svg>`
 * teria deitado o número de lado junto com os arcos.
 */
function Rosca({ fatias, total }: { fatias: FatiaDoFunil[]; total: number }) {
  let percorrido = 0;

  return (
    <svg
      viewBox="0 0 140 140"
      className="h-40 w-40 shrink-0"
      role="img"
      aria-label={`Funil do período: ${fatias.map((f) => `${f.rotulo}, ${f.total}`).join("; ")}`}
    >
      {/* O ANEL DE FUNDO sustenta a rosca quando o período está vazio: sem ele
          a área fica em branco e parece que o gráfico não carregou. */}
      <circle
        cx="70"
        cy="70"
        r={R}
        fill="none"
        strokeWidth={GROSSURA}
        className="stroke-secondary"
      />
      {fatias.map((f) => {
        const comprimento = f.fracao * CIRCUNFERENCIA;
        const giro = (percorrido / CIRCUNFERENCIA) * 360 - 90;
        percorrido += comprimento;
        if (f.total === 0) return null;
        return (
          <circle
            key={f.chave}
            cx="70"
            cy="70"
            r={R}
            fill="none"
            strokeWidth={GROSSURA}
            stroke={CORES_DE_FUNIL[f.chave] ?? "currentColor"}
            strokeDasharray={`${comprimento} ${CIRCUNFERENCIA - comprimento}`}
            transform={`rotate(${giro} 70 70)`}
          >
            <title>{`${f.rotulo}: ${f.total} de ${total}`}</title>
          </circle>
        );
      })}

      {/* O TOTAL NO CENTRO, como no Connect. Com o período vazio ele não
          aparece: um "0" grande no meio de um anel cinza parece erro de
          carregamento, e a legenda ao lado já diz zero em cada etapa. */}
      {total > 0 && (
        <>
          <text
            x="70"
            y="70"
            textAnchor="middle"
            className="fill-[hsl(var(--foreground))] text-[22px] font-bold"
          >
            {total}
          </text>
          <text
            x="70"
            y="86"
            textAnchor="middle"
            className="fill-[hsl(var(--muted-foreground))] text-[10px]"
          >
            {total === 1 ? "atividade" : "atividades"}
          </text>
        </>
      )}
    </svg>
  );
}

/* Moldura do gráfico de área, nos valores do Connect. */
const L = 720;
const A = 280;
const PAD = { top: 16, right: 16, bottom: 30, left: 40 };

/**
 * A ÁREA EMPILHADA, em SVG puro — nenhuma biblioteca nova, como no Connect.
 *
 * `viewBox` fixo com largura fluida: o gráfico encolhe junto com a tela sem
 * recalcular nada, e é o que permite ele ser servido pronto, sem JavaScript.
 */
function AreaEmpilhada({
  camadas,
  categorias,
  teto,
}: {
  camadas: CamadaDoFunil[];
  categorias: string[];
  teto: number;
}) {
  const larg = L - PAD.left - PAD.right;
  const alt = A - PAD.top - PAD.bottom;
  const n = categorias.length;
  const x = (i: number) => (n <= 1 ? PAD.left + larg / 2 : PAD.left + (i * larg) / (n - 1));
  const y = (v: number) => PAD.top + alt * (1 - v / teto);
  const marcas = [0, teto / 4, teto / 2, (teto * 3) / 4, teto];

  /** O polígono entre a linha desta camada e a linha da camada de baixo. */
  const area = (i: number) => {
    const acima = camadas[i].acumulado.map(
      (v, d) => `${d === 0 ? "M" : "L"} ${x(d)} ${y(v)}`,
    );
    const abaixo = camadas[i - 1];
    const volta = camadas[i].acumulado
      .map((_, d) => n - 1 - d)
      .map((d) => `L ${x(d)} ${y(abaixo ? abaixo.acumulado[d] : 0)}`);
    return [...acima, ...volta, "Z"].join(" ");
  };

  const linha = (i: number) =>
    camadas[i].acumulado.map((v, d) => `${d === 0 ? "M" : "L"} ${x(d)} ${y(v)}`).join(" ");

  return (
    <>
      <svg
        viewBox={`0 0 ${L} ${A}`}
        className="h-auto w-full"
        role="img"
        aria-label="Volume de atividades por etapa do funil, dia a dia. Os números estão na tabela abaixo."
      >
        {marcas.map((m) => (
          <g key={m}>
            <line
              x1={PAD.left}
              x2={L - PAD.right}
              y1={y(m)}
              y2={y(m)}
              stroke="hsl(var(--border))"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 8}
              y={y(m) + 4}
              textAnchor="end"
              className="fill-[hsl(var(--muted-foreground))] text-[11px]"
            >
              {m}
            </text>
          </g>
        ))}

        {/* Da base para o topo: a de baixo é desenhada primeiro e as de cima
            cobrem o que sobra. */}
        {camadas.map((c, i) => (
          <path key={`area-${c.chave}`} d={area(i)} fill={CORES_DE_FUNIL[c.chave]} opacity={0.45} />
        ))}
        {camadas.map((c, i) => (
          <path
            key={`linha-${c.chave}`}
            d={linha(i)}
            fill="none"
            stroke={CORES_DE_FUNIL[c.chave]}
            strokeWidth={2}
            strokeLinejoin="round"
          />
        ))}

        {categorias.map((rotulo, i) => (
          <g key={`${rotulo}-${i}`}>
            {/* NUM MÊS SÓ AS SEGUNDAS GANHAM RÓTULO: a grade começa na segunda,
                então um a cada sete é uma régua semanal. Os 42 números todos
                viravam uma tarja preta ilegível — é a ressalva de telefone que
                ficou registrada na sessão anterior. */}
            {(n <= 14 || i % 7 === 0) && (
              <text
                x={x(i)}
                y={A - 10}
                textAnchor="middle"
                className="fill-[hsl(var(--muted-foreground))] text-[11px]"
              >
                {rotulo}
              </text>
            )}
            {/* A faixa invisível dá o `title` do dia: tooltip sem uma linha de
                JavaScript, do jeito que o Connect faz. */}
            <rect
              x={x(i) - larg / (n * 2)}
              y={PAD.top}
              width={larg / n}
              height={alt}
              fill="transparent"
            >
              <title>
                {`Dia ${rotulo} · ${camadas
                  .map((c, k) => {
                    const abaixo = k === 0 ? 0 : camadas[k - 1].acumulado[i];
                    return `${c.chave} ${c.acumulado[i] - abaixo}`;
                  })
                  .reverse()
                  .join(" · ")}`}
              </title>
            </rect>
          </g>
        ))}
      </svg>

      {/* A TABELA QUE A `ColunasAgrupadas` TRAZIA DE GRAÇA. Um gráfico desenhado
          à mão não é lido por leitor de tela, e o `aria-label` só diz do que o
          gráfico trata — não os números. */}
      <table className="sr-only">
        <caption>Atividades por etapa do funil, dia a dia</caption>
        <thead>
          <tr>
            <th scope="col">Dia</th>
            {camadas.map((c) => (
              <th key={c.chave} scope="col">
                {c.rotulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categorias.map((rotulo, i) => (
            <tr key={`${rotulo}-${i}`}>
              <th scope="row">{rotulo}</th>
              {camadas.map((c, k) => (
                <td key={c.chave}>{c.acumulado[i] - (k === 0 ? 0 : camadas[k - 1].acumulado[i])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export function Funil({ atividades, dias }: { atividades: Atividade[]; dias: string[] }) {
  const fatias = contarPorFunil(atividades);
  const camadas = acumularFunil(funilPorDia(atividades, dias));
  const pico = camadas.length === 0 ? 0 : Math.max(...camadas[camadas.length - 1].acumulado, 0);
  const teto = escalaDoEixo(pico);
  // O rótulo do eixo é o DIA, não a data inteira: numa visão de mês são 42
  // colunas, e "25/11/2026" embaixo de cada uma vira uma tarja ilegível.
  const categorias = dias.map((d) => String(Number(d.slice(8, 10))));

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">Etapas do funil no período</h3>
        <p className="text-xs text-muted-foreground">
          As atividades criadas aqui e as publicadas no Build.Connect, juntas.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-6">
          <Rosca fatias={fatias} total={atividades.length} />

          <dl className="min-w-[12rem] flex-1 space-y-2">
            {fatias.map((f) => (
              <div key={f.chave} className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: CORES_DE_FUNIL[f.chave] }}
                  aria-hidden
                />
                <dt className="min-w-0 flex-1 truncate text-sm">{f.rotulo}</dt>
                <dd className="text-sm font-semibold tabular-nums">
                  {f.total}
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    {/* Arredondado para inteiro: "33,33%" numa agenda de três
                        atividades sugere uma precisão que a contagem não tem. */}
                    {Math.round(f.fracao * 100)}%
                  </span>
                </dd>
              </div>
            ))}
            <div className="flex items-center gap-2 border-t border-border pt-2">
              <dt className="flex-1 text-sm text-muted-foreground">Total</dt>
              <dd className="text-sm font-semibold tabular-nums">{atividades.length}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">Distribuição pelos dias da visão</h3>
        <p className="text-xs text-muted-foreground">
          Empilhado: a faixa de baixo é o fundo do funil, e a linha de cima é o total do dia.
        </p>
        <div className="mt-3">
          <AreaEmpilhada camadas={camadas} categorias={categorias} teto={teto} />
        </div>
      </section>
    </div>
  );
}
