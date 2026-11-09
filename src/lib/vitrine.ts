import type { Role } from "@prisma/client";
import { FUSO_NEGOCIO } from "@/lib/rank-window";
import type {
  TipoDeArquivoDaVitrine,
  VideoDaVitrine,
  Vitrine,
} from "@/lib/integration/connect-vitrine";

/**
 * Leitura da vitrine. PURO: nada aqui vai à rede nem ao banco, para poder ser
 * conferido por script.
 *
 * TODO RÓTULO CAI NO VALOR CRU quando não conhece a chave — a mesma regra do
 * cronograma, pelo mesmo motivo. O vocabulário (tipo de vídeo, tipo de arquivo)
 * é definido no OUTRO repositório: o dia em que o Connect criar um `FileKind`
 * novo lá, esta tela mostraria "undefined" num acervo que parece completo.
 * Mostrar "SVG" sem tradução é feio; mostrar "undefined" é defeito.
 */

/** `VideoKind` do Connect. */
const TIPO_DE_VIDEO: Record<string, string> = {
  VIDEO: "Vídeo",
  WORKSHOP: "Workshop",
  INSTRUCAO: "Instrução",
};

/** `FileKind` do Connect. */
const TIPO_DE_ARQUIVO: Record<string, string> = {
  PDF: "PDF",
  DOCX: "Word",
  XLSX: "Excel",
  PPTX: "PowerPoint",
  PNG: "Imagem",
};

const rotulo = (mapa: Record<string, string>, chave: string | null) =>
  chave ? (mapa[chave] ?? chave) : "";

export const rotuloDeTipoDeVideo = (v: string) => rotulo(TIPO_DE_VIDEO, v);
export const rotuloDeTipoDeArquivo = (v: string) => rotulo(TIPO_DE_ARQUIVO, v);

/**
 * Tamanho em bytes como a pessoa lê.
 *
 * Base 1000 e não 1024: é o que o Explorer do Windows e o Finder mostram, e a
 * vitrine existe para a pessoa reconhecer o arquivo que ela enviou — "2,4 MB"
 * tem de bater com o que o sistema dela disse.
 *
 * Valor inválido vira string vazia, não "NaN B": o número vem de outro serviço.
 */
export function tamanhoLegivel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1000) return `${Math.round(bytes)} B`;
  const unidades = ["kB", "MB", "GB", "TB"];
  let valor = bytes / 1000;
  let i = 0;
  while (valor >= 1000 && i < unidades.length - 1) {
    valor /= 1000;
    i += 1;
  }
  // Uma casa decimal só abaixo de 10: "9,8 MB" informa, "412,7 MB" é ruído.
  const casas = valor < 10 ? 1 : 0;
  return `${valor.toFixed(casas).replace(".", ",")} ${unidades[i]}`;
}

/** Quantos itens a vitrine tem, somando os três tipos. */
export function totalDeItens(v: Vitrine): number {
  return v.fotos.length + v.videos.length + v.documentos.length;
}

/**
 * Resumo de uma vitrine em uma linha: "12 fotos · 3 vídeos · 1 documento".
 *
 * Tipo com zero item é OMITIDO, e o singular é tratado: "1 fotos" é o tipo de
 * descuido que faz a pessoa duvidar do resto do número na tela.
 *
 * VITRINE VAZIA DIZ QUE ESTÁ VAZIA, e não some da lista. A marca existe no
 * Connect tenha ela material ou não, e esconder a marca enquanto ninguém
 * publicou faria o seletor aparecer sozinho, meio vazio ou nem aparecer —
 * a pessoa clica em "Vitrine" e conclui que a tela quebrou. Dizer "nada
 * publicado ainda" responde a pergunta; sumir cria outra.
 */
export function resumoDoAcervo(v: Vitrine): string {
  const partes: string[] = [];
  const conta = (n: number, um: string, muitos: string) => {
    if (n > 0) partes.push(`${n} ${n === 1 ? um : muitos}`);
  };
  conta(v.fotos.length, "foto", "fotos");
  conta(v.videos.length, "vídeo", "vídeos");
  conta(v.documentos.length, "documento", "documentos");
  return partes.length === 0 ? "Nada publicado ainda" : partes.join(" · ");
}

/**
 * Data curta (`dd/mm/aaaa`) de um ISO do Connect. Ilegível vira vazio.
 *
 * NO FUSO DO NEGÓCIO, não em UTC: o Connect resolve a data da vitrine com
 * `createdAt.getFullYear()` rodando sob `TZ=America/Sao_Paulo` (Dockerfile de
 * lá). Em UTC, material publicado depois das 21:00 aparecia aqui com a data do
 * dia seguinte e filtrado sob outro ano — ver `anoDoItem`.
 */
export function dataCurta(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: FUSO_NEGOCIO });
}

