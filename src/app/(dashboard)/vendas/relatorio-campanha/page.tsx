import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { BackButton } from "@/components/shared/back-button";
import { Pagination } from "@/components/shared/pagination";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL } from "@/lib/utils";
import { RelatorioCampanhaFiltros } from "./filtros-client";
import type { Prisma } from "@prisma/client";

const PER_PAGE = 20;

// Relatório de Campanha (Vendas): detalhamento de TODOS os itens de campanha
// (CampaignItem) — cada linha traz campanha, referência, quantidade, valor,
// pedido, cliente, vendedora e data.
//
// RBAC:
//  - VENDAS: vê apenas os itens dos SEUS pedidos (escopo forçado no servidor).
//  - GESTÃO: vê tudo + filtro por vendedora.
//  - FINANCEIRO: acompanha o padrão de Vendas (visão global, como nos demais
//    módulos), com o mesmo filtro por vendedora da GESTÃO.
export default async function RelatorioCampanhaPage({
  searchParams,
}: {
  searchParams: { campanha?: string; vendedora?: string; page?: string };
}) {
  const session = await requireRole(["VENDAS", "GESTAO", "FINANCEIRO"]);
  const veTudo = session.role === "GESTAO" || session.role === "FINANCEIRO";

  const campanhaId = (searchParams.campanha ?? "").trim();
  const vendedoraId = (searchParams.vendedora ?? "").trim();
  const page = Math.max(1, Number(searchParams.page ?? 1) || 1);

  // Escopo do vendedor: VENDAS trava nos próprios pedidos; privilegiados podem
  // filtrar por uma vendedora específica (ou ver todas).
  const sellerScope = veTudo
    ? (vendedoraId ? { sellerId: vendedoraId } : {})
    : { sellerId: session.userId };

  const where: Prisma.CampaignItemWhereInput = {
    ...(campanhaId ? { campaignId: campanhaId } : {}),
    order: { is: sellerScope },
  };

  const [items, total, campaigns, sellers, agg] = await Promise.all([
    prisma.campaignItem.findMany({
      where,
      include: {
        campaign: { select: { name: true } },
        order: {
          select: {
            orderNumber: true,
            comandaNumber: true,
            customer: { select: { name: true } },
            seller: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
    prisma.campaignItem.count({ where }),
    prisma.campaign.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    // Lista de vendedoras para o filtro (só usada por privilegiados).
    veTudo
      ? prisma.user.findMany({ where: { role: "VENDAS" }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([] as { id: string; name: string }[]),
    // Totais do escopo atual (quantidade e valor somados).
    prisma.campaignItem.aggregate({
      where,
      _sum: { quantity: true, value: true },
    }),
  ]);

  const totalQtd = agg._sum.quantity ?? 0;
  const totalValor = Number(agg._sum.value ?? 0);

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
      />

      {/* Resumo do escopo filtrado */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
      </div>

      <Card>
        <CardHeader><CardTitle>Detalhamento dos itens</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4">Campanha</th>
                  <th className="py-2 pr-4">Referência</th>
                  <th className="py-2 pr-4">Qtd</th>
                  <th className="py-2 pr-4">Valor</th>
                  <th className="py-2 pr-4">Pedido</th>
                  <th className="py-2 pr-4">Comanda</th>
                  <th className="py-2 pr-4">Cliente</th>
                  {veTudo && <th className="py-2 pr-4">Vendedora</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-b border-border last:border-0 transition-colors hover:bg-secondary/50">
                    <td className="py-2 pr-4 font-medium">{it.campaign?.name ?? "—"}</td>
                    <td className="py-2 pr-4">{it.reference}</td>
                    <td className="py-2 pr-4 font-data">{it.quantity}</td>
                    <td className="py-2 pr-4 font-data">{formatBRL(Number(it.value))}</td>
                    <td className="py-2 pr-4 font-data">{it.order?.orderNumber ?? "—"}</td>
                    <td className="py-2 pr-4 font-data">{it.order?.comandaNumber ?? "—"}</td>
                    <td className="py-2 pr-4">{it.order?.customer?.name ?? "—"}</td>
                    {veTudo && <td className="py-2 pr-4">{it.order?.seller?.name ?? "—"}</td>}
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={veTudo ? 8 : 7} className="py-6 text-center text-muted-foreground">
                      Nenhum item de campanha encontrado para o filtro atual.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Pagination page={page} perPage={PER_PAGE} total={total} label="itens" />
    </div>
  );
}
