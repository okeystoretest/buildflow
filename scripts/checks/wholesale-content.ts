// Checagem do conteúdo institucional das LPs de atacado.
// Rodar com: npx tsx scripts/checks/wholesale-content.ts
//
// O que está em jogo: este texto é copy aprovada pela marca, transcrita da
// planilha. Contagem errada significa bloco perdido na montagem; texto
// reescrito significa promessa comercial inventada numa página pública.
import { createHash } from "node:crypto";
import { WHOLESALE_CONTENT, getBrandContent } from "../../src/lib/wholesale-content";
import { RETENCAO_DIAS } from "../../src/lib/wholesale-retention";

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
// Titulo e subtitulo seguem LITERAIS da planilha; o `body` nao e dela e tem
// assercao propria mais abaixo. Comparar o objeto inteiro aqui foi o que pegou a
// adicao do paragrafo quando ela aconteceu — por isso os dois campos sao
// conferidos nome a nome, e nao por igualdade do objeto: assim um terceiro campo
// futuro nao reprova esta linha, mas uma mexida no texto da planilha reprova.
check("motivo 2: titulo literal da planilha", okey.reasons[1].title, "Diferencial Qualitativo");
check(
  "motivo 2: subtitulo literal da planilha",
  okey.reasons[1].subtitle,
  "Atemporalidade e padrão alta-costura",
);

// --- os paragrafos dos motivos, que NAO vem da planilha --------------------
// Foram escritos em 16/10/2026 com autorizacao do dono, sob a regra de nenhuma
// afirmacao nova. A regra e conferivel: cada paragrafo precisa carregar um
// trecho que JA aparece na copy aprovada da planilha. Sem isto, "nenhuma
// afirmacao nova" seria uma promessa num comentario — e a proxima edicao
// poderia inventar uma margem diferente sem nada reclamar.
const ANCORAS = [
  "variando conforme a linha de produtos e o volume de aquisição",
  "tecidos importados da Linha Italiana Premium",
  "exclusividade de marca em determinadas regiões",
];
const copyAprovada = JSON.stringify([okey.advantages, okey.faq, okey.metrics, okey.highlights]);
okey.reasons.forEach((r, i) => {
  check(`motivo ${i + 1} tem paragrafo`, r.body.length > 80, true);
  check(`motivo ${i + 1} carrega afirmacao ja aprovada`, r.body.includes(ANCORAS[i]), true);
  check(`a ancora do motivo ${i + 1} existe na copy da planilha`, copyAprovada.includes(ANCORAS[i]), true);
});

// --- aviso de privacidade (Art. 9) e contato -------------------------------
// O controlador e a RAZAO SOCIAL. "Okey Store" e nome comercial e nao identifica
// agente de tratamento — se alguem trocar por ele, o aviso para de cumprir o
// Art. 9 e a pagina continua parecendo certa.
check("controlador nao e o nome comercial", okey.privacidade.controlador.includes("Okey Store"), false);
check("controlador esta preenchido", okey.privacidade.controlador.length > 10, true);
check("cnpj tem a forma de cnpj", /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(okey.privacidade.cnpj), true);
check("ha e-mail para os direitos do titular", okey.privacidade.email.includes("@"), true);
// 90 dias e decisao do dono, e e o MESMO numero que o expurgo usa. As duas
// pontas leem a mesma constante; esta linha prende que continuem lendo.
check("retencao declarada e de 90 dias", okey.privacidade.retencaoDias, RETENCAO_DIAS);
check("retencao declarada e positiva", okey.privacidade.retencaoDias > 0, true);
// Link de WhatsApp montado com digito escolhido manda a lojista para um
// estranho. Ou e null, ou tem os 13 digitos de um celular brasileiro (55 + DDD
// + 9 digitos). Nao existe meio caminho.
const link = okey.contato.whatsappLink;
check(
  "link de whatsapp e null ou tem 13 digitos",
  link === null || /^https:\/\/wa\.me\/55\d{11}$/.test(link),
  true,
);
check("whatsapp aparece como texto", okey.contato.whatsapp.length > 8, true);
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
// Digest de 16/10/2026 (o anterior, 196980fc...603a, cobria reasons+advantages+
// faq+metrics+highlights). Mudou por tres coisas, todas autorizadas pelo dono
// nesta data: os TRES motivos ganharam `body` — a planilha nunca trouxe esses
// paragrafos, e cada frase deles reaproveita afirmacao que a planilha ja
// aprovou em outro lugar da pagina, nenhuma nova; e `privacidade` e `contato`
// nasceram e entraram no conjunto coberto.
const DIGEST_ESPERADO = "09d5102a34e9f3e91fe65c72cb57e3a8af79ee97f5234e6de4ca34797d95a657";
// `metrics` e `highlights` entram no digest porque sao AFIRMACAO COMERCIAL —
// margem, tecido, atendimento, exclusividade. Viviam em texto fixo no TSX, fora
// de qualquer trava, enquanto o cabecalho de sections.tsx declarava que
// afirmacao comercial nao se escreve ali. `metaDescription` fica FORA do digest
// compartilhado porque e a unica string que difere por marca (leva o nome
// exibido); ela tem assercao propria abaixo.
// `privacidade` e `contato` entram no digest por um motivo mais forte que o das
// afirmacoes comerciais: um controlador errado quebra o Art. 9, e um numero de
// WhatsApp errado manda a lojista falar com um estranho. Sao os dois campos da
// pagina em que "parece certo" nao basta.
function digestDaCopy(c: {
  reasons: unknown;
  advantages: unknown;
  faq: unknown;
  metrics: unknown;
  highlights: unknown;
  privacidade: unknown;
  contato: unknown;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        c.reasons,
        c.advantages,
        c.faq,
        c.metrics,
        c.highlights,
        c.privacidade,
        c.contato,
      ]),
    )
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
