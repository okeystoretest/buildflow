"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export interface CrudRow {
  id: string;
  name: string;
  active: boolean;
  extra?: string; // coluna extra opcional (ex: efeito do status)
}

// Tabela generica com renomear (inline), ativar/desativar e excluir.
export function CrudTable({
  rows,
  onRename,
  onToggle,
  onDelete,
  extraHeader,
}: {
  rows: CrudRow[];
  onRename: (id: string, name: string) => Promise<{ ok: boolean; error?: string }>;
  onToggle: (id: string, active: boolean) => Promise<{ ok: boolean; error?: string }>;
  onDelete: (id: string) => Promise<{ ok: boolean; error?: string }>;
  extraHeader?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function startEdit(r: CrudRow) { setEditId(r.id); setEditName(r.name); setError(null); }
  function cancelEdit() { setEditId(null); setEditName(""); }

  function saveEdit(id: string) {
    setError(null);
    start(async () => {
      const res = await onRename(id, editName);
      if (res.ok) { cancelEdit(); router.refresh(); } else setError(res.error ?? "Erro");
    });
  }
  function toggle(id: string, active: boolean) {
    start(async () => { await onToggle(id, !active); router.refresh(); });
  }
  function del(id: string) {
    setError(null);
    start(async () => {
      const res = await onDelete(id);
      if (res.ok) { setConfirmDel(null); router.refresh(); }
      else { setError(res.error ?? "Erro"); setConfirmDel(null); }
    });
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <table className="w-full text-sm">
        <thead className="border-b border-border text-left text-muted-foreground">
          <tr>
            <th className="py-2 pr-4">Nome</th>
            {extraHeader && <th className="py-2 pr-4">{extraHeader}</th>}
            <th className="py-2 pr-4">Ativo</th>
            <th className="py-2 pr-4 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border last:border-0 transition-colors hover:bg-secondary/50">
              <td className="py-2 pr-4">
                {editId === r.id ? (
                  <Input className="h-8 max-w-xs" value={editName} onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveEdit(r.id)} autoFocus />
                ) : (
                  <span className="font-medium">{r.name}</span>
                )}
              </td>
              {extraHeader && <td className="py-2 pr-4">{r.extra}</td>}
              <td className="py-2 pr-4">
                {r.active ? <Badge variant="motorista">Sim</Badge> : <Badge variant="secondary">Não</Badge>}
              </td>
              <td className="py-2 pr-4">
                <div className="flex justify-end gap-1">
                  {editId === r.id ? (
                    <>
                      <Button variant="ghost" size="icon" onClick={() => saveEdit(r.id)} disabled={pending} aria-label="Salvar"><Check className="h-4 w-4 text-motorista" /></Button>
                      <Button variant="ghost" size="icon" onClick={cancelEdit} aria-label="Cancelar"><X className="h-4 w-4" /></Button>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" size="icon" onClick={() => startEdit(r)} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>
                      <Button variant="outline" size="sm" onClick={() => toggle(r.id, r.active)} disabled={pending}>
                        {r.active ? "Desativar" : "Ativar"}
                      </Button>
                      {confirmDel === r.id ? (
                        <span className="flex items-center gap-1">
                          <Button variant="destructive" size="sm" onClick={() => del(r.id)} disabled={pending}>Confirmar</Button>
                          <Button variant="ghost" size="sm" onClick={() => setConfirmDel(null)}>Não</Button>
                        </span>
                      ) : (
                        <Button variant="ghost" size="icon" onClick={() => setConfirmDel(r.id)} aria-label="Excluir"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      )}
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={extraHeader ? 4 : 3} className="py-4 text-center text-muted-foreground">Nenhum registro.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
