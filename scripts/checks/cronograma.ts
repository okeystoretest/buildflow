/**
 * Checagem da leitura do Cronograma de Conteúdo.
 *
 * O VOCABULÁRIO VEM DO OUTRO REPOSITÓRIO. Status, etapa de funil, formato e
 * plataforma são definidos no Build.Connect, e esta tela só os traduz. O dia em
 * que alguém criar um valor novo lá, um `Record` sem defesa mostraria
 * "undefined" num cronograma que parece completo — ninguém reporta isso como
 * bug, só acha a tela estranha.
 *
 * Rode com: npx tsx scripts/checks/cronograma.ts
 */
import {
  agruparPorDia,
  corDoStatus,
  janela,
  rotuloDeFormato,
  rotuloDeFunil,
  rotuloDeMarca,
  rotuloDePlataforma,
  rotuloDeStatus,
} from "../../src/lib/cronograma";
import type { PostDoCronograma } from "../../src/lib/integration/connect-cronograma";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  console.log(`${ok ? "ok" : "FALHOU"} ${nome}`);
  if (!ok) {
    falhas++;
    console.log(`  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

const post = (id: string, scheduledAt: string, extra: Partial<PostDoCronograma> = {}): PostDoCronograma => ({
  id,
  title: `Peça ${id}`,
  scheduledAt,
  status: "AGENDADO",
  funnel: "TOFU",
  formats: [],
  platforms: [],
  brand: null,
  ...extra,
});

/* ------------------------------------------------------------- rotulos */

check("status conhecido traduz", rotuloDeStatus("EM_PRODUCAO"), "Em produção");
check("funil conhecido traduz", rotuloDeFunil("BOFU"), "Fundo — converter");
check("formato conhecido traduz", rotuloDeFormato("CARROSSEL"), "Carrossel");
check("plataforma conhecida traduz", rotuloDePlataforma("TIKTOK"), "TikTok");
check("marca conhecida traduz", rotuloDeMarca("LOV_CLUB"), "Lov Club");

// O ESSENCIAL: valor que o Connect pode inventar amanha nao vira "undefined".
check("status novo do Connect sai cru, nunca undefined", rotuloDeStatus("ARQUIVADO"), "ARQUIVADO");
check("funil novo sai cru", rotuloDeFunil("XOFU"), "XOFU");
check("formato novo sai cru", rotuloDeFormato("PODCAST"), "PODCAST");
check("plataforma nova sai cru", rotuloDePlataforma("KWAI"), "KWAI");
check("marca nova sai crua", rotuloDeMarca("OUTRA"), "OUTRA");
// Marca e o unico anulavel do conjunto.
check("marca ausente vira vazio, nao 'null'", rotuloDeMarca(null), "");

check("cor do publicado difere da do rascunho", corDoStatus("PUBLICADO") === corDoStatus("IDEIA"), false);
check("status desconhecido ganha a cor neutra", corDoStatus("ARQUIVADO"), corDoStatus("IDEIA"));

/* ---------------------------------------------------------- agrupamento */

const agrupado = agruparPorDia([
  post("c", "2026-11-20T10:00:00.000Z"),
  post("a", "2026-11-10T08:00:00.000Z"),
  post("b", "2026-11-10T19:00:00.000Z"),
]);
check(
  "agrupa por dia e ordena do mais proximo ao mais distante",
  agrupado.map((d) => [d.chave, d.posts.map((p) => p.id)]),
  [
    ["2026-11-10", ["a", "b"]],
    ["2026-11-20", ["c"]],
  ],
);

// O DIA SAI DA DATA EM UTC, igual ao que o Connect gravou: converter para o
// fuso de quem olha moveria a peca de dia perto da meia-noite, e as duas telas
// deixariam de bater lado a lado.
check(
  "23h UTC continua no dia 10, nao escorrega para o 11",
  agruparPorDia([post("x", "2026-11-10T23:30:00.000Z")])[0].chave,
  "2026-11-10",
);

// Data ilegivel nao derruba a tela nem some: vai para o fim, em "sem data".
const comLixo = agruparPorDia([post("z", "nao-e-data"), post("a", "2026-11-10T08:00:00.000Z")]);
check(
  "data ilegivel vira 'sem data' e fica por ultimo",
  comLixo.map((d) => [d.chave, d.posts.map((p) => p.id)]),
  [
    ["2026-11-10", ["a"]],
    ["", ["z"]],
  ],
);

check("lista vazia nao quebra", agruparPorDia([]), []);

/* --------------------------------------------------------------- janela */

check(
  "a janela sai em YYYY-MM-DD, para tras e para frente",
  janela(new Date("2026-11-05T12:00:00.000Z"), 30, 90),
  { de: "2026-10-06", ate: "2027-02-03" },
);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("cronograma: todas as checagens passaram.");
