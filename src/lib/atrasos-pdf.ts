import { PdfDocument, rgb, type PdfColor, type PdfFont } from "@/lib/pdf/pdf-document";
import { STATUS_LABEL } from "@/lib/order-flow";
import { formatDuracao } from "@/lib/pendencias";
import { resumirAtrasos, type AtrasoJustificativa, type AtrasoPedido } from "@/lib/atrasos";

/**
 * RELATÓRIO DE ATRASOS EM PDF — camada de LAYOUT
 * ---------------------------------------------------------------------------
 * Recebe as mesmas fichas exibidas na tela (AtrasoPedido[], vindas de
 * src/lib/atrasos-query.ts) e as diagrama em A4. Nada é consultado aqui: este
 * módulo só desenha, o que mantém a exportação sempre fiel à listagem.
 */

/**
 * O contêiner roda em UTC. Sem fixar o fuso, o PDF sairia 3h adiantado em
 * relação ao que a Logística vê na tela (que formata no navegador).
 */
const TZ = "America/Fortaleza";

const COR = {
  tinta: rgb(23, 23, 23),
  suave: rgb(110, 110, 110),
  linha: rgb(222, 222, 222),
  faixa: rgb(238, 240, 243),
  marca: rgb(17, 24, 39),
  atraso: rgb(180, 83, 9),
  atrasoFundo: rgb(254, 246, 227),
  alerta: rgb(185, 28, 28),
  alertaFundo: rgb(254, 240, 240),
  caixa: rgb(247, 247, 248),
} satisfies Record<string, PdfColor>;

export interface AtrasosPdfMeta {
  /** Descrição dos filtros aplicados (ver descreverFiltros). */
  filtros: string;
  /** Nome de quem gerou — o relatório é auditável. */
  geradoPor: string;
  /** Total de pedidos no filtro, mesmo que o PDF esteja truncado. */
  totalFiltro: number;
  /** Preenchido quando o teto de registros cortou a exportação. */
  limiteAplicado?: number;
}

