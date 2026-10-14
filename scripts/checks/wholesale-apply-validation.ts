// Checagem da validação do formulário público de atacado.
// Rodar com: npx tsx scripts/checks/wholesale-apply-validation.ts
//
// O que está em jogo: é a ÚNICA porta de escrita sem sessão deste sistema.
// Tudo que passa daqui vira linha no banco e arquivo no disco. Campo
// obrigatório que escapa produz cadastro incompleto para a analista; "Outro"
// sem texto produz resposta que não informa nada.
import { validateApplyPayload, UF_LIST } from "../../src/lib/wholesale-apply-validation";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

const valido = {
  contactName: "Ana Souza",
  email: "ana@exemplo.com",
  phone: "(85) 98888-7777",
  story: "Trabalho com moda há três anos.",
  state: "CE",
  city: "Fortaleza",
  serviceModel: "LOJA_FISICA",
  serviceModelOther: "",
  instagram: "@lojadaana",
  marketTime: "3 anos",
  teamSize: "2",
  brandsCarried: "Marcas regionais",
  foundUs: "INSTAGRAM",
  foundUsOther: "",
  followTime: "6 meses",
  investmentBand: "DE_3_A_5K",
  wantsVisit: "sim",
  cnpj: "11.222.333/0001-81",
};

check("27 UFs", UF_LIST.length, 27);

const ok = validateApplyPayload(valido);
check("payload completo passa", "ok" in ok, true);
if ("ok" in ok) {
  check("telefone normalizado para dígitos", ok.clean.phone, "85988887777");
  check("CNPJ normalizado para dígitos", ok.clean.cnpj, "11222333000181");
  check("arroba removida do Instagram", ok.clean.instagram, "lojadaana");
  check("wantsVisit vira booleano", ok.clean.wantsVisit, true);
  // Loja física pede foto do espaço (decisão 21).
  check("tipo de imagem pedido", ok.clean.storeImageKind, "ESPACO_FISICO");
}

// --- tudo obrigatório (decisão 20) ---
for (const campo of ["contactName", "email", "phone", "story", "city", "marketTime", "teamSize", "brandsCarried", "followTime"]) {
  const r = validateApplyPayload({ ...valido, [campo]: "" });
  check(`campo obrigatório vazio: ${campo}`, "error" in r, true);
}
check("só espaços também é vazio", "error" in validateApplyPayload({ ...valido, city: "   " }), true);

// --- "Outro" exige o texto (decisão 22) ---
check(
  "serviceModel OUTRO sem texto: recusa",
  validateApplyPayload({ ...valido, serviceModel: "OUTRO", serviceModelOther: "" }),
  { error: "Descreva como você atende suas clientes hoje." },
);
check(
  "serviceModel OUTRO com texto: passa",
  "ok" in validateApplyPayload({ ...valido, serviceModel: "OUTRO", serviceModelOther: "Showroom" }),
  true,
);
check(
  "foundUs OUTRO sem texto: recusa",
  validateApplyPayload({ ...valido, foundUs: "OUTRO", foundUsOther: "" }),
  { error: "Conte como você nos encontrou." },
);

// --- decisão 21: loja só online pede print da loja online ---
const online = validateApplyPayload({ ...valido, serviceModel: "LOJA_ONLINE" });
check("loja online pede print da loja online", "ok" in online && online.clean.storeImageKind, "LOJA_ONLINE");
const hibrida = validateApplyPayload({ ...valido, serviceModel: "FISICA_E_ONLINE" });
check("híbrida pede o espaço físico", "ok" in hibrida && hibrida.clean.storeImageKind, "ESPACO_FISICO");
const outro = validateApplyPayload({ ...valido, serviceModel: "OUTRO", serviceModelOther: "Showroom" });
check("OUTRO pede o espaço físico", "ok" in outro && outro.clean.storeImageKind, "ESPACO_FISICO");

// --- campos de valor fechado não aceitam o que o navegador inventar ---
check("UF inexistente: recusa", validateApplyPayload({ ...valido, state: "XX" }), { error: "Escolha o seu estado." });
check("UF minúscula: recusa", validateApplyPayload({ ...valido, state: "ce" }), { error: "Escolha o seu estado." });
check("faixa de investimento inventada: recusa", "error" in validateApplyPayload({ ...valido, investmentBand: "DE_1_A_2K" }), true);
check("serviceModel inventado: recusa", "error" in validateApplyPayload({ ...valido, serviceModel: "FEIRA" }), true);

// --- CNPJ e e-mail ---
check("CNPJ com dígito errado: recusa", validateApplyPayload({ ...valido, cnpj: "11.222.333/0001-82" }), { error: "CNPJ inválido. Confira os números." });
check("e-mail sem arroba: recusa", "error" in validateApplyPayload({ ...valido, email: "ana.exemplo.com" }), true);
check("telefone curto: recusa", "error" in validateApplyPayload({ ...valido, phone: "988" }), true);

// --- tetos de texto: nada de campo livre sem limite numa porta pública ---
check("história gigante: recusa", "error" in validateApplyPayload({ ...valido, story: "x".repeat(5000) }), true);

// --- o objeto inteiro pode não chegar ---
// O cast existe porque quem chama de verdade é um cliente HTTP: o tipo
// `Record<string, string>` é promessa do compilador, não do navegador. Sem
// estas três checagens, a guarda que troca o payload ausente por um vazio não
// tem rede nenhuma, e a próxima refatoração a apaga como código morto.
for (const [nome, entrada] of [
  ["null", null],
  ["undefined", undefined],
  ["não é objeto", "nao sou objeto"],
] as const) {
  let r: unknown;
  let lancou = false;
  try {
    r = validateApplyPayload(entrada as unknown as Record<string, string>);
  } catch {
    lancou = true;
  }
  check(`payload ${nome}: não lança`, lancou, false);
  check(`payload ${nome}: recusa`, typeof r === "object" && r !== null && "error" in r, true);
}

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("wholesale-apply-validation: todas as checagens passaram.");
