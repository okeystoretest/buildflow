"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateOrder } from "@/lib/actions/orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Opt { id: string; name: string; }
interface OrderData {
  id: string;
  customerId: string; storeId: string; orderTypeId: string; operationId: string;
  paymentMethodId: string; shippingMethodId: string; bankId: string;
  orderValue: number; freight: number; notes: string;
}

export function EditarPedidoForm({
  order, customers, stores, orderTypes, operations, paymentMethods, shippingMethods, banks,
}: {
  order: OrderData;
  customers: Opt[]; stores: Opt[]; orderTypes: Opt[]; operations: Opt[];
  paymentMethods: Opt[]; shippingMethods: Opt[]; banks: Opt[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState(order);
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    start(async () => {
      const res = await updateOrder({
        id: f.id,
        customerId: f.customerId, storeId: f.storeId, orderTypeId: f.orderTypeId,
        operationId: f.operationId, paymentMethodId: f.paymentMethodId,
        shippingMethodId: f.shippingMethodId, bankId: f.bankId || undefined,
        orderValue: f.orderValue, freight: f.freight, notes: f.notes,
      });
      if (res.ok) { router.push("/fluxo"); router.refresh(); }
      else setError(res.error);
    });
  }

  const total = (f.orderValue || 0) + (f.freight || 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select label="Cliente" value={f.customerId} onChange={(v) => setF({ ...f, customerId: v })} options={customers} />
        <Select label="Loja" value={f.storeId} onChange={(v) => setF({ ...f, storeId: v })} options={stores} />
        <Select label="Tipo de Pedido" value={f.orderTypeId} onChange={(v) => setF({ ...f, orderTypeId: v })} options={orderTypes} />
        <Select label="Operação" value={f.operationId} onChange={(v) => setF({ ...f, operationId: v })} options={operations} />
        <Select label="Forma de Pagamento" value={f.paymentMethodId} onChange={(v) => setF({ ...f, paymentMethodId: v })} options={paymentMethods} />
        <Select label="Forma de Envio" value={f.shippingMethodId} onChange={(v) => setF({ ...f, shippingMethodId: v })} options={shippingMethods} />
        <Select label="Banco" value={f.bankId} onChange={(v) => setF({ ...f, bankId: v })} options={banks} placeholder="Selecione..." />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Valor do pedido (R$)</Label>
          <Input type="number" min={0} step="0.01" value={f.orderValue || ""} onChange={(e) => setF({ ...f, orderValue: Number(e.target.value) })} />
        </div>
        <div className="space-y-1.5">
          <Label>Frete (R$)</Label>
          <Input type="number" min={0} step="0.01" value={f.freight || ""} onChange={(e) => setF({ ...f, freight: Number(e.target.value) })} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Observações</Label>
        <Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Escreva suas observações aqui..." />
      </div>

      <p className="text-sm text-muted-foreground">Total: <span className="font-data font-semibold text-foreground">R$ {total.toFixed(2)}</span></p>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()} disabled={pending}>Cancelar</Button>
        <Button variant="vendas" onClick={save} disabled={pending || !(f.orderValue > 0)}>{pending ? "Salvando..." : "Salvar alterações"}</Button>
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; options: Opt[]; placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <select className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm"
        value={value} onChange={(e) => onChange(e.target.value)}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </div>
  );
}
