import type { PostDoCronograma } from "@/lib/integration/connect-cronograma";

/**
 * Leitura do cronograma de conteúdo. PURO: nada aqui vai à rede nem ao banco,
 * para poder ser conferido por script.
 *
 * TODO RÓTULO CAI NO VALOR CRU quando não conhece a chave. O vocabulário
 * (status, etapa de funil, formato, plataforma, marca) é definido no OUTRO
 * repositório: o dia em que o Marketing criar um status novo lá, esta tela
 * mostraria "undefined" num cronograma que parece completo. Mostrar
 * "ARQUIVADO" sem tradução é feio; mostrar "undefined" é defeito.
 */

const STATUS: Record<string, string> = {
  IDEIA: "Ideia",
  EM_PRODUCAO: "Em produção",
  AGENDADO: "Agendado",
  PUBLICADO: "Publicado",
};

const FUNIL: Record<string, string> = {
  TOFU: "Topo — atrair",
  MOFU: "Meio — aquecer",
  BOFU: "Fundo — converter",
};

const FORMATO: Record<string, string> = {
  REEL: "Reel",
  STORY: "Story",
  FEED: "Feed",
  CARROSSEL: "Carrossel",
  LIVE: "Live",
  OUTRO: "Outro",
};

const PLATAFORMA: Record<string, string> = {
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
  YOUTUBE: "YouTube",
};

const MARCA: Record<string, string> = { OKEY: "OKEY", LOV_CLUB: "Lov Club" };

const rotulo = (mapa: Record<string, string>, chave: string | null) =>
  chave ? (mapa[chave] ?? chave) : "";

export const rotuloDeStatus = (v: string) => rotulo(STATUS, v);
export const rotuloDeFunil = (v: string) => rotulo(FUNIL, v);
export const rotuloDeFormato = (v: string) => rotulo(FORMATO, v);
export const rotuloDePlataforma = (v: string) => rotulo(PLATAFORMA, v);
export const rotuloDeMarca = (v: string | null) => rotulo(MARCA, v);

/** A cor do chip de status. Publicado é o único "pronto". */
export function corDoStatus(status: string): string {
  if (status === "PUBLICADO") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (status === "AGENDADO") return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
  if (status === "EM_PRODUCAO") return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  return "bg-secondary text-muted-foreground";
}

export interface DiaDoCronograma {
  /** `YYYY-MM-DD`, a chave de agrupamento. */
  chave: string;
  posts: PostDoCronograma[];
}

/**
 * As peças agrupadas por DIA, do mais próximo ao mais distante.
 *
 * O DIA SAI DA DATA EM UTC, igual ao que o Connect gravou. Converter para o
 * fuso de quem olha moveria a peça de dia perto da meia-noite, e o cronograma
 * do Flow deixaria de bater com o do Connect lado a lado — a pior forma de
 * errar, porque as duas telas parecem certas separadas.
 *
 * Data ilegível não derruba a tela: a peça vai para o fim, agrupada em "sem
 * data". Vem de outro serviço, e sumir com ela esconderia um defeito de lá.
 */
export function agruparPorDia(posts: PostDoCronograma[]): DiaDoCronograma[] {
  const porDia = new Map<string, PostDoCronograma[]>();
  for (const p of posts) {
    const d = new Date(p.scheduledAt);
    const chave = Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
    const lista = porDia.get(chave) ?? [];
    lista.push(p);
    porDia.set(chave, lista);
  }
  return [...porDia.entries()]
    .map(([chave, posts]) => ({ chave, posts }))
    // "" (sem data) por último: `localeCompare` o poria primeiro, e a tela
    // abriria por um bloco de defeito em vez de pela próxima publicação.
    .sort((a, b) => (a.chave === "" ? 1 : b.chave === "" ? -1 : a.chave.localeCompare(b.chave)));
}

/** `YYYY-MM-DD` de hoje e de daqui a `dias`, em UTC — o recorte pedido ao Connect. */
export function janela(agora: Date, diasAtras: number, diasAdiante: number): { de: string; ate: string } {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    de: iso(new Date(agora.getTime() - diasAtras * 86_400_000)),
    ate: iso(new Date(agora.getTime() + diasAdiante * 86_400_000)),
  };
}

/* ------------------------------------------------------------- calendário */

/**
 * O CALENDÁRIO, em UTC do começo ao fim.
 *
 * Mesma decisão de `agruparPorDia`, e pelo mesmo motivo: o dia de uma peça é o
 * dia que o Connect gravou. Montar a grade no fuso de quem olha moveria a peça
 * de célula perto da meia-noite, e o calendário do Flow deixaria de bater com o
 * do Connect lado a lado — a pior forma de errar, porque as duas telas parecem
 * certas quando vistas separadas.
 *
 * TUDO PURO: a tela é um componente de servidor sem estado, e a navegação é
 * por `<Link>` com `?periodo=` e `?data=`. Nada aqui vai à rede.
 */

export type Periodo = "mes" | "semana" | "dia";

const PERIODOS: readonly Periodo[] = ["mes", "semana", "dia"];

