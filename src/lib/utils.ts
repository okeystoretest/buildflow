import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formata Decimal/number para BRL. */
export function formatBRL(value: number | string): string {
  const n = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(n) ? n : 0);
}

/** Gera codigo legivel de pedido: BF-2026-000123 */
export function buildOrderCode(seq: number): string {
  const year = new Date().getFullYear();
  return `BF-${year}-${String(seq).padStart(6, "0")}`;
}

/**
 * Cor da barra/valor de progresso por faixa (regra de negocio vigente):
 *   ate 33%  -> vermelho
 *   ate 66%  -> amarelo
 *   ate 99%  -> azul
 *   100%+    -> verde
 */
export function tierColor(pct: number): string {
  if (pct >= 100) return "bg-emerald-500";
  if (pct >= 67) return "bg-blue-500";
  if (pct >= 34) return "bg-amber-500";
  return "bg-red-500";
}
export function tierText(pct: number): string {
  if (pct >= 100) return "text-emerald-500";
  if (pct >= 67) return "text-blue-500";
  if (pct >= 34) return "text-amber-500";
  return "text-red-500";
}

/**
 * Ordena operacoes pelo CODIGO numericamente (menor -> maior).
 * O code e string; comparar como numero evita que "511" venha antes de "5102".
 * Se o code nao for numerico, cai no comparador de texto.
 */
export function sortOperationsByCode<T extends { code: string }>(ops: T[]): T[] {
  return [...ops].sort((a, b) => {
    const na = Number(a.code);
    const nb = Number(b.code);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return a.code.localeCompare(b.code, undefined, { numeric: true });
  });
}

// Particulas de nome brasileiro. Nao contam como "segundo nome": pegar os dois
// primeiros pedacos de "Maria da Silva" devolveria "Maria da", que le como nome
// cortado no meio — exatamente o oposto de encurtar para caber.
const PARTICULAS_NOME = new Set(["de", "da", "do", "das", "dos", "e", "di", "du", "del", "van", "von"]);

/**
 * Primeiro + segundo nome, para exibicao onde o espaco e curto (card do Fluxo).
 *
 * NAO deve ser usada para gravar nem para buscar: a busca do quadro casa com o
 * nome COMPLETO, e encurtar na origem faria procurar por sobrenome parar de
 * encontrar a vendedora. E transformacao de exibicao, e so.
 *
 * Devolve so o primeiro nome quando nao ha um segundo aproveitavel (nome unico,
 * ou nome seguido apenas de particula).
 */
export function shortName(full: string): string {
  const partes = full.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "";
  const primeiro = partes[0];
  const segundo = partes.slice(1).find((p) => !PARTICULAS_NOME.has(p.toLowerCase()));
  return segundo ? `${primeiro} ${segundo}` : primeiro;
}

/**
 * Proxima campanha do rodizio do Ranking de Vendas.
 *
 * Percorre a lista em ciclo: a ultima volta para a primeira. Quando o id atual
 * NAO esta na lista, recomeca do inicio — isso importa porque o quadro
 * recarrega os dados sozinho a cada 30 minutos e a lista pode mudar no meio do
 * rodizio (uma campanha desativada some). Sem esse retorno ao inicio, o rodizio
 * ficaria preso num id inexistente e o bloco pararia de trocar.
 *
 * Lista vazia devolve "" — nao ha campanha para exibir.
 */
export function nextCampaignId(ids: string[], currentId: string): string {
  if (ids.length === 0) return "";
  const i = ids.indexOf(currentId);
  if (i === -1) return ids[0];
  return ids[(i + 1) % ids.length];
}

/**
 * Apara um texto livre e o corta num teto, devolvendo null quando sobra vazio.
 *
 * Existe porque as colunas de observacao, motivo e nome sao TEXT no Postgres:
 * sem teto, `nota.trim()` aceita megabytes, e um Ctrl+V distraido entra no
 * banco sem ninguem reclamar. O corte e silencioso de proposito — recusar o
 * lancamento inteiro por causa do tamanho de uma observacao seria pior que
 * guardar os primeiros N caracteres dela.
 */
export function limitText(raw: string | null | undefined, max: number): string | null {
  if (raw == null) return null;
  const limpo = raw.trim().slice(0, max);
  return limpo || null;
}

/**
 * O rotulo do botao de periodo (src/components/shared/periodo-filtro.tsx).
 *
 * Mostra o recorte escolhido no proprio botao, para que ele diga o que esta
 * valendo sem precisar ser aberto. Sem periodo, devolve o `titulo` — que e o
 * que aquele periodo significa naquela tela ("Abertura", "Criacao", "Inicio").
 *
 * As pontas sao independentes: so "de" e um periodo aberto a frente, so "ate"
 * e um periodo aberto atras, e os dois precisam ser dizíveis — a consulta
 * aceita as duas formas.
 *
 * Fatia a string em vez de passar por `Date`: o valor ja e uma data sem hora
 * (YYYY-MM-DD), e `new Date("2026-10-19")` seria interpretada em UTC e voltaria
 * um dia atras para quem esta a oeste de Greenwich — um filtro "de 19/10"
 * aparecendo como "18/10" no proprio botao que o define.
 */
export function dataCurtaBR(iso: string): string {
  const [a, m, d] = iso.split("-");
  return d && m && a ? `${d}/${m}/${a.slice(2)}` : iso;
}

export function rotuloDePeriodo(de: string, ate: string, titulo: string): string {
  if (de && ate) return `${dataCurtaBR(de)} – ${dataCurtaBR(ate)}`;
  if (de) return `desde ${dataCurtaBR(de)}`;
  if (ate) return `até ${dataCurtaBR(ate)}`;
  return titulo;
}
