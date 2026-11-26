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
  camposNormalizados,
  instanteDaAtividade,
  atividadeSchema,
  type AtividadeInput,
} from "../../src/lib/cronograma-schemas";
import { montarPrompt } from "../../src/lib/cronograma-roteiro";
import {
  podeEditarAtividade,
  acumularFunil,
  contarPorFunil,
  CORES_DE_FUNIL,
  escalaDoEixo,
  filtrarPorResponsavel,
  funilPorDia,
  responsaveisDaQuery,
  corDeMarca,
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
  dataEHoraDaAtividade,
  filtrarPorMarca,
  marcaDaQuery,
  MARCAS,
  estiloDeSelo,
  estiloSolido,
  tintaSolida,
  CORES_DE_FORMATO,
  CORES_DE_PLATAFORMA,
  FUNIL_LEGENDA,
  funisDaQuery,
  filtrarPorFunil,
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
  title: `Atividade ${id}`,
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
  agrupado.map((d) => [d.chave, d.atividades.map((p) => p.id)]),
  [
    ["2026-11-10", ["a", "b"]],
    ["2026-11-20", ["c"]],
  ],
);

// O DIA SAI DA DATA EM UTC, igual ao que o Connect gravou: converter para o
// fuso de quem olha moveria a atividade de dia perto da meia-noite, e as duas telas
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
  comLixo.map((d) => [d.chave, d.atividades.map((p) => p.id)]),
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
// deixaria celula vazia com atividade existindo, pedir mais gastaria o teto de 200.
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
// esta atividade" divergiriam no primeiro fuso.
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
// A ETAPA DESCONHECIDA NAO GANHA SELO INVISIVEL: `estiloDeSelo` devolve
// `undefined` e o selo cai no neutro do tema. Etapa nova criada no Connect
// aparece cinza, nunca com texto da cor do fundo.
check("etapa desconhecida cai no neutro do tema", estiloDeSelo(CORES_DE_FUNIL, "XOFU"), undefined);
check(
  "as tres etapas do funil tem cores distintas",
  new Set([CORES_DE_FUNIL.TOFU, CORES_DE_FUNIL.MOFU, CORES_DE_FUNIL.BOFU]).size,
  3,
);
check("marca desconhecida ganha o cartao neutro", corDoCard("OUTRA"), corDoCard(null));
// A INVARIANTE CONTINUA, so mudou de lugar: desde 12/11/2026 quem distingue as
// duas marcas e a paleta (aplicada por `style`), e nao mais a classe. As duas
// tem de seguir diferentes uma da outra — card de marca que nao diz QUAL marca
// nao serve para nada num calendario que mistura as duas.
check(
  "as duas marcas tem cartoes diferentes",
  corDeMarca("OKEY")?.fundo === corDeMarca("LOV_CLUB")?.fundo,
  false,
);

/* ------------------------------------------------------ detalhe da atividade */

// A HORA SAI EM UTC, igual a grade. Com o fuso de quem olha, uma atividade de
// 00:30Z viraria "21:30" do DIA ANTERIOR — dentro de um modal aberto pela
// celula do dia seguinte. O modal se contradiria com a celula que o abriu.
const detalhe = dataEHoraDaAtividade("2026-09-05T13:45:00.000Z");
check("hora sai em UTC, nao no fuso de quem olha", detalhe?.hora, "13:45");
check("data contem o ano", detalhe?.data.includes("2026"), true);
check("data comeca em maiuscula", detalhe?.data[0], detalhe?.data[0]?.toUpperCase());

// A VIRADA DO DIA e o caso que o fuso quebraria: 00:30Z e dia 5, nao dia 4.
const viradaCedo = dataEHoraDaAtividade("2026-09-05T00:30:00.000Z");
check("meia-noite e meia continua no dia 5", viradaCedo?.data.includes("05"), true);
check("meia-noite e meia sai como 00:30", viradaCedo?.hora, "00:30");
const viradaTarde = dataEHoraDaAtividade("2026-09-05T23:30:00.000Z");
check("23:30 continua no dia 5", viradaTarde?.data.includes("05"), true);

