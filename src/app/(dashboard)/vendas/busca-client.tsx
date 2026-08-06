"use client";

import { useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useFilterQuery } from "@/hooks/use-filter-query";

/**
 * Barra de busca da listagem de Vendas. Filtra por Número do Pedido ou Comanda.
 *
 * Busca em TEMPO REAL: aplica automaticamente ao digitar (debounce), sem os
 * botões "Buscar"/"Limpar". Ícone "X" à direita para limpar o campo.
 */
export function VendasBusca({ defaultBusca }: { defaultBusca: string }) {
  // Mantém o param existente (?busca=) desta tela.
  const params = useSearchParams();
  const f = useFilterQuery({ busca: params.get("busca") ?? defaultBusca ?? "" });

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1" style={{ minWidth: 200 }}>
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8 pr-9"
          placeholder="Buscar por nº do pedido ou comanda..."
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
  );
}
