import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { BackButton } from "@/components/shared/back-button";
import { Pagination } from "@/components/shared/pagination";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL } from "@/lib/utils";
import { comissaoDoItem, type CommissionScope } from "@/lib/campaign-commission";
import { RelatorioCampanhaFiltros } from "./filtros-client";
import type { Prisma } from "@prisma/client";

const PER_PAGE = 20;

// Relatório de Campanha (Vendas): detalhamento de TODOS os itens de campanha
// (CampaignItem) — cada linha traz campanha, referência, quantidade, valor,
// pedido, cliente, vendedora, indicador de desconto e a comissão da peça.
//
// RBAC:
//  - VENDAS: vê apenas os itens dos SEUS pedidos (escopo forçado no servidor).
//  - GESTÃO/FINANCEIRO: veem tudo + filtro por vendedora.
export default async function RelatorioCampanhaPage({
  searchParams,
}: {
  searchParams: { campanha?: string; vendedora?: string; de?: string; ate?: string; page?: string };
}) {
  const session = await requireRole(["VENDAS", "GESTAO", "FINANCEIRO"]);
  const veTudo = session.role === "GESTAO" || session.role === "FINANCEIRO";

  const campanhaId = (searchParams.campanha ?? "").trim();
  const vendedoraId = (searchParams.vendedora ?? "").trim();
  const de = (searchParams.de ?? "").trim();
  const ate = (searchParams.ate ?? "").trim();
  const page = Math.max(1, Number(searchParams.page ?? 1) || 1);

  // Escopo do vendedor: VENDAS trava nos próprios pedidos; privilegiados podem
  // filtrar por uma vendedora específica (ou ver todas).
  const sellerScope = veTudo
    ? (vendedoraId ? { sellerId: vendedoraId } : {})
    : { sellerId: session.userId };

  // Filtro por período (intervalo de datas) sobre a criação do item.
  const createdAt: Prisma.DateTimeFilter = {};
  if (de) createdAt.gte = new Date(de + "T00:00:00");
  if (ate) createdAt.lte = new Date(ate + "T23:59:59");
  const temPeriodo = de !== "" || ate !== "";

  const where: Prisma.CampaignItemWhereInput = {
    ...(campanhaId ? { campaignId: campanhaId } : {}),
    ...(temPeriodo ? { createdAt } : {}),
    order: { is: sellerScope },
  };

  // Include comum: campanha + dados do pedido (inclui desconto e escopo da
  // vendedora, necessários para calcular a comissão por peça).
  const itemInclude = {
    campaign: { select: { name: true } },
    order: {
      select: {
        orderNumber: true,
        comandaNumber: true,
        campaignDiscount: true,
        customer: { select: { name: true } },
        seller: { select: { name: true, salesModel: true } },
      },
    },
  } as const;

  const [items, total, campaigns, sellers, agg, allForTotals] = await Promise.all([
    prisma.campaignItem.findMany({
      where,
      include: itemInclude,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
    prisma.campaignItem.count({ where }),
    prisma.campaign.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    veTudo
      ? prisma.user.findMany({ where: { role: "VENDAS" }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([] as { id: string; name: string }[]),
    prisma.campaignItem.aggregate({ where, _sum: { quantity: true, value: true } }),
    // Para os TOTAIS consolidados de comissão precisamos varrer TODOS os itens
    // do filtro (não só a página), pois a comissão depende do desconto e do
    // escopo de cada pedido. Trazemos só os campos necessários.
    prisma.campaignItem.findMany({
      where,
      select: {
        quantity: true,
        order: { select: { campaignDiscount: true, seller: { select: { salesModel: true } } } },
      },
    }),
  ]);

  const totalQtd = agg._sum.quantity ?? 0;
  const totalValor = Number(agg._sum.value ?? 0);

  // Comissão consolidada: soma a comissão de CADA item do filtro atual. Como o
  // filtro já reflete a vendedora selecionada (quando ativo), este total
  // recalcula dinamicamente por vendedora.
  const totalComissao = allForTotals.reduce((acc, it) => {
    const scope = (it.order?.seller?.salesModel ?? null) as CommissionScope;
    return acc + comissaoDoItem(scope, it.order?.campaignDiscount === true, it.quantity);
  }, 0);

  const resumoPeriodo = temPeriodo
    ? ` no período de ${de ? new Date(de).toLocaleDateString("pt-BR") : "início"} a ${ate ? new Date(ate).toLocaleDateString("pt-BR") : "hoje"}`
    : "";

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <BackButton href="/vendas" />
      <h1 className="text-2xl font-bold text-vendas">Relatório de Campanha</h1>

      <RelatorioCampanhaFiltros
        campaigns={campaigns}
        sellers={sellers}
        showSellerFilter={veTudo}
        defaultCampaign={campanhaId}
        defaultSeller={vendedoraId}
        defaultDe={de}
        defaultAte={ate}
      />

      {/* Resumo do escopo filtrado */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card><CardContent className="pt-5">
          <p className="text-xs text-muted-foreground">Itens</p>
          <p className="font-data text-2xl font-bold text-vendas">{total}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <p className="text-xs text-muted-foreground">Peças (quantidade)</p>
          <p className="font-data text-2xl font-bold text-vendas">{totalQtd}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <p className="text-xs text-muted-foreground">Valor total</p>
          <p className="font-data text-2xl font-bold text-vendas">{formatBRL(totalValor)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <p className="text-xs text-muted-foreground">Comissão total</p>
          <p className="font-data text-2xl font-bold text-vendas">{formatBRL(totalComissao)}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Detalhamento dos itens{resumoPeriodo}</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4">Campanha</th>
                  <th className="py-2 pr-4">Referência</th>
                  <th className="py-2 pr-4">Qtd</th>
                  <th className="py-2 pr-4">Valor</th>
                  <th className="py-2 pr-4">Desconto</th>
                  <th className="py-2 pr-4">Comissão</th>
                  <th className="py-2 pr-4">Pedido</th>
                  <th className="py-2 pr-4">Cliente</th>
                  {veTudo && <th className="py-2 pr-4">Vendedora</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const desconto = it.order?.campaignDiscount === true;
                  const scope = (it.order?.seller?.salesModel ?? null) as CommissionScope;
                  const comissao = comissaoDoItem(scope, desconto, it.quantity);
                  return (
                    <tr key={it.id} className="border-b border-border last:border-0 transition-colors hover:bg-secondary/50">
                      <td className="py-2 pr-4 font-medium">{it.campaign?.name ?? "—"}</td>
                      <td className="py-2 pr-4">{it.reference}</td>
                      <td className="py-2 pr-4 font-data">{it.quantity}</td>
                      <td className="py-2 pr-4 font-data">{formatBRL(Number(it.value))}</td>
                      <td className="py-2 pr-4">
                        {desconto ? (
                          <span className="inline-flex items-center rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-600 dark:text-red-400">
                            50%
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                            100%
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4 font-data">{formatBRL(comissao)}</td>
                      <td className="py-2 pr-4 font-data">{it.order?.orderNumber ?? "—"}</td>
                      <td className="py-2 pr-4">{it.order?.customer?.name ?? "—"}</td>
                      {veTudo && <td className="py-2 pr-4">{it.order?.seller?.name ?? "—"}</td>}
                    </tr>
                  );
                })}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={veTudo ? 9 : 8} className="py-6 text-center text-muted-foreground">
                      Nenhum item de campanha encontrado para o filtro atual.
                    </td>
                  </tr>
                )}
              </tbody>
              {items.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-border font-semibold">
                    <td className="py-2 pr-4" colSpan={2}>Total{vendedoraId ? " (vendedora filtrada)" : ""}</td>
                    <td className="py-2 pr-4 font-data">{totalQtd}</td>
                    <td className="py-2 pr-4 font-data">{formatBRL(totalValor)}</td>
                    <td className="py-2 pr-4">—</td>
                    <td className="py-2 pr-4 font-data text-vendas">{formatBRL(totalComissao)}</td>
                    <td className="py-2 pr-4" colSpan={veTudo ? 3 : 2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            A linha de Total consolida todos os itens do filtro atual (não apenas a página exibida).
          </p>
        </CardContent>
      </Card>

      <Pagination page={page} perPage={PER_PAGE} total={total} label="itens" />
    </div>
  );
}
