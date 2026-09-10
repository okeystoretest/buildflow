import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import Link from "next/link";
import { History } from "lucide-react";
import { EntregaCard, type DriverOrderView } from "./delivery-card";
import { MOTORISTA_COLUMNS, STATUS_LABEL, STATUS_STYLE } from "@/lib/order-flow";
import { CardScroller } from "@/components/shared/card-scroller";
import { isEntregaDeMotorista } from "@/lib/driver-delivery";

// Quantos cards ficam visíveis por coluna antes de rolar. Mesmo número do
// Kanban do Financeiro — é de lá que vem a proporção deste quadro.
const VISIVEIS_POR_COLUNA = 3;

/**
 * KANBAN DO MOTORISTA — Pronto → Em Rota → Entregue.
 *
 * A coluna "Aguardando Entregador" deixou de existir. Ela era uma coluna
 * VIRTUAL (não era status do enum) só para separar os pedidos sem dono, e
 * obrigava o motorista a um passo extra: primeiro "Atribuir", depois "Iniciar".
 * Agora os pedidos sem dono aparecem na própria coluna "Pronto", misturados aos
 * do motorista, e "Iniciar" faz as duas coisas de uma vez (ver startRoute).
 *
 * Com três colunas o quadro fica na mesma proporção do Kanban do Financeiro —
 * colunas mais largas e mais altas, que era o objetivo do redesenho.
 */
export default async function MotoristaPage() {
  const session = await requireRole(["MOTORISTA", "GESTAO"]);

  // Janela de visibilidade para pedidos ENTREGUE: some do Kanban do motorista
  // 15 min apos a entrega, mantendo a interface focada em entregas recentes.
  // (O historico completo continua em /motorista/historico.)
  const DELIVERED_WINDOW_MIN = 15;
  const entregueDesde = new Date(Date.now() - DELIVERED_WINDOW_MIN * 60 * 1000);

  // Escopo do que cada um enxerga:
  //  - GESTÃO vê todas as entregas;
  //  - MOTORISTA vê as SUAS + as que ainda não têm dono (disponíveis para
  //    qualquer um pegar). Entrega de OUTRO motorista continua invisível.
  //
  // Regra de exclusão que permanece: pedido com "Código de Rastreio" preenchido
  // segue por transportadora — não é entrega de motorista — e fica fora daqui.
  const escopoEntrega =
    session.role === "GESTAO"
      ? { isNot: null }
      : { OR: [{ driverId: session.userId }, { driverId: null }] };

  const orders = await prisma.order.findMany({
    where: {
      delivery: escopoEntrega,
      // Dois critérios independentes, cada um com o seu OR. Empilhados em AND
      // porque duas chaves `OR` no mesmo nível se sobrescreveriam.
      AND: [
        {
          OR: [
            { status: { in: MOTORISTA_COLUMNS.filter((s) => s !== "ENTREGUE") } },
            { status: "ENTREGUE", delivery: { deliveredAt: { gte: entregueDesde } } },
          ],
        },
        // Sem rastreio: cobre tanto NULL quanto string vazia por segurança.
        { OR: [{ trackingCode: null }, { trackingCode: "" }] },
      ],
    },
    include: {
      customer: true,
      // Nome da Forma de Envio: decide se o pedido é entrega de motorista.
      shippingMethod: { select: { name: true } },
      delivery: { select: { driverId: true } },
      // Dados da excursão para o motorista ler no card (nome, endereço e
      // observações da excursão). Só existe quando a forma de envio é excursão.
      excursao: { select: { name: true, address: true, notes: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  // COLUNA "PRONTO" SÓ COM ENTREGA DE MOTORISTA.
  //
  // Só "1 - Excursão" e "3 - Entrega Local" são entregues pela equipe; as
  // demais formas saem por outro canal e não são corrida de ninguém aqui. É a
  // mesma exclusão que o Código de Rastreio já fazia, agora pelo lado positivo.
  //
  // O corte vale APENAS para "Pronto". Pedido que já está EM_ROTA continua
  // visível mesmo com outra forma de envio: o motorista está com a mercadoria
  // na mão, e sumir com o card no meio do caminho o deixaria sem como concluir.
  //
  // Filtrado aqui e não no `where` porque a comparação ignora acento, e o
  // Postgres não faz isso sem a extensão unaccent. A consulta do quadro já é
  // pequena — limitada por status e pelo escopo de quem olha.
  const doMotorista = orders.filter(
    (o) => o.status !== "ENVIADO" || isEntregaDeMotorista(o.shippingMethod?.name),
  );

  const views: DriverOrderView[] = doMotorista.map((o) => ({
    id: o.id,
    status: o.status,
    orderNumber: o.orderNumber,
    comandaNumber: o.comandaNumber,
    customer: o.customer.name,
    customerCode: o.customer.code,
    notes: o.notes,
    excursao: o.excursao
      ? { name: o.excursao.name, address: o.excursao.address, notes: o.excursao.notes }
      : null,
    // Sem dono: qualquer motorista pode assumir clicando em "Iniciar".
    isOpen: o.delivery?.driverId == null,
  }));

  const byStatus = (s: (typeof MOTORISTA_COLUMNS)[number]) =>
    views.filter((v) => v.status === s);

  return (
    <div className="mx-auto max-w-md space-y-6 pb-8 sm:max-w-6xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-motorista">Minhas entregas</h1>
          <p className="text-sm text-muted-foreground">
            Pronto → Em Rota → Entregue. Pedido sem dono é seu ao tocar em “Iniciar”.
          </p>
        </div>
        <Link
          href="/motorista/historico"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <History className="h-4 w-4" /> Histórico
        </Link>
      </div>

      {/* Três colunas no desktop (mesma proporção do Kanban do Financeiro).
          Em telas pequenas empilham. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MOTORISTA_COLUMNS.map((col) => {
          const list = byStatus(col);
          const s = STATUS_STYLE[col];
          return (
            <div key={col} className="flex flex-col">
              <div className={`mb-2 flex items-center justify-between rounded-lg border px-3 py-2 ${s.header}`}>
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                  {STATUS_LABEL[col]}
                </span>
                <span className="font-data rounded-full bg-background/60 px-2 text-xs">{list.length}</span>
              </div>
              {/* Altura medida pelo N-ésimo card, como no Financeiro: os cards
                  variam de altura (excursão, observação) e uma altura fixa ora
                  sobraria, ora cortaria o último card ao meio. */}
              <CardScroller visibleItems={VISIVEIS_POR_COLUNA}>
                {list.map((o, i) => (
                  <EntregaCard key={o.id} order={o} index={i} />
                ))}
                {list.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border/60 py-6 text-center text-sm text-muted-foreground/60">
                    Nenhuma entrega.
                  </div>
                )}
              </CardScroller>
            </div>
          );
        })}
      </div>
    </div>
  );
}