/** O período pedido na URL. Qualquer outra coisa vira "mes" — a URL é digitável. */
export function periodoDaQuery(valor: string | undefined): Periodo {
  return PERIODOS.includes(valor as Periodo) ? (valor as Periodo) : "mes";
}

const DIA_MS = 86_400_000;
const chaveDe = (d: Date) => d.toISOString().slice(0, 10);
const doDia = (chave: string) => new Date(`${chave}T00:00:00.000Z`);

/** A data que ancora a visão. Ausente ou ilegível vira hoje, nunca erro. */
export function ancoraDaQuery(valor: string | undefined, hoje: Date): string {
  if (valor && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const d = doDia(valor);
    if (!Number.isNaN(d.getTime())) return chaveDe(d);
  }
  return chaveDe(hoje);
}

/** A segunda-feira da semana desta data. A semana começa na segunda, como no Connect. */
function segundaDa(d: Date): Date {
  // getUTCDay: 0 = domingo. O `+6 % 7` põe a segunda em 0 e o domingo em 6.
  return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DIA_MS);
}

/**
 * Os dias que a visão mostra, em ordem.
 *
 * No mês são SEMANAS INTEIRAS, da segunda da semana do dia 1 ao domingo da
 * semana do último dia: uma grade com buraco na primeira linha não é um
 * calendário. Por isso a visão de mês mostra dias do mês vizinho — e é isso
 * que a tela pinta de cinza.
 */
export function diasDaVisao(periodo: Periodo, ancora: string): string[] {
  const base = doDia(ancora);
  if (periodo === "dia") return [chaveDe(base)];
  const inicio =
    periodo === "semana"
      ? segundaDa(base)
      : segundaDa(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1)));
  const fim =
    periodo === "semana"
      ? inicio.getTime() + 6 * DIA_MS
      : segundaDa(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0))).getTime() +
        6 * DIA_MS;
  const dias: string[] = [];
  for (let t = inicio.getTime(); t <= fim; t += DIA_MS) dias.push(chaveDe(new Date(t)));
  return dias;
}

/** O recorte a pedir ao Connect: exatamente o que a visão mostra, nem um dia a mais. */
export function recorteDaVisao(periodo: Periodo, ancora: string): { de: string; ate: string } {
  const dias = diasDaVisao(periodo, ancora);
  return { de: dias[0], ate: dias[dias.length - 1] };
}

/**
 * A âncora da visão anterior (-1) ou seguinte (+1).
 *
 * O mês anda pelo DIA 1, e não somando 30 dias: 31/01 + 1 mês cairia em 03/03,
 * pulando fevereiro inteiro. Quem clica na seta espera o mês seguinte.
 */
export function deslocar(periodo: Periodo, ancora: string, passo: -1 | 1): string {
  const base = doDia(ancora);
  if (periodo === "dia") return chaveDe(new Date(base.getTime() + passo * DIA_MS));
  if (periodo === "semana") return chaveDe(new Date(base.getTime() + passo * 7 * DIA_MS));
  return chaveDe(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + passo, 1)));
}

const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fmt = (chave: string, opcoes: Intl.DateTimeFormatOptions) =>
  doDia(chave).toLocaleDateString("pt-BR", { ...opcoes, timeZone: "UTC" });

/** O título do cabeçalho: "Novembro 2026", "2 a 8 de novembro", "Quinta, 06 de novembro". */
export function rotuloDaVisao(periodo: Periodo, ancora: string): string {
  if (periodo === "dia") {
    return maiuscula(fmt(ancora, { weekday: "long", day: "2-digit", month: "long" }));
  }
  if (periodo === "mes") {
    return `${maiuscula(fmt(ancora, { month: "long" }))} ${fmt(ancora, { year: "numeric" })}`;
  }
  const dias = diasDaVisao("semana", ancora);
  const [inicio, fim] = [dias[0], dias[6]];
  const mesInicio = fmt(inicio, { month: "long" });
  const mesFim = fmt(fim, { month: "long" });
  // Semana que atravessa o mês precisa dos dois nomes, senão "30 a 5 de
  // novembro" mente sobre o dia 30.
  return mesInicio === mesFim
    ? `${fmt(inicio, { day: "numeric" })} a ${fmt(fim, { day: "numeric" })} de ${mesInicio}`
    : `${fmt(inicio, { day: "numeric" })} de ${mesInicio} a ${fmt(fim, { day: "numeric" })} de ${mesFim}`;
}

/** As peças por dia, prontas para a grade procurar pela chave. */
export function indexarPorDia(posts: PostDoCronograma[]): Map<string, PostDoCronograma[]> {
  // Reaproveita `agruparPorDia` para a chave do dia sair do MESMO lugar: duas
  // contas de "que dia é esta peça" divergiriam no primeiro fuso.
  return new Map(agruparPorDia(posts).map((d) => [d.chave, d.posts]));
}

/** `true` se a chave cai no mês da âncora — o resto da grade é mês vizinho. */
export function doMesDaAncora(chave: string, ancora: string): boolean {
  return chave.slice(0, 7) === ancora.slice(0, 7);
}

