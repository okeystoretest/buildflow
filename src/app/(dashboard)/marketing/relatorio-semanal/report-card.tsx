import { Progress } from "@/components/ui/progress";
import { formatarDiaMes } from "@/lib/relatorio-semanal-labels";
import type { WeeklyReportListItem } from "@/lib/relatorio-semanal-data";

/**
 * O card de uma semana na lista.
 *
 * Serve para escolher qual semana abrir SEM abrir nenhuma: quanto da semana já
 * foi respondido, como está o humor dela nos três sinais da planilha, e o
 * destaque — a frase que a reunião de sexta lê primeiro.
 *
 * SÓ O SINAL QUE EXISTE. Os zeros não aparecem: três zeros em toda semana nova
 * seriam ruído na hora de bater o olho na lista. É a mesma regra que a leitura
 * segue ("só aparece o que foi preenchido") e que o traço no lugar do zero
 * segue nas contas — ausência nunca se mostra como zero.
 *
 * O CARD INTEIRO ABRE A SEMANA PARA LEITURA. A camada que recebe o clique é um
 * botão irmão do conteúdo, e não um botão em volta dele: botão dentro de botão
 * é HTML inválido, e quando o lápis da edição entrar (próxima fatia) o teclado
 * perderia um dos dois.
 */
export function ReportCard({
  report,
  onOpen,
}: {
  report: WeeklyReportListItem;
  onOpen: () => void;
}) {
  const ano = report.periodStart.slice(0, 4);
  const total = report.onTrack + report.attention + report.blocked + report.pending;
  const respondidas = total - report.pending;

  return (
    <div className="group relative flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Ver a semana ${report.weekNumber}`}
        className="absolute inset-0 z-10 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      />
      <div>
        <p className="text-base font-semibold text-foreground">Semana {report.weekNumber}</p>
        <p className="text-xs text-muted-foreground">
          {formatarDiaMes(report.periodStart)} a {formatarDiaMes(report.periodEnd)}/{ano}
        </p>
      </div>

      {total === 0 ? (
        <p className="text-xs text-muted-foreground">Sem entregas registradas.</p>
      ) : (
        <div className="space-y-1.5">
          <Progress
            value={(respondidas / total) * 100}
            label={`${respondidas} de ${total} entregas respondidas`}
          />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="text-muted-foreground">
              {respondidas} de {total} {total === 1 ? "entrega" : "entregas"}
            </span>
            {report.onTrack > 0 && (
              <span className="text-emerald-700 dark:text-emerald-300">🟢 {report.onTrack}</span>
            )}
            {report.attention > 0 && (
              <span className="text-amber-700 dark:text-amber-300">🟡 {report.attention}</span>
            )}
            {report.blocked > 0 && (
              <span className="text-red-700 dark:text-red-300">🔴 {report.blocked}</span>
            )}
          </div>
        </div>
      )}

      {report.highlight && (
        <p className="line-clamp-2 text-xs leading-relaxed text-foreground/80">{report.highlight}</p>
      )}

      {report.authorName && (
        <p className="mt-auto text-[11px] text-muted-foreground">Criada por {report.authorName}</p>
      )}
    </div>
  );
}
