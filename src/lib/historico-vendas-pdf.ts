import { PdfDocument, rgb, type PdfColor } from "@/lib/pdf/pdf-document";

/**
 * RELATÓRIO DE HISTÓRICO DE VENDAS EM PDF — camada de LAYOUT.
 *
 * Nada é consultado aqui: recebe as linhas já carregadas e as diagrama em A4,
 * como `atrasos-pdf.ts` e `pendencias-pdf.ts` fazem. O que mantém a exportação
 * fiel à tela é o `where` compartilhado (historico-vendas-query.ts), não este
 * arquivo.
 *
 * TRÊS COLUNAS, e só: vendedora, número do pedido e valor. É o escopo pedido.
 * Acrescentar cliente ou data "porque cabe" mudaria o que o relatório é — e um
 * relatório de vendas com nome de cliente circula diferente de um sem.
 */

/** O contêiner roda em UTC; sem fixar o fuso o rodapé sai 3h adiantado. */
const TZ = "America/Fortaleza";

const COR = {
  tinta: rgb(23, 23, 23),
  suave: rgb(110, 110, 110),
  linha: rgb(222, 222, 222),
  faixa: rgb(238, 240, 243),
  marca: rgb(17, 24, 39),
  alerta: rgb(185, 28, 28),
  alertaFundo: rgb(254, 240, 240),
  zebra: rgb(250, 250, 251),
} satisfies Record<string, PdfColor>;

export interface HistoricoPdfRow {
  sellerName: string;
  orderNumber: string;
  /** Valor em número; a formatação em R$ é feita aqui. */
  total: number;
}

export interface HistoricoPdfMeta {
  filtros: string;
  /** Nome de quem gerou — o relatório é auditável. */
  geradoPor: string;
  /** Escopo do arquivo, para quem o receber saber de quem ele é. */
  escopo: string;
  /** Total de pedidos no filtro, mesmo que o PDF esteja truncado. */
  totalFiltro: number;
  limiteAplicado?: number;
}

