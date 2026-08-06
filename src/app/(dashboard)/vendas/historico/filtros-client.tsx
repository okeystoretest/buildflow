"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useFilterQuery } from "@/hooks/use-filter-query";

/**
 * Filtros do Histórico de Vendas. Busca por comanda (tempo real, debounced) +
 * intervalo de datas (aplica na hora). Sem botões "Filtrar"/"Limpar"; ícone
 * "X" limpa o campo de texto.
 */
export function HistoricoFiltros({
  defaultDe,
  defaultAte,
  defaultComanda,
}: {
  defaultDe: string;
  defaultAte: string;
  defaultComanda: string;
}) {
  const f = useFilterQuery(
    { comanda: defaultComanda },
    { instant: { de: defaultDe, ate: defaultAte } },
  );

  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-3 pt-5">
        <div className="flex-1 space-y-1.5" style={{ minWidth: 200 }}>
          <Label>Buscar por comanda</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8 pr-9"
              placeholder="Nº da comanda"
              value={f.text.comanda}
              onChange={(e) => f.setText("comanda", e.target.value)}
            />
            {f.text.comanda && (
              <button
                type="button"
                onClick={() => f.clear("comanda")}
                aria-label="Limpar busca"
                className="absolute right-2 top-2 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>De</Label>
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