// O MESMO DIA da grade: o modal nao pode discordar da celula que o abriu.
const atividade = post("x", "2026-09-05T23:30:00.000Z");
check(
  "o dia do modal e o mesmo dia da grade",
  dataEHoraDaAtividade(atividade.scheduledAt)?.data.includes("05") &&
    [...indexarPorDia([atividade]).keys()][0] === "2026-09-05",
  true,
);

// Data ilegivel diz que nao sabe, em vez de "Invalid Date" na tela.
check("data ilegivel devolve nulo", dataEHoraDaAtividade("amanha de tarde"), null);
check("texto vazio devolve nulo", dataEHoraDaAtividade(""), null);

/* ------------------------------------------------------- filtro de marca */

// A lista do filtro sai do MAPA DE ROTULOS: duas listas divergiriam no dia em
// que o Connect ganhasse uma terceira marca, e o sintoma seria um filtro
// escondendo atividades sem avisar ninguem.
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
check("atividade sem marca nao entra em filtro de marca", filtrarPorMarca(acervo, "OKEY").some((p) => p.id === "s"), false);
check("filtrar nao mexe na lista original", acervo.length, 3);


// --- A PALETA DO CARD É A DO CONNECT, valor por valor ----------------------
// Estes hexadecimais são uma CÓPIA de `BRAND` em src/lib/funnel.ts do
// Build.Connect. É a mesma agenda nas duas ferramentas: duas paletas para a
// mesma atividade fazem a pessoa duvidar de qual está certa.
//
// Sem esta checagem a divergência é silenciosa — ninguém abre os dois
// calendários lado a lado para conferir um tom de amarelo.
check("OKEY: fundo do Connect", corDeMarca("OKEY")?.fundo, "#f0e6a8");
check("OKEY: borda do Connect", corDeMarca("OKEY")?.borda, "#d9cc84");
check("OKEY: tinta do Connect", corDeMarca("OKEY")?.texto, "#3d3410");
check("LOV_CLUB: fundo do Connect", corDeMarca("LOV_CLUB")?.fundo, "#f8b4c4");
check("LOV_CLUB: borda do Connect", corDeMarca("LOV_CLUB")?.borda, "#e895a8");
check("LOV_CLUB: tinta do Connect", corDeMarca("LOV_CLUB")?.texto, "#4a1420");

// Marca nova criada no Connect não pode pintar o card de nada: cai no neutro,
// igual a `filtrarPorMarca` acima, que também não a inventa.
check("marca desconhecida nao tem paleta", corDeMarca("MARCA_NOVA"), null);
check("sem marca nao tem paleta", corDeMarca(null), null);

// O CARD DE MARCA NÃO LEVA CLASSE DE FUNDO. Quem pinta é o `style` com os
// valores acima; uma classe junto voltaria a trazer o tema de volta e o fundo
// mudaria no escuro — que é exatamente o defeito corrigido em 12/11/2026.
check("card de marca nao traz classe de fundo", corDoCard("OKEY"), "");
check("card sem marca usa o neutro do tema", corDoCard(null), "border-border bg-secondary/40");

/* ------------------------------------------- o formulário da atividade (escrita) */

// Estas regras governam o que ENTRA no banco, e todas falham em silêncio: o
// banco aceita, a tela não reclama, e o defeito só aparece semanas depois num
// card ilegível ou numa atividade que caiu no dia errado.

const base: AtividadeInput = {
  title: "Lançamento de verão",
  date: "2026-11-25",
  time: "09:00",
  funnel: "TOFU",
  formats: ["REEL"],
};

const aceita = (p: Partial<AtividadeInput>) => atividadeSchema.safeParse({ ...base, ...p }).success;

// O INSTANTE É UTC, sempre. Sem o `Z` o `new Date` lê no fuso do SERVIDOR, e o
// mesmo formulário gravaria horas diferentes conforme a máquina que atende —
// enquanto a grade desenha tudo em UTC. A atividade cairia na célula errada.
check("data e hora viram instante UTC", instanteDaAtividade("2026-11-25", "09:00").toISOString(), "2026-11-25T09:00:00.000Z");
check("meia-noite nao escorrega de dia", instanteDaAtividade("2026-11-25", "00:00").toISOString(), "2026-11-25T00:00:00.000Z");

