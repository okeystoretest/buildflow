"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Image as ImageIcon, Inbox, Link2, Loader2, Plus, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/shared/modal";
import { KpiNumero } from "@/components/shared/kpi-numero";
import { excluirTarefa, moverTarefa } from "@/lib/actions/relatorio-semanal";
import {
  TASK_STATUSES,
  type KanbanSummary,
  type MarketingTaskItem,
  type MarketingTaskStatus,
  type TaskPerson,
} from "@/lib/relatorio-semanal-math";
import {
  TASK_CATEGORY_COLOR,
  TASK_CATEGORY_LABEL,
  TASK_PRIORITY_LABEL,
  TASK_STATUS_COLOR,
  TASK_STATUS_LABEL,
  evidenciaEhImagem,
  formatarDiaMes,
} from "@/lib/relatorio-semanal-labels";
import { TaskModal } from "./task-modal";
import { TaskDetailsModal } from "./task-details-modal";

/**
 * O quadro das abas 7 e 8 da planilha.
 *
 * A COR MARCA O STATUS, não a categoria: a coluna já diz o status pela
 * posição, e a cor reforça a mesma leitura em vez de competir com ela.
 *
 * ARRASTAR move o cartão — drag-and-drop NATIVO do HTML, sem biblioteca: o
 * navegador já faz isso há vinte anos, e uma dependência aqui pagaria por
 * recursos que este quadro não usa (reordenar dentro da coluna, animação de
 * deslocamento, arrasto em toque).
 *
 * Arrastar é mouse. O caminho de quem usa TECLADO é o cartão em foco com ← e
 * →, e o clique abre a ficha. Por isso o cartão não tem botões próprios: eles
 * viviam num alvo de 20px dentro de um cartão que agora inteiro é clicável.
 *
 * E O CAMINHO DO TOQUE é a lista "Mover para" da ficha — nem arrasto nativo nem
 * seta existem num telefone. Ver o cabeçalho de `task-details-modal.tsx`.
 */

/** Selo minúsculo do cartão. */
function Selo({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <span style={style} className={cn("rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-none", className)}>
      {children}
    </span>
  );
}

/** Prioridade: a cor acompanha a palavra, nunca a substitui. */
const PRIORITY_BADGE: Record<MarketingTaskItem["priority"], string> = {
  ALTA: "border-red-500/35 bg-red-500/15 text-red-700 dark:text-red-300",
  MEDIA: "border-amber-500/35 bg-amber-500/15 text-amber-700 dark:text-amber-300",
  BAIXA: "border-border bg-muted text-muted-foreground",
};

/**
 * O número do topo do quadro mora em `shared/kpi-numero.tsx` desde
 * 27/11/2026: o quadro do Acompanhamento usa os mesmos quadrinhos, e duas
 * cópias divergiriam no primeiro ajuste de tom.
 */
const Numero = KpiNumero;

