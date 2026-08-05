"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export interface DriverOption {
  id: string;
  name: string;
}

// Filtros do submódulo "Entregas" do Financeiro:
//  - Busca rápida: nº da comanda ou nome do vendedor(a).
//  - Filtro por Motorista ativo (dropdown).
//  - Intervalo de datas (data da entrega).
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
  const router = useRouter();
  const [busca, setBusca] = useState(defaultBusca);
  const [driver, setDriver] = useState(defaultDriver);
  const [de, setDe] = useState(defaultDe);
  const [ate, setAte] = useState(defaultAte);

  function aplicar() {
    const params = new URLSearchParams();
    if (busca.trim()) params.set("busca", busca.trim());
    if (driver) params.set("driver", driver);
    if (de) params.set("de", de);
    if (ate) params.set("ate", ate);
    const qs = params.toString();
    router.push(qs ? `/financeiro/entregas?${qs}` : "/financeiro/entregas");
  }

  function limpar() {
    setBusca("");
    setDriver("");
    setDe("");
    setAte("");
    router.push("/financeiro/entregas");
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-3 pt-5">
        <div className="flex-1 space-y-1.5" style={{ minWidth: 220 }}>
          <Label>Buscar por comanda ou vendedor(a)</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Nº da comanda ou nome do vendedor(a)"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && aplicar()}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Motorista (ativo)</Label>
          <select
            className="h-10 rounded-lg border border-input bg-background px-2 text-sm"
            value={driver}
            onChange={(e) => setDriver(e.target.value)}
          >
            <option value="">Todos</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label>De</Label>
          <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Até</Label>
          <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>

        <Button variant="financeiro" onClick={aplicar}>
          <Search className="h-4 w-4" /> Filtrar
        </Button>
        <Button variant="outline" onClick={limpar}>
          <X className="h-4 w-4" /> Limpar
        </Button>
      </CardContent>
    </Card>
  );
}
