"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { setSelectStepDone } from "@/lib/actions/select-roadmap";
import { canCompleteStep, canUndoStep, roadmapProgress } from "@/lib/select-roadmap";
import type { SelectStepRow } from "@/lib/select-queries";

/**
 * ROADMAP DE ENTREGA — a régua do contrato, avançada por checkbox.
 *
 * HORIZONTAL (escolha do dono em 26/10/2026, sobre a vertical anterior): a
 * régua é uma linha do tempo, e uma linha do tempo deitada diz "isto avança
 * até terminar" sem precisar de legenda. Em tela estreita ela NÃO vira
 * vertical nem é cortada — rola dentro do próprio card (`overflow-x-auto`),
 * porque o `html, body { overflow-x: hidden }` do `globals.css` corta o que
 * transborda a página, mas não interfere num rolador interno.
 *
 * A ETAPA É O CHECKBOX. Não há mais botão "Concluir"/"Desfazer" ao lado: o
 * controle e o estado viraram o mesmo objeto, que é o que um binário pede. O
 * `<input>` é um checkbox nativo (`sr-only`), não uma div com `onClick`:
 * teclado, leitor de tela e o estado "marcado" vêm prontos e corretos.
 *
 * A ORDEM continua sendo a regra de pré-requisito: só fica habilitada a
 * próxima pendente (para marcar) ou a última concluída (para desmarcar). Isso
 * é conveniência da tela — a guarda de verdade está em `setSelectStepDone`,
 * no servidor, e o `title` do desabilitado diz por que não dá.
 *
 * O HISTÓRICO fica abaixo, numa lista só, do mais recente ao mais antigo. Um
 * desdobrável por etapa seria dez controles para a mesma pergunta ("quem
 * mexeu nisto?"), e a resposta útil é quase sempre a última linha.
 */
