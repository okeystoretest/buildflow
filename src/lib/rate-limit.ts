/**
 * Rate limiting com janela deslizante, guardado no Postgres.
 *
 * Protege o login (força bruta), o link do acompanhamento, a porta do Connect e
 * a submissão pública da LP de Atacado.
 *
 * POR QUE SAIU DA MEMÓRIA. O contador vivia num `Map` do processo. Restart, OOM
 * ou redeploy zerava a contagem, e com duas instâncias o teto efetivo DOBRAVA
 * em silêncio: cada processo tinha o seu balde, e nada na tela dizia que a
 * contenção escrita como "15 por hora" estava valendo 30. Um limite que não se
 * sabe qual é não é um limite.
 *
 * UMA LINHA POR TENTATIVA, não um contador por janela fixa. É o que preserva a
 * semântica deslizante que os quatro chamadores já tinham: contador por janela
 * fixa deixa passar o dobro do teto na emenda entre duas janelas, e afrouxar a
 * contenção por baixo de quem já depende dela não é detalhe de implementação.
 *
 * DEGRADA, NÃO DESLIGA E NÃO TRANCA. Se o banco falhar, cai no balde em memória
 * (o código que estava aqui antes, preservado abaixo) em vez de liberar tudo ou
 * recusar tudo. Liberar tudo tira a contenção no pior momento possível; recusar
 * tudo transforma uma falha de banco em ninguém conseguir entrar no sistema. O
 * fallback é pior que o Postgres e melhor que os dois extremos.
 *
 * A função é ASSÍNCRONA desde esta mudança. Os quatro chamadores já estavam em
 * contexto assíncrono (server action ou route handler).
 */
import { prisma } from "@/lib/prisma";

const WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const MAX_ATTEMPTS = 8; // tentativas permitidas na janela

interface Bucket {
  hits: number[]; // timestamps (ms) das tentativas recentes
  /**
   * A MAIOR janela já declarada por quem usa esta chave.
   *
   * INVARIANTE: um balde nunca pode ser removido antes da janela mais longa
   * que o seu chamador declarou — se for, o teto daquele chamador multiplica
   * em silêncio. Era o que acontecia: o `sweep` usava o WINDOW_MS do módulo
   * (15 min) e ignorava o `windowMs` recebido, então quem pedia uma janela de
   * 1 hora ganhava balde novo após 15 minutos de pausa e, na prática, um teto
   * quatro vezes maior que o pedido.
   *
   * Guardada com `Math.max` a cada chamada, e não só na criação: se a mesma
   * chave for usada com janelas diferentes, a mais longa manda. O custo de
   * errar para cima é memória (um balde ocioso vive mais); para baixo, é a
   * contenção não existir.
   */
  windowMs: number;
}

const buckets = new Map<string, Bucket>();

