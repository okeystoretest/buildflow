"use client";

import { useCallback } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { salvarSecao } from "@/lib/actions/relatorio-semanal";
import {
  contarEntregas,
  percentualDaMeta,
  variacao,
  type AgendaItem,
  type DeliveryItem,
  type MetricItem,
  type OkrItem,
} from "@/lib/relatorio-semanal-math";
import {
  formatarNumero,
  formatarPercentual,
  formatarVariacao,
} from "@/lib/relatorio-semanal-labels";
import { EvidenceField } from "./evidence-field";
import { HealthSelect } from "./health-select";
import { SectionCard } from "./section-card";
import { escreverNumero, lerNumero, useSecao } from "./use-secao";

/**
 * As seções do relatório — as abas 2, 3, 4 e 6 da planilha.
 *
 * Entregas, métricas e OKRs são LISTAS LIVRES: a semana monta as próprias
 * linhas, e salvar manda a lista como ela ficou. A pauta continua sendo
 * roteiro fixo — ali só a resposta se escreve.
 *
 * NENHUMA DELAS CALCULA PARA GRAVAR: variação, % da meta e os contadores do
 * rodapé saem de `relatorio-semanal-math` na renderização, com os mesmos
 * valores que o servidor usa. É o que mantém a conta num lugar só.
 */

/** Cabeçalho de tabela: um `<th>` discreto, repetido em dois lugares. */
function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`whitespace-nowrap px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground ${className ?? ""}`}
    >
      {children}
    </th>
  );
}