// ─────────────────────────────────────────────────────────────────────────────
// Abas, busca e filtros — o mesmo recorte que o Connect oferece na vitrine.
//
// AS QUATRO ABAS SÃO AS DE LÁ (pedido de 09/11/2026), e nenhuma delas é um
// pedido novo ao Connect: "Vídeos da Coleção" e "Workshop" são os MESMOS
// vídeos, separados pelo `kind` que a listagem já manda. Criar uma consulta por
// aba seria quatro idas à rede para dividir uma lista que já chegou.
//
// Tudo aqui é PURO e roda no servidor: o acervo tem teto de 100 itens por tipo,
// então filtrar na renderização é mais barato que mandar a lista ao navegador
// para ele filtrar — e a tela continua sem JavaScript para isso.
// ─────────────────────────────────────────────────────────────────────────────

export type AbaDaVitrine = "fotos" | "videos" | "workshop" | "material";

/** Rótulos COPIADOS do Connect (`components/sector/sector-page.tsx`). */
export const ABAS_DA_VITRINE: readonly { id: AbaDaVitrine; label: string }[] = [
  { id: "fotos", label: "Fotos da Coleção" },
  { id: "videos", label: "Vídeos da Coleção" },
  { id: "workshop", label: "Workshop" },
  { id: "material", label: "Material de Apoio" },
];

/**
 * Aba pedida na URL, ou a primeira. Valor estranho em `?aba=` cai na primeira
 * em vez de dar erro: o parâmetro vem da barra de endereço, e um link velho não
 * deve virar tela quebrada — é a mesma postura do `?vitrine=` ao lado.
 */
export function abaValida(valor: string | undefined): AbaDaVitrine {
  return ABAS_DA_VITRINE.some((a) => a.id === valor) ? (valor as AbaDaVitrine) : "fotos";
}

/**
 * Os vídeos de uma das duas abas de vídeo.
 *
 * `WORKSHOP` numa, TODO O RESTO na outra — e é de propósito que não seja
 * `kind === "VIDEO"`: é exatamente a divisão do Connect
 * (`lib/sector-data.ts`), e um `kind` novo lá apareceria em "Vídeos da
 * Coleção" em vez de desaparecer das duas abas sem aviso.
 */
export function videosDaAba(
  videos: readonly VideoDaVitrine[],
  aba: AbaDaVitrine,
): VideoDaVitrine[] {
  return videos.filter((v) => (aba === "workshop" ? v.kind === "WORKSHOP" : v.kind !== "WORKSHOP"));
}

/**
 * O que a busca e os filtros precisam de um item, seja foto, vídeo ou
 * documento. `title` nos dois primeiros, `name` no terceiro — os dois
 * opcionais para esta camada não precisar de uma união com estreitamento.
 */
export interface ItemDaVitrine {
  title?: string;
  name?: string;
  temporada: string | null;
  colecao: string | null;
  createdAt: string;
}

/** Nome exibido e buscável do item. */
export const nomeDoItem = (item: ItemDaVitrine): string => item.title ?? item.name ?? "";

/**
 * Ano do item: o da PUBLICAÇÃO, não uma coluna — é assim no Connect, onde a
 * decisão foi não gravar uma segunda cópia da data para as duas discordarem.
 *
 * NO FUSO DO NEGÓCIO, que é o ano que o CONNECT oferece no mesmo seletor
 * (`lib/collection-filters` lê `createdAt.getFullYear()` sob
 * `TZ=America/Sao_Paulo`). Em UTC as duas ferramentas discordavam para tudo
 * publicado entre 21:00 e a meia-noite: a peça que aparece como "2025" lá só
 * era encontrada em "2026" aqui — filtro que esconde material sem avisar.
 *
 * Mesmo fuso do `dataCurta` acima, e isso é obrigatório: um item que a tela
 * mostra como 01/01/2026 tem de ser achável no filtro "2026".
 */
export function anoDoItem(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("pt-BR", { year: "numeric", timeZone: FUSO_NEGOCIO });
}

/** Filtro ativo. Campo vazio = "todas". */
export interface FiltroDaColecao {
  temporada: string;
  colecao: string;
  ano: string;
}

export const FILTRO_VAZIO: FiltroDaColecao = { temporada: "", colecao: "", ano: "" };

export const temFiltro = (f: FiltroDaColecao) => Boolean(f.temporada || f.colecao || f.ano);

/**
 * Valores distintos, ignorando caixa. O rótulo exibido é a primeira grafia que
 * apareceu: listar "Verão" e "verão" como duas opções faria a pessoa escolher a
 * errada e achar que falta material.
 */
