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
  // Faltava, e por isso o chip do formulário saía "LANCAMENTO": sem tradução,
  // o rótulo cai no valor cru do banco — caixa alta e sem cedilha.
  LANCAMENTO: "Lançamento",
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

export interface DiaDoCronograma<T> {
  /** `YYYY-MM-DD`, a chave de agrupamento. */
  chave: string;
  atividades: T[];
}

/**
 * As atividades agrupadas por DIA, do mais próximo ao mais distante.
 *
 * O DIA SAI DA DATA EM UTC, igual ao que o Connect gravou. Converter para o
 * fuso de quem olha moveria a atividade de dia perto da meia-noite, e o cronograma
 * do Flow deixaria de bater com o do Connect lado a lado — a pior forma de
 * errar, porque as duas telas parecem certas separadas.
 *
 * Data ilegível não derruba a tela: a atividade vai para o fim, agrupada em "sem
 * data". Vem de outro serviço, e sumir com ela esconderia um defeito de lá.
 */
export function agruparPorDia<T extends { scheduledAt: string }>(
  atividades: T[],
): DiaDoCronograma<T>[] {
  const porDia = new Map<string, T[]>();
  for (const p of atividades) {
    const d = new Date(p.scheduledAt);
    const chave = Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
    const lista = porDia.get(chave) ?? [];
    lista.push(p);
    porDia.set(chave, lista);
  }
  return [...porDia.entries()]
    .map(([chave, atividades]) => ({ chave, atividades }))
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
 * Mesma decisão de `agruparPorDia`, e pelo mesmo motivo: o dia de uma atividade é o
 * dia que o Connect gravou. Montar a grade no fuso de quem olha moveria a atividade
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

/** As atividades por dia, prontas para a grade procurar pela chave. */
export function indexarPorDia<T extends { scheduledAt: string }>(
  atividades: T[],
): Map<string, T[]> {
  // Reaproveita `agruparPorDia` para a chave do dia sair do MESMO lugar: duas
  // contas de "que dia é esta atividade" divergiriam no primeiro fuso.
  return new Map(agruparPorDia(atividades).map((d) => [d.chave, d.atividades]));
}

/** `true` se a chave cai no mês da âncora — o resto da grade é mês vizinho. */
export function doMesDaAncora(chave: string, ancora: string): boolean {
  return chave.slice(0, 7) === ancora.slice(0, 7);
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
 * paletas para a mesma atividade fariam a pessoa duvidar de qual está certa.
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
 * A data e a hora da atividade, para o detalhe do card.
 *
 * EM UTC, igual à grade e a `agruparPorDia`. Usar o fuso de quem olha faria
 * uma atividade de 00:30Z aparecer como "21:30" do DIA ANTERIOR — dentro de um
 * modal aberto a partir da célula do dia seguinte. O modal se contradiria com
 * a célula que o abriu, e as duas estariam "certas".
 *
 * Data ilegível devolve `null` em vez de "Invalid Date": ela vem de outro
 * serviço, e o modal diz que não sabe em vez de mentir.
 */
export function dataEHoraDaAtividade(scheduledAt: string): { data: string; hora: string } | null {
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
 * terceira, e o sintoma seria um filtro que esconde atividades sem avisar.
 */
export const MARCAS = Object.keys(MARCA);

/** A marca pedida na URL. Ausente ou desconhecida = todas (a URL é digitável). */
export function marcaDaQuery(valor: string | undefined): string | null {
  return valor && MARCAS.includes(valor) ? valor : null;
}

/**
 * As atividades da marca pedida. `null` é TODAS, e todas inclui as SEM MARCA.
 *
 * Atividade sem marca é estado válido no Connect, e some de qualquer filtro
 * específico — é o que se espera de um filtro, mas vale dizer: ela só aparece
 * em "Todas".
 */
export function filtrarPorMarca<T extends { brand: string | null }>(
  atividades: T[],
  marca: string | null,
): T[] {
  return marca === null ? atividades : atividades.filter((p) => p.brand === marca);
}

/* ------------------------------------------------ filtro de responsável */

/**
 * O recorte por PESSOA, e ele casa por PRIMEIRO NOME — não por id.
 *
 * Não é preguiça: é a única chave que existe nas duas origens. A atividade daqui
 * tem `ownerId`, mas a do Build.Connect atravessa a fronteira com o primeiro
 * nome e mais nada (o id e o e-mail do responsável não saem de lá, de
 * propósito). Filtrar por id esconderia TODA atividade do Connect no instante em
 * que alguém escolhesse uma pessoa — um filtro que apaga meia agenda sem
 * avisar é pior que um filtro grosseiro.
 *
 * O PREÇO: duas "Ana" diferentes contam como a mesma pessoa. É um empate real
 * e não dá para desfazer deste lado — o Connect teria de mandar um id, e a
 * decisão de lá é não mandar.
 */
export function responsaveisDaQuery(valor: string | undefined): string[] {
  if (!valor) return [];
  // Sem vazios e sem repetido: `?responsavel=,,Ana,Ana` é URL digitável.
  return [...new Set(valor.split(",").map((n) => n.trim()).filter(Boolean))];
}

/**
 * As atividades dessas pessoas. Lista vazia é "todas", e não "nenhuma" — o filtro
 * nasce vazio, e nesse estado a tela mostra o período inteiro.
 *
 * PEÇA SEM RESPONSÁVEL SOME quando há filtro, ao contrário da atividade sem marca,
 * que é permanente. A diferença é de propósito, e é a mesma do Connect: "só as
 * atividades da Fulana" é uma lista de pessoas, e uma atividade que não é de ninguém não
 * está nela.
 */
export function filtrarPorResponsavel<T extends { responsavel: string | null }>(
  atividades: T[],
  nomes: string[],
): T[] {
  if (nomes.length === 0) return atividades;
  return atividades.filter((p) => p.responsavel !== null && nomes.includes(p.responsavel));
}

/* ------------------------------------------- filtro de etapa do funil */

/**
 * As etapas pedidas na URL. Mesma forma do filtro de pessoa, de propósito: a
 * URL é digitável, então vírgula sobrando e sigla repetida não podem virar um
 * filtro que não casa com nada.
 */
export function funisDaQuery(valor: string | undefined): string[] {
  if (!valor) return [];
  const conhecidas = FUNIL_LEGENDA.map((f) => f.chave);
  return [
    ...new Set(
      valor
        .split(",")
        .map((v) => v.trim().toUpperCase())
        .filter((v) => conhecidas.includes(v)),
    ),
  ];
}

/**
 * As atividades dessas etapas. LISTA VAZIA É "TODAS", não "nenhuma" — o filtro
 * nasce sem nada marcado, e nesse estado a tela mostra o período inteiro.
 *
 * ETAPA DESCONHECIDA SOME QUANDO HÁ FILTRO, e é inevitável: o vocabulário vem
 * do Connect, e uma etapa criada lá não tem botão aqui. Sem botão não há como
 * marcá-la, então ela só aparece em "todas" — o mesmo acordo da atividade sem
 * responsável.
 */
export function filtrarPorFunil<T extends { funnel: string }>(
  atividades: T[],
  funis: string[],
): T[] {
  if (funis.length === 0) return atividades;
  return atividades.filter((p) => funis.includes(p.funnel));
}

/* --------------------------------------------------------------- funil */

export interface FatiaDoFunil {
  chave: string;
  rotulo: string;
  total: number;
  /** Fração do total, de 0 a 1. Zero atividades devolve 0, nunca `NaN`. */
  fracao: number;
}

/**
 * Quantas atividades em cada etapa do funil, e quanto isso é do total.
 *
 * AS TRÊS ETAPAS SEMPRE APARECEM, mesmo em zero: "nenhuma atividade de fundo de
 * funil" é o achado mais útil que esta conta produz, e uma fatia que some
 * esconde exatamente isso.
 *
 * `NaN` seria o defeito óbvio aqui: período vazio dá divisão por zero, e
 * `0/0 = NaN` viraria uma barra de largura "NaN%" que o navegador ignora em
 * silêncio — um gráfico vazio que parece um gráfico quebrado.
 */
export function contarPorFunil<T extends { funnel: string }>(atividades: T[]): FatiaDoFunil[] {
  const chaves = ["TOFU", "MOFU", "BOFU"];
  const desconhecidas = [...new Set(atividades.map((p) => p.funnel).filter((f) => !chaves.includes(f)))];
  return [...chaves, ...desconhecidas].map((chave) => {
    const total = atividades.filter((p) => p.funnel === chave).length;
    return {
      chave,
      rotulo: rotuloDeFunil(chave),
      total,
      fracao: atividades.length === 0 ? 0 : total / atividades.length,
    };
  });
}

/**
 * A contagem por etapa em cada dia da visão — as colunas do gráfico.
 *
 * RECEBE OS DIAS PRONTOS (`diasDaVisao`) em vez de tirá-los das atividades: um dia
 * sem atividade nenhuma tem de aparecer como coluna vazia, e um eixo montado a
 * partir dos dados pularia esse dia, encostando segunda em quinta como se
 * fossem vizinhas.
 */
export function funilPorDia<T extends { funnel: string; scheduledAt: string }>(
  atividades: T[],
  dias: string[],
): { chave: string; rotulo: string; valores: number[] }[] {
  const porDia = indexarPorDia(atividades);
  return ["TOFU", "MOFU", "BOFU"].map((chave) => ({
    chave,
    rotulo: rotuloDeFunil(chave),
    valores: dias.map((d) => (porDia.get(d) ?? []).filter((p) => p.funnel === chave).length),
  }));
}

/**
 * O TETO DO EIXO do gráfico de área, na regra do Connect (`niceMax`): sempre um
 * múltiplo de 4 acima do pico, para as cinco linhas de grade caírem em números
 * inteiros.
 *
 * É o que resolve, na origem, o eixo que saía "1, 1, 1, 0, 0": com teto 2 as
 * marcas caem em 0,5 e 1,5, e arredondar colapsa os rótulos. Com teto múltiplo
 * de 4 não existe marca fracionária para arredondar.
 */
export function escalaDoEixo(pico: number): number {
  if (!Number.isFinite(pico) || pico <= 4) return 4;
  const passo = Math.ceil(pico / 4);
  return (passo <= 5 ? passo : Math.ceil(passo / 5) * 5) * 4;
}

/**
 * A ORDEM DE EMPILHAMENTO da área: BOFU na base, TOFU no topo. É a ordem do
 * Connect, e ela tem leitura — de baixo para cima é o caminho que o público
 * faz no funil.
 */
export const EMPILHAMENTO = ["BOFU", "MOFU", "TOFU"] as const;

export interface CamadaDoFunil {
  chave: string;
  rotulo: string;
  /** A soma desta etapa com todas as de baixo, dia a dia. */
  acumulado: number[];
}

/**
 * As linhas ACUMULADAS da área empilhada.
 *
 * Três contagens soltas desenhadas na mesma escala se sobrepõem e a de baixo
 * desaparece atrás da de cima. Somar cada etapa às de baixo é o que faz as três
 * áreas ocuparem faixas próprias — e o topo da pilha passa a ser o total do
 * dia, que é a leitura que o gráfico promete.
 *
 * ETAPA AUSENTE É SIMPLESMENTE PULADA, sem buraco na pilha: a contagem vem de
 * `funilPorDia`, que sempre devolve as três, mas um filtro futuro que esconda
 * uma etapa não pode deslocar as outras para cima do eixo.
 */
export function acumularFunil(
  porEtapa: readonly { chave: string; rotulo: string; valores: number[] }[],
): CamadaDoFunil[] {
  const base = EMPILHAMENTO.map((c) => porEtapa.find((s) => s.chave === c)).filter(
    (s): s is { chave: string; rotulo: string; valores: number[] } => s !== undefined,
  );
  let corrente = new Array<number>(base[0]?.valores.length ?? 0).fill(0);
  return base.map((s) => {
    corrente = corrente.map((v, i) => v + (s.valores[i] ?? 0));
    return { chave: s.chave, rotulo: s.rotulo, acumulado: [...corrente] };
  });
}

/* ------------------------------------------------------------- autoria */

/**
 * QUEM EDITA UMA ATIVIDADE: só o autor dela. PURA, e num lugar só.
 *
 * Mora aqui porque DOIS lugares precisam da mesma resposta e eles não podem
 * discordar: a leitura, que decide se o card mostra o lápis
 * (`cronograma-data.ts`), e a action, que decide se a escrita passa
 * (`actions/cronograma.ts`). Escrita duas vezes, a regra diverge sem dar erro
 * — a tela oferece um botão que o servidor recusa, ou pior, esconde um botão
 * que o servidor aceitaria.
 *
 * SEM EXCEÇÃO PARA A GESTÃO, e isto é diferente do Build.Connect, onde o
 * Admin tem override para organizar a agenda do time. A regra que o dono
 * pediu aqui é "cada um edita o que é seu"; uma exceção seria uma segunda
 * regra para alguém descobrir por acidente.
 *
 * AUTOR NULO É NINGUÉM. É atividade de conta removida (`onDelete: SetNull`):
 * ela continua no calendário, porque apagá-la junto perderia a agenda da
 * equipe, mas ninguém a edita. Sem a checagem explícita de nulo, um
 * `null === null` futuro abriria todas elas de uma vez.
 */
export function podeEditarAtividade(createdById: string | null, viewerId: string): boolean {
  // STRING VAZIA NÃO É ID DE NINGUÉM, e a checagem existe porque `""` é o que
  // um `?? ""` descuidado produz no caminho do `viewerId`. Sem ela, `"" === ""`
  // daria `true` e liberaria a edição — um defeito que nenhum teste de tela
  // pegaria, porque na tela o id nunca chega vazio.
  if (!createdById || !viewerId) return false;
  return createdById === viewerId;
}

/* ------------------------------------------------------- selos coloridos */

/**
 * A COR DE CADA FORMATO E DE CADA REDE, copiadas do Build.Connect valor por
 * valor (`src/lib/funnel.ts`, constantes `FORMAT` e `PLATFORM`).
 *
 * Mesma decisão de `CORES_DE_MARCA`, e pelo mesmo motivo: a ficha das duas
 * ferramentas mostra a MESMA atividade, e um selo "Reel" roxo lá e cinza aqui
 * faria a pessoa procurar a diferença que não existe.
 *
 * HEXADECIMAL FIXO, não token do tema, e isto é escolha do Connect: a cor
 * identifica o formato, não o estado da interface, então ela é a mesma nos
 * dois temas. Quem se adapta é a opacidade (ver `estiloDeSelo`).
 */
export const CORES_DE_FORMATO: Record<string, string> = {
  REEL: "#8b5cf6",
  STORY: "#06b6d4",
  FEED: "#22c55e",
  CARROSSEL: "#f97316",
  LIVE: "#e11d48",
  // Azul é a única família ausente das cinco acima, então o selo de
  // lançamento não se confunde com nenhum outro de relance.
  LANCAMENTO: "#2563eb",
  OUTRO: "#64748b",
};

export const CORES_DE_PLATAFORMA: Record<string, string> = {
  INSTAGRAM: "#e1306c",
  TIKTOK: "#ee1d52",
  YOUTUBE: "#ff0000",
};

/**
 * A COR DE CADA ETAPA DO FUNIL, do Build.Connect valor por valor
 * (`src/lib/funnel.ts`, constante `FUNNEL`).
 *
 * Antes daqui o Flow usava a escala `sky`/`amber`/`rose` do Tailwind: PERTO da
 * do Connect, e nunca a mesma. Perto é o pior lugar para uma cor estar, porque
 * ninguém aponta a diferença e todo mundo a sente — e o funil é justamente o
 * único gráfico que as duas ferramentas desenham sobre os MESMOS três valores.
 */
export const CORES_DE_FUNIL: Record<string, string> = {
  TOFU: "#3b82f6",
  MOFU: "#f5a524",
  BOFU: "#ef4444",
};

/**
 * A LEGENDA DO FUNIL, copiada do Build.Connect palavra por palavra
 * (`src/lib/funnel.ts`, constante `FUNNEL`).
 *
 * TOFU, MOFU e BOFU são jargão, e o selo do card mostra a SIGLA CRUA porque é
 * só o que cabe numa célula de sete colunas. Sem esta legenda a tela cobra um
 * vocabulário que ela nunca ensinou — e quem chega novo no Marketing vê três
 * siglas de três letras sem nenhuma tradução em lugar nenhum da ferramenta.
 *
 * A COR SAI DE `CORES_DE_FUNIL`, não repetida aqui: duas listas da mesma cor
 * divergem, e o sintoma seria uma legenda que explica um azul diferente do
 * azul que o calendário pinta.
 */
export const FUNIL_LEGENDA: readonly {
  chave: string;
  /** "TOFU (Topo)" — a sigla com a posição, que é o que a legenda traduz. */
  titulo: string;
  /** "TOFU · Atração" — o rótulo curto do botão de filtro. */
  curto: string;
  descricao: string;
}[] = [
  {
    chave: "TOFU",
    titulo: "TOFU (Topo)",
    curto: "TOFU · Atração",
    descricao: "Atrair novo público. Reels e trends.",
  },
  {
    chave: "MOFU",
    titulo: "MOFU (Meio)",
    curto: "MOFU · Aquecimento",
    descricao: "Aquecer e educar. Conteúdo de valor.",
  },
  {
    chave: "BOFU",
    titulo: "BOFU (Fundo)",
    curto: "BOFU · Conversão",
    descricao: "Converter em venda. Ofertas e CTAs.",
  },
];

/**
 * O selo: 35% na borda e 12% no fundo — os mesmos `59` e `1f` hexadecimais que
 * o Connect anexa à cor —, e o TEXTO PUXADO PARA A TINTA DO TEMA.
 *
 * A TINTA NÃO É MAIS A COR CHEIA, e isto foi medido, não achado. Cor cheia é o
 * que estava aqui, e no tema claro o selo do MOFU (`#f5a524`) saía em 1,62:1 e
 * o do Carrossel (`#f97316`) em 2,14:1 sobre o próprio fundo — texto que não se
 * lê. No tema escuro os dois passavam, e é por isso que ninguém tinha visto.
 *
 * O CONNECT RESOLVE ISSO COM DUAS TINTAS POR COR (`text-[#fcd34d]` no escuro,
 * `[.light_&]:text-[#b45309]` no claro). Aqui sai uma mistura com
 * `--foreground`, que já é escura no tema claro e clara no escuro: dá o mesmo
 * resultado sem uma segunda tabela de cores para manter em dia, e um formato
 * novo criado no Connect já nasce legível nos dois temas.
 *
 * A COR CHEIA CONTINUA NA BORDA, que é quem carrega a identidade: contorno não
 * precisa de 4,5:1 porque não é texto, e a palavra escrita dentro do selo diz o
 * que ele é mesmo para quem não distingue a cor.
 *
 * Valor desconhecido devolve `undefined`, e aí o selo cai no neutro do tema:
 * formato novo criado no Connect aparece cinza, nunca invisível.
 */
export function estiloDeSelo(
  mapa: Record<string, string>,
  chave: string,
): { borderColor: string; backgroundColor: string; color: string } | undefined {
  const cor = mapa[chave];
  return cor ? estiloDaCor(cor) : undefined;
}

/**
 * A MESMA RECEITA A PARTIR DA COR CRUA, para quem já tem a cor em mãos — o
 * chip do formulário, que recebe a sua de fora. Separada para não existir uma
 * segunda escrita dos mesmos `59` e `1f` em outro arquivo.
 */
export function estiloDaCor(cor: string): {
  borderColor: string;
  backgroundColor: string;
  color: string;
} {
  return { borderColor: `${cor}59`, backgroundColor: `${cor}1f`, color: tintaDeTexto(cor) };
}

/**
 * A COR VIRANDO TINTA DE TEXTO sobre o fundo do tema: 40% dela, 60% da tinta
 * do tema.
 *
 * 40/60 e nao meio a meio: com 50% o ambar do MOFU parava em 3,94:1 no tema
 * claro. Medido no navegador nos dois temas, nao estimado.
 *
 * NUM LUGAR SÓ porque dois usam: o selo translúcido e a descrição de cada etapa
 * na legenda. Duas cópias da mistura divergiriam na primeira vez que alguém
 * ajustasse uma delas, e o sintoma seria uma legenda numa tinta e o selo que ela
 * explica em outra.
 */
export const tintaDeTexto = (cor: string) =>
  `color-mix(in srgb, ${cor} 40%, hsl(var(--foreground)))`;

/* ------------------------------------------------------ selos sólidos */

/**
 * A SEGUNDA RECEITA DE SELO: cor cheia no fundo.
 *
 * O Build.Connect usa DUAS, e não é incoerência dele — é a superfície que
 * manda. Na ficha e nas telas largas o selo é translúcido sobre o fundo do
 * tema (`estiloDeSelo`). No CHIP DO CALENDÁRIO, que mede dois centímetros e
 * ainda por cima pode estar sobre o amarelo de uma marca, o selo é sólido: a
 * cor cheia é a única que não depende do que está atrás dela.
 */
const TINTA_CLARA = "#ffffff";
const TINTA_ESCURA = "#1f2937";

/** Luminância relativa da WCAG. Serve para escolher a tinta, não para aprovar. */
function luminancia(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const canal = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * canal((n >> 16) & 255) +
    0.7152 * canal((n >> 8) & 255) +
    0.0722 * canal(n & 255)
  );
}

const contraste = (a: number, b: number) =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/**
 * A TINTA DE UM SELO SÓLIDO: branco ou quase-preto, o que ler melhor sobre a
 * cor cheia. Calculado, não escolhido a dedo.
 *
 * Tinta fixa reprova de um jeito ou de outro: branco sobre o âmbar do MOFU
 * (`#f5a524`) fica em 1,98:1, e tinta escura sobre o azul do TOFU (`#3b82f6`)
 * fica pior que o branco. Comparar as duas por cor resolve as duas pontas — e
 * um formato novo criado no Connect já nasce com a tinta certa, sem ninguém
 * precisar lembrar de escolher.
 *
 * Valor fora do formato devolve branco: é a tinta da maioria da paleta, e um
 * selo sem tinta nenhuma seria texto invisível.
 */
export function tintaSolida(hex: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return TINTA_CLARA;
  const fundo = luminancia(hex);
  return contraste(luminancia(TINTA_ESCURA), fundo) > contraste(luminancia(TINTA_CLARA), fundo)
    ? TINTA_ESCURA
    : TINTA_CLARA;
}

/** O selo sólido pronto. Valor desconhecido devolve `undefined`, como o outro. */
export function estiloSolido(
  mapa: Record<string, string>,
  chave: string,
): { backgroundColor: string; color: string } | undefined {
  const cor = mapa[chave];
  if (!cor) return undefined;
  return { backgroundColor: cor, color: tintaSolida(cor) };
}
