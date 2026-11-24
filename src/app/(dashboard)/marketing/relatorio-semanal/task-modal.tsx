"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/shared/modal";
import { salvarTarefa } from "@/lib/actions/relatorio-semanal";
import {
  TASK_CATEGORIES,
  type MarketingTaskItem,
  type TaskPerson,
} from "@/lib/relatorio-semanal-math";
import { TASK_CATEGORY_LABEL, TASK_PRIORITY_LABEL } from "@/lib/relatorio-semanal-labels";

const PRIORIDADES = ["ALTA", "MEDIA", "BAIXA"] as const;

/**
 * O cartão novo, e a edição de um existente.
 *
 * O STATUS NÃO ESTÁ AQUI de propósito: mover é trabalho do quadro (arrastando
 * ou com as setas). Um seletor de status neste formulário seria uma segunda
 * porta para a mesma ação — e a que não confere a regra da evidência.
 *
 * O CÓDIGO ("K-13") também não: ele sai do maior existente, no servidor. É
 * como a tarefa é citada na reunião, e deixar digitar abriria a porta para
 * dois cartões com o mesmo nome na ata.
 */
export function TaskModal({
  task,
  people,
  onClose,
}: {
  /** Ausente = cartão novo. */
  task?: MarketingTaskItem;
  people: readonly TaskPerson[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(task?.title ?? "");
  const [category, setCategory] = useState<MarketingTaskItem["category"]>(task?.category ?? "CONTEUDO");
  const [priority, setPriority] = useState<MarketingTaskItem["priority"]>(task?.priority ?? "MEDIA");
  const [assigneeId, setAssigneeId] = useState(task?.assignee?.id ?? "");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [evidence, setEvidence] = useState(task?.evidence ?? "");
  const [note, setNote] = useState(task?.note ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (salvando) return;
    setSalvando(true);
    setErro(null);
    const r = await salvarTarefa({
      taskId: task?.id,
      title,
      category,
      priority,
      assigneeId: assigneeId || null,
      dueDate: dueDate || null,
      evidence: evidence || null,
      note: note || null,
    });
    setSalvando(false);
    if (!r.ok) {
      setErro(r.error);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <Modal onClose={() => !salvando && onClose()} largura="max-w-lg">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground">
            {task ? `Editar ${task.code}` : "Nova tarefa"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {task ? "O cartão continua na coluna em que está." : "O cartão nasce em Brainstorm, onde a ideia começa."}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} disabled={salvando} aria-label="Fechar">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="tarefa-titulo">Tarefa</Label>
          <Input id="tarefa-titulo" value={title} placeholder="O que precisa ser feito"
            onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="tarefa-categoria">Categoria</Label>
            <Select
              id="tarefa-categoria"
              value={category}
              onChange={(e) => setCategory(e.target.value as MarketingTaskItem["category"])}
              options={TASK_CATEGORIES.map((c) => ({ value: c, label: TASK_CATEGORY_LABEL[c] }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tarefa-prioridade">Prioridade</Label>
            <Select
              id="tarefa-prioridade"
              value={priority}
              onChange={(e) => setPriority(e.target.value as MarketingTaskItem["priority"])}
              options={PRIORIDADES.map((p) => ({ value: p, label: TASK_PRIORITY_LABEL[p] }))}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="tarefa-responsavel">Responsável</Label>
            {/* O id vai para o servidor, que confere se a pessoa está ativa —
                a lista que a tela mostrou não é prova de nada. */}
            <Select
              id="tarefa-responsavel"
              value={assigneeId}
              placeholder="Sem responsável"
              onChange={(e) => setAssigneeId(e.target.value)}
              options={people.map((p) => ({ value: p.id, label: p.name }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tarefa-prazo">Prazo</Label>
            <Input id="tarefa-prazo" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tarefa-evidencia">Evidência</Label>
          <Input id="tarefa-evidencia" value={evidence} placeholder="link da publicação"
            onChange={(e) => setEvidence(e.target.value)} />
          <p className="text-[11px] text-muted-foreground">
            Sem evidência o cartão não chega a Publicado.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tarefa-observacao">Observação</Label>
          <Textarea id="tarefa-observacao" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>

      {erro && <p className="mt-3 text-xs text-destructive">{erro}</p>}

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={salvando}>
          Cancelar
        </Button>
        <Button onClick={salvar} disabled={salvando || !title.trim()}>
          {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
          Salvar
        </Button>
      </div>
    </Modal>
  );
}
