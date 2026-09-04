// Checagem do round-trip BufferJSON do store de sessao do WhatsApp.
// Rodar com: npx tsx scripts/checks/whatsapp-auth-store.ts
//
// Nao toca no banco: exercita apenas a serializacao, que e onde um erro
// silencioso quebraria a sessao horas depois, na hora de enviar.
import { serializeAuthValue, deserializeAuthValue } from "../../src/lib/whatsapp/auth-store";

let falhas = 0;
function check(nome: string, cond: boolean) {
  if (!cond) { falhas++; console.log(`FALHOU ${nome}`); }
}

// Buffer sobrevive ao round-trip como Buffer, com o mesmo conteudo.
const buf = Buffer.from([1, 2, 3, 250, 255]);
const voltaBuf = deserializeAuthValue<Buffer>(serializeAuthValue(buf));
check("Buffer continua Buffer", Buffer.isBuffer(voltaBuf));
check("Buffer preserva bytes", Buffer.compare(buf, voltaBuf) === 0);

// Uint8Array aninhado dentro de objeto (formato real das chaves Signal).
const par = { public: new Uint8Array([9, 8, 7]), private: new Uint8Array([1, 0, 255]) };
const voltaPar = deserializeAuthValue<{ public: Uint8Array; private: Uint8Array }>(
  serializeAuthValue(par),
);
check("public preserva bytes", Buffer.compare(Buffer.from(par.public), Buffer.from(voltaPar.public)) === 0);
check("private preserva bytes", Buffer.compare(Buffer.from(par.private), Buffer.from(voltaPar.private)) === 0);

// Estrutura mista, como as creds reais.
const creds = {
  registrationId: 42,
  advSecretKey: "abc",
  registered: false,
  noiseKey: { public: new Uint8Array([1, 2]), private: new Uint8Array([3, 4]) },
  processedHistoryMessages: [],
  me: undefined,
};
const voltaCreds = deserializeAuthValue<typeof creds>(serializeAuthValue(creds));
check("escalares preservados", voltaCreds.registrationId === 42 && voltaCreds.advSecretKey === "abc");
check("booleano preservado", voltaCreds.registered === false);
check("array vazio preservado", Array.isArray(voltaCreds.processedHistoryMessages));
check("chave aninhada preservada",
  Buffer.compare(Buffer.from(creds.noiseKey.public), Buffer.from(voltaCreds.noiseKey.public)) === 0);

// Regressao: JSON.stringify puro NAO preserva Buffer — e o motivo do BufferJSON.
const ingenuo = JSON.parse(JSON.stringify(buf));
check("JSON puro realmente perde o Buffer", !Buffer.isBuffer(ingenuo));

console.log(falhas === 0 ? "OK: whatsapp-auth-store" : `${falhas} falha(s) em whatsapp-auth-store`);
process.exit(falhas === 0 ? 0 : 1);
