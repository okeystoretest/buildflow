// Conteudo das mensagens JA ENVIADAS, guardado para responder a pedido de
// reenvio.
//
// POR QUE ISTO EXISTE: quando o aparelho do destinatario recebe o pacote mas
// nao consegue descriptografa-lo, ele exibe "Aguardando mensagem. Essa acao
// pode levar alguns instantes." e devolve um RETRY RECEIPT pedindo o reenvio.
// O Baileys atende esse pedido em sendMessagesAgain, que busca o conteudo
// original chamando a opcao `getMessage` — e o padrao dela e devolver
// undefined. Sem nada para reenviar, o Baileys apenas registra "recv retry
// request, but message not available" e o placeholder fica na tela do
// destinatario PARA SEMPRE.
//
// A falha inicial de descriptografia nao e anomalia: e o conhecido "first
// message decryption failure", que o proprio Baileys comenta ao forcar sessao
// nova no retry. O protocolo conta com o reenvio para resolve-la — quem nao
// implementa getMessage simplesmente nao entrega.

import type { proto } from "@whiskeysockets/baileys";

/** Conteudo de uma mensagem, do jeito que o Baileys reenvia. */
export type ConteudoMensagem = proto.IMessage;

/** Texto exato definido pelo produto. */
export const MENSAGEM_NOVO_PACOTE =
  "Novo pacote disponível para entrega!\n" +
  "Acesse https://buildflowapp.com.br/login para mais informações.";

/**
 * Conteudo que o Baileys gera para `{ text }` sem preview de link — o formato
 * exato produzido por generateWAMessageContent (`m.extendedTextMessage =
 * { text }`), verificado na versao 6.17.16.
 *
 * Serve de ultimo recurso: o pedido de reenvio pode chegar depois de um
 * redeploy, quando a memoria do processo anterior ja se foi. Como este sistema
 * envia UMA mensagem so, sempre com o mesmo texto, reconstrui-la e correto —
 * e muito melhor que deixar o motorista com o placeholder na tela.
 */
export function conteudoPadrao(): ConteudoMensagem {
  return { extendedTextMessage: { text: MENSAGEM_NOVO_PACOTE } };
}

/** Quantas mensagens ficam guardadas. Envio e para dezenas de motoristas. */
const LIMITE_PADRAO = 500;

/**
 * Por quanto tempo. O retry receipt chega em segundos; 10 minutos cobrem com
 * folga uma oscilacao de rede sem a memoria crescer sem limite.
 */
const TTL_PADRAO_MS = 10 * 60_000;

export interface Outbox {
  /** Guarda o conteudo enviado, indexado pelo id da mensagem. */
  lembrar(id: string, conteudo: ConteudoMensagem): void;
  /** Devolve o conteudo, ou undefined se nunca foi guardado ou ja venceu. */
  recuperar(id: string): ConteudoMensagem | undefined;
  /** Quantas entradas vivas existem. Usado nas checagens. */
  tamanho(): number;
}

/**
 * Cria um outbox independente. O relogio entra por parametro para a checagem
 * poder testar o vencimento sem esperar de verdade.
 */
export function criarOutbox(opts?: {
  limite?: number;
  ttlMs?: number;
  agora?: () => number;
}): Outbox {
  const limite = opts?.limite ?? LIMITE_PADRAO;
  const ttlMs = opts?.ttlMs ?? TTL_PADRAO_MS;
  const agora = opts?.agora ?? Date.now;

  // Map preserva a ordem de insercao: a primeira chave e sempre a mais antiga,
  // que e a que sai quando o limite estoura.
  const itens = new Map<string, { conteudo: ConteudoMensagem; em: number }>();

  function limpar(): void {
    const corte = agora() - ttlMs;
    for (const [id, item] of itens) {
      // A ordem de insercao e crescente no tempo: ao achar a primeira entrada
      // ainda viva, todas as seguintes tambem estao.
      if (item.em > corte) break;
      itens.delete(id);
    }
  }

  return {
    lembrar(id, conteudo) {
      if (!id) return;
      limpar();
      // Regravar move a entrada para o fim da ordem, e nao para o lugar antigo.
      itens.delete(id);
      itens.set(id, { conteudo, em: agora() });
      while (itens.size > limite) {
        const maisAntigo = itens.keys().next().value;
        if (maisAntigo === undefined) break;
        itens.delete(maisAntigo);
      }
    },
    recuperar(id) {
      const item = itens.get(id);
      if (!item) return undefined;
      if (item.em <= agora() - ttlMs) {
        itens.delete(id);
        return undefined;
      }
      return item.conteudo;
    },
    tamanho() {
      limpar();
      return itens.size;
    },
  };
}

// Instancia unica do processo, no globalThis pelo mesmo motivo do
// runtime-state.ts: o Next compila este arquivo em mais de um bundle, e um
// `let` de modulo viraria N caches independentes — o envio guardaria num e o
// getMessage leria outro, sempre vazio.
const CHAVE = Symbol.for("buildflow.whatsapp.outbox");

type Portador = { [CHAVE]?: Outbox };

export function getOutbox(): Outbox {
  const portador = globalThis as unknown as Portador;
  portador[CHAVE] ??= criarOutbox();
  return portador[CHAVE];
}
