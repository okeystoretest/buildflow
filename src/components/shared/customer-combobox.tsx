"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X, Check } from "lucide-react";
import { Label } from "@/components/ui/label";

export interface CustomerOpt {
  id: string;
  code: string;
  name: string;
}

/**
 * Combobox de cliente com busca NO SERVIDOR.
 *
 * Por que existe: a base tem dezenas de milhares de clientes. Um <select>
 * comum renderizaria todos como <option>, gerando um HTML enorme e travando
 * o navegador (principalmente no celular da vendedora). Aqui a lista so
 * carrega o que a busca retorna (maximo 20 por vez).
 */
export function CustomerCombobox({
  label,
  value,
  onChange,
  initialSelected,
  placeholder = "Busque por nome ou código...",
}: {
  label: string;
  value: string;                       // id do cliente selecionado ("" = nenhum)
  onChange: (id: string) => void;
  initialSelected?: CustomerOpt | null; // preenche o campo ao editar um pedido
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerOpt[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<CustomerOpt | null>(initialSelected ?? null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Busca no servidor com DEBOUNCE: espera o usuario parar de digitar (300ms)
  // para nao disparar uma requisicao por tecla.
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/customers/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data.customers ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, open]);

  function pick(c: CustomerOpt) {
    setSelected(c);
    onChange(c.id);
    setOpen(false);
    setQuery("");
  }

  function clear() {
    setSelected(null);
    onChange("");
    setQuery("");
  }

  return (
    <div className="space-y-1.5" ref={boxRef}>
      <Label>{label}</Label>

      {selected ? (
        // Estado selecionado: mostra o cliente escolhido com botao de limpar.
        <div className="flex h-10 items-center justify-between rounded-lg border border-input bg-background px-3 text-sm">
          <span className="truncate">
            <span className="font-data text-muted-foreground">{selected.code}</span>
            <span className="mx-1.5 text-muted-foreground">·</span>
            {selected.name}
          </span>
          <button
            type="button"
            onClick={clear}
            aria-label="Limpar cliente"
            className="ml-2 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={query}
            placeholder={placeholder}
            onFocus={() => setOpen(true)}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            className="flex h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          />

          {open && (
            <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
              {loading && (
                <p className="px-3 py-2 text-sm text-muted-foreground">Buscando...</p>
              )}

              {!loading && results.length === 0 && (
                <p className="px-3 py-2 text-sm text-muted-foreground">
                  {query ? "Nenhum cliente encontrado." : "Digite para buscar."}
                </p>
              )}

              {!loading && results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pick(c)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-secondary"
                >
                  {value === c.id && <Check className="h-3.5 w-3.5 shrink-0 text-vendas" />}
                  <span className="font-data shrink-0 text-xs text-muted-foreground">{c.code}</span>
                  <span className="truncate">{c.name}</span>
                </button>
              ))}

              {/* Aviso de teto: a busca devolve no maximo 20 resultados. */}
              {!loading && results.length === 20 && (
                <p className="border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
                  Mostrando os 20 primeiros. Refine a busca.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
