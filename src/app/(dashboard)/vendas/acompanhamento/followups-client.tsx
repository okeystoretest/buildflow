"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pagination } from "@/components/shared/pagination";
import { Modal } from "@/components/shared/modal";
import { useFilterQuery } from "@/hooks/use-filter-query";
import { deleteFollowUp } from "@/lib/actions/followups";
import { createTask, moveTask } from "@/lib/actions/tasks";
import { Cronometro } from "@/components/shared/cronometro";
import {
  FOLLOWUP_STATUS_BADGE,
  type ColaboradorOpt,
  type FollowUpRow,
  type FollowUpSummary,
  type TarefaAtiva,
} from "@/lib/followup-kanban";
import { KanbanFollowUps } from "./kanban-followups";
import { FollowUpFormModal } from "./followup-form-modal";
import {
  FOLLOWUP_STATUS_LABEL,
  FOLLOWUP_KIND_LABEL,
  type FollowUpKindValue,
} from "@/lib/validations/followup";

/**
 * O selo de status mora em `followup-kanban.ts`, ao lado do hexadecimal da
 * bolinha da coluna: são o mesmo tom dito de dois jeitos, e em dois arquivos
 * eles divergiam no primeiro ajuste.
 */
const COR_DO_STATUS = FOLLOWUP_STATUS_BADGE;

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
 * iniciada 23:50 e lida 00:10 daria tempo negativo (o `Math.max` abaixo
 * segura em zero). `DailyTask` é declaradamente a tarefa do dia corrente;
 * virar timestamp se a tarefa precisar atravessar a meia-noite.
 */