// OS DOIS CAMPOS CONDICIONAIS. Sem eles o card sai com um formato sem nome ou
// um lançamento sem número — e o nº do line-up é justamente o que se procura.
check("OUTRO sem descricao e recusado", aceita({ formats: ["OUTRO"] }), false);
check("OUTRO com descricao passa", aceita({ formats: ["OUTRO"], formatOther: "Podcast" }), true);
check("LANCAMENTO sem line-up e recusado", aceita({ formats: ["LANCAMENTO"] }), false);
check("LANCAMENTO com line-up passa", aceita({ formats: ["LANCAMENTO"], lineUp: 12 }), true);

// LIMPAR OS CONDICIONAIS é o que impede um texto que ninguem digitou NAQUELA
// atividade de reaparecer quando alguem marcar OUTRO de novo.
check("descricao some quando OUTRO sai", camposNormalizados({ ...base, formats: ["REEL"], formatOther: "Podcast" }).formatOther, null);
check("line-up some quando LANCAMENTO sai", camposNormalizados({ ...base, formats: ["REEL"], lineUp: 12 }).lineUp, null);
check("descricao fica quando OUTRO esta marcado", camposNormalizados({ ...base, formats: ["OUTRO"], formatOther: "Podcast" }).formatOther, "Podcast");

// AS LISTAS SAO CONJUNTOS: a mesma rede duas vezes contaria duas vezes no
// funil e desenharia o selo repetido no card.
check("formato repetido entra uma vez", camposNormalizados({ ...base, formats: ["REEL", "REEL", "FEED"] }).formats, ["REEL", "FEED"]);
check("rede repetida entra uma vez", camposNormalizados({ ...base, platforms: ["INSTAGRAM", "INSTAGRAM"] }).platforms, ["INSTAGRAM"]);

// ATIVIDADE SEM FORMATO nao tem selo nenhum no calendario.
check("sem formato e recusada", aceita({ formats: [] }), false);
check("titulo vazio e recusado", aceita({ title: "   " }), false);
check("titulo de 121 caracteres e recusado", aceita({ title: "x".repeat(121) }), false);
check("data fora do formato e recusada", aceita({ date: "25/11/2026" }), false);
check("hora fora do formato e recusada", aceita({ time: "9h" }), false);

/* --------------------------------------------- filtro de pessoa e funil */

const umaAtividade = (p: Partial<{ responsavel: string | null; status: string; funnel: string; scheduledAt: string }>) => ({
  responsavel: null,
  status: "IDEIA",
  funnel: "TOFU",
  scheduledAt: "2026-11-25T09:00:00.000Z",
  ...p,
});

// A URL E DIGITAVEL: virgula sobrando e nome repetido nao podem virar filtro
// que nao casa com nada.
check("query vazia nao filtra ninguem", responsaveisDaQuery(undefined), []);
check("virgulas vazias saem", responsaveisDaQuery(",,Ana,,"), ["Ana"]);
check("nome repetido entra uma vez", responsaveisDaQuery("Ana,Ana,Bia"), ["Ana", "Bia"]);

const tres = [umaAtividade({ responsavel: "Ana" }), umaAtividade({ responsavel: "Bia" }), umaAtividade({ responsavel: null })];
// SELECAO VAZIA E "TODAS", nao "nenhuma": o filtro nasce vazio e a tela tem de
// mostrar o periodo inteiro.
check("sem selecao mostra tudo", filtrarPorResponsavel(tres, []).length, 3);
check("com pessoa mostra so a dela", filtrarPorResponsavel(tres, ["Ana"]).length, 1);
// PECA SEM RESPONSAVEL SOME no filtro, ao contrario da atividade sem marca. E a
// regra do Connect: "so as atividades da Fulana" e uma lista de pessoas.
check("atividade sem responsavel sai do filtro", filtrarPorResponsavel(tres, ["Ana", "Bia"]).length, 2);

// AS TRES ETAPAS SEMPRE APARECEM: "nenhuma atividade de fundo" e o achado mais util
// desta conta, e uma fatia que some esconde exatamente isso.
check("funil vazio ainda tem as tres etapas", contarPorFunil([]).map((f) => f.chave), ["TOFU", "MOFU", "BOFU"]);
// DIVISAO POR ZERO daria NaN, e "width: NaN%" o navegador ignora em silencio.
check("periodo vazio nao da NaN", contarPorFunil([]).every((f) => f.fracao === 0), true);
const funil = contarPorFunil([umaAtividade({ funnel: "TOFU" }), umaAtividade({ funnel: "TOFU" }), umaAtividade({ funnel: "BOFU" })]);
check("conta por etapa", funil.map((f) => f.total), [2, 0, 1]);
check("fracao e do total", funil[0].fracao, 2 / 3);

