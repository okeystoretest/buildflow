import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MapPin, Package, PackageCheck, Clock, History } from "lucide-react";
import type { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasTrackingAccess } from "@/lib/tracking-auth";
import {
  CUSTOMER_STEPS,
  customerStatusView,
  formatDateBR,
  formatDateTimeBR,
} from "@/lib/customer-tracking";
import { cn } from "@/lib/utils";
import { TrackingGate } from "./gate-form";
import { SairButton } from "./sair-button";

/**
 * ACOMPANHAMENTO DO PEDIDO — página pública (fora do shell do dashboard).
 *
 * Escopo fechado de propósito: pedido atual + histórico do mesmo cliente. Não
 * há navegação para nenhuma outra área, nem dados internos (valores, comanda,
 * vendedora, comprovantes, observações do Financeiro). O que o cliente vê é o
 * mínimo para saber onde está a compra dele.
 */

export const metadata: Metadata = {
  title: "Acompanhar pedido · Build.Flow",
  // O link é público por natureza (vai por WhatsApp). Fora do índice de busca:
  // não queremos pedidos de clientes aparecendo no Google.
  robots: { index: false, follow: false },
};

// Campos carregados dos pedidos (atual e histórico) — só o essencial.
const ORDER_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  createdAt: true,
  pieceCount: true,
  items: { select: { quantity: true, product: { select: { name: true } } } },
  campaignItems: { select: { reference: true, quantity: true } },
} as const;

interface ResumoFonte {
  pieceCount: number;
  items: { quantity: number; product: { name: string } }[];
  campaignItems: { reference: string; quantity: number }[];
}

/**
 * "Resumo dos itens solicitados". O pedido do Build.Flow nem sempre tem
 * OrderItem — muitas vendas registram só o valor e a quantidade de peças, e as
 * peças de campanha vivem em CampaignItem. A ordem de preferência espelha isso.
 */
function resumoItens(o: ResumoFonte): { label: string; quantity: number }[] {
  const itens = [
    ...o.items.map((i) => ({ label: i.product.name, quantity: i.quantity })),
    ...o.campaignItems.map((c) => ({ label: c.reference, quantity: c.quantity })),
  ];
  if (itens.length > 0) return itens;
  return o.pieceCount > 0 ? [{ label: "Peças do pedido", quantity: o.pieceCount }] : [];
}

