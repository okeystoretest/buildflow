"use client";

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Pencil, Play, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pagination } from "@/components/shared/pagination";
import { useFilterQuery } from "@/hooks/use-filter-query";
import { createFollowUp, updateFollowUp, deleteFollowUp } from "@/lib/actions/followups";
import { createTask, moveTask } from "@/lib/actions/tasks";
import {
  FOLLOWUP_STATUSES,
  FOLLOWUP_STATUS_LABEL,
  MIN_BUSCA_COLABORADOR,
  type FollowUpKindValue,
} from "@/lib/validations/followup";

/**
 * Cor de cada status. VERMELHO SO em "Precisa de Revisao": e o unico que pede
 * acao de quem passa os olhos na lista, e um vermelho repartido entre tres
 * status nao aponta mais nada. "Em Espera" e ambar porque parou sem ser
 * problema, e "Nao Iniciado" fica neutro de proposito — ele e a AUSENCIA de
 * evolucao, e cinco cores competindo pela atencao e o mesmo que nenhuma.
 *
 * `outline` + par de tons, e nao as variantes do Badge: aquelas sao as cores de
 * SETOR do sistema, e usar "vendas" para "Entregue" amarraria o significado do
 * status a identidade do Comercial.
 *
 * Tom 800 no claro e 300 no escuro: sao os que passam os 4.5:1 da WCAG AA
 * contra o fundo /15 do proprio badge.
 */
const COR_DO_STATUS: Record<(typeof FOLLOWUP_STATUSES)[number], string> = {
  NAO_INICIADO: "border-border text-muted-foreground",
  EM_ANDAMENTO: "border-sky-500/40 bg-sky-500/15 text-sky-700 dark:text-sky-300",
  PRECISA_REVISAO: "border-rose-500/40 bg-rose-500/15 text-rose-700 dark:text-rose-300",
  EM_ESPERA: "border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-300",
  ENTREGUE: "border-emerald-500/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
};

export interface FollowUpRow {
  id: string;
  kind: FollowUpKindValue;
  collaboratorId: string;
  collaboratorName: string;
  managerName: string;
  /** "YYYY-MM-DD" — já no fuso do negócio, formatado no servidor. */
  heldOn: string;
  strengths: string;
  improvement: string;
  collaboratorView: string;
  actionPlan: string;
  notes: string | null;
  performance: string | null;
  status: (typeof FOLLOWUP_STATUSES)[number] | null;
  topic: string | null;
  support: string | null;
  reviewOn: string | null;
}

export interface ColaboradorOpt {
  id: string;
  name: string;
  /** Rótulo auxiliar na lista (papel / modelo de venda). */
  detalhe: string;
}

