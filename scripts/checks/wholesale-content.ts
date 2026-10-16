// Checagem do conteúdo institucional das LPs de atacado.
// Rodar com: npx tsx scripts/checks/wholesale-content.ts
//
// O que está em jogo: este texto é copy aprovada pela marca, transcrita da
// planilha. Contagem errada significa bloco perdido na montagem; texto
// reescrito significa promessa comercial inventada numa página pública.
import { createHash } from "node:crypto";
import { WHOLESALE_CONTENT, getBrandContent } from "../../src/lib/wholesale-content";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

const okey = WHOLESALE_CONTENT.OKEY;
check("3 motivos", okey.reasons.length, 3);
check("6 vantagens", okey.advantages.length, 6);
check("4 grupos de FAQ", okey.faq.length, 4);
// São sete, não oito: o grupo 4 ("Qualidade e Trocas") tem uma única pergunta
// na planilha. O número existe para que um bloco perdido falhe aqui; não suba
// para 8 sem que a planilha tenha ganhado uma pergunta.
check("7 perguntas no total", okey.faq.reduce((n, g) => n + g.items.length, 0), 7);
check(
  "motivo 2 literal da planilha",
  okey.reasons[1],
  { title: "Diferencial Qualitativo", subtitle: "Atemporalidade e padrão alta-costura" },
);
check(
  "vantagem 5 tem o texto da planilha",
  okey.advantages[4].body.startsWith("Proporcione ao seu negócio margens de lucro atrativas"),
  true,
);
check(
  "a margem de até 100% está no FAQ, como escrito",
  okey.faq[2].items[0].a.includes("margem de lucro de até 100%"),
  true,
);
// Nenhuma vantagem com corpo vazio: a montagem renderiza seis cartões.
check("nenhuma vantagem sem corpo", okey.advantages.filter((a) => !a.body).length, 0);

check("slug okey resolve", getBrandContent("okey")?.brand, "OKEY");
check("slug lov-club resolve", getBrandContent("lov-club")?.brand, "LOV_CLUB");
check("slug desconhecido devolve null", getBrandContent("nike"), null);
// O hash existe porque a autoridade sobre esta copy é a planilha, não quem
// edita o código: qualquer mudança de texto precisa falhar alto. Se a copy mudou
// de propósito e a planilha respalda, o novo hash entra no mesmo commit da copy,
// onde a revisão vê as duas linhas. Digest falhando com as contagens passando
// quer dizer que o texto se mexeu, não a estrutura.
// Recalculado em 16/10/2026 ao trazer `metrics` e `highlights` do TSX para
// dentro do modulo travado. O digest anterior
// (3ced04f351e9cd75e8d842afe79dbb36587aeda821e5b836bacfd59d4f6746fe) cobria
// reasons+advantages+faq; nenhum TEXTO da planilha mudou nesta passada — o que
// mudou foi o conjunto coberto, que passou a incluir as dez afirmacoes que
// estavam soltas. A unica frase reescrita foi a meta description, para carregar
// a condicao da margem que a planilha exige e que ela omitia.
const DIGEST_ESPERADO = "196980fc599555915d8e2b3ad6849b30b2cb04f4bff7ef1fd9a35fcb38dd603a";
// `metrics` e `highlights` entram no digest porque sao AFIRMACAO COMERCIAL —
// margem, tecido, atendimento, exclusividade. Viviam em texto fixo no TSX, fora
// de qualquer trava, enquanto o cabecalho de sections.tsx declarava que
// afirmacao comercial nao se escreve ali. `metaDescription` fica FORA do digest
// compartilhado porque e a unica string que difere por marca (leva o nome
// exibido); ela tem assercao propria abaixo.
function digestDaCopy(c: {
  reasons: unknown;
  advantages: unknown;
  faq: unknown;
  metrics: unknown;
  highlights: unknown;
}) {
  return createHash("sha256")
    .update(JSON.stringify([c.reasons, c.advantages, c.faq, c.metrics, c.highlights]))
    .digest("hex");
}
check("digest da copy OKEY", digestDaCopy(WHOLESALE_CONTENT.OKEY), DIGEST_ESPERADO);
// O conteúdo é compartilhado entre as marcas: a planilha diz "(marca)" e
// "nossa marca", nunca OKEY. Só o nome exibido difere.
check("digest da copy Lov Club igual ao da OKEY", digestDaCopy(WHOLESALE_CONTENT.LOV_CLUB), DIGEST_ESPERADO);

// --- as afirmacoes que estavam soltas no TSX --------------------------------
check("sao quatro metricas", okey.metrics.length, 4);
check("sao dois destaques", okey.highlights.length, 2);
// Numero sem condicao e promessa que o negocio nao fez: a planilha condiciona a
// margem ("variando conforme a linha de produtos e o volume"). As TRES
// aparicoes da margem tem de carregar a condicao — inclusive a meta description,
// que e a primeira coisa que a lojista le no preview do WhatsApp.
const margem = okey.metrics.find((m) => m.valor === "Até 100%");
check("a metrica de margem existe", margem !== undefined, true);
check("a metrica de margem condiciona na nota", margem?.nota.includes("Varia conforme"), true);
check(
  "o destaque de margem condiciona",
  okey.highlights.find((h) => h.termo === "Margem na revenda")?.valor.includes("conforme"),
  true,
);
for (const [marca, esperado] of [
  ["OKEY", "OKEY"],
  ["LOV_CLUB", "Lov Club"],
] as const) {
  const d = WHOLESALE_CONTENT[marca].metaDescription;
  check(`meta description da ${marca} nomeia a marca`, d.includes(esperado), true);
  check(`meta description da ${marca} condiciona a margem`, d.includes("conforme"), true);
  check(`meta description da ${marca} nao tem placeholder`, d.includes("{marca}"), false);
}

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("wholesale-content: todas as checagens passaram.");
