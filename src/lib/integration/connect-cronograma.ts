import { unstable_cache } from "next/cache";
import { signWebhook } from "./signature";
import { integrationEnv } from "./connect-auth";

/**
 * CRONOGRAMA DE CONTEÚDO — o calendário do Marketing, lido do Build.Connect.
 *
 * LÊ AO VIVO, SEM CÓPIA NO BANCO (decisão do dono, 05/11/2026). Uma tabela
 * espelho aqui criaria uma SEGUNDA verdade sobre a agenda do Marketing, e
 * descobrir qual das duas está certa custa mais que a tela inteira. O preço é
 * depender do Connect estar de pé; o cache curto abaixo cobre a oscilação.
 *
 * SÓ LEITURA: nada nesta tela escreve no Connect. O cronograma é editado lá.
 */

/** Uma peça de conteúdo, como o Connect a entrega. */
export interface PostDoCronograma {
  id: string;
  title: string;
  /** ISO. Vem como texto do JSON — quem formata é a tela. */
  scheduledAt: string;
  status: string;
  funnel: string;
  formats: string[];
  platforms: string[];
  brand: string | null;
}

export type RespostaDoCronograma =
  | { ok: true; posts: PostDoCronograma[]; truncado: boolean }
  /**
   * FALHA COM MOTIVO, nunca exceção: o Connect é outro processo e vai cair
   * algum dia. Uma tela de erro do Next no lugar do cronograma não diz à
   * pessoa se o problema é dela, e ela tenta de novo a tarde inteira.
   */
  | { ok: false; motivo: string };

/**
 * Quanto tempo a resposta fica guardada.
 *
 * Cinco minutos: o cronograma é planejamento de semanas, então ver uma peça
 * cinco minutos depois de criada não atrapalha ninguém — e sem cache cada
 * carga desta tela viraria uma ida à rede e uma consulta no banco do Connect.
 */
const CACHE_SEGUNDOS = 300;
const TIMEOUT_MS = 8_000;

/**
 * A busca crua, sem cache. Separada para o `unstable_cache` abaixo poder
 * envolvê-la: o cache de `fetch` do Next chaveia pelos CABEÇALHOS, e os nossos
 * carregam o timestamp da assinatura — que muda a cada chamada. Com ele, todo
 * pedido seria um erro de cache.
 */
async function buscar(de: string, ate: string): Promise<RespostaDoCronograma> {
  const env = integrationEnv();
  if (!env) return { ok: false, motivo: "Integração com o Build.Connect não configurada." };

  const caminho = `/api/integracao/flow/cronograma?de=${de}&ate=${ate}`;
  const timestamp = Date.now();
  const controlador = new AbortController();
  const alarme = setTimeout(() => controlador.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${env.webhookUrl}${caminho}`, {
      headers: {
        "x-flow-timestamp": String(timestamp),
        // ASSINA O CAMINHO+QUERY: um GET não tem corpo, e assinar algo fixo
        // faria uma assinatura capturada valer para qualquer rota e recorte.
        // O Connect refaz exatamente esta conta.
        "x-flow-signature": signWebhook(env.webhookSecret, timestamp, caminho),
      },
      signal: controlador.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[cronograma] Connect respondeu ${res.status}`);
      return {
        ok: false,
        motivo:
          res.status === 401
            ? "O Build.Connect recusou a credencial desta integração."
            : "O Build.Connect não respondeu como esperado.",
      };
    }
    const dados = (await res.json()) as { posts?: unknown; truncado?: unknown };
    // O corpo vem de outro serviço: um formato inesperado não pode virar
    // `.map is not a function` no meio da renderização.
    if (!Array.isArray(dados.posts)) {
      return { ok: false, motivo: "O Build.Connect devolveu um formato inesperado." };
    }
    return {
      ok: true,
      posts: dados.posts as PostDoCronograma[],
      truncado: dados.truncado === true,
    };
  } catch (err) {
    const abortou = err instanceof Error && err.name === "AbortError";
    console.error("[cronograma] falha ao consultar o Connect:", err);
    return {
      ok: false,
      motivo: abortou
        ? "O Build.Connect demorou demais para responder."
        : "Não foi possível falar com o Build.Connect.",
    };
  } finally {
    clearTimeout(alarme);
  }
}

/** A busca com cache curto. É esta que a tela chama. */
export const buscarCronograma = unstable_cache(buscar, ["connect-cronograma"], {
  revalidate: CACHE_SEGUNDOS,
});