/** A cor da bolinha do card. Mesmo vocabulário de `corDoStatus`, só o preenchimento. */
export function corDoPonto(status: string): string {
  if (status === "PUBLICADO") return "bg-emerald-500";
  if (status === "AGENDADO") return "bg-sky-500";
  if (status === "EM_PRODUCAO") return "bg-amber-500";
  return "bg-muted-foreground";
}

/** A cor do selo da etapa do funil. Topo frio, fundo quente. */
export function corDoFunil(funnel: string): string {
  if (funnel === "TOFU") return "bg-sky-500/20 text-sky-700 dark:text-sky-300";
  if (funnel === "MOFU") return "bg-amber-500/25 text-amber-700 dark:text-amber-300";
  if (funnel === "BOFU") return "bg-rose-500/20 text-rose-700 dark:text-rose-300";
  return "bg-secondary text-muted-foreground";
}

/**
 * O selo de formato do card: o primeiro formato e quantos sobraram ("REEL +1").
 *
 * Listar todos estoura a largura da célula num calendário de sete colunas, e a
 * contagem avisa que há mais sem fingir que não há.
 */
export function seloDeFormatos(formats: string[]): string | null {
  if (formats.length === 0) return null;
  const extras = formats.length - 1;
  return extras > 0 ? `${formats[0]} +${extras}` : formats[0];
}

/**
 * A PALETA DO CARD, copiada do Connect valor por valor (`src/lib/funnel.ts`,
 * constante `BRAND`). A grade é a mesma agenda nas duas ferramentas; duas
 * paletas para a mesma peça fariam a pessoa duvidar de qual está certa.
 *
 * IGUAL NOS DOIS TEMAS, e isto é a escolha do Connect, não um esquecimento: os
 * dois tons de marca são claros e o texto sobre eles é fixo em escuro. Antes o
 * Flow tinha variante `dark:` própria (fundo quase preto, tinta da marca em
 * 30%), e no modo escuro os dois calendários não se pareciam em nada.
 *
 * Aplicada por `style` e não por classe, como lá: o valor é um hexadecimal
 * exato que não existe na escala do Tailwind, e inline ele não pode divergir
 * numa purga de CSS.
 */
export const CORES_DE_MARCA: Record<string, { fundo: string; borda: string; texto: string }> = {
  OKEY: { fundo: "#f0e6a8", borda: "#d9cc84", texto: "#3d3410" },
  LOV_CLUB: { fundo: "#f8b4c4", borda: "#e895a8", texto: "#4a1420" },
};

/** A paleta da marca, ou `null` — marca nova do Connect cai no card neutro. */
export function corDeMarca(brand: string | null): { fundo: string; borda: string; texto: string } | null {
  return (brand && CORES_DE_MARCA[brand]) || null;
}

/** Classes do card SEM marca. Com marca, quem pinta é `corDeMarca` por style. */
export function corDoCard(brand: string | null): string {
  return corDeMarca(brand) ? "" : "border-border bg-secondary/40";
}

/**
 * A data e a hora da peça, para o detalhe do card.
 *
 * EM UTC, igual à grade e a `agruparPorDia`. Usar o fuso de quem olha faria
 * uma peça de 00:30Z aparecer como "21:30" do DIA ANTERIOR — dentro de um
 * modal aberto a partir da célula do dia seguinte. O modal se contradiria com
 * a célula que o abriu, e as duas estariam "certas".
 *
 * Data ilegível devolve `null` em vez de "Invalid Date": ela vem de outro
 * serviço, e o modal diz que não sabe em vez de mentir.
 */
export function dataEHoraDaPeca(scheduledAt: string): { data: string; hora: string } | null {
  const d = new Date(scheduledAt);
  if (Number.isNaN(d.getTime())) return null;
  const data = d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return {
    data: data.charAt(0).toUpperCase() + data.slice(1),
    hora: d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    }),
  };
}

/* --------------------------------------------------------- filtro de marca */

/**
 * As marcas que o filtro oferece, TIRADAS DO MAPA DE RÓTULOS e não escritas de
 * novo: duas listas de marcas divergiriam no dia em que o Connect ganhasse uma
 * terceira, e o sintoma seria um filtro que esconde peças sem avisar.
 */
export const MARCAS = Object.keys(MARCA);

/** A marca pedida na URL. Ausente ou desconhecida = todas (a URL é digitável). */
export function marcaDaQuery(valor: string | undefined): string | null {
  return valor && MARCAS.includes(valor) ? valor : null;
}

/**
 * As peças da marca pedida. `null` é TODAS, e todas inclui as SEM MARCA.
 *
 * Peça sem marca é estado válido no Connect, e some de qualquer filtro
 * específico — é o que se espera de um filtro, mas vale dizer: ela só aparece
 * em "Todas".
 */
export function filtrarPorMarca(
  posts: PostDoCronograma[],
  marca: string | null,
): PostDoCronograma[] {
  return marca === null ? posts : posts.filter((p) => p.brand === marca);
}
