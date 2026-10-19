import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { formatBRL } from "@/lib/utils";
import { BackButton } from "@/components/shared/back-button";
import { HistoricoFiltros } from "./filtros-client";
import { ComandaList, type ComandaListItem } from "@/components/shared/comanda-list";
import { isAnexoDispensavel } from "@/lib/validations/order";
import { Pagination } from "@/components/shared/pagination";
import {
  buildHistoricoWhere,
  parseHistoricoFiltros,
} from "@/lib/historico-vendas-query";
import { RelatorioDeVendas } from "./exportar-pdf-client";

// Itens por pagina. O historico so cresce (todo pedido concluido fica aqui),
// entao a consulta e paginada no banco em vez de trazer tudo.
const PER_PAGE = 9;

export default async function HistoricoPage(
  props: {
    searchParams: Promise<{ comanda?: string; de?: string; ate?: string; page?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const session = await requireRole(["VENDAS", "GESTAO", "FINANCEIRO"]);

  // Filtros e escopo vivem em historico-vendas-query.ts: a rota do PDF monta o
  // MESMO where a partir das mesmas funcoes, e e o que garante que o relatorio
  // nao divirja desta tela — nem no recorte, nem no escopo.
  const { de, ate, comanda } = parseHistoricoFiltros(searchParams);
  const page = Math.max(1, Number(searchParams.page ?? 1) || 1);
  const temPeriodo = de !== "" || ate !== "";

  // GESTAO/FINANCEIRO veem tudo; VENDAS ve apenas os proprios pedidos.
  const sellerId =
    session.role === "GESTAO" || session.role === "FINANCEIRO" ? null : session.userId;

  // O mesmo filtro serve para listar a pagina e para contar o total.
  const where = buildHistoricoWhere({ de, ate, comanda }, { sellerId });

  // As tres consultas correm em paralelo.
  //
  // A pagina carrega apenas o que o CARD fechado mostra (o mesmo card do Fluxo
  // de Pedidos): identificacao, cliente, vendedora, valor e os sinais de
  // Comprovante/NF. A ficha completa de cada comanda e buscada em
  // /api/orders/[id] quando o bloco e aberto — sao 20 comandas por pagina, e
  // trazer a ficha inteira das 20 a cada carregamento seria pagar por tudo o
  // que ninguem abriu.
  const [orders, total, campaigns] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        customer: { select: { name: true, code: true } },
        seller: { select: { name: true } },
        orderType: { select: { name: true } },
        _count: { select: { paymentProofs: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
    prisma.order.count({ where }),
    // Campanhas ativas: alimentam o seletor do CRUD de itens de campanha.
    prisma.campaign.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  // Fallback (correcao 2.1): registros antigos podem ter campos ausentes
  // (customer nulo, total nulo). Blindamos a montagem para nunca quebrar a
  // renderizacao nem ocultar o item.
  const items: ComandaListItem[] = orders.map((o) => ({
    id: o.id,
    status: o.status,
    orderNumber: o.orderNumber ?? "—",
    comandaNumber: o.comandaNumber,
    customerName: o.customer?.name ?? "Cliente não informado",
    customerCode: o.customer?.code ?? null,
    sellerName: o.seller?.name ?? "—",
    total: formatBRL((o.total ?? 0).toString()),
    approvedByFinance: o.comandaNumber != null,
    hasInvoice: o.invoicePath != null,
    hasPaymentProof: o.paymentProofPath != null || o._count.paymentProofs > 0,
    isExchange: isAnexoDispensavel(o.orderType?.name),
    pickupAtStore: o.pickupAtStore,
    hasTracking: !!o.trackingCode,
    // Base da devolução: valor atual da mercadoria, sem frete.
    orderValue: Number(o.orderValue ?? 0),
  }));

  const resumoPeriodo = temPeriodo
    ? ` entre ${de ? new Date(de).toLocaleDateString("pt-BR") : "início"} e ${
        ate ? new Date(ate).toLocaleDateString("pt-BR") : "hoje"
      }`
    : " (todos os períodos)";

  return (
    <div className="space-y-6">
      <BackButton href="/vendas" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-vendas-text">Histórico de Pedidos</h1>
        {/* O relatorio pede o periodo no proprio modal, entao o botao nao
            depende do que o filtro da tela esta mostrando agora. */}
        <RelatorioDeVendas defaultDe={de} defaultAte={ate} />
      </div>

      <HistoricoFiltros defaultDe={de} defaultAte={ate} defaultComanda={comanda} />

      <p className="text-sm text-muted-foreground">
        {total} pedido(s) encontrado(s){resumoPeriodo}.
      </p>

      {total === 0 && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Nenhum pedido no período/filtro.</CardContent></Card>
      )}

      {/* Exclusão definitiva do pedido: perfis Gestão e Financeiro.
          Devoluções: todos os perfis desta tela (a lista já é restrita ao que
          cada um pode ver).
          Itens de campanha: CRUD liberado para todos os perfis desta tela, e
          TODA operação grava linha assinada no histórico do pedido (a action
          reconfere a permissão no servidor). O valor destes itens é a pontuação
          do Ranking > Performance na Campanha — a auditoria é o que torna a
          liberação aceitável. */}
      <ComandaList
        orders={items}
        canDelete={session.role === "GESTAO" || session.role === "FINANCEIRO"}
        canReturn
        campaigns={campaigns}
      />

      <Pagination page={page} perPage={PER_PAGE} total={total} label="pedidos" />
    </div>
  );
}
