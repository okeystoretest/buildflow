"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Plus, Printer } from "lucide-react";
import { updateOrder } from "@/lib/actions/orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomerCombobox, type CustomerOpt } from "@/components/shared/customer-combobox";
import { prepareProofFile } from "@/lib/client-image";
import { isAnexoDispensavel, isAnexoDispensavelPorContexto } from "@/lib/validations/order";
import { formatBRL } from "@/lib/utils";
import { CampaignItemRow, type CampaignItemData } from "@/components/shared/campaign-item-row";

interface Opt { id: string; name: string; }
interface ShipOpt extends Opt { requiresAddress?: boolean; }
interface ExcursaoOpt extends Opt {
  address: string;
  cutoffTime?: string | null;
  operatingDays?: string | null;
}
interface OrderData {
  id: string;
  orderNumber: string;
  customerId: string; storeId: string; originStoreId: string; orderTypeId: string; operationId: string;
  paymentMethodId: string; shippingMethodId: string; bankId: string;
  pieceCount: number;
  orderValue: number; freight: number; notes: string; paymentNotes: string;
  campaignId: string; itemCount: number;
  campaignItems: CampaignItemData[];
  shipCep: string; shipStreet: string; shipNumber: string;
  shipDistrict: string; shipCity: string; shipState: string;
  excursaoId: string;
}
interface ExistingProof { id: string; filePath: string; }

function emptyCampItem(): CampaignItemData { return { campaignId: "", reference: "", quantity: 0, value: 0 }; }

const MAX_PROOFS = 5;