/** A lixeira do fim da linha. */
function RemoverLinha({ rotulo, onClick }: { rotulo: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={rotulo}
      className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

function AdicionarLinha({ rotulo, onClick }: { rotulo: string; onClick: () => void }) {
  return (
    <Button size="sm" variant="secondary" onClick={onClick}>
      <Plus className="h-3.5 w-3.5" />
      {rotulo}
    </Button>
  );
}

/** A frase do estado vazio, que é normal numa semana recém-criada. */
function SecaoVazia({ texto }: { texto: string }) {
  return <p className="py-2 text-xs text-muted-foreground">{texto}</p>;
}

/** A moldura que rola na horizontal, com a barra discreta da casa. */
function Rolagem({ minimo, children }: { minimo: string; children: React.ReactNode }) {
  return (
    <div className="kanban-scroll -mx-4 overflow-x-auto px-4">
      <table className={`w-full ${minimo} border-collapse`}>{children}</table>
    </div>
  );
}

/* ------------------------------------------- aba 2 — Entregas da semana */

export function DeliveriesSection({
  reportId,
  deliveries,
}: {
  reportId: string;
  deliveries: readonly DeliveryItem[];
}) {
  const enviar = useCallback(
    (rows: readonly DeliveryItem[]) =>
      salvarSecao({
        kind: "delivery",
        reportId,
        rows: rows.map((r) => ({
          day: r.day || null,
          block: r.block || null,
          expected: r.expected,
          health: r.health ?? null,
          evidence: r.evidence ?? null,
          note: r.note ?? null,
        })),
      }),
    [reportId],
  );
  const secao = useSecao(deliveries, enviar);
  const contagem = contarEntregas(secao.rows);

  return (
    <SectionCard
      title="Entregas da semana"
      description="O que a semana se comprometeu a entregar. A evidência é o link ou o print."
      onSave={secao.salvar}
      sujo={secao.sujo}
      salvando={secao.salvando}
      salvo={secao.salvo}
      erro={secao.erro}
      footnote={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="text-emerald-700 dark:text-emerald-300">🟢 No ritmo: {contagem.onTrack}</span>
            <span className="text-amber-700 dark:text-amber-300">🟡 Atenção: {contagem.attention}</span>
            <span className="text-red-700 dark:text-red-300">🔴 Travado: {contagem.blocked}</span>
            <span className="text-muted-foreground">Sem resposta: {contagem.pending}</span>
          </div>
          <AdicionarLinha
            rotulo="Adicionar entrega"
            onClick={() => secao.adicionar({ order: secao.rows.length, day: "", block: "", expected: "" })}
          />
        </div>
      }
    >
      {secao.rows.length === 0 ? (
        <SecaoVazia texto="Nenhuma entrega registrada. Use “Adicionar entrega” para montar a semana." />
      ) : (
        <Rolagem minimo="min-w-[920px]">
          <thead>
            <tr className="border-b border-border">
              <Th className="w-[110px]">Dia</Th>
              <Th className="w-[150px]">Bloco</Th>
              <Th className="min-w-[240px]">Entrega prevista</Th>
              <Th className="w-[150px]">Status</Th>
              <Th className="w-[180px]">Evidência</Th>
              <Th className="w-[200px]">Observação</Th>
              <Th className="w-[44px]"><span className="sr-only">Excluir</span></Th>
            </tr>
          </thead>
          <tbody>
            {secao.rows.map((row, i) => (
              <tr key={row.id} className="border-b border-border/60 last:border-0">
                <td className="px-2 py-1.5 align-middle">
                  <Input aria-label={`Dia da entrega ${i + 1}`} className="h-9 text-xs" placeholder="Segunda"
                    value={row.day} onChange={(e) => secao.alterar(row.id, { day: e.target.value })} />
                </td>
                <td className="px-2 py-1.5 align-middle">
                  <Input aria-label={`Bloco da entrega ${i + 1}`} className="h-9 text-xs" placeholder="Planejamento"
                    value={row.block} onChange={(e) => secao.alterar(row.id, { block: e.target.value })} />
                </td>
                <td className="px-2 py-1.5 align-middle">
                  <Input aria-label={`Entrega prevista ${i + 1}`} className="h-9 text-xs" placeholder="O que será entregue"
                    value={row.expected} onChange={(e) => secao.alterar(row.id, { expected: e.target.value })} />
                </td>
                <td className="px-2 py-1.5 align-middle">
                  <HealthSelect ariaLabel={`Status da entrega ${i + 1}`} value={row.health}
                    onChange={(health) => secao.alterar(row.id, { health })} />
                </td>
                <td className="px-2 py-1.5 align-middle">
                  <EvidenceField ariaLabel={`Evidência da entrega ${i + 1}`} value={row.evidence}
                    onChange={(evidence) => secao.alterar(row.id, { evidence })} />
                </td>
                <td className="px-2 py-1.5 align-middle">
                  <Input aria-label={`Observação da entrega ${i + 1}`} className="h-9 text-xs"
                    value={row.note ?? ""} onChange={(e) => secao.alterar(row.id, { note: e.target.value })} />
                </td>
                <td className="px-2 py-1.5 align-middle">
                  <RemoverLinha rotulo={`Excluir entrega ${i + 1}`} onClick={() => secao.remover(row.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </Rolagem>
      )}
    </SectionCard>
  );
}

/* ------------------------------------------ aba 3 — Canais e métricas */

export function MetricsSection({
  reportId,
  metrics,
}: {
  reportId: string;
  metrics: readonly MetricItem[];
}) {
  const enviar = useCallback(
    (rows: readonly MetricItem[]) =>
      salvarSecao({
        kind: "metric",
        reportId,
        rows: rows.map((r) => ({
          channel: r.channel,
          metric: r.metric,
          previous: r.previous ?? null,
          current: r.current ?? null,
          target: r.target ?? null,
          health: r.health ?? null,
          reading: r.reading ?? null,
        })),
      }),
    [reportId],
  );
  const secao = useSecao(metrics, enviar);

  const semLeitura = secao.rows.filter((r) => r.current !== undefined && !(r.reading ?? "").trim()).length;

  return (
    <SectionCard
      title="Canais e métricas"
      description="Números reais dos insights das plataformas, sem estimativa. A variação é calculada."
      onSave={secao.salvar}
      sujo={secao.sujo}
      salvando={secao.salvando}
      salvo={secao.salvo}
      erro={secao.erro}
      footnote={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs">
            {semLeitura > 0 ? (
              <span className="text-amber-700 dark:text-amber-300">
                {semLeitura} {semLeitura === 1 ? "métrica preenchida" : "métricas preenchidas"} sem leitura.
                Número sem o porquê não fecha a semana.
              </span>
            ) : (
              <span className="text-muted-foreground">
                Regra de ouro: todo número vem com “o porquê” e “o próximo passo”.
              </span>
            )}
          </p>
          <AdicionarLinha
            rotulo="Adicionar métrica"
            onClick={() => secao.adicionar({ order: secao.rows.length, channel: "", metric: "" })}
          />
        </div>
      }
    >
      {secao.rows.length === 0 ? (
        <SecaoVazia texto="Nenhuma métrica registrada. Use “Adicionar métrica” para escolher o que esta semana mede." />
      ) : (
        <Rolagem minimo="min-w-[1000px]">
          <thead>
            <tr className="border-b border-border">
              <Th className="w-[170px]">Canal</Th>
              <Th className="min-w-[170px]">Métrica</Th>
              <Th className="w-[100px]">Anterior</Th>
              <Th className="w-[100px]">Atual</Th>
              <Th className="w-[90px]">Variação</Th>
              <Th className="w-[130px]">Meta/Benchmark</Th>
              <Th className="w-[150px]">Status</Th>
              <Th className="w-[200px]">Leitura (o porquê)</Th>
              <Th className="w-[44px]"><span className="sr-only">Excluir</span></Th>
            </tr>
          </thead>
          <tbody>
            {secao.rows.map((row, i) => {
              const delta = variacao(row.previous, row.current);
              return (
                <tr key={row.id} className="border-b border-border/60 last:border-0">
                  <td className="px-2 py-1.5 align-middle">
                    <Input aria-label={`Canal da métrica ${i + 1}`} className="h-9 text-xs" placeholder="Instagram"
                      value={row.channel} onChange={(e) => secao.alterar(row.id, { channel: e.target.value })} />
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <Input aria-label={`Nome da métrica ${i + 1}`} className="h-9 text-xs" placeholder="Alcance (contas)"
                      value={row.metric} onChange={(e) => secao.alterar(row.id, { metric: e.target.value })} />
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <Input aria-label={`Métrica ${i + 1}: semana anterior`} className="h-9 text-xs" inputMode="decimal"
                      value={escreverNumero(row.previous)}
                      onChange={(e) => secao.alterar(row.id, { previous: lerNumero(e.target.value) })} />
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <Input aria-label={`Métrica ${i + 1}: semana atual`} className="h-9 text-xs" inputMode="decimal"
                      value={escreverNumero(row.current)}
                      onChange={(e) => secao.alterar(row.id, { current: lerNumero(e.target.value) })} />
                  </td>
                  {/* A variação é LIDA, nunca digitada: é a conta da planilha. */}
                  <td
                    className={`px-2 py-1.5 align-middle text-xs font-semibold ${
                      delta === undefined
                        ? "text-muted-foreground"
                        : delta > 0
                          ? "text-emerald-700 dark:text-emerald-300"
                          : delta < 0
                            ? "text-red-700 dark:text-red-300"
                            : "text-muted-foreground"
                    }`}
                  >
                    {formatarVariacao(delta)}
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <Input aria-label={`Métrica ${i + 1}: meta`} className="h-9 text-xs"
                      value={row.target ?? ""} onChange={(e) => secao.alterar(row.id, { target: e.target.value })} />
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <HealthSelect ariaLabel={`Métrica ${i + 1}: status`} value={row.health}
                      onChange={(health) => secao.alterar(row.id, { health })} />
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <Input aria-label={`Métrica ${i + 1}: leitura`} className="h-9 text-xs" placeholder="por que esse número"
                      value={row.reading ?? ""} onChange={(e) => secao.alterar(row.id, { reading: e.target.value })} />
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <RemoverLinha rotulo={`Excluir métrica ${i + 1}`} onClick={() => secao.remover(row.id)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Rolagem>
      )}
    </SectionCard>
  );
}

/* ---------------------------------------------------- aba 4 — OKRs */

export function OkrsSection({ reportId, okrs }: { reportId: string; okrs: readonly OkrItem[] }) {
  const enviar = useCallback(
    (rows: readonly OkrItem[]) =>
      salvarSecao({
        kind: "okr",
        reportId,
        rows: rows.map((r) => ({
          objective: r.objective || null,
          keyResult: r.keyResult,
          measure: r.measure || null,
          goalLabel: r.goalLabel || null,
          goalValue: r.goalValue ?? null,
          monthlyRead: r.monthlyRead,
          achieved: r.achieved ?? null,
          health: r.health ?? null,
          nextStep: r.nextStep ?? null,
        })),
      }),
    [reportId],
  );
  const secao = useSecao(okrs, enviar);

  return (
    <SectionCard
      title="OKRs"
      description="Apuração semanal. Marcar “leitura mensal” diz que o KR se decide pela média de 4 semanas, nunca por uma semana isolada."
      onSave={secao.salvar}
      sujo={secao.sujo}
      salvando={secao.salvando}
      salvo={secao.salvo}
      erro={secao.erro}
      footnote={
        <div className="flex justify-end">
          <AdicionarLinha
            rotulo="Adicionar resultado-chave"
            onClick={() =>
              secao.adicionar({
                order: secao.rows.length,
                objective: "",
                keyResult: "",
                measure: "",
                goalLabel: "",
                monthlyRead: false,
              })
            }
          />
        </div>
      }
    >
      {secao.rows.length === 0 ? (
        <SecaoVazia texto="Nenhum resultado-chave registrado. Use “Adicionar resultado-chave” para definir o que a semana persegue." />
      ) : (
        <div className="space-y-3">
          {secao.rows.map((row, i) => (
            <div
              key={row.id}
              // O KR de leitura MENSAL fica marcado no fundo: ele não se
              // decide pela semana, e isso precisa aparecer antes do número.
              className={`space-y-3 rounded-lg border border-border p-3 ${
                row.monthlyRead ? "bg-amber-500/[0.06]" : "bg-secondary/40"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-2">
                  <Input aria-label={`Objetivo do resultado-chave ${i + 1}`} className="h-9 text-xs" placeholder="Objetivo"
                    value={row.objective} onChange={(e) => secao.alterar(row.id, { objective: e.target.value })} />
                  <Input aria-label={`Resultado-chave ${i + 1}`} className="h-9 text-sm font-medium" placeholder="Resultado-chave"
                    value={row.keyResult} onChange={(e) => secao.alterar(row.id, { keyResult: e.target.value })} />
                </div>
                <RemoverLinha rotulo={`Excluir resultado-chave ${i + 1}`} onClick={() => secao.remover(row.id)} />
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Input aria-label={`Como se mede o resultado-chave ${i + 1}`} className="h-9 text-xs" placeholder="Como se mede"
                  value={row.measure} onChange={(e) => secao.alterar(row.id, { measure: e.target.value })} />
                <Input aria-label={`Meta do resultado-chave ${i + 1}`} className="h-9 text-xs" placeholder="Meta (como se lê)"
                  value={row.goalLabel} onChange={(e) => secao.alterar(row.id, { goalLabel: e.target.value })} />
                <Input aria-label={`Meta em número do resultado-chave ${i + 1}`} className="h-9 text-xs" inputMode="decimal" placeholder="Meta em número"
                  value={escreverNumero(row.goalValue)}
                  onChange={(e) => secao.alterar(row.id, { goalValue: lerNumero(e.target.value) })} />
                <Input aria-label={`Realizado do resultado-chave ${i + 1}`} className="h-9 text-xs" inputMode="decimal" placeholder="Realizado"
                  value={escreverNumero(row.achieved)}
                  onChange={(e) => secao.alterar(row.id, { achieved: lerNumero(e.target.value) })} />
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border accent-primary"
                    checked={row.monthlyRead}
                    onChange={(e) => secao.alterar(row.id, { monthlyRead: e.target.checked })}
                  />
                  Leitura mensal
                </label>
                {/* As duas contas, LIDAS: % da meta e a média que decide o KR
                    mensal. A média vem do servidor, casando os KRs pelo texto. */}
                <span className="text-muted-foreground">
                  % da meta:{" "}
                  <span className="font-semibold text-foreground">
                    {formatarPercentual(percentualDaMeta(row.achieved, row.goalValue))}
                  </span>
                </span>
                {row.monthlyRead && (
                  <span className="text-muted-foreground">
                    Média de 4 semanas:{" "}
                    <span className="font-semibold text-foreground">{formatarNumero(row.fourWeekAverage)}</span>
                  </span>
                )}
                <div className="ml-auto w-[150px]">
                  <HealthSelect ariaLabel={`Status do resultado-chave ${i + 1}`} value={row.health}
                    onChange={(health) => secao.alterar(row.id, { health })} />
                </div>
              </div>

              <Input aria-label={`Próximo passo do resultado-chave ${i + 1}`} className="h-9 text-xs" placeholder="Próximo passo"
                value={row.nextStep ?? ""} onChange={(e) => secao.alterar(row.id, { nextStep: e.target.value })} />
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

/* ------------------------------------------------- aba 6 — One-on-one */

export function AgendaSection({ reportId, agenda }: { reportId: string; agenda: readonly AgendaItem[] }) {
  const enviar = useCallback(
    (rows: readonly AgendaItem[]) =>
      salvarSecao({ kind: "agenda", reportId, rows: rows.map((r) => ({ id: r.id, answer: r.answer ?? null })) }),
    [reportId],
  );
  const secao = useSecao(agenda, enviar);
  const total = secao.rows.reduce((soma, r) => soma + r.minutes, 0);

  return (
    <SectionCard
      title="One-on-one"
      description="As perguntas da conversa de sexta. Respondidas antes da reunião, elas viram pauta em vez de improviso."
      onSave={secao.salvar}
      sujo={secao.sujo}
      salvando={secao.salvando}
      salvo={secao.salvo}
      erro={secao.erro}
      footnote={<p className="text-xs text-muted-foreground">{total} minutos no total.</p>}
    >
      {/* SEM "adicionar" e SEM lixeira: a pauta é roteiro fixo, e só a
          resposta se escreve. Deixar a pergunta editável apagaria a diferença
          entre "não respondi" e "mudei a pergunta". */}
      <div className="space-y-3">
        {secao.rows.map((row) => (
          <div key={row.id} className="space-y-1.5">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {row.block} · {row.minutes} min
              </span>
            </div>
            <p className="text-sm font-medium text-foreground">{row.question}</p>
            <Textarea
              aria-label={`Resposta: ${row.question}`}
              rows={2}
              placeholder="Resposta"
              value={row.answer ?? ""}
              onChange={(e) => secao.alterar(row.id, { answer: e.target.value })}
            />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