export function KanbanBoard({
  tasks,
  summary,
  people,
}: {
  tasks: readonly MarketingTaskItem[];
  summary: KanbanSummary;
  people: readonly TaskPerson[];
}) {
  const router = useRouter();
  const [novo, setNovo] = useState(false);
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [editando, setEditando] = useState<MarketingTaskItem | null>(null);
  const [excluindo, setExcluindo] = useState<MarketingTaskItem | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<MarketingTaskStatus | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  /**
   * Cartão que acabou de mudar de coluna PELO TECLADO.
   *
   * Ele é destruído e recriado dentro da coluna nova, e sem isto o foco cairia
   * no corpo da página a cada seta — a seta seguinte rolaria a página em vez
   * de mover o cartão. Em `ref`, e não em estado, porque reposicionar o foco
   * não é motivo para redesenhar o quadro.
   */
  const foco = useRef<string | null>(null);

  // A lista nova chega pelo `router.refresh()`, DEPOIS do commit em que o
  // cartão sai de uma coluna e nasce na outra; por isso o foco é devolvido
  // aqui, a cada troca de `tasks`.
  useEffect(() => {
    if (!foco.current) return;
    document.querySelector<HTMLElement>(`[data-cartao="${foco.current}"]`)?.focus();
  }, [tasks]);

  // O cartão aberto é BUSCADO na lista, não guardado em estado: assim ele
  // reflete o refresh depois de uma edição, em vez de mostrar a versão
  // congelada no momento do clique.
  const aberto = tasks.find((t) => t.id === abertoId) ?? null;

  const contagemDe = (status: MarketingTaskStatus) =>
    summary.byStatus.find((l) => l.status === status)?.count ?? 0;

  async function mover(taskId: string, status: MarketingTaskStatus) {
    if (ocupado) return;
    setOcupado(taskId);
    setErro(null);
    const r = await moverTarefa({ taskId, status });
    setOcupado(null);
    if (!r.ok) {
      setErro(r.error);
      return;
    }
    router.refresh();
  }

  async function remover() {
    if (!excluindo || ocupado) return;
    setOcupado(excluindo.id);
    setErro(null);
    const r = await excluirTarefa({ taskId: excluindo.id });
    setOcupado(null);
    if (!r.ok) {
      setErro(r.error);
      return;
    }
    setExcluindo(null);
    setAbertoId(null);
    router.refresh();
  }

  function soltarNaColuna(status: MarketingTaskStatus, e: React.DragEvent) {
    e.preventDefault();
    setAlvo(null);
    setArrastando(null);
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    const task = tasks.find((t) => t.id === id);
    if (!task || task.status === status) return;
    void mover(id, status);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Arraste os cartões da esquerda para a direita conforme a tarefa avança, ou clique para ver
          a ficha — que também move o cartão, e é o caminho no celular. Com o cartão em foco, ← e →
          movem entre as colunas. Nada chega a Publicado sem evidência.
        </p>
        <Button size="sm" onClick={() => setNovo(true)}>
          <Plus className="h-3.5 w-3.5" />
          Nova tarefa
        </Button>
      </div>

      {/* Os números ACIMA do quadro: quem abre o Kanban na sexta quer o total
          e o atraso antes de olhar cartão por cartão. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Numero rotulo="Total de tarefas" valor={summary.total} />
        <Numero rotulo="Em andamento" valor={contagemDe("EM_ANDAMENTO")} />
        <Numero rotulo="Em revisão" valor={contagemDe("REVISAO")} />
        <Numero rotulo="Publicadas" valor={summary.published} destaque="ok" />
        <Numero rotulo="Atrasadas" valor={summary.overdue} destaque="alerta" />
      </div>

      {erro && <p className="text-xs text-destructive">{erro}</p>}

      <div className="kanban-scroll overflow-x-auto rounded-xl border border-border bg-card">
        {/* A partir de `lg` as cinco colunas DIVIDEM a largura disponível, e
            não há barra horizontal. Abaixo disso voltam à largura fixa e o
            quadro rola de lado: cinco colunas num telefone não caberiam sem
            virar cinco tiras ilegíveis. */}
        <div className="flex min-w-max divide-x divide-border lg:min-w-0">
          {TASK_STATUSES.map((status) => {
            const coluna = tasks.filter((t) => t.status === status);
            const recebendo = alvo === status;
            return (
              <section
                key={status}
                aria-label={TASK_STATUS_LABEL[status]}
                className={cn(
                  "w-[248px] shrink-0 transition-colors lg:w-auto lg:min-w-0 lg:flex-1",
                  recebendo && "bg-primary/[0.07]",
                )}
                onDragOver={(e) => {
                  if (!arrastando) return;
                  // Sem o preventDefault o navegador RECUSA a soltura: o
                  // padrão de toda área da página é "aqui não se solta".
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setAlvo(status);
                }}
                onDragLeave={(e) => {
                  // Só limpa ao sair da COLUNA: passar por cima de um cartão
                  // filho dispara dragleave e piscaria o destaque.
                  if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                  setAlvo((atual) => (atual === status ? null : atual));
                }}
                onDrop={(e) => soltarNaColuna(status, e)}
              >
                <header
                  className={cn(
                    "flex items-center gap-1.5 border-b border-border px-2.5 py-2 transition-colors",
                    recebendo ? "bg-primary/10" : "bg-secondary",
                  )}
                >
                  <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: TASK_STATUS_COLOR[status] }} />
                  <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {TASK_STATUS_LABEL[status]}
                  </h4>
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-md bg-muted px-1 text-[11px] font-semibold text-muted-foreground">
                    {coluna.length}
                  </span>
                </header>

                {/* Cinco cartões e a coluna para de crescer — o resto rola
                    dentro dela. Altura fixa porque o CSS não sabe contar
                    filhos.
                    shortcut: cartão muito mais alto que o normal (título de
                    duas linhas, prazo e evidência) mostra 4 em vez de 5; se o
                    cartão mudar de forma, refazer a conta. */}
                <div className="kanban-scroll max-h-[600px] min-h-[120px] space-y-2 overflow-y-auto p-2">
                  {coluna.length === 0 ? (
                    <div
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-lg border border-dashed px-2 py-6 text-center transition-colors",
                        recebendo ? "border-primary/50" : "border-border",
                      )}
                    >
                      <Inbox className="h-5 w-5 text-muted-foreground/60" aria-hidden />
                      <p className="text-[11px] leading-tight text-muted-foreground">
                        {recebendo ? "Solte aqui" : `Nenhuma tarefa em ${TASK_STATUS_LABEL[status].toLowerCase()}`}
                      </p>
                    </div>
                  ) : (
                    coluna.map((task) => (
                      <article
                        key={task.id}
                        /* Div com papel de botão, e não `<button>`: o cartão
                           tem selos e um link dentro, e botão dentro de botão
                           é HTML inválido. */
                        role="button"
                        tabIndex={0}
                        data-cartao={task.id}
                        draggable={ocupado === null}
                        onClick={() => {
                          foco.current = null;
                          setAbertoId(task.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setAbertoId(task.id);
                            return;
                          }
                          const passo = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
                          if (passo === 0) return;
                          const destino = TASK_STATUSES[TASK_STATUSES.indexOf(status) + passo];
                          if (!destino) return;
                          e.preventDefault();
                          foco.current = task.id;
                          void mover(task.id, destino);
                        }}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", task.id);
                          e.dataTransfer.effectAllowed = "move";
                          setArrastando(task.id);
                        }}
                        onDragEnd={() => {
                          setArrastando(null);
                          setAlvo(null);
                        }}
                        className={cn(
                          "cursor-grab rounded-lg border border-border bg-secondary p-3 text-left transition-all active:cursor-grabbing",
                          "hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                          arrastando === task.id && "opacity-40",
                          ocupado === task.id && "opacity-60",
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[11px] leading-none text-muted-foreground">{task.code}</span>
                          {ocupado === task.id && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                        </div>

                        <p className="mt-1.5 line-clamp-2 text-sm font-semibold leading-snug text-foreground">
                          {task.title}
                        </p>

                        <div className="mt-2 flex items-center gap-1">
                          <Selo
                            className="border-transparent"
                            style={{
                              backgroundColor: `${TASK_CATEGORY_COLOR[task.category]}26`,
                              color: TASK_CATEGORY_COLOR[task.category],
                            }}
                          >
                            {TASK_CATEGORY_LABEL[task.category]}
                          </Selo>
                          <Selo className={PRIORITY_BADGE[task.priority]}>{TASK_PRIORITY_LABEL[task.priority]}</Selo>

                          {/* Sem responsável o círculo fica vazio em vez de
                              sumir: a fileira de cartões alinha, e o vazio é a
                              pergunta "de quem é isto?". */}
                          {task.assignee ? (
                            <span className="ml-auto flex items-center">
                              {/* 28px, nao 24: o disco e a unica forma de
                                  saber de quem e o cartao numa varredura da
                                  coluna, e com duas iniciais em 10px ele
                                  pedia aproximacao. */}
                              <Avatar name={task.assignee.name} size="h-7 w-7" textSize="text-[11px]" />
                              {/* As iniciais não são um nome para quem ouve a tela. */}
                              <span className="sr-only">Responsável: {task.assignee.name}</span>
                            </span>
                          ) : (
                            <span
                              aria-hidden
                              title="Sem responsável"
                              className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground/70"
                            >
                              <UserRound className="h-3.5 w-3.5" />
                            </span>
                          )}
                        </div>

                        {(task.evidence || task.dueDate) && (
                          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                            {task.evidence && (
                              <span className="inline-flex items-center gap-0.5 text-primary">
                                {evidenciaEhImagem(task.evidence) ? <ImageIcon className="h-3 w-3" /> : <Link2 className="h-3 w-3" />}
                                evidência
                              </span>
                            )}
                            {task.dueDate && (
                              <span className={cn("inline-flex items-center gap-0.5", task.overdue ? "font-semibold text-destructive" : "text-muted-foreground")}>
                                <CalendarClock className="h-3 w-3" />
                                {task.overdue && "atrasado · "}
                                {formatarDiaMes(task.dueDate)}
                              </span>
                            )}
                          </div>
                        )}
                      </article>
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {/* A legenda e a regra de auditoria, que era a frase da aba de instruções
          da planilha. Com aquela aba fora, esta é a única linha que ainda a diz. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {TASK_STATUSES.map((status) => (
            <span key={status} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: TASK_STATUS_COLOR[status] }} />
              {TASK_STATUS_LABEL[status]}
            </span>
          ))}
        </div>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5" aria-hidden />
          Auditoria do quadro: sexta, 17h
        </span>
      </div>

      {aberto && !editando && !excluindo && (
        <TaskDetailsModal
          task={aberto}
          onClose={() => setAbertoId(null)}
          onEdit={() => setEditando(aberto)}
          onDelete={() => setExcluindo(aberto)}
          /* Fecha a ficha ANTES de mover: a resposta é o cartão aparecendo na
             coluna nova, e uma recusa do servidor vai para o aviso do quadro,
             que a ficha aberta esconderia. O `foco` devolve o teclado ao cartão
             movido, igual ao caminho das setas. */
          onMove={(destino) => {
            foco.current = aberto.id;
            setAbertoId(null);
            void mover(aberto.id, destino);
          }}
        />
      )}

      {/* A `key` remonta o formulário a cada cartão: o estado dele vive em
          inicializadores de `useState`, e sem ela abrir o segundo cartão
          mostraria os dados do primeiro. */}
      {novo && <TaskModal key="novo" people={people} onClose={() => setNovo(false)} />}
      {editando && <TaskModal key={editando.id} task={editando} people={people} onClose={() => setEditando(null)} />}

      {excluindo && (
        <Modal onClose={() => !ocupado && setExcluindo(null)} largura="max-w-md">
          <h2 className="text-lg font-semibold text-foreground">Excluir tarefa</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Confirma a exclusão de{" "}
            <span className="font-semibold text-foreground">
              {excluindo.code} — {excluindo.title}
            </span>
            ? O cartão sai do quadro permanentemente, e esta ação não pode ser desfeita.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setExcluindo(null)} disabled={ocupado !== null}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={remover} disabled={ocupado !== null}>
              {ocupado !== null && <Loader2 className="h-4 w-4 animate-spin" />}
              Excluir
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
