// Checagem da validação do formulário público de atacado.
// Rodar com: npx tsx scripts/checks/wholesale-apply-validation.ts
//
// O que está em jogo: é a ÚNICA porta de escrita sem sessão deste sistema.
// Tudo que passa daqui vira linha no banco e arquivo no disco. Campo
// obrigatório que escapa produz cadastro incompleto para a analista; "Outro"
// sem texto produz resposta que não informa nada.
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  validateApplyPayload,
  UF_LIST,
  ROTULOS_DE_CAMPO,
} from "../../src/lib/wholesale-apply-validation";

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
// Contagem nao e assercao: 27 copias de "AC" passariam no teste acima.
check("27 UFs DISTINTAS", new Set(UF_LIST).size, 27);
check(
  "UF_LIST tem as siglas certas (amostra)",
  ["CE", "SP", "DF", "TO", "RS"].filter((uf) => !(UF_LIST as readonly string[]).includes(uf)),
  [],
);

const ok = validateApplyPayload(valido);
check("payload completo passa", "ok" in ok, true);
if ("ok" in ok) {
  check("telefone normalizado para dígitos", ok.clean.phone, "85988887777");
  check("CNPJ normalizado para dígitos", ok.clean.cnpj, "11222333000181");
  check("arroba removida do Instagram", ok.clean.instagram, "lojadaana");
  check("wantsVisit vira booleano", ok.clean.wantsVisit, true);
  // Loja física pede foto do espaço (decisão 21).
  check("tipo de imagem pedido", ok.clean.storeImageKind, "ESPACO_FISICO");
  // A metade `null` dos dois campos `string | null`: fora de "Outro" o texto
  // nao e so ignorado, ele e gravado como null.
  check("serviceModelOther fora de OUTRO vira null", ok.clean.serviceModelOther, null);
  check("foundUsOther fora de OUTRO vira null", ok.clean.foundUsOther, null);
}

// "Outro" escolhido: o texto e MANTIDO nos dois campos.
const comOutro = validateApplyPayload({
  ...valido,
  serviceModel: "OUTRO",
  serviceModelOther: "Showroom",
  foundUs: "OUTRO",
  foundUsOther: "Amiga indicou",
});
check("serviceModelOther em OUTRO e mantido", "ok" in comOutro && comOutro.clean.serviceModelOther, "Showroom");
check("foundUsOther em OUTRO e mantido", "ok" in comOutro && comOutro.clean.foundUsOther, "Amiga indicou");

const semVisita = validateApplyPayload({ ...valido, wantsVisit: "nao" });
check("wantsVisit nao vira false", "ok" in semVisita && semVisita.clean.wantsVisit, false);

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
// Teto exato: 120 passa, 121 nao. O limite tem de recusar quando excedido, e
// nao apenas existir na tabela.
check("nome de 120: passa", "ok" in validateApplyPayload({ ...valido, contactName: "a".repeat(120) }), true);
check("nome de 121: recusa", "error" in validateApplyPayload({ ...valido, contactName: "a".repeat(121) }), true);
// O teto de 200 do texto de "Outro", onde ele e pedido.
check(
  "texto de OUTRO de 200: passa",
  "ok" in validateApplyPayload({ ...valido, serviceModel: "OUTRO", serviceModelOther: "o".repeat(200) }),
  true,
);
check(
  "texto de OUTRO de 201: recusa",
  "error" in validateApplyPayload({ ...valido, serviceModel: "OUTRO", serviceModelOther: "o".repeat(201) }),
  true,
);

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

