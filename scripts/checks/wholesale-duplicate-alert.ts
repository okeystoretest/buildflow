// Checagem do filtro que encontra cadastro repetido (decisão 9).
// Rodar com: npx tsx scripts/checks/wholesale-duplicate-alert.ts
//
// O que está em jogo: este filtro é o que faz um alerta de fraude aparecer
// para OUTRA vendedora. Se ele procurar só a grafia recebida, o CNPJ pontuado
// e o telefone sem o nono dígito escapam — e o alerta nunca dispara, calado.
import { buildDuplicateWhere, classifyDuplicateMatch } from "../../src/lib/wholesale-queries";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

const where = buildDuplicateWhere("lead-atual", "11.222.333/0001-81", "11988887777");

check(
  "o próprio lead é excluído",
  JSON.stringify(where).includes('"not":"lead-atual"') ||
    JSON.stringify(where).includes('"not": "lead-atual"'),
  true,
);
check(
  "só CUIDADO e REPROVADO alertam",
  JSON.stringify(where).includes("CUIDADO") && JSON.stringify(where).includes("REPROVADO"),
  true,
);
check(
  "aprovado não alerta",
  JSON.stringify(where).includes("APROVADO"),
  false,
);
check(
  "procura o CNPJ só em dígitos",
  JSON.stringify(where).includes("11222333000181"),
  true,
);
check(
  "não procura o CNPJ pontuado",
  JSON.stringify(where).includes("11.222.333"),
  false,
);
check(
  "procura o telefone COM o nono dígito",
  JSON.stringify(where).includes("11988887777"),
  true,
);
check(
  "procura o telefone SEM o nono dígito",
  JSON.stringify(where).includes("1188887777"),
  true,
);

// Telefone inutilizável não deve gerar cláusula de telefone vazia que casaria
// com tudo.
const semTelefone = buildDuplicateWhere("lead-atual", "11222333000181", "");
check(
  "sem telefone válido, não há cláusula de telefone",
  JSON.stringify(semTelefone).includes('"phone"'),
  false,
);

// Sem NENHUMA chave utilizável o filtro não pode casar com lead algum. Não
// depende de `OR: []` (semântica de array vazio do Prisma): o filtro é uma
// contradição lógica — o id é, ao mesmo tempo, igual e diferente do lead atual.
const semNada = buildDuplicateWhere("lead-atual", "", "");
check(
  "sem CNPJ nem telefone, não há OR (nada de array vazio)",
  "OR" in semNada,
  false,
);
check(
  "sem CNPJ nem telefone, o filtro é uma contradição que não casa com ninguém",
  JSON.stringify((semNada as { id?: unknown }).id),
  JSON.stringify({ not: "lead-atual", in: ["lead-atual"] }),
);
check(
  "CNPJ de tamanho errado também não gera cláusula",
  "OR" in buildDuplicateWhere("lead-atual", "123", ""),
  false,
);

// --- por que o aviso disparou: o campo que a vendedora le ---
const cnpjA = "11222333000181";
const fonesA = ["11988887777", "1188887777"];
check(
  "casou por CNPJ e telefone",
  classifyDuplicateMatch({ cnpjDigits: cnpjA, phoneKeys: fonesA, candidate: { cnpj: cnpjA, phone: "1188887777" } }),
  "ambos",
);
check(
  "casou so por CNPJ",
  classifyDuplicateMatch({ cnpjDigits: cnpjA, phoneKeys: fonesA, candidate: { cnpj: cnpjA, phone: "8577776666" } }),
  "cnpj",
);
check(
  "casou so por telefone",
  classifyDuplicateMatch({ cnpjDigits: cnpjA, phoneKeys: fonesA, candidate: { cnpj: "11444777000161", phone: "1188887777" } }),
  "telefone",
);
// O DEFEITO que esta correcao fecha: CNPJ vazio nos dois lados nao e casamento
// de CNPJ, porque a consulta nem procurou por ele.
check(
  "CNPJ vazio nos dois lados nao vira casamento de CNPJ",
  classifyDuplicateMatch({ cnpjDigits: "", phoneKeys: fonesA, candidate: { cnpj: "", phone: "1188887777" } }),
  "telefone",
);
check(
  "CNPJ malformado nos dois lados tambem nao",
  classifyDuplicateMatch({ cnpjDigits: "112223", phoneKeys: fonesA, candidate: { cnpj: "112223", phone: "1188887777" } }),
  "telefone",
);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("wholesale-duplicate-alert: todas as checagens passaram.");
