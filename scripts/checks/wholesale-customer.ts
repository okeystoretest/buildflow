/**
 * Checagem do cadastro que nasce da aprovação de uma candidatura.
 *
 * O que está em jogo é o CÓDIGO. `Customer.code` é `@unique` e digitado à mão
 * em toda a casa; um código gerado que colida não dá "aviso", dá exceção de
 * unicidade derrubando a aprovação da lojista. E um código que mude entre duas
 * aprovações da mesma empresa cria um segundo cadastro a cada ida e volta, o
 * que divide os pedidos dela em dois clientes sem ninguém perceber.
 *
 * Rodar com: npx tsx scripts/checks/wholesale-customer.ts
 */
import {
  codigoDoClienteDaCandidatura,
  dadosDoClienteDaCandidatura,
} from "../../src/lib/wholesale-customer";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(
      `FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`,
    );
  } else {
    console.log(`ok ${nome}`);
  }
}

// --- o código ---------------------------------------------------------------
check("CNPJ limpo vira AT- + dígitos", codigoDoClienteDaCandidatura("11444777000161"), "AT-11444777000161");
// O CNPJ pode chegar formatado (planilha, formulário antigo): a pontuação não
// pode mudar o código, ou a mesma empresa ganharia dois cadastros.
check("CNPJ formatado dá o MESMO código", codigoDoClienteDaCandidatura("11.444.777/0001-61"), "AT-11444777000161");
check("espaços não mudam o código", codigoDoClienteDaCandidatura("  11444777000161  "), "AT-11444777000161");

// IDEMPOTÊNCIA: é a propriedade que impede o segundo cadastro. Aprovar,
// reprovar e aprovar de novo chega sempre ao mesmo lugar.
check(
  "o mesmo CNPJ dá sempre o mesmo código",
  codigoDoClienteDaCandidatura("11.444.777/0001-61") === codigoDoClienteDaCandidatura("11444777000161"),
  true,
);

// CNPJ incompleto NÃO ganha código inventado: a candidatura é aprovada e fica
// sem cadastro, que é reconciliável depois. Um código derivado de meio CNPJ
// não seria.
check("CNPJ curto não gera código", codigoDoClienteDaCandidatura("1144477700016"), null);
check("CNPJ vazio não gera código", codigoDoClienteDaCandidatura(""), null);
check("texto não gera código", codigoDoClienteDaCandidatura("sem cnpj"), null);
// Dígitos a mais também não: 15 dígitos não é CNPJ, e cortar em 14 inventaria
// uma empresa que ninguém digitou.
check("CNPJ longo não gera código", codigoDoClienteDaCandidatura("114447770001610"), null);

// O prefixo é o que separa o gerado do digitado. Prendê-lo aqui porque mudá-lo
// depois faria toda aprovação futura criar um SEGUNDO cadastro para empresas
// que já têm um.
check(
  "o prefixo é AT-",
  codigoDoClienteDaCandidatura("11444777000161")?.startsWith("AT-"),
  true,
);

// --- os campos --------------------------------------------------------------
const lead = {
  contactName: "  Ana Paula Souza  ",
  city: " Campinas ",
  state: "sp",
  phone: "11988887777",
  email: " ana@lojadaana.com.br ",
};
check("nome e cidade aparados", dadosDoClienteDaCandidatura(lead).name, "Ana Paula Souza");
check("cidade aparada", dadosDoClienteDaCandidatura(lead).city, "Campinas");
// UF em maiúsculas, como `createCustomer` grava: duas caixas diferentes
// quebrariam qualquer filtro por estado.
check("UF em maiúsculas", dadosDoClienteDaCandidatura(lead).state, "SP");
// O telefone vai FORMATADO: a coluna de contato é para ler, e 11 dígitos
// crus numa lista não se leem.
check(
  "contato traz telefone formatado e e-mail",
  dadosDoClienteDaCandidatura(lead).contact,
  "(11) 98888-7777 · ana@lojadaana.com.br",
);
// Candidatura importada pode não ter e-mail: o separador não pode sobrar.
check(
  "sem e-mail, o contato é só o telefone",
  dadosDoClienteDaCandidatura({ ...lead, email: "" }).contact,
  "(11) 98888-7777",
);
check(
  "sem telefone, o contato é só o e-mail",
  dadosDoClienteDaCandidatura({ ...lead, phone: "" }).contact,
  "ana@lojadaana.com.br",
);
check("sem os dois, o contato fica vazio", dadosDoClienteDaCandidatura({ ...lead, phone: "", email: "" }).contact, "");

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("wholesale-customer: todas as checagens passaram.");