// O EIXO VEM DOS DIAS, nao das atividades: um dia vazio tem de virar coluna zero,
// senao segunda encosta em quinta como se fossem vizinhas.
const porDia = funilPorDia([umaAtividade({ funnel: "TOFU" })], ["2026-11-24", "2026-11-25", "2026-11-26"]);
check("dia sem atividade vira coluna zero", porDia[0].valores, [0, 1, 0]);
check("etapa sem atividade nenhuma continua na legenda", porDia.map((s) => s.chave), ["TOFU", "MOFU", "BOFU"]);

/* ------------------------------------------------- o prompt do roteiro */

// O prompt e o que o modelo ve. Uma linha errada aqui nao quebra nada: ela
// volta como um roteiro que fala da atividade errada, e so quem leu o card percebe.

const assunto = {
  title: "Lancamento de verao",
  scheduledAt: "2026-11-25T09:00:00.000Z",
  funnel: "TOFU",
  formats: ["REEL"],
  formatOther: null,
  status: "IDEIA",
  brand: null,
  platforms: [],
  notes: null,
  responsavel: null,
};

const p1 = montarPrompt(assunto);
// EM UTC, igual a grade: a atividade das 09:00 na celula nao pode virar 06:00 no
// prompt por causa do fuso do servidor.
check("prompt traz data e hora em UTC", p1.includes("25/11/2026 às 09:00"), true);
check("prompt usa o rotulo da tela, nao o valor cru", p1.includes("Topo — atrair"), true);
// CAMPO VAZIO NAO VIRA LINHA: "Marca: nao informada" ensina o modelo a
// comentar a ausencia, e o roteiro volta falando do que nao existe.
check("sem marca nao vira linha", p1.includes("Marca:"), false);
check("sem redes nao vira linha", p1.includes("Redes:"), false);
check("sem responsavel nao vira linha", p1.includes("Responsável:"), false);
check("sem observacoes nao vira linha", p1.includes("Observações:"), false);

// "OUTRO" VIRA A DESCRICAO: mandar a palavra "Outro" nao diz nada do formato.
const p2 = montarPrompt({ ...assunto, formats: ["OUTRO"], formatOther: "Podcast" });
check("formato Outro vira a descricao digitada", p2.includes("Formatos: Podcast"), true);
check("a palavra Outro nao vai para o modelo", p2.includes("Formatos: Outro"), false);

// Data ilegivel nao pode virar "Invalid Date" dentro do prompt.
const p3 = montarPrompt({ ...assunto, scheduledAt: "nao e data" });
check("data ilegivel some do prompt", p3.includes("Invalid"), false);
check("data ilegivel nao derruba o resto", p3.includes("Título: Lancamento de verao"), true);

/* ----------------------------- selo solido, legenda e filtro de etapa */

