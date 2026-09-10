// Checagem do outbox de mensagens enviadas.
// Rodar com: npx tsx scripts/checks/whatsapp-outbox.ts
//
// O que esta em jogo: sem o conteudo guardado aqui, o Baileys nao consegue
// atender o pedido de reenvio do aparelho que falhou em descriptografar, e o
// destinatario fica com "Aguardando mensagem" na tela para sempre.
import {
  criarOutbox,
  conteudoPadrao,
  MENSAGEM_NOVO_PACOTE,
  type ConteudoMensagem,
} from "../../src/lib/whatsapp/outbox";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

const texto = (t: string): ConteudoMensagem => ({ extendedTextMessage: { text: t } });

// --- guardar e recuperar ---
{
  const o = criarOutbox();
  o.lembrar("A", texto("um"));
  check("recupera o que guardou", o.recuperar("A"), texto("um"));
  check("id desconhecido nao inventa conteudo", o.recuperar("B"), undefined);
  check("tamanho conta as entradas vivas", o.tamanho(), 1);
}

// --- id vazio nao entra ---
{
  const o = criarOutbox();
  o.lembrar("", texto("um"));
  check("id vazio e ignorado", o.tamanho(), 0);
}

// --- vencimento: relogio controlado, sem esperar de verdade ---
{
  let agora = 1_000;
  const o = criarOutbox({ ttlMs: 100, agora: () => agora });
  o.lembrar("A", texto("um"));
  agora = 1_099;
  check("dentro do prazo continua disponivel", o.recuperar("A"), texto("um"));
  agora = 1_100;
  check("no limite ja venceu", o.recuperar("A"), undefined);
  check("entrada vencida sai da contagem", o.tamanho(), 0);
}

// --- limite: a mais antiga sai, as recentes ficam ---
{
  let agora = 0;
  const o = criarOutbox({ limite: 2, agora: () => agora++ });
  o.lembrar("A", texto("a"));
  o.lembrar("B", texto("b"));
  o.lembrar("C", texto("c"));
  check("limite respeitado", o.tamanho(), 2);
  check("mais antiga descartada", o.recuperar("A"), undefined);
  check("B mantida", o.recuperar("B"), texto("b"));
  check("C mantida", o.recuperar("C"), texto("c"));
}

// --- regravar o mesmo id renova a posicao, nao ocupa duas vagas ---
{
  let agora = 0;
  const o = criarOutbox({ limite: 2, agora: () => agora++ });
  o.lembrar("A", texto("a"));
  o.lembrar("B", texto("b"));
  o.lembrar("A", texto("a2"));
  o.lembrar("C", texto("c"));
  check("regravar nao duplica", o.tamanho(), 2);
  check("A renovada sobrevive", o.recuperar("A"), texto("a2"));
  check("B saiu por ser a mais antiga", o.recuperar("B"), undefined);
}

// --- conteudo padrao: o formato que o Baileys gera para { text } ---
check("padrao usa extendedTextMessage", conteudoPadrao(), texto(MENSAGEM_NOVO_PACOTE));
check(
  "padrao carrega o texto do produto",
  conteudoPadrao().extendedTextMessage?.text,
  MENSAGEM_NOVO_PACOTE,
);

console.log(falhas === 0 ? "OK: whatsapp-outbox" : `${falhas} falha(s) em whatsapp-outbox`);
process.exit(falhas === 0 ? 0 : 1);
