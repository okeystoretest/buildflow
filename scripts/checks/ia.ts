/**
 * Checagem da configuração da Inteligência Artificial.
 *
 * O QUE ESTÁ EM JOGO É UMA URL. O nome do modelo vira um pedaço do caminho
 * pedido ao provedor (`.../models/<modelo>:generateContent`), e o campo que o
 * preenche é texto livre numa tela de Gestão. Sem a regra abaixo, uma barra
 * ou um `..` digitados ali apontariam o pedido para outra rota da API — e
 * nada na tela avisaria: o erro voltaria como "o serviço não respondeu como
 * esperado".
 *
 * Rode com: npx tsx scripts/checks/ia.ts
 */
import { configSchema, INSTRUCAO_PADRAO, MODELO_PADRAO } from "../../src/lib/ia-settings";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  console.log(`${ok ? "ok" : "FALHOU"} ${nome}`);
  if (!ok) {
    falhas++;
    console.log(`  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

const aceita = (model: string, instruction = "Seja breve.") =>
  configSchema.safeParse({ model, instruction }).success;

// O PADRÃO TEM DE PASSAR NA PRÓPRIA REGRA. Parece óbvio e é o primeiro a
// quebrar no dia em que o provedor mudar o estilo do nome: o sistema nasceria
// com uma semente que a tela recusa salvar.
check("o modelo padrao passa na regra", aceita(MODELO_PADRAO), true);
check("a instrucao padrao passa na regra", configSchema.safeParse({ model: MODELO_PADRAO, instruction: INSTRUCAO_PADRAO }).success, true);

// NOMES VÁLIDOS de verdade, nos formatos que os provedores usam.
check("nome com ponto e hifen passa", aceita("gemini-2.5-flash"), true);
check("nome so com letras passa", aceita("gemini"), true);
check("nome com maiuscula passa", aceita("Gemini-2.5-Flash"), true);

// O QUE A REGRA EXISTE PARA BARRAR: tudo que muda o CAMINHO da URL.
check("barra e recusada", aceita("models/gemini/../../admin"), false);
check("ponto-ponto e recusado", aceita("../segredo"), false);
check("dois-pontos e recusado", aceita("gemini:generateContent"), false);
check("interrogacao e recusada", aceita("gemini?key=outra"), false);
check("espaco e recusado", aceita("gemini 2.5"), false);
check("comeco com ponto e recusado", aceita(".gemini"), false);
check("comeco com hifen e recusado", aceita("-gemini"), false);

// VAZIO NÃO É CONFIGURAÇÃO: salvar em branco deixaria a URL sem modelo, e o
// pedido iria para `/models/:generateContent`.
check("modelo vazio e recusado", aceita(""), false);
check("modelo so com espacos e recusado", aceita("   "), false);
check("instrucao vazia e recusada", aceita(MODELO_PADRAO, "   "), false);

// TETOS: o campo de instrucao nao pode virar deposito de texto no banco.
check("modelo de 81 caracteres e recusado", aceita("g".repeat(81)), false);
check("instrucao de 4001 caracteres e recusada", aceita(MODELO_PADRAO, "x".repeat(4001)), false);
check("instrucao de 4000 caracteres passa", aceita(MODELO_PADRAO, "x".repeat(4000)), true);

// ESPAÇO NA BORDA SOME, e isso importa: um espaço invisível colado no fim de
// um nome copiado de uma documentação viraria um caminho que não existe.
const limpo = configSchema.safeParse({ model: "  gemini-2.5-flash  ", instruction: " Seja breve. " });
check("espaco na borda do modelo e aparado", limpo.success && limpo.data.model, "gemini-2.5-flash");
check("espaco na borda da instrucao e aparado", limpo.success && limpo.data.instruction, "Seja breve.");

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("ia: todas as checagens passaram.");
