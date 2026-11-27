"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Pause, Pencil, Play, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/shared/modal";
import { Cronometro } from "@/components/shared/cronometro";
import { deleteFollowUp, moverFollowUp } from "@/lib/actions/followups";
import { createTask, moveTask } from "@/lib/actions/tasks";
import {
  FOLLOWUP_STATUSES,
  FOLLOWUP_STATUS_LABEL,
  FOLLOWUP_KIND_LABEL,
} from "@/lib/validations/followup";
import {
  FOLLOWUP_STATUS_BADGE,
  FOLLOWUP_STATUS_COLOR,
  colunaDe,
  formatarDuracao,
  tempoPorStatus,
  tempoTotal,
  type FollowUpRow,
  type FollowUpStatusValue,
  type TarefaAtiva,
} from "@/lib/followup-kanban";

/**
 * A ficha do registro, no mesmo padrão do cartão de pedido do Fluxo (pedido do
 * dono, 18/11/2026). A moldura é a `Modal` da casa — a mesma do
 * `order-detail-modal`, com ESC, véu que fecha ao clique e portal que sobrevive
 * à tela cheia.
 *
 * O cabeçalho repete data, colaborador, tipo, status e gestor porque o modal
 * COBRE o quadro: o que estava no cartão sai de vista.
 *
 * É TAMBÉM O CAMINHO DO TOQUE para mover o cartão: nem arrasto nativo nem
 * seta existem num telefone. Mesma razão da lista "Mover para" do Relatório
 * Semanal.
 */

/**
 * Um campo do registro aberto. Campo vazio não vira bloco vazio na tela.
 *
 * A MOLDURA é a mesma do item do Plano de Ação logo abaixo (pedido do dono,
 * 27/11/2026): sem ela, nove campos de texto corrido viravam uma parede única
 * e o olho não achava onde um acaba e o outro começa. Caixa e não régua
 * porque o texto do campo pode ter várias linhas — a régua separa, a caixa
 * delimita.
 */
function Bloco({ titulo, texto }: { titulo: string; texto: string | null }) {
  if (!texto || !texto.trim()) return null;
  return (
    <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{titulo}</p>
      {/* `whitespace-pre-wrap`: o texto foi digitado em linhas e é lido em linhas. */}
      <p className="mt-0.5 whitespace-pre-wrap">{texto}</p>
    </div>
  );
}

/**
 * Título da tarefa a partir de uma linha do Plano de Ação.
 *
 * O corte em 200 é o limite de `createTaskSchema`. Vive numa função só porque
 * o título é a CHAVE que liga a linha do plano à tarefa gravada: cortar de um
 * jeito ao criar e de outro ao reencontrar faria o cronômetro sumir no F5.
 */
const tituloDaTarefa = (linha: string) => linha.trim().slice(0, 200);

