"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFilterQuery } from "@/hooks/use-filter-query";
import { createFollowUp, updateFollowUp, deleteFollowUp } from "@/lib/actions/followups";
import {
  FOLLOWUP_STATUSES,
  FOLLOWUP_STATUS_LABEL,
  MIN_BUSCA_COLABORADOR,
  type FollowUpKindValue,
} from "@/lib/validations/followup";

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
}: {
  kind: FollowUpKindValue;
  rows: FollowUpRow[];
  colaboradores: ColaboradorOpt[];
  /** "YYYY-MM-DD" de hoje no fuso do negócio, calculado no servidor. */
  hoje: string;
  gestorNome: string;
  /** Filtros da LISTA, aplicados no servidor (?colab, ?ano). */
  colabFiltro: string;
  anoFiltro: string;
}) {
  const router = useRouter();
  // Os filtros da lista moram neste componente (que já é de cliente) em vez de
  // num arquivo próprio: são dois selects, e um componente a mais só para eles
  // seria um arquivo a abrir para entender duas linhas.
  const filtro = useFilterQuery({}, { instant: { colab: colabFiltro, ano: anoFiltro } });
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

  const umAum = kind === "ONE_ON_ONE";
  const set = (k: keyof typeof VAZIO, v: string) => setF((p) => ({ ...p, [k]: v }));

  function limpar() {
    setF({ ...VAZIO, heldOn: hoje });
    setEditId(null);
    setError(null);
  }

  function salvar() {
    setError(null);
    setMsg(null);
    const payload = { ...f, kind, status: umAum ? f.status : undefined };
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
    <div className="space-y-6">
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

          {umAum ? (
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
          ) : (
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-border text-left text-foreground">
                <tr>
                  <th className="py-2 pr-4">Data</th>
                  <th className="py-2 pr-4">Colaborador</th>
                  <th className="py-2 pr-4">{umAum ? "Status" : "Reavaliar em"}</th>
                  <th className="py-2 pr-4">Plano de ação</th>
                  <th className="py-2 pr-4">Gestor</th>
                  <th className="py-2 pr-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-secondary/50">
                    <td className="py-2 pr-4 font-data whitespace-nowrap">
                      {r.heldOn.split("-").reverse().join("/")}
                    </td>
                    <td className="py-2 pr-4 font-medium">{r.collaboratorName}</td>
                    <td className="py-2 pr-4">
                      {umAum ? (
                        <Badge variant={r.status === "ENTREGUE" ? "vendas" : "secondary"}>
                          {FOLLOWUP_STATUS_LABEL[r.status ?? "NAO_INICIADO"]}
                        </Badge>
                      ) : r.reviewOn ? (
                        <span className="font-data">{r.reviewOn.split("-").reverse().join("/")}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      <span className="line-clamp-2">{r.actionPlan}</span>
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">{r.managerName}</td>
                    <td className="py-2 pr-4">
                      <div className="flex justify-end gap-1">
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
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-muted-foreground">
                      Nenhum registro no período selecionado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
