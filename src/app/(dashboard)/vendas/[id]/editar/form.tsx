"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Plus } from "lucide-react";
import { updateOrder } from "@/lib/actions/orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomerCombobox, type CustomerOpt } from "@/components/shared/customer-combobox";
import { prepareProofFile } from "@/lib/client-image";
import { isAnexoDispensavel } from "@/lib/validations/order";
import { formatBRL } from "@/lib/utils";
import { CampaignItemRow, type CampaignItemData } from "@/components/shared/campaign-item-row";

interface Opt { id: string; name: string; }
interface OrderData {
  id: string;
  orderNumber: string;
  customerId: string; storeId: string; originStoreId: string; orderTypeId: string; operationId: string;
  paymentMethodId: string; shippingMethodId: string; bankId: string;
  orderValue: number; freight: number; notes: string; paymentNotes: string;
  campaignId: string; itemCount: number;
  campaignItems: CampaignItemData[];
}
interface ExistingProof { id: string; filePath: string; }

function emptyCampItem(): CampaignItemData { return { campaignId: "", reference: "", quantity: 0, value: 0 }; }

const MAX_PROOFS = 5;

export function EditarPedidoForm({
  order, existingProofs, selectedCustomer, stores, originStores, orderTypes, operations,
  paymentMethods, shippingMethods, banks, campaigns, canEditFinance = false,
}: {
  order: OrderData;
  existingProofs: ExistingProof[];
  selectedCustomer: CustomerOpt | null;
  stores: Opt[]; originStores: Opt[]; orderTypes: Opt[]; operations: Opt[];
  paymentMethods: Opt[]; shippingMethods: Opt[]; banks: Opt[]; campaigns: Opt[];
  canEditFinance?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [orderNumber, setOrderNumber] = useState(order.orderNumber);
  const [customerId, setCustomerId] = useState(order.customerId);
  const [storeId, setStoreId] = useState(order.storeId);
  const [originStoreId, setOriginStoreId] = useState(order.originStoreId);
  const [orderTypeId, setOrderTypeId] = useState(order.orderTypeId);
  const [operationId, setOperationId] = useState(order.operationId);
  const [paymentMethodId, setPaymentMethodId] = useState(order.paymentMethodId);
  const [shippingMethodId, setShippingMethodId] = useState(order.shippingMethodId);
  const [bankId, setBankId] = useState(order.bankId);
  const [orderValue, setOrderValue] = useState(order.orderValue);
  const [freight, setFreight] = useState(order.freight);
  const [notes, setNotes] = useState(order.notes);
  const [paymentNotes, setPaymentNotes] = useState(order.paymentNotes);

  // Campanha — lista dinâmica de itens. Pré-carrega os itens existentes;
  // se não houver, começa com uma linha vazia quando o toggle é ligado.
  const [inCampaign, setInCampaign] = useState(order.campaignItems.length > 0 || !!order.campaignId);
  const [campItems, setCampItems] = useState<CampaignItemData[]>(
    order.campaignItems.length > 0 ? order.campaignItems : [emptyCampItem()],
  );

  function updateItem(idx: number, patch: Partial<CampaignItemData>) {
    setCampItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function addItem() { setCampItems((prev) => [...prev, emptyCampItem()]); }
  function removeItem(idx: number) {
    setCampItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  }

  // Comprovantes: existentes (com opcao de remover) + novos a adicionar.
  const [existing, setExisting] = useState<ExistingProof[]>(existingProofs);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [newProofs, setNewProofs] = useState<{ name: string; base64: string }[]>([]);
  const [proofError, setProofError] = useState<string | null>(null);
  const [proofBusy, setProofBusy] = useState(false);

  const totalProofs = existing.length + newProofs.length;

  function removeExisting(id: string) {
    setExisting((prev) => prev.filter((p) => p.id !== id));
    setRemovedIds((prev) => [...prev, id]);
  }
  function removeNew(idx: number) {
    setNewProofs((prev) => prev.filter((_, i) => i !== idx));
  }

  async function onProof(e: React.ChangeEvent<HTMLInputElement>) {
    setProofError(null);
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    const espaco = MAX_PROOFS - totalProofs;
    if (espaco <= 0) { setProofError(`Máximo de ${MAX_PROOFS} comprovantes.`); return; }

    setProofBusy(true);
    for (const file of files.slice(0, espaco)) {
      const r = await prepareProofFile(file, { maxDimension: 1600, quality: 0.8 });
      if (r.error) { setProofError(r.error); continue; }
      setNewProofs((prev) =>
        existing.length + prev.length >= MAX_PROOFS ? prev : [...prev, { name: file.name, base64: r.base64 ?? "" }],
      );
    }
    setProofBusy(false);
  }

  const total = (orderValue || 0) + (freight || 0);
  const orderTypeName = orderTypes.find((t) => t.id === orderTypeId)?.name ?? "";
  const anexoDispensavel = isAnexoDispensavel(orderTypeName);
  const campaignOk =
    !inCampaign ||
    (campItems.length > 0 &&
      campItems.every((it) => it.campaignId && it.reference.trim() && it.quantity > 0));
  const anexoOk = anexoDispensavel || totalProofs > 0;

  function save() {
    setError(null);
    start(async () => {
      const res = await updateOrder({
        id: order.id,
        orderNumber,
        customerId, storeId, originStoreId, orderTypeId, operationId,
        shippingMethodId,
        ...(canEditFinance ? { paymentMethodId, bankId: bankId || undefined } : {}),
        orderValue, freight, notes, paymentNotes,
        // Lista de itens de campanha substitui o conjunto atual no servidor.
        campaignItems: inCampaign
          ? campItems.map((it) => ({
              campaignId: it.campaignId,
              reference: it.reference.trim(),
              quantity: it.quantity,
              value: it.value,
            }))
          : [],
        paymentProofsBase64: newProofs.length ? newProofs.map((p) => p.base64) : undefined,
        removeProofIds: removedIds.length ? removedIds : undefined,
      });
      if (res.ok) { router.push(canEditFinance ? "/fluxo" : "/vendas"); router.refresh(); }
      else setError(res.error);
    });
  }

  // Valor obrigatório (> 0), EXCETO Troca e Doação.
  const valorOk = anexoDispensavel || orderValue > 0;
  const podeSalvar = orderNumber && storeId && originStoreId && orderTypeId && operationId && customerId
    && shippingMethodId && valorOk && campaignOk && anexoOk;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Número do Pedido</Label>
          <Input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="ex: 1024" />
        </div>
        <Select label="Loja" value={storeId} onChange={setStoreId} options={stores} />
        {originStores.length > 0 ? (
          <Select label="Loja de Origem" value={originStoreId} onChange={setOriginStoreId} options={originStores} placeholder="Selecione..." />
        ) : (
          <div className="space-y-1.5">
            <Label>Loja de Origem</Label>
            <div className="flex h-10 items-center rounded-lg border border-destructive/40 bg-destructive/5 px-3 text-sm text-destructive">
              Nenhuma loja atrelada ao seu usuário.
            </div>
          </div>
        )}
        <Select label="Tipo de Pedido" value={orderTypeId} onChange={setOrderTypeId} options={orderTypes} />
        <Select label="Código da Operação" value={operationId} onChange={setOperationId} options={operations} />
        {canEditFinance && (
          <Select label="Forma de Pagamento" value={paymentMethodId} onChange={setPaymentMethodId} options={paymentMethods} placeholder="Selecione..." />
        )}
        <Select label="Forma de Envio" value={shippingMethodId} onChange={setShippingMethodId} options={shippingMethods} />
        {canEditFinance && (
          <Select label="Banco" value={bankId} onChange={setBankId} options={banks} placeholder="Selecione..." />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <CustomerCombobox label="Cliente" value={customerId} onChange={setCustomerId} initialSelected={selectedCustomer} />
        <div className="space-y-1.5">
          <Label>Valor Total do Pedido {anexoDispensavel ? "(opcional)" : "*"}</Label>
          <Input type="number" min={0} step="0.01" value={orderValue || ""} onChange={(e) => setOrderValue(Number(e.target.value))} placeholder="0,00" />
        </div>
        <div className="space-y-1.5">
          <Label>Valor do Frete</Label>
          <Input type="number" min={0} step="0.01" value={freight || ""} onChange={(e) => setFreight(Number(e.target.value))} placeholder="0,00" />
        </div>
      </div>

      {/* Campanha — peças de campanha (lista dinâmica de itens) */}
      <div className="rounded-lg border border-border p-4">
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" className="h-4 w-4 accent-vendas"
            checked={inCampaign} onChange={(e) => setInCampaign(e.target.checked)}
            disabled={campaigns.length === 0} />
          <span className="text-sm font-medium">Neste pedido, há peças de campanha?</span>
          {campaigns.length === 0 && <span className="text-xs text-muted-foreground">(nenhuma campanha ativa)</span>}
        </label>
        {inCampaign && (
          <div className="mt-3 space-y-3">
            {campItems.map((it, idx) => (
              <CampaignItemRow
                key={idx}
                item={it}
                index={idx}
                campaigns={campaigns}
                canRemove={campItems.length > 1}
                onChange={(patch) => updateItem(idx, patch)}
                onRemove={() => removeItem(idx)}
              />
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addItem}>
              <Plus className="mr-1.5 h-4 w-4" /> Adicionar Item
            </Button>
          </div>
        )}
      </div>

      {/* Comprovantes: existentes + novos */}
      <div className="space-y-1.5">
        <Label>Comprovantes de pagamento {anexoDispensavel ? "(opcional)" : "*"}</Label>

        {(existing.length > 0 || newProofs.length > 0) && (
          <ul className="space-y-1">
            {existing.map((p, i) => (
              <li key={p.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-3 py-1.5 text-sm">
                <a href={p.filePath} target="_blank" rel="noreferrer" className="truncate text-brand underline">
                  <span className="font-data mr-2 text-xs text-muted-foreground">{i + 1}.</span>
                  Comprovante atual {i + 1}
                </a>
                <button type="button" onClick={() => removeExisting(p.id)}
                  className="ml-2 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-background hover:text-destructive"
                  aria-label="Remover comprovante">
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
            {newProofs.map((p, i) => (
              <li key={`new-${i}`} className="flex items-center justify-between rounded-lg border border-vendas/40 bg-vendas/5 px-3 py-1.5 text-sm">
                <span className="truncate">
                  <span className="font-data mr-2 text-xs text-vendas">novo</span>{p.name}
                </span>
                <button type="button" onClick={() => removeNew(i)}
                  className="ml-2 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-background hover:text-destructive"
                  aria-label="Remover comprovante">
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {totalProofs < MAX_PROOFS && (
          <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.pdf"
            onChange={onProof} disabled={proofBusy}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-vendas file:px-4 file:py-2 file:text-sm file:font-medium file:text-vendas-fg hover:file:opacity-90" />
        )}

        <p className="text-xs text-muted-foreground">
          {anexoDispensavel ? "Anexo não é exigido para este tipo de pedido." : "Ao menos 1 comprovante obrigatório."}{" "}
          <span className="text-foreground">{totalProofs}/{MAX_PROOFS} anexados.</span>
          {proofBusy && " Processando..."}
        </p>
        {proofError && <p className="text-sm text-destructive">{proofError}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Observações de Envio</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Instruções de envio, endereço, referências..." />
        </div>
        <div className="space-y-1.5">
          <Label>Observações de Pagamento</Label>
          <Input value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} placeholder="Informações para o Financeiro na aprovação..." />
          <p className="text-xs text-muted-foreground">Visível apenas para o setor Financeiro.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <span className="text-lg font-bold text-vendas">Total: {formatBRL(total)}</span>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.back()} disabled={pending}>Cancelar</Button>
          <Button variant="vendas" onClick={save} disabled={pending || !podeSalvar}>
            {pending ? "Salvando..." : "Salvar alterações"}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm font-medium text-destructive">{error}</p>}
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