// --- Instagram: gramatica real, e a URL que a lojista cola de verdade -------
// Antes o campo tinha teto de tamanho e remocao do "@", e nada mais: "minhaloja/"
// e uma quebra de linha eram gravados como se fossem handle. Sem XSS hoje (os
// dois renders sao texto JSX, que o React escapa), mas a exposicao e a proxima
// pessoa que montar `https://instagram.com/${lead.instagram}` e herdar barra,
// "?" ou newline. A gramatica fecha isso — e a normalizacao existe para que
// fechar nao transforme "Copiar link do perfil" (o que o celular entrega) numa
// recusa para quem fez o certo.
for (const [nome, entrada, esperado] of [
  ["handle puro", "lojadaana", "lojadaana"],
  ["com arroba", "@lojadaana", "lojadaana"],
  ["URL completa com barra final", "https://www.instagram.com/lojadaana/", "lojadaana"],
  ["URL sem www", "https://instagram.com/lojadaana", "lojadaana"],
  ["URL sem esquema", "instagram.com/lojadaana/", "lojadaana"],
  ["URL com query", "https://www.instagram.com/lojadaana/?hl=pt-br", "lojadaana"],
  ["ponto e sublinhado sao validos", "loja.da_ana", "loja.da_ana"],
] as const) {
  const r = validateApplyPayload({ ...valido, instagram: entrada });
  check(`instagram aceito (${nome})`, "ok" in r, true);
  if ("ok" in r) check(`instagram normalizado (${nome})`, r.clean.instagram, esperado);
}

for (const [nome, entrada] of [
  ["so a arroba", "@"],
  ["vazio depois de normalizar", "https://www.instagram.com/"],
  ["com espaco", "loja da ana"],
  ["com barra no meio", "loja/ana"],
  ["com newline", "lojadaana\nmais"],
  ["com caractere de marcacao", "<script>"],
  ["acima de 30 caracteres", "a".repeat(31)],
] as const) {
  const r = validateApplyPayload({ ...valido, instagram: entrada });
  check(`instagram recusado (${nome})`, "error" in r, true);
}

// --- o rotulo do erro existe na TELA ---------------------------------------
// Por que ler o TSX como texto: o servidor recusa campo por campo e NOMEIA o
// campo na mensagem. Enquanto os nomes eram internos ("Nome completo", "Tempo de
// mercado"), a lojista lia uma instrucao para preencher um campo que a pagina
// nao tem — a tela pergunta "Como podemos te chamar?". Nenhum tipo pega isso: as
// duas pontas sao strings e compilam divergentes. Entao a checagem le o
// `rotulo=` de cada campo no formulario e compara.
//
// Normalizacao: a tela acrescenta afordancia visual que nao e nome do campo —
// dois-pontos no fim e o "(@)" do Instagram. Os dois lados passam pela MESMA
// normalizacao, senao a checagem estaria testando pontuacao.
const formulario = readFileSync(
  path.resolve(__dirname, "../../src/app/atacado/[marca]/apply-form.tsx"),
  "utf8",
);

function normalizarRotulo(s: string): string {
  return s.replace(/\s*\(@\)\s*$/, "").replace(/\s*:\s*$/, "").trim();
}

// Procedural, e nao um regex unico: com alternancia, o motor casa na posicao
// mais A ESQUERDA que satisfaz QUALQUER alternativa, entao `rotulo=...campo="X"`
// casava o rotulo do bloco ANTERIOR e a checagem acusava divergencia falsa.
// Aqui o campo e ancora e a busca nao atravessa outro `campo="`.
function rotuloNaTela(campo: string): string | null {
  const ancora = formulario.indexOf(`campo="${campo}"`);
  if (ancora < 0) return null;
  const inicio = ancora + `campo="${campo}"`.length;
  // Só até o próximo `campo="`, para nunca pegar o rótulo do bloco seguinte.
  const proximo = formulario.indexOf('campo="', inicio);
  const fim = proximo < 0 ? formulario.length : proximo;
  const achado = /rotulo="([^"]*)"/.exec(formulario.slice(inicio, fim));
  return achado ? normalizarRotulo(achado[1]) : null;
}

for (const [campo, rotulo] of Object.entries(ROTULOS_DE_CAMPO)) {
  const naTela = rotuloNaTela(campo);
  check(`rotulo de ${campo} existe no formulario`, naTela !== null, true);
  check(`rotulo de ${campo} casa com a tela`, naTela, normalizarRotulo(rotulo));
}

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("wholesale-apply-validation: todas as checagens passaram.");
