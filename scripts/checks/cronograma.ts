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
  ancoraDaQuery,
  corDoCard,
  dataEHoraDaPeca,
  filtrarPorMarca,
  marcaDaQuery,
  MARCAS,
  corDoFunil,
  corDoPonto,
  deslocar,
  diasDaVisao,
  doMesDaAncora,
  indexarPorDia,
  periodoDaQuery,
  recorteDaVisao,
  rotuloDaVisao,
  seloDeFormatos,
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
  notes: null,
  responsavel: null,
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

/* --------------------------------------------------------- calendario */

// A URL e digitavel e a ancora vem dela: valor torto nao pode derrubar a tela.
check("periodo ausente vira mes", periodoDaQuery(undefined), "mes");
check("periodo inventado vira mes", periodoDaQuery("ano"), "mes");
check("periodo valido e respeitado", periodoDaQuery("semana"), "semana");

const HOJE = new Date("2026-11-06T15:00:00.000Z");
check("ancora ausente vira hoje", ancoraDaQuery(undefined, HOJE), "2026-11-06");
check("ancora ilegivel vira hoje", ancoraDaQuery("ontem", HOJE), "2026-11-06");
check("ancora valida e mantida", ancoraDaQuery("2026-01-31", HOJE), "2026-01-31");

// 06/11/2026 e uma SEXTA, e 01/11/2026 e um DOMINGO. Os numeros abaixo saem
// dai; se alguem trocar a semana para comecar no domingo, todos caem juntos.
check("visao de dia mostra um dia so", diasDaVisao("dia", "2026-11-06"), ["2026-11-06"]);
const semana = diasDaVisao("semana", "2026-11-06");
check("semana tem sete dias", semana.length, 7);
check("semana comeca na segunda", semana[0], "2026-11-02");
check("semana termina no domingo", semana[6], "2026-11-08");

// GRADE DO MES: semanas INTEIRAS. Uma grade com buraco na primeira linha nao e
// um calendario, e e por isso que aparecem dias do mes vizinho.
const mes = diasDaVisao("mes", "2026-11-06");
check("grade do mes so tem semanas inteiras", mes.length % 7, 0);
check("grade do mes comeca numa segunda do mes anterior", mes[0], "2026-10-26");
check("grade do mes termina num domingo do mes seguinte", mes[mes.length - 1], "2026-12-06");
check("o mes inteiro cabe na grade", mes.includes("2026-11-01") && mes.includes("2026-11-30"), true);

// O RECORTE PEDIDO AO CONNECT e exatamente o que a tela mostra: pedir menos
// deixaria celula vazia com peca existindo, pedir mais gastaria o teto de 200.
check("recorte casa com a grade", recorteDaVisao("mes", "2026-11-06"), { de: mes[0], ate: mes[mes.length - 1] });

// O MES ANDA PELO DIA 1. Somar 30 dias faria 31/01 virar 02/03, pulando
// fevereiro inteiro — e quem clica na seta espera o mes seguinte.
check("mes seguinte de 31/01 e fevereiro", deslocar("mes", "2026-01-31", 1), "2026-02-01");
check("mes anterior de 01/03 e fevereiro", deslocar("mes", "2026-03-01", -1), "2026-02-01");
check("dia seguinte anda um dia", deslocar("dia", "2026-11-06", 1), "2026-11-07");
check("semana seguinte anda sete dias", deslocar("semana", "2026-11-06", 1), "2026-11-13");

// ROTULOS: conferidos pela FORMA, nao pelo texto exato — o nome do mes vem do
// Intl, e prender a checagem a ele a quebraria numa atualizacao de ICU.
const rotMes = rotuloDaVisao("mes", "2026-11-06");
check("rotulo do mes termina no ano", rotMes.endsWith(" 2026"), true);
check("rotulo do mes comeca em maiuscula", rotMes[0], rotMes[0].toUpperCase());
// O padrao do Intl e "novembro de 2026"; o cabecalho pede "Novembro 2026".
check("rotulo do mes nao traz o 'de' do Intl", rotMes.includes(" de "), false);
check(
  "semana que atravessa o mes nomeia os DOIS meses",
  rotuloDaVisao("semana", "2026-10-26").includes("outubro") &&
    rotuloDaVisao("semana", "2026-10-26").includes("novembro"),
  true,
);
check(
  "semana dentro do mes nomeia o mes uma vez so",
  rotuloDaVisao("semana", "2026-11-06").split("novembro").length - 1,
  1,
);

// A CHAVE DO DIA SAI DO MESMO LUGAR do agrupamento: duas contas de "que dia e
// esta peca" divergiriam no primeiro fuso.
check(
  "indexa pela mesma chave do agrupamento",
  [...indexarPorDia([post("a", "2026-11-06T10:00:00.000Z")]).keys()],
  ["2026-11-06"],
);
check("dia do mes vizinho e reconhecido", doMesDaAncora("2026-10-26", "2026-11-06"), false);
check("dia do proprio mes e reconhecido", doMesDaAncora("2026-11-30", "2026-11-06"), true);

