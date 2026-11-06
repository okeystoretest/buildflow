import { PdfDocument, rgb, type PdfColor } from "@/lib/pdf/pdf-document";
import { DIAS_PARADA, type ResumoDoAtacado } from "@/lib/wholesale-dashboard";

/**
 * RELATÓRIO GERENCIAL DA ANÁLISE DE CLIENTES — camada de LAYOUT.
 *
 * Nada é consultado aqui: recebe o `ResumoDoAtacado` já carregado e o diagrama
 * em A4, como `historico-vendas-pdf.ts` e `pendencias-pdf.ts` fazem.
 *
 * O QUE MANTÉM O PDF FIEL À TELA é o resumo ser O MESMO objeto que o painel
 * desenha — `resumoDoAtacado`, com os mesmos filtros lidos da mesma URL. Esta
 * foi a decisão central do relatório: a alternativa (consultas próprias "só
 * para o PDF") produz um arquivo que discorda da tela em alguma conta, e
 * descobrir qual das duas está certa custa mais que o relatório inteiro.
 *
 * ELE NÃO É A TELA IMPRESSA. A tela é navegação: cartões grandes para bater o
 * olho e painéis que se leem em qualquer ordem. O papel circula numa reunião e
 * é lido de cima para baixo uma vez, então aqui os mesmos números viram
 * SEÇÕES com ordem: o funil, as duas taxas, o tempo de resposta, e depois as
 * distribuições (vendedora, praça, motivo de reprovação) — da pergunta "como
 * fomos" para a pergunta "onde agir".
 *
 * SEM A LISTA DE CANDIDATURAS, de propósito. É um relatório de CONJUNTO para o
 * gestor; os nomes, telefones e CNPJs das lojistas estão na tela ao lado, e um
 * PDF com a carteira nominal circula de um jeito que este não deve circular.
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
  bom: rgb(4, 120, 87),
  zebra: rgb(250, 250, 251),
  barra: rgb(148, 163, 184),
} satisfies Record<string, PdfColor>;

export interface AnalisePdfMeta {
  /** O recorte em palavras — ver `descreverRecorte`. */
  filtros: string;
  /** Nome de quem gerou — o relatório é auditável. */
  geradoPor: string;
  /** De quem são os números: "todas as vendedoras" ou o nome de uma. */
  escopo: string;
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

const n = (v: number) => v.toLocaleString("pt-BR");
/** Reais sem centavos: a media de uma FAIXA nao tem precisao de centavo. */
const moeda = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pctTexto = (v: number) => `${v.toLocaleString("pt-BR")}%`;

/** Corta com reticências para caber na largura, medindo de verdade. */
function cortar(doc: PdfDocument, texto: string, largura: number, size: number): string {
  if (doc.textWidth(texto, size) <= largura) return texto;
  let corte = texto;
  while (corte.length > 1 && doc.textWidth(corte + "...", size) > largura) {
    corte = corte.slice(0, -1);
  }
  return corte + "...";
}

const LINHA_ALTURA = 16;
const CABECALHO_ALTURA = 18;
const CARTAO_ALTURA = 46;

/* -------------------------------------------------------------------------- */

