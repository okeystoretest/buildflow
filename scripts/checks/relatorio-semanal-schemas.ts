/**
 * Checagem da validação das escritas do Relatório Semanal.
 *
 * O que está em jogo aqui NÃO é usabilidade: é a fronteira de confiança. O que
 * chega nas actions vem do navegador, onde nada do que a tela validou continua
 * valendo. Uma regra que afrouxa aqui não quebra nenhuma tela — ela só passa a
 * aceitar o que não devia.
 *
 * A mais importante é a da EVIDÊNCIA. A leitura da semana renderiza o campo
 * como `<img src>` ou `<a href>`, e quem clica é outra pessoa, na reunião de
 * sexta: um `javascript:` aceito aqui vira execução de script no navegador
 * dela.
 *
 * Rode com: npx tsx scripts/checks/relatorio-semanal-schemas.ts
 */
import {
  bloqueioSchema,
  criarSchema,
  evidencia,
  lerDia,
  numero,
  secaoSchema,
} from "../../src/lib/relatorio-semanal-schemas";
import { evidenciaEhImagem } from "../../src/lib/relatorio-semanal-labels";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  console.log(`${ok ? "ok" : "FALHOU"} ${nome}`);
  if (!ok) {
    falhas++;
    console.log(`  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

const aceita = (schema: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) =>
  schema.safeParse(v).success;

/* ------------------------------------------------- evidência (segurança) */

// O CAMINHO QUE O NOSSO PROPRIO UPLOAD GERA. Faltava, e o schema recusava o
// que a action `enviarEvidencia` tinha acabado de gravar: o upload subia o
// arquivo e o "Salvar" seguinte dizia que a evidencia era invalida. Veio da
// convencao do Build.Connect (`/uploads/`), e aqui a rota autenticada e
// `/api/uploads/`.
check("evidencia aceita o caminho que o upload daqui gera", aceita(evidencia, "/api/uploads/relatorio-semanal/2026/11/evid_1.webp"), true);
check("evidencia aceita o caminho antigo, de registros anteriores", aceita(evidencia, "/uploads/print.webp"), true);
// A mesma lista decide o desenho: imagem, nao link.
check("o caminho do upload se desenha como IMAGEM", evidenciaEhImagem("/api/uploads/x.webp"), true);
check("...e o link http nao", evidenciaEhImagem("https://instagram.com/p/x"), false);
check("evidencia aceita https", aceita(evidencia, "https://instagram.com/p/x"), true);
check("evidencia aceita http", aceita(evidencia, "http://exemplo.com/x"), true);
check("evidencia aceita vazio (campo opcional)", aceita(evidencia, ""), true);
check("evidencia aceita ausente", aceita(evidencia, null), true);

// As que importam: tudo isto seria clicável na ficha de leitura.
check("evidencia RECUSA javascript:", aceita(evidencia, "javascript:alert(1)"), false);
check("evidencia RECUSA data:", aceita(evidencia, "data:text/html,<script>alert(1)</script>"), false);
check("evidencia RECUSA vbscript:", aceita(evidencia, "vbscript:msgbox(1)"), false);
// `//evil.com` vira protocolo-relativo no navegador e sai do nosso domínio.
check("evidencia RECUSA protocolo-relativo", aceita(evidencia, "//evil.com/x"), false);
// Um caminho que só PARECE nosso: sem a barra inicial, não é upload nenhum.
check("evidencia RECUSA caminho solto", aceita(evidencia, "uploads/print.webp"), false);
check("evidencia RECUSA endereco gigante", aceita(evidencia, "https://x.com/" + "a".repeat(500)), false);
// Espaço na frente não pode servir de disfarce: o schema apara antes de olhar.
check("evidencia apara o espaco antes de decidir", aceita(evidencia, "   javascript:alert(1)   "), false);

/* ----------------------------------------------------- número de métrica */

check("numero aceita inteiro", aceita(numero, 16400), true);
check("numero aceita fracao", aceita(numero, 39.6), true);
check("numero aceita negativo", aceita(numero, -17.5), true);
check("numero aceita ausente (celula em branco e estado legitimo)", aceita(numero, null), true);
check("numero RECUSA NaN", aceita(numero, Number.NaN), false);
check("numero RECUSA infinito", aceita(numero, Number.POSITIVE_INFINITY), false);
check("numero RECUSA alem do teto", aceita(numero, 1_000_000_001), false);
check("numero RECUSA texto", aceita(numero, "16400"), false);

/* ------------------------------------------------------- a semana nova */

const semanaOk = { weekNumber: 48, periodStart: "2026-11-23", periodEnd: "2026-11-29" };
check("semana valida passa", aceita(criarSchema, semanaOk), true);
check("semana 0 e recusada", aceita(criarSchema, { ...semanaOk, weekNumber: 0 }), false);
check("semana 54 e recusada", aceita(criarSchema, { ...semanaOk, weekNumber: 54 }), false);
check("semana fracionada e recusada", aceita(criarSchema, { ...semanaOk, weekNumber: 1.5 }), false);
check("data em formato brasileiro e recusada", aceita(criarSchema, { ...semanaOk, periodStart: "23/11/2026" }), false);

// LIMITE CONHECIDO: o schema confere o FORMATO, não o calendário. "2026-13-45"
// passa aqui e vira data inválida no `lerDia`. Está registrado de propósito —
// o dia vem de um seletor de data na tela, não digitado.
check("o schema nao confere calendario (limite conhecido)", aceita(criarSchema, { ...semanaOk, periodStart: "2026-13-45" }), true);
check("...e o dia impossivel vira data invalida no lerDia", Number.isNaN(lerDia("2026-13-45").getTime()), true);
check("lerDia le a meia-noite em UTC", lerDia("2026-11-23").toISOString(), "2026-11-23T00:00:00.000Z");

/* -------------------------------------------------- as secoes de linhas */

const entrega = { expected: "3 reels publicados", day: "Segunda", block: "Conteudo" };
check("entrega valida passa", aceita(secaoSchema, { kind: "delivery", reportId: "r1", rows: [entrega] }), true);
check("entrega sem descricao e recusada", aceita(secaoSchema, { kind: "delivery", reportId: "r1", rows: [{ ...entrega, expected: "" }] }), false);
check("secao sem reportId e recusada", aceita(secaoSchema, { kind: "delivery", reportId: "", rows: [entrega] }), false);
check("60 entregas passam", aceita(secaoSchema, { kind: "delivery", reportId: "r1", rows: Array(60).fill(entrega) }), true);
check("61 entregas sao recusadas", aceita(secaoSchema, { kind: "delivery", reportId: "r1", rows: Array(61).fill(entrega) }), false);
check("secao de tipo desconhecido e recusada", aceita(secaoSchema, { kind: "bloqueios", reportId: "r1", rows: [] }), false);

// A ORDEM NUNCA VEM DO CLIENTE: ela é a posição no array. O schema descarta a
// chave, e é isso que impede buraco (0,1,3) e empate (0,1,1) na seção.
const comOrdem = secaoSchema.safeParse({
  kind: "delivery",
  reportId: "r1",
  rows: [{ ...entrega, order: 99, id: "roubado" }],
});
check("a secao e aceita mesmo com lixo junto", comOrdem.success, true);
check("...mas a ordem mandada pelo cliente e DESCARTADA", comOrdem.success && "order" in comOrdem.data.rows[0], false);
check("...e o id mandado pelo cliente tambem", comOrdem.success && "id" in comOrdem.data.rows[0], false);

// A pauta é a exceção: roteiro fixo, só a resposta muda.
check("pauta aceita so id e resposta", aceita(secaoSchema, { kind: "agenda", reportId: "r1", rows: [{ id: "a1", answer: "foi bem" }] }), true);
const pautaComPergunta = secaoSchema.safeParse({
  kind: "agenda",
  reportId: "r1",
  rows: [{ id: "a1", answer: "foi bem", question: "pergunta trocada" }],
});
check("...e DESCARTA uma pergunta trocada pelo cliente", pautaComPergunta.success && "question" in pautaComPergunta.data.rows[0], false);

/* ------------------------------------------------------------ bloqueios */

check("bloqueio precisa de titulo", aceita(bloqueioSchema, { reportId: "r1", title: "" }), false);
check("bloqueio com titulo passa", aceita(bloqueioSchema, { reportId: "r1", title: "Arte parada na agencia" }), true);
check("bloqueio aceita prazo", aceita(bloqueioSchema, { reportId: "r1", title: "x", dueDate: "2026-12-01" }), true);
check("bloqueio recusa prazo mal formado", aceita(bloqueioSchema, { reportId: "r1", title: "x", dueDate: "01/12/2026" }), false);
check("bloqueio recusa saude desconhecida", aceita(bloqueioSchema, { reportId: "r1", title: "x", health: "OTIMO" }), false);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("relatorio-semanal-schemas: todas as checagens passaram.");
