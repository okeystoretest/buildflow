/**
 * GRAFICOS PEQUENOS EM SVG — colunas agrupadas e linha.
 * ---------------------------------------------------------------------------
 * POR QUE A MAO, E NAO UMA BIBLIOTECA
 *
 * O projeto nao tem nenhuma biblioteca de grafico, e estes dois sao ESTATICOS:
 * doze categorias, poucas series, nenhum zoom nem seleção. Uma dependencia de
 * grafico traria um bundle e um componente de cliente para desenhar o que sao
 * dois `rect` e um `polyline` — estes dois renderizam NO SERVIDOR, sem um byte
 * de JavaScript.
 *
 * REGRAS QUE ESTAO COMPILADAS AQUI (e por que):
 *  - COR POR ENTIDADE, EM ORDEM FIXA (`--series-1..6`, validadas por tema em
 *    globals.css). Nunca ciclada: a 7a serie vira "Outras" no chamador, porque
 *    repetir a cor da 1a faria duas pessoas diferentes terem a mesma cor.
 *  - UM EIXO. Nenhum grafico daqui aceita duas escalas verticais.
 *  - LEGENDA SEMPRE com 2+ series, e a cor nunca e a unica pista: a tabela com
 *    os mesmos numeros fica na mesma tela (tres das seis cores ficam abaixo de
 *    3:1 no tema claro — a tabela e o "relevo" que isso exige).
 *  - TEXTO EM TOKEN DE TEXTO, nunca na cor da serie.
 *  - `<title>` em cada marca: e o tooltip nativo do navegador, que funciona
 *    sem JavaScript e e lido por leitor de tela.
 *  - 2px de folga entre colunas vizinhas, para a borda de uma nao encostar na
 *    da outra e virar um bloco unico.
 */

export const MAX_SERIES = 6;

/** As seis cores categoricas, em ordem fixa. Indice = slot da serie. */
export const COR_SERIE = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
] as const;

export interface SerieGrafico {
  nome: string;
  /** Um valor por categoria. Mesma ordem de `categorias`. */
  valores: number[];
  /** Slot de cor (0-5). Fixo por entidade, definido pelo chamador. */
  slot: number;
}

/** Topo "redondo" do eixo: 1, 2 ou 5 × 10^n acima do maior valor. */
function tetoDoEixo(max: number): number {
  if (max <= 0) return 1;
  const exp = Math.floor(Math.log10(max));
  const base = 10 ** exp;
  for (const m of [1, 2, 5, 10]) {
    if (max <= m * base) return m * base;
  }
  return 10 * base;
}

const L = 58; // espaco do rotulo do eixo Y
const R = 10;
const T = 10;
const B = 26; // espaco do rotulo do eixo X

