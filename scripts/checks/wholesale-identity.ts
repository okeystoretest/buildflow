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

// CNPJ real dos Correios. O PRIMEIRO digito verificador dele e 0, entao este
// caso e o unico que exercita o ramo `resto < 2 -> 0` de calcDigito.
check("CNPJ valido cujo digito verificador e 0", isValidCnpj("34.028.316/0001-03"), true);

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
// --- codigo do pais: a grafia que a versao anterior devolvia vazia ---
check(
  "telefone com 55 na frente gera as duas chaves",
  phoneMatchKeys("5511988887777"),
  ["11988887777", "1188887777"],
);
check(
  "telefone colado com +55 e mascara",
  phoneMatchKeys("+55 (11) 98888-7777"),
  ["11988887777", "1188887777"],
);
// A ARMADILHA: 11 digitos comecando com 55 e DDD 55 (Santa Maria/RS), NAO
// codigo de pais. Um slice(2) ingenuo quebraria aqui — e so passa porque a
// normalizacao vem de @/lib/phone, que so corta o 55 em 12 ou 13 digitos.
check(
  "DDD 55 nao e confundido com codigo de pais",
  phoneMatchKeys("55988887777"),
  ["55988887777", "5588887777"],
);
// --- simetria: a propriedade que o contrato exige ---
// Se as chaves de A contem o valor gravado de B, as de B tem de conter A.
// Sem isso, o aviso de repetido funciona num sentido e falha no outro, calado.
check(
  "celular cuja forma sem o 9 seria um fixo: nao gera variante",
  phoneMatchKeys("11933334444"),
  ["11933334444"],
);
check(
  "e o fixo correspondente tambem nao gera",
  phoneMatchKeys("1133334444"),
  ["1133334444"],
);
check(
  "12 digitos com codigo do pais",
  phoneMatchKeys("551188887777"),
  ["1188887777", "11988887777"],
);

// Simetria conferida em lote, sobre as grafias que importam.
const paresSimetria = [
  "11988887777", "1188887777",
  "11933334444", "1133334444",
  "5511988887777", "551188887777",
  "55988887777", "5588887777",
  "1133334444", "1140041234",
];
let assimetrias = 0;
for (const a of paresSimetria) {
  for (const b of paresSimetria) {
    const ka = phoneMatchKeys(a);
    const kb = phoneMatchKeys(b);
    if (ka.length === 0 || kb.length === 0) continue;
    // "a acha b" quer dizer: a chave gravada de b esta no conjunto de a.
    const aAchaB = ka.includes(kb[0]);
    const bAchaA = kb.includes(ka[0]);
    if (aAchaB !== bAchaA) {
      assimetrias++;
      console.log(`ASSIMETRIA ${a} vs ${b}: ${JSON.stringify(ka)} / ${JSON.stringify(kb)}`);
    }
  }
}
check("nenhuma assimetria entre as grafias", assimetrias, 0);

// Fixo de 8 dígitos cujo primeiro não é 9 não ganha variante inventada.
check("fixo não vira celular", phoneMatchKeys("1133334444"), ["1133334444"]);
check("lixo devolve lista vazia", phoneMatchKeys(""), []);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("wholesale-identity: todas as checagens passaram.");
