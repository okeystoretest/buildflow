"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Plus, X } from "lucide-react";
import { createCustomer, updateCustomer, deleteCustomer } from "@/lib/actions/sales";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ClienteRow {
  id: string; code: string; name: string;
}

type Draft = Omit<ClienteRow, "id"> & { id?: string };

const empty: Draft = { code: "", name: "" };

export function ClientesManager({ customers }: { customers: ClienteRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Draft>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  function set(k: keyof Draft, v: string) { setDraft((p) => ({ ...p, [k]: v })); }

  function openNew() { setDraft(empty); setEditing(null); setShowForm(true); setMsg(null); }
  function openEdit(c: ClienteRow) { setDraft(c); setEditing(c.id); setShowForm(true); setMsg(null); }
  function cancel() { setShowForm(false); setEditing(null); setDraft(empty); }

  function save() {
    setMsg(null);
    start(async () => {
      const res = editing
        ? await updateCustomer({ ...draft, id: editing })
        : await createCustomer(draft);
      if (res.ok) {
        setMsg({ ok: true, text: editing ? "Cliente atualizado." : "Cliente cadastrado." });
        cancel();
        router.refresh();
      } else setMsg({ ok: false, text: res.error });
    });
  }

  function remove(id: string) {
    start(async () => {
      const res = await deleteCustomer(id);
      if (res.ok) { setConfirmDel(null); router.refresh(); }
      else { setMsg({ ok: false, text: res.error }); setConfirmDel(null); }
    });
  }

  return (
    <div className="space-y-4">
      {!showForm && (
        <Button variant="vendas" onClick={openNew}><Plus className="h-4 w-4" /> Novo cliente</Button>
      )}

      {showForm && (
        <Card className="animate-fade-in-up">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              {editing ? "Editar cliente" : "Novo cliente"}
              <button onClick={cancel} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Código *" value={draft.code} onChange={(v) => set("code", v)} />
              <Field label="Nome *" value={draft.name} onChange={(v) => set("name", v)} />
            </div>
            <div className="flex items-center gap-3">
              <Button variant="vendas" onClick={save} disabled={pending || !draft.name || !draft.code}>
                {pending ? "Salvando..." : editing ? "Salvar alterações" : "Cadastrar"}
              </Button>
              <Button variant="outline" onClick={cancel}>Cancelar</Button>
              {msg && <span className={`text-sm ${msg.ok ? "text-motorista" : "text-destructive"}`}>{msg.text}</span>}
            </div>
          </CardContent>
        </Card>
      )}

      {msg && !showForm && (
        <p className={`text-sm ${msg.ok ? "text-motorista" : "text-destructive"}`}>{msg.text}</p>
      )}

      <Card>
        <CardHeader><CardTitle>Clientes cadastrados</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4">Código</th>
                  <th className="py-2 pr-4">Nome</th>
                  <th className="py-2 pr-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0 transition-colors hover:bg-secondary/50">
                    <td className="py-2 pr-4 font-data">{c.code}</td>
                    <td className="py-2 pr-4 font-medium">{c.name}</td>
                    <td className="py-2 pr-4">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(c)} aria-label="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {confirmDel === c.id ? (
                          <span className="flex items-center gap-1">
                            <Button variant="destructive" size="sm" onClick={() => remove(c.id)} disabled={pending}>Confirmar</Button>
                            <Button variant="ghost" size="sm" onClick={() => setConfirmDel(null)}>Não</Button>
                          </span>
                        ) : (
                          <Button variant="ghost" size="icon" onClick={() => setConfirmDel(c.id)} aria-label="Excluir">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {customers.length === 0 && (
                  <tr><td colSpan={3} className="py-6 text-center text-muted-foreground">Nenhum cliente cadastrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
