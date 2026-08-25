import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  montarCiclos,
  type HistoricoEntrada,
  type PendenciaPedido,
} from "@/lib/pendencias";

/**
 * CONSULTA DO RELATÓRIO DE PENDÊNCIAS (fonte única)
 * ---------------------------------------------------------------------------
 * A tela e o PDF precisam devolver EXATAMENTE o mesmo conjunto de registros —
 * senão o arquivo exportado contradiz o que o usuário está vendo. Por isso a
 * leitura dos filtros, o `where` e o carregamento vivem aqui, e não dentro da
 * página. A página passou a ser só apresentação.
 */

export type SituacaoPendencia = "todas" | "abertas" | "resolvidas";

export interface PendenciasFiltros {
  busca: string;
  de: string;
  ate: string;
  situacao: SituacaoPendencia;
}

/** Teto de registros do PDF — protege a memória do contêiner na VPS. */
export const PDF_MAX_PEDIDOS = 300;

export interface PendenciasSearchParams {
  busca?: string;
  de?: string;
  ate?: string;
  situacao?: string;
  page?: string;
}

/** Normaliza a query string em filtros tipados (mesma leitura nos dois lados). */
export function parsePendenciasFiltros(sp?: PendenciasSearchParams): PendenciasFiltros {
  const situacao = sp?.situacao;
  return {
    busca: sp?.busca?.trim() || "",
    de: sp?.de?.trim() || "",
    ate: sp?.ate?.trim() || "",
    situacao: situacao === "abertas" || situacao === "resolvidas" ? situacao : "todas",
  };
}

/** Aceita também o URLSearchParams cru (usado no Route Handler do PDF). */
export function filtrosDeSearchParams(params: URLSearchParams): PendenciasFiltros {
  return parsePendenciasFiltros({
    busca: params.get("busca") ?? undefined,
    de: params.get("de") ?? undefined,
    ate: params.get("ate") ?? undefined,
    situacao: params.get("situacao") ?? undefined,
  });
}

export function buildPendenciasWhere(f: PendenciasFiltros): Prisma.OrderWhereInput {
  // Intervalo aplicado sobre a DATA DE ABERTURA da pendência.
  const aberturaFilter: Prisma.DateTimeFilter = {};
  if (f.de) aberturaFilter.gte = new Date(f.de + "T00:00:00");
  if (f.ate) aberturaFilter.lte = new Date(f.ate + "T23:59:59");
  const temPeriodo = f.de !== "" || f.ate !== "";

  return {
    // Critério central: o pedido ATINGIU o status Pendente em algum momento.
    history: {
      some: {
        status: "PENDENTE",
        ...(temPeriodo ? { createdAt: aberturaFilter } : {}),
      },
    },
    ...(f.situacao === "abertas" ? { status: "PENDENTE" as const } : {}),
    ...(f.situacao === "resolvidas" ? { status: { not: "PENDENTE" as const } } : {}),
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
 * Carrega as fichas de pendência já com os ciclos montados.
 * `skip`/`take` são opcionais: a tela pagina de 20 em 20, o PDF leva o
 * conjunto inteiro do filtro (limitado por PDF_MAX_PEDIDOS).
 */
export async function carregarPendencias(
  f: PendenciasFiltros,
  opts: { skip?: number; take?: number } = {},
): Promise<{ items: PendenciaPedido[]; total: number }> {
  const where = buildPendenciasWhere(f);

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      select: {
        id: true,
        orderNumber: true,
        comandaNumber: true,
        status: true,
        pieceCount: true,
        createdAt: true,
        financeIssue: true,
        financeIssueAt: true,
        financeIssueResolvedAt: true,
        customer: { select: { name: true, code: true } },
        seller: { select: { name: true } },
        orderType: { select: { name: true } },
        originStore: { select: { name: true } },
        history: {
          orderBy: { createdAt: "asc" },
          select: { id: true, status: true, note: true, changedBy: true, createdAt: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      ...(opts.skip !== undefined ? { skip: opts.skip } : {}),
      ...(opts.take !== undefined ? { take: opts.take } : {}),
    }),
    prisma.order.count({ where }),
  ]);

  // Traduz changedBy (id) para NOME numa única consulta.
  const autorIds = Array.from(
    new Set(
      orders.flatMap((o) => o.history.map((h) => h.changedBy)).filter((v): v is string => !!v),
    ),
  );
  const autores = autorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: autorIds } },
        select: { id: true, name: true },
      })
    : [];
  const nomePorId = new Map(autores.map((u) => [u.id, u.name]));

  const items: PendenciaPedido[] = orders.map((o) => {
    const historico: HistoricoEntrada[] = o.history.map((h) => ({
      id: h.id,
      status: h.status,
      note: h.note,
      autor: h.changedBy ? nomePorId.get(h.changedBy) ?? null : null,
      createdAt: h.createdAt.toISOString(),
    }));

    return {
      id: o.id,
      orderNumber: o.orderNumber,
      comandaNumber: o.comandaNumber,
      status: o.status,
      pieceCount: o.pieceCount,
      customerName: o.customer.name,
      customerCode: o.customer.code,
      sellerName: o.seller.name,
      orderTypeName: o.orderType.name,
      originStoreName: o.originStore?.name ?? null,
      criadoEm: o.createdAt.toISOString(),
      ciclos: montarCiclos(historico),
      // Pendência do FINANCEIRO ("Qual o problema?") — origem diferente da
      // pendência logística, mas o relatório reúne as duas na mesma ficha.
      financeIssue: o.financeIssue,
      financeIssueAt: o.financeIssueAt ? o.financeIssueAt.toISOString() : null,
      financeIssueResolvedAt: o.financeIssueResolvedAt
        ? o.financeIssueResolvedAt.toISOString()
        : null,
    };
  });

  return { items, total };
}

/** Descrição textual dos filtros, impressa no cabeçalho do PDF. */
export function descreverFiltros(f: PendenciasFiltros): string {
  const partes: string[] = [];
  if (f.busca) partes.push(`busca "${f.busca}"`);
  partes.push(
    f.situacao === "abertas"
      ? "situação: pendentes agora"
      : f.situacao === "resolvidas"
        ? "situação: já resolvidas"
        : "situação: todas",
  );
  if (f.de || f.ate) {
    const de = f.de ? formatarDataBR(f.de) : "início";
    const ate = f.ate ? formatarDataBR(f.ate) : "hoje";
    partes.push(`abertura de ${de} até ${ate}`);
  } else {
    partes.push("período: todo o histórico");
  }
  return partes.join(" · ");
}

function formatarDataBR(iso: string): string {
  const [a, m, d] = iso.split("-");
  return d && m && a ? `${d}/${m}/${a}` : iso;
}