export function gerarAnaliseClientesPdf(
  r: ResumoDoAtacado,
  meta: AnalisePdfMeta,
): ArrayBuffer {
  const doc = new PdfDocument({
    marginTop: 40,
    marginBottom: 48,
    marginX: 40,
    title: "Relatório Gerencial — Análise de Clientes — Build.Flow",
    author: "Build.Flow",
  });

  const geradoEm = fmtDataHora(new Date());

  doc.onPageStart = (d, pagina) => {
    if (pagina === 1) return;
    d.rect(d.marginX, d.y, d.contentWidth, 16, COR.faixa);
    d.drawText("Análise de Clientes · Build.Flow", d.marginX + 8, d.y + 11.5, {
      size: 8,
      font: "bold",
      color: COR.suave,
    });
    const recorte = cortar(d, meta.filtros, d.contentWidth / 2, 7.5);
    d.drawText(recorte, d.marginX + d.contentWidth - 8 - d.textWidth(recorte, 7.5), d.y + 11.5, {
      size: 7.5,
      color: COR.suave,
    });
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

  desenharCapa(doc, meta, geradoEm);

  // Recorte vazio para e diz o motivo. Sem isto o relatório sairia com uma
  // sequência de zeros, que lê como sistema quebrado e não como filtro largo
  // demais — o mesmo cuidado que o painel tem na tela.
  if (r.total === 0) {
    doc.moveDown(10);
    doc.text("Nenhuma candidatura neste recorte.", { size: 11, font: "bold", color: COR.tinta });
    doc.text(
      "Os filtros da capa não retornaram candidatura nenhuma. Amplie o período ou remova " +
        "o filtro de vendedora, praça ou marca e gere o relatório de novo.",
      { size: 9, color: COR.suave },
    );
    return doc.toArrayBuffer();
  }

  const porStatus = new Map(r.porStatus.map((s) => [s.status, s.total]));
  const emAnalise = porStatus.get("EM_ANALISE") ?? 0;
  const reprovadas = porStatus.get("REPROVADO") ?? 0;
  const cuidado = porStatus.get("CUIDADO") ?? 0;

  /* ----------------------------------------------------------------- funil */

  secao(doc, "Funil do período");
  cartoes(doc, [
    { rotulo: "Recebidas", valor: n(r.total), nota: meta.filtros.split(" · ")[0] },
    { rotulo: "Em análise", valor: n(emAnalise), nota: `${fatia(emAnalise, r.total)} do total` },
    { rotulo: "Aprovadas", valor: n(r.aprovadas), nota: `${fatia(r.aprovadas, r.total)} do total` },
    { rotulo: "Compraram", valor: n(r.comprou), nota: `${fatia(r.comprou, r.total)} do total` },
    { rotulo: "Reprovadas", valor: n(reprovadas), nota: `${fatia(reprovadas, r.total)} do total` },
  ]);

  // CUIDADO sai dos cartões, como na tela, mas é DITO: sem a linha, os cinco
  // cartões acima não somam o total recebido e a diferença fica inexplicada.
  if (cuidado > 0) {
    doc.text(
      // "Cuidado" escrito à mão: o rótulo vive em `lead-status-chip.tsx`, que é
      // componente de cliente, e importá-lo aqui arrastaria React para dentro
      // da geração do PDF por causa de uma palavra.
      `Mais ${n(cuidado)} em "Cuidado" — fora dos cartões acima, por isso ` +
        `eles não somam as ${n(r.total)} recebidas.`,
      { size: 8, color: COR.suave, spacing: 4 },
    );
  }

  /* ------------------------------------------------------------- qualidade */

  secao(doc, "Taxas e tempo de resposta");
  cartoes(doc, [
    {
      rotulo: "Taxa de aprovação",
      valor: pctTexto(r.aprovacao),
      nota: `${n(r.aprovadas)} ÷ ${n(r.total)} recebidas`,
    },
    {
      rotulo: "Taxa de conversão",
      valor: pctTexto(r.conversao),
      nota: `${n(r.comprou)} compraram ÷ ${n(r.total)}`,
    },
    {
      rotulo: "Tempo médio p/ decidir",
      valor: r.tempo.decididas > 0 ? `${n(r.tempo.mediaDias)} d` : "—",
      nota:
        r.tempo.decididas > 0
          ? `${n(r.tempo.decididas)} decisão(ões) com data`
          : "nenhuma decisão com data",
    },
    {
      rotulo: `Paradas há +${DIAS_PARADA} dias`,
      valor: n(r.tempo.paradas),
      nota: r.tempo.paradas > 0 ? `mais antiga: ${n(r.tempo.maisAntigaDias)} dias` : "fila em dia",
      alerta: r.tempo.paradas > 0,
    },
  ]);

  /* --------------------------------------------------------- perfil da base */

  // AS MEDIAS VEM COM A BASE DELAS na nota de cada cartao, e isso nao e
  // detalhe: "4,2 funcionarios" sobre 11 cadastros e outra informacao que o
  // mesmo numero sobre 900. Tres destes campos sao opcionais ou texto livre,
  // entao a base quase nunca e o total do recorte.
  secao(doc, "Perfil da base de clientes");
  cartoes(doc, [
    {
      rotulo: "Funcionários (média)",
      valor: r.funcionarios.considerados > 0 ? n(r.funcionarios.media) : "—",
      nota:
        r.funcionarios.considerados > 0
          ? `${n(r.funcionarios.considerados)} com número · ${n(r.funcionarios.ignorados)} sem`
          : "nenhum cadastro com número",
    },
    {
      rotulo: "Investimento pretendido",
      // "estimado" NO ROTULO, nao numa nota de rodape que ninguem le: o
      // cadastro guarda a FAIXA, e a media so pode ser a media dos meios
      // delas. Quem levar este numero a uma reuniao precisa saber disso.
      valor: r.investimento.considerados > 0 ? `${moeda(r.investimento.media)} (est.)` : "—",
      nota:
        r.investimento.considerados > 0
          ? `${n(r.investimento.considerados)} com faixa · média dos meios`
          : "nenhuma faixa informada",
    },
    {
      rotulo: "Tempo de acompanhamento",
      valor: r.acompanhamento.considerados > 0 ? `${n(r.acompanhamento.media)} d` : "—",
      nota:
        r.acompanhamento.considerados > 0
          ? `${n(r.acompanhamento.considerados)} que saíram da régua`
          : "nenhuma saiu da régua ainda",
    },
    {
      rotulo: "Canal mais comum",
      valor: r.canais.canais[0]?.rotulo ?? "—",
      nota:
        r.canais.canais[0]
          ? `${pctTexto(r.canais.canais[0].fatia)} de ${n(r.canais.informaram)} que informaram`
          : "nenhum canal informado",
    },
  ]);

  /* ------------------------------------------------------------- vendedoras */

  if (r.porVendedora.length > 1) {
    secao(doc, "Por vendedora");
    tabela(
      doc,
      ["Vendedora", "Recebidas", "Compraram", "Conversão"],
      // Por CONVERSÃO: no papel a leitura é de cima para baixo uma vez, e a
      // primeira linha deve ser a que o gestor comenta na reunião.
      [...r.porVendedora]
        .sort((a, b) => b.conversao - a.conversao || b.total - a.total)
        .map((v) => [v.nome, n(v.total), n(v.comprou), pctTexto(v.conversao)]),
      { barraNaUltima: true, maxBarra: 100 },
    );
  }

  /* -------------------------------------------------------------------- UF */

  secao(doc, "Por praça (UF da loja)");
  tabela(
    doc,
    ["UF", "Recebidas", "Compraram", "Conversão"],
    // Doze linhas: é o relatório do conjunto, e a cauda de UFs com uma
    // candidatura não muda decisão nenhuma. O rodapé da tabela diz o resto.
    r.porUf.slice(0, 12).map((u) => [u.uf, n(u.total), n(u.comprou), pctTexto(u.conversao)]),
    { barraNaUltima: true, maxBarra: 100, resto: r.porUf.length - 12, unidade: "UF(s)" },
  );

  /* ------------------------------------------------------------- cidades */

  if (r.porCidade.length > 0) {
    secao(doc, "Cidades com maior volume de compras");
    tabela(
      doc,
      ["Cidade", "Recebidas", "Compraram", "Conversão"],
      // Ordenadas por COMPRAS na origem (`agruparPorCidade`), nao por
      // candidaturas: a pergunta e onde se vende, nao de onde chegam
      // inscricoes. Doze linhas, como as UFs.
      r.porCidade.slice(0, 12).map((c) => [c.cidade, n(c.total), n(c.comprou), pctTexto(c.conversao)]),
      {
        barraNaUltima: true,
        maxBarra: 100,
        resto: r.porCidade.length - 12,
        unidade: "cidade(s)",
      },
    );
  }

  /* --------------------------------------------------------------- canais */

  if (r.canais.canais.length > 0) {
    secao(doc, "Como as candidatas nos acharam");
    tabela(
      doc,
      ["Canal", "Candidaturas", "% de quem informou"],
      r.canais.canais.map((c) => [c.rotulo, n(c.total), pctTexto(c.fatia)]),
      { barraNaUltima: true, maxBarra: 100 },
    );
    if (r.canais.ignorados > 0) {
      // A base do percentual DITA no papel: sem isto, somar as fatias da 100%
      // e quem le conclui que todo mundo informou o canal.
      doc.y -= 4;
      doc.drawText(
        `${n(r.canais.ignorados)} candidatura(s) sem canal informado ficaram fora deste percentual.`,
        doc.marginX,
        doc.y,
        { size: 7.5, color: COR.suave },
      );
      doc.y -= 8;
    }
  }

  /* ---------------------------------------------------------------- motivos */

  if (reprovadas > 0) {
    const somaMotivos = r.porMotivo.reduce((acc, m) => acc + m.total, 0);
    secao(doc, "Reprovações por motivo");
    tabela(
      doc,
      ["Motivo", "Reprovações", "% das reprovações"],
      r.porMotivo
        .slice(0, 12)
        // Percentual sobre o total de REPROVAÇÕES, como na tela: "22% das
        // reprovações foram por isto" é a leitura que muda o que se faz.
        .map((m) => [m.rotulo, n(m.total), fatia(m.total, somaMotivos)]),
      { barraNaUltima: true, maxBarra: 100, resto: r.porMotivo.length - 12, unidade: "motivo(s)" },
    );
  }

  /* ----------------------------------------------------------- entrada/mês */

  if (r.entradasPorMes.length > 1) {
    const maior = Math.max(...r.entradasPorMes.map((m) => m.total), 1);
    secao(doc, "Entrada de candidaturas por mês");
    tabela(
      doc,
      ["Mês", "Candidaturas", "Volume"],
      r.entradasPorMes.map((m) => [m.rotulo, n(m.total), ""]),
      {
        barraNaUltima: true,
        // A barra é proporcional ao MAIOR mês da janela, não a 100: aqui ela
        // compara meses entre si, e não uma taxa contra o seu teto.
        maxBarra: maior,
        valoresDaBarra: r.entradasPorMes.map((m) => m.total),
      },
    );
  }

  return doc.toArrayBuffer();
}

/* -------------------------------------------------------------------------- */

/** Uma contagem sobre um total, em "12,5%" — 0% quando a base é zero. */
function fatia(parte: number, total: number): string {
  return total === 0 ? "0%" : pctTexto(Math.round((parte / total) * 1000) / 10);
}

function secao(doc: PdfDocument, titulo: string): void {
  doc.ensureSpace(60);
  doc.moveDown(10);
  doc.drawText(titulo, doc.marginX, doc.y + 9, { size: 10.5, font: "bold", color: COR.tinta });
  doc.y += 14;
  doc.hr(COR.linha);
  doc.y += 8;
}

/**
 * Faixa de cartões "rótulo / número grande / nota", a forma dos KPIs da tela.
 *
 * Todos na MESMA largura, numa fileira só: o funil se lê da esquerda para a
 * direita, e um cartão mais largo que o vizinho sugere importância que a
 * ordem já diz.
 */
function cartoes(
  doc: PdfDocument,
  itens: { rotulo: string; valor: string; nota?: string; alerta?: boolean }[],
): void {
  if (itens.length === 0) return;
  doc.ensureSpace(CARTAO_ALTURA + 6);
  const vao = 6;
  const largura = (doc.contentWidth - vao * (itens.length - 1)) / itens.length;
  const yTopo = doc.y;

  for (const [i, c] of itens.entries()) {
    const x = doc.marginX + i * (largura + vao);
    doc.rect(x, yTopo, largura, CARTAO_ALTURA, c.alerta ? COR.alertaFundo : COR.faixa);
    doc.rect(x, yTopo, 2.5, CARTAO_ALTURA, c.alerta ? COR.alerta : COR.marca);
    doc.drawText(cortar(doc, c.rotulo, largura - 16, 7), x + 9, yTopo + 13, {
      size: 7,
      font: "bold",
      color: COR.suave,
    });
    doc.drawText(cortar(doc, c.valor, largura - 16, 15), x + 9, yTopo + 31, {
      size: 15,
      font: "bold",
      color: c.alerta ? COR.alerta : COR.tinta,
    });
    if (c.nota) {
      doc.drawText(cortar(doc, c.nota, largura - 16, 6.5), x + 9, yTopo + 41, {
        size: 6.5,
        color: COR.suave,
      });
    }
  }
  doc.y = yTopo + CARTAO_ALTURA + 4;
}

/**
 * Tabela de distribuição: primeira coluna com a sobra, as numéricas à direita.
 *
 * `barraNaUltima` desenha a barra proporcional ATRÁS da última coluna, que é
 * como a tela mostra as mesmas distribuições. É o único recurso gráfico do
 * arquivo — o projeto não tem biblioteca de gráfico, e `rect` resolve a forma
 * que estas seções pedem.
 */
function tabela(
  doc: PdfDocument,
  cabecalhos: string[],
  linhas: string[][],
  opts: {
    barraNaUltima?: boolean;
    maxBarra?: number;
    /** Valores da barra quando a última coluna não é o número dela. */
    valoresDaBarra?: number[];
    /** Quantas linhas ficaram de fora do corte. */
    resto?: number;
    unidade?: string;
  } = {},
): void {
  if (linhas.length === 0) {
    doc.text("Nada a mostrar nesta seção.", { size: 8.5, color: COR.suave, spacing: 4 });
    return;
  }

  const colunasNum = cabecalhos.length - 1;
  const larguraNum = 92;
  const larguraPrimeira = doc.contentWidth - larguraNum * colunasNum;
  const xDe = (col: number) =>
    col === 0 ? doc.marginX : doc.marginX + larguraPrimeira + (col - 1) * larguraNum;

  function cabecalho(d: PdfDocument): void {
    d.rect(d.marginX, d.y, d.contentWidth, CABECALHO_ALTURA, COR.faixa);
    for (const [c, titulo] of cabecalhos.entries()) {
      const x =
        c === 0
          ? xDe(0) + 6
          : xDe(c) + larguraNum - 6 - d.textWidth(titulo, 7.5, "bold");
      d.drawText(titulo, x, d.y + 12.5, { size: 7.5, font: "bold", color: COR.tinta });
    }
    d.y += CABECALHO_ALTURA;
  }

  doc.ensureSpace(CABECALHO_ALTURA + LINHA_ALTURA * 2);
  cabecalho(doc);

  for (const [i, linha] of linhas.entries()) {
    // Virando a página, o cabeçalho da tabela vai junto: sem ele a página
    // seguinte são quatro colunas de números sem rótulo.
    if (doc.ensureSpace(LINHA_ALTURA)) cabecalho(doc);
    if (i % 2 === 1) doc.rect(doc.marginX, doc.y, doc.contentWidth, LINHA_ALTURA, COR.zebra);

    if (opts.barraNaUltima) {
      const valor = opts.valoresDaBarra
        ? opts.valoresDaBarra[i]
        : Number(String(linha[colunasNum]).replace(/[^\d,.-]/g, "").replace(",", "."));
      const max = opts.maxBarra ?? 100;
      if (Number.isFinite(valor) && valor > 0 && max > 0) {
        const cheia = larguraNum - 12;
        doc.rect(
          xDe(colunasNum) + 6,
          doc.y + 3,
          Math.max(1, Math.min(1, valor / max) * cheia),
          LINHA_ALTURA - 6,
          COR.barra,
        );
      }
    }

    for (const [c, celula] of linha.entries()) {
      if (c === 0) {
        doc.drawText(cortar(doc, celula, larguraPrimeira - 12, 8.5), xDe(0) + 6, doc.y + 11, {
          size: 8.5,
          color: COR.tinta,
        });
        continue;
      }
      if (celula === "") continue;
      doc.drawText(celula, xDe(c) + larguraNum - 6 - doc.textWidth(celula, 8.5, "bold"), doc.y + 11, {
        size: 8.5,
        font: "bold",
        color: COR.tinta,
      });
    }
    doc.y += LINHA_ALTURA;
  }

  if (opts.resto && opts.resto > 0) {
    doc.hr(COR.linha);
    doc.y += 3;
    doc.text(`Mais ${opts.resto} ${opts.unidade ?? "linha(s)"} fora deste corte.`, {
      size: 7.5,
      color: COR.suave,
      spacing: 2,
    });
  }
  doc.y += 4;
}

/* -------------------------------------------------------------------------- */

function desenharCapa(doc: PdfDocument, meta: AnalisePdfMeta, geradoEm: string): void {
  doc.rect(doc.marginX, doc.y, 3, 34, COR.marca);
  doc.drawText("Análise de Clientes", doc.marginX + 12, doc.y + 16, {
    size: 17,
    font: "bold",
    color: COR.tinta,
  });
  doc.drawText("Relatório gerencial · Build.Flow · Módulo Comercial", doc.marginX + 12, doc.y + 30, {
    size: 9,
    color: COR.suave,
  });
  doc.y += 34 + 12;

  doc.text(`Recorte: ${meta.filtros}`, { size: 8.5, color: COR.suave });
  // O escopo entra no papel porque o MESMO relatório sai diferente para uma
  // vendedora e para a Gestão: sem a linha, dois arquivos com o mesmo título
  // trazem números diferentes e ninguém sabe por quê.
  doc.text(`Escopo: ${meta.escopo}`, { size: 8.5, color: COR.suave });
  doc.text(`Emitido em ${geradoEm} por ${meta.geradoPor}`, {
    size: 8.5,
    color: COR.suave,
    spacing: 2,
  });
}
