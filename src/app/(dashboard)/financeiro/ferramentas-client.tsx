"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  finCreatePaymentMethod, finCreateBank, finCreatePaymentStatus,
  finToggle, finRename, finDelete,
} from "@/lib/actions/finance";
import { cnpjCreate, cnpjUpdate, cnpjToggle, cnpjDelete } from "@/lib/actions/cnpj";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Check, X } from "lucide-react";
import { CrudTable, type CrudRow } from "@/components/shared/crud-table";
import type { PaymentDisposition } from "@prisma/client";

interface Row { id: string; name: string; active: boolean; }
interface StatusRow extends Row { disposition: PaymentDisposition; }
interface CnpjRow { id: string; name: string; document: string; active: boolean; }

type ToolId = "pagamento" | "bancos" | "status" | "cnpj";

export function FinanceiroFerramentas({
  paymentMethods, banks, payStatuses, cnpjs,
}: {
  paymentMethods: Row[];
  banks: Row[];
  payStatuses: StatusRow[];
  cnpjs: CnpjRow[];
}) {
  // Nenhuma ferramenta aberta por padrão: os formulários ficam ocultos
  // e só aparecem ao clicar no respectivo botão (clicar de novo fecha).
  const [open, setOpen] = useState<ToolId | null>(null);

  const tools = [
    { id: "pagamento" as const, label: "Formas de Pagamento" },
    { id: "bancos" as const, label: "Bancos" },
    { id: "status" as const, label: "Status de Pagamento" },
    { id: "cnpj" as const, label: "CNPJ" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-1 text-lg font-semibold">Ferramentas do Financeiro</h2>
        {tools.map((t) => (
          <Button
            key={t.id}
            variant={open === t.id ? "financeiro" : "outline"}
            size="sm"
            onClick={() => setOpen((cur) => (cur === t.id ? null : t.id))}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {open && (
        <Card className="animate-fade-in-up">
          <CardContent className="pt-6">
            {open === "pagamento" && (
              <SimplePanel rows={paymentMethods} label="forma de pagamento" entity="paymentMethod" onCreate={finCreatePaymentMethod} />
            )}
            {open === "bancos" && (
              <SimplePanel rows={banks} label="banco" entity="bank" onCreate={finCreateBank} />
            )}
            {open === "status" && <StatusPanel rows={payStatuses} />}
            {open === "cnpj" && <CnpjPanel rows={cnpjs} />}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SimplePanel({
  rows, label, entity, onCreate,
}: {
  rows: Row[];
  label: string;
  entity: "paymentMethod" | "bank";
  onCreate: (name: string) => Promise<{ ok: boolean; error?: string } | any>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add() {
    setError(null);
    start(async () => {
      const res = await onCreate(name);
      if (res.ok) { setName(""); router.refresh(); } else setError(res.error ?? "Erro");
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input placeholder={`Nova ${label}...`} value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()} />
        <Button variant="financeiro" onClick={add} disabled={pending || !name}>Adicionar</Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <CrudTable
        rows={rows as CrudRow[]}
        onRename={(id, n) => finRename(entity, id, n)}
        onToggle={(id, a) => finToggle(entity, id, a)}
        onDelete={(id) => finDelete(entity, id)}
      />
    </div>
  );
}

function StatusPanel({ rows }: { rows: StatusRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [disposition, setDisposition] = useState<PaymentDisposition>("APROVA");
  const [error, setError] = useState<string | null>(null);

  function add() {
    setError(null);
    start(async () => {
      const res = await finCreatePaymentStatus(name, disposition);
      if (res.ok) { setName(""); router.refresh(); } else setError(res.error ?? "Erro");
    });
  }

  const crudRows: CrudRow[] = rows.map((r) => ({
    id: r.id, name: r.name, active: r.active,
    extra: r.disposition === "APROVA" ? "Aprova" : "Interrompe",
  }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input className="flex-1" placeholder="Nome do status" value={name} onChange={(e) => setName(e.target.value)} />
        <select className="h-10 rounded-lg border border-input bg-background px-2 text-sm"
          value={disposition} onChange={(e) => setDisposition(e.target.value as PaymentDisposition)}>
          <option value="APROVA">Aprova (segue p/ logística)</option>
          <option value="INTERROMPE">Interrompe (estorno/cancela)</option>
        </select>
        <Button variant="financeiro" onClick={add} disabled={pending || !name}>Adicionar</Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <CrudTable
        rows={crudRows}
        extraHeader="Efeito"
        onRename={(id, n) => finRename("paymentStatusOption", id, n)}
        onToggle={(id, a) => finToggle("paymentStatusOption", id, a)}
        onDelete={(id) => finDelete("paymentStatusOption", id)}
      />
    </div>
  );
}

// Formata CNPJ: 00.000.000/0000-00 (apenas para exibir).
function fmtCnpj(doc: string): string {
  const d = (doc || "").replace(/\D/g, "").slice(0, 14);
  if (d.length !== 14) return doc;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

// Painel de CNPJ: cadastro (nome + numero), edicao inline, ativar/desativar, excluir.
function CnpjPanel({ rows }: { rows: CnpjRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [document, setDocument] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Edicao inline.
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDoc, setEditDoc] = useState("");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  function add() {
    setError(null);
    start(async () => {
      const res = await cnpjCreate({ name, document });
      if (res.ok) { setName(""); setDocument(""); router.refresh(); }
      else setError(res.error ?? "Erro");
    });
  }

  function startEdit(r: CnpjRow) {
    setEditId(r.id); setEditName(r.name); setEditDoc(r.document); setError(null);
  }
  function saveEdit(id: string) {
    setError(null);
    start(async () => {
      const res = await cnpjUpdate({ id, name: editName, document: editDoc });
      if (res.ok) { setEditId(null); router.refresh(); } else setError(res.error ?? "Erro");
    });
  }
  function toggle(id: string, active: boolean) {
    start(async () => {
      const res = await cnpjToggle(id, active);
      if (res.ok) router.refresh(); else setError(res.error ?? "Erro");
    });
  }
  function remove(id: string) {
    start(async () => {
      const res = await cnpjDelete(id);
      if (res.ok) { setConfirmDel(null); router.refresh(); } else setError(res.error ?? "Erro");
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input className="flex-1" placeholder="Razao social / nome" value={name}
          onChange={(e) => setName(e.target.value)} />
        <Input className="w-56" placeholder="CNPJ (somente numeros)" value={document}
          onChange={(e) => setDocument(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()} />
        <Button variant="financeiro" onClick={add} disabled={pending || !name || !document}>
          Adicionar
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Nome</th>
              <th className="px-3 py-2">CNPJ</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                {editId === r.id ? (
                  <>
                    <td className="px-3 py-2">
                      <Input className="h-8" value={editName} onChange={(e) => setEditName(e.target.value)} />
                    </td>
                    <td className="px-3 py-2">
                      <Input className="h-8" value={editDoc} onChange={(e) => setEditDoc(e.target.value)} />
                    </td>
                    <td className="px-3 py-2" colSpan={2}>
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="financeiro" onClick={() => saveEdit(r.id)} disabled={pending}>
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2 font-data">{fmtCnpj(r.document)}</td>
                    <td className="px-3 py-2">
                      <Badge className={r.active ? "bg-motorista/15 text-motorista" : "bg-muted text-muted-foreground"}>
                        {r.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => startEdit(r)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => toggle(r.id, !r.active)} disabled={pending}>
                          {r.active ? "Desativar" : "Ativar"}
                        </Button>
                        {confirmDel === r.id ? (
                          <span className="flex items-center gap-1">
                            <Button size="sm" variant="destructive" onClick={() => remove(r.id)} disabled={pending}>
                              Confirmar
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setConfirmDel(null)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </span>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => setConfirmDel(r.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">Nenhum CNPJ cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
