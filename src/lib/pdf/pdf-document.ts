import { deflateSync } from "node:zlib";
import {
  FALLBACK_WIDTH,
  HELVETICA_BOLD_WIDTHS,
  HELVETICA_WIDTHS,
} from "@/lib/pdf/helvetica-metrics";

/**
 * GERADOR DE PDF — Build.Flow
 * ---------------------------------------------------------------------------
 * Escritor de PDF 1.4 mínimo, porém completo para relatórios: paginação
 * automática, quebra de linha por métrica real da fonte, retângulos, réguas e
 * rodapé com "Página X de Y".
 *
 * POR QUE NÃO USAR UMA BIBLIOTECA
 * A VPS roda a imagem Docker do Next em modo `standalone`, que copia apenas os
 * arquivos rastreados pelo build. Bibliotecas de PDF dependem de assets em
 * disco (arquivos .afm) ou de um Chromium headless — os dois casos quebram ou
 * incham o contêiner. Aqui usamos apenas as fontes base-14, que TODO leitor de
 * PDF já possui: nada é embarcado, nada é baixado, e o arquivo final fica na
 * casa de dezenas de KB.
 *
 * SISTEMA DE COORDENADAS
 * O PDF tem origem no canto INFERIOR esquerdo, o que é péssimo para escrever
 * um relatório de cima para baixo. Esta classe expõe um cursor `y` medido a
 * partir do TOPO da página e converte na hora de emitir os operadores.
 *
 * Uso exclusivo em runtime Node (usa `node:zlib` para comprimir os streams).
 */

/** Ponto tipográfico: 1 pt = 1/72". Referência para as medidas abaixo. */
export const PT_PER_MM = 72 / 25.4;

/** A4 retrato em pontos. */
export const A4 = { width: 595.28, height: 841.89 } as const;

export type PdfFont = "regular" | "bold";

export interface PdfColor {
  r: number;
  g: number;
  b: number;
}

/** Cor a partir de canais 0–255 (mais legível do que 0–1 no código de layout). */
export function rgb(r: number, g: number, b: number): PdfColor {
  return { r: r / 255, g: g / 255, b: b / 255 };
}

export interface TextOptions {
  size?: number;
  font?: PdfFont;
  color?: PdfColor;
  /** Deslocamento horizontal a partir da margem esquerda. */
  indent?: number;
  /** Largura máxima da linha; o padrão é o restante da faixa útil. */
  maxWidth?: number;
  /** Multiplicador da altura de linha (padrão 1.25). */
  lineHeight?: number;
  /** Espaço extra somado depois do último baseline. */
  spacing?: number;
  align?: "left" | "right" | "center";
}

export interface PdfDocumentOptions {
  marginTop?: number;
  marginBottom?: number;
  marginX?: number;
  title?: string;
  author?: string;
}

/* -------------------------------------------------------------------------- */
/* Codificação de texto (WinAnsi)                                             */
/* -------------------------------------------------------------------------- */

/**
 * Caracteres do intervalo 0x80–0x9F do WinAnsi que NÃO coincidem com Unicode
 * (aspas tipográficas, travessão, reticências…). Fora desse intervalo a
 * codificação é idêntica ao Latin-1, logo o próprio code point serve de byte.
 */
const WINANSI_SPECIALS: Record<number, number> = {
  0x20ac: 128, 0x201a: 130, 0x0192: 131, 0x201e: 132, 0x2026: 133,
  0x2020: 134, 0x2021: 135, 0x02c6: 136, 0x2030: 137, 0x0160: 138,
  0x2039: 139, 0x0152: 140, 0x017d: 142, 0x2018: 145, 0x2019: 146,
  0x201c: 147, 0x201d: 148, 0x2022: 149, 0x2013: 150, 0x2014: 151,
  0x02dc: 152, 0x2122: 153, 0x0161: 154, 0x203a: 155, 0x0153: 156,
  0x017e: 158, 0x0178: 159,
};

/** Converte UM caractere para o byte WinAnsi correspondente (null se não houver). */
function charToByte(ch: string): number | null {
  const code = ch.codePointAt(0);
  if (code === undefined) return null;
  if (code >= 0x20 && code <= 0x7e) return code;
  if (code >= 0xa0 && code <= 0xff) return code;
  const special = WINANSI_SPECIALS[code];
  return special ?? null;
}

