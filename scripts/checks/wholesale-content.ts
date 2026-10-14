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
const DIGEST_ESPERADO = "3ced04f351e9cd75e8d842afe79dbb36587aeda821e5b836bacfd59d4f6746fe";
function digestDaCopy(c: { reasons: unknown; advantages: unknown; faq: unknown }) {
  return createHash("sha256")
    .update(JSON.stringify([c.reasons, c.advantages, c.faq]))
    .digest("hex");
}
check("digest da copy OKEY", digestDaCopy(WHOLESALE_CONTENT.OKEY), DIGEST_ESPERADO);
// O conteúdo é compartilhado entre as marcas: a planilha diz "(marca)" e
// "nossa marca", nunca OKEY. Só o nome exibido difere.
check("digest da copy Lov Club igual ao da OKEY", digestDaCopy(WHOLESALE_CONTENT.LOV_CLUB), DIGEST_ESPERADO);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("wholesale-content: todas as checagens passaram.");
