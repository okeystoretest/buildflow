"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { excluirBloqueio, salvarBloqueio } from "@/lib/actions/relatorio-semanal";
import type { BlockerItem, WeeklyHealth } from "@/lib/relatorio-semanal-math";
import { HealthSelect } from "./health-select";
import { SectionCard } from "./section-card";
import { useRegistrarPendencia } from "./pendencias";

/**
 * Aba 5 — Bloqueios e Decisões.
 *
 * A ÚNICA SEÇÃO SEM MODELO FIXO: a planilha trazia cinco linhas vazias
 * numeradas de 1 a 5, o que é o mesmo que nenhuma linha — e um teto de cinco
 * para uma semana ruim.
 *
 * Cada bloqueio SALVA POR CONTA PRÓPRIA, e não a seção inteira como as de
 * linhas: aqui as linhas nascem e morrem, e um "Salvar" de seção teria de
 * reconciliar criações, edições e exclusões num payload só para gravar o que
 * normalmente é UMA linha.
 */

/** Rascunho local de um bloqueio. Vira linha no banco ao salvar. */
interface Rascunho {
  title: string;
  impact: string;
  needs: string;
  dueDate: string;
  health?: WeeklyHealth;
  resolution: string;
}

const VAZIO: Rascunho = {
  title: "",
  impact: "",
  needs: "",
  dueDate: "",
  health: undefined,
  resolution: "",
};