function distintos(valores: readonly (string | null | undefined)[]): string[] {
  const vistos = new Map<string, string>();
  for (const valor of valores) {
    const rotulo = valor?.trim();
    if (!rotulo) continue;
    const chave = rotulo.toLowerCase();
    if (!vistos.has(chave)) vistos.set(chave, rotulo);
  }
  return [...vistos.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/**
 * As opções dos três seletores são o que está EM USO nos itens da aba — não um
 * cadastro à parte. Assim nenhum seletor oferece uma temporada sem conteúdo, e
 * um seletor sem opção nenhuma pode ser escondido pela tela: controle que
 * promete filtrar e não filtra é pior que controle ausente.
 */
export function opcoesDaColecao(itens: readonly ItemDaVitrine[]): {
  temporada: string[];
  colecao: string[];
  ano: string[];
} {
  return {
    temporada: distintos(itens.map((i) => i.temporada)),
    colecao: distintos(itens.map((i) => i.colecao)),
    // Decrescente: a coleção atual é a que se procura.
    ano: distintos(itens.map((i) => anoDoItem(i.createdAt))).reverse(),
  };
}

/** Campo vazio no filtro passa tudo; preenchido, exige igualdade sem caixa. */
const bate = (valor: string | null | undefined, pedido: string) =>
  !pedido || (valor ?? "").trim().toLowerCase() === pedido.trim().toLowerCase();

/**
 * Busca por nome mais os três campos da coleção.
 *
 * Os três combinam por INTERSEÇÃO ("Verão" E "Cápsula 1" E "2026"), como no
 * Connect: é assim que se procura uma peça numa vitrine. A busca é por trecho
 * do nome, sem caixa — ninguém digita o acento certo de um nome de arquivo.
 */
export function filtrarAcervo<T extends ItemDaVitrine>(
  itens: readonly T[],
  busca: string,
  filtro: FiltroDaColecao,
): T[] {
  const termo = busca.trim().toLowerCase();
  return itens.filter(
    (i) =>
      nomeDoItem(i).toLowerCase().includes(termo) &&
      bate(i.temporada, filtro.temporada) &&
      bate(i.colecao, filtro.colecao) &&
      bate(anoDoItem(i.createdAt), filtro.ano),
  );
}

/**
 * Endereço dos bytes de um item, na rota desta aplicação (não no Connect).
 *
 * Mesma origem de propósito: é o que faz `<a download>` baixar com o nome que
 * a tela mostra em vez de abrir uma aba, e o que mantém a sessão do Flow como
 * portão de quem pede.
 */
export const urlDoArquivo = (tipo: TipoDeArquivoDaVitrine, id: string): string =>
  `/api/vendas/vitrine/arquivo?${new URLSearchParams({ tipo, id })}`;

/**
 * Quem abre a Vitrine — e, por isso mesmo, quem pode pedir os bytes dela.
 *
 * Exportado para a página e a rota de arquivo usarem a MESMA lista: duas
 * cópias divergem no dia em que um papel entra, e a divergência silenciosa
 * aqui é um arquivo acessível a quem não vê a tela.
 */
export const PAPEIS_DA_VITRINE: Role[] = ["VENDAS", "GESTAO", "FINANCEIRO"];

/**
 * Nome do arquivo quando a pessoa baixa.
 *
 * O Connect serve os bytes sem nome de arquivo no `Content-Disposition` (a
 * entrega de lá é compartilhada com outras rotas e não carrega nome), então
 * quem nomeia é o `download` do link daqui. Sem isso o arquivo chegaria ao
 * computador chamado "arquivo", sem extensão, e ninguém saberia o que abriu.
 *
 * A extensão é a REAL, lida do arquivo gravado no Connect — nunca o `kind`.
 * `FileKind` é categoria, não formato: um .jpg é cadastrado como `PNG`, e
 * nomear pelo kind entregava um JPEG chamado ".png". Só é acrescentada quando
 * o nome ainda não termina nela — "Catálogo.pdf" não vira "Catálogo.pdf.pdf".
 *
 * `extensao` vazia devolve o nome como está: é o caso do vídeo cadastrado sem
 * arquivo. O navegador completa pelo tipo da resposta nesse caso.
 *
 * AUSENTE TAMBÉM É VAZIA, e não um erro: o campo vem do Connect, e nos cinco
 * minutos seguintes a um deploy a resposta EM CACHE ainda é a de antes dele
 * existir. Um `.trim()` em `undefined` derrubaria a tela inteira por causa de
 * um nome de download — mesma postura do `tamanhoLegivel` com número inválido.
 */
export function nomeParaBaixar(nome: string, extensao: string | undefined): string {
  const limpo = nome.trim() || "arquivo";
  const ext = (extensao ?? "").trim().toLowerCase().replace(/^\./, "");
  if (!ext) return limpo;
  return limpo.toLowerCase().endsWith(`.${ext}`) ? limpo : `${limpo}.${ext}`;
}