/**
 * Texto (UTF-16 do JS) → bytes WinAnsi.
 *
 * O que não existe na tabela é decomposto (NFKD) para aproveitar a letra base
 * — assim "ā" vira "a" em vez de sumir — e, se ainda assim não houver glifo,
 * cai para "?". Isso evita que uma observação colada com emoji corrompa o
 * arquivo inteiro.
 */
export function encodeWinAnsi(text: string): number[] {
  const bytes: number[] = [];
  for (const ch of text) {
    const direct = charToByte(ch);
    if (direct !== null) {
      bytes.push(direct);
      continue;
    }
    let resolvido = false;
    for (const base of ch.normalize("NFKD")) {
      // Ignora marcas de combinação (acentos soltos após a decomposição).
      const cp = base.codePointAt(0) ?? 0;
      if (cp >= 0x0300 && cp <= 0x036f) continue;
      const b = charToByte(base);
      if (b !== null) {
        bytes.push(b);
        resolvido = true;
      }
    }
    if (!resolvido) bytes.push(0x3f); // "?"
  }
  return bytes;
}

/** Escapa os bytes para uma string literal de PDF: `( ... )`. */
function pdfString(text: string): string {
  let out = "(";
  for (const b of encodeWinAnsi(text)) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) {
      out += "\\" + String.fromCharCode(b);
    } else if (b < 32 || b > 126) {
      out += "\\" + b.toString(8).padStart(3, "0");
    } else {
      out += String.fromCharCode(b);
    }
  }
  return out + ")";
}

/** Número no formato aceito pelo PDF (sem notação científica). */
function num(v: number): string {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
}

/* -------------------------------------------------------------------------- */
/* Documento                                                                  */
/* -------------------------------------------------------------------------- */

export class PdfDocument {
  readonly width = A4.width;
  readonly height = A4.height;
  readonly marginTop: number;
  readonly marginBottom: number;
  readonly marginX: number;

  private readonly title: string;
  private readonly author: string;

  /** Operadores de conteúdo acumulados por página. */
  private readonly pages: string[][] = [];
  private current = -1;

  /** Cursor vertical medido a partir do TOPO da página atual. */
  y = 0;

  /** Callback disparado no início de cada página (cabeçalho fixo). */
  onPageStart?: (doc: PdfDocument, pageNumber: number) => void;
  /** Callback disparado na finalização, com o total de páginas já conhecido. */
  onPageEnd?: (doc: PdfDocument, pageNumber: number, totalPages: number) => void;

  constructor(opts: PdfDocumentOptions = {}) {
    this.marginTop = opts.marginTop ?? 42;
    this.marginBottom = opts.marginBottom ?? 46;
    this.marginX = opts.marginX ?? 40;
    this.title = opts.title ?? "Relatório";
    this.author = opts.author ?? "Build.Flow";
    this.addPage();
  }

  /** Largura útil entre as margens laterais. */
  get contentWidth(): number {
    return this.width - this.marginX * 2;
  }

  /** Espaço vertical ainda disponível na página atual. */
  get remaining(): number {
    return this.height - this.marginBottom - this.y;
  }

  get pageCount(): number {
    return this.pages.length;
  }

  private push(op: string): void {
    this.pages[this.current].push(op);
  }

  addPage(): void {
    this.pages.push([]);
    this.current = this.pages.length - 1;
    this.y = this.marginTop;
    this.onPageStart?.(this, this.current + 1);
  }

  /** Altura útil de uma página vazia (entre as margens). */
  get usableHeight(): number {
    return this.height - this.marginTop - this.marginBottom;
  }

  /**
   * Garante `h` pontos livres; se não houver, quebra a página. Retorna true
   * quando houve quebra.
   *
   * A reserva é limitada a ~35% da página útil de propósito: um bloco enorme
   * (uma observação de vinte linhas colada pela Logística) não cabe em página
   * nenhuma, e reservar a altura cheia só produziria uma página em branco
   * antes dele. Acima desse teto basta haver espaço para começar — o texto
   * pagina sozinho linha a linha.
   */
  ensureSpace(h: number): boolean {
    const alvo = Math.min(h, this.usableHeight * 0.35);
    if (this.remaining >= alvo) return false;
    this.addPage();
    return true;
  }

  moveDown(h: number): void {
    this.y += h;
  }

  /* ---------------------------------------------------------------- medidas */

