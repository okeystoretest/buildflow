"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useFilterQuery } from "@/hooks/use-filter-query";

/**
 * Busca por NOME da candidata, no cabeçalho do bloco de Candidaturas.
 *
 * Morava na barra de filtros até 30/10/2026, quando saiu de lá a pedido do
 * dono. O lugar faz sentido: procurar uma candidata pelo nome é o que se faz
 * olhando a lista, e com a barra escondida atrás de um botão a busca ficava a
 * dois cliques de distância do que ela filtra.
 *
 * Mesmo desenho de `vendas/busca-client.tsx`: campo com lupa, debounce do
 * `useFilterQuery` e um "X" que limpa na hora.
 *
 * HOOK PRÓPRIO, separado do da barra de filtros — e é por isso que
 * `useFilterQuery` passou a PRESERVAR os params que não conhece. Com a versão
 * antiga, que montava a URL só com as chaves do próprio hook, digitar aqui
 * apagaria status, compra, período e o resto; e mexer num filtro apagaria a
 * busca. O estado de cada controle é a URL, e cada um escreve só a sua chave.
 */
export function AnaliseClientesBusca({ defaultBusca }: { defaultBusca: string }) {
  const f = useFilterQuery({ busca: defaultBusca });

  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
      <Input
        aria-label="Buscar candidata pelo nome"
        className="pl-8 pr-9"
        placeholder="Buscar candidata..."
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
  );
}