// A TINTA DO SELO SOLIDO E CALCULADA POR COR, nao escolhida a dedo: branco
// sobre o ambar do MOFU fica em 1,98:1, e tinta escura sobre o azul do TOFU
// fica PIOR que o branco. Fixar qualquer uma das duas reprova de um lado.
check("ambar recebe tinta escura", tintaSolida("#f5a524"), "#1f2937");
check("ciano recebe tinta escura", tintaSolida("#06b6d4"), "#1f2937");
check("laranja recebe tinta escura", tintaSolida("#f97316"), "#1f2937");
// AZUL E VERMELHO TAMBEM FICAM COM A ESCURA, e isso contraria a intuicao de
// "cor forte pede texto branco": no azul do TOFU a escura da 4,30:1 contra
// 3,42:1 do branco, e no vermelho do BOFU 3,90:1 contra 3,76:1. E a razao de a
// tinta ser CALCULADA e nao escolhida no olho.
check("azul recebe tinta escura", tintaSolida("#3b82f6"), "#1f2937");
check("vermelho recebe tinta escura", tintaSolida("#ef4444"), "#1f2937");
// O roxo do Reel e escuro o bastante para inverter: ali o branco ganha.
check("roxo recebe tinta clara", tintaSolida("#8b5cf6"), "#ffffff");
// Valor fora do formato nao pode virar selo SEM tinta: seria texto invisivel.
check("hexadecimal invalido ainda tem tinta", tintaSolida("roxo"), "#ffffff");
check("hexadecimal de tres digitos ainda tem tinta", tintaSolida("#fff"), "#ffffff");
// TODA COR DA PALETA recebe uma das duas, incluindo as que o Connect inventar
// amanha — a conta nao depende de ninguem lembrar de cadastrar a tinta.
check(
  "nenhuma cor da paleta fica sem tinta",
  [
    ...Object.values(CORES_DE_FORMATO),
    ...Object.values(CORES_DE_PLATAFORMA),
    ...Object.values(CORES_DE_FUNIL),
  ].every((c) => c !== undefined && ["#ffffff", "#1f2937"].includes(tintaSolida(c))),
  true,
);
// O SELO SOLIDO USA A COR CHEIA, e e isso que o faz funcionar sobre o card de
// marca: o fundo do selo deixa de depender do que esta atras dele.
check("selo solido usa a cor cheia no fundo", estiloSolido(CORES_DE_FUNIL, "TOFU")?.backgroundColor, "#3b82f6");
check("formato desconhecido nao ganha selo solido", estiloSolido(CORES_DE_FORMATO, "HOLOGRAMA"), undefined);

// A LEGENDA EXPLICA AS TRES SIGLAS QUE O SELO DO CARD MOSTRA. Uma etapa sem
// verbete e uma sigla sem traducao em lugar nenhum da ferramenta.
check("a legenda cobre as tres etapas", FUNIL_LEGENDA.map((f) => f.chave), ["TOFU", "MOFU", "BOFU"]);
check(
  "toda etapa da legenda tem cor no calendario",
  FUNIL_LEGENDA.every((f) => CORES_DE_FUNIL[f.chave] !== undefined),
  true,
);
check(
  "todo verbete tem titulo, rotulo curto e descricao",
  FUNIL_LEGENDA.every((f) => f.titulo !== "" && f.curto !== "" && f.descricao !== ""),
  true,
);

// O FILTRO DE ETAPA, na mesma forma do de pessoa: a URL e digitavel.
check("query vazia nao filtra etapa", funisDaQuery(undefined), []);
check("virgulas vazias saem", funisDaQuery(",,TOFU,,"), ["TOFU"]);
check("sigla repetida entra uma vez", funisDaQuery("TOFU,TOFU,BOFU"), ["TOFU", "BOFU"]);
check("sigla em minuscula e aceita", funisDaQuery("mofu"), ["MOFU"]);
// SIGLA INVENTADA NAO VIRA FILTRO: um `?funil=XOFU` digitado a mao esvaziaria
// o calendario inteiro e pareceria mes sem conteudo.
check("sigla inventada e descartada", funisDaQuery("XOFU,TOFU"), ["TOFU"]);

const porEtapa = [
  umaAtividade({ funnel: "TOFU" }),
  umaAtividade({ funnel: "MOFU" }),
  umaAtividade({ funnel: "BOFU" }),
];
// SELECAO VAZIA E "TODAS", nao "nenhuma" — o filtro nasce vazio.
check("sem selecao mostra todas as etapas", filtrarPorFunil(porEtapa, []).length, 3);
check("com etapa mostra so a dela", filtrarPorFunil(porEtapa, ["MOFU"]).length, 1);
// ACUMULA: "quanto do meu mes e topo e meio?" precisa das duas juntas.
check("duas etapas marcadas somam", filtrarPorFunil(porEtapa, ["TOFU", "BOFU"]).length, 2);

/* ------------------------------------- o grafico de area do funil */

// A COR E A DO BUILD.CONNECT, VALOR POR VALOR. Antes era a escala
// sky/amber/rose do Tailwind: perto, e nunca a mesma. Um hexadecimal digitado
// errado aqui nao quebra nada — so faz o mesmo grafico ter duas caras nas duas
// ferramentas, que e exatamente o que esta constante existe para impedir.
check("TOFU usa o azul do Connect", CORES_DE_FUNIL.TOFU, "#3b82f6");
check("MOFU usa o ambar do Connect", CORES_DE_FUNIL.MOFU, "#f5a524");
check("BOFU usa o vermelho do Connect", CORES_DE_FUNIL.BOFU, "#ef4444");

