"use client";

import { useRouter } from "next/navigation";
import { Store as StoreIcon, LayoutGrid } from "lucide-react";

export interface StoreOption {
  id: string;
  name: string;
  simplifiedFlow: boolean;
}

/**
 * Pop-up de selecao de loja para o Fluxo de Pedidos (doc 4.2).
 * Pergunta de qual Loja de Origem o usuario quer ver o fluxo. Ao escolher,
 * navega para a mesma rota com ?loja=<id>, que faz a page filtrar os pedidos
 * e adaptar as colunas conforme o tipo de fluxo da loja.
 *
 * A opcao "Todas as lojas" mostra o board geral (comportamento historico).
 */
export function StorePicker({
  stores,
  basePath,
  title = "Fluxo de Pedidos",
  allowAll = true,
}: {
  stores: StoreOption[];
  basePath: string;
  title?: string;
  allowAll?: boolean;
}) {
  const router = useRouter();

  function go(loja: string | null) {
    const url = loja ? `${basePath}?loja=${encodeURIComponent(loja)}` : basePath + "?loja=all";
    router.push(url);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          De qual loja você deseja visualizar o fluxo de pedidos?
        </p>
      </div>

      {stores.length === 0 ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-center text-sm text-destructive">
          Nenhuma loja atrelada ao seu usuário. Fale com a Gestão.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {stores.map((s) => (
            <button
              key={s.id}
              onClick={() => go(s.id)}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-primary/5"
            >
              <StoreIcon className="h-5 w-5 shrink-0 text-primary" />
              <span>
                <span className="block font-medium">{s.name}</span>
                <span className="text-xs text-muted-foreground">
                  {s.simplifiedFlow ? "Fluxo simplificado" : "Fluxo padrão"}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {allowAll && (
        <div className="pt-2 text-center">
          <button
            onClick={() => go(null)}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm hover:bg-secondary"
          >
            <LayoutGrid className="h-4 w-4" /> Ver todas as lojas
          </button>
        </div>
      )}
    </div>
  );
}