export function BlockersSection({
  reportId,
  blockers,
}: {
  reportId: string;
  blockers: readonly BlockerItem[];
}) {
  const router = useRouter();
  /**
   * A lista que a tela mostra.
   *
   * Estado, e não as props: no modal da semana nova o `detail` é o que a
   * criação devolveu e não muda mais — um bloqueio gravado ali sumiria da
   * tela no instante seguinte. Foi exatamente esse o defeito no repositório
   * de origem.
   */
  const [linhas, setLinhas] = useState<readonly BlockerItem[]>(blockers);
  const [novo, setNovo] = useState<Rascunho | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function gravar(id: string | undefined, dados: Rascunho): Promise<boolean> {
    if (ocupado) return false;
    setOcupado(id ?? "novo");
    setErro(null);
    const r = await salvarBloqueio({
      reportId,
      blockerId: id,
      title: dados.title,
      impact: dados.impact || null,
      needs: dados.needs || null,
      dueDate: dados.dueDate || null,
      health: dados.health ?? null,
      resolution: dados.resolution || null,
    });
    setOcupado(null);
    if (!r.ok) {
      setErro(r.error);
      return false;
    }
    const salvo: BlockerItem = {
      id: r.data.id,
      order: linhas.find((l) => l.id === id)?.order ?? linhas.length,
      title: dados.title,
      impact: dados.impact || undefined,
      needs: dados.needs || undefined,
      dueDate: dados.dueDate || undefined,
      health: dados.health,
      resolution: dados.resolution || undefined,
    };
    setLinhas((atuais) => (id ? atuais.map((l) => (l.id === id ? salvo : l)) : [...atuais, salvo]));
    setNovo(null);
    router.refresh();
    return true;
  }

  async function remover(id: string) {
    if (ocupado) return;
    setOcupado(id);
    setErro(null);
    const r = await excluirBloqueio({ reportId, blockerId: id });
    setOcupado(null);
    if (!r.ok) {
      setErro(r.error);
      return;
    }
    setLinhas((atuais) => atuais.filter((l) => l.id !== id));
    router.refresh();
  }

  return (
    <SectionCard
      title="Bloqueios e decisões"
      description="O que depende de alguém para destravar. É esta lista que vira decisão na reunião de sexta."
      erro={erro}
      footnote={
        !novo ? (
          <Button size="sm" variant="secondary" onClick={() => setNovo({ ...VAZIO })}>
            <Plus className="h-3.5 w-3.5" />
            Adicionar bloqueio
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-2">
        {linhas.length === 0 && !novo && (
          <p className="py-2 text-xs text-muted-foreground">
            Nenhum bloqueio registrado nesta semana. Uma semana sem bloqueio é um ótimo relatório —
            só não vale deixar de registrar o que travou.
          </p>
        )}

        {linhas.map((b) => (
          <BlockerRow
            key={b.id}
            blocker={b}
            ocupado={ocupado === b.id}
            onSave={(dados) => gravar(b.id, dados)}
            onDelete={() => remover(b.id)}
          />
        ))}

        {novo && (
          <BlockerRow
            novo
            ocupado={ocupado === "novo"}
            onSave={(dados) => gravar(undefined, dados)}
            onDelete={() => setNovo(null)}
          />
        )}
      </div>
    </SectionCard>
  );
}

function BlockerRow({
  blocker,
  novo,
  ocupado,
  onSave,
  onDelete,
}: {
  blocker?: BlockerItem;
  novo?: boolean;
  ocupado: boolean;
  onSave: (dados: Rascunho) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [dados, setDados] = useState<Rascunho>({
    title: blocker?.title ?? "",
    impact: blocker?.impact ?? "",
    needs: blocker?.needs ?? "",
    dueDate: blocker?.dueDate ?? "",
    health: blocker?.health,
    resolution: blocker?.resolution ?? "",
  });

  const alterar = (patch: Partial<Rascunho>) => setDados((d) => ({ ...d, ...patch }));
  const pronto = dados.title.trim().length > 0;

  const sujo =
    dados.title !== (blocker?.title ?? "") ||
    dados.impact !== (blocker?.impact ?? "") ||
    dados.needs !== (blocker?.needs ?? "") ||
    dados.dueDate !== (blocker?.dueDate ?? "") ||
    dados.health !== blocker?.health ||
    dados.resolution !== (blocker?.resolution ?? "");

  // O "Salvar" do cabeçalho grava esta linha também — sem isto, o bloqueio
  // seria o único bloco que ele deixaria para trás. SEM TÍTULO NÃO HÁ O QUE
  // GRAVAR (o servidor recusa), então a linha só se registra quando já dá
  // para salvá-la.
  useRegistrarPendencia(pronto && sujo, () => onSave(dados));

  return (
    <div className="rounded-lg border border-border bg-secondary/40 p-3">
      <div className="grid gap-2 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Input
            aria-label="Bloqueio ou decisão necessária"
            className="h-9 text-xs"
            placeholder="Bloqueio ou decisão necessária"
            value={dados.title}
            onChange={(e) => alterar({ title: e.target.value })}
          />
        </div>
        <div className="lg:col-span-3">
          <Input
            aria-label="Impacto (o que trava)"
            className="h-9 text-xs"
            placeholder="O que trava"
            value={dados.impact}
            onChange={(e) => alterar({ impact: e.target.value })}
          />
        </div>
        <div className="lg:col-span-2">
          <Input
            aria-label="Precisa de quem"
            className="h-9 text-xs"
            placeholder="Precisa de quem"
            value={dados.needs}
            onChange={(e) => alterar({ needs: e.target.value })}
          />
        </div>
        <div className="lg:col-span-2">
          <Input
            aria-label="Prazo"
            type="date"
            className="h-9 text-xs"
            value={dados.dueDate}
            onChange={(e) => alterar({ dueDate: e.target.value })}
          />
        </div>
        <div className="lg:col-span-3">
          <HealthSelect
            ariaLabel="Status do bloqueio"
            value={dados.health}
            onChange={(health) => alterar({ health })}
          />
        </div>
        <div className="lg:col-span-6">
          <Input
            aria-label="Resolução"
            className="h-9 text-xs"
            placeholder="Resolução"
            value={dados.resolution}
            onChange={(e) => alterar({ resolution: e.target.value })}
          />
        </div>
        <div className="flex items-center justify-end gap-1.5 lg:col-span-3">
          <Button size="sm" onClick={() => void onSave(dados)} disabled={!pronto || ocupado}>
            {ocupado && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Salvar
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={onDelete}
            disabled={ocupado}
            aria-label={novo ? "Descartar bloqueio" : "Excluir bloqueio"}
            className="h-8 w-8 text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
