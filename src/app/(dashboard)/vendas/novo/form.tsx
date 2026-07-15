"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { createOrder } from "@/lib/actions/orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomerCombobox } from "@/components/shared/customer-combobox";
import { formatBRL } from "@/lib/utils";
import { shrinkImageToBase64 } from "@/lib/client-image";
import { isTroca } from "@/lib/validations/order";

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
  stores, orderTypes, operations, shippingMethods, campaigns,
}: {
  stores: Opt[]; orderTypes: Opt[];
  operations: Opt[]; shippingMethods: Opt[]; campaigns: Opt[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [orderNumber, setOrderNumber] = useState("");
  const [storeId, setStoreId] = useState("");
  const [orderTypeId, setOrderTypeId] = useState("");
  const [operationId, setOperationId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [shippingMethodId, setShippingMethodId] = useState("");
  const [orderValue, setOrderValue] = useState(0);
  const [freight, setFreight] = useState(0);
  const [notes, setNotes] = useState("");
  // Campanha
  const [inCampaign, setInCampaign] = useState(false);
  const [campaignId, setCampaignId] = useState("");
  const [itemCount, setItemCount] = useState(0);
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
      const r = await shrinkImageToBase64(file, { maxDimension: 1600, quality: 0.8 });
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

  // Tipo "Troca" dispensa o comprovante de pagamento (anexo opcional).
  const orderTypeName = orderTypes.find((t) => t.id === orderTypeId)?.name ?? "";
  const trocaSemAnexo = isTroca(orderTypeName);

  function onSubmit() {
    setError(null);
    start(async () => {
      const res = await createOrder({
        orderNumber, storeId, orderTypeId, operationId, customerId,
        shippingMethodId, orderValue, freight,
        notes: notes || undefined,
        orderTypeName,
        campaignId: inCampaign ? campaignId : undefined,
        itemCount: inCampaign ? itemCount : 0,
        paymentProofsBase64: proofs.length ? proofs.map((p) => p.base64) : undefined,
      });
      if (res.ok) { router.push("/vendas"); router.refresh(); }
      else setError(res.error);
    });
  }

  const campaignOk = !inCampaign || (campaignId && itemCount > 0);
  // Anexo obrigatório (ao menos 1), EXCETO quando o tipo for "Troca".
  const temAnexo = proofs.length > 0;
  const anexoOk = trocaSemAnexo || temAnexo;
  const podeEnviar = orderNumber && storeId && orderTypeId && operationId && customerId && shippingMethodId && orderValue > 0 && campaignOk && anexoOk;

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
        <Label>Comprovantes de pagamento {trocaSemAnexo ? "(opcional p/ Troca)" : "*"}</Label>

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
          <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            onChange={onProof} disabled={proofBusy}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-vendas file:px-4 file:py-2 file:text-sm file:font-medium file:text-vendas-fg hover:file:opacity-90" />
        )}

        <p className="text-xs text-muted-foreground">
          {trocaSemAnexo
            ? "Tipo \"Troca\": anexo não é exigido."
            : "Envio de ao menos 1 comprovante obrigatório."}{" "}
          <span className="text-foreground">{proofs.length}/{MAX_PROOFS} anexados.</span>
          {proofBusy && " Processando..."}
        </p>
        {proofError && <p className="text-sm text-destructive">{proofError}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>Observações</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Escreva suas observações aqui..." />
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
