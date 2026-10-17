"use client";

import { useEffect, useRef, useState } from "react";
import { Search, ChevronDown, Check } from "lucide-react";
import { Label } from "@/components/ui/label";
import { useFilterQuery } from "@/hooks/use-filter-query";
import { cn } from "@/lib/utils";

export interface DriverOpt {
  id: string;
  name: string;
}

/**
 * Seletor de motorista do painel.
 *
 * Busca LOCAL: a lista de motoristas ativos é curta (o quadro de chamados já
 * a carrega inteira para atribuir corrida), então filtrar em memória evita
 * uma rota de busca só para isto — diferente do CustomerCombobox, que pagina
 * dezenas de milhares de clientes no servidor.
 *
 * A escolha vai para a URL (?motorista=<id>) via useFilterQuery: a página é um
 * Server Component, e é a renavegação que recalcula TODOS os indicadores no
 * servidor — KPIs, tempo médio, quilometragem e distribuições.
 */
export function DriverFilter({
  drivers,
  selectedId,
}: {
  drivers: DriverOpt[];
  selectedId: string;
}) {
  const f = useFilterQuery({}, { instant: { motorista: selectedId } });
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const selecionado = drivers.find((d) => d.id === f.instant.motorista) ?? null;
  const termo = query.trim().toLowerCase();
  const visiveis = termo
    ? drivers.filter((d) => d.name.toLowerCase().includes(termo))
    : drivers;

  function escolher(id: string) {
    f.setInstant("motorista", id);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="w-full space-y-1.5 sm:w-72" ref={boxRef}>
      <Label htmlFor="filtro-motorista">Motorista</Label>
      <div className="relative">
        {open ? (
          <>
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <input
              id="filtro-motorista"
              type="text"
              autoFocus
              role="combobox"
              aria-expanded="true"
              aria-controls="lista-motoristas"
              value={query}
              placeholder="Busque pelo nome..."
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                // Enter com um único resultado escolhe direto: o caso comum é
                // digitar duas letras e confirmar.
                if (e.key === "Enter" && visiveis.length === 1) escolher(visiveis[0].id);
              }}
              className="flex h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            />
          </>
        ) : (
          <button
            id="filtro-motorista"
            type="button"
            role="combobox"
            aria-expanded="false"
            aria-controls="lista-motoristas"
            onClick={() => setOpen(true)}
            className="flex h-10 w-full items-center justify-between rounded-lg border border-input bg-background px-3 text-sm transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            <span className={cn("truncate", !selecionado && "text-muted-foreground")}>
              {selecionado ? selecionado.name : "Todos os motoristas"}
            </span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        )}

        {open && (
          <div
            id="lista-motoristas"
            role="listbox"
            className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-lg"
          >
            <Opcao
              label="Todos os motoristas"
              ativo={!selecionado}
              onClick={() => escolher("")}
            />
            {visiveis.length === 0 && (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                Nenhum motorista encontrado.
              </p>
            )}
            {visiveis.map((d) => (
              <Opcao
                key={d.id}
                label={d.name}
                ativo={selecionado?.id === d.id}
                onClick={() => escolher(d.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Opcao({
  label,
  ativo,
  onClick,
}: {
  label: string;
  ativo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={ativo}
      onClick={onClick}
      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-secondary"
    >
      <span className="truncate">{label}</span>
      {ativo && <Check className="h-4 w-4 shrink-0 text-motorista-text" aria-hidden />}
    </button>
  );
}
