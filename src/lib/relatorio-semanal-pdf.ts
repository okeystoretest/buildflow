import { PdfDocument, rgb, type PdfColor } from "@/lib/pdf/pdf-document";
import type { WeeklyReportDetail } from "@/lib/relatorio-semanal-data";
import {
  HEALTH_LABEL,
  formatarData,
  formatarVariacao,
} from "@/lib/relatorio-semanal-labels";

/**
 * O RELATÓRIO SEMANAL EM PDF — camada de LAYOUT.
 *
 * Nada é consultado aqui: recebe a ficha já carregada e a diagrama em A4, como
 * `historico-vendas-pdf.ts` e `atrasos-pdf.ts` fazem.
 *
 * POR QUE ELE EXISTE: a planilha era um arquivo que se mandava por e-mail, e
 * isto virou uma tela. Quem não entra no Build.Flow — e é quase todo mundo
 * fora da Gestão — deixou de receber a semana. Este arquivo devolve a saída
 * que a planilha tinha, sem devolver a planilha.
 *
 * ELE É A SEMANA COMO ELA SE LÊ, não um resumo. Os seis blocos saem na mesma
 * ordem da tela, porque a ordem é o roteiro da reunião: resumo, entregas,
 * canais e métricas, OKRs, bloqueios e pauta. Um PDF que reordena obriga quem
 * recebe a reaprender o documento.
 *
 * BLOCO VAZIO NÃO É IMPRESSO. Nem toda semana tem métrica para lançar ou
 * bloqueio para registrar, e três páginas de cabeçalhos vazios ensinam a não
 * ler o arquivo.
 *
 * O quadro Kanban fica de fora de propósito: ele não pertence a semana
 * nenhuma — é o estado vivo, movido a mão na reunião.
 */

/** O contêiner roda em UTC; sem fixar o fuso o rodapé sai 3h adiantado. */
const TZ = "America/Fortaleza";

const COR = {
  tinta: rgb(23, 23, 23),
  suave: rgb(110, 110, 110),
  linha: rgb(222, 222, 222),
  faixa: rgb(238, 240, 243),
  marca: rgb(79, 70, 229),
  zebra: rgb(250, 250, 251),
} satisfies Record<string, PdfColor>;

export interface RelatorioPdfMeta {
  /** Nome de quem gerou — o relatório é auditável. */
  geradoPor: string;
}

function emitidoEm(): string {
  return new Date().toLocaleString("pt-BR", { timeZone: TZ });
}

/** Rótulo curto da saúde, ou traço. O PDF não tem cor de semáforo: é papel. */
function saude(h?: string): string {
  return h ? HEALTH_LABEL[h as keyof typeof HEALTH_LABEL] ?? h : "—";
}

/** Título de bloco: faixa cinza com a tarja da marca à esquerda. */
function bloco(doc: PdfDocument, titulo: string): void {
  doc.ensureSpace(34);
  doc.moveDown(10);
  doc.rect(doc.marginX, doc.y, doc.contentWidth, 20, COR.faixa);
  doc.rect(doc.marginX, doc.y, 3, 20, COR.marca);
  doc.drawText(titulo.toUpperCase(), doc.marginX + 10, doc.y + 14, {
    size: 9,
    font: "bold",
    color: COR.tinta,
  });
  doc.y += 26;
}

/** Um campo longo: rótulo pequeno e o texto embaixo, quebrando em linhas. */
function campo(doc: PdfDocument, rotulo: string, valor?: string): void {
  if (!valor?.trim()) return;
  doc.text(rotulo, { size: 8, font: "bold", color: COR.suave });
  doc.text(valor.trim(), { size: 10, color: COR.tinta, spacing: 6 });
}

/** Uma linha de item: título em negrito e as colunas de apoio embaixo. */
function item(doc: PdfDocument, indice: number, titulo: string, apoio: string[]): void {
  const linhas = doc.wrap(titulo, doc.contentWidth - 20, 9.5, "bold").length;
  const altura = linhas * 12 + apoio.filter(Boolean).length * 11 + 10;
  doc.ensureSpace(altura);
  if (indice % 2 === 1) doc.rect(doc.marginX, doc.y, doc.contentWidth, altura, COR.zebra);
  doc.y += 5;
  doc.text(titulo, { size: 9.5, font: "bold", color: COR.tinta, indent: 10, maxWidth: doc.contentWidth - 20 });
  for (const linha of apoio) {
    if (linha) doc.text(linha, { size: 8.5, color: COR.suave, indent: 10, maxWidth: doc.contentWidth - 20 });
  }
  doc.y += 5;
}

