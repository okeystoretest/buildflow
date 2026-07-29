"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Barra de busca da listagem de Vendas. Filtra por Número do Pedido ou Comanda.
 * Aciona ao pressionar Enter ou clicar em "Buscar"; navega com ?busca=<termo>,
 * que a page usa para filtrar no banco.
 */
export function VendasBusca({ defaultBusca }: { defaultBusca: string }) {
  const router = useRouter();
  const [busca, setBusca] = useState(defaultBusca);

  function aplicar() {
    const termo = busca.trim();
    router.push(termo ? `/vendas?busca=${encodeURIComponent(termo)}` : "/vendas");
  }
  function limpar() {
    setBusca("");
    router.push("/vendas");
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1" style={{ minWidth: 200 }}>
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Buscar por nº do pedido ou comanda..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && aplicar()}
        />
      </div>
      <Button variant="vendas" onClick={aplicar}>
        <Search className="h-4 w-4" /> Buscar
      </Button>
      {defaultBusca && (
        <Button variant="outline" onClick={limpar}>
          <X className="h-4 w-4" /> Limpar
        </Button>
      )}
    </div>
  );
}