  /** Largura do texto em pontos, pela métrica real da fonte. */
  textWidth(text: string, size: number, font: PdfFont = "regular"): number {
    const table = font === "bold" ? HELVETICA_BOLD_WIDTHS : HELVETICA_WIDTHS;
    let total = 0;
    for (const b of encodeWinAnsi(text)) {
      total += table[b] || FALLBACK_WIDTH;
    }
    return (total * size) / 1000;
  }

  /**
   * Quebra o texto em linhas que caibam em `maxWidth`. Respeita as quebras
   * já existentes e, no pior caso (uma "palavra" maior que a linha — código de
   * rastreio, URL colada na observação), parte a palavra por caractere.
   */
  wrap(text: string, maxWidth: number, size: number, font: PdfFont = "regular"): string[] {
    const linhas: string[] = [];

    for (const paragrafo of String(text).split(/\r?\n/)) {
      const palavras = paragrafo.split(/\s+/).filter(Boolean);
      if (palavras.length === 0) {
        linhas.push("");
        continue;
      }

      let atual = "";
      for (const palavra of palavras) {
        const tentativa = atual ? `${atual} ${palavra}` : palavra;
        if (this.textWidth(tentativa, size, font) <= maxWidth) {
          atual = tentativa;
          continue;
        }
        if (atual) linhas.push(atual);

        if (this.textWidth(palavra, size, font) <= maxWidth) {
          atual = palavra;
          continue;
        }
        // Palavra sozinha estoura a linha: parte por caractere.
        let pedaco = "";
        for (const ch of palavra) {
          if (this.textWidth(pedaco + ch, size, font) > maxWidth && pedaco) {
            linhas.push(pedaco);
            pedaco = ch;
          } else {
            pedaco += ch;
          }
        }
        atual = pedaco;
      }
      if (atual) linhas.push(atual);
    }

    return linhas.length ? linhas : [""];
  }

  /* --------------------------------------------------------------- desenho */

  /** Texto em posição ABSOLUTA (x, y a partir do topo) — não move o cursor. */
  drawText(
    text: string,
    x: number,
    yFromTop: number,
    opts: { size?: number; font?: PdfFont; color?: PdfColor } = {},
  ): void {
    const size = opts.size ?? 10;
    const fontRef = (opts.font ?? "regular") === "bold" ? "/F2" : "/F1";
    const c = opts.color ?? { r: 0.1, g: 0.1, b: 0.1 };
    const yPdf = this.height - yFromTop;
    this.push(
      `${num(c.r)} ${num(c.g)} ${num(c.b)} rg BT ${fontRef} ${num(size)} Tf ` +
        `1 0 0 1 ${num(x)} ${num(yPdf)} Tm ${pdfString(text)} Tj ET`,
    );
  }

  /**
   * Escreve um bloco de texto com quebra automática a partir do cursor,
   * paginando sozinho quando necessário. Devolve a altura consumida.
   */
  text(content: string, opts: TextOptions = {}): number {
    const size = opts.size ?? 10;
    const font = opts.font ?? "regular";
    const lineHeight = (opts.lineHeight ?? 1.25) * size;
    const indent = opts.indent ?? 0;
    const maxWidth = opts.maxWidth ?? this.contentWidth - indent;
    const align = opts.align ?? "left";
    const yInicial = this.y;

    for (const linha of this.wrap(content, maxWidth, size, font)) {
      this.ensureSpace(lineHeight);
      let x = this.marginX + indent;
      if (align !== "left") {
        const sobra = maxWidth - this.textWidth(linha, size, font);
        x += align === "right" ? sobra : sobra / 2;
      }
      // O baseline fica próximo da base da caixa de linha.
      this.drawText(linha, x, this.y + size * 0.92, { size, font, color: opts.color });
      this.y += lineHeight;
    }

    if (opts.spacing) this.y += opts.spacing;
    return this.y - yInicial;
  }

  /** Retângulo preenchido (x, y a partir do topo). */
  rect(x: number, yFromTop: number, w: number, h: number, color: PdfColor): void {
    const yPdf = this.height - yFromTop - h;
    this.push(
      `${num(color.r)} ${num(color.g)} ${num(color.b)} rg ` +
        `${num(x)} ${num(yPdf)} ${num(w)} ${num(h)} re f`,
    );
  }

