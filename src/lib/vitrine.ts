import type { Vitrine } from "@/lib/integration/connect-vitrine";

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
 * As vitrines que têm algo para mostrar, na ordem que o Connect mandou.
 *
 * VITRINE VAZIA SAI DA LISTA: um subsetor marcado como vitrine e ainda sem
 * material viraria um card vazio que a pessoa clica, não encontra nada e
 * conclui que a tela está quebrada. A ordem NÃO é recalculada aqui — ela vem de
 * `sector.order` + `order` do Connect, que é a ordem que as pessoas já conhecem
 * da barra lateral de lá.
 */
export function vitrinesComAcervo(vitrines: Vitrine[]): Vitrine[] {
  return vitrines.filter((v) => totalDeItens(v) > 0);
}

/**
 * Resumo de uma vitrine em uma linha: "12 fotos · 3 vídeos · 1 documento".
 *
 * Tipo com zero item é OMITIDO, e o singular é tratado: "1 fotos" é o tipo de
 * descuido que faz a pessoa duvidar do resto do número na tela.
 */
export function resumoDoAcervo(v: Vitrine): string {
  const partes: string[] = [];
  const conta = (n: number, um: string, muitos: string) => {
    if (n > 0) partes.push(`${n} ${n === 1 ? um : muitos}`);
  };
  conta(v.fotos.length, "foto", "fotos");
  conta(v.videos.length, "vídeo", "vídeos");
  conta(v.documentos.length, "documento", "documentos");
  return partes.join(" · ");
}

/** Data curta (`dd/mm/aaaa`) de um ISO do Connect. Ilegível vira vazio. */
export function dataCurta(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
}
