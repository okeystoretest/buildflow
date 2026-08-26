import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { BackButton } from "@/components/shared/back-button";
import {
  isPecasBlogueira,
  foiEntregue,
  dentroDaJanelaFinalizado,
  TIPO_PECAS_BLOGUEIRA,
} from "@/lib/piece-control";
import { isAnexoDispensavel } from "@/lib/validations/order";
import { formatBRL } from "@/lib/utils";
import { ControlePecasBoard, type PecaCard } from "./board-client";
import type { HistoricoPeca } from "./historico-client";

/**
 * LOGÍSTICA > Controle de Peças
 * ---------------------------------------------------------------------------
 * Quadro exclusivo dos pedidos do tipo "10 - Peças p/ Blogueira".
 * Colunas: Aguardando Entrega (virtual) · Em Uso · Reprocessamento ·
 *          Devolvido · Finalizado.
 *
 * Cards e colunas são os MESMOS do Fluxo de Pedidos (componente OrderCard e a
 * marcação de coluna do KanbanBoard). A diferença é a navegação: aqui há duas
 * setas — avançar e voltar — porque o ciclo da peça é bidirecional.
 *
 * A coluna "Aguardando Entrega" não é um estado do enum: agrupa as peças cujo
 * pedido ainda não registrou entrega. Ela existe porque a regra do módulo é que
 * a peça só entra em "Em Uso" DEPOIS do registro de "Entregue" — sem esse
 * agrupamento, esses pedidos simplesmente sumiriam da tela.
 *
 * "Finalizado" é o estado terminal: encerra o fluxo do pedido, fica congelado
 * para o usuário padrão (só Gestão movimenta) e é arquivado do quadro após 30
 * dias, permanecendo consultável no Histórico.
 */
export const dynamic = "force-dynamic";

/**
 * Teto de registros carregados no Histórico. A trilha de peças cresce para
 * sempre; sem limite, a tela passaria a carregar anos de movimentação a cada
 * abertura. 200 finalizações cobre com folga a operação corrente.
 */
const HISTORICO_MAX = 200;

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
      // Última movimentação para FINALIZADO: base da retenção de 30 dias.
      pieceMovements: {
        where: { toStatus: "FINALIZADO" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const todosCards: PecaCard[] = orders.map((o) => ({
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
    finalizadoEm:
      o.pieceStatus === "FINALIZADO" && o.pieceMovements[0]
        ? o.pieceMovements[0].createdAt.toISOString()
        : null,
  }));

  // Arquivamento dos finalizados ha mais de 30 dias JA NO SERVIDOR: evita
  // trafegar para o navegador cards que ele so descartaria. O quadro reavalia
  // a janela de novo no cliente, para a virada acontecer com a aba aberta.
  const cards = todosCards.filter(
    (c) => c.pieceStatus !== "FINALIZADO" || dentroDaJanelaFinalizado(c.finalizadoEm),
  );

  // ------------------------------------------------------------------
  // HISTÓRICO: pedidos que ATINGIRAM "Finalizado".
  // O critério é a existência do movimento, não o estado atual — assim um
  // pedido reaberto pela Gestão continua auditável, e os arquivados (mais de
  // 30 dias) seguem acessíveis.
  // ------------------------------------------------------------------
  const finalizacoes = await prisma.pieceMovement.findMany({
    where: { toStatus: "FINALIZADO", order: { orderTypeId: { in: tipoIds } } },
    orderBy: { createdAt: "desc" },
    take: HISTORICO_MAX,
    select: {
      orderId: true,
      createdAt: true,
      changedBy: true,
      order: {
        select: {
          orderNumber: true,
          comandaNumber: true,
          pieceCount: true,
          customer: { select: { name: true } },
          seller: { select: { name: true } },
        },
      },
    },
  });

  // Uma linha por pedido: a finalização MAIS RECENTE (a lista já vem desc).
  const finaisPorPedido = new Map<string, (typeof finalizacoes)[number]>();
  for (const f of finalizacoes) {
    if (!finaisPorPedido.has(f.orderId)) finaisPorPedido.set(f.orderId, f);
  }
  const idsHistorico = Array.from(finaisPorPedido.keys());

  // Trilha completa dos pedidos do histórico, numa consulta só.
  const movimentos = idsHistorico.length
    ? await prisma.pieceMovement.findMany({
        where: { orderId: { in: idsHistorico } },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          orderId: true,
          fromStatus: true,
          toStatus: true,
          note: true,
          changedBy: true,
          createdAt: true,
        },
      })
    : [];

  // Traduz changedBy (id) para NOME numa única consulta.
  const autorIds = Array.from(
    new Set(movimentos.map((m) => m.changedBy).filter((v): v is string => !!v)),
  );
  const autores = autorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: autorIds } },
        select: { id: true, name: true },
      })
    : [];
  const nomePorId = new Map(autores.map((u) => [u.id, u.name]));

  const historico: HistoricoPeca[] = idsHistorico.map((orderId) => {
    const f = finaisPorPedido.get(orderId)!;
    const finalizadoEm = f.createdAt.toISOString();
    return {
      orderId,
      orderNumber: f.order.orderNumber,
      comandaNumber: f.order.comandaNumber,
      customerName: f.order.customer.name,
      sellerName: f.order.seller.name,
      pieceCount: f.order.pieceCount,
      finalizadoEm,
      finalizadoPor: f.changedBy ? nomePorId.get(f.changedBy) ?? null : null,
      arquivado: !dentroDaJanelaFinalizado(finalizadoEm),
      movimentos: movimentos
        .filter((m) => m.orderId === orderId)
        .map((m) => ({
          id: m.id,
          fromStatus: m.fromStatus,
          toStatus: m.toStatus,
          note: m.note,
          autor: m.changedBy ? nomePorId.get(m.changedBy) ?? null : null,
          createdAt: m.createdAt.toISOString(),
        })),
    };
  });

  const isGestao = session.role === "GESTAO";

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
        canMove={session.role === "LOGISTICA" || isGestao}
        isGestao={isGestao}
        historico={historico}
      />
    </div>
  );
}
