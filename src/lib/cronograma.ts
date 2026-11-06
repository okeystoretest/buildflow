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
