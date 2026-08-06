"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Plus, X } from "lucide-react";
import { createExcursao, updateExcursao, deleteExcursao } from "@/lib/actions/sales";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ExcursaoRow {
  id: string;
  name: string;
  address: string;
  cutoffTime: string;
  operatingDays: string;
  notes: string;
}

type Draft = Omit<ExcursaoRow, "id"> & { id?: string };

const empty: Draft = { name: "", address: "", cutoffTime: "", operatingDays: "", notes: "" };

export function ExcursoesManager({ excursoes }: { excursoes: ExcursaoRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Draft>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  // A busca acontece no SERVIDOR (via <SearchBox> ?q= na URL) e esta lista já
  // chega filtrada e paginada — não filtramos no navegador.

  function set(k: keyof Draft, v: string) { setDraft((p) => ({ ...p, [k]: v })); }

  function openNew() { setDraft(empty); setEditing(null); setShowForm(true); setMsg(null); }
  function openEdit(e: ExcursaoRow) { setDraft(e); setEditing(e.id); setShowForm(true); setMsg(null); }
  function cancel() { setShowForm(false); setEditing(null); setDraft(empty); }

  function save() {
    setMsg(null);
    start(async () => {
      const res = editing
        ? await updateExcursao({ ...draft, id: editing })
        : await createExcursao(draft);
      if (res.ok) {
        setMsg({ ok: true, text: editing ? "Excursão atualizada." : "Excursão cadastrada." });
        cancel();
        router.refresh();
      } else setMsg({ ok: false, text: res.error });
    });
  }

  function remove(id: string) {
    start(async () => {
      const res = await deleteExcursao(id);
      if (res.ok) { setConfirmDel(null); router.refresh(); }
      else { setMsg({ ok: false, text: res.error }); setConfirmDel(null); }
    });
  }

  return (
    <div className="space-y-4">
      {!showForm && (
        <Button variant="vendas" onClick={openNew}><Plus className="h-4 w-4" /> Nova excursão</Button>
      )}

      {showForm && (
        <Card className="animate-fade-in-up">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              {editing ? "Editar excursão" : "Nova excursão"}
              <button onClick={cancel} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Nome da Excursão *" value={draft.name} onChange={(v) => set("name", v)} />
              <Field label="Endereço *" value={draft.address} onChange={(v) => set("address", v)} />
              <Field label='Funciona até às (horário limite)' value={draft.cutoffTime} onChange={(v) => set("cutoffTime", v)} placeholder="ex: 18:00" />
              <Field label="Dias de Funcionamento" value={draft.operatingDays} onChange={(v) => set("operatingDays", v)} placeholder="ex: Seg a Sex" />
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Input value={draft.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Informações adicionais..." />
            </div>
            <div className="flex items-center gap-3">
              <Button variant="vendas" onClick={save} disabled={pending || !draft.name.trim() || !draft.address.trim()}>
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
        <CardHeader>
          <CardTitle>Excursões cadastradas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4">Nome</th>
                  <th className="py-2 pr-4">Endereço</th>
                  <th className="py-2 pr-4">Funciona até</th>
                  <th className="py-2 pr-4">Dias</th>
                  <th className="py-2 pr-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {excursoes.map((e) => (
                  <tr key={e.id} className="border-b border-border last:border-0 transition-colors hover:bg-secondary/50">
                    <td className="py-2 pr-4 font-medium">{e.name}</td>
                    <td className="py-2 pr-4">{e.address}</td>
                    <td className="py-2 pr-4 font-data">{e.cutoffTime || "—"}</td>
                    <td className="py-2 pr-4">{e.operatingDays || "—"}</td>
                    <td className="py-2 pr-4">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(e)} aria-label="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {confirmDel === e.id ? (
                          <span className="flex items-center gap-1">
                            <Button variant="destructive" size="sm" onClick={() => remove(e.id)} disabled={pending}>Confirmar</Button>
                            <Button variant="ghost" size="sm" onClick={() => setConfirmDel(null)}>Não</Button>
                          </span>
                        ) : (
                          <Button variant="ghost" size="icon" onClick={() => setConfirmDel(e.id)} aria-label="Excluir">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {excursoes.length === 0 && (
                  <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">
                    Nenhuma excursão cadastrada.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
