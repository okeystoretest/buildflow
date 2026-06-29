"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createOrder } from "@/lib/actions/orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBRL } from "@/lib/utils";
import { shrinkImageToBase64 } from "@/lib/client-image";

interface Opt { id: string; name: string; }

function Select({ label, value, onChange, options, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; options: Opt[]; placeholder: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <select className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
        value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </div>
  );
}

export function NovoPedidoForm({
  customers, stores, orderTypes, operations, paymentMethods, shippingMethods, banks, campaigns,
}: {
  customers: Opt[]; stores: Opt[]; orderTypes: Opt[];
  operations: Opt[]; paymentMethods: Opt[]; shippingMethods: Opt[]; banks: Opt[]; campaigns: Opt[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [orderNumber, setOrderNumber] = useState("");
  const [storeId, setStoreId] = useState("");
  const [orderTypeId, setOrderTypeId] = useState("");
  const [operationId, setOperationId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [shippingMethodId, setShippingMethodId] = useState("");
  const [bankId, setBankId] = useState("");
  const [orderValue, setOrderValue] = useState(0);
  const [freight, setFreight] = useState(0);
  const [notes, setNotes] = useState("");
  // Campanha
  const [inCampaign, setInCampaign] = useState(false);
  const [campaignId, setCampaignId] = useState("");
  const [itemCount, setItemCount] = useState(0);
  // Comprovante de pagamento (imagem -> base64 no submit)
  const [proofName, setProofName] = useState("");
  const [proofBase64, setProofBase64] = useState("");
  const [proofError, setProofError] = useState<string | null>(null);

  function onProof(e: React.ChangeEvent<HTMLInputElement>) {
    setProofError(null);
    const file = e.target.files?.[0];
    if (!file) { setProofName(""); setProofBase64(""); return; }
    setProofName(file.name);
    start(async () => {
      const r = await shrinkImageToBase64(file, { maxDimension: 1600, quality: 0.8 });
      if (r.error) { setProofError(r.error); setProofBase64(""); return; }
      setProofBase64(r.base64);
    });
  }

  const total = (orderValue || 0) + (freight || 0);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.toLowerCase().trim();
    if (!q) return customers.slice(0, 6);
    return customers.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 6);
  }, [customerSearch, customers]);

  const selectedCustomer = customers.find((c) => c.id === customerId);

  function onSubmit() {
    setError(null);
    start(async () => {
      const res = await createOrder({
        orderNumber, storeId, orderTypeId, operationId, customerId,
        paymentMethodId, shippingMethodId, orderValue, freight,
        bankId,
        notes: notes || undefined,
        campaignId: inCampaign ? campaignId : undefined,
        itemCount: inCampaign ? itemCount : 0,
        paymentProofBase64: proofBase64 || undefined,
      });
      if (res.ok) { router.push("/vendas"); router.refresh(); }
      else setError(res.error);
    });
  }

  const campaignOk = !inCampaign || (campaignId && itemCount > 0);
  // Anexo obrigatório: sem comprovante, não salva.
  const temAnexo = !!proofBase64;
  const podeEnviar = orderNumber && storeId && orderTypeId && operationId && customerId && paymentMethodId && shippingMethodId && bankId && orderValue > 0 && campaignOk && temAnexo;

  return (
    <div className="space-y-5">
      {/* Grade aproveitando o espaco horizontal: 3 colunas no desktop */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Número do Pedido</Label>
          <Input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="ex: 1024" />
        </div>
        <Select label="Loja" value={storeId} onChange={setStoreId} options={stores} placeholder="Selecione..." />
        <Select label="Tipo de Pedido" value={orderTypeId} onChange={setOrderTypeId} options={orderTypes} placeholder="Selecione..." />
        <Select label="Código da Operação" value={operationId} onChange={setOperationId} options={operations} placeholder="Selecione..." />
        <Select label="Forma de Pagamento" value={paymentMethodId} onChange={setPaymentMethodId} options={paymentMethods} placeholder="Selecione..." />
        <Select label="Forma de Envio" value={shippingMethodId} onChange={setShippingMethodId} options={shippingMethods} placeholder="Selecione..." />
        <Select label="Banco" value={bankId} onChange={setBankId} options={banks} placeholder="Selecione..." />
      </div>

      {/* Cliente + valores na mesma faixa */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-1.5 lg:col-span-1">
          <Label>Cliente</Label>
          {selectedCustomer ? (
            <div className="flex h-10 items-center justify-between rounded-lg border border-border px-3">
              <span className="truncate text-sm font-medium">{selectedCustomer.name}</span>
              <button className="text-xs text-primary hover:underline" onClick={() => { setCustomerId(""); setCustomerSearch(""); }}>Trocar</button>
            </div>
          ) : (
            <div className="relative">
              <Input placeholder="Buscar cliente..." value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} />
              {customerSearch && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg">
                  {filteredCustomers.map((c) => (
                    <button key={c.id} className="block w-full px-3 py-2 text-left text-sm hover:bg-secondary"
                      onClick={() => { setCustomerId(c.id); setCustomerSearch(""); }}>{c.name}</button>
                  ))}
                  {filteredCustomers.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">Nenhum encontrado.</p>}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Valor Total do Pedido</Label>
          <Input type="number" min={0} step="0.01" value={orderValue || ""} onChange={(e) => setOrderValue(Number(e.target.value))} placeholder="0,00" />
        </div>
        <div className="space-y-1.5">
          <Label>Valor do Frete</Label>
          <Input type="number" min={0} step="0.01" value={freight || ""} onChange={(e) => setFreight(Number(e.target.value))} placeholder="0,00" />
        </div>
      </div>

      {/* Campanha (meta por volume de itens) */}
      <div className="rounded-lg border border-border p-4">
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" className="h-4 w-4 accent-vendas"
            checked={inCampaign}
            onChange={(e) => setInCampaign(e.target.checked)}
            disabled={campaigns.length === 0} />
          <span className="text-sm font-medium">
            Este pedido faz parte de uma campanha
          </span>
          {campaigns.length === 0 && (
            <span className="text-xs text-muted-foreground">(nenhuma campanha ativa para você)</span>
          )}
        </label>
        {inCampaign && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Campanha</Label>
              <select className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
                <option value="">Selecione...</option>
                {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Quantidade de itens</Label>
              <Input type="number" min={1} value={itemCount || ""}
                onChange={(e) => setItemCount(Number(e.target.value))} placeholder="ex: 10" />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Comprovante de pagamento *</Label>
        <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          onChange={onProof}
          className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-vendas file:px-4 file:py-2 file:text-sm file:font-medium file:text-vendas-fg hover:file:opacity-90" />
        <p className="text-xs text-muted-foreground">
          Obrigatório. A imagem é convertida para .webp no servidor. {proofName && <span className="text-foreground">Selecionado: {proofName}</span>}
        </p>
        {proofError && <p className="text-sm text-destructive">{proofError}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>Observações</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <span className="text-lg font-bold text-vendas">Total: {formatBRL(total)}</span>
        <Button variant="vendas" size="lg" onClick={onSubmit} disabled={pending || !podeEnviar}>
          {pending ? "Salvando..." : "Criar pedido"}
        </Button>
      </div>

      {error && <p className="text-sm font-medium text-destructive">{error}</p>}
    </div>
  );
}