export function SelectRoadmapCard({
  steps,
  bloqueado,
  onErro,
}: {
  steps: SelectStepRow[];
  /** Contrato cancelado: a régua vira leitura. */
  bloqueado: boolean;
  /**
   * Onde o erro aparece. Quem já tem uma área de mensagens na tela (o detalhe
   * do Financeiro) passa a sua; quem não tem deixa em branco e o card mostra o
   * erro aqui dentro — assim a tela da vendedora não precisa de um componente
   * de cliente só para segurar esse estado.
   */
  onErro?: (texto: string) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  const [historicoAberto, setHistoricoAberto] = useState(false);

  const estados = steps.map((e) => ({ sortOrder: e.sortOrder, done: e.done }));
  const { done, total, percent } = roadmapProgress(estados);

  // Um histórico só, de todas as etapas, do mais recente ao mais antigo. A
  // ordenação é por `at` (ISO) e não pelo rótulo formatado, que é texto.
  const historico = steps
    .flatMap((e) => e.events.map((ev) => ({ ...ev, etapa: e.label })))
    .sort((a, b) => b.at.localeCompare(a.at));

  function alternar(stepId: string, novoDone: boolean) {
    setErroLocal(null);
    start(async () => {
      const res = await setSelectStepDone({ stepId, done: novoDone });
      if (res.ok) router.refresh();
      else if (onErro) onErro(res.error);
      else setErroLocal(res.error);
    });
  }

  if (total === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Roadmap de entrega</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {/* Só acontece em contrato anterior ao roadmap. Dizer o que fazer
              vale mais que um vazio mudo. */}
          Este Select não tem régua de entrega. Ela é gerada na adesão, a partir
          dos benefícios do plano marcados como entregáveis.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span>Roadmap de entrega</span>
          <span className="font-data text-sm font-normal text-muted-foreground">
            {done} de {total} · {percent}%
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {erroLocal && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-sm text-destructive"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {erroLocal}
          </p>
        )}

        {/* Barra decorativa: o número no título já diz o progresso a quem não a
            enxerga, por isso ela sai da árvore de acessibilidade. */}
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary" aria-hidden>
          <div
            className="h-full rounded-full bg-servico transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* A régua. `pb-1` reserva o trilho da barra de rolagem quando ela
            aparece, para não encostar no texto da última linha. */}
        <div className="kanban-scroll -mx-1 overflow-x-auto px-1 pb-1">
          <ol className="flex min-w-max">
            {steps.map((e, i) => {
              const podeConcluir = canCompleteStep(estados, e.sortOrder);
              const podeDesmarcar = canUndoStep(estados, e.sortOrder);
              const habilitada = !bloqueado && (podeConcluir || podeDesmarcar);
              const ultima = i === steps.length - 1;
              const proximaFeita = !ultima && steps[i + 1].done;

              // Por que não dá para mexer. O desabilitado mudo faz a pessoa
              // clicar de novo achando que a tela travou.
              const motivo = bloqueado
                ? "Este Select foi cancelado: a régua de entrega não se altera."
                : e.done
                  ? "Desmarque a etapa seguinte antes desta."
                  : "Conclua a etapa anterior antes desta.";

              return (
                // A largura da coluna é o que decide QUANTAS etapas cabem sem
                // rolar. 8rem em vez de 9.5rem rende duas a mais por tela; o
                // marcador e os textos crescem mesmo assim, porque quem manda
                // na altura é o rótulo e não eles.
                <li
                  key={e.id}
                  className="relative flex min-w-[8rem] flex-1 flex-col items-center"
                >
                  {/* Os fios que ligam os marcadores. Ficam atrás e não captam
                      clique: o alvo é o marcador e o texto, não a linha, que
                      encosta no vizinho. O segmento à esquerda da etapa N é a
                      ligação "N-1 → N", então ele acende com a PRÓPRIA N. */}
                  {i > 0 && (
                    <span
                      aria-hidden
                      className={
                        "pointer-events-none absolute left-0 top-[1.375rem] h-0.5 w-1/2 transition-colors duration-300 " +
                        (e.done ? "bg-servico" : "bg-border")
                      }
                    />
                  )}
                  {!ultima && (
                    <span
                      aria-hidden
                      className={
                        "pointer-events-none absolute right-0 top-[1.375rem] h-0.5 w-1/2 transition-colors duration-300 " +
                        (proximaFeita ? "bg-servico" : "bg-border")
                      }
                    />
                  )}

                  {/* `flex-1` aqui e no rótulo: as etapas esticam até a altura
                      da mais alta e o rótulo come a sobra, então a data fica
                      colada no rodapé e TODAS as datas da régua se alinham,
                      não importa em quantas linhas o nome do benefício quebre. */}
                  <label
                    // O nome entra SEMPRE no title, e não só o motivo: ele é a
                    // saída do `line-clamp-3` do rótulo logo abaixo.
                    title={habilitada ? e.label : `${e.label} — ${motivo}`}
                    className={
                      "relative flex flex-1 flex-col items-center gap-2 px-2 text-center " +
                      (habilitada ? "cursor-pointer" : "cursor-not-allowed")
                    }
                  >
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={e.done}
                      disabled={!habilitada || pending}
                      aria-label={`Etapa ${e.sortOrder}: ${e.label}`}
                      onChange={(ev) => alternar(e.id, ev.target.checked)}
                    />
                    <span
                      aria-hidden
                      className={
                        "grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 font-data text-sm " +
                        "transition-colors duration-200 " +
                        "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 " +
                        "peer-focus-visible:ring-offset-card " +
                        (e.done
                          ? "border-servico bg-servico text-servico-fg"
                          : habilitada
                            // A próxima a fazer fica com a borda da cor do
                            // Select: é o único convite de "clique aqui" que
                            // sobrou depois que o botão saiu.
                            ? "border-servico bg-background text-servico-text peer-hover:bg-servico/10"
                            : "border-border bg-background text-muted-foreground")
                      }
                    >
                      {e.done ? <Check className="h-5 w-5" /> : e.sortOrder}
                    </span>
                    {/* O rótulo segue em `text-xs`, e é o único que não cresce:
                        ele é quem determina a largura da coluna, e aumentá-lo
                        desfaria as duas etapas a mais que acabamos de ganhar.
                        `font-medium` em todas compensa em peso o que não veio
                        em corpo. */}
                    {/* `line-clamp-3` porque as colunas esticam até a altura da
                        MAIS ALTA: um único benefício de seis linhas ("2 fretes
                        gratuitos/mês (convertidos em crédito de R$ 200,00 no
                        pedido seguinte)") somava quatro linhas de vão morto às
                        outras dezessete. O nome inteiro continua no `title` e
                        no histórico abaixo. */}
                    {/* SEM `flex-1` aqui, e isto não é estilo: com ele o
                        `line-clamp-3` não recorta nada. O clamp limita a
                        ALTURA do elemento a três linhas, e `flex-1` estica
                        essa mesma altura até preencher a coluna — o teto que o
                        clamp impõe nunca é alcançado e o texto derrama inteiro
                        (medido no Chrome 155: 74px de caixa para 99px de
                        conteúdo, sem recorte; sem `flex-1`, 50px = 3 linhas).
                        Quem encosta a data no rodapé é o `mt-auto` dela. */}
                    <span
                      className={
                        "line-clamp-3 max-w-[7rem] text-xs font-medium leading-snug " +
                        (e.done ? "text-foreground" : "text-muted-foreground")
                      }
                    >
                      {e.label}
                    </span>
                    {/* Só a concluída tem data. "Pendente" escrito sob um
                        marcador visivelmente vazio seria a mesma informação
                        duas vezes. */}
                    {e.done && e.doneAtLabel && (
                      <span className="font-data mt-auto pt-1 text-xs text-muted-foreground">
                        {e.doneAtLabel}
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ol>
        </div>

        {/* ------------------------------------------------- histórico --
            RETRAÍDO por padrão: o que a tela vem responder é "em que pé está a
            entrega", e isso a régua acima já diz. O histórico é a segunda
            pergunta ("quem mexeu nisto, e quando"), e aberto de saída ele
            empurrava o acompanhamento de compras para fora da tela.

            A CONTAGEM fica no botão fechado. Sem ela, recolher esconderia que
            existe algo para ver — e o único jeito de descobrir seria clicar. */}
        <div className="border-t border-border pt-4">
          <button
            type="button"
            onClick={() => setHistoricoAberto((v) => !v)}
            aria-expanded={historicoAberto}
            aria-controls="roadmap-historico"
            className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left text-xs font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {historicoAberto
              ? <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
              : <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />}
            <span>Histórico de interações</span>
            {historico.length > 0 && (
              <span className="font-data normal-case tracking-normal">({historico.length})</span>
            )}
          </button>

          <div id="roadmap-historico" hidden={!historicoAberto} className="pt-2">
            {historico.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma etapa foi marcada ainda.
              </p>
            ) : (
              // Rola em vez de crescer sem fim: uma régua de dez etapas marcada e
              // desmarcada algumas vezes empurraria o resto da tela para baixo.
              <ol className="kanban-scroll max-h-60 space-y-2 overflow-y-auto pr-1">
                {historico.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="font-data shrink-0 text-muted-foreground">{h.atLabel}</span>
                    <span className="text-foreground">
                      <strong className="font-medium">{h.actorName}</strong>{" "}
                      <span className={h.done ? "text-servico-text" : "text-muted-foreground"}>
                        {h.done ? "concluiu" : "desmarcou"}
                      </span>{" "}
                      {h.etapa}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
