"use client";

import { useState } from "react";
import { Pencil, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { Modal } from "@/components/shared/modal";
import {
  HEALTH_LABEL,
  HEALTH_TONE,
  evidenciaEhImagem,
  formatarData,
  formatarNumero,
  formatarPercentual,
  formatarVariacao,
} from "@/lib/relatorio-semanal-labels";
import { percentualDaMeta, variacao, type WeeklyHealth } from "@/lib/relatorio-semanal-math";
import type { WeeklyReportDetail } from "@/lib/relatorio-semanal-data";

/**
 * A semana só para LER.
 *
 * A razão de esta tela existir é uma regra: AQUI SÓ APARECE O QUE FOI
 * PREENCHIDO. Campo em branco não vira linha vazia, bloco sem nada não vira
 * aba, e quem abre na sexta para conferir a semana não passa os olhos por
 * formulário nenhum.
 *
 * É a mesma regra do traço no lugar do zero nas contas, e dos sinais 🟢🟡🔴
 * que não aparecem quando são zero no card: ausência nunca se mostra como
 * conteúdo vazio.
 *
 * A PAUTA é o caso que prova a regra. Ela nasce com as cinco perguntas
 * prontas, então o que conta como preenchido é a RESPOSTA — sem esse filtro,
 * toda semana nova abriria exibindo exatamente o que esta tela existe para não
 * mostrar.
 *
 * Editar é o lápis — daqui e do card.
 */
export function ReportViewModal({
  detail,
  onClose,
  onEdit,
}: {
  detail: WeeklyReportDetail;
  onClose: () => void;
  onEdit: () => void;
}) {
  const blocos = montarBlocos(detail);
  const [aba, setAba] = useState(0);
  const atual = blocos[Math.min(aba, blocos.length - 1)];

  return (
    <Modal onClose={onClose} largura="max-w-3xl">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground">Semana {detail.weekNumber}</h2>
          <p className="text-sm text-muted-foreground">
            {formatarData(detail.periodStart)} a {formatarData(detail.periodEnd)}
            {detail.authorName ? ` · ${detail.authorName}` : ""}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-4">
        {!atual ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Esta semana ainda não tem nada preenchido.
          </p>
        ) : (
          <>
            {/* Uma aba só não é escolha: com um bloco, a barra seria ruído. */}
            {blocos.length > 1 && (
              <Tabs
                items={blocos}
                value={atual.id}
                onValueChange={(id) => setAba(blocos.findIndex((b) => b.id === id))}
              />
            )}
            <div className="space-y-2">{atual.corpo}</div>
          </>
        )}
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Fechar
        </Button>
        {detail.fechada ? (
          <p className="self-center text-xs text-muted-foreground">
            Semana fechada — a seguinte já existe e o período desta acabou.
          </p>
        ) : (
        <Button onClick={onEdit}>
            <Pencil className="h-4 w-4" />
            Editar
          </Button>
        )}
      </div>
    </Modal>
  );
}

interface Bloco {
  id: string;
  label: string;
  corpo: React.ReactNode;
}

