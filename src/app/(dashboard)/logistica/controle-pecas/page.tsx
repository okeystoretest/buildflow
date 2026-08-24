import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { BackButton } from "@/components/shared/back-button";
import { isPecasBlogueira, foiEntregue, TIPO_PECAS_BLOGUEIRA } from "@/lib/piece-control";
import { ControlePecasBoard, type PecaCard } from "./board-client";

/**
 * LOGÍSTICA > Controle de Peças
 * ---------------------------------------------------------------------------
 * Quadro exclusivo dos pedidos do tipo "10 - Peças p/ Blogueira".
 * Colunas: Aguardando Entrega (virtual) · Em Uso · Devolvido · Em Manutenção.
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
    select: {
      id: true,
      orderNumber: true,
      comandaNumber: true,
      status: true,
      pieceCount: true,
      pieceStatus: true,
      createdAt: true,
      customer: { select: { name: true, code: true } },
      seller: { select: { name: true } },
      delivery: { select: { status: true, deliveredAt: true } },
      history: { select: { status: true, createdAt: true } },
      pieceMovements: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          fromStatus: true,
          toStatus: true,
          note: true,
          changedBy: true,
          createdAt: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Traduz os IDs de quem movimentou para NOMES numa única consulta.
  const autorIds = Array.from(
    new Set(
      orders
        .flatMap((o) => o.pieceMovements.map((m) => m.changedBy))
        .filter((v): v is string => !!v),
    ),
  );
  const autores = autorIds.length
    ? await prisma.user.findMany({ where: { id: { in: autorIds } }, select: { id: true, name: true } })
    : [];
  const nomePorId = new Map(autores.map((u) => [u.id, u.name]));

  const cards: PecaCard[] = orders.map((o) => {
    // Data da entrega registrada (histórico ENTREGUE ou, no fluxo do motorista,
    // o deliveredAt da entrega).
    const histEntrega = o.history
      .filter((h) => h.status === "ENTREGUE")
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    const entregueEm = o.delivery?.deliveredAt ?? histEntrega?.createdAt ?? null;

    return {
      id: o.id,
      orderNumber: o.orderNumber,
      comandaNumber: o.comandaNumber,
      orderStatus: o.status,
      pieceCount: o.pieceCount,
      pieceStatus: o.pieceStatus,
      customerName: o.customer.name,
      customerCode: o.customer.code,
      sellerName: o.seller.name,
      entregue: foiEntregue({
        status: o.status,
        deliveryStatus: o.delivery?.status ?? null,
        deliveredAt: o.delivery?.deliveredAt ?? null,
        historyStatuses: o.history.map((h) => h.status),
      }),
      entregueEm: entregueEm ? entregueEm.toISOString() : null,
      createdAt: o.createdAt.toISOString(),
      movimentos: o.pieceMovements.map((m) => ({
        id: m.id,
        from: m.fromStatus,
        to: m.toStatus,
        note: m.note,
        autor: m.changedBy ? nomePorId.get(m.changedBy) ?? null : null,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  });

  return (
    <div className="space-y-6">
      <BackButton href="/logistica" />
      <div>
        <h1 className="text-2xl font-bold text-distribuicao">Controle de Peças</h1>
        <p className="text-sm text-muted-foreground">
          Pedidos do tipo <span className="font-semibold">&quot;{TIPO_PECAS_BLOGUEIRA}&quot;</span>. A peça só entra em
          &quot;Em Uso&quot; após o registro de entrega do pedido.
        </p>
      </div>

      <ControlePecasBoard cards={cards} canMove={session.role === "LOGISTICA" || session.role === "GESTAO"} />
    </div>
  );
}
