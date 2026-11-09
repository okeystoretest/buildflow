// Checagem da assinatura do webhook e da comparacao do token de servico.
// Rodar com: npx tsx scripts/checks/integration-signature.ts
import { createHmac } from "node:crypto";
import {
  caminhoDoArquivoDaVitrine,
  signWebhook,
  safeEqual,
  verifyBearer,
} from "../../src/lib/integration/signature";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

const secret = "segredo-de-teste";
const ts = 1757937600000;
const body = JSON.stringify({ connectId: "abc", status: "EM_ROTA" });
const esperado = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
check("assinatura = HMAC(ts.body)", signWebhook(secret, ts, body), esperado);
check("assinatura muda com o corpo", signWebhook(secret, ts, body + " ") === esperado, false);
check("assinatura muda com o timestamp", signWebhook(secret, ts + 1, body) === esperado, false);

check("safeEqual iguais", safeEqual("abc", "abc"), true);
check("safeEqual diferentes", safeEqual("abc", "abd"), false);
check("safeEqual tamanhos diferentes", safeEqual("abc", "abcd"), false);
check("safeEqual vazio", safeEqual("", ""), true);

check("bearer correto", verifyBearer("Bearer tok-123", "tok-123"), true);
check("bearer errado", verifyBearer("Bearer tok-999", "tok-123"), false);
check("bearer sem prefixo", verifyBearer("tok-123", "tok-123"), false);
check("bearer ausente", verifyBearer(null, "tok-123"), false);
check("bearer com esperado vazio nunca passa", verifyBearer("Bearer ", ""), false);

// --- caminho assinado da rota de arquivo da vitrine -------------------------
//
// O Connect assina/verifica sobre `url.pathname + url.search` do pedido que
// chegou. Se o que assinamos não for IDENTICAMENTE o que ele reconstrói, todo
// arquivo da vitrine responde 401 — e o log só diz "assinatura inválida", sem
// apontar a diferença. Esta checagem compara as duas contas.
const caminhoArquivo = caminhoDoArquivoDaVitrine("documento", "ckx1abc");
check(
  "caminho assinado tem query estável",
  caminhoArquivo,
  "/api/integracao/flow/vitrine/arquivo?tipo=documento&id=ckx1abc",
);
const comoOConnectVe = new URL(`http://buildconnect:3000${caminhoArquivo}`);
check(
  "o Connect reconstrói exatamente o que foi assinado",
  comoOConnectVe.pathname + comoOConnectVe.search,
  caminhoArquivo,
);
// Id com caractere que precisa de escape continua batendo nas duas pontas.
const caminhoEscapado = caminhoDoArquivoDaVitrine("foto", "a b/c");
const escapadoComoOConnectVe = new URL(`http://buildconnect:3000${caminhoEscapado}`);
check(
  "id que precisa de escape bate nas duas pontas",
  escapadoComoOConnectVe.pathname + escapadoComoOConnectVe.search,
  caminhoEscapado,
);
check(
  "o tipo pedido entra na assinatura",
  signWebhook(secret, ts, caminhoDoArquivoDaVitrine("foto", "ckx1abc")) ===
    signWebhook(secret, ts, caminhoDoArquivoDaVitrine("documento", "ckx1abc")),
  false,
);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("integration-signature: OK");
