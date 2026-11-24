"use client";

import { useState } from "react";
import { ArrowRight, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/shared/modal";
import { criarRelatorio } from "@/lib/actions/relatorio-semanal";
import { segundaDaSemana, semanaIso, somarDias } from "@/lib/relatorio-semanal-math";

/** Segunda a sexta da semana corrente — a janela da rotina da planilha. */
function semanaCorrente() {
  const hoje = new Date().toISOString().slice(0, 10);
  const segunda = segundaDaSemana(hoje);
  return {
    weekNumber: semanaIso(segunda),
    periodStart: segunda,
    periodEnd: somarDias(segunda, 4),
  };
}

/**
 * A semana nova: quando ela é.
 *
 * Os três campos vêm DERIVADOS da data de hoje pela regra ISO-8601. Na
 * planilha, "Semana nº" e "Período" eram digitados separados, e a semana 46
 * com o período da 45 era o erro mais comum do arquivo. Seguem editáveis:
 * relatório atrasado se preenche com o período dele, não com o de hoje.
 *
 * Criar a semana é o que dá um lugar no banco para os blocos gravarem — por
 * isso este passo existe separado e vem antes. Ao criar, a tela abre a semana
 * no editor.
 *
 * DIFERENÇA DO BUILD.CONNECT, por enquanto: lá os seis blocos são preenchidos
 * em páginas DENTRO deste modal, com cada "Próximo" gravando o bloco à vista.
 * Aqui o editor ainda tem um bloco só, então criar leva direto a ele. Quando
 * as outras cinco seções entrarem, o fluxo em etapas vem com elas.
 */
export function NewReportModal({
  onClose,
  onCriada,
}: {
  onClose: () => void;
  /** Recebe o id da semana criada, para a tela abri-la. */
  onCriada: (id: string) => void;
}) {
  const inicial = semanaCorrente();
  const [weekNumber, setWeekNumber] = useState(String(inicial.weekNumber));
  const [periodStart, setPeriodStart] = useState(inicial.periodStart);
  const [periodEnd, setPeriodEnd] = useState(inicial.periodEnd);
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  /** Mover o início ARRASTA o fim: a janela é de uma semana de trabalho. */
  function trocarInicio(valor: string) {
    setPeriodStart(valor);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return;
    setPeriodEnd(somarDias(valor, 4));
    setWeekNumber(String(semanaIso(valor)));
  }

  async function criar() {
    if (criando) return;
    setCriando(true);
    setErro(null);
    const r = await criarRelatorio({
      weekNumber: Number(weekNumber),
      periodStart,
      periodEnd,
    });
    setCriando(false);
    if (!r.ok) {
      setErro(r.error);
      return;
    }
    onCriada(r.data.id);
  }

  return (
    <Modal onClose={() => !criando && onClose()} largura="max-w-lg">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground">Nova semana</h2>
          <p className="text-sm text-muted-foreground">
            Primeiro quando é a semana. Ela nasce com a pauta do one-on-one.
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} disabled={criando} aria-label="Fechar">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="semana-numero">Semana nº</Label>
          <Input
            id="semana-numero"
            inputMode="numeric"
            value={weekNumber}
            onChange={(e) => setWeekNumber(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="semana-inicio">De</Label>
          <Input
            id="semana-inicio"
            type="date"
            value={periodStart}
            onChange={(e) => trocarInicio(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="semana-fim">Até</Label>
          <Input
            id="semana-fim"
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
          />
        </div>
      </div>

      {erro && <p className="mt-3 text-xs text-destructive">{erro}</p>}

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={criando}>
          Cancelar
        </Button>
        <Button onClick={criar} disabled={criando}>
          {criando && <Loader2 className="h-4 w-4 animate-spin" />}
          Próximo
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </Modal>
  );
}
