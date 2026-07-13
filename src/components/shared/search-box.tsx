"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search, X } from "lucide-react";

/**
 * Campo de busca que filtra NO SERVIDOR (via query string ?q=).
 *
 * Importante: quando a lista e paginada, a busca NAO pode ser feita no
 * navegador. Se fosse, ela so encontraria itens da pagina atual, e o registro
 * da pagina 7 "sumiria" — bug silencioso. Por isso o termo vai para a URL e o
 * servidor refaz a consulta.
 *
 * O debounce (400ms) evita disparar uma consulta a cada tecla digitada.
 */
export function SearchBox({
  placeholder = "Buscar...",
  className = "",
}: {
  placeholder?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const atual = params.get("q") ?? "";

  const [value, setValue] = useState(atual);

  // Mantem o campo em sincronia se a URL mudar por fora (ex: botao voltar).
  useEffect(() => { setValue(atual); }, [atual]);

  useEffect(() => {
    // Nada a fazer se o texto ja e o que esta na URL.
    if (value === atual) return;

    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (value.trim()) next.set("q", value.trim());
      else next.delete("q");
      // Nova busca sempre volta para a primeira pagina.
      next.delete("page");
      router.push(`${pathname}?${next.toString()}`);
    }, 400);

    return () => clearTimeout(timer);
  }, [value, atual, params, pathname, router]);

  return (
    <div className={`relative ${className}`}>
      <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        className="flex h-10 w-full rounded-lg border border-input bg-background pl-9 pr-9 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue("")}
          aria-label="Limpar busca"
          className="absolute right-2 top-2.5 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
