import { formatBRL } from "@/lib/utils";
import type { EntregaItem, EntregaProof } from "@/components/shared/entregas-list";

// Include necessário para montar a ficha completa. Reutilizado nas duas telas
// de Entregas (Logística e Financeiro) para garantir consistência.
export const entregaInclude = {
  customer: true,
  seller: true,
  store: { select: { name: true } },
  originStore: { select: { name: true } },
  orderType: { select: { name: true } },
  operation: { select: { code: true, name: true } },
  shippingMethod: { select: { name: true } },
  cnpj: { select: { name: true } },
  paymentMethod: { select: { name: true } },
  bank: { select: { name: true } },
  paymentStatus: { select: { name: true } },
  paymentProofs: { orderBy: { createdAt: "asc" }, select: { id: true, filePath: true } },
  financeProofs: { orderBy: { createdAt: "asc" }, select: { id: true, filePath: true } },
  delivery: {
    include: {
      driver: { select: { name: true, pixKey: true } },
      proofs: { orderBy: { createdAt: "asc" }, select: { id: true, filePath: true } },
    },
  },
  driverPayment: { select: { id: true, amount: true, pixKey: true, createdAt: true } },
} as const;

// Monta o endereço completo (Excursão), ou null se não houver.
function buildAddress(o: any): string | null {
  const parts = [
    o.shipStreet,
    o.shipNumber ? `nº ${o.shipNumber}` : null,
    o.shipDistrict,
    o.shipCity && o.shipState ? `${o.shipCity}/${o.shipState}` : o.shipCity || o.shipState,
    o.shipCep ? `CEP ${o.shipCep}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

// Converte um pedido (com entrega e relações) numa ficha de entrega.
// Blindado contra registros legados com relações/valores ausentes.
export function toEntregaItem(o: any): EntregaItem {
  const proofs: EntregaProof[] = [];
  if (o.invoicePath) proofs.push({ id: `nf-${o.id}`, filePath: o.invoicePath, label: "Nota Fiscal" });
  if (o.paymentProofPath) proofs.push({ id: `pg-${o.id}`, filePath: o.paymentProofPath, label: "Comprovante" });
  for (const p of o.paymentProofs ?? []) proofs.push({ id: p.id, filePath: p.filePath, label: "Comprov. Pagamento" });
  for (const p of o.financeProofs ?? []) proofs.push({ id: p.id, filePath: p.filePath, label: "Anexo Financeiro" });
  for (const p of o.delivery?.proofs ?? []) proofs.push({ id: p.id, filePath: p.filePath, label: "Comprov. Entrega" });

  return {
    id: o.id,
    orderNumber: o.orderNumber ?? "—",
    comandaNumber: o.comandaNumber ?? null,
    status: o.status,
    customerName: o.customer?.name ?? "Cliente não informado",
    customerCode: o.customer?.code ?? null,
    sellerName: o.seller?.name ?? "—",
    storeName: o.store?.name ?? null,
    originStoreName: o.originStore?.name ?? null,
    orderTypeName: o.orderType?.name ?? null,
    operationName: o.operation ? `${o.operation.code} - ${o.operation.name}` : null,
    shippingMethodName: o.shippingMethod?.name ?? null,
    cnpjName: o.cnpj?.name ?? null,
    paymentMethodName: o.paymentMethod?.name ?? null,
    bankName: o.bank?.name ?? null,
    paymentStatusName: o.paymentStatus?.name ?? null,
    total: formatBRL((o.total ?? 0).toString()),
    orderValue: formatBRL((o.orderValue ?? 0).toString()),
    freight: formatBRL((o.freight ?? 0).toString()),
    trackingCode: o.trackingCode ?? null,
    paymentNotes: o.paymentNotes ?? null,
    shippingNotes: o.notes ?? null,
    address: buildAddress(o),
    driverName: o.delivery?.driver?.name ?? null,
    driverId: o.delivery?.driverId ?? null,
    driverPixKey: o.delivery?.driver?.pixKey ?? null,
    assignedAt: o.delivery?.assignedAt?.toISOString() ?? null,
    startedAt: o.delivery?.startedAt?.toISOString() ?? null,
    deliveredAt: o.delivery?.deliveredAt?.toISOString() ?? null,
    failReason: o.delivery?.failReason ?? null,
    // Pagamento da entrega ao motorista (se já registrado).
    paid: !!o.driverPayment,
    paymentAmount: o.driverPayment ? formatBRL((o.driverPayment.amount ?? 0).toString()) : null,
    paymentPixKey: o.driverPayment?.pixKey ?? null,
    paidAt: o.driverPayment?.createdAt?.toISOString() ?? null,
    proofs,
  };
}