// Limpeza preguiçosa: remove chaves ociosas para não vazar memória.
// A CADÊNCIA da varredura segue a do módulo (roda no máximo a cada WINDOW_MS);
// o que mudou é o critério de remoção, que agora é a janela do próprio balde.
let lastSweep = Date.now();
function sweep(now: number): void {
  if (now - lastSweep < WINDOW_MS) return;
  lastSweep = now;
  for (const [key, b] of buckets) {
    if (b.hits.length === 0 || now - b.hits[b.hits.length - 1] > b.windowMs) {
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

export interface RateResult {
  allowed: boolean;
  retryAfterSec: number;
}

/**
 * Verificação genérica. `checkLoginRate` é o caso padrão (8 / 15min); baldes
 * com outro teto (ex.: o por link do acompanhamento, ou os 15/h por IP da LP)
 * passam `opts`.
 *
 * Tudo numa ÚNICA instrução SQL, e não ler-depois-escrever: duas requisições
 * simultâneas que leem a contagem e depois gravam veem as duas o penúltimo
 * lugar e as duas passam. Aqui a contagem e a inserção estão na mesma
 * instrução, então a corrida vale no máximo uma tentativa extra sob
 * concorrência real — contra o teto multiplicado por instância de antes.
 *
 * A instrução também APAGA as linhas fora da janela da própria chave, de modo
 * que a tabela não cresce sem limite sem depender de rotina nenhuma. Quem é
 * barrado não insere linha: tentar 10 mil vezes não gera 10 mil linhas.
 */
export async function checkRate(key: string, opts: RateOptions = {}): Promise<RateResult> {
  const max = opts.max ?? MAX_ATTEMPTS;
  const windowMs = opts.windowMs ?? WINDOW_MS;
  const corte = new Date(Date.now() - windowMs);

  try {
    const [linha] = await prisma.$queryRaw<
      { contagem: number; inserido: number; mais_velho: Date | null }[]
    >`
      WITH limpa AS (
        DELETE FROM "RateLimitHit" WHERE "key" = ${key} AND "at" < ${corte}
      ), atuais AS (
        SELECT count(*)::int AS n, min("at") AS mv
        FROM "RateLimitHit" WHERE "key" = ${key} AND "at" >= ${corte}
      ), ins AS (
        INSERT INTO "RateLimitHit" ("key", "at")
        SELECT ${key}, now() FROM atuais WHERE n < ${max}
        RETURNING 1
      )
      SELECT (SELECT n FROM atuais)  AS contagem,
             (SELECT count(*)::int FROM ins) AS inserido,
             (SELECT mv FROM atuais) AS mais_velho
    `;

    if (linha && linha.inserido === 0) {
      // Barrado. A espera é até a tentativa MAIS VELHA da janela sair dela —
      // é o que "deslizante" significa, e é o número honesto para mostrar.
      const maisVelho = linha.mais_velho ? new Date(linha.mais_velho).getTime() : Date.now();
      const retryAfterSec = Math.max(1, Math.ceil((windowMs - (Date.now() - maisVelho)) / 1000));
      return { allowed: false, retryAfterSec };
    }
    return { allowed: true, retryAfterSec: 0 };
  } catch {
    // Banco fora: degrada para o balde em memória. Ver o cabeçalho.
    return checkRateEmMemoria(key, { max, windowMs });
  }
}

/**
 * O balde em memória, que agora é só o fallback.
 *
 * Mantido inteiro de propósito, com a invariante do `windowMs` que já estava
 * aqui: é código que já funcionava, e reescrever um fallback é a melhor forma
 * de descobrir um bug nele no dia em que o banco cair.
 */
function checkRateEmMemoria(key: string, opts: RateOptions = {}): RateResult {
  const max = opts.max ?? MAX_ATTEMPTS;
  const windowMs = opts.windowMs ?? WINDOW_MS;
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key) ?? { hits: [], windowMs };
  // O balde passa a lembrar a maior janela já pedida para esta chave, para que
  // o `sweep` não o apague antes dela (ver a invariante em `Bucket.windowMs`).
  bucket.windowMs = Math.max(bucket.windowMs, windowMs);
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
export function checkLoginRate(key: string): Promise<RateResult> {
  return checkRate(key);
}

/**
 * Zera o contador de uma chave (chamado após login bem-sucedido).
 *
 * Apaga nos DOIS lugares, sempre. Se o banco falhou numa tentativa anterior, a
 * contagem daquela tentativa ficou na memória — limpar só o Postgres deixaria a
 * lojista que acabou de entrar com tentativas contra ela num balde invisível.
 * Falha de banco aqui é ignorada: não entregar o login por causa da limpeza do
 * contador seria recusar quem já provou a senha.
 */
export async function clearLoginRate(key: string): Promise<void> {
  buckets.delete(key);
  try {
    await prisma.rateLimitHit.deleteMany({ where: { key } });
  } catch {
    // Ver o comentário acima.
  }
}

/**
 * Apaga tentativas velhas de QUALQUER chave.
 *
 * A checagem já limpa as linhas fora da janela da chave que está sendo
 * verificada — o que deixa de fora exatamente as chaves que nunca voltam, que é
 * a maioria: um IP que tentou três vezes e desistiu. Sem isto a tabela só
 * cresce, devagar e para sempre.
 *
 * 24 horas é folgado de propósito: a janela mais longa em uso é de 1 hora (os
 * 15/h por IP da LP). Apagar com folga significa que esta rotina nunca
 * interfere na contenção, nem se o relógio do servidor der um passo atrás.
 */
export async function expurgarTentativasVelhas(): Promise<number> {
  const corte = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const { count } = await prisma.rateLimitHit.deleteMany({ where: { at: { lt: corte } } });
  return count;
}
