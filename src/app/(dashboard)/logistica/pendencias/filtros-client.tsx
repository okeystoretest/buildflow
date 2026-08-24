"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useFilterQuery } from "@/hooks/use-filter-query";

/**
 * Filtros do Relatório de Pendências. Mesmo padrão das demais listagens:
 * busca com debounce, datas e select aplicam na hora, sem botão "Filtrar".
 * O período incide sobre a DATA DE ABERTURA da pendência.
 */
export function PendenciasFiltros({
  defaultBusca,
  defaultDe,
  defaultAte,
  defaultSituacao,
}: {
  defaultBusca: string;
  defaultDe: string;
  defaultAte: string;
  defaultSituacao: string;
}) {
  const f = useFilterQuery(
    { busca: defaultBusca },
    { instant: { de: defaultDe, ate: defaultAte, situacao: defaultSituacao } },
  );

  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-3 pt-5">
        <div className="flex-1 space-y-1.5" style={{ minWidth: 220 }}>
          <Label>Buscar por pedido, comanda, cliente ou vendedora</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8 pr-9"
              placeholder="N° do pedido, comanda, cliente ou vendedora"
              value={f.text.busca}
              onChange={(e) => f.setText("busca", e.target.value)}
            />
            {f.text.busca && (
              <button
                type="button"
                onClick={() => f.clear("busca")}
                aria-label="Limpar busca"
                className="absolute right-2 top-2 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Situação</Label>
          <select
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
            value={f.instant.situacao}
            onChange={(e) => f.setInstant("situacao", e.target.value)}
          >
            <option value="todas">Todas</option>
            <option value="abertas">Pendentes agora</option>
            <option value="resolvidas">Já resolvidas</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <Label>Aberta de</Label>
          <Input type="date" value={f.instant.de} onChange={(e) => f.setInstant("de", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Até</Label>
          <Input type="date" value={f.instant.ate} onChange={(e) => f.setInstant("ate", e.target.value)} />
        </div>
      </CardContent>
    </Card>
  );
}
