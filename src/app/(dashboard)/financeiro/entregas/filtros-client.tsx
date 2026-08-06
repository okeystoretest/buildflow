"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useFilterQuery } from "@/hooks/use-filter-query";

export interface DriverOption {
  id: string;
  name: string;
}

/**
 * Filtros do submódulo "Pagamentos de Motoristas" (ex-"Entregas") do
 * Financeiro. Busca por comanda/vendedor em tempo real (debounced); filtro de
 * Motorista (select) e intervalo de datas aplicam na hora. Sem botões
 * "Filtrar"/"Limpar"; ícone "X" limpa o texto.
 */
export function EntregasFinFiltros({
  drivers,
  defaultBusca,
  defaultDriver,
  defaultDe,
  defaultAte,
}: {
  drivers: DriverOption[];
  defaultBusca: string;
  defaultDriver: string;
  defaultDe: string;
  defaultAte: string;
}) {
  const f = useFilterQuery(
    { busca: defaultBusca },
    { instant: { driver: defaultDriver, de: defaultDe, ate: defaultAte } },
  );

  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-3 pt-5">
        <div className="flex-1 space-y-1.5" style={{ minWidth: 220 }}>
          <Label>Buscar por comanda ou vendedor(a)</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8 pr-9"
              placeholder="Nº da comanda ou nome do vendedor(a)"
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
          <Label>Motorista (ativo)</Label>
          <select
            className="h-10 rounded-lg border border-input bg-background px-2 text-sm"
            value={f.instant.driver}
            onChange={(e) => f.setInstant("driver", e.target.value)}
          >
            <option value="">Todos</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
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
