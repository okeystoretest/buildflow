"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Paginacao classica (Pagina 1, 2, 3... com total).
 *
 * O estado vive na URL (?page=3). Isso e proposital: permite recarregar a
 * pagina, compartilhar o link e usar o botao "voltar" do navegador sem perder
 * o lugar. Se ficasse em useState, tudo isso quebraria.
 */
export function Pagination({
  page,
  perPage,
  total,
  label = "registros",
}: {
  page: number;    // pagina atual (1-based)
  perPage: number; // itens por pagina
  total: number;   // total de registros (vem do count no servidor)
  label?: string;  // ex: "clientes", "pedidos"
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const primeiro = total === 0 ? 0 : (page - 1) * perPage + 1;
  const ultimo = Math.min(page * perPage, total);

  function go(p: number) {
    const next = new URLSearchParams(params.toString());
    if (p <= 1) next.delete("page");
    else next.set("page", String(p));
    router.push(`${pathname}?${next.toString()}`);
  }

  // Janela de paginas ao redor da atual (evita imprimir 800 botoes).
  const janela: number[] = [];
  const ini = Math.max(1, Math.min(page - 2, totalPages - 4));
  const fim = Math.min(totalPages, ini + 4);
  for (let i = ini; i <= fim; i++) janela.push(i);

  if (total === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
      <p className="text-xs text-muted-foreground">
        Mostrando <span className="font-data font-medium text-foreground">{primeiro}–{ultimo}</span>
        {" "}de <span className="font-data font-medium text-foreground">{total}</span> {label}
      </p>

      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" onClick={() => go(page - 1)}
          disabled={page <= 1} aria-label="Página anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {ini > 1 && (
          <>
            <Button variant="ghost" size="sm" onClick={() => go(1)} className="font-data">1</Button>
            <span className="px-1 text-muted-foreground">…</span>
          </>
        )}

        {janela.map((p) => (
          <Button key={p} size="sm" className="font-data min-w-9"
            variant={p === page ? "brand" : "ghost"}
            onClick={() => go(p)}>
            {p}
          </Button>
        ))}

        {fim < totalPages && (
          <>
            <span className="px-1 text-muted-foreground">…</span>
            <Button variant="ghost" size="sm" onClick={() => go(totalPages)} className="font-data">{totalPages}</Button>
          </>
        )}

        <Button variant="outline" size="icon" onClick={() => go(page + 1)}
          disabled={page >= totalPages} aria-label="Próxima página">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
