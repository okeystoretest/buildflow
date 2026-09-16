"use client";

import { useRouter } from "next/navigation";
import { Store as StoreIcon } from "lucide-react";

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
 * NAO ha mais opcao "Todas as lojas": a visualizacao e sempre escopada por
 * loja, conforme as regras de permissao.
 */
export function StorePicker({
  stores,
  basePath,
  title = "Fluxo de Pedidos",
}: {
  stores: StoreOption[];
  basePath: string;
  title?: string;
}) {
  const router = useRouter();

  function go(loja: string) {
    router.push(`${basePath}?loja=${encodeURIComponent(loja)}`);
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
    </div>
  );
}