export function EditarPedidoForm({
  order, existingProofs, selectedCustomer, stores, originStores, orderTypes, operations,
  paymentMethods, shippingMethods, banks, campaigns, canEditFinance = false, excursoes = [],
}: {
  order: OrderData;
  existingProofs: ExistingProof[];
  selectedCustomer: CustomerOpt | null;
  stores: Opt[]; originStores: Opt[]; orderTypes: Opt[]; operations: Opt[];
  paymentMethods: Opt[]; shippingMethods: ShipOpt[]; banks: Opt[]; campaigns: Opt[];
  canEditFinance?: boolean;
  excursoes?: ExcursaoOpt[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [orderNumber, setOrderNumber] = useState(order.orderNumber);
  // "N° de Peças no Pedido" — quantidade total de pecas vinculadas ao pedido.
  const [pieceCount, setPieceCount] = useState(order.pieceCount);
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

  // Endereço de entrega (Excursão).
  const [shipCep, setShipCep] = useState(order.shipCep);
  const [shipStreet, setShipStreet] = useState(order.shipStreet);
  // "N°" removido da UI (Req. 2.1), mas o valor legado do pedido é preservado
  // no salvamento — não apagamos números já cadastrados em pedidos antigos.
  const shipNumber = order.shipNumber;
  const [shipDistrict, setShipDistrict] = useState(order.shipDistrict);
  const [shipCity, setShipCity] = useState(order.shipCity);
  const [shipState, setShipState] = useState(order.shipState);
  const [excursaoId, setExcursaoId] = useState(order.excursaoId);

  // A excursão é INDEPENDENTE do endereço de entrega do cliente: selecioná-la
  // NÃO preenche nenhum campo ship*. O endereço da excursão vai apenas para a
  // etiqueta de envio, via vínculo excursaoId.
  function onExcursaoChange(id: string) {
    setExcursaoId(id);
  }

  const requiresAddress =
    shippingMethods.find((s) => s.id === shippingMethodId)?.requiresAddress === true;
  // Req. 2.1: "N°" ocultado na Excursão e fora da obrigatoriedade.
  const addressOk =
    !requiresAddress ||
    [shipCep, shipStreet, shipDistrict, shipCity, shipState].every((v) => (v ?? "").trim());

  // Req. 2.2: autopreenche o Endereço de Entrega com os dados do cliente ao
  // selecioná-lo na Excursão. Campos seguem editáveis.
  function onCustomerSelect(c: CustomerOpt | null) {
    if (!c || !requiresAddress) return;
    if (c.cep) setShipCep(c.cep);
    if (c.street) setShipStreet(c.street);
    if (c.district) setShipDistrict(c.district);
    if (c.city) setShipCity(c.city);
    if (c.state) setShipState(c.state.toUpperCase());
  }

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
  const operationName = operations.find((o) => o.id === operationId)?.name ?? "";
  // Anexo opcional por TIPO (Troca/Doação/Transferência) OU OPERAÇÃO
  // (Funcionário Interno). Valor segue só o TIPO.
  const anexoDispensavel = isAnexoDispensavelPorContexto({ orderTypeName, operationName });
  const valorDispensavel = isAnexoDispensavel(orderTypeName);
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
        pieceCount,
        customerId, storeId, originStoreId, orderTypeId, operationId,
        shippingMethodId,
        ...(canEditFinance ? { paymentMethodId, bankId: bankId || undefined } : {}),
        orderValue, freight, notes, paymentNotes,
        // Endereço de entrega (Excursão). Enviado sempre; a action limpa quando
        // a forma de envio não exige.
        shipCep, shipStreet, shipNumber, shipDistrict, shipCity, shipState,
        excursaoId,
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
  const valorOk = valorDispensavel || orderValue > 0;
  const podeSalvar = orderNumber && storeId && originStoreId && orderTypeId && operationId && customerId
    && shippingMethodId && valorOk && campaignOk && anexoOk && addressOk;

  return (
    <div className="space-y-5">
      {/* Mesma grade do Novo Pedido: 6 colunas no desktop. "Número do Pedido" e
          "N° de Peças" ocupam 1 coluna cada (lado a lado); os selects, 2. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <div className="space-y-1.5 lg:col-span-1">
          <Label>Número do Pedido</Label>
          <Input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="ex: 1024" />
        </div>
        <div className="space-y-1.5 lg:col-span-1">
          <Label>N° de Peças</Label>
          <Input
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={pieceCount || ""}
            onChange={(e) => setPieceCount(Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
            placeholder="ex: 12"
          />
        </div>
        <Select className="col-span-2" label="Loja" value={storeId} onChange={setStoreId} options={stores} />
        {originStores.length > 0 ? (
          <Select className="col-span-2" label="Loja de Origem" value={originStoreId} onChange={setOriginStoreId} options={originStores} placeholder="Selecione..." />
        ) : (
          <div className="col-span-2 space-y-1.5">
            <Label>Loja de Origem</Label>
            <div className="flex h-10 items-center rounded-lg border border-destructive/40 bg-destructive/5 px-3 text-sm text-destructive">
              Nenhuma loja atrelada ao seu usuário.
            </div>
          </div>
        )}
        <Select className="col-span-2" label="Tipo de Pedido" value={orderTypeId} onChange={setOrderTypeId} options={orderTypes} />
        <Select className="col-span-2" label="Código da Operação" value={operationId} onChange={setOperationId} options={operations} />
        {canEditFinance && (
          <Select className="col-span-2" label="Forma de Pagamento" value={paymentMethodId} onChange={setPaymentMethodId} options={paymentMethods} placeholder="Selecione..." />
        )}
        <Select className="col-span-2" label="Forma de Envio" value={shippingMethodId} onChange={setShippingMethodId} options={shippingMethods} />
        {canEditFinance && (
          <Select className="col-span-2" label="Banco" value={bankId} onChange={setBankId} options={banks} placeholder="Selecione..." />
        )}
      </div>

      {/* Seleção de Excursão — FORA do endereço do cliente, logo após o bloco
          de Forma de Envio. O endereço da excursão vai só para a etiqueta. */}
      {requiresAddress && (
        <div className="rounded-lg border border-vendas/40 bg-vendas/5 p-4">
          <div className="max-w-md">
            <Select
              label="Excursão"
              value={excursaoId}
              onChange={onExcursaoChange}
              options={excursoes}
              placeholder={excursoes.length ? "Selecione a excursão..." : "Nenhuma excursão cadastrada"}
            />
            {excursaoId && (() => {
              const ex = excursoes.find((e) => e.id === excursaoId);
              if (!ex) return null;
              const detalhes = [
                ex.operatingDays ? `Dias: ${ex.operatingDays}` : "",
                ex.cutoffTime ? `Funciona até às ${ex.cutoffTime}` : "",
              ].filter(Boolean).join(" · ");
              return (
                <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  <p><span className="font-semibold text-vendas">Endereço (etiqueta):</span> {ex.address}</p>
                  {detalhes && <p>{detalhes}</p>}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <CustomerCombobox label="Cliente" value={customerId} onChange={setCustomerId} onSelect={onCustomerSelect} initialSelected={selectedCustomer} />
        <div className="space-y-1.5">
          <Label>Valor Total do Pedido {valorDispensavel ? "(opcional)" : "*"}</Label>
          <Input type="number" min={0} step="0.01" value={orderValue || ""} onChange={(e) => setOrderValue(Number(e.target.value))} placeholder="0,00" />
        </div>
        <div className="space-y-1.5">
          <Label>Valor do Frete</Label>
          <Input type="number" min={0} step="0.01" value={freight || ""} onChange={(e) => setFreight(Number(e.target.value))} placeholder="0,00" />
        </div>
      </div>

      {/* Endereço de entrega — só quando a forma de envio exige (Excursão). */}
      {requiresAddress && (
        <div className="rounded-lg border border-vendas/40 bg-vendas/5 p-4">
          <p className="mb-3 text-sm font-semibold text-vendas">Endereço de Entrega (Cliente)</p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
            <div className="space-y-1.5 lg:col-span-2">
              <Label>CEP *</Label>
              <Input value={shipCep} onChange={(e) => setShipCep(e.target.value)} placeholder="00000-000" />
            </div>
            <div className="space-y-1.5 lg:col-span-4">
              <Label>Logradouro *</Label>
              <Input value={shipStreet} onChange={(e) => setShipStreet(e.target.value)} placeholder="Rua, Av..." />
            </div>
            {/* Req. 2.1: campo "N°" ocultado na forma Excursão. */}
            <div className="space-y-1.5 lg:col-span-2">
              <Label>Bairro *</Label>
              <Input value={shipDistrict} onChange={(e) => setShipDistrict(e.target.value)} placeholder="Bairro" />
            </div>
            <div className="space-y-1.5 lg:col-span-2">
              <Label>Cidade *</Label>
              <Input value={shipCity} onChange={(e) => setShipCity(e.target.value)} placeholder="Cidade" />
            </div>
            <div className="space-y-1.5 lg:col-span-2">
              <Label>UF *</Label>
              <Input value={shipState} maxLength={2} onChange={(e) => setShipState(e.target.value.toUpperCase())} placeholder="UF" />
            </div>
          </div>
          {/* Etiqueta térmica (Zebra 105×140mm). Abre em nova aba e imprime.
              Usa os dados JÁ SALVOS do pedido — por isso o aviso de salvar antes. */}
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-vendas/30 pt-3">
            <a
              href={`/etiqueta/${order.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-vendas px-4 text-sm font-semibold text-vendas-fg shadow-sm transition-colors hover:bg-vendas/90"
            >
              <Printer className="mr-2 h-4 w-4" /> Imprimir Etiqueta
            </a>
            <span className="text-xs text-muted-foreground">
              A etiqueta usa os dados salvos. Salve o pedido antes se alterou o endereço.
            </span>
          </div>
        </div>
      )}
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

function Select({ label, value, onChange, options, placeholder, className }: {
  label: string; value: string; onChange: (v: string) => void; options: Opt[]; placeholder?: string;
  // Permite controlar a largura do campo dentro da grade (col-span-*).
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label>{label}</Label>
      <select className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm"
        value={value} onChange={(e) => onChange(e.target.value)}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </div>
  );
}
