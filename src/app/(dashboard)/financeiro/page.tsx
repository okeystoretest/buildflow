import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL } from "@/lib/utils";
import { AuditarPedido } from "./audit-client";
import { FinanceiroFerramentas } from "./ferramentas-client";

export default async function FinanceiroPage() {
  await requireRole(["FINANCEIRO", "GESTAO"]);

  const [emAnalise, payStatuses, paymentMethods, banks, cnpjs] = await Promise.all([
    prisma.order.findMany({
      where: { status: "EM_ANALISE" },
      include: { customer: true, seller: true, cnpj: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.paymentStatusOption.findMany({ orderBy: { name: "asc" } }),
    prisma.paymentMethod.findMany({ orderBy: { name: "asc" } }),
    prisma.bank.findMany({ orderBy: { name: "asc" } }),
    prisma.cnpj.findMany({ orderBy: { name: "asc" } }),
  ]);

  const statusAtivos = payStatuses
    .filter((p) => p.active)
    .map((p) => ({ id: p.id, name: p.name, disposition: p.disposition }));

  const cnpjsAtivos = cnpjs
    .filter((c) => c.active)
    .map((c) => ({ id: c.id, name: c.name, document: c.document }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Financeiro</h1>
        <p className="text-sm text-muted-foreground">Auditoria, faturamento e liberação de pedidos.</p>
      </div>

      {/* Ferramentas do Financeiro: botões logo acima da Análise de Pedidos.
          Cada formulário fica oculto e só aparece ao clicar no seu botão. */}
      <FinanceiroFerramentas
        paymentMethods={paymentMethods.map((p) => ({ id: p.id, name: p.name, active: p.active }))}
        banks={banks.map((b) => ({ id: b.id, name: b.name, active: b.active }))}
        payStatuses={payStatuses.map((p) => ({ id: p.id, name: p.name, active: p.active, disposition: p.disposition }))}
        cnpjs={cnpjs.map((c) => ({ id: c.id, name: c.name, document: c.document, active: c.active }))}
      />

      <Card>
        <CardHeader><CardTitle>Análise de Pedidos</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {emAnalise.map((o) => (
            <div key={o.id} className="card-hover animate-fade-in-up rounded-xl border border-border bg-card p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-data text-sm font-semibold">Pedido {o.orderNumber}</p>
                  <p className="text-sm text-muted-foreground">{o.customer.name} · Vend.: {o.seller.name}</p>
                </div>
                <span className="font-data font-semibold">{formatBRL(o.total.toString())}</span>
              </div>
              <AuditarPedido
                orderId={o.id}
                statusOptions={statusAtivos}
                cnpjOptions={cnpjsAtivos}
                currentCnpjId={o.cnpjId}
              />
            </div>
          ))}
          {emAnalise.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum pedido aguardando auditoria.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
