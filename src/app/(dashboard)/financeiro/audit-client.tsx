"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { auditOrder } from "@/lib/actions/finance";
import { linkCnpjToOrder } from "@/lib/actions/cnpj";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface StatusOpt { id: string; name: string; disposition: "APROVA" | "INTERROMPE"; }
interface CnpjOpt { id: string; name: string; document: string; }

export function AuditarPedido({
  orderId,
  statusOptions,
  cnpjOptions,
  currentCnpjId,
}: {
  orderId: string;
  statusOptions: StatusOpt[];
  cnpjOptions: CnpjOpt[];
  currentCnpjId: string | null;
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

  const selected = statusOptions.find((s) => s.id === statusId);
  const isInterrompe = selected?.disposition === "INTERROMPE";
  // Aprovacao (ex.: Pago) so e permitida com CNPJ vinculado.
  const cnpjOk = linkedCnpjId !== "";

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

  function run() {
    setError(null);
    start(async () => {
      const res = await auditOrder({ orderId, comandaNumber: comanda, paymentStatusId: statusId });
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  // Aprovar so habilita com comanda + status + CNPJ vinculado.
  // Interromper (estorno/cancela) nao exige CNPJ.
  const aprovarBloqueado = !statusId || !comanda || (!isInterrompe && !cnpjOk);

  return (
    <div className="space-y-2 border-t pt-2">
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

      {!isInterrompe && !cnpjOk && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Vincule um CNPJ para liberar a aprovacao.
        </p>
      )}
      {error && <span className="block text-xs text-destructive">{error}</span>}
    </div>
  );
}