/** Só os blocos com alguma coisa dentro, na ordem em que se preenchem. */
function montarBlocos(detail: WeeklyReportDetail): Bloco[] {
  const blocos: Bloco[] = [];

  if (detail.highlight || detail.learning || detail.nextPriority) {
    blocos.push({
      id: "resumo",
      label: "Resumo",
      corpo: (
        <Caixa>
          <Campo label="Destaque da semana" valor={detail.highlight} />
          <Campo label="Principal aprendizado" valor={detail.learning} />
          <Campo label="Prioridade nº 1 da próxima semana" valor={detail.nextPriority} />
        </Caixa>
      ),
    });
  }

  if (detail.deliveries.length > 0) {
    blocos.push({
      id: "entregas",
      label: `Entregas (${detail.deliveries.length})`,
      corpo: detail.deliveries.map((d) => (
        <Caixa key={d.id} titulo={d.expected} acima={[d.day, d.block]} health={d.health}>
          <Evidencia valor={d.evidence} />
          <Campo label="Observação" valor={d.note} />
        </Caixa>
      )),
    });
  }

  if (detail.metrics.length > 0) {
    blocos.push({
      id: "metricas",
      label: `Métricas (${detail.metrics.length})`,
      corpo: detail.metrics.map((m) => (
        <Caixa key={m.id} titulo={m.metric} acima={[m.channel]} health={m.health}>
          {(m.previous !== undefined || m.current !== undefined) && (
            <Campo
              label="Anterior → atual"
              valor={`${formatarNumero(m.previous)} → ${formatarNumero(m.current)} (${formatarVariacao(
                variacao(m.previous, m.current),
              )})`}
            />
          )}
          <Campo label="Meta" valor={m.target} />
          <Campo label="Leitura" valor={m.reading} />
        </Caixa>
      )),
    });
  }

  if (detail.okrs.length > 0) {
    blocos.push({
      id: "okrs",
      label: `OKRs (${detail.okrs.length})`,
      corpo: detail.okrs.map((o) => (
        <Caixa key={o.id} titulo={o.keyResult} acima={[o.objective]} health={o.health}>
          <Campo label="Como se mede" valor={o.measure} />
          <Campo
            label="Meta"
            valor={o.goalValue === undefined ? o.goalLabel : `${o.goalLabel}: ${formatarNumero(o.goalValue)}`}
          />
          {o.achieved !== undefined && (
            <Campo
              label="Realizado"
              valor={`${formatarNumero(o.achieved)} (${formatarPercentual(
                percentualDaMeta(o.achieved, o.goalValue),
              )} da meta)`}
            />
          )}
          {o.monthlyRead && o.fourWeekAverage !== undefined && (
            <Campo label="Média de 4 semanas" valor={formatarNumero(o.fourWeekAverage)} />
          )}
          <Campo label="Próximo passo" valor={o.nextStep} />
        </Caixa>
      )),
    });
  }

  if (detail.blockers.length > 0) {
    blocos.push({
      id: "bloqueios",
      label: `Bloqueios (${detail.blockers.length})`,
      corpo: detail.blockers.map((b) => (
        <Caixa key={b.id} titulo={b.title} health={b.health}>
          <Campo label="Impacto" valor={b.impact} />
          <Campo label="Preciso de" valor={b.needs} />
          {b.dueDate && <Campo label="Prazo" valor={formatarData(b.dueDate)} />}
          <Campo label="Encaminhamento" valor={b.resolution} />
        </Caixa>
      )),
    });
  }

  // A pauta nasce com as perguntas prontas; o que conta como preenchido é a
  // RESPOSTA. Ver o comentário do topo.
  const respondidas = detail.agenda.filter((a) => a.answer);
  if (respondidas.length > 0) {
    blocos.push({
      id: "pauta",
      label: `Pauta (${respondidas.length})`,
      corpo: respondidas.map((a) => (
        <Caixa key={a.id} titulo={a.question} acima={[a.block, `${a.minutes} min`]}>
          <p className="whitespace-pre-wrap text-sm text-foreground">{a.answer}</p>
        </Caixa>
      )),
    });
  }

  return blocos;
}

/** A moldura de uma linha lida: o que ela é em cima, o conteúdo embaixo. */
function Caixa({
  titulo,
  acima,
  health,
  children,
}: {
  titulo?: string;
  acima?: readonly (string | undefined)[];
  health?: WeeklyHealth;
  children: React.ReactNode;
}) {
  const sobrancelha = (acima ?? []).filter(Boolean).join(" · ");

  return (
    <div className="space-y-2 rounded-lg border border-border bg-secondary p-3">
      {(titulo || sobrancelha || health) && (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {sobrancelha && (
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {sobrancelha}
              </p>
            )}
            {titulo && <p className="text-sm font-semibold text-foreground">{titulo}</p>}
          </div>
          {health && <Badge variant={HEALTH_TONE[health]}>{HEALTH_LABEL[health]}</Badge>}
        </div>
      )}
      {children}
    </div>
  );
}

/** Rótulo e valor. Some inteiro quando não há valor — é a regra desta tela. */
function Campo({ label, valor }: { label: string; valor?: string }) {
  if (!valor) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="whitespace-pre-wrap text-sm text-foreground">{valor}</p>
    </div>
  );
}

/** A prova: o print aparece, o link se abre. */
function Evidencia({ valor }: { valor?: string }) {
  if (!valor) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Evidência</p>
      {evidenciaEhImagem(valor) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={valor}
          alt="Evidência da entrega"
          className="mt-1 max-h-48 rounded-lg border border-border"
        />
      ) : (
        <a
          href={valor}
          target="_blank"
          rel="noreferrer"
          className="break-all text-sm text-primary underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        >
          {valor}
        </a>
      )}
    </div>
  );
}
