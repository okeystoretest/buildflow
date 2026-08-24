import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { BackButton } from "@/components/shared/back-button";
import { isPecasBlogueira, foiEntregue, TIPO_PECAS_BLOGUEIRA } from "@/lib/piece-control";
import { isAnexoDispensavel } from "@/lib/validations/order";
import { formatBRL } from "@/lib/utils";
import { ControlePecasBoard, type PecaCard } from "./board-client";

/**
 * LOGÍSTICA > Controle de Peças
 * ---------------------------------------------------------------------------
 * Quadro exclusivo dos pedidos do tipo "10 - Peças p/ Blogueira".
 * Colunas: Aguardando Entrega (virtual) · Em Uso · Devolvido · Em Manutenção.
 *
 * Cards e colunas são os MESMOS do Fluxo de Pedidos (componente OrderCard e a
 * marcação de coluna do KanbanBoard). A diferença é a navegação: aqui há duas
 * setas — avançar e voltar — porque o ciclo da peça é bidirecional.
 *
 * A coluna "Aguardando Entrega" não é um estado do enum: agrupa as peças cujo
 * pedido ainda não registrou entrega. Ela existe porque a regra do módulo é que
 * a peça só entra em "Em Uso" DEPOIS do registro de "Entregue" — sem esse
 * agrupamento, esses pedidos simplesmente sumiriam da tela.
 */
export const dynamic = "force-dynamic";

export default async function ControlePecasPage() {
  const session = await requireRole(["LOGISTICA", "GESTAO"]);

  // O nome do tipo é cadastro livre da Gestão. Resolvemos os IDs comparando de
  // forma tolerante (acentos/caixa/espaços) em vez de casar string exata no SQL.
  const tipos = await prisma.orderType.findMany({ select: { id: true, name: true } });
  const tipoIds = tipos.filter((t) => isPecasBlogueira(t.name)).map((t) => t.id);

  if (tipoIds.length === 0) {
    return (
      <div className="space-y-6">
        <BackButton href="/logistica" />
        <h1 className="text-2xl font-bold text-distribuicao">Controle de Peças</h1>
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhum Tipo de Pedido chamado <span className="font-semibold">&quot;{TIPO_PECAS_BLOGUEIRA}&quot;</span> está
            cadastrado. Cadastre-o em Gestão &gt; Tipos de Pedido para que o quadro seja alimentado.
          </CardContent>
        </Card>
      </div>
    );
  }

  const orders = await prisma.order.findMany({
    where: { orderTypeId: { in: tipoIds } },
    include: {
      customer: true,
      seller: true,
      orderType: { select: { name: true } },
      delivery: { select: { driverId: true, status: true, deliveredAt: true } },
      history: { select: { status: true } },
      // Última movimentação para DEVOLVIDO: base do TTL de 30 min no quadro.
      pieceMovements: {
        where: { toStatus: "DEVOLVIDO" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const cards: PecaCard[] = orders.map((o) => ({
    // ---- Campos idênticos aos do Fluxo de Pedidos (OrderCardData) ----
    id: o.id,
    status: o.status,
    orderNumber: o.orderNumber,
    comandaNumber: o.comandaNumber,
    sellerName: o.seller.name,
    customerName: o.customer.name,
    customerCode: o.customer.code,
    total: formatBRL(o.total.toString()),
    approvedByFinance: o.comandaNumber != null,
    hasDriver: o.delivery?.driverId != null,
    hasInvoice: o.invoicePath != null,
    hasPaymentProof: o.paymentProofPath != null,
    isExchange: isAnexoDispensavel(o.orderType?.name),
    // ---- Campos próprios do Controle de Peças ----
    pieceStatus: o.pieceStatus,
    entregue: foiEntregue({
      status: o.status,
      deliveryStatus: o.delivery?.status ?? null,
      deliveredAt: o.delivery?.deliveredAt ?? null,
      historyStatuses: o.history.map((h) => h.status),
    }),
    devolvidoEm:
      o.pieceStatus === "DEVOLVIDO" && o.pieceMovements[0]
        ? o.pieceMovements[0].createdAt.toISOString()
        : null,
  }));

  return (
    <div className="space-y-4">
      <BackButton href="/logistica" />
      <div>
        <h1 className="text-2xl font-bold text-distribuicao">Controle de Peças</h1>
        <p className="text-sm text-muted-foreground">
          Pedidos do tipo <span className="font-semibold">&quot;{TIPO_PECAS_BLOGUEIRA}&quot;</span>. A peça só entra em
          &quot;Em Uso&quot; após o registro de entrega do pedido.
        </p>
      </div>

      <ControlePecasBoard
        cards={cards}
        canMove={session.role === "LOGISTICA" || session.role === "GESTAO"}
      />
    </div>
  );
}
