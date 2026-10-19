"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PeriodoFiltro } from "@/components/shared/periodo-filtro";
import { Card, CardContent } from "@/components/ui/card";
import { useFilterQuery } from "@/hooks/use-filter-query";

const selectClass =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";

/**
 * Filtros da listagem de Selects. Mesma mecânica do resto do app: o estado
 * vive na URL, texto com debounce e o restante aplicando na hora.
 *
 * "Situação do Select" e "Situação financeira" são coisas diferentes e por
 * isso são dois filtros: um contrato ativo pode estar com parcela vencida, e
 * um encerrado pode estar quitado.
 */
export function SelectFiltros({
  defaults,
  plans,
  responsibles,
}: {
  defaults: { q: string; plano: string; estado: string; responsavel: string; de: string; ate: string; financeiro: string };
  plans: { id: string; name: string }[];
  responsibles: { id: string; name: string }[];
}) {
  const f = useFilterQuery(
    { q: defaults.q },
    {
      instant: {
        plano: defaults.plano,
        estado: defaults.estado,
        responsavel: defaults.responsavel,
        de: defaults.de,
        ate: defaults.ate,
        financeiro: defaults.financeiro,
      },
    },
  );

  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-3 pt-5">
        <div className="flex-1 space-y-1.5" style={{ minWidth: 200 }}>
          <Label>Cliente</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8 pr-9"
              placeholder="Código ou nome"
              value={f.text.q}
              onChange={(e) => f.setText("q", e.target.value)}
            />
            {f.text.q && (
              <button
                type="button"
                onClick={() => f.clear("q")}
                aria-label="Limpar busca"
                className="absolute right-2 top-2 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="space-y-1.5" style={{ minWidth: 150 }}>
          <Label>Plano</Label>
          <select className={selectClass} value={f.instant.plano} onChange={(e) => f.setInstant("plano", e.target.value)}>
            <option value="">Todos</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div className="space-y-1.5" style={{ minWidth: 140 }}>
          <Label>Situação</Label>
          <select className={selectClass} value={f.instant.estado} onChange={(e) => f.setInstant("estado", e.target.value)}>
            <option value="">Todas</option>
            <option value="ATIVO">Ativo</option>
            <option value="AGENDADO">Agendado</option>
            <option value="ENCERRADO">Encerrado</option>
            <option value="CANCELADO">Cancelado</option>
          </select>
        </div>

        <div className="space-y-1.5" style={{ minWidth: 170 }}>
          <Label>Situação financeira</Label>
          <select className={selectClass} value={f.instant.financeiro} onChange={(e) => f.setInstant("financeiro", e.target.value)}>
            <option value="">Todas</option>
            <option value="EM_DIA">Em dia</option>
            <option value="VENCIDAS">Com parcelas vencidas</option>
            <option value="QUITADO">Quitado</option>
          </select>
        </div>

        <div className="space-y-1.5" style={{ minWidth: 160 }}>
          <Label>Responsável</Label>
          <select className={selectClass} value={f.instant.responsavel} onChange={(e) => f.setInstant("responsavel", e.target.value)}>
            <option value="">Todos</option>
            {responsibles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>

        <PeriodoFiltro
          de={f.instant.de}
          ate={f.instant.ate}
          onChange={(p) => f.setInstantMany(p)}
          setor="servico"
          titulo="Início"
          id="financeiro-select"
        />
      </CardContent>
    </Card>
  );
}
