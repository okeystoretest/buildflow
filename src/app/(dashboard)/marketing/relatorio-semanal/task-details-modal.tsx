"use client";

import { CalendarClock, CalendarDays, Clock, ExternalLink, MoveRight, Pencil, Trash2, User as UserIcon, X } from "lucide-react";
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
import {
  TASK_STATUSES,
  type MarketingTaskItem,
  type MarketingTaskStatus,
} from "@/lib/relatorio-semanal-math";

/**
 * Tudo que se sabe sobre um cartão, ao clicar nele.
 *
 * E O UNICO JEITO DE MOVER UM CARTAO EM TELA DE TOQUE. A lista "Mover para"
 * tinha saido daqui por ser uma segunda porta para a mesma acao — arrastar, ou
 * ← e → sobre o cartao em foco. Ela voltou em 25/11/2026 porque NO TOQUE NAO
 * EXISTE A PRIMEIRA PORTA: o drag-and-drop nativo do HTML nao cobre toque e um
 * telefone nao tem setas. Sem esta lista, num celular nao havia como mover
 * cartao nenhum.
 *
 * Ela volta para TODO MUNDO, e nao atras de `pointer: coarse`: essa consulta
 * mente em notebook com tela sensivel e em tablet com teclado, e esconder
 * controle por palpite de aparelho e o mesmo defeito que a gaveta do menu
 * custou em 849f152. De quebra ela torna visivel o atalho de teclado, que
 * ninguem descobre sozinho.
 *
 * Mover FECHA a ficha, de proposito: o cartao mudando de coluna e a resposta, e
 * a recusa ("nada chega a Publicado sem evidencia") aparece no aviso do quadro,
 * que a ficha aberta cobriria.
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
  onMove,
}: {
  task: MarketingTaskItem;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (destino: MarketingTaskStatus) => void;
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

      <div className="mt-4">
        <Campo icone={<MoveRight className="h-3 w-3" />} rotulo="Mover para">
          <div className="flex flex-wrap gap-2">
            {TASK_STATUSES.filter((s) => s !== task.status).map((s) => (
              <Button key={s} variant="outline" size="sm" onClick={() => onMove(s)}>
                {TASK_STATUS_LABEL[s]}
              </Button>
            ))}
          </div>
        </Campo>
      </div>

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
