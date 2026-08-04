"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Plus } from "lucide-react";
import { createOrder } from "@/lib/actions/orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomerCombobox } from "@/components/shared/customer-combobox";
import { formatBRL } from "@/lib/utils";
import { prepareProofFile } from "@/lib/client-image";
import { isAnexoDispensavel } from "@/lib/validations/order";
import { CampaignItemRow } from "@/components/shared/campaign-item-row";

interface Opt { id: string; name: string; }
// Forma de envio carrega o flag que exige endereço de entrega (ex.: Excursão).
interface ShipOpt extends Opt { requiresAddress?: boolean; }

interface CampItem { campaignId: string; reference: string; quantity: number; value: number; }
function emptyCampItem(): CampItem { return { campaignId: "", reference: "", quantity: 0, value: 0 }; }

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
  stores, originStores, orderTypes, operations, shippingMethods, campaigns,
}: {
  stores: Opt[]; originStores: Opt[]; orderTypes: Opt[];
  operations: Opt[]; shippingMethods: ShipOpt[]; campaigns: Opt[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [orderNumber, setOrderNumber] = useState("");
  const [storeId, setStoreId] = useState("");
  const [originStoreId, setOriginStoreId] = useState("");
  const [orderTypeId, setOrderTypeId] = useState("");
  const [operationId, setOperationId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [shippingMethodId, setShippingMethodId] = useState("");
  const [orderValue, setOrderValue] = useState(0);
  const [freight, setFreight] = useState(0);
  const [notes, setNotes] = useState("");

  // Endereço de entrega (exibido só quando a forma de envio exige, ex.: Excursão).
  const [shipCep, setShipCep] = useState("");
  const [shipStreet, setShipStreet] = useState("");
  const [shipNumber, setShipNumber] = useState("");
  const [shipDistrict, setShipDistrict] = useState("");
  const [shipCity, setShipCity] = useState("");
  const [shipState, setShipState] = useState("");

  // A forma de envio selecionada exige endereço completo?
  const requiresAddress =
    shippingMethods.find((s) => s.id === shippingMethodId)?.requiresAddress === true;
  const addressOk =
    !requiresAddress ||
    [shipCep, shipStreet, shipNumber, shipDistrict, shipCity, shipState].every((v) => v.trim());
  const [paymentNotes, setPaymentNotes] = useState("");
  // Campanha — lista dinâmica de itens (campanha, referência, qtd, valor).
  const [inCampaign, setInCampaign] = useState(false);
  const [campaignDiscount, setCampaignDiscount] = useState(false);
  const [campItems, setCampItems] = useState<CampItem[]>([emptyCampItem()]);

  function updateItem(idx: number, patch: Partial<CampItem>) {
    setCampItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setCampItems((prev) => [...prev, emptyCampItem()]);
  }
  function removeItem(idx: number) {
    setCampItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  }
  // Comprovantes de pagamento (ate 5). Cada item: nome + base64 pronto p/ envio.
  const MAX_PROOFS = 5;
  const [proofs, setProofs] = useState<{ name: string; base64: string }[]>([]);
  const [proofError, setProofError] = useState<string | null>(null);
  const [proofBusy, setProofBusy] = useState(false);

  async function onProof(e: React.ChangeEvent<HTMLInputElement>) {
    setProofError(null);
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // permite re-selecionar o mesmo arquivo depois
    if (files.length === 0) return;

    const espacoLivre = MAX_PROOFS - proofs.length;
    if (espacoLivre <= 0) {
      setProofError(`Máximo de ${MAX_PROOFS} comprovantes.`);
      return;
    }
    const aProcessar = files.slice(0, espacoLivre);
    if (files.length > espacoLivre) {
      setProofError(`Só cabem mais ${espacoLivre}. Os demais foram ignorados.`);
    }

    setProofBusy(true);
    for (const file of aProcessar) {
      const r = await prepareProofFile(file, { maxDimension: 1600, quality: 0.8 });
      if (r.error) { setProofError(r.error); continue; }
      setProofs((prev) =>
        prev.length >= MAX_PROOFS ? prev : [...prev, { name: file.name, base64: r.base64 ?? "" }],
      );
    }
    setProofBusy(false);
  }

  function removeProof(idx: number) {
    setProofs((prev) => prev.filter((_, i) => i !== idx));
    setProofError(null);
  }

  const total = (orderValue || 0) + (freight || 0);

  // Anexo (comprovante) e valor dispensados na Troca e na Doação.
  const orderTypeName = orderTypes.find((t) => t.id === orderTypeId)?.name ?? "";
  const anexoDispensavel = isAnexoDispensavel(orderTypeName);
  const valorDispensavel = anexoDispensavel;

  function onSubmit() {
    setError(null);
    start(async () => {
      const res = await createOrder({
        orderNumber, storeId, originStoreId, orderTypeId, operationId, customerId,
        shippingMethodId, orderValue, freight,
        notes: notes || undefined,
        paymentNotes: paymentNotes || undefined,
        orderTypeName,
        // Endereço de entrega (só relevante quando a forma de envio exige).
        requiresAddress,
        shipCep: requiresAddress ? shipCep.trim() : undefined,
        shipStreet: requiresAddress ? shipStreet.trim() : undefined,
        shipNumber: requiresAddress ? shipNumber.trim() : undefined,
        shipDistrict: requiresAddress ? shipDistrict.trim() : undefined,
        shipCity: requiresAddress ? shipCity.trim() : undefined,
        shipState: requiresAddress ? shipState.trim().toUpperCase() : undefined,
        campaignItems: inCampaign
          ? campItems.map((it) => ({
              campaignId: it.campaignId,
              reference: it.reference.trim(),
              quantity: it.quantity,
              value: it.value,
            }))
          : undefined,
        campaignDiscount: inCampaign ? campaignDiscount : false,
        paymentProofsBase64: proofs.length ? proofs.map((p) => p.base64) : undefined,
      });
      if (res.ok) { router.push("/vendas"); router.refresh(); }
      else setError(res.error);
    });
  }

  const campaignOk =
    !inCampaign ||
    (campItems.length > 0 &&
      campItems.every((it) => it.campaignId && it.reference.trim() && it.quantity > 0));
  // Anexo obrigatório (ao menos 1), EXCETO Troca e Doação.
  const temAnexo = proofs.length > 0;
  const anexoOk = anexoDispensavel || temAnexo;
  // Valor obrigatório (> 0), EXCETO Troca e Doação.
  const valorOk = valorDispensavel || orderValue > 0;
  const podeEnviar = orderNumber && storeId && originStoreId && orderTypeId && operationId && customerId && shippingMethodId && valorOk && campaignOk && anexoOk && addressOk;

  return (
    <div className="space-y-5">
      {/* Grade aproveitando o espaco horizontal: 3 colunas no desktop */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Número do Pedido</Label>
          <Input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="ex: 1024" />
        </div>
        <Select label="Loja" value={storeId} onChange={setStoreId} options={stores} placeholder="Selecione..." />
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
        <Select label="Tipo de Pedido" value={orderTypeId} onChange={setOrderTypeId} options={orderTypes} placeholder="Selecione..." />
        <Select label="Código da Operação" value={operationId} onChange={setOperationId} options={operations} placeholder="Selecione..." />
        {/* "Forma de Pagamento" e "Banco" saíram daqui: agora são preenchidos
            pelo Financeiro na tela de Análise de Pedidos. */}
        <Select label="Forma de Envio" value={shippingMethodId} onChange={setShippingMethodId} options={shippingMethods} placeholder="Selecione..." />
      </div>

      {/* Cliente + valores na mesma faixa */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          {/* Busca no SERVIDOR: a base tem dezenas de milhares de clientes,
              entao nunca carregamos todos no navegador. */}
          <CustomerCombobox label="Cliente" value={customerId} onChange={setCustomerId} />
        </div>
        <div className="space-y-1.5">
          <Label>Valor Total do Pedido {valorDispensavel ? "(opcional)" : "*"}</Label>
          <Input type="number" min={0} step="0.01" value={orderValue || ""} onChange={(e) => setOrderValue(Number(e.target.value))} placeholder="0,00" />
        </div>
        <div className="space-y-1.5">
          <Label>Valor do Frete</Label>
          <Input type="number" min={0} step="0.01" value={freight || ""} onChange={(e) => setFreight(Number(e.target.value))} placeholder="0,00" />
        </div>
      </div>

      {/* Endereço de entrega — só aparece quando a forma de envio exige
          (ex.: "1 - Excursão"). Todos os campos são obrigatórios. */}
      {requiresAddress && (
        <div className="rounded-lg border border-vendas/40 bg-vendas/5 p-4">
          <p className="mb-3 text-sm font-semibold text-vendas">Endereço de Entrega (Excursão)</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
            <div className="space-y-1.5 lg:col-span-1">
              <Label>CEP *</Label>
              <Input value={shipCep} onChange={(e) => setShipCep(e.target.value)} placeholder="00000-000" />
            </div>
            <div className="space-y-1.5 lg:col-span-3">
              <Label>Logradouro *</Label>
              <Input value={shipStreet} onChange={(e) => setShipStreet(e.target.value)} placeholder="Rua, Av..." />
            </div>
            <div className="space-y-1.5 lg:col-span-1">
              <Label>Número *</Label>
              <Input value={shipNumber} onChange={(e) => setShipNumber(e.target.value)} placeholder="Nº" />
            </div>
            <div className="space-y-1.5 lg:col-span-1">
              <Label>Bairro *</Label>
              <Input value={shipDistrict} onChange={(e) => setShipDistrict(e.target.value)} placeholder="Bairro" />
            </div>
            <div className="space-y-1.5 lg:col-span-4">
              <Label>Cidade *</Label>
              <Input value={shipCity} onChange={(e) => setShipCity(e.target.value)} placeholder="Cidade" />
            </div>
            <div className="space-y-1.5 lg:col-span-2">
              <Label>UF *</Label>
              <Input value={shipState} maxLength={2} onChange={(e) => setShipState(e.target.value.toUpperCase())} placeholder="UF" />
            </div>
          </div>
        </div>
      )}

      {/* Campanha — peças de campanha (lista dinâmica de itens) */}
      <div className="rounded-lg border border-border p-4">
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" className="h-4 w-4 accent-vendas"
            checked={inCampaign}
            onChange={(e) => setInCampaign(e.target.checked)}
            disabled={campaigns.length === 0} />
          <span className="text-sm font-medium">
            Neste pedido, há peças de campanha?
          </span>
          {campaigns.length === 0 && (
            <span className="text-xs text-muted-foreground">(nenhuma campanha ativa para você)</span>
          )}
        </label>
        {inCampaign && (
          <div className="mt-3 space-y-3">
            <label className="flex w-fit cursor-pointer items-center gap-2">
              <input type="checkbox" className="h-4 w-4 accent-vendas"
                checked={campaignDiscount}
                onChange={(e) => setCampaignDiscount(e.target.checked)} />
              <span className="text-sm font-medium">Possui desconto?</span>
              <span className="text-xs text-muted-foreground">
                (premiação por item: {campaignDiscount ? "reduzida" : "integral"})
              </span>
            </label>
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

      <div className="space-y-1.5">
        <Label>Comprovantes de pagamento {anexoDispensavel ? "(opcional)" : "*"}</Label>

        {/* Lista dos comprovantes ja anexados, com opcao de remover. */}
        {proofs.length > 0 && (
          <ul className="space-y-1">
            {proofs.map((p, i) => (
              <li key={i} className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-3 py-1.5 text-sm">
                <span className="truncate">
                  <span className="font-data mr-2 text-xs text-muted-foreground">{i + 1}.</span>
                  {p.name}
                </span>
                <button type="button" onClick={() => removeProof(i)}
                  className="ml-2 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-background hover:text-destructive"
                  aria-label="Remover comprovante">
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Botao de adicionar (some ao atingir o limite). Aceita multipla selecao. */}
        {proofs.length < MAX_PROOFS && (
          <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.pdf"
            onChange={onProof} disabled={proofBusy}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-vendas file:px-4 file:py-2 file:text-sm file:font-medium file:text-vendas-fg hover:file:opacity-90" />
        )}

        <p className="text-xs text-muted-foreground">
          {anexoDispensavel
            ? "Anexo não é exigido para este tipo de pedido."
            : "Envio de ao menos 1 comprovante obrigatório."}{" "}
          <span className="text-foreground">{proofs.length}/{MAX_PROOFS} anexados.</span>
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
        <Button variant="vendas" size="lg" onClick={onSubmit} disabled={pending || !podeEnviar}>
          {pending ? "Salvando..." : "Criar pedido"}
        </Button>
      </div>

      {error && <p className="text-sm font-medium text-destructive">{error}</p>}
    </div>
  );
}
