/**
 * Rate limiting simples, em memória, para conter força bruta no login.
 *
 * Escopo: adequado para 1 instância (VPS + PM2 em modo fork). Se um dia o app
 * escalar para VÁRIAS instâncias/cluster, mover este estado para Redis, senão
 * cada processo terá seu próprio contador e o teto efetivo multiplica.
 *
 * Estratégia: janela deslizante por chave (ex.: "ip:email"). Até MAX tentativas
 * dentro de WINDOW_MS; ao exceder, bloqueia até a janela esvaziar.
 */

const WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const MAX_ATTEMPTS = 8; // tentativas permitidas na janela

interface Bucket {
  hits: number[]; // timestamps (ms) das tentativas recentes
}

const buckets = new Map<string, Bucket>();

// Limpeza preguiçosa: remove chaves ociosas para não vazar memória.
let lastSweep = Date.now();
function sweep(now: number): void {
  if (now - lastSweep < WINDOW_MS) return;
  lastSweep = now;
  for (const [key, b] of buckets) {
    if (b.hits.length === 0 || now - b.hits[b.hits.length - 1] > WINDOW_MS) {
      buckets.delete(key);
    }
  }
}

export interface RateOptions {
  /** Teto de tentativas na janela. Padrão: MAX_ATTEMPTS. */
  max?: number;
  /** Tamanho da janela em ms. Padrão: WINDOW_MS. */
  windowMs?: number;
}

/**
 * Verificação genérica. `checkLoginRate` é o caso padrão (8 / 15min); baldes
 * com outro teto (ex.: o por link do acompanhamento) passam `opts`.
 */
export function checkRate(
  key: string,
  opts: RateOptions = {},
): {
  allowed: boolean;
  retryAfterSec: number;
} {
  const max = opts.max ?? MAX_ATTEMPTS;
  const windowMs = opts.windowMs ?? WINDOW_MS;
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key) ?? { hits: [] };
  // Descarta tentativas fora da janela.
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);

  if (bucket.hits.length >= max) {
    const oldest = bucket.hits[0];
    const retryAfterSec = Math.ceil((windowMs - (now - oldest)) / 1000);
    buckets.set(key, bucket);
    return { allowed: false, retryAfterSec };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { allowed: true, retryAfterSec: 0 };
}

/** Caso padrão (8 tentativas / 15 min), usado pelo login. */
export function checkLoginRate(key: string): {
  allowed: boolean;
  retryAfterSec: number;
} {
  return checkRate(key);
}

/** Zera o contador de uma chave (chamado após login bem-sucedido). */
export function clearLoginRate(key: string): void {
  buckets.delete(key);
}