// O TETO DO EIXO E MULTIPLO DE 4 (regra `niceMax` do Connect), e e isso que
// impede o "1, 1, 1, 0, 0" que o eixo antigo empilhava: com teto 2 as cinco
// marcas caem em 0,5 e 1,5, e arredondar colapsa os rotulos.
check("periodo vazio ainda tem eixo", escalaDoEixo(0), 4);
check("pico pequeno nao estica o eixo", escalaDoEixo(3), 4);
check("pico 5 sobe para 8", escalaDoEixo(5), 8);
check("pico 9 sobe para 12", escalaDoEixo(9), 12);
check("o teto nunca fica abaixo do pico", [0, 1, 3, 4, 5, 9, 17, 41].every((p) => escalaDoEixo(p) >= p), true);
check("o teto e sempre multiplo de 4", [0, 1, 5, 9, 17, 41].every((p) => escalaDoEixo(p) % 4 === 0), true);
// Pico ilegivel daria `NaN` no teto, e `y = ... / NaN` apaga o grafico inteiro
// sem uma linha de erro no console.
check("pico ilegivel nao apaga o grafico", escalaDoEixo(Number.NaN), 4);

const doisDias = ["2026-11-25", "2026-11-26"];
const pilha = acumularFunil(
  funilPorDia([umaAtividade({ funnel: "TOFU" }), umaAtividade({ funnel: "BOFU" })], doisDias),
);
// BOFU NA BASE E TOFU NO TOPO, como no Connect: de baixo para cima, e o
// caminho que o publico faz no funil.
check("a pilha comeca no fundo do funil", pilha.map((c) => c.chave), ["BOFU", "MOFU", "TOFU"]);
// O TOPO DA PILHA E O TOTAL DO DIA — e a leitura que o grafico promete.
check("o topo da pilha e o total do dia", pilha[2].acumulado[0], 2);
// ETAPA VAZIA NAO ABRE BURACO: MOFU em zero repete a linha do BOFU em vez de
// cair para o eixo e cortar a area de baixo em dois.
check("etapa vazia nao abre buraco na pilha", pilha[1].acumulado[0], 1);
check("dia sem atividade fica no eixo", pilha[2].acumulado[1], 0);
// SEM DIAS a pilha nao pode virar `[NaN]`: a visao de um dia so chega aqui com
// um unico dia, e um periodo sem dias e o estado que antecede o primeiro render.
check("sem dias a pilha fica vazia", acumularFunil(funilPorDia([], [])).every((c) => c.acumulado.length === 0), true);

/* ----------------------------------------------------- quem edita o que */

// A REGRA DE AUTORIA VALE EM DOIS LUGARES — a tela (mostrar o lapis) e a
// action (deixar a escrita passar) — e por isso e UMA funcao. Se ela ceder,
// uma pessoa edita a atividade de outra: nada quebra, nada avisa.

check("o autor edita a propria", podeEditarAtividade("u1", "u1"), true);
check("outra pessoa nao edita", podeEditarAtividade("u1", "u2"), false);
// AUTOR NULO E NINGUEM: atividade de conta removida fica no calendario (apagar
// perderia a agenda), mas sem dono. Sem a checagem explicita de nulo, um
// `null === null` abriria todas elas de uma vez.
check("autor removido: ninguem edita", podeEditarAtividade(null, "u1"), false);
check("autor nulo nao casa com viewer vazio", podeEditarAtividade(null, ""), false);
// STRING VAZIA NAO E ID DE NINGUEM. `""` e o que um `?? ""` descuidado produz,
// e `"" === ""` liberaria a edicao — defeito que nenhum teste de tela pegaria,
// porque na tela o id nunca chega vazio.
check("id vazio nao casa com id vazio", podeEditarAtividade("", ""), false);
check("autor vazio nao e editavel por ninguem", podeEditarAtividade("", "u1"), false);
check("viewer vazio nao edita nada", podeEditarAtividade("u1", ""), false);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("cronograma: todas as checagens passaram.");