// SELO DE FORMATOS: listar todos estoura a largura de uma celula de sete
// colunas, e a contagem avisa que ha mais sem fingir que nao ha.
check("sem formato nao tem selo", seloDeFormatos([]), null);
check("um formato sai sozinho", seloDeFormatos(["REEL"]), "REEL");
check("formatos extras viram contagem", seloDeFormatos(["REEL", "STORY", "FEED"]), "REEL +2");

// CORES: valor que o Connect inventar amanha cai no neutro, nunca em branco.
check("ponto do publicado difere do rascunho", corDoPonto("PUBLICADO") === corDoPonto("IDEIA"), false);
check("funil desconhecido ganha a cor neutra", corDoFunil("XOFU"), corDoFunil(""));
check("as tres etapas do funil tem cores distintas", new Set([corDoFunil("TOFU"), corDoFunil("MOFU"), corDoFunil("BOFU")]).size, 3);
check("marca desconhecida ganha o cartao neutro", corDoCard("OUTRA"), corDoCard(null));
check("as duas marcas tem cartoes diferentes", corDoCard("OKEY") === corDoCard("LOV_CLUB"), false);

/* ------------------------------------------------------ detalhe da peca */

// A HORA SAI EM UTC, igual a grade. Com o fuso de quem olha, uma peca de
// 00:30Z viraria "21:30" do DIA ANTERIOR — dentro de um modal aberto pela
// celula do dia seguinte. O modal se contradiria com a celula que o abriu.
const detalhe = dataEHoraDaPeca("2026-09-05T13:45:00.000Z");
check("hora sai em UTC, nao no fuso de quem olha", detalhe?.hora, "13:45");
check("data contem o ano", detalhe?.data.includes("2026"), true);
check("data comeca em maiuscula", detalhe?.data[0], detalhe?.data[0]?.toUpperCase());

// A VIRADA DO DIA e o caso que o fuso quebraria: 00:30Z e dia 5, nao dia 4.
const viradaCedo = dataEHoraDaPeca("2026-09-05T00:30:00.000Z");
check("meia-noite e meia continua no dia 5", viradaCedo?.data.includes("05"), true);
check("meia-noite e meia sai como 00:30", viradaCedo?.hora, "00:30");
const viradaTarde = dataEHoraDaPeca("2026-09-05T23:30:00.000Z");
check("23:30 continua no dia 5", viradaTarde?.data.includes("05"), true);

// O MESMO DIA da grade: o modal nao pode discordar da celula que o abriu.
const peca = post("x", "2026-09-05T23:30:00.000Z");
check(
  "o dia do modal e o mesmo dia da grade",
  dataEHoraDaPeca(peca.scheduledAt)?.data.includes("05") &&
    [...indexarPorDia([peca]).keys()][0] === "2026-09-05",
  true,
);

// Data ilegivel diz que nao sabe, em vez de "Invalid Date" na tela.
check("data ilegivel devolve nulo", dataEHoraDaPeca("amanha de tarde"), null);
check("texto vazio devolve nulo", dataEHoraDaPeca(""), null);

/* ------------------------------------------------------- filtro de marca */

// A lista do filtro sai do MAPA DE ROTULOS: duas listas divergiriam no dia em
// que o Connect ganhasse uma terceira marca, e o sintoma seria um filtro
// escondendo pecas sem avisar ninguem.
check("o filtro oferece as marcas conhecidas", MARCAS, ["OKEY", "LOV_CLUB"]);
check("toda marca do filtro tem rotulo", MARCAS.every((m) => rotuloDeMarca(m) !== m || m === "OKEY"), true);

check("marca ausente = todas", marcaDaQuery(undefined), null);
check("marca inventada = todas", marcaDaQuery("ADIDAS"), null);
check("marca conhecida e respeitada", marcaDaQuery("LOV_CLUB"), "LOV_CLUB");

const okey = post("o", "2026-09-02T10:00:00.000Z", { brand: "OKEY" });
const lov = post("l", "2026-09-03T10:00:00.000Z", { brand: "LOV_CLUB" });
const semMarca = post("s", "2026-09-04T10:00:00.000Z", { brand: null });
const acervo = [okey, lov, semMarca];

check("todas traz tudo, inclusive sem marca", filtrarPorMarca(acervo, null).map((p) => p.id), ["o", "l", "s"]);
check("OKEY traz so OKEY", filtrarPorMarca(acervo, "OKEY").map((p) => p.id), ["o"]);
check("LOV_CLUB traz so LOV_CLUB", filtrarPorMarca(acervo, "LOV_CLUB").map((p) => p.id), ["l"]);
// A SEM MARCA so aparece em "Todas", e isso e decisao: ela nao pertence a
// nenhuma marca, entao nao pode aparecer no recorte de uma delas.
check("peca sem marca nao entra em filtro de marca", filtrarPorMarca(acervo, "OKEY").some((p) => p.id === "s"), false);
check("filtrar nao mexe na lista original", acervo.length, 3);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("cronograma: todas as checagens passaram.");
