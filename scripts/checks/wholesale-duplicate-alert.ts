// Checagem do filtro que encontra cadastro repetido (decisão 9).
// Rodar com: npx tsx scripts/checks/wholesale-duplicate-alert.ts
//
// O que está em jogo: este filtro é o que faz um alerta de fraude aparecer
// para OUTRA vendedora. Se ele procurar só a grafia recebida, o CNPJ pontuado
// e o telefone sem o nono dígito escapam — e o alerta nunca dispara, calado.
import { buildDuplicateWhere } from "../../src/lib/wholesale-queries";

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

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("wholesale-duplicate-alert: todas as checagens passaram.");
