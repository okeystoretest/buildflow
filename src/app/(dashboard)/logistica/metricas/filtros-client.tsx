"use client";

import { Label } from "@/components/ui/label";
import { PeriodoFiltro } from "@/components/shared/periodo-filtro";
import { Card, CardContent } from "@/components/ui/card";
import { useFilterQuery } from "@/hooks/use-filter-query";

/**
 * Filtros da tela de Métricas: período (data de criação do pedido) e Loja de
 * Origem. Todos instantâneos — não há campo de texto a debouncear aqui.
 */
export function MetricasFiltros({
  defaultDe,
  defaultAte,
  defaultLoja,
  lojas,
}: {
  defaultDe: string;
  defaultAte: string;
  defaultLoja: string;
  lojas: { id: string; name: string }[];
}) {
  const f = useFilterQuery(
    {},
    { instant: { de: defaultDe, ate: defaultAte, loja: defaultLoja } },
  );

  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-3 pt-5">
        <PeriodoFiltro
          de={f.instant.de}
          ate={f.instant.ate}
          onChange={(p) => f.setInstantMany(p)}
          setor="distribuicao"
          titulo="Criação"
          id="logistica-metricas"
        />
        <div className="flex-1 space-y-1.5" style={{ minWidth: 200 }}>
          <Label>Loja de Origem</Label>
          <select
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
            value={f.instant.loja}
            onChange={(e) => f.setInstant("loja", e.target.value)}
          >
            <option value="">Todas as lojas</option>
            {lojas.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
      </CardContent>
    </Card>
  );
}
