/**
 * Checagem da leitura da Vitrine.
 *
 * O VOCABULÁRIO VEM DO OUTRO REPOSITÓRIO, igual ao cronograma: `VideoKind` e
 * `FileKind` são definidos no Build.Connect e esta tela só os traduz. O dia em
 * que alguém criar um tipo novo lá, um `Record` sem defesa mostraria
 * "undefined" num acervo que parece completo — ninguém reporta isso como bug,
 * só acha a tela estranha.
 *
 * O TAMANHO tem checagem própria porque é a única conta aqui, e erra de um jeito
 * que passa: "2,4 MB" e "2,4 MiB" são 400 KB diferentes e os dois parecem
 * certos. A vitrine existe para a pessoa reconhecer o arquivo que ela enviou,
 * então o número tem de bater com o que o Explorer/Finder mostrou a ela.
 *
 * AS ABAS, A BUSCA E OS FILTROS entraram em 09/11/2026 e trouxeram o resto das
 * checagens: separar vídeo de workshop, derivar as opções dos seletores e
 * cruzar os três campos são decisões que erram CALADAS — a aba abre com menos
 * material do que tem e ninguém desconfia de nada.
 *
 * Rode com: npx tsx scripts/checks/vitrine.ts
 */
import {
  abaValida,
  anoDoItem,
  dataCurta,
  filtrarAcervo,
  nomeDoItem,
  nomeParaBaixar,
  opcoesDaColecao,
  resumoDoAcervo,
  rotuloDeTipoDeArquivo,
  rotuloDeTipoDeVideo,
  tamanhoLegivel,
  totalDeItens,
  urlDoArquivo,
  videosDaAba,
  type FiltroDaColecao,
  type ItemDaVitrine,
} from "../../src/lib/vitrine";
import type { VideoDaVitrine, Vitrine } from "../../src/lib/integration/connect-vitrine";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  console.log(`${ok ? "ok" : "FALHOU"} ${nome}`);
  if (!ok) {
    falhas++;
    console.log(`  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

// --- rótulos: valor conhecido traduz, desconhecido cai no cru ---------------

check("tipo de vídeo conhecido traduz", rotuloDeTipoDeVideo("WORKSHOP"), "Workshop");
check("tipo de vídeo DESCONHECIDO cai no cru", rotuloDeTipoDeVideo("PODCAST"), "PODCAST");
check("tipo de arquivo conhecido traduz", rotuloDeTipoDeArquivo("XLSX"), "Excel");
check("tipo de arquivo DESCONHECIDO cai no cru", rotuloDeTipoDeArquivo("SVG"), "SVG");
check("rótulo de string vazia é vazio", rotuloDeTipoDeArquivo(""), "");

// --- tamanho ----------------------------------------------------------------

check("zero bytes", tamanhoLegivel(0), "0 B");
check("abaixo de 1 kB fica em bytes", tamanhoLegivel(999), "999 B");
check("1000 bytes viram 1,0 kB (base 1000, como o Explorer)", tamanhoLegivel(1000), "1,0 kB");
check("2,4 MB", tamanhoLegivel(2_400_000), "2,4 MB");
check("abaixo de 10 leva uma casa", tamanhoLegivel(9_800_000), "9,8 MB");
check("de 10 para cima não leva casa", tamanhoLegivel(412_700_000), "413 MB");
check("sobe até GB", tamanhoLegivel(3_200_000_000), "3,2 GB");
// Vem de outro serviço: não pode virar "NaN B" na tela.
check("valor negativo não é exibido", tamanhoLegivel(-1), "");
check("NaN não é exibido", tamanhoLegivel(Number.NaN), "");
check("Infinity não é exibido", tamanhoLegivel(Number.POSITIVE_INFINITY), "");

// --- data -------------------------------------------------------------------

check("ISO vira data curta", dataCurta("2026-11-06T23:40:00.000Z"), "06/11/2026");
// 00:40 UTC do dia 7 ainda e dia 6 em Brasilia, e e o dia 6 que o Connect
// mostra. Em UTC a tela datava o material do dia seguinte ao do envio.
check("depois das 21:00 a data e a do fuso do negocio", dataCurta("2026-11-07T00:40:00.000Z"), "06/11/2026");
check("data ilegível vira vazio", dataCurta("nao-e-data"), "");

// --- resumo e filtro de vazias ---------------------------------------------

function vitrine(fotos: number, videos: number, documentos: number, slug = "v"): Vitrine {
  return {
    slug,
    label: `Vitrine ${slug}`,
    setor: "Marketing",
    fotos: Array.from({ length: fotos }, (_, i) => ({
      id: `f${i}`,
      title: `foto ${i}`,
      temporada: null,
      colecao: null,
      extensao: "webp",
      createdAt: "2026-11-06T00:00:00.000Z",
    })),
    videos: Array.from({ length: videos }, (_, i) => ({
      id: `v${i}`,
      title: `video ${i}`,
      kind: "VIDEO",
      isNew: false,
      tags: [],
      temporada: null,
      colecao: null,
      temArquivo: true,
      temMiniatura: false,
      extensao: "mp4",
      createdAt: "2026-11-06T00:00:00.000Z",
    })),
    documentos: Array.from({ length: documentos }, (_, i) => ({
      id: `d${i}`,
      name: `doc ${i}`,
      kind: "PDF",
      sizeBytes: 1000,
      tags: [],
      temporada: null,
      colecao: null,
      extensao: "pdf",
      createdAt: "2026-11-06T00:00:00.000Z",
    })),
    truncado: false,
  };
}

check("total soma os três tipos", totalDeItens(vitrine(12, 3, 1)), 16);
check("resumo com os três", resumoDoAcervo(vitrine(12, 3, 2)), "12 fotos · 3 vídeos · 2 documentos");
// "1 fotos" faz a pessoa duvidar do resto dos números da tela.
check("singular de cada tipo", resumoDoAcervo(vitrine(1, 1, 1)), "1 foto · 1 vídeo · 1 documento");
check("tipo com zero item é OMITIDO", resumoDoAcervo(vitrine(0, 4, 0)), "4 vídeos");
// A marca vazia PERMANECE no seletor e diz que esta vazia: some-la enquanto
// ninguem publicou faria a pessoa clicar em "Vitrine" e achar que quebrou.
check("vitrine vazia diz que esta vazia", resumoDoAcervo(vitrine(0, 0, 0)), "Nada publicado ainda");

// --- abas -------------------------------------------------------------------

check("aba conhecida passa", abaValida("workshop"), "workshop");
// `?aba=` vem da barra de endereço: link velho não pode virar tela de erro.
check("aba desconhecida cai na primeira", abaValida("aplicativos"), "fotos");
check("aba ausente cai na primeira", abaValida(undefined), "fotos");

function video(id: string, kind: string, extra: Partial<VideoDaVitrine> = {}): VideoDaVitrine {
  return {
    id,
    title: `video ${id}`,
    kind,
    isNew: false,
    tags: [],
    temporada: null,
    colecao: null,
    temArquivo: true,
    temMiniatura: false,
    extensao: "mp4",
    createdAt: "2026-11-06T00:00:00.000Z",
    ...extra,
  };
}

const videos = [video("a", "VIDEO"), video("b", "WORKSHOP"), video("c", "INSTRUCAO")];

check(
  "Workshop leva só os WORKSHOP",
  videosDaAba(videos, "workshop").map((v) => v.id),
  ["b"],
);
/*
 * E a outra aba leva TODO O RESTO, não só `kind === "VIDEO"`. É a divisão do
 * Connect (`lib/sector-data.ts`) e o motivo é o mesmo: um `kind` novo criado lá
 * aparece em "Vídeos da Coleção" em vez de desaparecer das duas abas — item
 * sumido sem aviso é o defeito que ninguém reporta.
 */
check(
  "Vídeos da Coleção leva todo o resto, inclusive kind novo",
  videosDaAba(videos, "videos").map((v) => v.id),
  ["a", "c"],
);

// --- ano --------------------------------------------------------------------

/*
 * NO FUSO DO NEGÓCIO, que é o ano que o CONNECT oferece no mesmo seletor: lá o
 * ano sai de `createdAt.getFullYear()` sob `TZ=America/Sao_Paulo`. Em UTC as
 * duas ferramentas discordavam de tudo publicado entre 21:00 e a meia-noite —
 * a peça que o Connect lista em "2025" só era achável em "2026" aqui, e o
 * filtro escondia material sem avisar. Corrigido em 09/11/2026.
 */
check("ano sai da data de publicação", anoDoItem("2026-06-10T12:00:00.000Z"), "2026");
check("01/01 às 01:00 UTC ainda é o ano anterior em Brasília", anoDoItem("2026-01-01T01:00:00.000Z"), "2025");
check("ano na virada do ano acompanha o fuso", anoDoItem("2025-12-31T23:59:00.000Z"), "2025");
// Mesmo fuso do `dataCurta`: o item que a tela mostra como 01/01/2026 tem de
// ser achável no filtro "2026", senão o seletor oferece um ano que a tela não
// escreve em lugar nenhum.
check("ano e data mostrada não discordam", anoDoItem("2026-01-01T03:00:00.000Z"), "2026");
check("ano e data mostrada vêm do mesmo dia", dataCurta("2026-01-01T03:00:00.000Z"), "01/01/2026");
check("data ilegível não vira ano", anoDoItem("nao-e-data"), "");

// --- opções dos seletores ---------------------------------------------------

const acervo: ItemDaVitrine[] = [
  { title: "Vestido Longo", temporada: "Verão", colecao: "Cápsula 1", createdAt: "2026-03-01T00:00:00.000Z" },
  { title: "Blazer Alfaiataria", temporada: "verão", colecao: "Cápsula 2", createdAt: "2025-09-01T00:00:00.000Z" },
  { title: "Camisa Linho", temporada: "Inverno", colecao: null, createdAt: "2026-07-01T00:00:00.000Z" },
  { title: "Sem cadastro", temporada: "  ", colecao: "", createdAt: "2026-07-02T00:00:00.000Z" },
];

const opcoes = opcoesDaColecao(acervo);
// "Verão" e "verão" são a MESMA temporada: duas opções na lista fariam a pessoa
// escolher uma e concluir que falta material.
check("temporadas distintas ignoram caixa e ordenam em pt-BR", opcoes.temporada, ["Inverno", "Verão"]);
check("campo em branco não entra como opção", opcoes.colecao, ["Cápsula 1", "Cápsula 2"]);
// Decrescente: a coleção atual é a que se procura.
check("anos vêm do createdAt, em ordem decrescente", opcoes.ano, ["2026", "2025"]);
check("acervo vazio não oferece filtro nenhum", opcoesDaColecao([]), {
  temporada: [],
  colecao: [],
  ano: [],
});

// --- busca e filtros --------------------------------------------------------

const SEM_FILTRO: FiltroDaColecao = { temporada: "", colecao: "", ano: "" };
const nomes = (itens: ItemDaVitrine[]) => itens.map(nomeDoItem);

check("sem busca nem filtro passa tudo", filtrarAcervo(acervo, "", SEM_FILTRO).length, 4);
// Ninguém digita o acento certo de um nome de arquivo inteiro.
check("busca por trecho, sem caixa", nomes(filtrarAcervo(acervo, "LINHO", SEM_FILTRO)), [
  "Camisa Linho",
]);
check("busca com espaços nas pontas", nomes(filtrarAcervo(acervo, "  vestido  ", SEM_FILTRO)), [
  "Vestido Longo",
]);
check("busca sem resultado devolve vazio", filtrarAcervo(acervo, "jaqueta", SEM_FILTRO), []);
check("filtro de temporada ignora a caixa do cadastro", nomes(
  filtrarAcervo(acervo, "", { ...SEM_FILTRO, temporada: "Verão" }),
), ["Vestido Longo", "Blazer Alfaiataria"]);
/*
 * INTERSEÇÃO, não união: "Verão" E "Cápsula 1" E "2026". Com união, escolher a
 * temporada certa e a coleção errada traria material das duas e a pessoa
 * acharia que o filtro não funciona.
 */
check("os três campos cruzam por interseção", nomes(
  filtrarAcervo(acervo, "", { temporada: "Verão", colecao: "Cápsula 1", ano: "2026" }),
), ["Vestido Longo"]);
check("um campo que não combina com os outros devolve vazio", filtrarAcervo(acervo, "", {
  temporada: "Verão",
  colecao: "Cápsula 1",
  ano: "2025",
}), []);
check("busca e filtro combinam", nomes(
  filtrarAcervo(acervo, "blazer", { ...SEM_FILTRO, ano: "2025" }),
), ["Blazer Alfaiataria"]);
// Item sem temporada cadastrada NÃO entra num filtro de temporada: ele é
// "sem informação", não "serve para qualquer uma".
check("item sem cadastro fica fora do filtro", filtrarAcervo(acervo, "", {
  ...SEM_FILTRO,
  temporada: "Inverno",
}).length, 1);

// --- nome do item e do download --------------------------------------------

check("nome de foto/vídeo sai do title", nomeDoItem({ title: "Foto 1", temporada: null, colecao: null, createdAt: "" }), "Foto 1");
check("nome de documento sai do name", nomeDoItem({ name: "Tabela.xlsx", temporada: null, colecao: null, createdAt: "" }), "Tabela.xlsx");

// Sem isto o arquivo chega ao computador como "arquivo", sem extensão.
check("extensão entra no nome", nomeParaBaixar("Catálogo", "PDF"), "Catálogo.pdf");
/*
 * A EXTENSÃO VEM DO ARQUIVO, NÃO DO `kind`, e esta é a checagem que guarda a
 * diferença: no Connect um .jpg é cadastrado com `kind: PNG` (o enum só tem
 * PNG para imagem). Usar o kind nomeava um JPEG de ".png" — download quebrado
 * em silêncio, achado no navegador em 09/11/2026.
 */
check("jpg com kind PNG baixa como .jpg", nomeParaBaixar("Catálogo Swan", "jpg"), "Catálogo Swan.jpg");
check("nome que já tem a extensão não duplica", nomeParaBaixar("Catálogo.pdf", "PDF"), "Catálogo.pdf");
check("extensão repetida ignora a caixa do nome", nomeParaBaixar("Catálogo.PDF", "pdf"), "Catálogo.PDF");
check("ponto na extensão não vira dois", nomeParaBaixar("Tabela", ".xlsx"), "Tabela.xlsx");
// O formato do vídeo não atravessa a integração: o navegador completa.
check("sem extensão conhecida, nome inalterado", nomeParaBaixar("Workshop Verão", ""), "Workshop Verão");
check("nome vazio não gera arquivo sem nome", nomeParaBaixar("   ", "PDF"), "arquivo.pdf");
// Resposta EM CACHE de antes do campo existir não pode derrubar a tela.
check("extensão ausente não quebra", nomeParaBaixar("Catálogo", undefined), "Catálogo");

// --- endereço dos bytes -----------------------------------------------------

// Rota DESTA aplicação (sessão e papel daqui), e não um link ao Connect.
check(
  "url do arquivo aponta para a rota local",
  urlDoArquivo("documento", "ckx1"),
  "/api/vendas/vitrine/arquivo?tipo=documento&id=ckx1",
);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("vitrine: todas as checagens passaram.");
