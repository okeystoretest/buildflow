import { unstable_cache } from "next/cache";
import { caminhoDoArquivoDaVitrine, signWebhook } from "./signature";
import { integrationEnv } from "./connect-auth";

/**
 * VITRINE — o acervo de fotos, vídeos e documentos do Build.Connect.
 *
 * Mesma arquitetura do cronograma ao lado, e de propósito: LÊ AO VIVO, SEM
 * CÓPIA NO BANCO. Uma tabela espelho aqui criaria uma SEGUNDA verdade sobre o
 * acervo, e descobrir qual das duas está certa custa mais que a tela inteira.
 * O preço é depender do Connect estar de pé; o cache curto abaixo cobre a
 * oscilação.
 *
 * SÓ LEITURA: nada nesta tela escreve no Connect. A vitrine é mantida lá.
 *
 * O ARQUIVO ATRAVESSA, POR ID E SÓ DE VITRINE (pedido de 09/11/2026: baixar e
 * assistir aqui). Antes não atravessava, e a razão era boa: `/uploads/...` do
 * Connect é servido por caminho, atrás da sessão de lá, e um proxy por caminho
 * daqui teria a superfície do disco inteiro — comprovante, documentação
 * pessoal, evidência de denúncia.
 *
 * O que mudou foi a FORMA do pedido, não o rigor. A rota do Connect
 * (`flow/vitrine/arquivo`) aceita ID DE ITEM e exige `subsector.kind: VITRINE`
 * na própria consulta: o caminho vem do banco, nunca do cliente, e o alcance
 * desta integração é exatamente o que a listagem já mostra — nada mais.
 *
 * A DIVISÃO DE PORTÕES, que é o que sustenta isso: o Connect garante o ESCOPO
 * (só vitrine, só item existente) e o Flow garante QUEM (sessão e papel, na
 * rota `api/vendas/vitrine/arquivo`). Nenhuma regra de papel foi
 * copiada para cá — duas cópias, uma em cada repositório, divergiriam na
 * primeira mudança.
 */

/** Uma foto da vitrine. */
export interface FotoDaVitrine {
  id: string;
  title: string;
  /** Nulos fora da vitrine e no que foi enviado antes do recurso. */
  temporada: string | null;
  colecao: string | null;
  /**
   * Extensão REAL do arquivo ("jpg", "mp4"), vazia quando não há arquivo.
   *
   * Vem do Connect porque só lá existe: o `kind` é CATEGORIA e mente sobre o
   * formato — um .jpg é cadastrado como `PNG`. Quem nomeia o download é esta
   * tela, e um JPEG chamado ".png" é um download quebrado em silêncio.
   */
  extensao: string;
  /** ISO. Vem como texto do JSON — quem formata é a tela. */
  createdAt: string;
}

/** Um vídeo da vitrine. Sem transcrição nem progresso (não atravessam). */
export interface VideoDaVitrine {
  id: string;
  title: string;
  kind: string;
  isNew: boolean;
  tags: string[];
  temporada: string | null;
  colecao: string | null;
  /**
   * SE EXISTE arquivo, não onde ele está. Falso no vídeo cadastrado sem mídia:
   * a tela mostra o item sem oferecer um player que não tocaria.
   */
  temArquivo: boolean;
  temMiniatura: boolean;
  /**
   * Extensão REAL do arquivo ("jpg", "mp4"), vazia quando não há arquivo.
   *
   * Vem do Connect porque só lá existe: o `kind` é CATEGORIA e mente sobre o
   * formato — um .jpg é cadastrado como `PNG`. Quem nomeia o download é esta
   * tela, e um JPEG chamado ".png" é um download quebrado em silêncio.
   */
  extensao: string;
  createdAt: string;
}

/** Um documento da vitrine. */
export interface DocumentoDaVitrine {
  id: string;
  name: string;
  kind: string;
  sizeBytes: number;
  tags: string[];
  temporada: string | null;
  colecao: string | null;
  /**
   * Extensão REAL do arquivo ("jpg", "mp4"), vazia quando não há arquivo.
   *
   * Vem do Connect porque só lá existe: o `kind` é CATEGORIA e mente sobre o
   * formato — um .jpg é cadastrado como `PNG`. Quem nomeia o download é esta
   * tela, e um JPEG chamado ".png" é um download quebrado em silêncio.
   */
  extensao: string;
  createdAt: string;
}

/** Uma vitrine (um subsetor `kind: VITRINE` do Connect) e o acervo dela. */
export interface Vitrine {
  /** Slug do subsetor no Connect — monta o link de volta. */
  slug: string;
  label: string;
  setor: string;
  fotos: FotoDaVitrine[];
  videos: VideoDaVitrine[];
  documentos: DocumentoDaVitrine[];
  truncado: boolean;
}

