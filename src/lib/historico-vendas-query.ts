import type { Prisma } from "@prisma/client";

/**
 * FILTROS DO HISTÓRICO DE PEDIDOS — lidos uma vez, usados na tela e no PDF.
 *
 * Existe para que a exportação não possa divergir da listagem. A tela e o
 * Route Handler do PDF montam o MESMO `where` a partir da mesma função; um
 * `where` copiado nos dois lados divergiria na primeira vez que um filtro
 * mudasse, e a divergência apareceria como um relatório que "não bate com a
 * tela" — sem nenhum erro para investigar.
 *
 * O ESCOPO É PARTE DO WHERE, não um detalhe da tela. Quem é de VENDAS vê e
 * exporta apenas os próprios pedidos; GESTAO e FINANCEIRO veem tudo. Esconder
 * a listagem e deixar a rota do PDF aberta daria a qualquer vendedora o
 * histórico da equipe inteira com uma URL digitada à mão — mesma lição do
 * filtro de vendedora da Análise de Clientes.
 */

/** Teto de pedidos no PDF. Acima disso o relatório sai truncado e avisa. */
export const PDF_MAX_PEDIDOS = 300;

export interface HistoricoFiltros {
  comanda: string;
  de: string;
  ate: string;
}

export interface HistoricoSearchParams {
  comanda?: string;
  de?: string;
  ate?: string;
  page?: string;
}

/** Normaliza a query string em filtros tipados (mesma leitura nos dois lados). */
export function parseHistoricoFiltros(sp?: HistoricoSearchParams): HistoricoFiltros {
  return {
    comanda: sp?.comanda?.trim() || "",
    de: sp?.de?.trim() || "",
    ate: sp?.ate?.trim() || "",
  };
}

/** Aceita também o URLSearchParams cru (usado no Route Handler do PDF). */
export function filtrosDeSearchParams(params: URLSearchParams): HistoricoFiltros {
  return parseHistoricoFiltros({
    comanda: params.get("comanda") ?? undefined,
    de: params.get("de") ?? undefined,
    ate: params.get("ate") ?? undefined,
  });
}

/**
 * O `where` do histórico, escopo incluído.
 *
 * `sellerId` não-nulo RESTRINGE; nulo é o escopo amplo de GESTAO/FINANCEIRO.
 * Quem chama decide isso a partir da sessão, nunca a partir da query string.
 *
 * Sem filtro de data padrão, de propósito: cair no "mês atual" ocultava
 * silenciosamente todo o histórico anterior (correção 2.1). O período só entra
 * quando o usuário o define.
 */
export function buildHistoricoWhere(
  f: HistoricoFiltros,
  escopo: { sellerId: string | null },
): Prisma.OrderWhereInput {
  const updatedAt: Prisma.DateTimeFilter = {};
  if (f.de) updatedAt.gte = new Date(f.de + "T00:00:00");
  if (f.ate) updatedAt.lte = new Date(f.ate + "T23:59:59");
  const temPeriodo = f.de !== "" || f.ate !== "";

  return {
    status: "CONCLUIDO",
    ...(escopo.sellerId ? { sellerId: escopo.sellerId } : {}),
    ...(temPeriodo ? { updatedAt } : {}),
    ...(f.comanda ? { comandaNumber: { contains: f.comanda, mode: "insensitive" } } : {}),
  };
}

/** Uma linha descrevendo o recorte, impressa na capa do PDF. */
export function descreverFiltros(f: HistoricoFiltros): string {
  const partes: string[] = [];
  if (f.comanda) partes.push(`comanda "${f.comanda}"`);
  if (f.de || f.ate) {
    const de = f.de ? formatarDataBR(f.de) : "início";
    const ate = f.ate ? formatarDataBR(f.ate) : "hoje";
    partes.push(`conclusão de ${de} até ${ate}`);
  } else {
    partes.push("período: todo o histórico");
  }
  return partes.join(" · ");
}

function formatarDataBR(iso: string): string {
  const [a, m, d] = iso.split("-");
  return d && m && a ? `${d}/${m}/${a}` : iso;
}
