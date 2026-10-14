// Checagem da taxonomia de reprovação da Análise de Clientes.
// Rodar com: npx tsx scripts/checks/wholesale-rejection-codes.ts
//
// O que está em jogo: este módulo é a única fonte dos motivos de recusa. Um
// código que exista no dropdown e não aqui é recusado na gravação; um que
// exista aqui e não na planilha é motivo inventado num registro que a Gestão
// vai analisar depois. A contagem e a ordem são, portanto, parte do contrato.
import {
  REJECTION_CODES,
  findRejectionCode,
  isValidRejectionCode,
  rejectionCodesByCategory,
} from "../../src/lib/wholesale-rejection-codes";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

check("são 34 códigos", REJECTION_CODES.length, 34);
check("são 9 categorias", rejectionCodesByCategory().length, 9);
check("primeiro código é 01", REJECTION_CODES[0].code, "01");
check("último código é 34", REJECTION_CODES[33].code, "34");
check(
  "código 11 tem a faixa de preço da planilha",
  findRejectionCode("11")?.criteria,
  "Peças de baixo custo (faixa de R$ 20 a R$ 50) ou de feira.",
);
check(
  "código 19 é da categoria Inexistência de Loja",
  findRejectionCode("19")?.category,
  "Inexistência de Loja",
);
check("código inexistente devolve null", findRejectionCode("99"), null);
check("código inexistente não é válido", isValidRejectionCode("99"), false);
check("código válido é válido", isValidRejectionCode("07"), true);
// Sem zero à esquerda não vale: o dropdown manda "07", nunca "7". Aceitar as
// duas formas faria o mesmo motivo existir com duas chaves no banco.
check("código sem zero à esquerda não é válido", isValidRejectionCode("7"), false);
check("string vazia não é válida", isValidRejectionCode(""), false);
// Todos os códigos têm os quatro campos preenchidos.
check(
  "nenhum código tem campo vazio",
  REJECTION_CODES.filter((c) => !c.code || !c.category || !c.label || !c.criteria).length,
  0,
);
// Códigos únicos.
check("códigos não repetem", new Set(REJECTION_CODES.map((c) => c.code)).size, 34);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("wholesale-rejection-codes: todas as checagens passaram.");
