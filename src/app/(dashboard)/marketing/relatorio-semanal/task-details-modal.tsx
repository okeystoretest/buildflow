"use client";

import { CalendarClock, CalendarDays, Clock, ExternalLink, Pencil, Trash2, User as UserIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/shared/modal";
import {
  TASK_CATEGORY_COLOR,
  TASK_CATEGORY_LABEL,
  TASK_PRIORITY_LABEL,
  TASK_STATUS_COLOR,
  TASK_STATUS_LABEL,
  evidenciaEhImagem,
  formatarData,
  formatarDataHora,
} from "@/lib/relatorio-semanal-labels";
import type { MarketingTaskItem } from "@/lib/relatorio-semanal-math";

/**
 * Tudo que se sabe sobre um cartão, ao clicar nele.
 *
 * AQUI SÓ SE LÊ. Mover o cartão é trabalho do quadro — arrastando, ou com as
 * setas do teclado sobre o cartão em foco. A lista "Mover para" que morava
 * aqui saiu: duas portas para a mesma ação, e a ficha é onde se confere a
 * atividade, não onde se opera o quadro.
 */

/** Caixa de campo: rótulo minúsculo com ícone, conteúdo embaixo. */
function Campo({
  icone,
  rotulo,
  children,
}: {
  icone: React.ReactNode;
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-secondary p-3">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icone}
        {rotulo}
      </p>
      <div className="mt-1.5 text-sm text-foreground">{children}</div>
    </div>
  );
}

export function TaskDetailsModal({
  task,
  onClose,
  onEdit,
  onDelete,
}: {
  task: MarketingTaskItem;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Modal onClose={onClose} largura="max-w-lg">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Detalhes da atividade · <span className="font-mono">{task.code}</span>
          </p>
          <h2 className="mt-1 break-words text-lg font-semibold text-foreground">{task.title}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* A cor do status vem de um hex fixo: vale nos dois temas, e o nome
              está escrito ao lado — a cor nunca viaja sozinha. */}
          <span
            className="inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            style={{
              backgroundColor: `${TASK_STATUS_COLOR[task.status]}1f`,
              borderColor: `${TASK_STATUS_COLOR[task.status]}59`,
              color: TASK_STATUS_COLOR[task.status],
            }}
          >
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: TASK_STATUS_COLOR[task.status] }} />
            {TASK_STATUS_LABEL[task.status]}
          </span>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className="rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{
            backgroundColor: `${TASK_CATEGORY_COLOR[task.category]}26`,
            borderColor: `${TASK_CATEGORY_COLOR[task.category]}59`,
            color: TASK_CATEGORY_COLOR[task.category],
          }}
        >
          {TASK_CATEGORY_LABEL[task.category]}
        </span>
        <span
          className={cn(
            "rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            task.priority === "ALTA"
              ? "border-red-500/35 bg-red-500/15 text-red-700 dark:text-red-300"
              : task.priority === "MEDIA"
                ? "border-amber-500/35 bg-amber-500/15 text-amber-700 dark:text-amber-300"
                : "border-border bg-muted text-muted-foreground",
          )}
        >
          {TASK_PRIORITY_LABEL[task.priority]}
        </span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Campo icone={<UserIcon className="h-3 w-3" />} rotulo="Responsável">
          {task.assignee ? (
            <span className="flex items-center gap-2">
              <Avatar name={task.assignee.name} size="h-6 w-6" textSize="text-[10px]" />
              {task.assignee.name}
            </span>
          ) : (
            <span className="text-muted-foreground">Sem responsável</span>
          )}
        </Campo>

        <Campo icone={<CalendarClock className="h-3 w-3" />} rotulo="Prazo">
          {task.dueDate ? (
            <span className={task.overdue ? "font-semibold text-destructive" : undefined}>
              {task.overdue && "atrasado · "}
              {formatarData(task.dueDate)}
            </span>
          ) : (
            <span className="text-muted-foreground">Sem prazo</span>
          )}
        </Campo>

        <Campo icone={<CalendarDays className="h-3 w-3" />} rotulo="Entrou no quadro">
          {formatarData(task.enteredAt)}
        </Campo>

        <Campo icone={<Clock className="h-3 w-3" />} rotulo="Publicado em">
          {task.doneAt ? formatarDataHora(task.doneAt) : <span className="text-muted-foreground">—</span>}
        </Campo>
      </div>

      {task.evidence && (
        <div className="mt-2">
          <Campo icone={<ExternalLink className="h-3 w-3" />} rotulo="Evidência">
            {evidenciaEhImagem(task.evidence) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={task.evidence} alt="Evidência da tarefa" className="max-h-48 rounded-lg border border-border" />
            ) : (
              <a
                href={task.evidence}
                target="_blank"
                rel="noreferrer"
                className="break-all text-primary underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                {task.evidence}
              </a>
            )}
          </Campo>
        </div>
      )}

      {task.note && (
        <div className="mt-2">
          <Campo icone={<Pencil className="h-3 w-3" />} rotulo="Observação">
            <p className="whitespace-pre-wrap">{task.note}</p>
          </Campo>
        </div>
      )}

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" className="text-destructive" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
          Excluir
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Fechar
        </Button>
        <Button onClick={onEdit}>
          <Pencil className="h-4 w-4" />
          Editar
        </Button>
      </div>
    </Modal>
  );
}
