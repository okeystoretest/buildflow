"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Clock, Tag, Pencil, Trash2, ChevronLeft, ChevronRight, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type TaskStatus = "A_FAZER" | "FAZENDO" | "CONCLUIDA";

export interface TaskCard {
  id: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  category: string | null;
  notes: string | null;
  status: TaskStatus;
  ownerName: string | null; // preenchido só para a Gestão
}

// Colunas do quadro (ordem e rótulos). Cores por etapa.
const COLUMNS: { status: TaskStatus; label: string; header: string; dot: string }[] = [
  { status: "A_FAZER",   label: "A Fazer",   header: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/40", dot: "bg-slate-500" },
  { status: "FAZENDO",   label: "Fazendo",   header: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40", dot: "bg-amber-500" },
  { status: "CONCLUIDA", label: "Concluída", header: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40", dot: "bg-emerald-500" },
];

const ORDER: TaskStatus[] = ["A_FAZER", "FAZENDO", "CONCLUIDA"];

interface FormState {
  id?: string;
  title: string;
  startTime: string;
  endTime: string;
  category: string;
  notes: string;
}

const EMPTY_FORM: FormState = { title: "", startTime: "", endTime: "", category: "", notes: "" };

export function TasksBoard({ cards, canManage }: { cards: TaskCard[]; canManage?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const byStatus = useMemo(() => {
    const map: Record<TaskStatus, TaskCard[]> = { A_FAZER: [], FAZENDO: [], CONCLUIDA: [] };
    for (const c of cards) map[c.status].push(c);
    return map;
  }, [cards]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setError(null);
    setFormOpen(true);
  }

  function openEdit(card: TaskCard) {
    setForm({
      id: card.id,
      title: card.title,
      startTime: card.startTime ?? "",
      endTime: card.endTime ?? "",
      category: card.category ?? "",
      notes: card.notes ?? "",
    });
    setError(null);
    setFormOpen(true);
  }

  function submitForm() {
    setError(null);
    if (!form.title.trim()) { setError("Informe o título da tarefa."); return; }
    start(async () => {
      const mod = await import("@/lib/actions/tasks");
      const payload = {
        title: form.title,
        startTime: form.startTime,
        endTime: form.endTime,
        category: form.category,
        notes: form.notes,
      };
      const res = form.id
        ? await mod.updateTask({ ...payload, id: form.id })
        : await mod.createTask(payload);
      if (res.ok) { setFormOpen(false); setForm(EMPTY_FORM); router.refresh(); }
      else setError(res.error);
    });
  }

  function move(card: TaskCard, dir: -1 | 1) {
    const idx = ORDER.indexOf(card.status);
    const next = ORDER[idx + dir];
    if (!next) return;
    setError(null);
    start(async () => {
      const mod = await import("@/lib/actions/tasks");
      const res = await mod.moveTask({ id: card.id, status: next });
      if (res.ok) router.refresh(); else setError(res.error);
    });
  }

  function remove(card: TaskCard) {
    setError(null);
    start(async () => {
      const mod = await import("@/lib/actions/tasks");
      const res = await mod.deleteTask(card.id);
      if (res.ok) router.refresh(); else setError(res.error);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {cards.length} {cards.length === 1 ? "tarefa" : "tarefas"} no total
        </p>
        <Button variant="vendas" size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Nova tarefa
        </Button>
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {COLUMNS.map((col) => {
          const list = byStatus[col.status];
          return (
            <div key={col.status} className="flex flex-col">
              <div className={`mb-2 flex items-center justify-between rounded-lg border px-2.5 py-1.5 ${col.header}`}>
                <span className="flex items-center gap-1.5 text-xs font-semibold">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${col.dot}`} />
                  {col.label}
                </span>
                <span className="font-data rounded-full bg-background/60 px-1.5 text-[11px]">{list.length}</span>
              </div>

              <div className="flex flex-col gap-2">
                {list.map((card) => (
                  <TaskItem
                    key={card.id}
                    card={card}
                    canManage={canManage}
                    pending={pending}
                    onEdit={() => openEdit(card)}
                    onDelete={() => remove(card)}
                    onLeft={col.status !== "A_FAZER" ? () => move(card, -1) : undefined}
                    onRight={col.status !== "CONCLUIDA" ? () => move(card, 1) : undefined}
                  />
                ))}
                {list.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border/50 py-6 text-center text-[11px] text-muted-foreground/50">
                    Nenhuma tarefa
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {formOpen && (
        <Modal onClose={() => setFormOpen(false)}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">{form.id ? "Editar tarefa" : "Nova tarefa"}</h2>
            <button onClick={() => setFormOpen(false)} className="text-2xl leading-none text-muted-foreground">×</button>
          </div>

          <div className="space-y-3">
            <Field label="Título">
              <Input placeholder="Ex: Ligar para cliente X"
                value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Horário de início">
                <Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
              </Field>
              <Field label="Horário de fim">
                <Input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
              </Field>
            </div>

            <Field label="Categoria">
              <Input placeholder="Ex: Ligação, Visita, Pós-venda..."
                value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </Field>

            <Field label="Observações">
              <textarea
                className="min-h-[80px] w-full rounded-lg border border-input bg-background p-3 text-sm"
                placeholder="Detalhes da tarefa (opcional)..."
                value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setFormOpen(false)} disabled={pending}>Cancelar</Button>
              <Button variant="vendas" onClick={submitForm} disabled={pending || !form.title.trim()}>
                {pending ? "Salvando..." : form.id ? "Salvar" : "Criar tarefa"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function TaskItem({
  card, canManage, pending, onEdit, onDelete, onLeft, onRight,
}: {
  card: TaskCard;
  canManage?: boolean;
  pending: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onLeft?: () => void;
  onRight?: () => void;
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  const horario = card.startTime || card.endTime
    ? `${card.startTime ?? "?"}${card.endTime ? ` – ${card.endTime}` : ""}`
    : null;

  return (
    <div className="card-hover rounded-xl border border-border bg-card p-3 shadow-sm animate-fade-in-up">
      <div className="mb-1 flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-snug">{card.title}</p>
        {canManage && (
          <div className="flex shrink-0 gap-1">
            <button onClick={onEdit} disabled={pending} title="Editar"
              className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setConfirmDel(true)} disabled={pending} title="Excluir"
              className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        {horario && (
          <p className="flex items-center gap-1.5"><Clock className="h-3 w-3 shrink-0" /> {horario}</p>
        )}
        {card.category && (
          <p className="flex items-center gap-1.5">
            <Tag className="h-3 w-3 shrink-0" />
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-foreground/70">{card.category}</span>
          </p>
        )}
        {card.notes && <p className="whitespace-pre-wrap leading-snug">{card.notes}</p>}
        {card.ownerName && (
          <p className="pt-0.5 text-[10px] italic text-muted-foreground/70">por {card.ownerName}</p>
        )}
      </div>

      {canManage && (
        <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-2">
          <button onClick={onLeft} disabled={pending || !onLeft} title="Voltar etapa"
            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary disabled:opacity-30">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={onRight} disabled={pending || !onRight} title="Avançar etapa"
            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-vendas/15 text-vendas hover:bg-vendas/25 disabled:opacity-30">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {confirmDel && (
        <Modal onClose={() => setConfirmDel(false)}>
          <div className="mb-2 flex items-center gap-2">
            <X className="h-5 w-5 text-destructive" />
            <h2 className="text-lg font-bold">Excluir tarefa?</h2>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            &quot;{card.title}&quot; será removida. Esta ação não pode ser desfeita.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmDel(false)} disabled={pending}>Cancelar</Button>
            <Button variant="destructive" onClick={() => { setConfirmDel(false); onDelete(); }} disabled={pending}>Excluir</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-foreground">{label}</label>
      {children}
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
