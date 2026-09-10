// Checagem da logica pura do modulo de WhatsApp.
// Rodar com: npx tsx scripts/checks/whatsapp-pure.ts
import {
  toWhatsappJid,
  phoneSuffix,
  nextBackoffDelay,
  isLeaseExpired,
  sendSpacingMs,
  resolveSendJid,
  LEASE_TTL_MS,
} from "../../src/lib/whatsapp/pure";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

// --- toWhatsappJid: prefixa 55 e monta o JID; invalido vira null ---
check("jid celular", toWhatsappJid("11988887777"), "5511988887777@s.whatsapp.net");
check("jid fixo", toWhatsappJid("1133334444"), "551133334444@s.whatsapp.net");
check("jid mascarado", toWhatsappJid("(11) 98888-7777"), "5511988887777@s.whatsapp.net");
check("jid ja com 55", toWhatsappJid("5511988887777"), "5511988887777@s.whatsapp.net");
check("jid null", toWhatsappJid(null), null);
check("jid vazio", toWhatsappJid(""), null);
check("jid curto", toWhatsappJid("11988"), null);
check("jid ddd invalido", toWhatsappJid("01988887777"), null);
check("jid celular sem 9", toWhatsappJid("11888887777"), null);

// --- phoneSuffix: 4 ultimos digitos, nunca o numero inteiro ---
check("sufixo", phoneSuffix("11988887777"), "7777");
check("sufixo mascarado", phoneSuffix("(11) 98888-7777"), "7777");
check("sufixo null", phoneSuffix(null), null);
check("sufixo curto", phoneSuffix("123"), null);

// --- nextBackoffDelay: 2s dobrando ate o teto de 60s, com jitter de ate 20% ---
check("backoff 0 sem jitter", nextBackoffDelay(0, () => 0), 2000);
check("backoff 1 sem jitter", nextBackoffDelay(1, () => 0), 4000);
check("backoff 2 sem jitter", nextBackoffDelay(2, () => 0), 8000);
check("backoff teto", nextBackoffDelay(20, () => 0), 60000);
check("backoff jitter maximo", nextBackoffDelay(0, () => 1), 2400);
// Sem rand explicito continua dentro da faixa.
const b = nextBackoffDelay(3);
check("backoff faixa", b >= 16000 && b <= 19200, true);

// --- isLeaseExpired ---
const agora = new Date("2026-09-04T12:00:00.000Z");
check("concessao inexistente", isLeaseExpired(null, agora), true);
check("concessao fresca", isLeaseExpired(new Date(agora.getTime() - 1000), agora), false);
check("concessao no limite", isLeaseExpired(new Date(agora.getTime() - LEASE_TTL_MS), agora), true);
check("concessao velha", isLeaseExpired(new Date(agora.getTime() - LEASE_TTL_MS - 1), agora), true);
check("concessao futura", isLeaseExpired(new Date(agora.getTime() + 5000), agora), false);

// --- sendSpacingMs: 1s a 10s, sorteado por destinatario ---
// Meio-termo entre espalhar os envios (evitar bloqueio do numero) e avisar todo
// mundo enquanto a corrida pelo pacote ainda existe.
check("espacamento minimo", sendSpacingMs(() => 0), 1_000);
check("espacamento maximo", sendSpacingMs(() => 1), 10_000);
check("espacamento meio", sendSpacingMs(() => 0.5), 5_500);

// --- resolveSendJid: qual JID usar de fato no envio ---
//
// O JID montado por concatenacao (55 + DDD + numero) NAO e necessariamente o
// que o WhatsApp reconhece: numero brasileiro registrado antes do nono digito
// tem JID canonico sem o 9. Mandar para o JID errado nao da erro — o Baileys
// aceita, o log grava ENVIADO e a mensagem nao chega em lugar nenhum. Por isso
// o envio passa a usar o JID que o servidor devolve.
const CONSTRUIDO = "5511988887777@s.whatsapp.net";
const CANONICO = "551188887777@s.whatsapp.net"; // mesmo numero, sem o nono digito

check(
  "jid canonico substitui o construido",
  resolveSendJid(CONSTRUIDO, [{ jid: CANONICO, exists: true }]),
  { kind: "verificado", jid: CANONICO },
);
check(
  "jid confirmado igual ao construido",
  resolveSendJid(CONSTRUIDO, [{ jid: CONSTRUIDO, exists: true }]),
  { kind: "verificado", jid: CONSTRUIDO },
);
// Consulta RESPONDEU e o numero nao esta la: nao tem WhatsApp. Nao pode virar
// "ENVIADO" no log — era exatamente isso que escondia o problema.
check(
  "numero sem whatsapp nao e enviado",
  resolveSendJid(CONSTRUIDO, []),
  { kind: "sem-whatsapp" },
);
check(
  "entrada sem exists conta como ausente",
  resolveSendJid(CONSTRUIDO, [{ jid: CANONICO, exists: false }]),
  { kind: "sem-whatsapp" },
);
// Consulta FALHOU (undefined): cair fora deixaria de avisar por uma oscilacao
// de rede. Segue com o construido, mas marcado como nao verificado.
check(
  "consulta falha cai no construido",
  resolveSendJid(CONSTRUIDO, undefined),
  { kind: "nao-verificado", jid: CONSTRUIDO },
);

console.log(falhas === 0 ? "OK: whatsapp-pure" : `${falhas} falha(s) em whatsapp-pure`);
process.exit(falhas === 0 ? 0 : 1);