/** "HH:MM" de agora, no relógio do navegador (o mesmo que vai ler de volta). */
function horaAgora(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Instante de hoje correspondente a "HH:MM", no relógio do navegador.
 *
 * shortcut: `DailyTask.startTime` é "HH:MM" sem data, então uma tarefa
 * iniciada 23:50 e lida 00:10 daria tempo negativo (o `Math.max` do
 * `Cronometro` segura em zero). `DailyTask` é declaradamente a tarefa do dia
 * corrente; virar timestamp se a tarefa precisar atravessar a meia-noite.
 *
 * NÃO CONFUNDIR com o cronômetro do CARTÃO, que mede a execução do
 * acompanhamento inteiro: aquele vem de `FollowUp.timerStartedAt`, que é
 * timestamp e atravessa semanas.
 */
function instanteDe(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

/**
 * O Plano de Ação quebrado em itens, cada um com cronômetro.
 *
 * Uma LINHA do texto é um item — nada de campo novo no banco para isso: é
 * assim que o plano já é digitado, e inventar uma tabela de itens obrigaria a
 * migrar o que já está escrito nos registros antigos.
 */
function PlanoDeAcao({
  texto,
  tarefas,
  ocupado,
  aoIniciar,
  aoConcluir,
}: {
  texto: string;
  tarefas: readonly TarefaAtiva[];
  ocupado: boolean;
  aoIniciar: (linha: string) => void;
  aoConcluir: (taskId: string) => void;
}) {
  const linhas = texto.split("\n").map((l) => l.trim()).filter(Boolean);
  if (linhas.length === 0) {
    return <p className="text-muted-foreground">Sem plano de ação registrado.</p>;
  }
  // Os itens perderam a moldura PRÓPRIA quando os demais campos ganharam a
  // sua: a caixa agora é do bloco inteiro (rótulo incluído, como nos outros),
  // e caixa dentro de caixa com a mesma borda e o mesmo fundo vira sujeira.
  // Entre os itens fica só a divisória.
  return (
    <ul className="divide-y divide-border">
      {linhas.map((linha, i) => {
        const ativa = tarefas.find((t) => t.title === tituloDaTarefa(linha));
        return (
          <li
            key={i}
            className="flex flex-wrap items-start justify-between gap-2 py-1.5 first:pt-0 last:pb-0"
          >
            <span className="min-w-0 flex-1 whitespace-pre-wrap">{linha}</span>
            {ativa ? (
              <span className="flex shrink-0 items-center gap-2">
                {ativa.startTime && <Cronometro desde={instanteDe(ativa.startTime)} />}
                <Button variant="outline" size="sm" onClick={() => aoConcluir(ativa.id)} disabled={ocupado}>
                  <Check className="mr-1 h-3.5 w-3.5" />
                  Concluir
                </Button>
              </span>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => aoIniciar(linha)}
                disabled={ocupado}
              >
                <Play className="mr-1 h-3.5 w-3.5" />
                Iniciar
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Data e hora de um instante ISO, no formato que o Fluxo de Pedidos usa. */
const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR");

/** "YYYY-MM-DD" como "DD/MM/YYYY". */
const diaBR = (iso: string) => iso.split("-").reverse().join("/");

export function FollowUpFichaModal({
  registro,
  tarefasAtivas,
  onEditar,
  onClose,
}: {
  registro: FollowUpRow;
  tarefasAtivas: readonly TarefaAtiva[];
  onEditar: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  const umAum = registro.kind === "ONE_ON_ONE";
  const atual = colunaDe(registro.status);
  const porStatus = tempoPorStatus(registro.movements);
  const total = tempoTotal(registro.movements, null, 0);
  const visitados = FOLLOWUP_STATUSES.filter((s) => porStatus[s] > 0);

  /**
   * Uma linha do Plano de Ação vira tarefa do dia DE QUEM CLICA.
   *
   * O plano de ação é do gestor — é ele quem executa para a colaboradora —,
   * então `createTask`, que já cria para a sessão, é exatamente o que se quer.
   */
  function iniciarTarefa(linha: string) {
    setError(null);
    start(async () => {
      const criada = await createTask({
        title: tituloDaTarefa(linha),
        startTime: horaAgora(),
        category: umAum ? "One-on-One" : "Quinzenal",
        notes: `${registro.collaboratorName} — conversa de ${diaBR(registro.heldOn)}`,
      });
      if (!criada.ok) {
        setError(criada.error);
        return;
      }
      // Nasce em "A Fazer" e vai para "Fazendo": iniciar é começar, e uma
      // tarefa com cronômetro correndo parada na primeira coluna seria mentira.
      const movida = await moveTask({ id: criada.data.id, status: "FAZENDO" });
      if (!movida.ok) {
        setError(movida.error);
        return;
      }
      setMsg("Tarefa iniciada. Ela está no seu quadro em Tarefas.");
      router.refresh();
    });
  }

  function concluirTarefa(taskId: string) {
    setError(null);
    start(async () => {
      const r = await moveTask({ id: taskId, status: "CONCLUIDA" });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setMsg("Tarefa concluída.");
      router.refresh();
    });
  }

  /**
   * Mover GRAVA PRIMEIRO e só então fecha a ficha.
   *
   * A ordem não é estética. Fechar antes desmonta este componente, e com ele a
   * `useTransition` que carrega a chamada: o pedido nunca chega ao servidor e a
   * tela não acusa nada — o cartão simplesmente continua na coluna de origem.
   * Foi o que aconteceu no teste de tela em 27/11/2026.
   *
   * De quebra, uma recusa do servidor aparece aqui, na ficha que a pessoa está
   * olhando, em vez de num aviso do quadro atrás do modal.
   */
  function mover(status: FollowUpStatusValue) {
    setError(null);
    start(async () => {
      const r = await moverFollowUp({ id: registro.id, status });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  function excluir() {
    setError(null);
    start(async () => {
      const r = await deleteFollowUp(registro.id);
      if (!r.ok) {
        setError(r.error);
        setConfirmDel(false);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal onClose={() => !pending && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Conversa de ${registro.collaboratorName}`}
        className="space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="break-words text-lg font-bold">{registro.collaboratorName}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {FOLLOWUP_KIND_LABEL[registro.kind]} ·{" "}
              <span className="font-data">{diaBR(registro.heldOn)}</span> · Responsável:{" "}
              {registro.managerName}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="outline" className={FOLLOWUP_STATUS_BADGE[atual]}>
              {FOLLOWUP_STATUS_LABEL[atual]}
            </Badge>
            {/* O X fica além do ESC e do véu: os dois são invisíveis, e a
                ficha é longa — quem rolou até o fim precisa de um alvo. */}
            <button
              type="button"
              onClick={() => !pending && onClose()}
              aria-label="Fechar"
              className="rounded-lg px-1 text-2xl leading-none text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              ×
            </button>
          </div>
        </div>

        <div className="space-y-4 border-t border-border pt-4 text-sm">
          <Bloco titulo="Reconhecimento e pontos fortes" texto={registro.strengths} />
          <Bloco titulo="Oportunidades de desenvolvimento" texto={registro.improvement} />
          <Bloco titulo="Perspectiva do colaborador" texto={registro.collaboratorView} />
          {umAum ? (
            <Bloco titulo="Métricas e indicadores" texto={registro.performance} />
          ) : (
            <>
              <Bloco titulo="Tema central da conversa" texto={registro.topic} />
              <Bloco titulo="Apoio necessário" texto={registro.support} />
              <Bloco
                titulo="Prazo de reavaliação"
                texto={registro.reviewOn ? diaBR(registro.reviewOn) : null}
              />
            </>
          )}
          {/* A mesma caixa do `Bloco`, com o rótulo dentro: o Plano de Ação é
              um campo do registro como os outros, e com o rótulo do lado de
              fora ele parecia uma seção à parte. */}
          <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Plano de ação</p>
            <div className="mt-0.5">
              <PlanoDeAcao
                texto={registro.actionPlan}
                tarefas={tarefasAtivas}
                ocupado={pending}
                aoIniciar={iniciarTarefa}
                aoConcluir={concluirTarefa}
              />
            </div>
          </div>
          <Bloco titulo="Observações" texto={registro.notes} />

          {/* O aviso do Plano de Ação mora aqui: "Iniciar" é um botão DESTA
              ficha, e a resposta dele tem de aparecer onde o clique aconteceu. */}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {/* `motorista-text` (azul) é a cor de SUCESSO das outras telas, não um
              descuido: o rosa do Comercial fica perto demais do vermelho de
              erro logo acima para dizer "deu certo". */}
          {msg && <p className="text-sm text-motorista-text">{msg}</p>}
        </div>

        {/* MOVER PARA — o caminho do toque. Num telefone não existe arrasto
            nativo nem seta, e sem esta lista o quadro seria somente de leitura
            no celular. */}
        <div className="border-t border-border pt-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Mover para</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {FOLLOWUP_STATUSES.filter((s) => s !== atual).map((s) => (
              <Button key={s} variant="outline" size="sm" onClick={() => mover(s)} disabled={pending}>
                <span
                  aria-hidden
                  className="mr-1.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: FOLLOWUP_STATUS_COLOR[s] }}
                />
                {FOLLOWUP_STATUS_LABEL[s]}
              </Button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Mover pausa a contagem e registra o tempo decorrido no status atual.
          </p>
        </div>

        {/* TEMPO DE EXECUÇÃO, por status.
            Sai da mesma trilha que o histórico abaixo — "quanto tempo ficou em
            Em Andamento" é a soma dos trechos que SAÍRAM de Em Andamento, e é
            por isso que voltar a um status anterior continua a contagem de onde
            ela parou, em vez de recomeçar.
            Status nunca visitado não vira linha vazia. */}
        {(total > 0 || registro.timerStartedAt) && (
          <div className="border-t border-border pt-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Tempo de execução
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="font-semibold">
                Total: <span className="font-data">{formatarDuracao(total)}</span>
              </span>
              {registro.timerStartedAt && (
                <span className="flex items-center gap-1.5 text-motorista-text">
                  <Play className="h-3 w-3" aria-hidden />
                  contando agora: <Cronometro desde={Date.parse(registro.timerStartedAt)} />
                </span>
              )}
            </div>
            {visitados.length > 0 && (
              <ul className="mt-1.5 space-y-0.5 text-sm text-muted-foreground">
                {visitados.map((s) => (
                  <li key={s} className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: FOLLOWUP_STATUS_COLOR[s] }}
                    />
                    {FOLLOWUP_STATUS_LABEL[s]}:{" "}
                    <span className="font-data">{formatarDuracao(porStatus[s])}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* HISTÓRICO DE MOVIMENTAÇÃO (especificação de 27/11/2026, item 5), na
            forma do Fluxo de Pedidos: uma linha por movimentação, o que mudou à
            esquerda e a data e hora à direita, com "· por Fulano".
            Aqui a linha diz DE → PARA, porque é o que "movimentação" quer
            dizer e é o que a trilha guarda — e traz o tempo medido no status de
            origem, quando houve medição.
            OS DOIS NOMES QUE A ESPECIFICAÇÃO PEDE são campos diferentes: o
            RESPONSÁVEL pelo registro é o gestor do cabeçalho, e QUEM MOVIMENTOU
            é o nome de cada linha daqui. Com um gestor só eles coincidem; com
            dois, é justamente a pergunta que este histórico responde. */}
        <div className="border-t border-border pt-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Histórico de movimentação
          </p>
          {registro.movements.length === 0 ? (
            <p className="mt-1.5 text-sm text-muted-foreground">
              Sem movimentações. O registro continua na coluna{" "}
              <strong>{FOLLOWUP_STATUS_LABEL[atual]}</strong> desde que foi criado.
            </p>
          ) : (
            <ul className="mt-1.5 space-y-1 text-sm">
              {registro.movements.map((m) => {
                // Mesmo status nos dois lados = uma PAUSA do cronômetro: é o
                // único jeito de registrar o trecho contado sem mover o card.
                const pausa = m.fromStatus !== null && m.fromStatus === m.toStatus;
                return (
                  <li key={m.id} className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
                    <span className="min-w-0">
                      {pausa ? (
                        <>
                          <Pause className="mr-1 inline h-3 w-3 align-[-1px]" aria-hidden />
                          pausado em {FOLLOWUP_STATUS_LABEL[m.toStatus]}
                        </>
                      ) : (
                        <>
                          {FOLLOWUP_STATUS_LABEL[colunaDe(m.fromStatus)]}
                          <ArrowRight className="mx-1 inline h-3 w-3 align-[-1px]" aria-hidden />
                          <span className="font-medium">{FOLLOWUP_STATUS_LABEL[m.toStatus]}</span>
                        </>
                      )}
                      {/* Só a duração: o status de origem é a primeira coisa
                          da linha, e repeti-lo aqui dava "2min em em
                          andamento" — a preposição colide com o "Em" do
                          rótulo em três dos cinco status. */}
                      {m.elapsedMs !== null && (
                        <span className="text-muted-foreground">
                          {" "}
                          · <span className="font-data">{formatarDuracao(m.elapsedMs)}</span>
                        </span>
                      )}
                      <span className="text-muted-foreground"> · por {m.changedByName}</span>
                    </span>
                    <span className="shrink-0 font-data text-xs text-muted-foreground">
                      {quando(m.createdAt)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Editar e Excluir no rodapé, como o cartão de pedido faz: a ficha é
            de leitura, e as ações que a alteram ficam depois do conteúdo, não
            competindo com ele. Excluir mora aqui desde 27/11/2026 — ele era um
            ícone por linha da tabela, e o cartão não tem botões próprios além
            do cronômetro. */}
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          {confirmDel ? (
            <span className="flex flex-wrap items-center justify-end gap-2">
              <span className="text-xs text-muted-foreground">
                Excluir este registro? Não há como desfazer, e o histórico de movimentação vai com
                ele.
              </span>
              <Button variant="destructive" size="sm" onClick={excluir} disabled={pending}>
                Confirmar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDel(false)} disabled={pending}>
                Não
              </Button>
            </span>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirmDel(true)} disabled={pending}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5 text-destructive" aria-hidden />
              Excluir
            </Button>
          )}
          {/* Fecha a ficha antes de abrir o formulário: os dois no ar deixariam
              dois estados do mesmo registro na tela. */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onClose();
              onEditar();
            }}
            disabled={pending}
          >
            <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Editar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
