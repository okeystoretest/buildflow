// Checagem da normalização que faz o aviso de cadastro repetido funcionar.
// Rodar com: npx tsx scripts/checks/wholesale-identity.ts
//
// O que está em jogo: o aviso da decisão 9 compara CNPJ e telefone entre
// leads. Duas grafias do mesmo número não casam, e o alerta que deveria
// proteger a equipe simplesmente não aparece — calado, como todo defeito de
// normalização.
import {
  normalizeCnpj,
  isValidCnpj,
  formatCnpj,
  phoneMatchKeys,
} from "../../src/lib/wholesale-identity";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

// --- Review Focus 1: mesma empresa, grafias diferentes ---
check("CNPJ pontuado vira dígitos", normalizeCnpj("11.222.333/0001-81"), "11222333000181");
check("CNPJ já em dígitos não muda", normalizeCnpj("11222333000181"), "11222333000181");
check("CNPJ com espaços", normalizeCnpj(" 11 222 333 0001 81 "), "11222333000181");
check(
  "as duas grafias normalizam para a mesma chave",
  normalizeCnpj("11.222.333/0001-81") === normalizeCnpj("11222333000181"),
  true,
);

// --- dígitos verificadores ---
check("CNPJ válido", isValidCnpj("11.222.333/0001-81"), true);
check("CNPJ com dígito trocado", isValidCnpj("11.222.333/0001-82"), false);
check("CNPJ curto", isValidCnpj("112223330001"), false);
check("CNPJ longo", isValidCnpj("112223330001811"), false);
// Repetidos passam na conta dos dígitos e não existem: barrar é obrigatório.
check("todos dígitos iguais", isValidCnpj("11111111111111"), false);
check("zeros", isValidCnpj("00000000000000"), false);
check("vazio", isValidCnpj(""), false);
check("texto", isValidCnpj("não tenho"), false);

check("formatação de exibição", formatCnpj("11222333000181"), "11.222.333/0001-81");

// --- Review Focus 2: o nono dígito, o mesmo defeito que quebrou o WhatsApp ---
check(
  "celular com 9 gera as duas chaves",
  phoneMatchKeys("11988887777"),
  ["11988887777", "1188887777"],
);
check(
  "celular sem 9 gera as duas chaves",
  phoneMatchKeys("1188887777"),
  ["1188887777", "11988887777"],
);
check(
  "as duas grafias se encontram",
  phoneMatchKeys("11988887777").includes("1188887777"),
  true,
);
// Fixo de 8 dígitos cujo primeiro não é 9 não ganha variante inventada.
check("fixo não vira celular", phoneMatchKeys("1133334444"), ["1133334444"]);
check("lixo devolve lista vazia", phoneMatchKeys(""), []);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("wholesale-identity: todas as checagens passaram.");
