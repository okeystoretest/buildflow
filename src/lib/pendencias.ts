import type { OrderStatus } from "@prisma/client";

/**
 * RELATÓRIO DE PENDÊNCIAS — regras de leitura do histórico
 * ---------------------------------------------------------------------------
 * O Build.Flow não tem uma tabela de "pendência": o registro é feito como
 * entradas de OrderStatusHistory. Quando a Logística move o pedido para
 * PENDENTE, a nota fica como "Pendência: <texto>"; quando resolve, entra uma
 * nota "Pendência resolvida[: <texto>]" já com o status seguinte (CONFERINDO).
 *
 * Este módulo reconstrói CICLOS a partir dessa trilha: cada entrada em PENDENTE
 * abre um ciclo, e a primeira entrada posterior de resolução o fecha. Assim o
 * relatório mostra a pendência e o seu respectivo desfecho, inclusive quando o
 * mesmo pedido ficou pendente mais de uma vez.
 */

export const PREFIXO_ABERTURA = "Pendência:";
export const PREFIXO_RESOLUCAO = "Pendência resolvida";

export interface HistoricoEntrada {
  id: string;
  status: OrderStatus;
  note: string | null;
  autor: string | null;
  createdAt: string; // ISO
}

export interface CicloPendencia {
  /** Id da entrada de histórico que abriu o ciclo. */
  id: string;
  /** Texto da pendência registrada (sem o prefixo). */
  descricao: string;
  abertaEm: string;
  abertaPor: string | null;
  /** Resolução, quando já houve. */
  resolvidaEm: string | null;
  resolvidaPor: string | null;
  resolucao: string | null;
  /** Entradas de histórico ocorridas ENTRE a abertura e o fechamento. */
  respostas: HistoricoEntrada[];
  /** Duração da pendência em minutos (null enquanto estiver aberta). */
  duracaoMin: number | null;
}

/**
 * Ficha de um pedido no relatório. Vive aqui (e não no componente de tela)
 * porque agora tem DOIS consumidores: a listagem em React e o gerador de PDF.
 */
export interface PendenciaPedido {
  id: string;
  orderNumber: string;
  comandaNumber: string | null;
  status: OrderStatus;
  pieceCount: number;
  customerName: string;
  customerCode: string;
  sellerName: string;
  orderTypeName: string;
  originStoreName: string | null;
  criadoEm: string;
  ciclos: CicloPendencia[];
  financeIssue: string | null;
  financeIssueAt: string | null;
  financeIssueResolvedAt: string | null;
}

function semPrefixo(note: string | null, prefixo: string): string {
  if (!note) return "";
  const t = note.trim();
  if (!t.toLowerCase().startsWith(prefixo.toLowerCase())) return t;
  return t.slice(prefixo.length).replace(/^[:\s-]+/, "").trim();
}

export function isAberturaPendencia(h: HistoricoEntrada): boolean {
  return h.status === "PENDENTE";
}

export function isResolucaoPendencia(h: HistoricoEntrada): boolean {
  return (h.note ?? "").trim().toLowerCase().startsWith(PREFIXO_RESOLUCAO.toLowerCase());
}

/**
 * Monta os ciclos de pendência de UM pedido a partir do histórico completo,
 * que deve vir ordenado do mais antigo para o mais recente.
 */
export function montarCiclos(historico: HistoricoEntrada[]): CicloPendencia[] {
  const ciclos: CicloPendencia[] = [];
  let atual: CicloPendencia | null = null;

  for (const h of historico) {
    if (isAberturaPendencia(h)) {
      // Uma nova abertura fecha implicitamente a anterior que ficou sem
      // resolução explícita (o pedido voltou a ficar pendente).
      if (atual) ciclos.push(atual);
      atual = {
        id: h.id,
        descricao: semPrefixo(h.note, PREFIXO_ABERTURA) || "Pendência sem descrição registrada.",
        abertaEm: h.createdAt,
        abertaPor: h.autor,
        resolvidaEm: null,
        resolvidaPor: null,
        resolucao: null,
        respostas: [],
        duracaoMin: null,
      };
      continue;
    }

    if (!atual) continue; // evento fora de qualquer ciclo de pendência

    if (isResolucaoPendencia(h)) {
      atual.resolvidaEm = h.createdAt;
      atual.resolvidaPor = h.autor;
      atual.resolucao = semPrefixo(h.note, PREFIXO_RESOLUCAO) || "Resolvida sem comentário.";
      atual.duracaoMin = Math.max(
        0,
        Math.round(
          (new Date(h.createdAt).getTime() - new Date(atual.abertaEm).getTime()) / 60_000,
        ),
      );
      ciclos.push(atual);
      atual = null;
      continue;
    }

    // Qualquer outro evento entre a abertura e a resolução entra como
    // "resposta"/tratativa do ciclo (ex.: avanço manual, retrocesso da Gestão).
    atual.respostas.push(h);
  }

  if (atual) ciclos.push(atual);
  return ciclos;
}

export interface ResumoPendencias {
  pedidos: number;
  ciclos: number;
  emAberto: number;
  resolvidas: number;
  /** Média de duração das pendências JÁ RESOLVIDAS, em minutos. */
  mediaResolucaoMin: number | null;
  /** Mediana das resolvidas — menos sensível a um caso esquecido por semanas. */
  medianaResolucaoMin: number | null;
}

/**
 * Consolida os números do cabeçalho do relatório.
 *
 * Só as pendências RESOLVIDAS entram na média/mediana: uma pendência ainda
 * aberta não tem duração final, e contá-la com o tempo parcial puxaria o
 * indicador para baixo (mesma regra usada em src/lib/sla-metrics.ts).
 */
export function resumirPendencias(pedidos: PendenciaPedido[]): ResumoPendencias {
  const ciclos = pedidos.flatMap((p) => p.ciclos);
  const duracoes = ciclos
    .filter((c) => c.resolvidaEm && c.duracaoMin !== null)
    .map((c) => c.duracaoMin as number)
    .sort((a, b) => a - b);

  const media = duracoes.length
    ? Math.round(duracoes.reduce((s, v) => s + v, 0) / duracoes.length)
    : null;

  let mediana: number | null = null;
  if (duracoes.length) {
    const meio = Math.floor(duracoes.length / 2);
    mediana =
      duracoes.length % 2 === 0
        ? Math.round((duracoes[meio - 1] + duracoes[meio]) / 2)
        : duracoes[meio];
  }

  return {
    pedidos: pedidos.length,
    ciclos: ciclos.length,
    emAberto: ciclos.filter((c) => !c.resolvidaEm).length,
    resolvidas: duracoes.length,
    mediaResolucaoMin: media,
    medianaResolucaoMin: mediana,
  };
}

/** Formata minutos como "2d 3h 15min" (leitura rápida no relatório). */
export function formatDuracao(min: number | null): string {
  if (min === null) return "—";
  if (min < 1) return "menos de 1 min";
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  return [d ? `${d}d` : "", h ? `${h}h` : "", m ? `${m}min` : ""].filter(Boolean).join(" ") || "0min";
}
