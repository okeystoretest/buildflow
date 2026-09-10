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
