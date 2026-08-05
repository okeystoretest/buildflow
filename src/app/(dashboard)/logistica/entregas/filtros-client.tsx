"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

// Busca multi-critério do Histórico de Entregas da Logística:
// cliente, comanda ou vendedora. Um único campo pesquisa nos três.
export function EntregasLogFiltros({ defaultBusca }: { defaultBusca: string }) {
  const router = useRouter();
  const [busca, setBusca] = useState(defaultBusca);

  function aplicar() {
    const params = new URLSearchParams();
    if (busca.trim()) params.set("busca", busca.trim());
    const qs = params.toString();
    router.push(qs ? `/logistica/entregas?${qs}` : "/logistica/entregas");
  }

  function limpar() {
    setBusca("");
    router.push("/logistica/entregas");
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-3 pt-5">
        <div className="flex-1 space-y-1.5" style={{ minWidth: 220 }}>
          <Label>Buscar por cliente, comanda ou vendedora</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Nome da cliente, nº da comanda ou vendedora"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && aplicar()}
            />
          </div>
        </div>
        <Button variant="distribuicao" onClick={aplicar}>
          <Search className="h-4 w-4" /> Filtrar
        </Button>
        {defaultBusca && (
          <Button variant="outline" onClick={limpar}>
            <X className="h-4 w-4" /> Limpar
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
