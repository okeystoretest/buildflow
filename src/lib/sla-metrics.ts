import type { OrderStatus } from "@prisma/client";
import { ORDER_FLOW, SIMPLIFIED_FLOW, EXCEPTION_STATUSES } from "@/lib/order-flow";

/**
 * MÉTRICAS DE LOGÍSTICA — SLA médio por etapa
 * ---------------------------------------------------------------------------
 * O tempo de permanência num status não é gravado em lugar nenhum: ele é
 * DERIVADO de OrderStatusHistory. Para cada pedido, ordenamos as entradas por
 * data e a permanência no status da entrada N é `entrada[N+1] - entrada[N]`.
 *
 * Regras de contagem (importantes para o número não mentir):
 *  - Só contam PERMANÊNCIAS FECHADAS, ou seja, que já tiveram um evento
 *    seguinte. O status atual do pedido está "em andamento" e entraria como um
 *    tempo artificialmente curto, puxando a média para baixo.
 *  - Entradas repetidas do MESMO status em sequência (ex.: dois registros em
 *    ENVIADO quando o motorista pega e devolve o pedido) são tratadas como um
 *    único intervalo contínuo — senão o mesmo período seria contado duas vezes.
 *  - Usamos MEDIANA junto da média: uma única peça esquecida por 30 dias
 *    distorce a média, e a mediana mostra o comportamento típico da operação.
 */

export interface HistPonto {
  orderId: string;
  status: OrderStatus;
  at: Date;
}

export interface EtapaMetrica {
  status: OrderStatus;
  /** Quantidade de permanências fechadas medidas. */
  amostras: number;
  mediaMin: number;
  medianaMin: number;
  /** Maior permanência observada (para caçar gargalo). */
  maxMin: number;
}

export interface MetricasResultado {
  etapas: EtapaMetrica[];
  /** Lead time: da criação até a conclusão (CONCLUIDO ou ENTREGUE final). */
  leadTime: { amostras: number; mediaMin: number; medianaMin: number; maxMin: number };
  /** Total de pedidos considerados no recorte. */
  pedidos: number;
}

/** Ordem canônica de exibição: fluxo padrão, depois o que sobrar. */
export function ordemEtapas(): OrderStatus[] {
  const base: OrderStatus[] = [...ORDER_FLOW];
  for (const s of SIMPLIFIED_FLOW) if (!base.includes(s)) base.push(s);
  for (const s of EXCEPTION_STATUSES) if (!base.includes(s)) base.push(s);
  return base;
}

function mediana(valores: number[]): number {
  if (valores.length === 0) return 0;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : Math.round((v[meio - 1] + v[meio]) / 2);
}

function media(valores: number[]): number {
  if (valores.length === 0) return 0;
  return Math.round(valores.reduce((a, b) => a + b, 0) / valores.length);
}

/**
 * Recebe TODOS os pontos de histórico dos pedidos do recorte (já ordenados por
 * pedido e data) e devolve o SLA agregado por etapa.
 */
export function calcularMetricas(
  pontos: HistPonto[],
  criadoEmPorPedido: Map<string, Date>,
): MetricasResultado {
  // Agrupa por pedido preservando a ordem cronológica.
  const porPedido = new Map<string, HistPonto[]>();
  for (const p of pontos) {
    const lista = porPedido.get(p.orderId);
    if (lista) lista.push(p);
    else porPedido.set(p.orderId, [p]);
  }

  const duracoes = new Map<OrderStatus, number[]>();
  const leadTimes: number[] = [];

  for (const [orderId, bruto] of porPedido) {
    const linha = [...bruto].sort((a, b) => a.at.getTime() - b.at.getTime());

    // Colapsa repetições consecutivas do mesmo status num único intervalo.
    const compacto: HistPonto[] = [];
    for (const p of linha) {
      const ultimo = compacto[compacto.length - 1];
      if (ultimo && ultimo.status === p.status) continue;
      compacto.push(p);
    }

    for (let i = 0; i < compacto.length - 1; i++) {
      const min = Math.round(
        (compacto[i + 1].at.getTime() - compacto[i].at.getTime()) / 60_000,
      );
      if (min < 0) continue;
      const arr = duracoes.get(compacto[i].status);
      if (arr) arr.push(min);
      else duracoes.set(compacto[i].status, [min]);
    }

    // Lead time: criação -> primeira conclusão registrada.
    const criado = criadoEmPorPedido.get(orderId);
    const fim = compacto.find((p) => p.status === "CONCLUIDO" || p.status === "ENTREGUE");
    if (criado && fim) {
      const min = Math.round((fim.at.getTime() - criado.getTime()) / 60_000);
      if (min >= 0) leadTimes.push(min);
    }
  }

  const etapas: EtapaMetrica[] = ordemEtapas()
    .filter((s) => (duracoes.get(s) ?? []).length > 0)
    .map((s) => {
      const v = duracoes.get(s)!;
      return {
        status: s,
        amostras: v.length,
        mediaMin: media(v),
        medianaMin: mediana(v),
        maxMin: Math.max(...v),
      };
    });

  return {
    etapas,
    leadTime: {
      amostras: leadTimes.length,
      mediaMin: media(leadTimes),
      medianaMin: mediana(leadTimes),
      maxMin: leadTimes.length ? Math.max(...leadTimes) : 0,
    },
    pedidos: porPedido.size,
  };
}

/** Formata minutos como "2d 3h 15min". */
export function formatMin(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "0min";
  if (min < 1) return "menos de 1 min";
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  return [d ? `${d}d` : "", h ? `${h}h` : "", m ? `${m}min` : ""].filter(Boolean).join(" ") || "0min";
}