/** Tarefa do gestor já em andamento hoje, para o cronômetro retomar. */
export interface TarefaAtiva {
  id: string;
  title: string;
  /** "HH:MM" de quando foi iniciada. */
  startTime: string | null;
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

/** Contador que anda de segundo em segundo enquanto a tarefa está em andamento. */
function Cronometro({ desde }: { desde: number }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const seg = Math.max(0, Math.floor((agora - desde) / 1000));
  const dd = (n: number) => String(n).padStart(2, "0");
  return (
    <span className="font-data tabular-nums" aria-live="off">
      {dd(Math.floor(seg / 3600))}:{dd(Math.floor((seg % 3600) / 60))}:{dd(seg % 60)}
    </span>
  );
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

const CAMPO = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm";

function Texto({
  label,
  help,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  help?: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <textarea className={CAMPO} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}

/**
 * Busca do colaborador por digitação, com o mínimo de caracteres que a
 * especificação pede (cinco).
 *
 * FILTRA NO NAVEGADOR, e isto é correto aqui: a lista inteira de usuários
 * ativos são algumas dezenas de nomes, que já vêm com a página. Uma rota de
 * busca no servidor existiria para resolver um volume que esta tela não tem —
 * ao contrário do cadastro de clientes, que tem dezenas de milhares e por isso
 * usa o `CustomerCombobox`.
 */
function BuscaColaborador({
  colaboradores,
  value,
  onChange,
}: {
  colaboradores: ColaboradorOpt[];
  value: string;
  onChange: (id: string) => void;
}) {
  const selecionado = colaboradores.find((c) => c.id === value) ?? null;
  const [termo, setTermo] = useState("");

  const achados = useMemo(() => {
    const t = termo.trim().toLowerCase();
    if (t.length < MIN_BUSCA_COLABORADOR) return [];
    return colaboradores.filter((c) => c.name.toLowerCase().includes(t)).slice(0, 10);
  }, [termo, colaboradores]);

  if (selecionado) {
    return (
      <div className="space-y-1.5">
        <Label>Colaborador</Label>
        <div className="flex h-10 items-center justify-between rounded-lg border border-input bg-secondary/40 px-3 text-sm">
          <span className="font-medium">{selecionado.name}</span>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => {
              onChange("");
              setTermo("");
            }}
            aria-label="Trocar colaborador"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  const curto = termo.trim().length > 0 && termo.trim().length < MIN_BUSCA_COLABORADOR;

  return (
    <div className="space-y-1.5">
      <Label htmlFor="busca-colaborador">Colaborador</Label>
      <Input
        id="busca-colaborador"
        placeholder={`Digite ${MIN_BUSCA_COLABORADOR} letras do nome...`}
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        autoComplete="off"
      />
      {curto && (
        <p className="text-xs text-muted-foreground">
          Faltam {MIN_BUSCA_COLABORADOR - termo.trim().length} caractere(s) para buscar.
        </p>
      )}
      {achados.length > 0 && (
        <ul className="max-h-48 overflow-y-auto rounded-lg border border-border bg-card">
          {achados.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-secondary/60"
                onClick={() => {
                  onChange(c.id);
                  setTermo("");
                }}
              >
                <span>{c.name}</span>
                <span className="text-xs text-muted-foreground">{c.detalhe}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!curto && termo.trim().length >= MIN_BUSCA_COLABORADOR && achados.length === 0 && (
        <p className="text-xs text-muted-foreground">Nenhum colaborador com esse nome.</p>
      )}
    </div>
  );
}

const VAZIO = {
  collaboratorId: "",
  heldOn: "",
  strengths: "",
  improvement: "",
  collaboratorView: "",
  actionPlan: "",
  notes: "",
  performance: "",
  status: "NAO_INICIADO" as (typeof FOLLOWUP_STATUSES)[number],
  topic: "",
  support: "",
  reviewOn: "",
};

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
  // A data já nasce preenchida com hoje (especificação), e segue editável:
  // a conversa de sexta às vezes é registrada na segunda.
  const [f, setF] = useState({ ...VAZIO, heldOn: hoje });
  const [editId, setEditId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  /** Registro aberto por inteiro na lista. `null` = todos fechados. */
  const [abertoId, setAbertoId] = useState<string | null>(null);

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
  const set = (k: keyof typeof VAZIO, v: string) => setF((p) => ({ ...p, [k]: v }));

  function limpar() {
    setF({ ...VAZIO, heldOn: hoje });
    setEditId(null);
    setError(null);
  }

  function salvar() {
    setError(null);
    setMsg(null);
    const payload = { ...f, kind };
    start(async () => {
      const res = editId
        ? await updateFollowUp({ ...payload, id: editId })
        : await createFollowUp(payload);
      if (res.ok) {
        limpar();
        setMsg(editId ? "Acompanhamento atualizado." : "Acompanhamento registrado.");
        router.refresh();
      } else {
        // `fieldErrors` traz a mensagem do campo que faltou; sem ela o usuário
        // via só "Dados inválidos." e tinha de adivinhar qual campo era.
        const primeiro = Object.values(res.fieldErrors ?? {})[0]?.[0];
        setError(primeiro ?? res.error);
      }
    });
  }

  function editar(r: FollowUpRow) {
    setEditId(r.id);
    setError(null);
    setMsg(null);
    setF({
      collaboratorId: r.collaboratorId,
      heldOn: r.heldOn,
      strengths: r.strengths,
      improvement: r.improvement,
      collaboratorView: r.collaboratorView,
      actionPlan: r.actionPlan,
      notes: r.notes ?? "",
      performance: r.performance ?? "",
      status: r.status ?? "NAO_INICIADO",
      topic: r.topic ?? "",
      support: r.support ?? "",
      reviewOn: r.reviewOn ?? "",
    });
    // O formulário fica no topo da aba; sem isto, em telas pequenas o clique em
    // "editar" parece não ter feito nada.
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function excluir(id: string) {
    start(async () => {
      const res = await deleteFollowUp(id);
      setConfirmDel(null);
      if (res.ok) {
        if (editId === id) limpar();
        router.refresh();
      } else setError(res.error);
    });
  }

  return (
    // FORMULÁRIO EM CIMA E REGISTROS EMBAIXO (pedido do dono, 17/11/2026), com
    // a página de largura limitada: o formulário volta a ter os três campos na
    // mesma linha, e nada varre os 1900px de um monitor largo.
    //
    // `max-w-5xl` (1024px) e não menos: a tabela de registros tem
    // `min-w-[720px]`, então uma folha mais estreita já nasceria rolando na
    // horizontal.
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {editId ? "Editar registro" : umAum ? "Novo One-on-One" : "Novo Acompanhamento Quinzenal"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <BuscaColaborador
              colaboradores={colaboradores}
              value={f.collaboratorId}
              onChange={(id) => set("collaboratorId", id)}
            />
            <div className="space-y-1.5">
              <Label htmlFor="held-on">{umAum ? "Data de Realização" : "Data do Feedback"}</Label>
              <Input
                id="held-on"
                type="date"
                value={f.heldOn}
                onChange={(e) => set("heldOn", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Gestor Responsável pelo Suporte</Label>
              <div className="flex h-10 items-center rounded-lg border border-input bg-secondary/40 px-3 text-sm text-muted-foreground">
                {editId ? "mantém quem conduziu" : gestorNome}
              </div>
              <p className="text-xs text-muted-foreground">
                Registrado automaticamente: quem preenche o formulário.
              </p>
            </div>
          </div>

          {umAum ? (
            <Texto
              label="Métricas e Indicadores de Desempenho"
              help="Atingimento de metas, postura, pontualidade e qualidade no atendimento."
              value={f.performance}
              onChange={(v) => set("performance", v)}
              rows={4}
            />
          ) : (
            <Texto
              label="Tema Central da Conversa"
              help="Assunto principal, projeto, desafio ou foco do encontro."
              value={f.topic}
              onChange={(v) => set("topic", v)}
              rows={2}
            />
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Texto
              label={umAum ? "Reconhecimento e Pontos Fortes" : "Forças em Evidência"}
              help={
                umAum
                  ? "Um elogio fundamentado em fatos concretos da atuação recente."
                  : "Competências, entregas de destaque e comportamentos positivos do período."
              }
              value={f.strengths}
              onChange={(v) => set("strengths", v)}
            />
            <Texto
              label={umAum ? "Oportunidades de Desenvolvimento" : "Ponto de Desenvolvimento"}
              help="O que precisa de aprimoramento ou correção de rota."
              value={f.improvement}
              onChange={(v) => set("improvement", v)}
            />
            <Texto
              label={umAum ? "Perspectiva do Colaborador" : "Reflexão do Colaborador (Frase)"}
              help="Nas palavras dele, o mais fiel possível."
              value={f.collaboratorView}
              onChange={(v) => set("collaboratorView", v)}
            />
            <Texto
              label={umAum ? "Plano de Ação Semanal" : "Plano de Ação Definido"}
              help={
                umAum
                  ? "Uma meta prática e de curto prazo até o próximo acompanhamento."
                  : "Ações práticas e etapas acordadas para o próximo período."
              }
              value={f.actionPlan}
              onChange={(v) => set("actionPlan", v)}
            />
          </div>

          {/* STATUS NOS DOIS TIPOS (pedido do dono, 17/11/2026): é o campo que o
              filtro "Situação" e o histórico leem. Registro quinzenal gravado
              antes disto tem status nulo no banco e a lista o lê como "Não
              Iniciado" — nenhuma migration, a coluna já aceitava. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="status">Status de Evolução</Label>
              <select
                id="status"
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                value={f.status}
                onChange={(e) => set("status", e.target.value)}
              >
                {FOLLOWUP_STATUSES.map((s) => (
                  <option key={s} value={s}>{FOLLOWUP_STATUS_LABEL[s]}</option>
                ))}
              </select>
            </div>
          </div>

          {!umAum && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Texto
                label="Apoio Necessário"
                help="Recursos, treinamentos ou suporte da liderança para viabilizar o plano."
                value={f.support}
                onChange={(v) => set("support", v)}
              />
              <div className="space-y-1.5">
                <Label htmlFor="review-on">Prazo de Reavaliação</Label>
                <Input
                  id="review-on"
                  type="date"
                  value={f.reviewOn}
                  onChange={(e) => set("reviewOn", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Data limite para verificar o progresso das ações.
                </p>
              </div>
            </div>
          )}

          <Texto
            label={umAum ? "Considerações Gerais" : "Observações"}
            help="Opcional: acordos paralelos, intercorrências e recados que merecem registro."
            value={f.notes}
            onChange={(v) => set("notes", v)}
            rows={2}
          />

          {error && <p className="text-sm text-destructive">{error}</p>}
          {/* `motorista-text` (azul) e a cor de SUCESSO das outras telas, nao
              um descuido: o rosa do Comercial fica perto demais do vermelho de
              erro logo acima para dizer "deu certo". */}
          {msg && <p className="text-sm text-motorista-text">{msg}</p>}

          <div className="flex gap-2">
            <Button variant="brand" onClick={salvar} disabled={pending || !f.collaboratorId}>
              {editId ? "Salvar alterações" : "Registrar"}
            </Button>
            {editId && (
              <Button variant="outline" onClick={limpar} disabled={pending}>
                Cancelar edição
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

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
          <div className="kanban-scroll overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-border text-left text-foreground">
                <tr>
                  <th className="py-2 pr-4">Data</th>
                  <th className="py-2 pr-4">Colaborador</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Plano de ação</th>
                  <th className="py-2 pr-4">Gestor</th>
                  <th className="py-2 pr-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Fragment key={r.id}>
                  <tr
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-secondary/50"
                    // Clique NÃO pode ser o único caminho: a linha é um botão
                    // de verdade, alcançável por Tab e aberta por Enter/Espaço.
                    role="button"
                    tabIndex={0}
                    aria-expanded={abertoId === r.id}
                    onClick={() => setAbertoId((p) => (p === r.id ? null : r.id))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setAbertoId((p) => (p === r.id ? null : r.id));
                      }
                    }}
                  >
                    <td className="py-2 pr-4 font-data whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                            abertoId === r.id ? "rotate-180" : ""
                          }`}
                          aria-hidden
                        />
                        {r.heldOn.split("-").reverse().join("/")}
                      </span>
                    </td>
                    <td className="py-2 pr-4 font-medium">{r.collaboratorName}</td>
                    <td className="py-2 pr-4">
                      <Badge variant="outline" className={COR_DO_STATUS[r.status ?? "NAO_INICIADO"]}>
                        {FOLLOWUP_STATUS_LABEL[r.status ?? "NAO_INICIADO"]}
                      </Badge>
                      {/* O prazo de reavaliação perdeu a coluna para o Status,
                          mas não a tela: ele é o que a Gestão checa na lista do
                          Quinzenal, então desce para baixo do badge em vez de
                          ficar só no registro aberto. */}
                      {!umAum && r.reviewOn && (
                        <p className="mt-1 font-data text-xs text-muted-foreground">
                          reavaliar {r.reviewOn.split("-").reverse().join("/")}
                        </p>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      <span className="line-clamp-2">{r.actionPlan}</span>
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">{r.managerName}</td>
                    <td className="py-2 pr-4">
                      {/* A célula inteira para o clique: sem isto, Editar e
                          Excluir também abririam o painel da linha. */}
                      <div
                        className="flex justify-end gap-1"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <Button variant="ghost" size="icon" onClick={() => editar(r)} aria-label="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {confirmDel === r.id ? (
                          <span className="flex items-center gap-1">
                            <Button variant="destructive" size="sm" onClick={() => excluir(r.id)} disabled={pending}>
                              Confirmar
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setConfirmDel(null)}>
                              Não
                            </Button>
                          </span>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setConfirmDel(r.id)}
                            aria-label="Excluir"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {abertoId === r.id && (
                    <tr className="border-b border-border bg-secondary/20 last:border-0">
                      <td colSpan={6} className="px-3 py-4">
                        <div className="space-y-4 text-sm">
                          <Bloco titulo="Reconhecimento e pontos fortes" texto={r.strengths} />
                          <Bloco titulo="Oportunidades de desenvolvimento" texto={r.improvement} />
                          <Bloco titulo="Perspectiva do colaborador" texto={r.collaboratorView} />
                          {umAum ? (
                            <Bloco titulo="Métricas e indicadores" texto={r.performance} />
                          ) : (
                            <>
                              <Bloco titulo="Tema central da conversa" texto={r.topic} />
                              <Bloco titulo="Apoio necessário" texto={r.support} />
                              <Bloco
                                titulo="Prazo de reavaliação"
                                texto={r.reviewOn ? r.reviewOn.split("-").reverse().join("/") : null}
                              />
                            </>
                          )}
                          <div>
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">
                              Plano de ação
                            </p>
                            <div className="mt-1.5">
                              <PlanoDeAcao
                                texto={r.actionPlan}
                                tarefas={tarefasAtivas}
                                ocupado={pending}
                                aoIniciar={(linha) => iniciarTarefa(linha, r)}
                                aoConcluir={concluirTarefa}
                              />
                            </div>
                          </div>
                          <Bloco titulo="Observações" texto={r.notes} />
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-muted-foreground">
                      Nenhum registro com estes filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-3">
            <Pagination page={pagina} perPage={porPagina} total={total} label="registros" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
