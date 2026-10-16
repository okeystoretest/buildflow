import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { setorDaEtapa, type AtrasoJustificativa, type AtrasoPedido } from "@/lib/atrasos";

/**
 * CONSULTA DO RELATÓRIO DE ATRASOS (fonte única)
 * ---------------------------------------------------------------------------
 * A tela e o PDF têm de devolver EXATAMENTE o mesmo recorte — senão o arquivo
 * exportado contradiz o que o usuário está vendo. Por isso a leitura dos
 * filtros, o `where` e o carregamento vivem aqui, como em pendencias-query.ts.
 */

export interface AtrasosFiltros {
  busca: string;
  de: string;
  ate: string;
}

/** Teto de registros do PDF — protege a memória do contêiner na VPS. */
export const PDF_MAX_PEDIDOS = 300;

export interface AtrasosSearchParams {
  busca?: string;
  de?: string;
  ate?: string;
  page?: string;
}

/** Normaliza a query string em filtros tipados (mesma leitura nos dois lados). */
export function parseAtrasosFiltros(sp?: AtrasosSearchParams): AtrasosFiltros {
  return {
    busca: sp?.busca?.trim() || "",
    de: sp?.de?.trim() || "",
    ate: sp?.ate?.trim() || "",
  };
}

/** Aceita também o URLSearchParams cru (usado no Route Handler do PDF). */
export function filtrosDeSearchParams(params: URLSearchParams): AtrasosFiltros {
  return parseAtrasosFiltros({
    busca: params.get("busca") ?? undefined,
    de: params.get("de") ?? undefined,
    ate: params.get("ate") ?? undefined,
  });
}

/**
 * Intervalo aplicado sobre a DATA DA JUSTIFICATIVA. Usado nos dois lugares: na
 * seleção dos pedidos e no recorte das justificativas carregadas de cada um —
 * sem isso, um pedido entraria pelo período e imprimiria atrasos de fora dele.
 */
function periodoDaJustificativa(f: AtrasosFiltros): Prisma.OrderDelayReasonWhereInput {
  if (!f.de && !f.ate) return {};
  const createdAt: Prisma.DateTimeFilter = {};
  if (f.de) createdAt.gte = new Date(f.de + "T00:00:00");
  if (f.ate) createdAt.lte = new Date(f.ate + "T23:59:59");
  return { createdAt };
}

export function buildAtrasosWhere(f: AtrasosFiltros): Prisma.OrderWhereInput {
  return {
    // Critério central: o pedido TEM justificativa de atraso registrada.
    delayReasons: { some: periodoDaJustificativa(f) },
    ...(f.busca
      ? {
          OR: [
            { orderNumber: { contains: f.busca, mode: "insensitive" as const } },
            { comandaNumber: { contains: f.busca, mode: "insensitive" as const } },
            { customer: { name: { contains: f.busca, mode: "insensitive" as const } } },
            { seller: { name: { contains: f.busca, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };
}

/**
 * Carrega as fichas de atraso já agrupadas por pedido.
 * `skip`/`take` são opcionais: a tela pagina de 20 em 20, o PDF leva o
 * conjunto inteiro do filtro (limitado por PDF_MAX_PEDIDOS).
 */
export async function carregarAtrasos(
  f: AtrasosFiltros,
  opts: { skip?: number; take?: number } = {},
): Promise<{ items: AtrasoPedido[]; total: number }> {
  const where = buildAtrasosWhere(f);
  const periodo = periodoDaJustificativa(f);

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      select: {
        id: true,
        orderNumber: true,
        comandaNumber: true,
        status: true,
        createdAt: true,
        customer: { select: { name: true, code: true } },
        seller: { select: { name: true } },
        orderType: { select: { name: true } },
        originStore: { select: { name: true } },
        delayReasons: {
          where: periodo,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            status: true,
            reason: true,
            minutesLate: true,
            createdById: true,
            createdAt: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      ...(opts.skip !== undefined ? { skip: opts.skip } : {}),
      ...(opts.take !== undefined ? { take: opts.take } : {}),
    }),
    prisma.order.count({ where }),
  ]);

  // Traduz createdById para NOME numa única consulta (como no OrderStatusHistory).
  const autorIds = Array.from(
    new Set(
      orders
        .flatMap((o) => o.delayReasons.map((d) => d.createdById))
        .filter((v): v is string => !!v),
    ),
  );
  const autores = autorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: autorIds } },
        select: { id: true, name: true },
      })
    : [];
  const nomePorId = new Map(autores.map((u) => [u.id, u.name]));

  const items: AtrasoPedido[] = orders.map((o) => {
    const justificativas: AtrasoJustificativa[] = o.delayReasons.map((d) => ({
      id: d.id,
      status: d.status,
      setor: setorDaEtapa(d.status),
      reason: d.reason,
      minutesLate: d.minutesLate,
      autor: d.createdById ? nomePorId.get(d.createdById) ?? null : null,
      createdAt: d.createdAt.toISOString(),
    }));

    return {
      id: o.id,
      orderNumber: o.orderNumber,
      comandaNumber: o.comandaNumber,
      status: o.status,
      customerName: o.customer.name,
      customerCode: o.customer.code,
      sellerName: o.seller.name,
      orderTypeName: o.orderType.name,
      originStoreName: o.originStore?.name ?? null,
      criadoEm: o.createdAt.toISOString(),
      justificativas,
    };
  });

  return { items, total };
}

/** Descrição textual dos filtros, impressa no cabeçalho do PDF. */
export function descreverFiltros(f: AtrasosFiltros): string {
  const partes: string[] = [];
  if (f.busca) partes.push(`busca "${f.busca}"`);
  if (f.de || f.ate) {
    const de = f.de ? formatarDataBR(f.de) : "início";
    const ate = f.ate ? formatarDataBR(f.ate) : "hoje";
    partes.push(`justificadas de ${de} até ${ate}`);
  } else {
    partes.push("período: todo o histórico");
  }
  return partes.join(" · ");
}

function formatarDataBR(iso: string): string {
  const [a, m, d] = iso.split("-");
  return d && m && a ? `${d}/${m}/${a}` : iso;
}
