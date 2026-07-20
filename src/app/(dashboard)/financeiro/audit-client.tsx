"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { auditOrder, setOrderPaymentInfo, uploadSecondPaymentProof, deleteSecondPaymentProof } from "@/lib/actions/finance";
import { linkCnpjToOrder } from "@/lib/actions/cnpj";
import { shrinkImageToBase64 } from "@/lib/client-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";

interface StatusOpt { id: string; name: string; disposition: "APROVA" | "INTERROMPE"; }
interface CnpjOpt { id: string; name: string; document: string; }
interface Opt { id: string; name: string; }

export function AuditarPedido({
  orderId,
  statusOptions,
  cnpjOptions,
  currentCnpjId,
  paymentMethods,
  banks,
  currentPaymentMethodId,
  currentBankId,
  proof2List,
  onProcessed,
}: {
  orderId: string;
  statusOptions: StatusOpt[];
  cnpjOptions: CnpjOpt[];
  currentCnpjId: string | null;
  // Forma de Pagamento e Banco: agora preenchidos aqui (sairam de Vendas).
  paymentMethods: Opt[];
  banks: Opt[];
  currentPaymentMethodId: string | null;
  currentBankId: string | null;
  // Lista dos comprovantes ja anexados (para exibir com opção de remover).
  proof2List: { id: string; filePath: string }[];
  // Chamado apos processar o pedido (ex.: fechar o modal do Kanban).
  onProcessed?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [comanda, setComanda] = useState("");
  const [statusId, setStatusId] = useState("");
  const [cnpjId, setCnpjId] = useState(currentCnpjId ?? "");
  // Vinculo persistido no banco (so libera o "Pago" quando ja gravado).
  const [linkedCnpjId, setLinkedCnpjId] = useState(currentCnpjId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [cnpjMsg, setCnpjMsg] = useState<string | null>(null);

  // Dados de pagamento (Forma + Banco), salvos juntos.
  const [payMethodId, setPayMethodId] = useState(currentPaymentMethodId ?? "");
  const [bankId, setBankId] = useState(currentBankId ?? "");
  const [savedPayMethodId, setSavedPayMethodId] = useState(currentPaymentMethodId ?? "");
  const [savedBankId, setSavedBankId] = useState(currentBankId ?? "");
  const [payMsg, setPayMsg] = useState<string | null>(null);

  // Comprovantes do Financeiro (ate 5). Guarda a contagem ja anexada.
  const MAX_PROOF2 = 5;
  // Lista local dos comprovantes do Financeiro (id + caminho). Começa com o que
  // veio do servidor e é atualizada ao anexar/remover, sem recarregar a página.
  const [proofs, setProofs] = useState<{ id: string; filePath: string }[]>(proof2List);
  const proof2Total = proofs.length;
  const [proofBusy, setProofBusy] = useState(false);
  const [proofMsg, setProofMsg] = useState<string | null>(null);

  // Ao menos 1 comprovante do Financeiro continua sendo pre-requisito.
  const proof2Ok = proof2Total > 0;

  const selected = statusOptions.find((s) => s.id === statusId);
  const isInterrompe = selected?.disposition === "INTERROMPE";

  // Pre-requisitos da APROVACAO (espelham as regras do servidor).
  const cnpjOk = linkedCnpjId !== "";
  const pagamentoOk = savedPayMethodId !== "" && savedBankId !== "";

  function fmtCnpj(doc: string): string {
    const d = (doc || "").replace(/\D/g, "");
    if (d.length !== 14) return doc;
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }

  function linkCnpj() {
    if (!cnpjId) return;
    setError(null); setCnpjMsg(null);
    start(async () => {
      const res = await linkCnpjToOrder({ orderId, cnpjId });
      if (res.ok) { setLinkedCnpjId(cnpjId); setCnpjMsg("CNPJ vinculado ao pedido."); }
      else setError(res.error);
    });
  }

  function savePayment() {
    if (!payMethodId || !bankId) return;
    setError(null); setPayMsg(null);
    start(async () => {
      const res = await setOrderPaymentInfo({ orderId, paymentMethodId: payMethodId, bankId });
      if (res.ok) {
        setSavedPayMethodId(payMethodId);
        setSavedBankId(bankId);
        setPayMsg("Dados de pagamento salvos.");
      } else setError(res.error);
    });
  }

  async function onProof2File(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    const espacoLivre = MAX_PROOF2 - proof2Total;
    if (espacoLivre <= 0) { setError(`Máximo de ${MAX_PROOF2} comprovantes.`); return; }

    setError(null); setProofMsg(null); setProofBusy(true);
    const base64List: string[] = [];
    for (const file of files.slice(0, espacoLivre)) {
      const shrunk = await shrinkImageToBase64(file, { maxDimension: 1600, quality: 0.8 });
      if (shrunk.error || !shrunk.base64) {
        setError(shrunk.error ?? "Não foi possível processar a imagem.");
        continue;
      }
      base64List.push(shrunk.base64);
    }
    if (base64List.length === 0) { setProofBusy(false); return; }

    const res = await uploadSecondPaymentProof({ orderId, base64List });
    setProofBusy(false);
    if (res.ok) {
      setProofs((prev) => [...prev, ...res.data.created].slice(0, MAX_PROOF2));
      setProofMsg(`${res.data.count} comprovante(s) anexado(s).`);
      router.refresh();
    } else setError(res.error);
  }

  // Remove um comprovante do Financeiro (com o "x"). Atualiza a lista local e
  // sincroniza o servidor (apaga registro + arquivo do disco).
  function removeProof2(proofId: string) {
    setError(null); setProofMsg(null);
    start(async () => {
      const res = await deleteSecondPaymentProof({ proofId });
      if (res.ok) {
        setProofs((prev) => prev.filter((p) => p.id !== proofId));
        router.refresh();
      } else setError(res.error);
    });
  }

  function run() {
    setError(null);
    start(async () => {
      const res = await auditOrder({ orderId, comandaNumber: comanda, paymentStatusId: statusId });
      if (res.ok) { router.refresh(); onProcessed?.(); }
      else setError(res.error);
    });
  }

  // Aprovar exige: comanda + status + CNPJ + pagamento + 2o comprovante.
  // Interromper (estorno/cancela) nao exige esses pre-requisitos.
  const faltaParaAprovar = !cnpjOk || !pagamentoOk || !proof2Ok;
  const aprovarBloqueado = !statusId || !comanda || (!isInterrompe && faltaParaAprovar);

  const pagamentoAlterado = payMethodId !== savedPayMethodId || bankId !== savedBankId;

  return (
    <div className="space-y-3">
      {/* Forma de Pagamento + Banco: realocados de Vendas para o Financeiro. */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Forma de Pagamento</Label>
          <select className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={payMethodId} onChange={(e) => setPayMethodId(e.target.value)}>
            <option value="">Selecione...</option>
            {paymentMethods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Banco</Label>
          <select className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={bankId} onChange={(e) => setBankId(e.target.value)}>
            <option value="">Selecione...</option>
            {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <Button variant="outline" size="sm" onClick={savePayment}
          disabled={pending || !payMethodId || !bankId || !pagamentoAlterado}>
          {pagamentoOk && !pagamentoAlterado ? "Pagamento salvo" : "Salvar pagamento"}
        </Button>
        {payMsg && <span className="text-xs text-motorista">{payMsg}</span>}
      </div>

      {/* Comprovantes do Financeiro (ate 5; ao menos 1 obrigatorio p/ aprovar). */}
      <div className="space-y-1">
        <Label className="text-xs">2º Comprovante de Pagamento (até {MAX_PROOF2})</Label>

        {/* Lista dos comprovantes anexados, cada um com "x" para remover. */}
        {proofs.length > 0 && (
          <ul className="space-y-1">
            {proofs.map((p, i) => (
              <li key={p.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-3 py-1.5 text-xs">
                <a href={p.filePath} target="_blank" rel="noreferrer" className="truncate text-financeiro underline">
                  <span className="font-data mr-2 text-muted-foreground">{i + 1}.</span>
                  Comprovante {i + 1}
                </a>
                <button type="button" onClick={() => removeProof2(p.id)} disabled={pending || proofBusy}
                  className="ml-2 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-background hover:text-destructive disabled:opacity-40"
                  aria-label="Remover comprovante">
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {proof2Total < MAX_PROOF2 && (
          <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            onChange={onProof2File} disabled={proofBusy || pending}
            className="block w-full max-w-xs text-xs text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-financeiro file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-financeiro-fg hover:file:opacity-90" />
        )}
        <p className="text-[11px] text-muted-foreground">{proof2Total}/{MAX_PROOF2} anexados.</p>
        {proofBusy && <span className="text-xs text-muted-foreground">Enviando...</span>}
        {proofMsg && <span className="text-xs text-motorista">{proofMsg}</span>}
      </div>

      {/* Vinculo de CNPJ: deve ser feito ANTES do "Pago". */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label className="text-xs">CNPJ do pedido</Label>
          <select className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={cnpjId} onChange={(e) => setCnpjId(e.target.value)}>
            <option value="">Selecione o CNPJ...</option>
            {cnpjOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.name} — {fmtCnpj(c.document)}</option>
            ))}
          </select>
        </div>
        <Button variant="outline" size="sm" onClick={linkCnpj}
          disabled={pending || !cnpjId || cnpjId === linkedCnpjId}>
          {cnpjId === linkedCnpjId && cnpjOk ? "CNPJ vinculado" : "Vincular CNPJ"}
        </Button>
        {cnpjMsg && <span className="text-xs text-motorista">{cnpjMsg}</span>}
      </div>

      {/* Comanda + status + acao. */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Nº Comanda</Label>
          <Input className="h-9 w-32" value={comanda} onChange={(e) => setComanda(e.target.value)} placeholder="ex: C-501" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Status de Pagamento</Label>
          <select className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={statusId} onChange={(e) => setStatusId(e.target.value)}>
            <option value="">Selecione...</option>
            {statusOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <Button variant="financeiro" size="sm" onClick={run} disabled={pending || aprovarBloqueado}>
          {pending ? "..." : isInterrompe ? "Aplicar (interrompe)" : "Aprovar e liberar"}
        </Button>
      </div>

      {/* Checklist do que ainda falta para poder aprovar. */}
      {!isInterrompe && faltaParaAprovar && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <p className="mb-0.5 font-semibold">Para aprovar, faltam:</p>
          <ul className="list-inside list-disc space-y-0.5">
            {!pagamentoOk && <li>Salvar Forma de Pagamento e Banco</li>}
            {!proof2Ok && <li>Anexar o 2º comprovante de pagamento</li>}
            {!cnpjOk && <li>Vincular um CNPJ</li>}
          </ul>
        </div>
      )}
      {error && <span className="block text-xs text-destructive">{error}</span>}
    </div>
  );
}