export default async function AcompanharPedidoPage({
  params,
}: {
  params: { token: string };
}) {
  const order = await prisma.order.findUnique({
    where: { trackingToken: params.token },
    select: {
      ...ORDER_SELECT,
      customerId: true,
      customer: { select: { name: true } },
      shippingMethod: { select: { name: true } },
      shipCep: true,
      shipStreet: true,
      shipNumber: true,
      shipDistrict: true,
      shipCity: true,
      shipState: true,
    },
  });
  if (!order) notFound();

  // Sem o Código de Cliente validado, a página não passa daqui.
  if (!(await hasTrackingAccess(params.token))) {
    return <TrackingGate token={params.token} />;
  }

  // Histórico: demais compras do MESMO cliente, da mais recente para a mais
  // antiga. Teto de 20 para a tela não virar um relatório.
  const historico = await prisma.order.findMany({
    where: { customerId: order.customerId, id: { not: order.id } },
    select: ORDER_SELECT,
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const view = customerStatusView(order.status);
  const itens = resumoItens(order);

  const enderecoLinha1 = [order.shipStreet, order.shipNumber].filter(Boolean).join(", ");
  const enderecoLinha2 = [order.shipDistrict, order.shipCity, order.shipState]
    .filter(Boolean)
    .join(" · ");
  const temEndereco = Boolean(enderecoLinha1 || enderecoLinha2 || order.shipCep);

  return (
    <main className="min-h-screen bg-background p-4 py-8">
      <div className="mx-auto w-full max-w-2xl space-y-6 animate-fade-in-up">
        {/* Cabeçalho */}
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
              <PackageCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-lg font-bold leading-tight tracking-tight">
                Build<span className="text-primary">.Flow</span>
              </p>
              <p className="text-xs text-muted-foreground">Olá, {order.customer.name}</p>
            </div>
          </div>
          <SairButton />
        </header>

        {/* Pedido atual */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Pedido</p>
              <p className="font-data text-2xl font-bold">{order.orderNumber}</p>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="h-4 w-4 shrink-0" />
              {formatDateTimeBR(order.createdAt)}
            </div>
          </div>

          <div className="mt-5">
            {view.exception ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
                {view.label}
              </div>
            ) : (
              <Timeline current={view.step ?? 0} />
            )}
          </div>
        </section>

        {/* Itens */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Package className="h-4 w-4 text-primary" /> Itens do pedido
          </h2>
          {itens.length > 0 ? (
            <ul className="divide-y divide-border text-sm">
              {itens.map((it, i) => (
                <li key={i} className="flex items-center justify-between gap-4 py-2">
                  <span>{it.label}</span>
                  <span className="font-data shrink-0 text-muted-foreground">
                    {it.quantity} un.
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Os itens deste pedido ainda não foram detalhados.
            </p>
          )}
        </section>

        {/* Entrega */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <MapPin className="h-4 w-4 text-primary" /> Endereço de entrega
          </h2>
          {temEndereco ? (
            <address className="text-sm not-italic leading-relaxed">
              {enderecoLinha1 && <div>{enderecoLinha1}</div>}
              {enderecoLinha2 && <div className="text-muted-foreground">{enderecoLinha2}</div>}
              {order.shipCep && <div className="text-muted-foreground">CEP {order.shipCep}</div>}
            </address>
          ) : (
            <p className="text-sm text-muted-foreground">
              Sem endereço de entrega cadastrado
              {order.shippingMethod ? ` (envio: ${order.shippingMethod.name})` : ""}.
            </p>
          )}
        </section>

        {/* Histórico de compras */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <History className="h-4 w-4 text-primary" /> Compras anteriores
          </h2>
          {historico.length > 0 ? (
            <ul className="space-y-3">
              {historico.map((h) => (
                <HistoricoItem key={h.id} order={h} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Este é o seu primeiro pedido conosco.
            </p>
          )}
        </section>

        <p className="pb-4 text-center text-xs text-muted-foreground">
          Dúvidas sobre o pedido? Fale com a sua vendedora.
        </p>
      </div>
    </main>
  );
}

/** Linha do tempo das 5 etapas visíveis ao cliente (vertical, mobile-first). */
function Timeline({ current }: { current: number }) {
  return (
    <ol className="space-y-0">
      {CUSTOMER_STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "mt-1 h-3 w-3 shrink-0 rounded-full border-2 transition-colors",
                  active && "border-primary bg-primary ring-4 ring-primary/20",
                  done && "border-primary bg-primary",
                  !done && !active && "border-border bg-transparent",
                )}
              />
              {i < CUSTOMER_STEPS.length - 1 && (
                <span
                  className={cn(
                    "w-0.5 flex-1 transition-colors",
                    done ? "bg-primary" : "bg-border",
                  )}
                />
              )}
            </div>
            <div className={cn("pb-5", i === CUSTOMER_STEPS.length - 1 && "pb-0")}>
              <p
                className={cn(
                  "text-sm leading-none",
                  active ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {label}
              </p>
              {active && (
                <p className="mt-1 text-xs text-primary">Etapa atual do seu pedido</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Uma compra anterior: número, data, status e resumo rápido dos itens. */
function HistoricoItem({
  order,
}: {
  order: ResumoFonte & { orderNumber: string; status: OrderStatus; createdAt: Date };
}) {
  const view = customerStatusView(order.status);
  const itens = resumoItens(order);
  // Resumo RÁPIDO: nomes na mesma linha, com reticências a partir do 4º item.
  const resumo = itens.slice(0, 3).map((i) => `${i.quantity}x ${i.label}`).join(" · ");
  const extras = itens.length - 3;

  return (
    <li className="rounded-xl border border-border bg-background/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-data text-sm font-semibold">{order.orderNumber}</span>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-medium",
            view.exception
              ? "bg-destructive/15 text-destructive"
              : "bg-primary/15 text-primary",
          )}
        >
          {view.label}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{formatDateBR(order.createdAt)}</p>
      {resumo && (
        <p className="mt-2 text-sm">
          {resumo}
          {extras > 0 && <span className="text-muted-foreground"> · +{extras}</span>}
        </p>
      )}
    </li>
  );
}