function instanteDe(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

/** Um campo do registro aberto. Campo vazio não vira bloco vazio na tela. */
function Bloco({ titulo, texto }: { titulo: string; texto: string | null }) {
  if (!texto || !texto.trim()) return null;
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{titulo}</p>
      {/* `whitespace-pre-wrap`: o texto foi digitado em linhas e é lido em linhas. */}
      <p className="mt-0.5 whitespace-pre-wrap">{texto}</p>
    </div>
  );
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
  tarefas: TarefaAtiva[];
  ocupado: boolean;
  aoIniciar: (linha: string) => void;
  aoConcluir: (taskId: string) => void;
}) {
  const linhas = texto.split("\n").map((l) => l.trim()).filter(Boolean);
  if (linhas.length === 0) {
    return <p className="text-muted-foreground">Sem plano de ação registrado.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {linhas.map((linha, i) => {
        const ativa = tarefas.find((t) => t.title === tituloDaTarefa(linha));
        return (
          <li
            key={i}
            className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2"
          >
            <span className="min-w-0 flex-1 whitespace-pre-wrap">{linha}</span>
            {ativa ? (
              <span className="flex shrink-0 items-center gap-2">
                {ativa.startTime && <Cronometro desde={instanteDe(ativa.startTime)} />}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => aoConcluir(ativa.id)}
                  disabled={ocupado}
                >
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


export function FollowUpsClient({
  kind,
  rows,
  colaboradores,
  hoje,
  gestorNome,
  colabFiltro,
  anoFiltro,
  situacaoFiltro,
  pagina,
  porPagina,
  total,
  resumo,
  tarefasAtivas,
}: {
  kind: FollowUpKindValue;
  rows: FollowUpRow[];
  colaboradores: ColaboradorOpt[];
  /** "YYYY-MM-DD" de hoje no fuso do negócio, calculado no servidor. */
  hoje: string;
  gestorNome: string;
  /** Filtros da LISTA, aplicados no servidor (?colab, ?ano, ?situacao). */
  colabFiltro: string;
  anoFiltro: string;
  /** "" = todas, "abertos", "concluidos". O histórico é o terceiro valor. */
  situacaoFiltro: string;
  /** Paginação resolvida no servidor: a lista já vem só com esta página. */
  pagina: number;
  porPagina: number;
  total: number;
  /** Os números do topo do quadro, contados no filtro inteiro. */
  resumo: FollowUpSummary;
  /** Tarefas do gestor em andamento hoje — o cronômetro retoma delas. */
  tarefasAtivas: TarefaAtiva[];
}) {
  const router = useRouter();
  // Os filtros da lista moram neste componente (que já é de cliente) em vez de
  // num arquivo próprio: são dois selects, e um componente a mais só para eles
  // seria um arquivo a abrir para entender duas linhas.
  const filtro = useFilterQuery(
    {},
    { instant: { colab: colabFiltro, ano: anoFiltro, situacao: situacaoFiltro } },
  );
  const anoAtual = new Date().getFullYear();
  const anos = Array.from({ length: 5 }, (_, i) => anoAtual - i);
  const [pending, start] = useTransition();
  /**
   * O formulário: `"novo"` ou o id do registro em edição. `null` = fechado.
   *
   * Ele ficava fixo no topo da aba e virou modal em 27/11/2026 — por isso o
   * estado é só "qual modal está aberto", e não os onze campos: eles moraram
   * aqui enquanto o formulário era parte da tela, e agora vivem dentro de
   * `FollowUpFormModal`, que nasce e morre com ele.
   */
  const [formulario, setFormulario] = useState<"novo" | string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  /** Registro aberto por inteiro na lista. `null` = todos fechados. */
  const [abertoId, setAbertoId] = useState<string | null>(null);
  /**
   * O registro da ficha aberta, procurado em `rows` em vez de guardado no
   * estado: assim ele acompanha o que o servidor acabou de gravar. Com uma
   * cópia no estado, editar pelo modal deixava a ficha mostrando o texto antigo
   * até fechar e abrir de novo. Se a linha sair da página (filtro, exclusão,
   * paginação), o `find` devolve `undefined` e a ficha simplesmente fecha.
   */
  const aberto = rows.find((r) => r.id === abertoId);

  const umAum = kind === "ONE_ON_ONE";

  /**
   * Uma linha do Plano de Ação vira tarefa do dia DE QUEM CLICA.
   *
   * O plano de ação é do gestor — é ele quem executa para a colaboradora —,
   * então `createTask`, que já cria para a sessão, é exatamente o que se quer:
   * nenhuma mudança em `tasks.ts`.
   */
  function iniciarTarefa(linha: string, r: FollowUpRow) {
    setError(null);
    start(async () => {
      const criada = await createTask({
        title: tituloDaTarefa(linha),
        startTime: horaAgora(),
        category: umAum ? "One-on-One" : "Quinzenal",
        notes: `${r.collaboratorName} — conversa de ${r.heldOn.split("-").reverse().join("/")}`,
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

  /** Abre o formulário em edição. O modal é quem carrega os campos. */
  const editar = (r: FollowUpRow) => setFormulario(r.id);

  function excluir(id: string) {
    start(async () => {
      const res = await deleteFollowUp(id);
      setConfirmDel(null);
      if (res.ok) {
        // A ficha fecha junto: o registro que ela mostrava não existe mais, e
        // o `find` devolveria `undefined` no próximo desenho de qualquer jeito.
        setAbertoId(null);
        setFormulario((atual) => (atual === id ? null : atual));
        router.refresh();
      } else setError(res.error);
    });
  }

  return (
    // O QUADRO OCUPA A TELA. O formulário saiu daqui para um modal
    // (especificação de 27/11/2026): dez campos de texto longo empurravam as
    // colunas para baixo da dobra, e quem abre um Kanban vem mexer em cartão.
    <div className="w-full space-y-6">

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-end sm:justify-between">
          <CardTitle>Registros</CardTitle>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="filtro-colab">Colaborador</Label>
              <select
                id="filtro-colab"
                className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
                value={filtro.instant.colab}
                onChange={(e) => filtro.setInstant("colab", e.target.value)}
              >
                <option value="">Todos</option>
                {colaboradores.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            {/* O HISTÓRICO É ESTE FILTRO, e não uma tela à parte: os registros
                concluídos são os mesmos registros, e uma segunda lista com os
                mesmos seis campos seria a mesma tabela duas vezes.

                Padrão "Todas" de propósito: um padrão "Em aberto" faria os
                registros já entregues desaparecerem da tela sem ninguém pedir. */}
            <div className="space-y-1.5">
              <Label htmlFor="filtro-situacao">Situação</Label>
              <select
                id="filtro-situacao"
                className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
                value={filtro.instant.situacao}
                onChange={(e) => filtro.setInstant("situacao", e.target.value)}
              >
                <option value="">Todas</option>
                <option value="abertos">Em aberto</option>
                <option value="concluidos">Concluídos (histórico)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filtro-ano">Ano</Label>
              <select
                id="filtro-ano"
                className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
                value={filtro.instant.ano}
                onChange={(e) => filtro.setInstant("ano", e.target.value)}
              >
                {anos.map((a) => (
                  <option key={a} value={String(a)}>{a}</option>
                ))}
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* O QUADRO no lugar da tabela (especificação de 27/11/2026). A
              tabela de seis colunas saiu inteira: as mesmas seis informações
              estão no cartão e na ficha, e manter as duas leituras seria a
              mesma lista duas vezes.
              A PAGINAÇÃO continua embaixo, por decisão do dono — e é por isso
              que o topo de cada coluna diz "3 de 11": sem esse rótulo, o
              quadro mentiria sobre o que existe fora da página. */}
          <KanbanFollowUps
            rows={rows}
            resumo={resumo}
            kind={kind}
            hoje={hoje}
            onAbrir={setAbertoId}
            onNovo={() => setFormulario("novo")}
          />
          <div className="mt-3">
            <Pagination page={pagina} perPage={porPagina} total={total} label="registros" />
          </div>
        </CardContent>
      </Card>


      {/* A FICHA DO REGISTRO, no mesmo padrão do cartão de pedido do Fluxo
          (pedido do dono, 18/11/2026). A moldura é a `Modal` da casa — a mesma
          do `order-detail-modal`, com ESC, véu que fecha ao clique e portal que
          sobrevive à tela cheia.
          Antes ela abria DENTRO da tabela, num `<tr>` de seis colunas: os nove
          campos de texto longo empurravam as linhas seguintes para fora da
          tela, e comparar dois registros exigia fechar um para achar o outro.
          O cabeçalho repete data, colaborador, tipo, status e gestor porque o
          modal COBRE a tabela: o que estava nas colunas sai de vista. */}
      {aberto && (
        <Modal onClose={() => setAbertoId(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Conversa de ${aberto.collaboratorName}`}
            className="space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="break-words text-lg font-bold">{aberto.collaboratorName}</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {FOLLOWUP_KIND_LABEL[aberto.kind]} ·{" "}
                  <span className="font-data">{aberto.heldOn.split("-").reverse().join("/")}</span> ·
                  Gestor: {aberto.managerName}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="outline" className={COR_DO_STATUS[aberto.status ?? "NAO_INICIADO"]}>
                  {FOLLOWUP_STATUS_LABEL[aberto.status ?? "NAO_INICIADO"]}
                </Badge>
                {/* O X fica além do ESC e do véu: os dois são invisíveis, e a
                    ficha é longa — quem rolou até o fim precisa de um alvo. */}
                <button
                  type="button"
                  onClick={() => setAbertoId(null)}
                  aria-label="Fechar"
                  className="rounded-lg px-1 text-2xl leading-none text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="space-y-4 border-t border-border pt-4 text-sm">
              <Bloco titulo="Reconhecimento e pontos fortes" texto={aberto.strengths} />
              <Bloco titulo="Oportunidades de desenvolvimento" texto={aberto.improvement} />
              <Bloco titulo="Perspectiva do colaborador" texto={aberto.collaboratorView} />
              {umAum ? (
                <Bloco titulo="Métricas e indicadores" texto={aberto.performance} />
              ) : (
                <>
                  <Bloco titulo="Tema central da conversa" texto={aberto.topic} />
                  <Bloco titulo="Apoio necessário" texto={aberto.support} />
                  <Bloco
                    titulo="Prazo de reavaliação"
                    texto={aberto.reviewOn ? aberto.reviewOn.split("-").reverse().join("/") : null}
                  />
                </>
              )}
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Plano de ação</p>
                <div className="mt-1.5">
                  <PlanoDeAcao
                    texto={aberto.actionPlan}
                    tarefas={tarefasAtivas}
                    ocupado={pending}
                    aoIniciar={(linha) => iniciarTarefa(linha, aberto)}
                    aoConcluir={concluirTarefa}
                  />
                </div>
              </div>
              <Bloco titulo="Observações" texto={aberto.notes} />

              {/* O aviso do Plano de Ação mora aqui desde 27/11/2026: ele
                  ficava no rodapé do formulário, que saiu da tela, e "Iniciar"
                  é um botão DESTA ficha — a resposta dele tem de aparecer onde
                  o clique aconteceu, não numa tela que já fechou. */}
              {error && <p className="text-sm text-destructive">{error}</p>}
              {/* `motorista-text` (azul) e a cor de SUCESSO das outras telas,
                  nao um descuido: o rosa do Comercial fica perto demais do
                  vermelho de erro logo acima para dizer "deu certo". */}
              {msg && <p className="text-sm text-motorista-text">{msg}</p>}
            </div>

            {/* Editar no rodapé, como o cartão de pedido faz: a ficha é de
                leitura, e a ação que a altera fica depois do conteúdo, não
                competindo com ele. Fecha a ficha antes de abrir o formulário —
                os dois no ar deixariam dois estados do mesmo registro na tela. */}
            {/* EXCLUIR mora aqui desde 27/11/2026, quando a tabela deu lugar
                ao quadro: ele era um ícone por linha, e o cartão não tem
                botões próprios além do cronômetro. Na ficha ele fica depois do
                conteúdo, onde quem já leu o registro decide — e não a um
                clique de distância de quem só passava os olhos na coluna. */}
            <div className="flex justify-end gap-2 border-t border-border pt-3">
              {confirmDel === aberto.id ? (
                <span className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Excluir este registro? Não há como desfazer.
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => excluir(aberto.id)}
                    disabled={pending}
                  >
                    Confirmar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDel(null)}>
                    Não
                  </Button>
                </span>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDel(aberto.id)}
                  disabled={pending}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5 text-destructive" aria-hidden />
                  Excluir
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setAbertoId(null);
                  editar(aberto);
                }}
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Editar
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* O FORMULÁRIO, em modal (especificação de 27/11/2026).
          A `key` o remonta a cada registro: o estado dele vive em
          inicializadores de `useState`, e sem ela abrir o segundo registro
          mostraria os dados do primeiro. Mesma armadilha documentada no quadro
          do Relatório Semanal. */}
      {formulario && (
        <FollowUpFormModal
          key={formulario}
          kind={kind}
          registro={formulario === "novo" ? undefined : rows.find((r) => r.id === formulario)}
          colaboradores={colaboradores}
          hoje={hoje}
          gestorNome={gestorNome}
          onClose={() => setFormulario(null)}
        />
      )}
    </div>
  );
}