function fmtData(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Altura que um texto ocupará, sem desenhá-lo (usada para reservar espaço). */
function alturaTexto(
  doc: PdfDocument,
  texto: string,
  size: number,
  maxWidth: number,
  font: PdfFont = "regular",
  lineHeight = 1.25,
): number {
  return doc.wrap(texto, maxWidth, size, font).length * size * lineHeight;
}

/* -------------------------------------------------------------------------- */

export function gerarAtrasosPdf(pedidos: AtrasoPedido[], meta: AtrasosPdfMeta): ArrayBuffer {
  const doc = new PdfDocument({
    marginTop: 40,
    marginBottom: 48,
    marginX: 40,
    title: "Relatório de Atrasos — Build.Flow",
    author: "Build.Flow",
  });

  const geradoEm = fmtData(new Date().toISOString());

  // Cabeçalho corrido a partir da 2ª página (a 1ª tem o bloco-título completo).
  doc.onPageStart = (d, pagina) => {
    if (pagina === 1) return;
    d.rect(d.marginX, d.y, d.contentWidth, 16, COR.faixa);
    d.drawText("Relatório de Atrasos · Build.Flow", d.marginX + 8, d.y + 11.5, {
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
    d.y += 16 + 12;
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

  desenharCapa(doc, pedidos, meta, geradoEm);

  if (pedidos.length === 0) {
    doc.moveDown(10);
    doc.text("Nenhuma justificativa de atraso encontrada para os filtros aplicados.", {
      size: 10,
      color: COR.suave,
    });
    return doc.toArrayBuffer();
  }

  pedidos.forEach((p, i) => desenharPedido(doc, p, i + 1));
  return doc.toArrayBuffer();
}

/* ------------------------------------------------------------------- capa */

function desenharCapa(
  doc: PdfDocument,
  pedidos: AtrasoPedido[],
  meta: AtrasosPdfMeta,
  geradoEm: string,
): void {
  doc.rect(doc.marginX, doc.y, 3, 34, COR.marca);
  doc.drawText("Relatório de Atrasos", doc.marginX + 12, doc.y + 16, {
    size: 17,
    font: "bold",
    color: COR.tinta,
  });
  doc.drawText("Build.Flow · Módulo de Logística", doc.marginX + 12, doc.y + 30, {
    size: 9,
    color: COR.suave,
  });
  doc.y += 34 + 12;

  doc.text(`Filtros aplicados: ${meta.filtros}`, { size: 8.5, color: COR.suave });
  doc.text(`Emitido em ${geradoEm} por ${meta.geradoPor}`, {
    size: 8.5,
    color: COR.suave,
    spacing: 10,
  });

  if (meta.limiteAplicado && meta.totalFiltro > meta.limiteAplicado) {
    caixa(doc, {
      titulo: "EXPORTAÇÃO PARCIAL",
      corpo:
        `O filtro atual retorna ${meta.totalFiltro} pedidos e este PDF traz os ` +
        `${meta.limiteAplicado} mais recentes. Refine o período ou a busca para ` +
        `exportar o restante.`,
      cor: COR.alerta,
      fundo: COR.alertaFundo,
    });
    doc.moveDown(8);
  }

  const r = resumirAtrasos(pedidos);
  const indicadores: Array<[string, string]> = [
    ["Pedidos no relatório", String(r.pedidos)],
    ["Atrasos justificados", String(r.justificativas)],
    ["Atraso médio", formatDuracao(r.mediaAtrasoMin)],
    ["Maior atraso", formatDuracao(r.piorAtrasoMin)],
  ];

  const larguraCelula = (doc.contentWidth - 3 * 6) / 4;
  const alturaCelula = 40;
  doc.ensureSpace(alturaCelula + 14);

  indicadores.forEach(([rotulo, valor], i) => {
    const x = doc.marginX + i * (larguraCelula + 6);
    doc.rect(x, doc.y, larguraCelula, alturaCelula, COR.caixa);
    doc.drawText(valor, x + 8, doc.y + 20, { size: 14, font: "bold", color: COR.tinta });
    for (const [j, linha] of doc.wrap(rotulo, larguraCelula - 16, 7).entries()) {
      doc.drawText(linha, x + 8, doc.y + 30 + j * 8.5, { size: 7, color: COR.suave });
    }
  });
  doc.y += alturaCelula + 6;

  doc.text(
    r.etapaCritica
      ? `Etapa com mais atrasos: ${STATUS_LABEL[r.etapaCritica.status]} ` +
          `(${r.etapaCritica.total} justificativa(s)).`
      : "Nenhuma etapa com atraso justificado no recorte.",
    { size: 7.5, color: COR.suave, spacing: 10 },
  );
}

/* ------------------------------------------------------------------ pedido */

function desenharPedido(doc: PdfDocument, p: AtrasoPedido, indice: number): void {
  // Evita que o cabeçalho do pedido fique órfão no pé da página.
  doc.ensureSpace(86);

  const alturaFaixa = 20;
  doc.rect(doc.marginX, doc.y, doc.contentWidth, alturaFaixa, COR.faixa);
  doc.rect(doc.marginX, doc.y, 3, alturaFaixa, COR.atraso);

  const titulo =
    `${indice}. Pedido ${p.orderNumber}` +
    (p.comandaNumber ? ` · Comanda ${p.comandaNumber}` : " · sem comanda");
  doc.drawText(titulo, doc.marginX + 10, doc.y + 13.5, {
    size: 10,
    font: "bold",
    color: COR.tinta,
  });

  const situacao = `${STATUS_LABEL[p.status]} · ${p.justificativas.length} atraso(s)`;
  doc.drawText(
    situacao,
    doc.marginX + doc.contentWidth - 10 - doc.textWidth(situacao, 8, "bold"),
    doc.y + 13.5,
    { size: 8, font: "bold", color: COR.atraso },
  );
  doc.y += alturaFaixa + 6;

  doc.text(
    `Cliente: ${p.customerName} (Cód. ${p.customerCode})  ·  Vendedora: ${p.sellerName}`,
    { size: 8.5, color: COR.tinta, indent: 4 },
  );
  doc.text(
    `Tipo: ${p.orderTypeName}` +
      (p.originStoreName ? `  ·  Loja de origem: ${p.originStoreName}` : "") +
      `  ·  Pedido criado em ${fmtData(p.criadoEm)}`,
    { size: 8, color: COR.suave, indent: 4, spacing: 6 },
  );

  p.justificativas.forEach((j) => desenharJustificativa(doc, j));

  doc.moveDown(6);
  doc.hr(COR.linha);
  doc.moveDown(10);
}

/* ----------------------------------------------------------- justificativa */

function desenharJustificativa(doc: PdfDocument, j: AtrasoJustificativa): void {
  const indent = 4;
  doc.ensureSpace(46);

  const rotulo = `${STATUS_LABEL[j.status]} · ${j.setor}`;
  doc.rect(doc.marginX + indent, doc.y, doc.contentWidth - indent, 13, COR.atrasoFundo);
  doc.drawText(rotulo, doc.marginX + indent + 6, doc.y + 9.2, {
    size: 7.5,
    font: "bold",
    color: COR.atraso,
  });
  const tempo = `Atrasou ${formatDuracao(j.minutesLate)}`;
  doc.drawText(
    tempo,
    doc.marginX + doc.contentWidth - 6 - doc.textWidth(tempo, 7.5, "bold"),
    doc.y + 9.2,
    { size: 7.5, font: "bold", color: COR.atraso },
  );
  doc.y += 13 + 5;

  doc.text(j.reason, { size: 9, color: COR.tinta, indent: indent + 6 });
  doc.text(`Justificado em ${fmtData(j.createdAt)}` + (j.autor ? ` · por ${j.autor}` : ""), {
    size: 7.5,
    color: COR.suave,
    indent: indent + 6,
    spacing: 4,
  });

  doc.moveDown(6);
}

/* ------------------------------------------------------------------- caixa */

/**
 * Caixa de destaque (avisos). A altura é medida ANTES de desenhar para que o
 * fundo nunca fique cortado pela quebra de página — se o bloco não couber em
 * uma página inteira, o fundo é omitido e o texto segue paginando.
 */
function caixa(
  doc: PdfDocument,
  o: { titulo: string; corpo: string; cor: PdfColor; fundo: PdfColor; indent?: number },
): void {
  const indent = o.indent ?? 0;
  const padding = 6;
  const largura = doc.contentWidth - indent;
  const larguraTexto = largura - padding * 2;

  const alturaTotal =
    padding * 2 +
    alturaTexto(doc, o.titulo, 7, larguraTexto, "bold") +
    2 +
    alturaTexto(doc, o.corpo, 8.5, larguraTexto);

  doc.ensureSpace(alturaTotal);
  if (doc.remaining >= alturaTotal) {
    doc.rect(doc.marginX + indent, doc.y, largura, alturaTotal, o.fundo);
    doc.rect(doc.marginX + indent, doc.y, 2, alturaTotal, o.cor);
  }

  doc.y += padding;
  doc.text(o.titulo, {
    size: 7,
    font: "bold",
    color: o.cor,
    indent: indent + padding,
    maxWidth: larguraTexto,
    spacing: 2,
  });
  doc.text(o.corpo, {
    size: 8.5,
    color: COR.tinta,
    indent: indent + padding,
    maxWidth: larguraTexto,
  });
  doc.y += padding;
}
