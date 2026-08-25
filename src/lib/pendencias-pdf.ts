import { PdfDocument, rgb, type PdfColor, type PdfFont } from "@/lib/pdf/pdf-document";
import { STATUS_LABEL } from "@/lib/order-flow";
import {
  formatDuracao,
  resumirPendencias,
  type CicloPendencia,
  type PendenciaPedido,
} from "@/lib/pendencias";

/**
 * RELATÓRIO DE PENDÊNCIAS EM PDF — camada de LAYOUT
 * ---------------------------------------------------------------------------
 * Recebe as mesmas fichas exibidas na tela (`PendenciaPedido[]`, vindas de
 * src/lib/pendencias-query.ts) e as diagrama em A4. Nada é consultado aqui:
 * este módulo só desenha, o que mantém a exportação sempre fiel à listagem.
 *
 * O documento é impresso na íntegra: cabeçalho do pedido, pendência do
 * Financeiro (quando houver), e cada ciclo com descrição, tratativas
 * intermediárias, resolução, autores, datas e duração.
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
  aberta: rgb(180, 83, 9),
  abertaFundo: rgb(254, 246, 227),
  resolvida: rgb(4, 120, 87),
  resolvidaFundo: rgb(233, 249, 242),
  alerta: rgb(185, 28, 28),
  alertaFundo: rgb(254, 240, 240),
  caixa: rgb(247, 247, 248),
} satisfies Record<string, PdfColor>;

export interface PendenciasPdfMeta {
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

/** Minutos decorridos até agora (pendências ainda abertas). */
function minutosAte(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
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

export function gerarPendenciasPdf(
  pedidos: PendenciaPedido[],
  meta: PendenciasPdfMeta,
): ArrayBuffer {
  const doc = new PdfDocument({
    marginTop: 40,
    marginBottom: 48,
    marginX: 40,
    title: "Relatório de Pendências — Build.Flow",
    author: "Build.Flow",
  });

  const geradoEm = fmtData(new Date().toISOString());

  // Cabeçalho corrido a partir da 2ª página (a 1ª tem o bloco-título completo).
  doc.onPageStart = (d, pagina) => {
    if (pagina === 1) return;
    d.rect(d.marginX, d.y, d.contentWidth, 16, COR.faixa);
    d.drawText("Relatório de Pendências · Build.Flow", d.marginX + 8, d.y + 11.5, {
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
    d.drawText(
      paginacao,
      d.marginX + d.contentWidth - d.textWidth(paginacao, 7.5, "bold"),
      y,
      { size: 7.5, font: "bold", color: COR.suave },
    );
  };

  desenharCapa(doc, pedidos, meta, geradoEm);

  if (pedidos.length === 0) {
    doc.moveDown(10);
    doc.text("Nenhuma pendência encontrada para os filtros aplicados.", {
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
  pedidos: PendenciaPedido[],
  meta: PendenciasPdfMeta,
  geradoEm: string,
): void {
  doc.rect(doc.marginX, doc.y, 3, 34, COR.marca);
  doc.drawText("Relatório de Pendências", doc.marginX + 12, doc.y + 16, {
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

  const r = resumirPendencias(pedidos);
  const indicadores: Array<[string, string]> = [
    ["Pedidos no relatório", String(r.pedidos)],
    ["Pendências registradas", String(r.ciclos)],
    ["Em aberto", String(r.emAberto)],
    ["Tempo médio de resolução", formatDuracao(r.mediaResolucaoMin)],
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
    `Mediana das resolvidas: ${formatDuracao(r.medianaResolucaoMin)} · ` +
      `${r.resolvidas} pendência(s) já resolvida(s).`,
    { size: 7.5, color: COR.suave, spacing: 10 },
  );
}

/* ------------------------------------------------------------------ pedido */

function desenharPedido(doc: PdfDocument, p: PendenciaPedido, indice: number): void {
  // Evita que o cabeçalho do pedido fique órfão no pé da página.
  doc.ensureSpace(86);

  const emAberto = p.ciclos.filter((c) => !c.resolvidaEm).length;
  const alturaFaixa = 20;
  doc.rect(doc.marginX, doc.y, doc.contentWidth, alturaFaixa, COR.faixa);
  if (emAberto > 0) doc.rect(doc.marginX, doc.y, 3, alturaFaixa, COR.aberta);

  const titulo =
    `${indice}. Pedido ${p.orderNumber}` +
    (p.comandaNumber ? ` · Comanda ${p.comandaNumber}` : "");
  doc.drawText(titulo, doc.marginX + 10, doc.y + 13.5, {
    size: 10,
    font: "bold",
    color: COR.tinta,
  });

  const situacao =
    `${STATUS_LABEL[p.status]} · ${p.ciclos.length} pendência(s)` +
    (emAberto > 0 ? ` · ${emAberto} em aberto` : "");
  doc.drawText(
    situacao,
    doc.marginX + doc.contentWidth - 10 - doc.textWidth(situacao, 8, "bold"),
    doc.y + 13.5,
    { size: 8, font: "bold", color: emAberto > 0 ? COR.aberta : COR.suave },
  );
  doc.y += alturaFaixa + 6;

  doc.text(
    `Cliente: ${p.customerName} (Cód. ${p.customerCode})  ·  Vendedora: ${p.sellerName}`,
    { size: 8.5, color: COR.tinta, indent: 4 },
  );
  doc.text(
    `Tipo: ${p.orderTypeName}` +
      (p.originStoreName ? `  ·  Loja de origem: ${p.originStoreName}` : "") +
      `  ·  Peças: ${p.pieceCount > 0 ? p.pieceCount : "—"}` +
      `  ·  Pedido criado em ${fmtData(p.criadoEm)}`,
    { size: 8, color: COR.suave, indent: 4, spacing: 6 },
  );

  // Pendência do FINANCEIRO — origem distinta, mas entra na mesma ficha.
  if (p.financeIssue) {
    const ativa = !p.financeIssueResolvedAt;
    caixa(doc, {
      titulo: `PENDÊNCIA DO FINANCEIRO · ${ativa ? "EM ABERTO" : "RESOLVIDA"}`,
      corpo: p.financeIssue,
      rodape:
        `Sinalizada em ${fmtData(p.financeIssueAt)}` +
        (p.financeIssueResolvedAt
          ? ` · resolvida em ${fmtData(p.financeIssueResolvedAt)}`
          : " · ainda em aberto"),
      cor: ativa ? COR.alerta : COR.suave,
      fundo: ativa ? COR.alertaFundo : COR.caixa,
      indent: 4,
    });
    doc.moveDown(6);
  }

  if (p.ciclos.length === 0) {
    doc.text("Sem detalhamento de pendência logística registrado neste pedido.", {
      size: 8.5,
      color: COR.suave,
      indent: 4,
      spacing: 4,
    });
  }

  // Numeração decrescente: a pendência mais recente recebe o maior número,
  // igual à listagem da tela.
  p.ciclos.forEach((c, i) => desenharCiclo(doc, c, p.ciclos.length - i));

  doc.moveDown(6);
  doc.hr(COR.linha);
  doc.moveDown(10);
}

/* ------------------------------------------------------------------- ciclo */

function desenharCiclo(doc: PdfDocument, c: CicloPendencia, numero: number): void {
  const resolvida = !!c.resolvidaEm;
  const cor = resolvida ? COR.resolvida : COR.aberta;
  const duracao = resolvida ? c.duracaoMin : minutosAte(c.abertaEm);
  const indent = 4;

  doc.ensureSpace(52);

  const rotulo = `PENDÊNCIA #${numero} · ${resolvida ? "RESOLVIDA" : "EM ABERTO"}`;
  doc.rect(doc.marginX + indent, doc.y, doc.contentWidth - indent, 13, resolvida ? COR.caixa : COR.abertaFundo);
  doc.drawText(rotulo, doc.marginX + indent + 6, doc.y + 9.2, {
    size: 7.5,
    font: "bold",
    color: cor,
  });
  const tempo = `${resolvida ? "Levou" : "Aberta há"} ${formatDuracao(duracao)}`;
  doc.drawText(
    tempo,
    doc.marginX + doc.contentWidth - 6 - doc.textWidth(tempo, 7.5),
    doc.y + 9.2,
    { size: 7.5, color: COR.suave },
  );
  doc.y += 13 + 5;

  doc.text(c.descricao, { size: 9, color: COR.tinta, indent: indent + 6 });
  doc.text(
    `Registrada em ${fmtData(c.abertaEm)}` + (c.abertaPor ? ` · por ${c.abertaPor}` : ""),
    { size: 7.5, color: COR.suave, indent: indent + 6, spacing: 4 },
  );

  if (c.respostas.length > 0) {
    doc.ensureSpace(24);
    doc.text("RESPOSTAS / TRATATIVAS", {
      size: 7,
      font: "bold",
      color: COR.suave,
      indent: indent + 6,
      spacing: 1,
    });

    for (const r of c.respostas) {
      const larguraItem = doc.contentWidth - indent - 18;
      const nota = r.note?.trim() ? r.note.trim() : "";
      const alturaItem =
        alturaTexto(doc, `${STATUS_LABEL[r.status]}`, 8, larguraItem, "bold") +
        (nota ? alturaTexto(doc, nota, 8, larguraItem) : 0) +
        10;
      doc.ensureSpace(alturaItem);

      // Marcador da linha do tempo à esquerda do item.
      doc.rect(doc.marginX + indent + 8, doc.y + 3, 2, alturaItem - 6, COR.linha);
      doc.text(STATUS_LABEL[r.status], {
        size: 8,
        font: "bold",
        color: COR.tinta,
        indent: indent + 18,
      });
      if (nota) doc.text(nota, { size: 8, color: COR.tinta, indent: indent + 18 });
      doc.text(fmtData(r.createdAt) + (r.autor ? ` · por ${r.autor}` : ""), {
        size: 7,
        color: COR.suave,
        indent: indent + 18,
        spacing: 3,
      });
    }
    doc.moveDown(2);
  }

  if (resolvida) {
    caixa(doc, {
      titulo: "RESOLUÇÃO",
      corpo: c.resolucao ?? "Resolvida sem comentário.",
      rodape: fmtData(c.resolvidaEm) + (c.resolvidaPor ? ` · por ${c.resolvidaPor}` : ""),
      cor: COR.resolvida,
      fundo: COR.resolvidaFundo,
      indent: indent + 6,
    });
  }

  doc.moveDown(8);
}

/* ------------------------------------------------------------------- caixa */

/**
 * Caixa de destaque (resolução, pendência do Financeiro, avisos).
 * A altura é medida ANTES de desenhar para que o fundo nunca fique cortado
 * pela quebra de página — se o bloco não couber em uma página inteira, o fundo
 * é omitido e o texto segue paginando normalmente.
 */
function caixa(
  doc: PdfDocument,
  o: {
    titulo: string;
    corpo: string;
    rodape?: string;
    cor: PdfColor;
    fundo: PdfColor;
    indent?: number;
  },
): void {
  const indent = o.indent ?? 0;
  const padding = 6;
  const largura = doc.contentWidth - indent;
  const larguraTexto = largura - padding * 2;

  const alturaTotal =
    padding * 2 +
    alturaTexto(doc, o.titulo, 7, larguraTexto, "bold") +
    2 +
    alturaTexto(doc, o.corpo, 8.5, larguraTexto) +
    (o.rodape ? alturaTexto(doc, o.rodape, 7, larguraTexto) + 2 : 0);

  doc.ensureSpace(alturaTotal);
  const cabe = doc.remaining >= alturaTotal;
  if (cabe) {
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
  if (o.rodape) {
    doc.text(o.rodape, {
      size: 7,
      color: COR.suave,
      indent: indent + padding,
      maxWidth: larguraTexto,
      spacing: 2,
    });
  }
  doc.y += padding;
}
