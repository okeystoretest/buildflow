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

/** Cor da barra de progresso por faixa: <=50 vermelho, <=75 amarelo, <=99 azul, 100 verde. */
export function tierColor(pct: number): string {
  if (pct >= 100) return "bg-emerald-500";
  if (pct >= 76) return "bg-blue-500";
  if (pct >= 51) return "bg-amber-500";
  return "bg-red-500";
}
export function tierText(pct: number): string {
  if (pct >= 100) return "text-emerald-500";
  if (pct >= 76) return "text-blue-500";
  if (pct >= 51) return "text-amber-500";
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
