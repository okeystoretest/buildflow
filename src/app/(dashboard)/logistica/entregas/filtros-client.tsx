"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

// Filtros do Histórico de Entregas da Logística:
//  - Busca multi-critério: cliente, comanda ou vendedora.
//  - Intervalo de datas sobre a data de conclusão da entrega.
export function EntregasLogFiltros({
  defaultBusca,
  defaultDe,
  defaultAte,
}: {
  defaultBusca: string;
  defaultDe: string;
  defaultAte: string;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState(defaultBusca);
  const [de, setDe] = useState(defaultDe);
  const [ate, setAte] = useState(defaultAte);

  function aplicar() {
    const params = new URLSearchParams();
    if (busca.trim()) params.set("busca", busca.trim());
    if (de) params.set("de", de);
    if (ate) params.set("ate", ate);
    const qs = params.toString();
    router.push(qs ? `/logistica/entregas?${qs}` : "/logistica/entregas");
  }

  function limpar() {
    setBusca("");
    setDe("");
    setAte("");
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

        <div className="space-y-1.5">
          <Label>De</Label>
          <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Até</Label>
          <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>

        <Button variant="distribuicao" onClick={aplicar}>
          <Search className="h-4 w-4" /> Filtrar
        </Button>
        <Button variant="outline" onClick={limpar}>
          <X className="h-4 w-4" /> Limpar
        </Button>
      </CardContent>
    </Card>
  );
}