  /** Régua horizontal na posição do cursor (ou em `yFromTop`, se informado). */
  hr(color: PdfColor, opts: { yFromTop?: number; width?: number; inset?: number } = {}): void {
    const y = opts.yFromTop ?? this.y;
    const inset = opts.inset ?? 0;
    this.rect(this.marginX + inset, y, this.contentWidth - inset, opts.width ?? 0.6, color);
  }

  /* ------------------------------------------------------------ finalização */

  /** Executa `fn` com o cursor posicionado em outra página (usado no rodapé). */
  private withPage(index: number, fn: () => void): void {
    const anterior = this.current;
    const anteriorY = this.y;
    this.current = index;
    fn();
    this.current = anterior;
    this.y = anteriorY;
  }

  /**
   * Serializa o documento. Chame apenas uma vez: o rodapé é aplicado aqui,
   * quando o total de páginas finalmente é conhecido.
   *
   * Devolve ArrayBuffer (e não Uint8Array/Buffer) porque é o único formato
   * aceito como corpo de Response sem cast em qualquer combinação de
   * lib.dom + @types/node — detalhe que já quebrou build de Next antes.
   */
  toArrayBuffer(): ArrayBuffer {
    if (this.onPageEnd) {
      const total = this.pages.length;
      for (let i = 0; i < total; i++) {
        this.withPage(i, () => this.onPageEnd?.(this, i + 1, total));
      }
    }

    const objetos: Buffer[] = [];
    const add = (corpo: string | Buffer): number => {
      objetos.push(Buffer.isBuffer(corpo) ? corpo : Buffer.from(corpo, "latin1"));
      return objetos.length; // número do objeto (1-based)
    };

    // 1 catálogo · 2 páginas · 3/4 fontes — números fixos, referenciados abaixo.
    add("<< /Type /Catalog /Pages 2 0 R >>");
    const idxPages = add(""); // preenchido no fim, quando os Kids existirem
    add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

    const idsPaginas: number[] = [];
    for (const ops of this.pages) {
      const conteudo = deflateSync(Buffer.from(ops.join("\n"), "latin1"));
      const idConteudo = add(
        Buffer.concat([
          Buffer.from(
            `<< /Length ${conteudo.length} /Filter /FlateDecode >>\nstream\n`,
            "latin1",
          ),
          conteudo,
          Buffer.from("\nendstream", "latin1"),
        ]),
      );
      idsPaginas.push(
        add(
          `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(this.width)} ${num(this.height)}] ` +
            `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${idConteudo} 0 R >>`,
        ),
      );
    }

    objetos[idxPages - 1] = Buffer.from(
      `<< /Type /Pages /Kids [${idsPaginas.map((n) => `${n} 0 R`).join(" ")}] ` +
        `/Count ${idsPaginas.length} >>`,
      "latin1",
    );

    const agora = new Date();
    const d2 = (n: number) => String(n).padStart(2, "0");
    const data =
      `D:${agora.getFullYear()}${d2(agora.getMonth() + 1)}${d2(agora.getDate())}` +
      `${d2(agora.getHours())}${d2(agora.getMinutes())}${d2(agora.getSeconds())}`;
    const idInfo = add(
      `<< /Title ${pdfString(this.title)} /Author ${pdfString(this.author)} ` +
        `/Producer ${pdfString("Build.Flow")} /CreationDate ${pdfString(data)} >>`,
    );

    // Montagem final com a tabela de referência cruzada (xref).
    const partes: Buffer[] = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1")];
    let offset = partes[0].length;
    const offsets: number[] = [];

    objetos.forEach((corpo, i) => {
      const bloco = Buffer.concat([
        Buffer.from(`${i + 1} 0 obj\n`, "latin1"),
        corpo,
        Buffer.from("\nendobj\n", "latin1"),
      ]);
      offsets.push(offset);
      offset += bloco.length;
      partes.push(bloco);
    });

    let xref = `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
    for (const o of offsets) xref += `${String(o).padStart(10, "0")} 00000 n \n`;
    xref +=
      `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R /Info ${idInfo} 0 R >>\n` +
      `startxref\n${offset}\n%%EOF\n`;
    partes.push(Buffer.from(xref, "latin1"));

    const arquivo = Buffer.concat(partes);
    const saida = new ArrayBuffer(arquivo.byteLength);
    new Uint8Array(saida).set(arquivo);
    return saida;
  }
}