function fmtDataHora(d: Date): string {
  return d.toLocaleString("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * `Intl` direto, e não a `formatBRL` do app: aquela devolve o cifrão seguido de
 * espaço NÃO-QUEBRÁVEL (U+00A0), que sai como outro caractere na codificação
 * WinAnsi do PDF.
 */
const fmtBRL = (v: number) =>
  "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Corta com reticências para caber na largura, medindo de verdade. */
function cortar(doc: PdfDocument, texto: string, largura: number, size: number): string {
  if (doc.textWidth(texto, size) <= largura) return texto;
  let corte = texto;
  while (corte.length > 1 && doc.textWidth(corte + "...", size) > largura) {
    corte = corte.slice(0, -1);
  }
  return corte + "...";
}

/* -------------------------------------------------------------------------- */

const LINHA_ALTURA = 18;
const CABECALHO_ALTURA = 20;

export function gerarHistoricoPdf(
  linhas: HistoricoPdfRow[],
  meta: HistoricoPdfMeta,
): ArrayBuffer {
  const doc = new PdfDocument({
    marginTop: 40,
    marginBottom: 48,
    marginX: 40,
    title: "Relatório de Histórico de Vendas — Build.Flow",
    author: "Build.Flow",
  });

  const geradoEm = fmtDataHora(new Date());

  // Colunas: valor à direita e pedido com larguras fixas; a vendedora fica com
  // a sobra, que é a coluna cujo conteúdo varia mais.
  const larguraValor = 90;
  const larguraPedido = 110;
  const larguraVendedora = doc.contentWidth - larguraValor - larguraPedido;
  const xVendedora = doc.marginX;
  const xPedido = xVendedora + larguraVendedora;
  const xValorFim = doc.marginX + doc.contentWidth;

  function cabecalhoDaTabela(d: PdfDocument): void {
    d.rect(d.marginX, d.y, d.contentWidth, CABECALHO_ALTURA, COR.faixa);
    d.drawText("Vendedora", xVendedora + 6, d.y + 13.5, {
      size: 8.5,
      font: "bold",
      color: COR.tinta,
    });
    d.drawText("Pedido", xPedido + 6, d.y + 13.5, { size: 8.5, font: "bold", color: COR.tinta });
    const rotulo = "Valor";
    d.drawText(rotulo, xValorFim - 6 - d.textWidth(rotulo, 8.5, "bold"), d.y + 13.5, {
      size: 8.5,
      font: "bold",
      color: COR.tinta,
    });
    d.y += CABECALHO_ALTURA;
  }

  // O cabeçalho da tabela se repete nas páginas seguintes: sem isso a segunda
  // página vira três colunas sem rótulo nenhum.
  doc.onPageStart = (d, pagina) => {
    if (pagina === 1) return;
    d.rect(d.marginX, d.y, d.contentWidth, 16, COR.faixa);
    d.drawText("Histórico de Vendas · Build.Flow", d.marginX + 8, d.y + 11.5, {
      size: 8,
      font: "bold",
      color: COR.suave,
    });
    d.drawText(
      meta.filtros,
      d.marginX + d.contentWidth - 8 - d.textWidth(meta.filtros, 7.5),
      d.y + 11.5,
      { size: 7.5, color: COR.suave },
    );
    d.y += 16 + 10;
    cabecalhoDaTabela(d);
  };

  doc.onPageEnd = (d, pagina, total) => {
    const y = d.height - d.marginBottom + 16;
    d.rect(d.marginX, y - 10, d.contentWidth, 0.6, COR.linha);
    d.drawText(`Gerado em ${geradoEm} por ${meta.geradoPor}`, d.marginX, y, {
      size: 7.5,
      color: COR.suave,
    });
    const paginacao = `Página ${pagina} de ${total}`;
    d.drawText(paginacao, d.marginX + d.contentWidth - d.textWidth(paginacao, 7.5, "bold"), y, {
      size: 7.5,
      font: "bold",
      color: COR.suave,
    });
  };

  desenharCapa(doc, meta, geradoEm);

  if (linhas.length === 0) {
    doc.moveDown(10);
    doc.text("Nenhum pedido concluído para os filtros aplicados.", {
      size: 10,
      color: COR.suave,
    });
    return doc.toArrayBuffer();
  }

  cabecalhoDaTabela(doc);

  for (const [i, l] of linhas.entries()) {
    // Se a linha não cabe, `ensureSpace` vira a página — e o `onPageStart`
    // redesenha o cabeçalho da tabela antes dela.
    doc.ensureSpace(LINHA_ALTURA);
    if (i % 2 === 1) doc.rect(doc.marginX, doc.y, doc.contentWidth, LINHA_ALTURA, COR.zebra);

    // Nome longo é CORTADO numa linha, não quebrado em duas: a tabela é de
    // leitura corrida, e uma linha de altura dupla desalinha a coluna do valor.
    doc.drawText(cortar(doc, l.sellerName, larguraVendedora - 12, 9), xVendedora + 6, doc.y + 12.5, {
      size: 9,
      color: COR.tinta,
    });
    doc.drawText(l.orderNumber, xPedido + 6, doc.y + 12.5, { size: 9, color: COR.tinta });

    const valor = fmtBRL(l.total);
    doc.drawText(valor, xValorFim - 6 - doc.textWidth(valor, 9, "bold"), doc.y + 12.5, {
      size: 9,
      font: "bold",
      color: COR.tinta,
    });
    doc.y += LINHA_ALTURA;
  }

  // A soma é do que ESTÁ no papel. Com exportação truncada, chamá-la de total
  // do filtro seria mentira — e a capa já avisa quando o corte aconteceu.
  const soma = linhas.reduce((acc, l) => acc + l.total, 0);
  doc.ensureSpace(LINHA_ALTURA + 6);
  doc.hr(COR.linha);
  doc.y += 5;
  doc.drawText(`${linhas.length} pedido(s) neste relatório`, doc.marginX + 6, doc.y + 12.5, {
    size: 8.5,
    color: COR.suave,
  });
  const totalTexto = fmtBRL(soma);
  doc.drawText(totalTexto, xValorFim - 6 - doc.textWidth(totalTexto, 10, "bold"), doc.y + 12.5, {
    size: 10,
    font: "bold",
    color: COR.tinta,
  });
  doc.y += LINHA_ALTURA;

  return doc.toArrayBuffer();
}

/* -------------------------------------------------------------------------- */

function desenharCapa(doc: PdfDocument, meta: HistoricoPdfMeta, geradoEm: string): void {
  doc.rect(doc.marginX, doc.y, 3, 34, COR.marca);
  doc.drawText("Histórico de Vendas", doc.marginX + 12, doc.y + 16, {
    size: 17,
    font: "bold",
    color: COR.tinta,
  });
  doc.drawText("Build.Flow · Módulo de Vendas", doc.marginX + 12, doc.y + 30, {
    size: 9,
    color: COR.suave,
  });
  doc.y += 34 + 12;

  doc.text(`Filtros aplicados: ${meta.filtros}`, { size: 8.5, color: COR.suave });
  // O escopo entra no papel porque o mesmo relatório sai diferente para uma
  // vendedora e para a Gestão: sem a linha, dois arquivos com o mesmo título
  // trazem números diferentes e ninguém sabe por quê.
  doc.text(`Escopo: ${meta.escopo}`, { size: 8.5, color: COR.suave });
  doc.text(`Emitido em ${geradoEm} por ${meta.geradoPor}`, {
    size: 8.5,
    color: COR.suave,
    spacing: 10,
  });

  if (meta.limiteAplicado && meta.totalFiltro > meta.limiteAplicado) {
    const altura = 46;
    doc.ensureSpace(altura + 8);
    doc.rect(doc.marginX, doc.y, doc.contentWidth, altura, COR.alertaFundo);
    doc.rect(doc.marginX, doc.y, 3, altura, COR.alerta);
    doc.drawText("EXPORTAÇÃO PARCIAL", doc.marginX + 12, doc.y + 15, {
      size: 8.5,
      font: "bold",
      color: COR.alerta,
    });
    const aviso =
      `O filtro atual retorna ${meta.totalFiltro} pedidos e este PDF traz os ` +
      `${meta.limiteAplicado} mais recentes. Refine o período ou a comanda para ` +
      `exportar o restante.`;
    for (const [i, linha] of doc.wrap(aviso, doc.contentWidth - 24, 8).entries()) {
      doc.drawText(linha, doc.marginX + 12, doc.y + 27 + i * 10, { size: 8, color: COR.alerta });
    }
    doc.y += altura + 8;
  }

  doc.text(`${meta.totalFiltro} pedido(s) concluído(s) no recorte.`, {
    size: 8,
    color: COR.suave,
    spacing: 8,
  });
}
