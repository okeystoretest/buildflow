// Checagem da atribuição de lead por link de indicação.
// Rodar com: npx tsx scripts/checks/wholesale-referral.ts
//
// O que está em jogo: esta função decide de quem é a lojista que acabou de se
// cadastrar. Errar para o lado permissivo entrega lead a quem não pode mais
// receber (vendedora desativada, ou que virou VAREJO depois de o link
// circular); errar para o lado restritivo descarta candidata real.
import {
  generateReferralCode,
  isWellFormedReferralCode,
  resolveReferral,
  buildReferralLink,
  REFERRAL_CODE_LENGTH,
  type ReferralCandidate,
} from "../../src/lib/wholesale-referral";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

const apta: ReferralCandidate = {
  id: "u-apta",
  referralCode: "ABCDEFGH23",
  role: "VENDAS",
  salesModel: "ATACADO",
  active: true,
};

check("vendedora de atacado ativa recebe o lead", resolveReferral("ABCDEFGH23", [apta]), "u-apta");

// --- Review Focus 3: o link já circulou; a pessoa mudou depois ---
check(
  "vendedora desativada: lead fica sem dono",
  resolveReferral("ABCDEFGH23", [{ ...apta, active: false }]),
  null,
);
check(
  "virou VAREJO depois: lead fica sem dono",
  resolveReferral("ABCDEFGH23", [{ ...apta, salesModel: "VAREJO" }]),
  null,
);
check(
  "mudou de perfil para LOGISTICA: lead fica sem dono",
  resolveReferral("ABCDEFGH23", [{ ...apta, role: "LOGISTICA" }]),
  null,
);
check(
  "GESTAO não é destino de indicação",
  resolveReferral("ABCDEFGH23", [{ ...apta, role: "GESTAO", salesModel: null }]),
  null,
);

// --- ausência e lixo nunca viram erro: viram lead sem dono (decisão 14) ---
check("código ausente", resolveReferral(null, [apta]), null);
check("código vazio", resolveReferral("", [apta]), null);
check("código inexistente", resolveReferral("ZZZZZZZZ99", [apta]), null);
check("código malformado", resolveReferral("abc", [apta]), null);
check("lista vazia", resolveReferral("ABCDEFGH23", []), null);

// Casamento é EXATO: minúscula não casa, para não existirem dois códigos que
// levam ao mesmo lugar por caminhos diferentes.
check("minúscula não casa", resolveReferral("abcdefgh23", [apta]), null);

// --- formato ---
const gerado = generateReferralCode();
check("código gerado tem o tamanho do contrato", gerado.length, REFERRAL_CODE_LENGTH);
check("código gerado é bem-formado", isWellFormedReferralCode(gerado), true);
check("sem caracteres ambíguos", /[ILOU]/.test(gerado), false);
check("dois códigos gerados diferem", generateReferralCode() === generateReferralCode(), false);

// --- link ---
check(
  "link da OKEY",
  buildReferralLink("https://flow.exemplo.com", "OKEY", "ABCDEFGH23"),
  "https://flow.exemplo.com/atacado/okey?r=ABCDEFGH23",
);
check(
  "link do Lov Club usa o slug com hífen",
  buildReferralLink("https://flow.exemplo.com", "LOV_CLUB", "ABCDEFGH23"),
  "https://flow.exemplo.com/atacado/lov-club?r=ABCDEFGH23",
);
// Barra sobrando na base não pode gerar "//atacado".
check(
  "barra final na base é absorvida",
  buildReferralLink("https://flow.exemplo.com/", "OKEY", "ABCDEFGH23"),
  "https://flow.exemplo.com/atacado/okey?r=ABCDEFGH23",
);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("wholesale-referral: todas as checagens passaram.");