export type RespostaDaVitrine =
  | { ok: true; vitrines: Vitrine[] }
  /**
   * FALHA COM MOTIVO, nunca exceção: o Connect é outro processo e vai cair
   * algum dia. Uma tela de erro do Next no lugar da vitrine não diz à pessoa se
   * o problema é dela, e ela tenta de novo a tarde inteira.
   */
  | { ok: false; motivo: string };

/**
 * Quanto tempo a resposta fica guardada.
 *
 * Cinco minutos, igual ao cronograma: o acervo muda quando alguém publica
 * material novo, o que não acontece de minuto a minuto — e sem cache cada carga
 * desta tela viraria uma ida à rede e três consultas no banco do Connect.
 */
const CACHE_SEGUNDOS = 300;
const TIMEOUT_MS = 8_000;

/**
 * A busca crua, sem cache. Separada para o `unstable_cache` abaixo poder
 * envolvê-la: o cache de `fetch` do Next chaveia pelos CABEÇALHOS, e os nossos
 * carregam o timestamp da assinatura — que muda a cada chamada. Com ele, todo
 * pedido seria um erro de cache.
 */
async function buscar(): Promise<RespostaDaVitrine> {
  const env = integrationEnv();
  if (!env) return { ok: false, motivo: "Integração com o Build.Connect não configurada." };

  const caminho = "/api/integracao/flow/vitrine";
  const timestamp = Date.now();
  const controlador = new AbortController();
  const alarme = setTimeout(() => controlador.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${env.webhookUrl}${caminho}`, {
      headers: {
        "x-flow-timestamp": String(timestamp),
        // ASSINA O CAMINHO: um GET não tem corpo, e assinar algo fixo faria uma
        // assinatura capturada valer para qualquer rota. O Connect refaz
        // exatamente esta conta.
        "x-flow-signature": signWebhook(env.webhookSecret, timestamp, caminho),
      },
      signal: controlador.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[vitrine] Connect respondeu ${res.status}`);
      return {
        ok: false,
        motivo:
          res.status === 401
            ? "O Build.Connect recusou a credencial desta integração."
            : "O Build.Connect não respondeu como esperado.",
      };
    }
    const dados = (await res.json()) as { vitrines?: unknown };
    // O corpo vem de outro serviço: um formato inesperado não pode virar
    // `.map is not a function` no meio da renderização.
    if (!Array.isArray(dados.vitrines)) {
      return { ok: false, motivo: "O Build.Connect devolveu um formato inesperado." };
    }
    return { ok: true, vitrines: dados.vitrines as Vitrine[] };
  } catch (err) {
    const abortou = err instanceof Error && err.name === "AbortError";
    console.error("[vitrine] falha ao consultar o Connect:", err);
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
export const buscarVitrine = unstable_cache(buscar, ["connect-vitrine"], {
  revalidate: CACHE_SEGUNDOS,
});

/**
 * O link para a vitrine no Connect, onde o arquivo abre.
 *
 * Base do próprio `CONNECT_WEBHOOK_URL`: um segundo endereço configurável para
 * o mesmo serviço divergiria do primeiro na próxima mudança de porta — foi
 * exatamente o que aconteceu com a 3001 em 05/11/2026. Devolve `null` sem
 * configuração, e a tela esconde o link em vez de oferecer um href quebrado.
 */
export function linkDaVitrine(slug: string): string | null {
  const env = integrationEnv();
  return env ? `${env.webhookUrl}/setores/${encodeURIComponent(slug)}` : null;
}

/** O que a rota de arquivo do Connect sabe servir. */
export type TipoDeArquivoDaVitrine = "foto" | "video" | "miniatura" | "documento";

/**
 * Os bytes de um item, do Connect. Devolve a resposta CRUA para quem chama
 * repassar — a rota daqui é um cano, e materializar um vídeo de 300 MB em
 * memória para depois reenviá-lo derrubaria o processo em dois acessos.
 *
 * SEM O TIMEOUT DA LISTAGEM, de propósito: oito segundos cortariam o filme no
 * meio. O que protege aqui é o Range (o navegador pede trechos) e o fato de o
 * Connect estar na rede interna.
 *
 * `null` quando a integração não está configurada — a rota devolve 503, igual
 * à listagem.
 */
export async function buscarArquivoDaVitrine(
  tipo: TipoDeArquivoDaVitrine,
  id: string,
  range: string | null,
): Promise<Response | null> {
  const env = integrationEnv();
  if (!env) return null;

  // Montado no módulo puro ao lado: a query entra na assinatura, e a checagem
  // confere lá que o que assinamos é exatamente o que o Connect reconstrói.
  const caminho = caminhoDoArquivoDaVitrine(tipo, id);
  const timestamp = Date.now();

  return fetch(`${env.webhookUrl}${caminho}`, {
    headers: {
      "x-flow-timestamp": String(timestamp),
      "x-flow-signature": signWebhook(env.webhookSecret, timestamp, caminho),
      // Repassado para o vídeo tocar com seek em vez de baixar inteiro antes
      // do primeiro frame.
      ...(range ? { range } : {}),
    },
    cache: "no-store",
  });
}