function Grade({
  teto,
  w,
  h,
  formatar,
}: {
  teto: number;
  w: number;
  h: number;
  formatar: (v: number) => string;
}) {
  const linhas = [0, 0.25, 0.5, 0.75, 1];
  return (
    <g>
      {linhas.map((f) => {
        const y = T + (h - T - B) * (1 - f);
        return (
          <g key={f}>
            <line
              x1={L}
              x2={w - R}
              y1={y}
              y2={y}
              stroke="hsl(var(--border))"
              strokeWidth={1}
            />
            <text
              x={L - 6}
              y={y + 3}
              textAnchor="end"
              fontSize={9}
              fill="hsl(var(--muted-foreground))"
            >
              {formatar(teto * f)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function RotulosX({ categorias, w, h }: { categorias: string[]; w: number; h: number }) {
  const faixa = (w - L - R) / categorias.length;
  return (
    <g>
      {categorias.map((c, i) => (
        <text
          key={c + i}
          x={L + faixa * (i + 0.5)}
          y={h - 8}
          textAnchor="middle"
          fontSize={9}
          fill="hsl(var(--muted-foreground))"
        >
          {c}
        </text>
      ))}
    </g>
  );
}

function Legenda({ series }: { series: { nome: string; slot: number }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {series.map((s) => (
        <li key={s.nome} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            aria-hidden
            className="h-2.5 w-2.5 shrink-0 rounded-sm"
            style={{ background: COR_SERIE[s.slot % MAX_SERIES] }}
          />
          {s.nome}
        </li>
      ))}
    </ul>
  );
}

function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-10 text-center text-sm text-muted-foreground">{children}</p>
  );
}

/**
 * COLUNAS AGRUPADAS: uma coluna por serie dentro de cada categoria.
 *
 * `referencias` desenha um traco horizontal sobre cada grupo — a meta daquele
 * mes. E um traco e nao uma coluna de propósito: meta nao e entrega, e lado a
 * lado as duas se leriam como duas vendas.
 */
export function ColunasAgrupadas({
  categorias,
  series,
  referencias,
  formatarEixo,
  formatarValor,
  rotuloReferencia = "Meta",
  alturaPx = 240,
}: {
  categorias: string[];
  series: SerieGrafico[];
  referencias?: (number | null)[];
  formatarEixo: (v: number) => string;
  formatarValor: (v: number) => string;
  rotuloReferencia?: string;
  alturaPx?: number;
}) {
  const w = 760;
  const h = alturaPx;
  const plot = h - T - B;

  const maxValor = Math.max(
    0,
    ...series.flatMap((s) => s.valores),
    ...(referencias ?? []).map((r) => r ?? 0),
  );
  if (series.length === 0 || maxValor <= 0) {
    return <Vazio>Nenhum valor no período para desenhar o gráfico.</Vazio>;
  }
  const teto = tetoDoEixo(maxValor);
  const faixa = (w - L - R) / categorias.length;
  // 2px de folga entre colunas vizinhas; o grupo ocupa 78% da faixa, o resto
  // separa um mes do outro.
  const grupo = faixa * 0.78;
  const larguraCol = Math.max(2, (grupo - 2 * (series.length - 1)) / series.length);

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Colunas agrupadas por mês: ${series.map((s) => s.nome).join(", ")}.`}
      >
        <Grade teto={teto} w={w} h={h} formatar={formatarEixo} />
        {categorias.map((cat, ci) => {
          const x0 = L + faixa * ci + (faixa - grupo) / 2;
          const ref = referencias?.[ci] ?? null;
          return (
            <g key={cat + ci}>
              {series.map((s, si) => {
                const v = s.valores[ci] ?? 0;
                const alt = (v / teto) * plot;
                const x = x0 + si * (larguraCol + 2);
                return (
                  <rect
                    key={s.nome}
                    x={x}
                    y={T + plot - alt}
                    width={larguraCol}
                    height={Math.max(v > 0 ? 1 : 0, alt)}
                    rx={Math.min(2, larguraCol / 2)}
                    fill={COR_SERIE[s.slot % MAX_SERIES]}
                  >
                    <title>{`${s.nome} — ${cat}: ${formatarValor(v)}`}</title>
                  </rect>
                );
              })}
              {ref !== null && ref > 0 && (
                <line
                  x1={x0 - 2}
                  x2={x0 + grupo + 2}
                  y1={T + plot - (ref / teto) * plot}
                  y2={T + plot - (ref / teto) * plot}
                  stroke="hsl(var(--foreground))"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                >
                  <title>{`${rotuloReferencia} — ${cat}: ${formatarValor(ref)}`}</title>
                </line>
              )}
            </g>
          );
        })}
        <line
          x1={L}
          x2={w - R}
          y1={T + plot}
          y2={T + plot}
          stroke="hsl(var(--border))"
          strokeWidth={1}
        />
        <RotulosX categorias={categorias} w={w} h={h} />
      </svg>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Legenda series={series} />
        {referencias?.some((r) => r && r > 0) && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden className="h-0 w-5 border-t-2 border-dashed border-foreground" />
            {rotuloReferencia}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * LINHA com uma ou mais series na MESMA escala (meta e realizado estao em reais
 * — por isso cabem no mesmo eixo; duas escalas verticais nunca).
 *
 * Mes sem valor vira BURACO na linha, nao zero: "nao houve" e diferente de
 * "foi zero", e ligar o ponto ate o chao inventaria uma queda.
 */
export function LinhaMensal({
  categorias,
  series,
  formatarEixo,
  formatarValor,
  alturaPx = 240,
}: {
  categorias: string[];
  series: { nome: string; slot: number; valores: (number | null)[] }[];
  formatarEixo: (v: number) => string;
  formatarValor: (v: number) => string;
  alturaPx?: number;
}) {
  const w = 760;
  const h = alturaPx;
  const plot = h - T - B;

  const todos = series.flatMap((s) => s.valores.filter((v): v is number => v !== null));
  const maxValor = Math.max(0, ...todos);
  if (todos.length === 0 || maxValor <= 0) {
    return <Vazio>Nenhum valor no período para desenhar o gráfico.</Vazio>;
  }
  const teto = tetoDoEixo(maxValor);
  const faixa = (w - L - R) / categorias.length;
  const px = (i: number) => L + faixa * (i + 0.5);
  const py = (v: number) => T + plot - (v / teto) * plot;

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Linha por mês: ${series.map((s) => s.nome).join(" e ")}.`}
      >
        <Grade teto={teto} w={w} h={h} formatar={formatarEixo} />
        {series.map((s) => {
          const cor = COR_SERIE[s.slot % MAX_SERIES];
          // Cada trecho CONTINUO vira um polyline: assim o mes sem valor fica
          // como buraco em vez de uma reta descendo ate o eixo.
          const trechos: { i: number; v: number }[][] = [];
          let atual: { i: number; v: number }[] = [];
          s.valores.forEach((v, i) => {
            if (v === null) {
              if (atual.length) trechos.push(atual);
              atual = [];
            } else atual.push({ i, v });
          });
          if (atual.length) trechos.push(atual);

          return (
            <g key={s.nome}>
              {trechos.map((t, ti) => (
                <polyline
                  key={ti}
                  points={t.map((p) => `${px(p.i)},${py(p.v)}`).join(" ")}
                  fill="none"
                  stroke={cor}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}
              {s.valores.map((v, i) =>
                v === null ? null : (
                  <circle key={i} cx={px(i)} cy={py(v)} r={4} fill={cor}>
                    <title>{`${s.nome} — ${categorias[i]}: ${formatarValor(v)}`}</title>
                  </circle>
                ),
              )}
            </g>
          );
        })}
        <line
          x1={L}
          x2={w - R}
          y1={T + plot}
          y2={T + plot}
          stroke="hsl(var(--border))"
          strokeWidth={1}
        />
        <RotulosX categorias={categorias} w={w} h={h} />
      </svg>
      <Legenda series={series} />
    </div>
  );
}