export function gerarRelatorioSemanalPdf(
  detalhe: WeeklyReportDetail,
  meta: RelatorioPdfMeta,
): ArrayBuffer {
  const doc = new PdfDocument({
    title: `Relatório Semanal — Semana ${detalhe.weekNumber}`,
    author: "Build.Flow",
  });

  doc.onPageEnd = (d, pagina, total) => {
    d.drawText(
      `Semana ${detalhe.weekNumber} · emitido em ${emitidoEm()} por ${meta.geradoPor}`,
      d.marginX,
      d.height - d.marginBottom + 20,
      { size: 7.5, color: COR.suave },
    );
    d.drawText(
      `${pagina}/${total}`,
      d.width - d.marginX - d.textWidth(`${pagina}/${total}`, 7.5),
      d.height - d.marginBottom + 20,
      { size: 7.5, color: COR.suave },
    );
  };

  /* ---- cabeçalho ---- */
  doc.rect(doc.marginX, doc.y, 3, 34, COR.marca);
  doc.drawText("MARKETING · RELATÓRIO SEMANAL", doc.marginX + 10, doc.y + 11, {
    size: 8,
    font: "bold",
    color: COR.suave,
  });
  doc.drawText(`Semana ${detalhe.weekNumber}`, doc.marginX + 10, doc.y + 28, {
    size: 15,
    font: "bold",
    color: COR.tinta,
  });
  doc.y += 40;
  doc.text(
    `${formatarData(detalhe.periodStart)} a ${formatarData(detalhe.periodEnd)}` +
      (detalhe.authorName ? ` · ${detalhe.authorName}` : ""),
    { size: 9, color: COR.suave },
  );
  const respondidas = detalhe.onTrack + detalhe.attention + detalhe.blocked;
  doc.text(
    `${respondidas + detalhe.pending} entrega(s): ${detalhe.onTrack} no ritmo, ` +
      `${detalhe.attention} em atenção, ${detalhe.blocked} travada(s), ${detalhe.pending} sem resposta.`,
    { size: 9, color: COR.suave, spacing: 4 },
  );
  doc.hr(COR.linha);

  /* ---- 1. resumo ---- */
  if (detalhe.highlight || detalhe.learning || detalhe.nextPriority) {
    bloco(doc, "1 · Resumo da semana");
    campo(doc, "DESTAQUE DA SEMANA", detalhe.highlight);
    campo(doc, "PRINCIPAL APRENDIZADO", detalhe.learning);
    campo(doc, "PRIORIDADE Nº 1 DA PRÓXIMA SEMANA", detalhe.nextPriority);
  }

  /* ---- 2. entregas ---- */
  if (detalhe.deliveries.length > 0) {
    bloco(doc, "2 · Entregas da semana");
    detalhe.deliveries.forEach((d, i) =>
      item(doc, i, `${d.day} · ${d.block}`, [
        d.expected,
        `Situação: ${saude(d.health)}${d.evidence ? ` · Evidência: ${d.evidence}` : ""}`,
        d.note ? `Observação: ${d.note}` : "",
      ]),
    );
  }

  /* ---- 3. canais e métricas ---- */
  if (detalhe.metrics.length > 0) {
    bloco(doc, "3 · Canais e métricas");
    detalhe.metrics.forEach((m, i) =>
      item(doc, i, `${m.channel} · ${m.metric}`, [
        `Anterior: ${m.previous ?? "—"} · Atual: ${m.current ?? "—"} · ` +
          `Meta: ${m.target ?? "—"} · Variação: ${formatarVariacao(
            m.previous !== undefined && m.current !== undefined && m.previous !== 0
              ? (m.current - m.previous) / Math.abs(m.previous)
              : undefined,
          )}`,
        `Situação: ${saude(m.health)}`,
        m.reading ? `Leitura: ${m.reading}` : "",
      ]),
    );
  }

  /* ---- 4. OKRs ---- */
  if (detalhe.okrs.length > 0) {
    bloco(doc, "4 · OKRs da semana");
    detalhe.okrs.forEach((o, i) =>
      item(doc, i, o.keyResult, [
        `Objetivo: ${o.objective} · Medida: ${o.measure}`,
        `Meta: ${o.goalLabel} · Apurado: ${o.achieved ?? "—"}` +
          (o.monthlyRead
            ? ` · Média de 4 semanas: ${o.fourWeekAverage?.toFixed(1).replace(".", ",") ?? "—"} (leitura mensal)`
            : ""),
        `Situação: ${saude(o.health)}${o.nextStep ? ` · Próximo passo: ${o.nextStep}` : ""}`,
      ]),
    );
  }

  /* ---- 5. bloqueios ---- */
  if (detalhe.blockers.length > 0) {
    bloco(doc, "5 · Bloqueios e decisões");
    detalhe.blockers.forEach((b, i) =>
      item(doc, i, b.title, [
        b.impact ? `Impacto: ${b.impact}` : "",
        b.needs ? `Precisa de: ${b.needs}` : "",
        `Situação: ${saude(b.health)}` +
          (b.dueDate ? ` · Prazo: ${formatarData(b.dueDate)}` : "") +
          (b.resolution ? ` · Decisão: ${b.resolution}` : ""),
      ]),
    );
  }

  /* ---- 6. pauta ---- */
  if (detalhe.agenda.length > 0) {
    bloco(doc, "6 · Pauta da reunião");
    detalhe.agenda.forEach((a, i) =>
      item(doc, i, `${a.block} · ${a.minutes} min`, [a.question, a.answer ? `Resposta: ${a.answer}` : ""]),
    );
  }

  return doc.toArrayBuffer();
}

/** Nome do arquivo baixado. Começa pela semana: ordena sozinho na pasta. */
export function nomeDoArquivoPdf(detalhe: WeeklyReportDetail): string {
  return `relatorio-semanal-${String(detalhe.weekNumber).padStart(2, "0")}-${detalhe.periodStart}.pdf`;
}

